import { randomUUID } from 'node:crypto';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

export interface ApiRequestContext {
  route: string;
  requestId: string;
  startedAt: number;
}

export function createApiRequestContext(request: Request, route: string): ApiRequestContext {
  const incoming = request.headers.get('x-request-id')?.trim();
  return {
    route,
    requestId: incoming || randomUUID(),
    startedAt: Date.now(),
  };
}

export function buildApiResponseHeaders(
  context: ApiRequestContext,
  extra?: Record<string, string>
) {
  return {
    'x-request-id': context.requestId,
    ...(extra ?? {}),
  };
}

export function auditApiRequest(
  context: ApiRequestContext,
  stage: 'start' | 'success' | 'error',
  detail?: Record<string, unknown>
) {
  const payload = {
    route: context.route,
    requestId: context.requestId,
    stage,
    elapsedMs: Date.now() - context.startedAt,
    ...(detail ?? {}),
  };
  const method = stage === 'error' ? console.error : console.info;
  method('[API Audit]', payload);
}

export { fetchWithRetry };
