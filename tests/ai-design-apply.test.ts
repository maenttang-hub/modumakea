import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAiAppliedState } from '@/lib/ai-design-apply';

const baseApplyState = {
  powerInputMode: 'usb-5v' as const,
  wiringMode: 'auto' as const,
  showGrid: true,
  showMinimap: true,
};

test('buildAiAppliedState auto-inserts a required resistor for AI-led designs', () => {
  const result = buildAiAppliedState(baseApplyState, {
    board: { id: 'esp32' },
    components: [
      {
        instanceId: 'c1',
        templateId: 'tpl_led',
        position: { x: 480, y: 120 },
        rotation: 0,
        assignedPins: {},
      },
    ],
    connections: [
      { instanceId: 'c1', componentPin: 'Signal', boardPin: 'G25' },
      { instanceId: 'c1', componentPin: 'GND', boardPin: 'GND' },
    ],
    code: 'void setup(){}\nvoid loop(){}',
  });

  assert.ok(result.nextState);
  assert.equal(result.status, 'applied-with-autocorrect');
  assert.match(result.notice ?? '', /필수 동반 부품 1개를 자동으로 추가했습니다/);
  assert.match(result.notice ?? '', /자동으로 LED 전류 제한 저항 220 Ohm를 추가했습니다/);
  const insertedResistors = result.nextState?.components.filter(component => component.templateId === 'tpl_resistor') ?? [];
  assert.equal(insertedResistors.length, 1);
  assert.equal(insertedResistors[0]?.value, '220 Ohm');
});

test('buildAiAppliedState does not duplicate a resistor that AI already included', () => {
  const result = buildAiAppliedState(baseApplyState, {
    board: { id: 'esp32' },
    components: [
      {
        instanceId: 'c1',
        templateId: 'tpl_led',
        position: { x: 480, y: 120 },
        rotation: 0,
        assignedPins: {},
      },
      {
        instanceId: 'c2',
        templateId: 'tpl_resistor',
        position: { x: 630, y: 120 },
        rotation: 0,
        assignedPins: {},
      },
    ],
    connections: [
      { instanceId: 'c1', componentPin: 'Signal', boardPin: 'G25' },
      { instanceId: 'c1', componentPin: 'GND', boardPin: 'GND' },
    ],
    code: 'void setup(){}\nvoid loop(){}',
  });

  assert.ok(result.nextState);
  assert.equal(result.status, 'applied');
  assert.equal(
    result.nextState?.components.filter(component => component.templateId === 'tpl_resistor').length,
    1
  );
  assert.equal(result.notice, undefined);
});

test('buildAiAppliedState rewrites LED companion duplicate GPIO wiring into a safe series path', () => {
  const result = buildAiAppliedState(baseApplyState, {
    board: { id: 'esp32' },
    components: [
      {
        instanceId: 'led_red',
        templateId: 'tpl_led',
        position: { x: 480, y: 120 },
        rotation: 0,
        assignedPins: {},
      },
      {
        instanceId: 'res_red',
        templateId: 'tpl_resistor',
        position: { x: 630, y: 120 },
        rotation: 0,
        assignedPins: {},
      },
    ],
    connections: [
      { instanceId: 'led_red', componentPin: 'Signal', boardPin: 'G12' },
      { instanceId: 'led_red', componentPin: 'GND', boardPin: 'GND' },
      { instanceId: 'res_red', componentPin: '1', boardPin: 'G12' },
    ],
    code: 'void setup(){}\nvoid loop(){}',
  });

  assert.ok(result.nextState, result.error);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 'applied');

  const led = result.nextState?.components.find(component => component.instanceId === 'led_red');
  const resistor = result.nextState?.components.find(component => component.instanceId === 'res_red');

  assert.ok(led);
  assert.ok(resistor);
  assert.equal(led?.assignedPins.Signal, undefined);
  assert.equal(led?.assignedPins.GND, 'GND');
  assert.equal(Object.values(resistor?.assignedPins ?? {}).includes('G12'), true);
  assert.equal(result.nextState?.manualConnections.length, 1);
  assert.equal(result.nextState?.manualConnections[0]?.source.ownerId, 'res_red');
  assert.equal(result.nextState?.manualConnections[0]?.target.ownerId, 'led_red');
});

test('buildAiAppliedState flags remaining blocking issues as manual review required', () => {
  const result = buildAiAppliedState(baseApplyState, {
    board: { id: 'esp32' },
    components: [
      {
        instanceId: 'relay_1',
        templateId: 'tpl_relay',
        position: { x: 320, y: 160 },
        rotation: 0,
        assignedPins: {},
      },
    ],
    connections: [
      { instanceId: 'relay_1', componentPin: 'Signal', boardPin: 'G14' },
      { instanceId: 'relay_1', componentPin: 'VCC', boardPin: '3.3V' },
      { instanceId: 'relay_1', componentPin: 'GND', boardPin: 'GND' },
    ],
    code: 'void setup(){}\nvoid loop(){}',
  });

  assert.equal(result.nextState, undefined);
  assert.equal(result.status, 'manual-review-required');
  assert.match(result.error ?? '', /수동 확인|사람이 확인/);
});
