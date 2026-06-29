function readBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function isUnsandboxedCloudCompileEnabled() {
  return readBooleanEnv('MODUMAKE_ENABLE_UNSANDBOXED_COMPILE');
}

export function getUnsandboxedCloudCompileDisabledReason() {
  return '클라우드 컴파일 샌드박스가 준비되기 전까지 실제 서버 컴파일은 비활성화되어 있습니다.';
}

export function getCompileBackendSharedToken() {
  return process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN?.trim() ?? '';
}
