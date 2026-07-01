import {
  sanitizeBetaTelemetryEvent,
  type BetaTelemetryEvent,
} from '@/lib/beta-telemetry-schema';

function readBooleanValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isTelemetryEnabled() {
  const value = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_BETA_TELEMETRY;
  return readBooleanValue(value);
}

function isTelemetryDebugEnabled() {
  const value = process.env.NEXT_PUBLIC_MODUMAKE_BETA_TELEMETRY_DEBUG;
  return readBooleanValue(value);
}

export function recordBetaEvent(event: BetaTelemetryEvent) {
  if (typeof window === 'undefined') {
    return;
  }

  const sanitized = sanitizeBetaTelemetryEvent({
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  });

  if (!sanitized) {
    return;
  }

  if (!isTelemetryEnabled()) {
    if (isTelemetryDebugEnabled()) {
      console.info('[ModuMake beta telemetry debug]', sanitized);
    }
    return;
  }

  const body = JSON.stringify(sanitized);

  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        '/api/beta/events',
        new Blob([body], { type: 'application/json' })
      );
      if (queued) {
        return;
      }
    }

    void fetch('/api/beta/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Telemetry must never interrupt the user flow.
    });
  } catch {
    // Telemetry must never interrupt the user flow.
  }
}
