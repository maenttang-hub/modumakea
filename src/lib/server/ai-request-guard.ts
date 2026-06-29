import { createHash } from 'node:crypto';

type BucketState = {
  minuteWindowStart: number;
  minuteCount: number;
  dayWindowStart: number;
  dayCount: number;
};

type DuplicateState = {
  fingerprint: string;
  timestamp: number;
};

export type AiGuardResult =
  | { ok: true; clientId: string }
  | {
      ok: false;
      status: 409 | 429;
      clientId: string;
      error: string;
      details: string;
      retryAfterSec?: number;
    };

const MINUTE_LIMIT = 3;
const DAY_LIMIT = 30;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_TTL_MS = 8_000;
const MAX_TRACKED_CLIENTS = 500;

const bucketStore = new Map<string, BucketState>();
const duplicateStore = new Map<string, DuplicateState>();

function trimStores(now: number) {
  if (bucketStore.size > MAX_TRACKED_CLIENTS) {
    for (const [key, value] of bucketStore) {
      if (now - value.dayWindowStart > DAY_MS) {
        bucketStore.delete(key);
      }
      if (bucketStore.size <= MAX_TRACKED_CLIENTS) {
        break;
      }
    }
  }

  if (duplicateStore.size > MAX_TRACKED_CLIENTS) {
    for (const [key, value] of duplicateStore) {
      if (now - value.timestamp > DUPLICATE_TTL_MS) {
        duplicateStore.delete(key);
      }
      if (duplicateStore.size <= MAX_TRACKED_CLIENTS) {
        break;
      }
    }
  }
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function hashPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function guardAiRequest(request: Request, scope: string, payload: unknown): AiGuardResult {
  const now = Date.now();
  trimStores(now);

  const clientId = `${scope}:${getClientIp(request)}`;
  const payloadFingerprint = hashPayload(payload);
  const duplicateKey = `${clientId}:${payloadFingerprint}`;
  const duplicate = duplicateStore.get(duplicateKey);

  if (duplicate && now - duplicate.timestamp < DUPLICATE_TTL_MS) {
    return {
      ok: false,
      status: 409,
      clientId,
      error: '동일한 요청이 이미 처리 중입니다.',
      details: '같은 내용의 AI 요청이 너무 짧은 시간 안에 반복되었습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  duplicateStore.set(duplicateKey, {
    fingerprint: payloadFingerprint,
    timestamp: now,
  });

  const current = bucketStore.get(clientId);
  const next: BucketState = current
    ? { ...current }
    : {
        minuteWindowStart: now,
        minuteCount: 0,
        dayWindowStart: now,
        dayCount: 0,
      };

  if (now - next.minuteWindowStart >= MINUTE_MS) {
    next.minuteWindowStart = now;
    next.minuteCount = 0;
  }

  if (now - next.dayWindowStart >= DAY_MS) {
    next.dayWindowStart = now;
    next.dayCount = 0;
  }

  if (next.minuteCount >= MINUTE_LIMIT) {
    return {
      ok: false,
      status: 429,
      clientId,
      error: '분당 요청 한도를 넘었습니다.',
      details: `AI 요청은 1분에 최대 ${MINUTE_LIMIT}회까지 허용됩니다.`,
      retryAfterSec: Math.max(1, Math.ceil((MINUTE_MS - (now - next.minuteWindowStart)) / 1000)),
    };
  }

  if (next.dayCount >= DAY_LIMIT) {
    return {
      ok: false,
      status: 429,
      clientId,
      error: '일일 요청 한도를 넘었습니다.',
      details: `AI 요청은 하루에 최대 ${DAY_LIMIT}회까지 허용됩니다.`,
      retryAfterSec: Math.max(60, Math.ceil((DAY_MS - (now - next.dayWindowStart)) / 1000)),
    };
  }

  next.minuteCount += 1;
  next.dayCount += 1;
  bucketStore.set(clientId, next);

  return { ok: true, clientId };
}
