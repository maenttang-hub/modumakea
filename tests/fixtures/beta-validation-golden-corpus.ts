import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import type { CircuitAnalysisReport } from '@/lib/circuit-netlist';
import type { ComponentTemplate, ManualNetConnection, PlacedComponent } from '@/types';
import { makeComponent, makeManualConnection, makeTemplate } from '../test-fixtures.ts';

type GoldenCircuitFixture = {
  boardId: string;
  components: PlacedComponent[];
  manualConnections?: ManualNetConnection[];
};

const exactI2cTemplate = makeTemplate({
  id: 'tpl_exact_i2c_ic',
  name: 'Exact I2C IC',
  compatibleVoltage: '3.3V',
  category: 'IC',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'SDA', allowedTypes: ['ANALOG'] },
    { name: 'SCL', allowedTypes: ['ANALOG'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
    preferredInterface: 'I2C',
  },
});

const genericI2cTemplate = makeTemplate({
  id: 'tpl_generic_i2c_module',
  name: 'Generic I2C Module',
  compatibleVoltage: '3.3V',
  category: 'SENSOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'SDA', allowedTypes: ['ANALOG'] },
    { name: 'SCL', allowedTypes: ['ANALOG'] },
  ],
  design: {
    datasheetStatus: 'generic-module',
    preferredInterface: 'I2C',
  },
});

const resistorTemplate = makeTemplate({
  id: 'tpl_resistor',
  name: 'Resistor',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['POWER', 'DIGITAL', 'ANALOG'], allowBoardRails: true },
    { name: '2', allowedTypes: ['POWER', 'DIGITAL', 'ANALOG'], allowBoardRails: true },
  ],
});

const shortLinkTemplate = makeTemplate({
  id: 'tpl_short_link',
  name: 'Short Link',
  category: 'PASSIVE',
  pins: [
    { name: 'VCC_IN', allowedTypes: ['POWER'] },
    { name: 'GND_IN', allowedTypes: ['GND'] },
  ],
});

const generalOpAmpTemplate = makeTemplate({
  id: 'tpl_general_op_amp',
  name: 'General Op-Amp',
  category: 'IC',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'IN+', allowedTypes: ['ANALOG'] },
    { name: 'IN-', allowedTypes: ['ANALOG'] },
    { name: 'OUT', allowedTypes: ['ANALOG'] },
  ],
});

const templates: Record<string, ComponentTemplate> = {
  tpl_exact_i2c_ic: exactI2cTemplate,
  tpl_generic_i2c_module: genericI2cTemplate,
  tpl_resistor: resistorTemplate,
  tpl_short_link: shortLinkTemplate,
  tpl_general_op_amp: generalOpAmpTemplate,
};

function resolveGoldenTemplate(templateId: string) {
  return templates[templateId];
}

function healthyI2cWithPullups(): GoldenCircuitFixture {
  return {
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'sensor',
        templateId: 'tpl_exact_i2c_ic',
        name: 'I2C Sensor',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
      makeComponent({
        instanceId: 'r-sda',
        templateId: 'tpl_resistor',
        name: 'R_SDA',
        value: '4.7k',
        assignedPins: { '1': '3.3V' },
      }),
      makeComponent({
        instanceId: 'r-scl',
        templateId: 'tpl_resistor',
        name: 'R_SCL',
        value: '4.7k',
        assignedPins: { '1': '3.3V' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'sda-pullup',
        { ownerType: 'component', ownerId: 'r-sda', pinId: '2' },
        { ownerType: 'component', ownerId: 'sensor', pinId: 'SDA' }
      ),
      makeManualConnection(
        'scl-pullup',
        { ownerType: 'component', ownerId: 'r-scl', pinId: '2' },
        { ownerType: 'component', ownerId: 'sensor', pinId: 'SCL' }
      ),
    ],
  };
}

function exactI2cMissingPullups(): GoldenCircuitFixture {
  return {
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'sensor',
        templateId: 'tpl_exact_i2c_ic',
        name: 'I2C Sensor',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
  };
}

function directPowerGroundShort(): GoldenCircuitFixture {
  return {
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'short',
        templateId: 'tpl_short_link',
        name: 'Direct Short',
        assignedPins: { VCC_IN: '5V', GND_IN: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'short',
        { ownerType: 'component', ownerId: 'short', pinId: 'VCC_IN' },
        { ownerType: 'component', ownerId: 'short', pinId: 'GND_IN' }
      ),
    ],
  };
}

function genericI2cModulePullupUnknown(): GoldenCircuitFixture {
  return {
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'module',
        templateId: 'tpl_generic_i2c_module',
        name: 'Generic I2C Module',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
  };
}

function opAmpAdcOverrange(): GoldenCircuitFixture {
  return {
    boardId: 'esp32',
    components: [
      makeComponent({
        instanceId: 'op',
        templateId: 'tpl_general_op_amp',
        name: 'ADC Driver',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '3.3V', OUT: 'G25' },
      }),
      makeComponent({
        instanceId: 'rfb',
        templateId: 'tpl_resistor',
        name: 'R_FB',
        value: '100k',
      }),
      makeComponent({
        instanceId: 'rg',
        templateId: 'tpl_resistor',
        name: 'R_G',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'out-fb',
        { ownerType: 'component', ownerId: 'op', pinId: 'OUT' },
        { ownerType: 'component', ownerId: 'rfb', pinId: '1' }
      ),
      makeManualConnection(
        'fb-inv',
        { ownerType: 'component', ownerId: 'rfb', pinId: '2' },
        { ownerType: 'component', ownerId: 'op', pinId: 'IN-' }
      ),
      makeManualConnection(
        'g-inv',
        { ownerType: 'component', ownerId: 'rg', pinId: '1' },
        { ownerType: 'component', ownerId: 'op', pinId: 'IN-' }
      ),
    ],
  };
}

export const BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES: Record<string, () => GoldenCircuitFixture> = {
  'healthy-i2c-with-explicit-pullups-01': healthyI2cWithPullups,
  'exact-i2c-missing-pullups-01': exactI2cMissingPullups,
  'direct-power-ground-short-01': directPowerGroundShort,
  'generic-i2c-module-pullup-unknown-01': genericI2cModulePullupUnknown,
  'opamp-adc-overrange-01': opAmpAdcOverrange,
};

export function runBetaValidationGoldenSample(sampleId: string): CircuitAnalysisReport {
  const buildFixture = BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES[sampleId];
  if (!buildFixture) {
    throw new Error(`Unknown beta validation golden sample: ${sampleId}`);
  }

  const fixture = buildFixture();
  return analyzeCircuitNetlist(
    fixture.components,
    fixture.boardId,
    resolveGoldenTemplate,
    fixture.manualConnections ?? []
  );
}
