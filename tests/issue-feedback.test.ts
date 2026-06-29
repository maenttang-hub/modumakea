import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getValidationReviewDecisionBadges,
  normalizeValidationReviewDecision,
  shouldHideIssueForReviewDecision,
  shouldToneDownIssueForReviewDecision,
} from '@/lib/issue-feedback';

test('normalizeValidationReviewDecision upgrades legacy review statuses to the new feedback model', () => {
  const normalized = normalizeValidationReviewDecision({
    primary: 'intentional',
    flags: ['intentional', 'module-included', 'datasheet-checked', 'module-included'],
    updatedAt: '2026-06-28T12:00:00.000Z',
  });

  assert.deepEqual(normalized, {
    primary: 'already-handled',
    flags: ['included-in-module', 'verified-by-datasheet'],
    updatedAt: '2026-06-28T12:00:00.000Z',
  });
});

test('normalizeValidationReviewDecision drops empty or invalid review payloads', () => {
  assert.equal(normalizeValidationReviewDecision(null), null);
  assert.equal(normalizeValidationReviewDecision({}), null);
  assert.equal(normalizeValidationReviewDecision({ primary: 'unknown', flags: ['mystery'] }), null);
});

test('feedback helpers separate hide and tone-down semantics', () => {
  assert.equal(shouldHideIssueForReviewDecision({ primary: 'fixed', flags: [] }), true);
  assert.equal(shouldHideIssueForReviewDecision({ primary: 'false-positive', flags: [] }), true);
  assert.equal(shouldHideIssueForReviewDecision({ primary: 'already-handled', flags: [] }), false);

  assert.equal(shouldToneDownIssueForReviewDecision({ primary: 'already-handled', flags: [] }), true);
  assert.equal(shouldToneDownIssueForReviewDecision({ flags: ['included-in-module'] }), true);
  assert.equal(shouldToneDownIssueForReviewDecision({ flags: [] }), false);
});

test('getValidationReviewDecisionBadges returns primary and flags in display order', () => {
  const badges = getValidationReviewDecisionBadges({
    primary: 'already-handled',
    flags: ['included-in-module', 'verified-by-datasheet'],
  });

  assert.deepEqual(badges, [
    'already-handled',
    'included-in-module',
    'verified-by-datasheet',
  ]);
});
