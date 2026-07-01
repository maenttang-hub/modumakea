export const BETA_TELEMETRY_EVENT_NAMES = [
  'import_attempt',
  'import_succeeded',
  'import_failed',
  'report_exported',
  'issue_feedback_updated',
] as const;

export type BetaTelemetryEventName = (typeof BETA_TELEMETRY_EVENT_NAMES)[number];
export type BetaTelemetryAttributeValue = string | number | boolean | null;

export interface BetaTelemetryEvent {
  name: BetaTelemetryEventName;
  source: string;
  route?: string;
  outcome?: string;
  attributes?: Record<string, BetaTelemetryAttributeValue | undefined>;
  occurredAt?: string;
}

const EVENT_NAME_SET = new Set<string>(BETA_TELEMETRY_EVENT_NAMES);
const MAX_ATTRIBUTES = 24;
const MAX_FIELD_LENGTH = 96;
const MAX_ATTRIBUTE_STRING_LENGTH = 120;

function cleanShortText(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function isBlockedAttributeKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('filename') ||
    normalized.includes('filepath') ||
    normalized === 'path' ||
    normalized.includes('sourcetext') ||
    normalized.includes('rawsource') ||
    normalized.includes('contents') ||
    normalized.includes('errormessage')
  );
}

function sanitizeAttributes(value: unknown): Record<string, BetaTelemetryAttributeValue> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, BetaTelemetryAttributeValue> = {};

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ATTRIBUTES)) {
    const key = cleanShortText(rawKey, 48);
    if (!key || isBlockedAttributeKey(key)) {
      continue;
    }

    if (typeof rawValue === 'string') {
      const text = cleanShortText(rawValue, MAX_ATTRIBUTE_STRING_LENGTH);
      if (text != null) {
        result[key] = text;
      }
      continue;
    }

    if (typeof rawValue === 'number') {
      if (Number.isFinite(rawValue)) {
        result[key] = rawValue;
      }
      continue;
    }

    if (typeof rawValue === 'boolean' || rawValue === null) {
      result[key] = rawValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeBetaTelemetryEvent(value: unknown): BetaTelemetryEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const name = cleanShortText(candidate.name, 48);
  const source = cleanShortText(candidate.source, 64);

  if (!name || !EVENT_NAME_SET.has(name) || !source) {
    return null;
  }

  const route = cleanShortText(candidate.route, 80);
  const outcome = cleanShortText(candidate.outcome, 64);
  const occurredAt = cleanShortText(candidate.occurredAt, 40);

  return {
    name: name as BetaTelemetryEventName,
    source,
    ...(route ? { route } : {}),
    ...(outcome ? { outcome } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    ...(sanitizeAttributes(candidate.attributes) ? { attributes: sanitizeAttributes(candidate.attributes) } : {}),
  };
}
