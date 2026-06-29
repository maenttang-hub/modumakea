import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompanionAutocorrectSummary,
  getCompanionAutocorrectMessage,
  getCompanionDisplayValue,
  getCompanionOriginalValueRange,
  getCompanionValueSelectionHint,
} from '@/lib/companion-part-display';
import type { CompanionPartSuggestion } from '@/types';

test('companion display resolves LED resistor ranges into a concrete value', () => {
  const item: CompanionPartSuggestion = {
    kind: 'resistor',
    level: 'required',
    label: 'LED 전류 제한 저항',
    value: '220-330 Ohm',
    quantity: 1,
    reason: 'GPIO protection',
  };

  assert.equal(getCompanionDisplayValue(item), '220 Ohm');
  assert.equal(getCompanionOriginalValueRange(item, '220 Ohm'), '220-330 Ohm');
});

test('companion display explains why a button pull resistor value was chosen', () => {
  const item: CompanionPartSuggestion = {
    kind: 'resistor',
    level: 'conditional',
    label: '버튼 풀업/풀다운 저항',
    value: '10k Ohm',
    quantity: 1,
    reason: 'stable input',
  };

  const hint = getCompanionValueSelectionHint(item);

  assert.ok(hint?.includes('10k Ohm'));
  assert.ok(hint?.includes('입력'));
});

test('companion display explains why an I2C pull-up value was chosen', () => {
  const item: CompanionPartSuggestion = {
    kind: 'resistor',
    level: 'conditional',
    label: 'I2C 풀업 저항',
    value: '2.2k-10k',
    quantity: 2,
    reason: 'i2c bus pull-up',
  };

  const hint = getCompanionValueSelectionHint(item);

  assert.equal(getCompanionDisplayValue(item), '4.7k Ohm');
  assert.ok(hint?.includes('4.7k Ohm'));
  assert.ok(hint?.includes('버스'));
});

test('companion display builds AI autocorrect text from the same resistor explanation', () => {
  const item: CompanionPartSuggestion = {
    kind: 'resistor',
    level: 'required',
    label: 'LED 전류 제한 저항',
    value: '220-330 Ohm',
    quantity: 1,
    reason: 'protect led and gpio',
  };

  const message = getCompanionAutocorrectMessage(item);

  assert.ok(message.includes('자동으로'));
  assert.ok(message.includes('220 Ohm'));
  assert.ok(message.includes('가장 무난한 전류 제한값'));
});

test('companion display can group autocorrect text per component for toast reuse', () => {
  const summary = buildCompanionAutocorrectSummary([
    {
      kind: 'resistor',
      label: '싱글버스 데이터 풀업 저항',
      value: '4.7k-10k Ohm',
      quantity: 1,
    },
  ], {
    prefixComponentName: '온습도 센서 1',
  });

  assert.ok(summary.startsWith('온습도 센서 1:'));
  assert.ok(summary.includes('4.7k Ohm'));
  assert.ok(summary.includes('기본 풀업값'));
});
