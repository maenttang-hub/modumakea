import test from 'node:test';
import assert from 'node:assert/strict';

import { getBoardSignalLimits } from '@/lib/board-signal-limits';

test('getBoardSignalLimits resolves 3V3 aliases through the board pin registry', () => {
  const aliasLimits = getBoardSignalLimits('esp32', '3V3');
  const canonicalLimits = getBoardSignalLimits('esp32', '3.3V');

  assert.equal(aliasLimits?.isPower, true);
  assert.equal(aliasLimits?.nominal, 3.3);
  assert.deepEqual(aliasLimits, canonicalLimits);
});

test('getBoardSignalLimits derives explicit rail voltages instead of using one hard-coded power value', () => {
  assert.equal(getBoardSignalLimits('uno', '5V')?.nominal, 5);
  assert.equal(getBoardSignalLimits('uno', '3.3V')?.nominal, 3.3);
  assert.equal(getBoardSignalLimits('rpi_pico', 'VBUS')?.nominal, 5);
});
