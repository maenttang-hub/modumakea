import { createHash } from 'node:crypto';
import {
  getPublicCloudCompileDisabledReason,
  isCompileAuthRequired,
  isPublicCloudCompileEnabled,
} from '@/lib/compile-policy';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_USAGE_WINDOWS = 5_000;

interface UsageWindow {
  count: number;
  resetAt: number;
}

interface CompileRequester {
  ipKey: string;
  userKey: string | null;
  ownerKey: string;
}

interface UsageAllowedDecision {
  allowed: true;
  requester: CompileRequester;
}

interface UsageDeniedDecision {
  allowed: false;
  httpStatus: 401 | 429 | 503;
  errorCode:
    | 'COMPILE_PUBLIC_DISABLED'
    | 'COMPILE_AUTH_REQUIRED'
    | 'COMPILE_RATE_LIMITED'
    | 'COMPILE_QUOTA_EXCEEDED';
  message: string;
  headers?: Record<string, string>;
}

export type CompileUsagePolicyDecision = UsageAllowedDecision | UsageDeniedDecision;

const usageWindows = new Map<string, UsageWindow>();

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeKey(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:@-]/g, '_')
    .slice(0, 96);

  return cleaned || fallback;
}

function getClientIpKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip =
    forwardedFor ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'local';

  return sanitizeKey(ip, 'local');
}

function digestKey(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 24);
}

function getUserKey(request: Request) {
  const explicitUser =
    request.headers.get('x-modumake-user-id')?.trim() ||
    request.headers.get('x-user-id')?.trim();

  if (explicitUser) {
    return `user:${digestKey(explicitUser)}`;
  }

  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice(7).trim();
  if (token.length < 12) {
    return null;
  }

  return `bearer:${digestKey(token)}`;
}

function incrementWindow(key: string, limit: number, windowMs: number, now: number) {
  pruneUsageWindows(now);

  const current = usageWindows.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    usageWindows.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, resetAt: current.resetAt };
}

function pruneUsageWindows(now: number) {
  if (usageWindows.size < MAX_USAGE_WINDOWS) {
    return;
  }

  for (const [key, window] of usageWindows.entries()) {
    if (window.resetAt <= now) {
      usageWindows.delete(key);
    }
  }

  let overflow = usageWindows.size - MAX_USAGE_WINDOWS;
  for (const key of usageWindows.keys()) {
    if (overflow <= 0) {
      break;
    }
    usageWindows.delete(key);
    overflow -= 1;
  }
}

function retryHeaders(resetAt: number, now: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return { 'Retry-After': String(retryAfter) };
}

export function clearCompileUsagePolicyState() {
  usageWindows.clear();
}

export function evaluateCompileUsagePolicy(request: Request): CompileUsagePolicyDecision {
  if (!isPublicCloudCompileEnabled()) {
    return {
      allowed: false,
      httpStatus: 503,
      errorCode: 'COMPILE_PUBLIC_DISABLED',
      message: getPublicCloudCompileDisabledReason(),
    };
  }

  const ipKey = getClientIpKey(request);
  const userKey = getUserKey(request);

  if (isCompileAuthRequired() && !userKey) {
    return {
      allowed: false,
      httpStatus: 401,
      errorCode: 'COMPILE_AUTH_REQUIRED',
      message: '클라우드 컴파일은 인증된 사용자에게만 허용됩니다.',
    };
  }

  const requester: CompileRequester = {
    ipKey,
    userKey,
    ownerKey: userKey ?? `ip:${ipKey}`,
  };
  const now = Date.now();
  const ipRate = incrementWindow(
    `ip:${requester.ipKey}:minute`,
    readPositiveIntegerEnv('MODUMAKE_COMPILE_RATE_LIMIT_IP_PER_MINUTE', 5),
    MINUTE_MS,
    now
  );

  if (!ipRate.allowed) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: 'COMPILE_RATE_LIMITED',
      message: '짧은 시간에 너무 많은 컴파일 요청이 들어왔습니다. 잠시 후 다시 시도하세요.',
      headers: retryHeaders(ipRate.resetAt, now),
    };
  }

  const ownerRate = incrementWindow(
    `owner:${requester.ownerKey}:minute`,
    readPositiveIntegerEnv('MODUMAKE_COMPILE_RATE_LIMIT_USER_PER_MINUTE', 10),
    MINUTE_MS,
    now
  );

  if (!ownerRate.allowed) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: 'COMPILE_RATE_LIMITED',
      message: '사용자별 분당 컴파일 요청 한도를 초과했습니다.',
      headers: retryHeaders(ownerRate.resetAt, now),
    };
  }

  const hourlyQuota = incrementWindow(
    `owner:${requester.ownerKey}:hour`,
    readPositiveIntegerEnv('MODUMAKE_COMPILE_QUOTA_USER_PER_HOUR', 30),
    HOUR_MS,
    now
  );

  if (!hourlyQuota.allowed) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: 'COMPILE_QUOTA_EXCEEDED',
      message: '사용자별 시간당 컴파일 한도를 초과했습니다.',
      headers: retryHeaders(hourlyQuota.resetAt, now),
    };
  }

  const dailyQuota = incrementWindow(
    `owner:${requester.ownerKey}:day`,
    readPositiveIntegerEnv('MODUMAKE_COMPILE_QUOTA_USER_PER_DAY', 150),
    DAY_MS,
    now
  );

  if (!dailyQuota.allowed) {
    return {
      allowed: false,
      httpStatus: 429,
      errorCode: 'COMPILE_QUOTA_EXCEEDED',
      message: '사용자별 일일 컴파일 한도를 초과했습니다.',
      headers: retryHeaders(dailyQuota.resetAt, now),
    };
  }

  return { allowed: true, requester };
}
