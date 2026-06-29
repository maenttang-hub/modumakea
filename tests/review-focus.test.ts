import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewIssueKey, resolveReviewFocusTarget } from '@/lib/review-focus';

test('review focus builds a stable issue key from verifier metadata', () => {
  const key = buildReviewIssueKey({
    componentName: 'LED 1',
    boardPin: 'D2',
    operation: 'digitalWrite',
    line: 8,
    ruleId: 'formal.output-drive-grounded-net',
    title: '코드가 접지 넷을 구동하고 있습니다',
    message: 'D2에 HIGH가 호출되지만 GND와 같은 넷입니다.',
  });

  assert.ok(key.includes('LED 1'));
  assert.ok(key.includes('D2'));
  assert.ok(key.includes('formal.output-drive-grounded-net'));
});

test('review focus prefers component targets over board-level pin targets', () => {
  const target = resolveReviewFocusTarget({
    componentInstanceId: 'sensor-1',
    boardPin: 'GPIO4',
  });

  assert.deepEqual(target, {
    kind: 'components',
    instanceIds: ['sensor-1'],
  });
});

test('review focus keeps multiple component targets together', () => {
  const target = resolveReviewFocusTarget({
    componentInstanceIds: ['sensor-1', 'sensor-2', 'sensor-1'],
  });

  assert.deepEqual(target, {
    kind: 'components',
    instanceIds: ['sensor-1', 'sensor-2'],
  });
});

test('review focus falls back to board target when only board pin is known', () => {
  const target = resolveReviewFocusTarget({
    boardPin: 'D2',
  });

  assert.deepEqual(target, {
    kind: 'board',
  });
});
