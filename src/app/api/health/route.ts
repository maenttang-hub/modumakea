import { isBetaEventCollectionEnabled, isLaunchDeskEnabled } from '@/lib/beta-feature-gates';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { PRODUCT_NAME, PRODUCT_RELEASE_VERSION } from '@/lib/product-config';
import { validateProductEnvironment } from '@/lib/product-environment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const context = createApiRequestContext(request, '/api/health');
  const issues = validateProductEnvironment(process.env);
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const headers = buildApiResponseHeaders(context, {
    'Cache-Control': 'no-store',
  });

  auditApiRequest(context, errorCount > 0 ? 'error' : 'success', {
    status: errorCount > 0 ? 503 : 200,
    product: PRODUCT_NAME,
    version: PRODUCT_RELEASE_VERSION,
  });

  return Response.json(
    {
      status: errorCount > 0 ? 'degraded' : 'ok',
      product: PRODUCT_NAME,
      version: PRODUCT_RELEASE_VERSION,
      surface: process.env.NEXT_PUBLIC_MODUMAKE_SURFACE?.trim() || 'review-mvp',
      launchDeskEnabled: isLaunchDeskEnabled(),
      betaEventsEnabled: isBetaEventCollectionEnabled(),
      strictProductGuards:
        process.env.MODUMAKE_PRODUCT_ENV?.trim().toLowerCase() === 'production' ||
        process.env.MODUMAKE_REQUIRE_PRODUCT_GUARDS?.trim().toLowerCase() === 'true',
      issueCount: issues.length,
      errorCount,
      warningCount: issues.length - errorCount,
    },
    { status: errorCount > 0 ? 503 : 200, headers }
  );
}

