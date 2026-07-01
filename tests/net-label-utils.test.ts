import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeJoinableNetLabel,
  expandPowerNetAliases,
  isPowerLikeNetLabel,
  parseVoltageFromPowerNetLabel,
} from '@/lib/net-label-utils';

test('power net labels normalize common KiCad aliases consistently', () => {
  assert.equal(canonicalizeJoinableNetLabel('+12V'), '12V');
  assert.equal(canonicalizeJoinableNetLabel('12V'), '12V');
  assert.equal(canonicalizeJoinableNetLabel('3V3'), '3.3V');
  assert.equal(canonicalizeJoinableNetLabel('3.3V'), '3.3V');
  assert.equal(canonicalizeJoinableNetLabel('VCC'), 'VCC');
  assert.equal(canonicalizeJoinableNetLabel('VDD'), 'VCC');
});

test('power net helpers classify and parse voltage aliases', () => {
  for (const label of ['+12V', '12V', '3V3', '3.3V', 'VCC', 'VDD']) {
    assert.equal(isPowerLikeNetLabel(label), true, `${label} should be power-like`);
  }

  assert.equal(parseVoltageFromPowerNetLabel('+12V'), 12);
  assert.equal(parseVoltageFromPowerNetLabel('12V'), 12);
  assert.equal(parseVoltageFromPowerNetLabel('3V3'), 3.3);
  assert.equal(parseVoltageFromPowerNetLabel('3.3V'), 3.3);
  assert.equal(parseVoltageFromPowerNetLabel('VCC'), undefined);
  assert.deepEqual(expandPowerNetAliases('+12V'), ['+12V', '12V']);
});
