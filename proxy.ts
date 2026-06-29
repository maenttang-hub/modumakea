import { NextRequest, NextResponse } from 'next/server';
import {
  APP_LANGUAGE_COOKIE,
  isAppLanguage,
  resolveAcceptLanguage,
} from '@/lib/ui-language';

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(APP_LANGUAGE_COOKIE)?.value;
  if (isAppLanguage(existing)) {
    return NextResponse.next();
  }

  const preferredLanguage = resolveAcceptLanguage(request.headers.get('accept-language'));
  const response = NextResponse.next();
  response.cookies.set(APP_LANGUAGE_COOKIE, preferredLanguage, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
