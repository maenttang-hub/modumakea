import type { AppLanguage, CloudProjectVisibility } from '@/types';

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'ko';
export const APP_LANGUAGE_COOKIE = 'NEXT_LOCALE';
export const SUPPORTED_APP_LANGUAGES = ['ko', 'en'] as const;

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'ko' || value === 'en';
}

export function resolveAppLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_APP_LANGUAGE;
}

export function resolveAcceptLanguage(headerValue: string | null | undefined): AppLanguage {
  if (!headerValue) {
    return DEFAULT_APP_LANGUAGE;
  }

  const normalized = headerValue.toLowerCase();
  const candidates = normalized
    .split(',')
    .map(part => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith('ko')) {
      return 'ko';
    }
    if (candidate.startsWith('en')) {
      return 'en';
    }
  }

  return DEFAULT_APP_LANGUAGE;
}

export function pickLanguage<T>(language: AppLanguage, values: { ko: T; en: T }): T {
  return values[language];
}

export function formatCountLabel(
  language: AppLanguage,
  count: number,
  labels: {
    ko: string;
    enSingular: string;
    enPlural?: string;
  }
) {
  if (language === 'ko') {
    return `${count}${labels.ko}`;
  }

  const noun = count === 1 ? labels.enSingular : (labels.enPlural ?? `${labels.enSingular}s`);
  return `${count} ${noun}`;
}

export function getVisibilityLabel(language: AppLanguage, visibility: CloudProjectVisibility) {
  if (language === 'en') {
    switch (visibility) {
      case 'public':
        return 'Public';
      case 'private':
        return 'Private';
      default:
        return 'Link only';
    }
  }

  switch (visibility) {
    case 'public':
      return '공개';
    case 'private':
      return '비공개';
    default:
      return '링크 공유';
  }
}

export function getVisibilityDescription(language: AppLanguage, visibility: CloudProjectVisibility) {
  if (language === 'en') {
    switch (visibility) {
      case 'public':
        return 'Anyone can open this project without the link.';
      case 'private':
        return 'Only the owner can reopen this project. Others cannot access it even with the link.';
      default:
        return 'Only people with the link can open this project. It is not listed publicly.';
    }
  }

  switch (visibility) {
    case 'public':
      return '링크 없이도 열 수 있는 공개 상태입니다. 누구나 접근할 수 있습니다.';
    case 'private':
      return '소유자만 다시 열 수 있습니다. 링크가 있어도 다른 사람은 접근할 수 없습니다.';
    default:
      return '링크를 아는 사람만 열 수 있습니다. 검색에는 노출되지 않습니다.';
  }
}
