type EnvMap = Record<string, string | undefined>;

export type ProductEnvironmentIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
};

function readBooleanEnv(env: EnvMap, name: string, fallback = false) {
  const value = env[name]?.trim().toLowerCase();
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

function isPlaceholderSecret(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(
    normalized &&
    (
      normalized.startsWith('change_me') ||
      normalized.includes('your_') ||
      normalized.includes('placeholder')
    )
  );
}

export function isStrictProductEnvironment(env: EnvMap = process.env) {
  const mode = env.MODUMAKE_PRODUCT_ENV?.trim().toLowerCase();
  return (
    mode === 'production' ||
    mode === 'public' ||
    readBooleanEnv(env, 'MODUMAKE_REQUIRE_PRODUCT_GUARDS')
  );
}

export function validateProductEnvironment(env: EnvMap = process.env): ProductEnvironmentIssue[] {
  const issues: ProductEnvironmentIssue[] = [];
  const strict = isStrictProductEnvironment(env);
  const surface = env.NEXT_PUBLIC_MODUMAKE_SURFACE?.trim() || 'review-mvp';

  if (strict && surface !== 'review-mvp') {
    issues.push({
      severity: 'error',
      code: 'surface-not-review-mvp',
      message: 'Production product surface must stay review-mvp.',
    });
  }

  const forbiddenEnabledFlags = [
    'NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE',
    'NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE',
    'NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL',
    'MODUMAKE_ENABLE_LAUNCH_DESK',
    'MODUMAKE_ENABLE_UNSANDBOXED_COMPILE',
    'MODUMAKE_COMPILE_PUBLIC_ENABLED',
  ];

  for (const name of forbiddenEnabledFlags) {
    if (strict && readBooleanEnv(env, name)) {
      issues.push({
        severity: 'error',
        code: `forbidden-enabled-${name.toLowerCase()}`,
        message: `${name} must be false for production product deployment.`,
      });
    }
  }

  if (strict && env.MODUMAKE_COMPILE_REQUIRE_AUTH?.trim().toLowerCase() === 'false') {
    issues.push({
      severity: 'error',
      code: 'compile-auth-disabled',
      message: 'MODUMAKE_COMPILE_REQUIRE_AUTH must not be false in production.',
    });
  }

  if (strict && !env.NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL?.trim() && !env.NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL?.trim()) {
    issues.push({
      severity: 'error',
      code: 'feedback-channel-missing',
      message: 'Production deployment needs NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL or NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL.',
    });
  }

  const placeholderSecretNames = [
    'MODUMAKE_ARTIFACT_DOWNLOAD_SECRET',
    'MODUMAKE_COMPILE_SERVER_SHARED_TOKEN',
    'OPENAI_API_KEY',
  ];

  for (const name of placeholderSecretNames) {
    if (strict && isPlaceholderSecret(env[name])) {
      issues.push({
        severity: 'error',
        code: `placeholder-secret-${name.toLowerCase()}`,
        message: `${name} is still a placeholder.`,
      });
    }
  }

  if (!strict) {
    issues.push({
      severity: 'warning',
      code: 'product-guards-not-strict',
      message: 'Set MODUMAKE_PRODUCT_ENV=production before a public product deployment.',
    });
  }

  return issues;
}

let runtimeGuardChecked = false;

export function assertProductRuntimeEnvironment(env: EnvMap = process.env) {
  if (runtimeGuardChecked) {
    return;
  }

  const errors = validateProductEnvironment(env).filter(issue => issue.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `ModuMake product environment is not safe to serve: ${errors.map(issue => issue.code).join(', ')}`
    );
  }

  runtimeGuardChecked = true;
}
