import { NextRequest, NextResponse } from 'next/server';
import {
  APP_LANGUAGE_COOKIE,
  isAppLanguage,
  resolveAcceptLanguage,
} from '@/lib/ui-language';

function betaAccessUser() {
  return process.env.MODUMAKE_BETA_ACCESS_USER?.trim() || 'beta';
}

function betaAccessPassword() {
  return process.env.MODUMAKE_BETA_ACCESS_PASSWORD?.trim() || '';
}

export function isBetaAccessEnabled() {
  return betaAccessPassword().length > 0;
}

function decodeBasicAuth(value: string) {
  const prefix = 'basic ';
  if (!value.toLowerCase().startsWith(prefix)) {
    return null;
  }

  try {
    const decoded = atob(value.slice(prefix.length).trim());
    const separator = decoded.indexOf(':');
    if (separator < 0) {
      return null;
    }

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function fixedTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function isBetaAccessAuthorized(authorizationHeader: string | null) {
  if (!isBetaAccessEnabled()) {
    return true;
  }

  const credentials = authorizationHeader ? decodeBasicAuth(authorizationHeader) : null;
  if (!credentials) {
    return false;
  }

  return (
    fixedTimeEqual(credentials.user, betaAccessUser()) &&
    fixedTimeEqual(credentials.password, betaAccessPassword())
  );
}

function isPublicRuntimePath(pathname: string) {
  return pathname === '/api/health';
}

function unauthorizedResponse() {
  return new NextResponse('ModuMake beta access required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="ModuMake Beta", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export function middleware(request: NextRequest) {
  if (
    !isPublicRuntimePath(request.nextUrl.pathname) &&
    !isBetaAccessAuthorized(request.headers.get('authorization'))
  ) {
    return unauthorizedResponse();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
