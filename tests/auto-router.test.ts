import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialPins } from '@/constants/board-pins';
import { autoAssignPins } from '@/lib/auto-router';
import { makeComponent, makeTemplate } from './test-fixtures.ts';

test('auto router prefers PWM-capable pins when the requirement needs PWM', () => {
  const pins = getInitialPins('uno');
  const component = makeComponent({
    instanceId: 'servo-1',
    templateId: 'tpl_test_pwm',
    name: 'PWM Device 1',
  });
  const template = makeTemplate({
    id: 'tpl_test_pwm',
    name: 'PWM Device',
    category: 'ACTUATOR',
    pins: [{ name: 'Signal', allowedTypes: ['PWM'] }],
  });

  const result = autoAssignPins(component, template, pins, 'uno');

  assert.equal(result.success, true);
  assert.equal(result.assigned.Signal, 'D3');
});

test('auto router reports a locked-pin conflict when the only compatible pin is manually reserved', () => {
  const pins = getInitialPins('uno');
  pins.D2 = {
    ...pins.D2,
    isUsed: true,
    connectedTo: 'manual-lock',
    assignmentMode: 'manual',
  };

  const component = makeComponent({
    instanceId: 'sensor-1',
    templateId: 'tpl_test_digital_only',
    name: 'Digital Only Sensor',
  });
  const template = makeTemplate({
    id: 'tpl_test_digital_only',
    name: 'Digital Only Sensor',
    pins: [{ name: 'Signal', allowedTypes: ['DIGITAL'] }],
    design: {
      datasheetStatus: 'official-complete',
      preferredBoardPins: {
        uno: {
          Signal: ['D2'],
        },
      },
    },
  });

  const restrictedPins = Object.fromEntries(
    Object.entries(pins).map(([pinId, pin]) => {
      if (!['D2', '5V', '3.3V', 'GND'].includes(pinId)) {
        return [pinId, { ...pin, isUsed: true, connectedTo: 'busy', assignmentMode: 'auto' as const }];
      }
      return [pinId, pin];
    })
  );

  const result = autoAssignPins(component, template, restrictedPins, 'uno');

  assert.equal(result.success, false);
  assert.match(result.error ?? '', /D2/);
  assert.match(result.error ?? '', /수동으로 잠겨/);
});
