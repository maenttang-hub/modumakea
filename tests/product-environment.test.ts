import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isStrictProductEnvironment,
  validateProductEnvironment,
} from '@/lib/product-environment';

test('product environment guard is warning-only outside strict product mode', () => {
  const issues = validateProductEnvironment({
    NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE: 'true',
  });

  assert.equal(isStrictProductEnvironment({}), false);
  assert.equal(issues.some(issue => issue.severity === 'error'), false);
  assert.ok(issues.some(issue => issue.code === 'product-guards-not-strict'));
});

test('product environment guard blocks unsafe production flags', () => {
  const issues = validateProductEnvironment({
    MODUMAKE_PRODUCT_ENV: 'production',
    NEXT_PUBLIC_MODUMAKE_SURFACE: 'full',
    NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE: 'true',
    NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE: 'true',
    NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL: 'true',
    MODUMAKE_ENABLE_LAUNCH_DESK: 'true',
    MODUMAKE_ENABLE_UNSANDBOXED_COMPILE: 'true',
    MODUMAKE_COMPILE_PUBLIC_ENABLED: 'true',
    MODUMAKE_COMPILE_REQUIRE_AUTH: 'false',
    NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL: 'support@example.com',
  });

  const errorCodes = issues.filter(issue => issue.severity === 'error').map(issue => issue.code);
  assert.ok(errorCodes.includes('surface-not-review-mvp'));
  assert.ok(errorCodes.includes('compile-auth-disabled'));
  assert.ok(errorCodes.some(code => code.includes('next_public_modumake_enable_full_surface')));
  assert.ok(errorCodes.some(code => code.includes('next_public_modumake_enable_web_serial')));
  assert.ok(errorCodes.some(code => code.includes('modumake_compile_public_enabled')));
});

test('product environment guard requires a feedback channel in strict mode', () => {
  const missingFeedback = validateProductEnvironment({
    MODUMAKE_PRODUCT_ENV: 'production',
    NEXT_PUBLIC_MODUMAKE_SURFACE: 'review-mvp',
  });
  assert.ok(missingFeedback.some(issue => issue.code === 'feedback-channel-missing'));

  const safe = validateProductEnvironment({
    MODUMAKE_PRODUCT_ENV: 'production',
    NEXT_PUBLIC_MODUMAKE_SURFACE: 'review-mvp',
    NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL: 'https://example.com/feedback',
    MODUMAKE_COMPILE_REQUIRE_AUTH: 'true',
    MODUMAKE_ENABLE_LAUNCH_DESK: 'false',
    MODUMAKE_ENABLE_UNSANDBOXED_COMPILE: 'false',
    MODUMAKE_COMPILE_PUBLIC_ENABLED: 'false',
  });
  assert.equal(safe.some(issue => issue.severity === 'error'), false);
});

test('product environment guard rejects placeholder secrets only in strict mode', () => {
  const issues = validateProductEnvironment({
    MODUMAKE_PRODUCT_ENV: 'production',
    NEXT_PUBLIC_MODUMAKE_SURFACE: 'review-mvp',
    NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL: 'support@example.com',
    OPENAI_API_KEY: 'your_openai_api_key_here',
  });

  assert.ok(issues.some(issue => issue.code === 'placeholder-secret-openai_api_key'));
});
