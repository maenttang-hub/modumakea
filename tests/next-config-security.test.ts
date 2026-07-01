import test from 'node:test';
import assert from 'node:assert/strict';

import nextConfig from '../next.config.ts';

test('next config applies product security headers to all routes', async () => {
  const previousWebSerial = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL;
  delete process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL;

  assert.equal(typeof nextConfig.headers, 'function');
  const buildHeaders = nextConfig.headers;
  assert.ok(buildHeaders);
  try {
    const headersConfig = await buildHeaders();
    const allRoutes = headersConfig.find(entry => entry.source === '/:path*');

    assert.ok(allRoutes);
    const headers = Object.fromEntries(allRoutes.headers.map(header => [header.key, header.value]));

    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['Permissions-Policy'], /camera=\(\)/);
    assert.match(headers['Permissions-Policy'], /usb=\(\)/);
    assert.match(headers['Permissions-Policy'], /serial=\(\)/);
    assert.match(headers['Content-Security-Policy-Report-Only'], /object-src 'none'/);
  } finally {
    if (previousWebSerial === undefined) {
      delete process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL;
    } else {
      process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL = previousWebSerial;
    }
  }
});

test('next config only opens serial permissions when explicitly enabled', async () => {
  const previousWebSerial = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL;
  process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL = 'true';

  try {
    assert.equal(typeof nextConfig.headers, 'function');
    const buildHeaders = nextConfig.headers;
    assert.ok(buildHeaders);
    const headersConfig = await buildHeaders();
    const allRoutes = headersConfig.find(entry => entry.source === '/:path*');

    assert.ok(allRoutes);
    const headers = Object.fromEntries(allRoutes.headers.map(header => [header.key, header.value]));
    assert.match(headers['Permissions-Policy'], /usb=\(self\)/);
    assert.match(headers['Permissions-Policy'], /serial=\(self\)/);
  } finally {
    if (previousWebSerial === undefined) {
      delete process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL;
    } else {
      process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL = previousWebSerial;
    }
  }
});
