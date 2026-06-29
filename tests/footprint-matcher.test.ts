import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFootprintMatcherModel, buildFootprintPinPadCacheKey } from '@/lib/footprint-matcher';
import type { ComponentTemplate, FootprintPinPadOverrideCacheEntry, PlacedComponent } from '@/types';

function makeComponent(overrides: Partial<PlacedComponent>): PlacedComponent {
  return {
    instanceId: 'cmp-1',
    templateId: 'tpl_diode',
    name: 'D1',
    position: { x: 0, y: 0 },
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
    ...overrides,
  };
}

const diodeTemplate: ComponentTemplate = {
  id: 'tpl_diode',
  name: '다이오드',
  category: 'PASSIVE',
  description: 'test',
  icon: 'Zap',
  compatibleVoltage: 'BOTH',
  requiredPins: [
    { name: 'A', allowedTypes: ['DIGITAL'] },
    { name: 'K', allowedTypes: ['DIGITAL'] },
  ],
  schematic: { symbol: 'D', referencePrefix: 'D' },
  pcb: { footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal', packageType: 'THT', manufacturable: true },
};

test('buildFootprintMatcherModel flags imported diode pinout mismatch', () => {
  const component = makeComponent({
    importedMapping: {
      confidence: 'high',
      source: 'kicad-library',
      footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: 'A', label: 'Anode', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'K', label: 'Cathode', number: '2', at: { x: 1, y: 0 }, angle: 180, lengthMm: 1.27 },
      ],
    },
  });

  const model = buildFootprintMatcherModel(component, diodeTemplate);
  assert.ok(model);
  assert.equal(model.status, 'error');
  assert.match(model.summary, /A: 심볼 1 -> 패드 2/);
  assert.match(model.summary, /K: 심볼 2 -> 패드 1/);
});

test('buildFootprintMatcherModel builds connector pads from footprint family', () => {
  const component = makeComponent({
    templateId: 'tpl_connector',
    name: 'J1',
    importedMapping: {
      confidence: 'medium',
      source: 'kicad-library',
      footprint: 'Connector_Generic:Conn_02x02_Counter_Clockwise',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: '1', label: '1', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: '2', label: '2', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: '3', label: '3', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: '4', label: '4', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      ],
    },
  });

  const model = buildFootprintMatcherModel(component, undefined);
  assert.ok(model);
  assert.equal(model.packageLabel, '2x2 Connector');
  assert.deepEqual(model.pads.map(pad => pad.id), ['1', '2', '3', '4']);
});

test('buildFootprintMatcherModel respects saved pin-to-pad overrides', () => {
  const component = makeComponent({
    importedMapping: {
      confidence: 'high',
      source: 'kicad-library',
      footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
    },
    footprintPinPadOverrides: {
      A: '2',
      K: '1',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: 'A', label: 'Anode', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'K', label: 'Cathode', number: '2', at: { x: 1, y: 0 }, angle: 180, lengthMm: 1.27 },
      ],
    },
  });

  const model = buildFootprintMatcherModel(component, diodeTemplate);
  assert.ok(model);
  assert.equal(model.status, 'ok');
  assert.equal(model.links.find(link => link.pinId === 'A')?.padId, '2');
  assert.equal(model.links.find(link => link.pinId === 'K')?.padId, '1');
});

test('buildFootprintMatcherModel reuses cached pin-to-pad overrides for similar parts', () => {
  const component = makeComponent({
    importedMapping: {
      confidence: 'high',
      source: 'kicad-library',
      footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
      libraryId: 'Device:D',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: 'A', label: 'Anode', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'K', label: 'Cathode', number: '2', at: { x: 1, y: 0 }, angle: 180, lengthMm: 1.27 },
      ],
    },
  });

  const cacheKey = buildFootprintPinPadCacheKey(
    component,
    diodeTemplate,
    [
      { id: 'A', label: 'Anode', role: 'A', number: '1' },
      { id: 'K', label: 'Cathode', role: 'K', number: '2' },
    ],
    'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal'
  );

  assert.ok(cacheKey);

  const cache: Record<string, FootprintPinPadOverrideCacheEntry> = {
    [cacheKey]: {
      key: cacheKey,
      title: '다이오드',
      footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
      packageLabel: 'DO-35',
      pinPadMap: { A: '2', K: '1' },
      templateId: 'tpl_diode',
      libraryId: 'Device:D',
      componentName: 'D1',
      updatedAt: new Date().toISOString(),
    },
  };

  const model = buildFootprintMatcherModel(component, diodeTemplate, cache);
  assert.ok(model);
  assert.equal(model.status, 'ok');
  assert.equal(model.mappingSource, 'cache');
  assert.equal(model.links.find(link => link.pinId === 'A')?.padId, '2');
  assert.equal(model.links.find(link => link.pinId === 'K')?.padId, '1');
});

test('buildFootprintMatcherModel supports driver IC pinout rules', () => {
  const component = makeComponent({
    templateId: 'tpl_driver_ic',
    name: 'U1',
    value: 'ULN2003',
    importedMapping: {
      confidence: 'medium',
      source: 'value-regex',
      footprint: 'Package_DIP:DIP-16_W7.62mm',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: 'IN', label: 'IN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'GND', label: 'GND', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'VCC', label: 'VCC', number: '8', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'OUT', label: 'OUT', number: '15', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      ],
    },
  });

  const model = buildFootprintMatcherModel(component, undefined);
  assert.ok(model);
  assert.equal(model.title, '드라이버 IC');
  assert.equal(model.status, 'error');
  assert.match(model.summary, /IN: 심볼 2 -> 패드 1/);
});

test('buildFootprintMatcherModel supports op-amp buffer pinout rules', () => {
  const component = makeComponent({
    templateId: 'tpl_op_amp_buffer',
    name: 'U7',
    value: 'LM358 Buffer',
    importedMapping: {
      confidence: 'medium',
      source: 'value-regex',
      footprint: 'Package_DIP:DIP-8_W7.62mm',
    },
    importedGeometry: {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      primitives: [],
      pinAnchors: [
        { pinId: 'OUT', label: 'OUT', number: '7', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'IN', label: 'IN', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'GND', label: 'GND', number: '4', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
        { pinId: 'VCC', label: 'VCC', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      ],
    },
  });

  const model = buildFootprintMatcherModel(component, undefined);
  assert.ok(model);
  assert.equal(model.title, 'OP-Amp 버퍼');
  assert.equal(model.status, 'error');
  assert.match(model.summary, /OUT: 심볼 7 -> 패드 1/);
  assert.match(model.summary, /IN: 심볼 2 -> 패드 3/);
});
