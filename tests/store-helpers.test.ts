import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyManualRoutingCompletion,
  buildCompanionInsertionPlan,
  mergeTemplateCacheEntries,
  resolvePlacedComponentValue,
  replaceComponentById,
} from '@/store/store-helpers';
import type { CompanionPartSuggestion, ComponentTemplate, ManualNetConnection, PlacedComponent } from '@/types';

test('applyManualRoutingCompletion preserves array identity when nothing changes', () => {
  const components: PlacedComponent[] = [{
    instanceId: 'sensor-1',
    templateId: 'tpl_dht11',
    name: '온습도 센서 1',
    value: 'DHT11',
    position: { x: 100, y: 120 },
    rotation: 0,
    assignedPins: { VCC: '5V', GND: 'GND', Data: 'D2' },
    isFullyRouted: true,
  }];

  const manualConnections: ManualNetConnection[] = [];
  const result = applyManualRoutingCompletion(components, manualConnections);

  assert.strictEqual(result, components);
});

test('replaceComponentById preserves original array when updater returns same component', () => {
  const component: PlacedComponent = {
    instanceId: 'led-1',
    templateId: 'tpl_led',
    name: 'LED 1',
    value: undefined,
    position: { x: 0, y: 0 },
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
  };

  const components = [component];
  const result = replaceComponentById(components, 'led-1', current => current);

  assert.strictEqual(result, components);
});

test('mergeTemplateCacheEntries preserves cache identity when values are unchanged', () => {
  const template = {
    id: 'tpl_led',
    name: 'LED',
    category: 'ACTUATOR',
    description: 'light',
    icon: 'Lightbulb',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'Signal', allowedTypes: ['DIGITAL'] },
      { name: 'GND', allowedTypes: ['GND'] },
    ],
  } satisfies ComponentTemplate;

  const cache = { [template.id]: template };
  const merged = mergeTemplateCacheEntries(cache, [template], entry => entry.id);

  assert.strictEqual(merged, cache);
});

test('resolvePlacedComponentValue collapses LED resistor ranges into an exact value', () => {
  const resistorTemplate = {
    id: 'tpl_resistor',
    name: '저항',
    category: 'PASSIVE',
    description: 'current limiting',
    icon: 'Minus',
    compatibleVoltage: 'BOTH',
    defaultValue: '220 Ohm',
    requiredPins: [
      { name: '1', allowedTypes: ['DIGITAL'] },
      { name: '2', allowedTypes: ['DIGITAL'] },
    ],
  } satisfies ComponentTemplate;

  assert.equal(resolvePlacedComponentValue(resistorTemplate, '220-330 Ohm'), '220 Ohm');
});

test('buildCompanionInsertionPlan picks a concrete pull-up resistor value from a range', () => {
  const targetComponent: PlacedComponent = {
    instanceId: 'oled-1',
    templateId: 'tpl_oled',
    name: 'OLED 1',
    value: undefined,
    position: { x: 300, y: 180 },
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
  };

  const items: CompanionPartSuggestion[] = [{
    kind: 'resistor',
    level: 'required',
    label: 'I2C 풀업 저항',
    value: '4.7k-10k Ohm',
    quantity: 1,
    reason: 'bus pull-up',
  }];

  const planned = buildCompanionInsertionPlan(targetComponent, items, []);

  assert.equal(planned.length, 1);
  assert.equal(planned[0]?.templateId, 'tpl_resistor');
  assert.equal(planned[0]?.value, '4.7k Ohm');
});
