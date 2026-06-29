import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIssueDedupKey, deduplicateIssues, mapFormalIssueToAuditIssue } from '@/lib/issue-utils';
import type { FormalVerificationIssue, ProjectAuditIssue } from '@/types';

test('buildIssueDedupKey uses structured fields consistently', () => {
  const issue: ProjectAuditIssue = {
    severity: 'warning',
    title: '코드가 접지 넷을 구동하고 있습니다',
    message: 'D2가 GND와 같은 넷에 연결되어 있습니다.',
    ruleId: 'formal.output-drive-grounded-net',
    boardPin: 'D2',
    componentName: 'LED 1',
    operation: 'digitalWrite',
  };

  assert.equal(
    buildIssueDedupKey(issue),
    'warning::formal.output-drive-grounded-net::led 1::d2::digitalwrite::::코드가 접지 넷을 구동하고 있습니다::d2가 gnd와 같은 넷에 연결되어 있습니다.'
  );
});

test('deduplicateIssues removes duplicates that share the same structural key', () => {
  const issues: ProjectAuditIssue[] = [
    {
      severity: 'warning',
      title: '중복 경고',
      message: '같은 이슈입니다.',
      ruleId: 'test.duplicate',
      componentName: 'Sensor 1',
      boardPin: 'A0',
    },
    {
      severity: 'warning',
      title: '중복 경고',
      message: '같은 이슈입니다.',
      ruleId: 'test.duplicate',
      componentName: 'Sensor 1',
      boardPin: 'A0',
    },
    {
      severity: 'warning',
      title: '중복 경고',
      message: '핀만 다릅니다.',
      ruleId: 'test.duplicate',
      componentName: 'Sensor 1',
      boardPin: 'A1',
    },
  ];

  const deduplicated = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 2);
  assert.equal(deduplicated[0]?.boardPin, 'A0');
  assert.equal(deduplicated[1]?.boardPin, 'A1');
});

test('mapFormalIssueToAuditIssue preserves structured metadata', () => {
  const formalIssue: FormalVerificationIssue = {
    severity: 'error',
    title: '코드 구문 오류',
    message: 'setup 함수가 비어 있습니다.',
    code: 'formal.syntax-error',
    ruleId: 'formal.syntax-error',
    line: 12,
    operation: 'parse',
    boardPin: 'D2',
    componentName: 'Button 1',
    recommendation: '코드 구조를 다시 확인하세요.',
  };

  const auditIssue = mapFormalIssueToAuditIssue(formalIssue);

  assert.equal(auditIssue.ruleId, 'formal.syntax-error');
  assert.equal(auditIssue.line, 12);
  assert.equal(auditIssue.operation, 'parse');
  assert.equal(auditIssue.boardPin, 'D2');
  assert.equal(auditIssue.confidence, 'confirmed');
  assert.deepEqual(auditIssue.evidence?.checkedBy, ['formal-code']);
});
