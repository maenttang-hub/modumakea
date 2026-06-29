function readBooleanEnv(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isLoopbackHost(host) {
  const normalized = typeof host === 'string' ? host.trim().toLowerCase() : '';
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function buildRuntimePolicy(env = process.env) {
  return {
    host: env.MODUMAKE_SANDBOX_LAUNCHER_HOST || '127.0.0.1',
    port: Number(env.MODUMAKE_SANDBOX_LAUNCHER_PORT || 4200),
    maxBodyBytes: Number(env.MODUMAKE_SANDBOX_LAUNCHER_BODY_LIMIT || 1024 * 1024),
    sharedToken: env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN?.trim() || '',
    allowNonLoopbackHost: readBooleanEnv(env.MODUMAKE_SANDBOX_LAUNCHER_ALLOW_NON_LOOPBACK),
    allowOpenHealth: readBooleanEnv(env.MODUMAKE_SANDBOX_LAUNCHER_ALLOW_OPEN_HEALTH),
  };
}

export function validateRuntimePolicy(policy) {
  if (!policy.sharedToken) {
    throw new Error('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN is required for internal-only launcher deploys.');
  }

  if (!isLoopbackHost(policy.host) && !policy.allowNonLoopbackHost) {
    throw new Error(
      `Refusing to bind sandbox launcher to non-loopback host "${policy.host}" without MODUMAKE_SANDBOX_LAUNCHER_ALLOW_NON_LOOPBACK=true.`
    );
  }
}

export function assertAuthorizedRequest(req, sharedToken) {
  const token = req.headers['x-modumake-compile-token'];
  const normalized = Array.isArray(token) ? token[0] : token;
  if (typeof normalized !== 'string' || normalized.trim() !== sharedToken) {
    throw new Error('샌드박스 런처 인증에 실패했습니다.');
  }
}
