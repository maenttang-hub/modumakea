import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_LANGUAGE_COOKIE, resolveAppLanguage } from '@/lib/ui-language';

export async function POST(request: Request) {
  let payload: { language?: unknown } = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const language = resolveAppLanguage(payload.language);
  const cookieStore = await cookies();
  cookieStore.set(APP_LANGUAGE_COOKIE, language, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  return NextResponse.json({
    ok: true,
    language,
  });
}
