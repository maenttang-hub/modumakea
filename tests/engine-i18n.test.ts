import test from 'node:test';
import assert from 'node:assert/strict';

import { createProjectAuditIssue, translateEngineIssue } from '@/lib/engine-i18n';

test('engine issue translation renders structured code+params messages in Korean and English', () => {
  const issue = createProjectAuditIssue({
    severity: 'error',
    code: 'netlist.led-current-limit-missing',
    params: {
      componentName: 'LED 1',
    },
    ruleId: 'netlist.led-current-limit-missing',
  });

  const ko = translateEngineIssue(issue, 'ko');
  const en = translateEngineIssue(issue, 'en');

  assert.equal(ko.title, 'LED 보호 저항 누락');
  assert.match(ko.message, /LED 1/);
  assert.equal(en.title, 'LED current-limiting resistor missing');
  assert.match(en.message, /LED 1/);
  assert.equal(issue.confidence, 'strong-inference');
  assert.equal(issue.evidence?.confidence, 'strong-inference');
  assert.ok(issue.evidence?.checkedBy.includes('netlist'));
  assert.match(issue.evidence?.evidenceSummary ?? '', /저항 없이 직접 구동|직렬 전류 제한 저항 없이/);
});

test('engine issue translation falls back to existing strings when no catalog entry exists', () => {
  const fallback = translateEngineIssue(
    {
      title: '사용자 정의 경고',
      message: '알 수 없는 규칙입니다.',
      code: 'custom.unknown-rule',
    },
    'en'
  );

  assert.equal(fallback.title, '사용자 정의 경고');
  assert.equal(fallback.message, '알 수 없는 규칙입니다.');
});

test('engine issue translation renders audit power and voltage messages from structured params', () => {
  const powerIssue = createProjectAuditIssue({
    severity: 'warning',
    code: 'power.high-5v-load',
    params: {
      componentName: 'Servo 1',
      peakMa: 650,
    },
    ruleId: 'power.high-5v-load',
  });

  const voltageIssue = createProjectAuditIssue({
    severity: 'error',
    code: 'electrical.logic-level.overvoltage',
    params: {
      componentName: 'Sensor 1',
      pinName: 'Data',
      inputTolerance: 3.6,
      boardPin: 'D2',
      boardVoltage: 5,
      mitigationRecommendation: '레벨 시프터를 추가하세요.',
      mitigationRecommendationEn: 'Add a level shifter.',
    },
    ruleId: 'electrical.logic-level.overvoltage',
  });

  const powerEn = translateEngineIssue(powerIssue, 'en');
  const voltageKo = translateEngineIssue(voltageIssue, 'ko');

  assert.equal(powerEn.title, 'Heavy load on the board 5V rail');
  assert.match(powerEn.message, /Servo 1/);
  assert.match(powerEn.message, /650/);

  assert.equal(voltageKo.title, '전압 도메인 불일치');
  assert.match(voltageKo.message, /Sensor 1/);
  assert.match(voltageKo.message, /D2/);
  assert.equal(voltageKo.recommendation, '레벨 시프터를 추가하세요.');
  assert.equal(voltageIssue.confidence, 'confirmed');
  assert.equal(voltageIssue.evidence?.howToVerify, '레벨 시프터를 추가하세요.');
  assert.match(voltageIssue.evidence?.evidenceSummary ?? '', /입력 허용치/);
});
