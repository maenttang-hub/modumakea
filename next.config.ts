import type { NextConfig } from "next";

function buildPermissionsPolicy() {
  const webSerialEnabled = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL === 'true';
  const devicePolicy = webSerialEnabled ? '(self)' : '()';

  return [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    `usb=${devicePolicy}`,
    `serial=${devicePolicy}`,
  ].join(', ');
}

const nextConfig: NextConfig = {
  devIndicators: false,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: buildPermissionsPolicy(),
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "img-src 'self' blob: data:",
              "font-src 'self' data:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https: wss:",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
