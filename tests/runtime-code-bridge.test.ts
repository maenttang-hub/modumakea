import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveRuntimeComponentStates } from '@/lib/runtime-code-bridge';
import { makeComponent } from './test-fixtures';

test('runtime code bridge derives active state from parser-backed C++ operations', () => {
  const runtimeStates = deriveRuntimeComponentStates({
    boardId: 'uno',
    targetLanguage: 'C++',
    code: `
      #define LED_PIN 13
      void loop() {
        digitalWrite(LED_PIN, HIGH);
      }
    `,
    components: [
      makeComponent({
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        assignedPins: { Signal: 'D13', GND: 'GND' },
      }),
    ],
  });

  assert.equal(runtimeStates['led-1']?.mode, 'active');
  assert.equal(runtimeStates['led-1']?.label, 'D13 활성');
});

test('runtime code bridge derives pulse state from parser-backed Python operations', () => {
  const runtimeStates = deriveRuntimeComponentStates({
    boardId: 'rpi4',
    targetLanguage: 'Python',
    code: `
from gpiozero import LED

status_led = LED(17)
status_led.blink()
    `,
    components: [
      makeComponent({
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        assignedPins: { Signal: 'GPIO17', GND: 'GND' },
      }),
    ],
  });

  assert.equal(runtimeStates['led-1']?.mode, 'pulse');
  assert.equal(runtimeStates['led-1']?.label, 'GPIO17 펄스');
});
