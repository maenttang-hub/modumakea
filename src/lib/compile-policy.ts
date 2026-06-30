function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }

  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }

  return fallback;
}

export function isPlaceholderSecretValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('change_me') ||
    normalized.includes('changeme') ||
    normalized.includes('placeholder') ||
    /^your[_-].*[_-]here$/.test(normalized) ||
    normalized === 'secret' ||
    normalized === 'password'
  );
}

export function assertValidProductionSecret(name: string, value: string) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (isPlaceholderSecretValue(value)) {
    throw new Error(`${name} must be changed before production use.`);
  }
}

export function isUnsandboxedCloudCompileEnabled() {
  return readBooleanEnv('MODUMAKE_ENABLE_UNSANDBOXED_COMPILE');
}

export function isPublicCloudCompileEnabled() {
  return readBooleanEnv('MODUMAKE_COMPILE_PUBLIC_ENABLED');
}

export function isCompileAuthRequired() {
  return readBooleanEnv('MODUMAKE_COMPILE_REQUIRE_AUTH', true);
}

export function getUnsandboxedCloudCompileDisabledReason() {
  return '클라우드 컴파일 샌드박스가 준비되기 전까지 실제 서버 컴파일은 비활성화되어 있습니다.';
}

export function getPublicCloudCompileDisabledReason() {
  return '현재 MVP에서는 public cloud compile이 비활성화되어 있습니다. 회로 리뷰와 리포트 기능을 기본 제품 표면으로 사용하세요.';
}

export function getCompileBackendSharedToken() {
  const token = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN?.trim() ?? '';
  if (token) {
    assertValidProductionSecret('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', token);
  }
  return token;
}
