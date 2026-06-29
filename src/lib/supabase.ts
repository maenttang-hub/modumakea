/**
 * lib/supabase.ts
 * Supabase 클라이언트 초기화 (환경변수 없으면 null 반환)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let hasWarnedSupabaseDisabled = false;

export type SupabaseStatus =
  | { enabled: true; reason?: undefined }
  | {
      enabled: false;
      reason:
        | 'missing-env'
        | 'invalid-url'
        | 'placeholder-env'
        | 'init-failed';
    };

function warnSupabaseDisabled(message: string, error?: unknown) {
  if (hasWarnedSupabaseDisabled) {
    return;
  }

  hasWarnedSupabaseDisabled = true;
  if (error) {
    console.warn(message, error);
    return;
  }
  console.warn(message);
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPlaceholderEnvValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.startsWith('your_') ||
    normalized.includes('example') ||
    normalized.includes('placeholder')
  );
}

export function resolveSupabaseStatus(url?: string | null, key?: string | null): SupabaseStatus {
  const normalizedUrl = url?.trim() ?? '';
  const normalizedKey = key?.trim() ?? '';

  if (!normalizedUrl || !normalizedKey) {
    return { enabled: false, reason: 'missing-env' };
  }

  if (isPlaceholderEnvValue(normalizedUrl) || isPlaceholderEnvValue(normalizedKey)) {
    return { enabled: false, reason: 'placeholder-env' };
  }

  if (!isValidHttpUrl(normalizedUrl)) {
    return { enabled: false, reason: 'invalid-url' };
  }

  return { enabled: true };
}

export function getSupabaseStatus(): SupabaseStatus {
  return resolveSupabaseStatus(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseDebugInfo() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  let host: string | null = null;
  try {
    host = rawUrl ? new URL(rawUrl).host : null;
  } catch {
    host = null;
  }

  return {
    host,
    keyPrefix: rawKey ? `${rawKey.slice(0, 18)}...` : null,
  };
}

function getErrorCause(error: unknown) {
  if (!error || typeof error !== 'object' || !('cause' in error)) {
    return null;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (!cause) {
    return null;
  }

  if (typeof cause === 'object') {
    return {
      name: 'name' in cause ? String((cause as { name?: unknown }).name ?? '') : undefined,
      code: 'code' in cause ? String((cause as { code?: unknown }).code ?? '') : undefined,
      message: 'message' in cause ? String((cause as { message?: unknown }).message ?? '') : undefined,
    };
  }

  return { message: String(cause) };
}

export function describeSupabaseError(error: unknown) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: getErrorCause(error),
    };
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      message:
        typeof record.message === 'string'
          ? record.message
          : JSON.stringify(record),
      code: typeof record.code === 'string' ? record.code : undefined,
      details: typeof record.details === 'string' ? record.details : undefined,
      hint: typeof record.hint === 'string' ? record.hint : undefined,
      cause: getErrorCause(error),
    };
  }

  return {
    message: String(error),
    cause: null,
  };
}

export function isSupabaseNetworkFailure(error: unknown) {
  const description = describeSupabaseError(error);
  const message = description?.message?.toLowerCase() ?? '';
  const causeCode = description?.cause?.code?.toLowerCase() ?? '';
  const causeMessage = description?.cause?.message?.toLowerCase() ?? '';

  return (
    message.includes('fetch failed') ||
    causeCode === 'enotfound' ||
    causeCode === 'econnrefused' ||
    causeCode === 'econnreset' ||
    causeCode === 'etimedout' ||
    causeMessage.includes('getaddrinfo') ||
    causeMessage.includes('fetch failed')
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const status = resolveSupabaseStatus(rawUrl, rawKey);

  if (!status.enabled) {
    const message =
      status.reason === 'invalid-url'
        ? '[Supabase] URL 형식이 올바르지 않습니다. 클라우드 저장 기능은 비활성화됩니다.'
        : '[Supabase] 환경 변수가 비어 있거나 예시 값 상태입니다. 클라우드 저장 기능은 비활성화됩니다.';

    warnSupabaseDisabled(message);
    return null;
  }

  const url = rawUrl as string;
  const key = rawKey as string;

  try {
    supabaseInstance = createClient(url, key);
    return supabaseInstance;
  } catch (error) {
    warnSupabaseDisabled('[Supabase] 클라이언트 초기화에 실패했습니다. 클라우드 저장 기능은 비활성화됩니다.', error);
    return null;
  }
}
