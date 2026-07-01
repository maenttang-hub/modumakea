import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import type { CircuitAnalysisReport } from '@/lib/circuit-netlist';
import { auditProjectDesign } from '@/lib/datasheet-rules';
import { runProjectDrc } from '@/lib/drc-engine';
import { buildImportFailureReport, type ImportFailureReport } from '@/lib/import-failure-report';
import type { ComponentTemplate, ManualNetConnection, PlacedComponent, ProjectAuditIssue, ProjectPowerInputMode } from '@/types';
import { makeComponent, makeManualConnection, makeTemplate } from '../test-fixtures.ts';

type GoldenAnalysisFixture = {
  kind: 'analysis';
  runner?: 'netlist' | 'drc' | 'audit';
  boardId: string;
  components: PlacedComponent[];
  manualConnections?: ManualNetConnection[];
  powerInputMode?: ProjectPowerInputMode;
};

type GoldenImportFailureFixture = {
  kind: 'import-failure';
  fileName: string;
  fileSizeBytes: number;
};

type GoldenSampleFixture = GoldenAnalysisFixture | GoldenImportFailureFixture;

export type BetaValidationGoldenSampleResult =
  | {
      kind: 'analysis';
      issues: Array<Pick<ProjectAuditIssue, 'ruleId' | 'code' | 'severity' | 'confidence'>>;
    }
  | {
      kind: 'import-failure';
      issues: [];
      failure: ImportFailureReport;
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

const customFallbackI2cTemplate = makeTemplate({
  id: 'tpl_custom_fallback_i2c_module',
  name: 'Custom Fallback I2C Module',
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
    { name: '1', allowedTypes: ['POWER', 'DIGITAL', 'ANALOG', 'PWM'], allowBoardRails: true },
    { name: '2', allowedTypes: ['POWER', 'DIGITAL', 'ANALOG', 'PWM'], allowBoardRails: true },
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

const ledTemplate = makeTemplate({
  id: 'tpl_led',
  name: 'LED',
  category: 'ACTUATOR',
  pins: [
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'Signal', allowedTypes: ['DIGITAL', 'PWM'] },
  ],
});

const probeTemplate = makeTemplate({
  id: 'tpl_probe_sensor',
  name: 'Probe Sensor',
  category: 'SENSOR',
  pins: [
    { name: 'AOut', allowedTypes: ['ANALOG'] },
  ],
});

const bluetoothTemplate = makeTemplate({
  id: 'tpl_bluetooth_hc05_virtual',
  name: 'Bluetooth Module',
  category: 'COMMUNICATION',
  compatibleVoltage: '5V',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'TX', allowedTypes: ['DIGITAL'] },
    { name: 'RX', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const levelShifterTemplate = makeTemplate({
  id: 'tpl_level_shifter_virtual',
  name: 'BSS138 Level Shifter',
  category: 'PASSIVE',
  compatibleVoltage: 'BOTH',
  pins: [
    { name: 'HV', allowedTypes: ['POWER'] },
    { name: 'LV', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'HV1', allowedTypes: ['DIGITAL'] },
    { name: 'LV1', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
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
  tpl_custom_fallback_i2c_module: customFallbackI2cTemplate,
  tpl_resistor: resistorTemplate,
  tpl_short_link: shortLinkTemplate,
  tpl_led: ledTemplate,
  tpl_probe_sensor: probeTemplate,
  tpl_bluetooth_hc05_virtual: bluetoothTemplate,
  tpl_level_shifter_virtual: levelShifterTemplate,
  tpl_general_op_amp: generalOpAmpTemplate,
};

function resolveGoldenTemplate(templateId: string) {
  return templates[templateId] ?? getStaticTemplateById(templateId);
}

function healthyI2cWithPullups(): GoldenSampleFixture {
  return {
    kind: 'analysis',
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
      makeManualConnection('sda-pullup', { ownerType: 'component', ownerId: 'r-sda', pinId: '2' }, { ownerType: 'component', ownerId: 'sensor', pinId: 'SDA' }),
      makeManualConnection('scl-pullup', { ownerType: 'component', ownerId: 'r-scl', pinId: '2' }, { ownerType: 'component', ownerId: 'sensor', pinId: 'SCL' }),
    ],
  };
}

function exactI2cMissingPullups(): GoldenSampleFixture {
  return {
    kind: 'analysis',
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

function directPowerGroundShort(): GoldenSampleFixture {
  return {
    kind: 'analysis',
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
      makeManualConnection('short', { ownerType: 'component', ownerId: 'short', pinId: 'VCC_IN' }, { ownerType: 'component', ownerId: 'short', pinId: 'GND_IN' }),
    ],
  };
}

function genericI2cModulePullupUnknown(): GoldenSampleFixture {
  return {
    kind: 'analysis',
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

function opAmpAdcOverrange(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'esp32',
    components: [
      makeComponent({
        instanceId: 'op',
        templateId: 'tpl_general_op_amp',
        name: 'ADC Driver',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '3.3V', OUT: 'G25' },
      }),
      makeComponent({ instanceId: 'rfb', templateId: 'tpl_resistor', name: 'R_FB', value: '100k' }),
      makeComponent({ instanceId: 'rg', templateId: 'tpl_resistor', name: 'R_G', value: '10k', assignedPins: { '2': 'GND' } }),
    ],
    manualConnections: [
      makeManualConnection('out-fb', { ownerType: 'component', ownerId: 'op', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb', pinId: '1' }),
      makeManualConnection('fb-inv', { ownerType: 'component', ownerId: 'rfb', pinId: '2' }, { ownerType: 'component', ownerId: 'op', pinId: 'IN-' }),
      makeManualConnection('g-inv', { ownerType: 'component', ownerId: 'rg', pinId: '1' }, { ownerType: 'component', ownerId: 'op', pinId: 'IN-' }),
    ],
  };
}

function ledMissingSeriesResistor(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'led-direct',
        templateId: 'tpl_led',
        name: 'Direct LED',
        assignedPins: { Signal: '5V', GND: 'GND' },
      }),
    ],
  };
}

function ledWithSeriesResistor(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'r-led',
        templateId: 'tpl_resistor',
        name: 'R_LED',
        value: '220',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'led-ok',
        templateId: 'tpl_led',
        name: 'Status LED',
        assignedPins: { GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection('led-series', { ownerType: 'component', ownerId: 'r-led', pinId: '2' }, { ownerType: 'component', ownerId: 'led-ok', pinId: 'Signal' }),
    ],
  };
}

function hc06DirectRxFromFiveVoltBoard(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    runner: 'drc',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-direct',
        templateId: 'tpl_bluetooth_hc05_virtual',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection('bt-direct-rx', { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }, { ownerType: 'component', ownerId: 'bt-direct', pinId: 'RX' }),
    ],
  };
}

function hc06ThroughLevelShifter(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    runner: 'drc',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-safe',
        templateId: 'tpl_bluetooth_hc05_virtual',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'ls-safe',
        templateId: 'tpl_level_shifter_virtual',
        name: 'BSS138 Level Shifter',
        assignedPins: { HV: '5V', LV: '3.3V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection('bt-safe-hv', { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }, { ownerType: 'component', ownerId: 'ls-safe', pinId: 'HV1' }),
      makeManualConnection('bt-safe-lv', { ownerType: 'component', ownerId: 'bt-safe', pinId: 'RX' }, { ownerType: 'component', ownerId: 'ls-safe', pinId: 'LV1' }),
    ],
  };
}

function opAmpFeedbackMissing(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'op',
        templateId: 'tpl_general_op_amp',
        name: 'U1 General Op-Amp',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'probe',
        templateId: 'tpl_probe_sensor',
        name: 'Probe Source',
        assignedPins: { AOut: 'A0' },
      }),
    ],
    manualConnections: [
      makeManualConnection('op-src-inplus', { ownerType: 'component', ownerId: 'probe', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'op', pinId: 'IN+' }),
      makeManualConnection('op-out-probe', { ownerType: 'component', ownerId: 'op', pinId: 'OUT' }, { ownerType: 'board', ownerId: 'uno', pinId: 'A1' }),
    ],
  };
}

function adcHighImpedanceDivider(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({ instanceId: 'r-top', templateId: 'tpl_resistor', name: 'R Top', value: '1M', assignedPins: { '1': '5V' } }),
      makeComponent({ instanceId: 'r-bottom', templateId: 'tpl_resistor', name: 'R Bottom', value: '1M', assignedPins: { '2': 'GND' } }),
      makeComponent({ instanceId: 'probe', templateId: 'tpl_probe_sensor', name: 'Probe', assignedPins: { AOut: 'A0' } }),
    ],
    manualConnections: [
      makeManualConnection('hi-z-top', { ownerType: 'component', ownerId: 'r-top', pinId: '2' }, { ownerType: 'component', ownerId: 'probe', pinId: 'AOut' }),
      makeManualConnection('hi-z-bottom', { ownerType: 'component', ownerId: 'probe', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' }),
    ],
  };
}

function powerRailLowHeadroom(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    runner: 'audit',
    boardId: 'uno',
    powerInputMode: 'vin-9v',
    components: [
      makeComponent({
        instanceId: 'mq2-low-headroom',
        templateId: 'tpl_gas_mq2',
        name: 'MQ2 Low Headroom',
        assignedPins: { VCC: '5V', GND: 'GND', AOut: 'A0', DOut: 'D2' },
      }),
      makeComponent({
        instanceId: 'bt-low-headroom',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Low Headroom',
        value: 'HC-06',
        assignedPins: { TX: 'D10', RX: 'D11', VCC: '5V', GND: 'GND' },
      }),
    ],
  };
}

function customSymbolConservativeReview(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'custom-module',
        templateId: 'tpl_custom_fallback_i2c_module',
        name: 'Custom I2C Module',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
  };
}

function unsupportedZipImport(): GoldenSampleFixture {
  return {
    kind: 'import-failure',
    fileName: 'client-board.zip',
    fileSizeBytes: 240_000,
  };
}

function healthyAdcDivider(): GoldenSampleFixture {
  return {
    kind: 'analysis',
    boardId: 'uno',
    components: [
      makeComponent({ instanceId: 'r-top-ok', templateId: 'tpl_resistor', name: 'R Top OK', value: '10k', assignedPins: { '1': '5V' } }),
      makeComponent({ instanceId: 'r-bottom-ok', templateId: 'tpl_resistor', name: 'R Bottom OK', value: '10k', assignedPins: { '2': 'GND' } }),
      makeComponent({ instanceId: 'probe-ok', templateId: 'tpl_probe_sensor', name: 'Probe OK', assignedPins: { AOut: 'A0' } }),
    ],
    manualConnections: [
      makeManualConnection('ok-divider-top', { ownerType: 'component', ownerId: 'r-top-ok', pinId: '2' }, { ownerType: 'component', ownerId: 'probe-ok', pinId: 'AOut' }),
      makeManualConnection('ok-divider-bottom', { ownerType: 'component', ownerId: 'probe-ok', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'r-bottom-ok', pinId: '1' }),
    ],
  };
}

export const BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES: Record<string, () => GoldenSampleFixture> = {
  'healthy-i2c-with-explicit-pullups-01': healthyI2cWithPullups,
  'exact-i2c-missing-pullups-01': exactI2cMissingPullups,
  'direct-power-ground-short-01': directPowerGroundShort,
  'generic-i2c-module-pullup-unknown-01': genericI2cModulePullupUnknown,
  'opamp-adc-overrange-01': opAmpAdcOverrange,
  'led-current-limit-missing-01': ledMissingSeriesResistor,
  'led-series-resistor-ok-01': ledWithSeriesResistor,
  'hc06-5v-rx-direct-01': hc06DirectRxFromFiveVoltBoard,
  'hc06-level-shifter-ok-01': hc06ThroughLevelShifter,
  'opamp-feedback-missing-01': opAmpFeedbackMissing,
  'adc-high-impedance-divider-01': adcHighImpedanceDivider,
  'power-rail-low-headroom-01': powerRailLowHeadroom,
  'custom-symbol-conservative-review-01': customSymbolConservativeReview,
  'unsupported-zip-import-01': unsupportedZipImport,
  'healthy-adc-divider-01': healthyAdcDivider,
};

function normalizeIssues(issues: Array<Pick<ProjectAuditIssue, 'ruleId' | 'code' | 'severity' | 'confidence'>>) {
  return issues.map(issue => ({
    ruleId: issue.ruleId,
    code: issue.code,
    severity: issue.severity,
    confidence: issue.confidence,
  }));
}

function runAnalysisFixture(fixture: GoldenAnalysisFixture): CircuitAnalysisReport | { issues: ProjectAuditIssue[] } {
  if (fixture.runner === 'drc') {
    return runProjectDrc({
      boardId: fixture.boardId,
      components: fixture.components,
      manualConnections: fixture.manualConnections ?? [],
      powerInputMode: fixture.powerInputMode,
      resolveTemplate: resolveGoldenTemplate,
    });
  }

  if (fixture.runner === 'audit') {
    return auditProjectDesign(
      fixture.components,
      fixture.boardId,
      resolveGoldenTemplate,
      fixture.powerInputMode
    );
  }

  return analyzeCircuitNetlist(
    fixture.components,
    fixture.boardId,
    resolveGoldenTemplate,
    fixture.manualConnections ?? []
  );
}

export function runBetaValidationGoldenSample(sampleId: string): BetaValidationGoldenSampleResult {
  const buildFixture = BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES[sampleId];
  if (!buildFixture) {
    throw new Error(`Unknown beta validation golden sample: ${sampleId}`);
  }

  const fixture = buildFixture();
  if (fixture.kind === 'import-failure') {
    return {
      kind: 'import-failure',
      issues: [],
      failure: buildImportFailureReport({
        fileName: fixture.fileName,
        fileSizeBytes: fixture.fileSizeBytes,
        fileKind: null,
        stage: 'unsupported',
        language: 'ko',
      }),
    };
  }

  const report = runAnalysisFixture(fixture);
  return {
    kind: 'analysis',
    issues: normalizeIssues(report.issues),
  };
}
