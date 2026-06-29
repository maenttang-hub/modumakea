import test from 'node:test';
import assert from 'node:assert/strict';

import { getSafeRightTab, getVisibleRightTabs } from '@/components/app/home-shell-layout';

test('review shell keeps only validation and comments tabs visible', () => {
  assert.deepEqual(getVisibleRightTabs('review', false), ['validation', 'code', 'comments']);
});

test('view-only shell stays review-first even when edit mode is requested', () => {
  assert.deepEqual(getVisibleRightTabs('edit', true), ['validation', 'comments']);
  assert.equal(getSafeRightTab('inspector', 'edit', true), 'validation');
});

test('edit shell keeps validation, comments, and properties available for editors', () => {
  assert.deepEqual(getVisibleRightTabs('edit', false), [
    'validation',
    'code',
    'comments',
  ]);
});
