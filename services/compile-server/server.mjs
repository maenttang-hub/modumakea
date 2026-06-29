import http from 'node:http';
import { compileJob, inspectCompilerRuntime, validateCompileJobRequest } from './lib/compiler.mjs';
import { listSupportedBoards } from './lib/fqbn-map.mjs';
import {
  assertAuthorizedRequest,
  buildRuntimePolicy,
  validateRuntimePolicy,
} from './lib/runtime-policy.mjs';

const POLICY = buildRuntimePolicy(process.env);
const PORT = POLICY.port;
const HOST = POLICY.host;
const MAX_BODY_BYTES = POLICY.maxBodyBytes;
const SHARED_TOKEN = POLICY.sharedToken;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, x-modumake-compile-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function classifyRequestError(error) {
  const message = error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
  if (message.includes('요청 본문이 너무 큽니다')) {
    return 413;
  }
  if (message.includes('인증')) {
    return 401;
  }
  return 400;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON 파싱에 실패했습니다.'));
      }
    });

    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, {
      success: false,
      status: 'BAD_REQUEST',
      buildLogs: '',
      errorDetails: '잘못된 요청입니다.',
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    if (!POLICY.allowOpenHealth) {
      try {
        assertAuthorizedRequest(req, SHARED_TOKEN);
      } catch (error) {
        sendJson(res, classifyRequestError(error), {
          ok: false,
          errorDetails: error instanceof Error ? error.message : '요청 처리에 실패했습니다.',
        });
        return;
      }
    }

    const runtime = await inspectCompilerRuntime();
    sendJson(res, runtime.ok ? 200 : 503, {
      ok: runtime.ok,
      service: 'modumake-compile-server',
      host: HOST,
      port: PORT,
      supportedBoards: listSupportedBoards(),
      compiler: runtime,
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/compile/job') {
    try {
      assertAuthorizedRequest(req, SHARED_TOKEN);
      const payload = await readJsonBody(req);
      validateCompileJobRequest(payload);
      const result = await compileJob(payload);
      sendJson(res, result.success ? 200 : 422, result);
      return;
    } catch (error) {
      sendJson(res, classifyRequestError(error), {
        success: false,
        status: 'BAD_REQUEST',
        buildLogs: '',
        errorDetails: error instanceof Error ? error.message : '요청 처리에 실패했습니다.',
      });
      return;
    }
  }

  sendJson(res, 404, {
    success: false,
    status: 'BAD_REQUEST',
    buildLogs: '',
    errorDetails: '존재하지 않는 경로입니다.',
  });
});

validateRuntimePolicy(POLICY);

server.listen(PORT, HOST, () => {
  console.log(`[compile-server] listening on http://${HOST}:${PORT}`);
});

server.on('error', error => {
  console.error('[compile-server] failed to start', error);
  process.exitCode = 1;
});
