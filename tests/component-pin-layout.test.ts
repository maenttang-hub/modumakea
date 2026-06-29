import test from 'node:test';
import assert from 'node:assert/strict';

import { getComponentPinLayout } from '@/lib/component-pin-layout';

test('sensor pins stay on one side for cleaner schematic readability', () => {
  const layout = getComponentPinLayout(
    [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'DATA', allowedTypes: ['DIGITAL'] },
    ],
    'SENSOR'
  );

  assert.deepEqual(
    layout.leftPins.map(pin => pin.name),
    ['VCC', 'GND', 'DATA']
  );
  assert.equal(layout.rightPins.length, 0);
});

test('passive components still split left and right for two-terminal symbols', () => {
  const layout = getComponentPinLayout(
    [
      { name: '1', allowedTypes: ['DIGITAL'] },
      { name: '2', allowedTypes: ['DIGITAL'] },
    ],
    'PASSIVE'
  );

  assert.equal(layout.leftPins.length, 1);
  assert.equal(layout.rightPins.length, 1);
  assert.equal(layout.leftPins[0]?.name, '1');
  assert.equal(layout.rightPins[0]?.name, '2');
});
