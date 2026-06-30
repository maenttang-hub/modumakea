function readBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
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

export function getUnsandboxedCloudCompileDisabledReason() {
  return '클라우드 컴파일 샌드박스가 준비되기 전까지 실제 서버 컴파일은 비활성화되어 있습니다.';
}

export function getCompileBackendSharedToken() {
  const token = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN?.trim() ?? '';
  if (token) {
    assertValidProductionSecret('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', token);
  }
  return token;
}
