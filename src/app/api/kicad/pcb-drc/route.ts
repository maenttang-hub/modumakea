import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { sanitizePlainText } from '@/lib/security-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const MAX_PCB_SOURCE_BYTES = 8_000_000;
const DEFAULT_MAC_KICAD_CLI = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli';

type PcbDrcRequest = {
  source?: unknown;
  filename?: unknown;
};

type KiCadDrcMode = 'schematic-parity' | 'board-only';

function normalizeFilename(value: unknown) {
  const raw = typeof value === 'string' ? value : 'imported.kicad_pcb';
  const sanitized = sanitizePlainText(raw, { maxLength: 160, fallback: 'imported.kicad_pcb' })
    .replace(/[^\w .-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized.toLowerCase().endsWith('.kicad_pcb')
    ? sanitized
    : `${sanitized || 'imported'}.kicad_pcb`;
}

function normalizeSource(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  if (!value.trim().startsWith('(kicad_pcb')) {
    return null;
  }
  if (new TextEncoder().encode(value).length > MAX_PCB_SOURCE_BYTES) {
    return null;
  }
  return value;
}

async function runKiCadCli(args: string[], cwd: string) {
  const candidates = [
    process.env.KICAD_CLI_PATH,
    DEFAULT_MAC_KICAD_CLI,
    'kicad-cli',
  ].filter((candidate): candidate is string => Boolean(candidate));
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await execFileAsync(candidate, args, {
        cwd,
        timeout: 60_000,
        maxBuffer: 4_000_000,
      });
    } catch (error) {
      lastError = error;
      const code = typeof error === 'object' && error && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('KiCad CLI를 찾을 수 없습니다. KICAD_CLI_PATH를 설정하거나 KiCad를 설치해 주세요.');
}

function getExecErrorText(error: unknown) {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : String(error);
  }

  const candidate = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
  return [
    typeof candidate.message === 'string' ? candidate.message : null,
    typeof candidate.stdout === 'string' ? candidate.stdout : null,
    typeof candidate.stderr === 'string' ? candidate.stderr : null,
  ].filter(Boolean).join('\n');
}

function isSchematicParityFailure(error: unknown) {
  const text = getExecErrorText(error);
  return /schematic parity|schematic netlist|회로도 네트리스트|회로도 동일성|패리티 테스트/i.test(text);
}

function buildDrcArgs({
  pcbPath,
  reportPath,
  schematicParity,
}: {
  pcbPath: string;
  reportPath: string;
  schematicParity: boolean;
}) {
  return [
    'pcb',
    'drc',
    '--format',
    'json',
    '--severity-all',
    ...(schematicParity ? ['--schematic-parity'] : []),
    '--refill-zones',
    '--output',
    reportPath,
    pcbPath,
  ];
}

async function readDrcReport(reportPath: string) {
  const reportText = await readFile(reportPath, 'utf8');
  return JSON.parse(reportText) as unknown;
}

async function runKiCadDrcWithFallback(
  pcbPath: string,
  tempDir: string
): Promise<{ report: unknown; drcMode: KiCadDrcMode; warnings: string[] }> {
  const reportPath = join(/* turbopackIgnore: true */ tempDir, 'drc-report.json');

  try {
    await runKiCadCli(
      buildDrcArgs({ pcbPath, reportPath, schematicParity: true }),
      tempDir
    );
    return {
      report: await readDrcReport(reportPath),
      drcMode: 'schematic-parity',
      warnings: [],
    };
  } catch (error) {
    if (!isSchematicParityFailure(error)) {
      throw error;
    }

    const boardOnlyReportPath = join(/* turbopackIgnore: true */ tempDir, 'drc-report-board-only.json');
    await runKiCadCli(
      buildDrcArgs({ pcbPath, reportPath: boardOnlyReportPath, schematicParity: false }),
      tempDir
    );
    return {
      report: await readDrcReport(boardOnlyReportPath),
      drcMode: 'board-only',
      warnings: [
        '회로도 netlist가 없어 schematic parity 검사는 생략하고 board-only DRC로 재시도했습니다.',
      ],
    };
  }
}

export async function POST(req: Request) {
  let tempDir: string | null = null;

  try {
    const body = await req.json() as PcbDrcRequest;
    const source = normalizeSource(body.source);
    if (!source) {
      return NextResponse.json(
        { error: '유효한 .kicad_pcb 원본이 필요합니다.' },
        { status: 400 }
      );
    }

    tempDir = await mkdtemp(join(tmpdir(), 'modumake-kicad-drc-'));
    const filename = normalizeFilename(body.filename);
    const pcbPath = join(/* turbopackIgnore: true */ tempDir, filename);
    await writeFile(pcbPath, source, 'utf8');

    const result = await runKiCadDrcWithFallback(pcbPath, tempDir);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'KiCad DRC 실행 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
