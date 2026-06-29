import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_LANGUAGE_COOKIE,
  DEFAULT_APP_LANGUAGE,
  isAppLanguage,
  resolveAcceptLanguage,
  resolveAppLanguage,
} from '@/lib/ui-language';

test('ui language exposes the shared locale cookie name', () => {
  assert.equal(APP_LANGUAGE_COOKIE, 'NEXT_LOCALE');
});

test('ui language resolves only supported values', () => {
  assert.equal(resolveAppLanguage('ko'), 'ko');
  assert.equal(resolveAppLanguage('en'), 'en');
  assert.equal(resolveAppLanguage('fr'), DEFAULT_APP_LANGUAGE);
  assert.equal(resolveAppLanguage(undefined), DEFAULT_APP_LANGUAGE);
  assert.equal(isAppLanguage('ko'), true);
  assert.equal(isAppLanguage('en'), true);
  assert.equal(isAppLanguage('ja'), false);
});

test('ui language derives preferred locale from accept-language headers', () => {
  assert.equal(resolveAcceptLanguage('en-US,en;q=0.9,ko;q=0.8'), 'en');
  assert.equal(resolveAcceptLanguage('ko-KR,ko;q=0.9,en;q=0.8'), 'ko');
  assert.equal(resolveAcceptLanguage('fr-FR,ja;q=0.8'), DEFAULT_APP_LANGUAGE);
  assert.equal(resolveAcceptLanguage(null), DEFAULT_APP_LANGUAGE);
});
