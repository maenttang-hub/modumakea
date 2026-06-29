import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEditorDiagnosticBundle } from '@/lib/editor-diagnostics';
import type { FormalVerificationIssue } from '@/types';

test('editor diagnostics maps line-based verifier issues into Monaco-ready markers', () => {
  const issues: FormalVerificationIssue[] = [
    {
      severity: 'error',
      title: '핀 모드 충돌',
      message: 'D2 핀이 입력으로 설정되어 있으나 출력 호출이 감지되었습니다.',
      line: 3,
      ruleId: 'formal.pin-mode-conflict',
      recommendation: 'pinMode와 digitalWrite 대상을 다시 맞추세요.',
    },
  ];

  const bundle = buildEditorDiagnosticBundle(
    ['void setup() {', '  pinMode(D2, INPUT);', '  digitalWrite(D2, HIGH);', '}'].join('\n'),
    issues
  );

  assert.equal(bundle.generalIssues.length, 0);
  assert.equal(bundle.markers.length, 1);
  assert.equal(bundle.markers[0]?.line, 3);
  assert.equal(bundle.markers[0]?.startColumn, 3);
  assert.ok(bundle.markers[0]?.message.includes('핀 모드 충돌'));
  assert.ok(bundle.markers[0]?.message.includes('권장 수정'));
  assert.equal(bundle.markers[0]?.issue.ruleId, 'formal.pin-mode-conflict');
  assert.ok(bundle.markers[0]?.issueKey.includes('formal.pin-mode-conflict'));
});

test('editor diagnostics keeps non-line issues in the general summary bucket', () => {
  const issues: FormalVerificationIssue[] = [
    {
      severity: 'error',
      title: '코드 구문 오류',
      message: 'C/C++ 스케치 구문이 완전하지 않아 검증을 진행할 수 없습니다.',
      ruleId: 'formal.syntax-error',
    },
  ];

  const bundle = buildEditorDiagnosticBundle('void setup() {', issues);

  assert.equal(bundle.markers.length, 0);
  assert.equal(bundle.generalIssues.length, 1);
  assert.equal(bundle.generalIssues[0]?.ruleId, 'formal.syntax-error');
});

test('editor diagnostics also de-duplicates repeated general issues with the shared issue key', () => {
  const issues: FormalVerificationIssue[] = [
    {
      severity: 'error',
      title: '코드 구문 오류',
      message: 'Python 구문이 완전하지 않습니다.',
      ruleId: 'formal.syntax-error',
      boardPin: 'GPIO2',
    },
    {
      severity: 'error',
      title: '코드 구문 오류',
      message: 'Python 구문이 완전하지 않습니다.',
      ruleId: 'formal.syntax-error',
      boardPin: 'GPIO2',
    },
  ];

  const bundle = buildEditorDiagnosticBundle('print("hello")', issues);

  assert.equal(bundle.markers.length, 0);
  assert.equal(bundle.generalIssues.length, 1);
});

test('editor diagnostics de-duplicates repeated line issues and clamps out-of-range lines', () => {
  const issues: FormalVerificationIssue[] = [
    {
      severity: 'warning',
      title: '풀업 권장',
      message: '외부 풀업 저항이 없어 입력이 불안정할 수 있습니다.',
      line: 99,
      boardPin: 'D4',
    },
    {
      severity: 'warning',
      title: '풀업 권장',
      message: '외부 풀업 저항이 없어 입력이 불안정할 수 있습니다.',
      line: 99,
      boardPin: 'D4',
    },
  ];

  const bundle = buildEditorDiagnosticBundle('pinMode(D4, INPUT);', issues);

  assert.equal(bundle.markers.length, 1);
  assert.equal(bundle.markers[0]?.line, 1);
});
