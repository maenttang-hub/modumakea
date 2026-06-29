import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConceptDesignPrompt } from '@/lib/prompt-builder';

test('buildConceptDesignPrompt advertises required companion parts for led templates', () => {
  const prompt = buildConceptDesignPrompt('신호등을 만들어줘', 'esp32');

  assert.match(prompt, /tpl_led: LED .*required companions: LED 전류 제한 저항\(220-330 Ohm\) x1/);
  assert.match(prompt, /tpl_rgb_led: RGB LED .*required companions: RGB 채널 전류 제한 저항\(220-330 Ohm\) x3/);
  assert.match(prompt, /If a component template lists required companions in the catalog, include those passive\/support parts as separate components in the design\./);
  assert.match(prompt, /never assign the same GPIO board pin directly to both the LED channel and the resistor/i);
  assert.match(prompt, /prefer leaving the resistor unconnected in the connections array/i);
});
