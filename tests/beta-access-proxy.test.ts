import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isBetaAccessAuthorized,
  isBetaAccessEnabled,
} from '../middleware';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function basicAuth(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

test('beta access proxy stays open when no beta password is configured', () => {
  const previousPassword = process.env.MODUMAKE_BETA_ACCESS_PASSWORD;
  delete process.env.MODUMAKE_BETA_ACCESS_PASSWORD;

  try {
    assert.equal(isBetaAccessEnabled(), false);
    assert.equal(isBetaAccessAuthorized(null), true);
  } finally {
    restoreEnv('MODUMAKE_BETA_ACCESS_PASSWORD', previousPassword);
  }
});

test('beta access proxy accepts only the configured basic auth credentials', () => {
  const previousUser = process.env.MODUMAKE_BETA_ACCESS_USER;
  const previousPassword = process.env.MODUMAKE_BETA_ACCESS_PASSWORD;
  process.env.MODUMAKE_BETA_ACCESS_USER = 'tester';
  process.env.MODUMAKE_BETA_ACCESS_PASSWORD = 'correct-password';

  try {
    assert.equal(isBetaAccessEnabled(), true);
    assert.equal(isBetaAccessAuthorized(basicAuth('tester', 'correct-password')), true);
    assert.equal(isBetaAccessAuthorized(basicAuth('tester', 'wrong-password')), false);
    assert.equal(isBetaAccessAuthorized(basicAuth('wrong-user', 'correct-password')), false);
    assert.equal(isBetaAccessAuthorized(null), false);
  } finally {
    restoreEnv('MODUMAKE_BETA_ACCESS_USER', previousUser);
    restoreEnv('MODUMAKE_BETA_ACCESS_PASSWORD', previousPassword);
  }
});
