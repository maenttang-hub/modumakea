import { isBetaEventCollectionEnabled } from '@/lib/beta-feature-gates';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { sanitizeBetaTelemetryEvent } from '@/lib/beta-telemetry-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const context = createApiRequestContext(request, '/api/beta/events');
  const headers = buildApiResponseHeaders(context);

  if (!isBetaEventCollectionEnabled()) {
    return Response.json(
      { error: 'Beta event collection is not enabled.' },
      { status: 404, headers }
    );
  }

  auditApiRequest(context, 'start');

  const json = await request.json().catch(() => null);
  const event = sanitizeBetaTelemetryEvent(json);

  if (!event) {
    auditApiRequest(context, 'error', { reason: 'invalid-beta-event' });
    return Response.json(
      { error: 'Invalid beta event payload.' },
      { status: 400, headers }
    );
  }

  const logPayload = {
    requestId: context.requestId,
    eventName: event.name,
    source: event.source,
    route: event.route,
    outcome: event.outcome,
    occurredAt: event.occurredAt,
    attributes: event.attributes,
  };

  console.info('[Beta Event]', logPayload);
  auditApiRequest(context, 'success', {
    eventName: event.name,
    source: event.source,
    outcome: event.outcome,
  });

  return new Response(null, { status: 204, headers });
}
