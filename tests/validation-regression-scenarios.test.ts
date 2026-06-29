import assert from 'node:assert/strict';
import test from 'node:test';

import { getTemplateById, getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { auditProjectDesign } from '@/lib/datasheet-rules';
import { runProjectDrc } from '@/lib/drc-engine';
import type { ComponentTemplate } from '@/types';
import { makeComponent, makeManualConnection, makeTemplate } from './test-fixtures.ts';

const probeTemplate = makeTemplate({
  id: 'tpl_probe_sensor',
  name: 'Probe Sensor',
  category: 'SENSOR',
  pins: [{ name: 'AOut', allowedTypes: ['ANALOG'] }],
});

const opAmpBufferTemplate = makeTemplate({
  id: 'tpl_op_amp_buffer',
  name: 'OP-Amp Buffer',
  category: 'IC',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'IN', allowedTypes: ['ANALOG'] },
    { name: 'OUT', allowedTypes: ['ANALOG'] },
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

const highImpedanceSensorTemplate = makeTemplate({
  id: 'tpl_high_impedance_sensor',
  name: 'High Impedance Analog Sensor',
  category: 'SENSOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'AOut', allowedTypes: ['ANALOG'] },
  ],
});

const ads1115Template = makeTemplate({
  id: 'tpl_ads1115',
  name: 'ADS1115',
  category: 'IC',
  pins: [
    { name: 'VDD', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'AIN0', allowedTypes: ['ANALOG'] },
    { name: 'AIN1', allowedTypes: ['ANALOG'] },
    { name: 'AIN2', allowedTypes: ['ANALOG'] },
    { name: 'AIN3', allowedTypes: ['ANALOG'] },
  ],
});

const ads1015Template = makeTemplate({
  id: 'tpl_ads1015',
  name: 'ADS1015',
  category: 'IC',
  pins: [
    { name: 'VDD', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'AIN0', allowedTypes: ['ANALOG'] },
    { name: 'AIN1', allowedTypes: ['ANALOG'] },
    { name: 'AIN2', allowedTypes: ['ANALOG'] },
    { name: 'AIN3', allowedTypes: ['ANALOG'] },
  ],
});

const hx711Template = makeTemplate({
  id: 'tpl_hx711',
  name: 'HX711',
  category: 'IC',
  pins: [
    { name: 'VSUP', allowedTypes: ['POWER'] },
    { name: 'AVDD', allowedTypes: ['POWER'] },
    { name: 'DVDD', allowedTypes: ['POWER'] },
    { name: 'AGND', allowedTypes: ['GND'] },
    { name: 'DGND', allowedTypes: ['GND'] },
    { name: 'INA+', allowedTypes: ['ANALOG'] },
    { name: 'INA-', allowedTypes: ['ANALOG'] },
    { name: 'INB+', allowedTypes: ['ANALOG'] },
    { name: 'INB-', allowedTypes: ['ANALOG'] },
    { name: 'DOUT', allowedTypes: ['DIGITAL'] },
    { name: 'PD_SCK', allowedTypes: ['DIGITAL'] },
  ],
});

const hx711ModuleTemplate = makeTemplate({
  id: 'tpl_hx711_module',
  name: 'HX711 Module',
  category: 'IC',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'E+', allowedTypes: ['POWER', 'ANALOG'] },
    { name: 'E-', allowedTypes: ['GND', 'ANALOG'] },
    { name: 'A+', allowedTypes: ['ANALOG'] },
    { name: 'A-', allowedTypes: ['ANALOG'] },
    { name: 'B+', allowedTypes: ['ANALOG'] },
    { name: 'B-', allowedTypes: ['ANALOG'] },
    { name: 'DOUT', allowedTypes: ['DIGITAL'] },
    { name: 'SCK', allowedTypes: ['DIGITAL'] },
  ],
});

const loadCellTemplate = makeTemplate({
  id: 'tpl_load_cell',
  name: 'Load Cell Bridge',
  category: 'SENSOR',
  pins: [
    { name: 'E+', allowedTypes: ['POWER', 'ANALOG'] },
    { name: 'E-', allowedTypes: ['GND', 'ANALOG'] },
    { name: 'S+', allowedTypes: ['POWER', 'ANALOG'] },
    { name: 'S-', allowedTypes: ['GND', 'ANALOG'] },
    { name: 'SIG+', allowedTypes: ['ANALOG'] },
    { name: 'SIG-', allowedTypes: ['ANALOG'] },
  ],
});

const mcp3208Template = makeTemplate({
  id: 'tpl_mcp3208',
  name: 'MCP3208',
  category: 'IC',
  pins: [
    { name: 'VDD', allowedTypes: ['POWER'] },
    { name: 'VREF', allowedTypes: ['POWER'] },
    { name: 'AGND', allowedTypes: ['GND'] },
    { name: 'DGND', allowedTypes: ['GND'] },
    { name: 'CH0', allowedTypes: ['ANALOG'] },
    { name: 'CH1', allowedTypes: ['ANALOG'] },
    { name: 'CH2', allowedTypes: ['ANALOG'] },
    { name: 'CH3', allowedTypes: ['ANALOG'] },
    { name: 'CH4', allowedTypes: ['ANALOG'] },
    { name: 'CH5', allowedTypes: ['ANALOG'] },
    { name: 'CH6', allowedTypes: ['ANALOG'] },
    { name: 'CH7', allowedTypes: ['ANALOG'] },
  ],
});

const bootMcuTemplate = makeTemplate({
  id: 'tpl_boot_mcu',
  name: 'Boot MCU',
  category: 'COMMUNICATION',
  pins: [
    { name: 'GPIO0', allowedTypes: ['DIGITAL'] },
    { name: 'EN', allowedTypes: ['DIGITAL'] },
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

function template(id: string): ComponentTemplate {
  const resolved = getTemplateById(id);
  assert.ok(resolved, `expected template ${id}`);
  return resolved;
}

function staticTemplate(id: string): ComponentTemplate {
  const resolved = getStaticTemplateById(id);
  assert.ok(resolved, `expected static template ${id}`);
  return resolved;
}

function resolveRegressionTemplate(templateId: string): ComponentTemplate | undefined {
  return ({
    tpl_probe_sensor: probeTemplate,
    tpl_op_amp_buffer: opAmpBufferTemplate,
    tpl_short_link: shortLinkTemplate,
    tpl_general_op_amp: generalOpAmpTemplate,
    tpl_high_impedance_sensor: highImpedanceSensorTemplate,
    tpl_ads1115: ads1115Template,
    tpl_ads1015: ads1015Template,
    tpl_hx711: hx711Template,
    tpl_hx711_module: hx711ModuleTemplate,
    tpl_load_cell: loadCellTemplate,
    tpl_mcp3208: mcp3208Template,
    tpl_boot_mcu: bootMcuTemplate,
  })[templateId] ?? getTemplateById(templateId);
}

function hasRule(
  issues: Array<{ ruleId?: string; code?: string; message?: string }>,
  ruleId: string,
  code?: string,
): boolean {
  return issues.some(issue => issue.ruleId === ruleId && (code ? issue.code === code : true));
}

test('regression sample: dual OLED I2C bus without pull-ups stays flagged', () => {
  const oledTemplate = staticTemplate('tpl_oled');

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'oled-a',
        templateId: 'tpl_oled',
        name: 'OLED A',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'oled-b',
        templateId: 'tpl_oled',
        name: 'OLED B',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_oled: oledTemplate })[templateId],
    'usb-5v',
  );

  assert.ok(hasRule(report.issues, 'bus.i2c-pullup-missing'));
});

test('regression sample: dual OLED I2C bus with pull-ups clears the generic bus warning', () => {
  const oledTemplate = staticTemplate('tpl_oled');
  const resistorTemplate = staticTemplate('tpl_resistor');

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'oled-a',
        templateId: 'tpl_oled',
        name: 'OLED A',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'oled-b',
        templateId: 'tpl_oled',
        name: 'OLED B',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'r-sda',
        templateId: 'tpl_resistor',
        name: 'I2C SDA Pull-up',
        value: '4.7k',
      }),
      makeComponent({
        instanceId: 'r-scl',
        templateId: 'tpl_resistor',
        name: 'I2C SCL Pull-up',
        value: '4.7k',
      }),
    ],
    'uno',
    templateId => ({ tpl_oled: oledTemplate, tpl_resistor: resistorTemplate })[templateId],
    'usb-5v',
  );

  assert.equal(hasRule(report.issues, 'bus.i2c-pullup-missing'), false);
});

test('regression sample: mixed sensor audit still catches BME280 and DS18B20 support-part gaps', () => {
  const bme280Template = staticTemplate('tpl_bme280');
  const bluetoothTemplate = staticTemplate('tpl_bluetooth_hc05');
  const ds18b20Template = staticTemplate('tpl_ds18b20');

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'env-1',
        templateId: 'tpl_bme280',
        name: 'BME280 Env',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '3.3V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'temp-1',
        templateId: 'tpl_ds18b20',
        name: 'DS18B20 Temp',
        assignedPins: { Data: 'D2', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'bt-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Link',
        value: 'HC-06',
        assignedPins: { TX: 'D10', RX: 'D11', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({
      tpl_bme280: bme280Template,
      tpl_ds18b20: ds18b20Template,
      tpl_bluetooth_hc05: bluetoothTemplate,
    })[templateId],
    'usb-5v',
  );

  assert.ok(hasRule(report.issues, 'part-master.decoupling-missing'));
  assert.ok(hasRule(report.issues, 'part-master.bias-resistor-missing'));
});

test('regression sample: explicit low-power modes still reduce the 5V rail budget', () => {
  const oledTemplate = staticTemplate('tpl_oled');
  const bluetoothTemplate = staticTemplate('tpl_bluetooth_hc05');

  const components = [
    makeComponent({
      instanceId: 'oled-mode-1',
      templateId: 'tpl_oled',
      name: 'OLED Display',
      assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'bt-mode-1',
      templateId: 'tpl_bluetooth_hc05',
      name: 'HC-06 Link',
      value: 'HC-06',
      assignedPins: { TX: 'D10', RX: 'D11', VCC: '5V', GND: 'GND' },
    }),
  ];

  const resolveTemplate = (templateId: string) =>
    ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothTemplate })[templateId];

  const defaultReport = auditProjectDesign(components, 'uno', resolveTemplate, 'usb-5v');
  const lowPowerReport = auditProjectDesign(components, 'uno', resolveTemplate, 'usb-5v', {
    'oled-mode-1': 'sleep',
    'bt-mode-1': 'idle-unpaired',
  });

  const default5v = defaultReport.powerReport.rails.find(rail => rail.rail === '5V');
  const lowPower5v = lowPowerReport.powerReport.rails.find(rail => rail.rail === '5V');
  assert.ok(default5v);
  assert.ok(lowPower5v);
  assert.ok((lowPower5v?.usedMa ?? 0) < (default5v?.usedMa ?? 0));
});

test('regression sample: HC-06 direct 5V RX path remains flagged as a signal-level mismatch', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-risk-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Risk',
        value: 'HC-06',
        assignedPins: { TX: 'D3', RX: 'D2', VCC: '5V', GND: 'GND' },
      }),
    ],
    resolveTemplate: resolveRegressionTemplate,
  });

  assert.ok(hasRule(report.issues, 'part-master.signal-level-mismatch', 'part-master.signal-level-mismatch'));
});

test('regression sample: HC-06 on the wrong level-shifter side stays flagged', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Link',
        value: 'HC-06',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'ls-1',
        templateId: 'tpl_level_shifter',
        name: 'BSS138 Level Shifter',
        assignedPins: { HV: '5V', LV: '3.3V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'uno-to-lv',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-1', pinId: 'LV1' },
      ),
      makeManualConnection(
        'bt-rx-to-hv',
        { ownerType: 'component', ownerId: 'bt-1', pinId: 'RX' },
        { ownerType: 'component', ownerId: 'ls-1', pinId: 'HV1' },
      ),
    ],
    resolveTemplate: resolveRegressionTemplate,
  });

  assert.ok(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.level-shifter-side-mismatch'));
});

test('regression sample: HC-06 on the matched level-shifter channel clears path warnings', () => {
  const bluetoothTemplate = makeTemplate({
    id: 'tpl_bluetooth_hc05',
    name: 'Bluetooth Module',
    category: 'COMMUNICATION',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'TX', allowedTypes: ['DIGITAL'] },
      { name: 'RX', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: '5V',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const levelShifterTemplate = makeTemplate({
    id: 'tpl_level_shifter_custom',
    name: 'Level Shifter',
    category: 'PASSIVE',
    pins: [
      { name: 'HV', allowedTypes: ['POWER'] },
      { name: 'LV', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'HV1', allowedTypes: ['DIGITAL'] },
      { name: 'LV1', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: 'BOTH',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-ok',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'ls-ok',
        templateId: 'tpl_level_shifter_custom',
        name: 'BSS138 Level Shifter',
        assignedPins: { HV: '5V', LV: '3.3V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection('bt-ok-hv', { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }, { ownerType: 'component', ownerId: 'ls-ok', pinId: 'HV1' }),
      makeManualConnection('bt-ok-lv', { ownerType: 'component', ownerId: 'bt-ok', pinId: 'RX' }, { ownerType: 'component', ownerId: 'ls-ok', pinId: 'LV1' }),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bluetooth_hc05: bluetoothTemplate, tpl_level_shifter_custom: levelShifterTemplate })[templateId] ??
      resolveRegressionTemplate(templateId),
  });

  assert.equal(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.level-shifter-side-mismatch'), false);
  assert.equal(hasRule(report.issues, 'part-master.level-shifter-path-incomplete', 'part-master.level-shifter-path-incomplete'), false);
});

test('regression sample: HC-06 on a different level-shifter channel stays flagged as incomplete path', () => {
  const bluetoothTemplate = makeTemplate({
    id: 'tpl_bluetooth_hc05',
    name: 'Bluetooth Module',
    category: 'COMMUNICATION',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'TX', allowedTypes: ['DIGITAL'] },
      { name: 'RX', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: '5V',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const twoChannelLevelShifterTemplate = makeTemplate({
    id: 'tpl_level_shifter_2ch',
    name: 'Level Shifter 2ch',
    category: 'PASSIVE',
    pins: [
      { name: 'HV', allowedTypes: ['POWER'] },
      { name: 'LV', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'HV1', allowedTypes: ['DIGITAL'] },
      { name: 'LV1', allowedTypes: ['DIGITAL'] },
      { name: 'HV2', allowedTypes: ['DIGITAL'] },
      { name: 'LV2', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: 'BOTH',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-path',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'ls-path',
        templateId: 'tpl_level_shifter_2ch',
        name: 'BSS138 Level Shifter 2ch',
        assignedPins: { HV: '5V', LV: '3.3V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection('bt-path-hv2', { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }, { ownerType: 'component', ownerId: 'ls-path', pinId: 'HV2' }),
      makeManualConnection('bt-path-lv1', { ownerType: 'component', ownerId: 'bt-path', pinId: 'RX' }, { ownerType: 'component', ownerId: 'ls-path', pinId: 'LV1' }),
    ],
    resolveTemplate: templateId =>
      templateId === 'tpl_bluetooth_hc05'
        ? bluetoothTemplate
        : templateId === 'tpl_level_shifter_2ch'
          ? twoChannelLevelShifterTemplate
          : resolveRegressionTemplate(templateId),
  });

  assert.ok(hasRule(report.issues, 'part-master.level-shifter-path-incomplete', 'part-master.level-shifter-path-incomplete'));
});

test('regression sample: floating BME280 SDO strap remains flagged', () => {
  const bmeTemplate = makeTemplate({
    id: 'tpl_bme280_custom',
    name: 'BME280 Sensor',
    category: 'SENSOR',
    compatibleVoltage: '3.3V',
    pins: [
      { name: 'VDD', allowedTypes: ['POWER'] },
      { name: 'VDDIO', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SCL', allowedTypes: ['DIGITAL'] },
      { name: 'SDA', allowedTypes: ['DIGITAL'] },
      { name: 'SDO', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: { VDD: '3.3V', VDDIO: '3.3V', GND: 'GND', SCL: 'A5', SDA: 'A4' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'bme-sdo-floating',
        { ownerType: 'component', ownerId: 'bme-1', pinId: 'SDO' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
      ),
    ],
    resolveTemplate: templateId => ({ tpl_bme280_custom: bmeTemplate })[templateId],
  });

  assert.ok(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.strap-bias-missing'));
});

test('regression sample: grounded BME280 SDO strap clears the strap-bias issue', () => {
  const bmeTemplate = makeTemplate({
    id: 'tpl_bme280_custom',
    name: 'BME280 Sensor',
    category: 'SENSOR',
    compatibleVoltage: '3.3V',
    pins: [
      { name: 'VDD', allowedTypes: ['POWER'] },
      { name: 'VDDIO', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SCL', allowedTypes: ['DIGITAL'] },
      { name: 'SDA', allowedTypes: ['DIGITAL'] },
      { name: 'SDO', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: { VDD: '3.3V', VDDIO: '3.3V', GND: 'GND', SCL: 'A5', SDA: 'A4' },
      }),
      makeComponent({
        instanceId: 'r-addr',
        templateId: 'tpl_resistor',
        name: 'R_ADDR',
        value: '10k',
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'bme-sdo-r1',
        { ownerType: 'component', ownerId: 'bme-1', pinId: 'SDO' },
        { ownerType: 'component', ownerId: 'r-addr', pinId: '1' },
      ),
      makeManualConnection(
        'bme-sdo-r2',
        { ownerType: 'component', ownerId: 'r-addr', pinId: '2' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'GND' },
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bme280_custom: bmeTemplate })[templateId] ?? resolveRegressionTemplate(templateId),
  });

  assert.equal(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.strap-bias-missing'), false);
});

test('regression sample: unresolved boot straps stay visible in project DRC', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-1',
        templateId: 'tpl_boot_mcu',
        name: 'ESP32 Core',
        assignedPins: { VCC: '3.3V', GND: 'GND' },
      }),
    ],
    resolveTemplate: resolveRegressionTemplate,
  });

  assert.ok(hasRule(report.issues, 'mcu.boot-strap-audit'));
});

test('regression sample: high-impedance divider direct to ADC stays flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'r-top',
        templateId: 'tpl_resistor',
        name: 'R Top',
        value: '1M',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'r-bottom',
        templateId: 'tpl_resistor',
        name: 'R Bottom',
        value: '1M',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-1',
        templateId: 'tpl_probe_sensor',
        name: 'Probe 1',
        assignedPins: { AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'conn-hi-z-1',
        { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
        { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      ),
      makeManualConnection(
        'conn-hi-z-2',
        { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
        { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' },
      ),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.adc-source-impedance-high'));
});

test('regression sample: buffered divider still clears the high-impedance ADC warning', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'r-top-buf',
        templateId: 'tpl_resistor',
        name: 'R Top Buf',
        value: '1M',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'r-bottom-buf',
        templateId: 'tpl_resistor',
        name: 'R Bottom Buf',
        value: '1M',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'buf-1',
        templateId: 'tpl_op_amp_buffer',
        name: 'Buffer 1',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-3',
        templateId: 'tpl_probe_sensor',
        name: 'Probe 3',
        assignedPins: { AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'conn-buf-1',
        { ownerType: 'component', ownerId: 'r-top-buf', pinId: '2' },
        { ownerType: 'component', ownerId: 'r-bottom-buf', pinId: '1' },
      ),
      makeManualConnection(
        'conn-buf-2',
        { ownerType: 'component', ownerId: 'r-top-buf', pinId: '2' },
        { ownerType: 'component', ownerId: 'buf-1', pinId: 'IN' },
      ),
      makeManualConnection(
        'conn-buf-3',
        { ownerType: 'component', ownerId: 'buf-1', pinId: 'OUT' },
        { ownerType: 'component', ownerId: 'probe-3', pinId: 'AOut' },
      ),
    ],
  );

  assert.equal(hasRule(result.issues, 'netlist.adc-source-impedance-high'), false);
});

test('regression sample: fast 3.3V ADC inputs still review settling on high-impedance dividers', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'r-top-esp',
        templateId: 'tpl_resistor',
        name: 'R Top ESP',
        value: '100k',
        assignedPins: { '1': '3.3V' },
      }),
      makeComponent({
        instanceId: 'r-bottom-esp',
        templateId: 'tpl_resistor',
        name: 'R Bottom ESP',
        value: '100k',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-esp',
        templateId: 'tpl_probe_sensor',
        name: 'ESP32 ADC Probe',
        assignedPins: { AOut: 'G34' },
      }),
    ],
    'esp32',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'conn-esp-1',
        { ownerType: 'component', ownerId: 'r-top-esp', pinId: '2' },
        { ownerType: 'component', ownerId: 'probe-esp', pinId: 'AOut' },
      ),
      makeManualConnection(
        'conn-esp-2',
        { ownerType: 'component', ownerId: 'probe-esp', pinId: 'AOut' },
        { ownerType: 'component', ownerId: 'r-bottom-esp', pinId: '1' },
      ),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.adc-sampling-settling-review'));
});

test('regression sample: buffer-sensitive analog sensor modules still review direct ADC hookups', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'ph-1',
        templateId: 'tpl_high_impedance_sensor',
        name: 'Gravity pH Sensor',
        value: 'SEN0161',
        assignedPins: { VCC: '5V', GND: 'GND', AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [],
  );

  assert.ok(hasRule(result.issues, 'netlist.sensor-output-buffer-review'));
});

test('regression sample: TDS-style analog modules also keep buffer review on direct ADC hookups', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'tds-1',
        templateId: 'tpl_high_impedance_sensor',
        name: 'Gravity TDS Sensor',
        value: 'SEN0244',
        assignedPins: { VCC: '5V', GND: 'GND', AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [],
  );

  assert.ok(hasRule(result.issues, 'netlist.sensor-output-buffer-review'));
});

test('regression sample: ADS1115 inputs behave as external ADC sinks in settling review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'ads-1',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 Breakout',
        value: 'ADS1115',
        assignedPins: { VDD: '3.3V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'r-top-ads',
        templateId: 'tpl_resistor',
        name: 'R_TOP_ADS',
        value: '470k',
        assignedPins: { '1': '3.3V' },
      }),
      makeComponent({
        instanceId: 'r-bottom-ads',
        templateId: 'tpl_resistor',
        name: 'R_BOTTOM_ADS',
        value: '470k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('ads-r-top', { ownerType: 'component', ownerId: 'r-top-ads', pinId: '2' }, { ownerType: 'component', ownerId: 'ads-1', pinId: 'AIN0' }),
      makeManualConnection('ads-r-bot', { ownerType: 'component', ownerId: 'ads-1', pinId: 'AIN0' }, { ownerType: 'component', ownerId: 'r-bottom-ads', pinId: '1' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.adc-sampling-settling-review'));
});

test('regression sample: slow ADS1x15 data rate relaxes settling review on the same divider', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'ads-slow-reg',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 Slow Regression',
        value: 'ADS1115',
        assignedPins: { VDD: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'r-top-ads-slow-reg',
        templateId: 'tpl_resistor',
        name: 'R_TOP_ADS_SLOW_REG',
        value: '220k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'r-bottom-ads-slow-reg',
        templateId: 'tpl_resistor',
        name: 'R_BOTTOM_ADS_SLOW_REG',
        value: '220k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('ads-slow-reg-top', { ownerType: 'component', ownerId: 'r-top-ads-slow-reg', pinId: '2' }, { ownerType: 'component', ownerId: 'ads-slow-reg', pinId: 'AIN0' }),
      makeManualConnection('ads-slow-reg-bot', { ownerType: 'component', ownerId: 'ads-slow-reg', pinId: 'AIN0' }, { ownerType: 'component', ownerId: 'r-bottom-ads-slow-reg', pinId: '1' }),
    ],
    {
      adcConfigurations: {
        'ads-slow-reg': {
          ads1x15: {
            dataRateSps: 8,
          },
        },
      },
    }
  );

  assert.equal(hasRule(result.issues, 'netlist.adc-sampling-settling-review'), false);
});

test('regression sample: ADS1x15 differential pair usage is visible when both inputs share one source', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'adsdiff-1',
        templateId: 'tpl_ads1015',
        name: 'ADS1015 Diff ADC',
        value: 'ADS1015',
        assignedPins: { VDD: '3.3V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'load-diff-1',
        templateId: 'tpl_load_cell',
        name: '4-Wire Load Cell',
        assignedPins: { 'E+': '3.3V', 'E-': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('adsdiff-plus', { ownerType: 'component', ownerId: 'load-diff-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'adsdiff-1', pinId: 'AIN0' }),
      makeManualConnection('adsdiff-minus', { ownerType: 'component', ownerId: 'load-diff-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'adsdiff-1', pinId: 'AIN1' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.ads1x15-differential-pair-review'));
});

test('regression sample: ADS1x15 still reviews full-scale and common-mode overreach', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'ads-range-fs',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 Fullscale Check',
        value: 'ADS1115',
        assignedPins: { VDD: '3.3V', GND: 'GND', AIN0: '5V', AIN1: 'GND' },
      }),
      makeComponent({
        instanceId: 'ads-range-cm',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 CommonMode Check',
        value: 'ADS1115',
        assignedPins: { VDD: '3.3V', GND: 'GND', AIN0: '5V', AIN1: '5V' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [],
  );

  assert.ok(hasRule(result.issues, 'netlist.ads1x15-fullscale-review'));
  assert.ok(hasRule(result.issues, 'netlist.ads1x15-common-mode-review'));
});

test('regression sample: configured ADS1x15 PGA full-scale suppresses conservative overrange warning', () => {
  const result = analyzeCircuitNetlist(
    [
      {
        ...makeComponent({
          instanceId: 'ads-reg-config',
          templateId: 'tpl_ads1115',
          name: 'ADS1115 PGA Configured',
          value: 'ADS1115',
          assignedPins: { VDD: '5V', GND: 'GND', AIN0: '5V', AIN1: 'GND' },
        }),
      },
    ],
    'uno',
    resolveRegressionTemplate,
    [],
    {
      adcConfigurations: {
        'ads-reg-config': {
          ads1x15: {
            pgaFullScaleV: 6.144,
          },
        },
      },
    }
  );

  assert.equal(hasRule(result.issues, 'netlist.ads1x15-fullscale-review'), false);
});

test('regression sample: ADS1x15 configured PGA and data rate expose tradeoff hints', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'ads-tradeoff-reg',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 Tradeoff Regression',
        value: 'ADS1115',
        assignedPins: { VDD: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [],
    {
      adcConfigurations: {
        'ads-tradeoff-reg': {
          ads1x15: {
            pgaFullScaleV: 0.256,
            dataRateSps: 860,
          },
        },
      },
    }
  );

  assert.ok(hasRule(result.issues, 'netlist.ads1x15-noise-bandwidth-review'));
});

test('regression sample: op-amp stage without feedback remains flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-1',
        templateId: 'tpl_general_op_amp',
        name: 'U1 General Op-Amp',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-op-1',
        templateId: 'tpl_probe_sensor',
        name: 'Probe Source',
        assignedPins: { AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'op-src-inplus',
        { ownerType: 'component', ownerId: 'probe-op-1', pinId: 'AOut' },
        { ownerType: 'component', ownerId: 'op-1', pinId: 'IN+' },
      ),
      makeManualConnection(
        'op-out-probe',
        { ownerType: 'component', ownerId: 'op-1', pinId: 'OUT' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'A1' },
      ),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-feedback-missing'));
});

test('regression sample: AC-coupled op-amp without midpoint bias remains flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-2',
        templateId: 'tpl_general_op_amp',
        name: 'U2 Mic Preamp',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({ instanceId: 'src-2', templateId: 'tpl_probe_sensor', name: 'Mic Source' }),
      makeComponent({ instanceId: 'c-in-2', templateId: 'tpl_capacitor', name: 'C_IN', value: '0.1uF' }),
      makeComponent({ instanceId: 'rfb-2', templateId: 'tpl_resistor', name: 'R_FB', value: '47k' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('src-cap', { ownerType: 'component', ownerId: 'src-2', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-2', pinId: '1' }),
      makeManualConnection('cap-inplus', { ownerType: 'component', ownerId: 'c-in-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-2', pinId: 'IN+' }),
      makeManualConnection('out-fb', { ownerType: 'component', ownerId: 'op-2', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-2', pinId: '1' }),
      makeManualConnection('fb-inminus', { ownerType: 'component', ownerId: 'rfb-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-2', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.analog-bias-midpoint-missing'));
});

test('regression sample: midpoint without bypass capacitor remains flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-3',
        templateId: 'tpl_general_op_amp',
        name: 'U3 Mic Preamp',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({ instanceId: 'src-3', templateId: 'tpl_probe_sensor', name: 'Mic Source' }),
      makeComponent({ instanceId: 'c-in-3', templateId: 'tpl_capacitor', name: 'C_IN', value: '0.1uF' }),
      makeComponent({ instanceId: 'rfb-3', templateId: 'tpl_resistor', name: 'R_FB', value: '47k' }),
      makeComponent({
        instanceId: 'rbias-top-3',
        templateId: 'tpl_resistor',
        name: 'R_BIAS_TOP',
        value: '100k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'rbias-bot-3',
        templateId: 'tpl_resistor',
        name: 'R_BIAS_BOT',
        value: '100k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('src3-cap', { ownerType: 'component', ownerId: 'src-3', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-3', pinId: '1' }),
      makeManualConnection('cap3-inplus', { ownerType: 'component', ownerId: 'c-in-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
      makeManualConnection('out3-fb', { ownerType: 'component', ownerId: 'op-3', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-3', pinId: '1' }),
      makeManualConnection('fb3-inminus', { ownerType: 'component', ownerId: 'rfb-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN-' }),
      makeManualConnection('bias-top', { ownerType: 'component', ownerId: 'rbias-top-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
      makeManualConnection('bias-bot', { ownerType: 'component', ownerId: 'rbias-bot-3', pinId: '1' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.virtual-ground-bypass-missing'));
});

test('regression sample: complete mic preamp core still clears feedback and midpoint warnings', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-4',
        templateId: 'tpl_general_op_amp',
        name: 'U4 Mic Preamp',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({ instanceId: 'src-4', templateId: 'tpl_probe_sensor', name: 'Mic Source' }),
      makeComponent({ instanceId: 'c-in-4', templateId: 'tpl_capacitor', name: 'C_IN', value: '0.1uF' }),
      makeComponent({ instanceId: 'rfb-4', templateId: 'tpl_resistor', name: 'R_FB', value: '47k' }),
      makeComponent({
        instanceId: 'rbias-top-4',
        templateId: 'tpl_resistor',
        name: 'R_BIAS_TOP',
        value: '100k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'rbias-bot-4',
        templateId: 'tpl_resistor',
        name: 'R_BIAS_BOT',
        value: '100k',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({ instanceId: 'c-mid-4', templateId: 'tpl_capacitor', name: 'C_MID', value: '1uF' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('src4-cap', { ownerType: 'component', ownerId: 'src-4', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-4', pinId: '1' }),
      makeManualConnection('cap4-inplus', { ownerType: 'component', ownerId: 'c-in-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
      makeManualConnection('out4-fb', { ownerType: 'component', ownerId: 'op-4', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-4', pinId: '1' }),
      makeManualConnection('fb4-inminus', { ownerType: 'component', ownerId: 'rfb-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN-' }),
      makeManualConnection('bias4-top', { ownerType: 'component', ownerId: 'rbias-top-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
      makeManualConnection('bias4-bot', { ownerType: 'component', ownerId: 'rbias-bot-4', pinId: '1' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
      makeManualConnection('midcap4-a', { ownerType: 'component', ownerId: 'c-mid-4', pinId: '1' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
      makeManualConnection('midcap4-b', { ownerType: 'component', ownerId: 'c-mid-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'GND' }),
    ],
  );

  assert.equal(hasRule(result.issues, 'netlist.opamp-feedback-missing'), false);
  assert.equal(hasRule(result.issues, 'netlist.analog-bias-midpoint-missing'), false);
  assert.equal(hasRule(result.issues, 'netlist.virtual-ground-bypass-missing'), false);
});

test('regression sample: inverting stage without input resistor remains flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-inv-1',
        templateId: 'tpl_general_op_amp',
        name: 'U5 Inverting Stage',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': 'GND' },
      }),
      makeComponent({ instanceId: 'src-inv-1', templateId: 'tpl_probe_sensor', name: 'Signal Source' }),
      makeComponent({ instanceId: 'rfb-inv-1', templateId: 'tpl_resistor', name: 'R_FB_INV', value: '47k' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('inv-src-direct', { ownerType: 'component', ownerId: 'src-inv-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'IN-' }),
      makeManualConnection('inv-out-fb', { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-inv-1', pinId: '1' }),
      makeManualConnection('inv-fb-back', { ownerType: 'component', ownerId: 'rfb-inv-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-inverting-input-resistor-missing'));
});

test('regression sample: extreme inverting gain ratio stays under review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-inv-2',
        templateId: 'tpl_general_op_amp',
        name: 'U6 High Gain Stage',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': 'GND' },
      }),
      makeComponent({ instanceId: 'src-inv-2', templateId: 'tpl_probe_sensor', name: 'Signal Source' }),
      makeComponent({ instanceId: 'rfb-inv-2', templateId: 'tpl_resistor', name: 'R_FB_INV', value: '1M' }),
      makeComponent({ instanceId: 'rin-inv-2', templateId: 'tpl_resistor', name: 'R_IN_INV', value: '1k' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('inv2-src-rin', { ownerType: 'component', ownerId: 'src-inv-2', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'rin-inv-2', pinId: '1' }),
      makeManualConnection('inv2-rin-op', { ownerType: 'component', ownerId: 'rin-inv-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'IN-' }),
      makeManualConnection('inv2-out-fb', { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-inv-2', pinId: '1' }),
      makeManualConnection('inv2-fb-op', { ownerType: 'component', ownerId: 'rfb-inv-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-gain-sanity-review'));
});

test('regression sample: upper-rail common-mode headroom review still appears for LM324-like usage', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-head-1',
        templateId: 'tpl_general_op_amp',
        name: 'U7 Signal Conditioner',
        value: 'LM324',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '5V' },
      }),
      makeComponent({ instanceId: 'rfb-head-1', templateId: 'tpl_resistor', name: 'R_FB_HEAD', value: '10k' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('head-out-fb', { ownerType: 'component', ownerId: 'op-head-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-head-1', pinId: '1' }),
      makeManualConnection('head-fb-op', { ownerType: 'component', ownerId: 'rfb-head-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-head-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-common-mode-headroom-review'));
});

test('regression sample: low-GBW high-gain stages still trigger closed-loop bandwidth review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-gbw-1',
        templateId: 'tpl_general_op_amp',
        name: 'U7 High Gain Filter',
        value: 'LM358',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': 'A0' },
      }),
      makeComponent({ instanceId: 'rfb-gbw-1', templateId: 'tpl_resistor', name: 'R_FB_GBW', value: '1M' }),
      makeComponent({
        instanceId: 'rg-gbw-1',
        templateId: 'tpl_resistor',
        name: 'R_G_GBW',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('gbw-out-fb', { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-gbw-1', pinId: '1' }),
      makeManualConnection('gbw-fb-inv', { ownerType: 'component', ownerId: 'rfb-gbw-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'IN-' }),
      makeManualConnection('gbw-g-inv', { ownerType: 'component', ownerId: 'rg-gbw-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-gbw-review'));
});

test('regression sample: non-rail-to-rail outputs still review upper swing headroom', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-headroom-1',
        templateId: 'tpl_general_op_amp',
        name: 'U8 ADC Driver',
        value: 'LM358',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '3.3V', OUT: 'A1' },
      }),
      makeComponent({ instanceId: 'rfb-headroom-1', templateId: 'tpl_resistor', name: 'R_FB_HEADROOM', value: '100k' }),
      makeComponent({
        instanceId: 'rg-headroom-1',
        templateId: 'tpl_resistor',
        name: 'R_G_HEADROOM',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('headroom-out-fb', { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-headroom-1', pinId: '1' }),
      makeManualConnection('headroom-fb-inv', { ownerType: 'component', ownerId: 'rfb-headroom-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'IN-' }),
      makeManualConnection('headroom-g-inv', { ownerType: 'component', ownerId: 'rg-headroom-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-output-headroom-review'));
});

test('regression sample: rail-to-rail op-amps from part_master avoid false headroom reviews near rails', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-r2r-1',
        templateId: 'tpl_general_op_amp',
        name: 'U9 Precision ADC Driver',
        value: 'MCP6002',
        assignedPins: { VCC: '3.3V', GND: 'GND', 'IN+': '3.3V', OUT: 'G25' },
      }),
      makeComponent({ instanceId: 'rfb-r2r-1', templateId: 'tpl_resistor', name: 'R_FB_R2R', value: '100k' }),
      makeComponent({
        instanceId: 'rg-r2r-1',
        templateId: 'tpl_resistor',
        name: 'R_G_R2R',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'esp32',
    resolveRegressionTemplate,
    [
      makeManualConnection('r2r-out-fb', { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-r2r-1', pinId: '1' }),
      makeManualConnection('r2r-fb-inv', { ownerType: 'component', ownerId: 'rfb-r2r-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'IN-' }),
      makeManualConnection('r2r-g-inv', { ownerType: 'component', ownerId: 'rg-r2r-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'IN-' }),
    ],
  );

  assert.equal(hasRule(result.issues, 'netlist.opamp-output-headroom-review'), false);
  assert.equal(hasRule(result.issues, 'netlist.opamp-common-mode-headroom-review'), false);
});

test('regression sample: extreme non-inverting gain ratio stays under review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-ninv-1',
        templateId: 'tpl_general_op_amp',
        name: 'U8 Non-Inverting Stage',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': 'A0' },
      }),
      makeComponent({ instanceId: 'rfb-ninv-1', templateId: 'tpl_resistor', name: 'R_FB_NINV', value: '1M' }),
      makeComponent({
        instanceId: 'rg-ninv-1',
        templateId: 'tpl_resistor',
        name: 'R_G_NINV',
        value: '1k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('ninv-out-fb', { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-ninv-1', pinId: '1' }),
      makeManualConnection('ninv-fb-inv', { ownerType: 'component', ownerId: 'rfb-ninv-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'IN-' }),
      makeManualConnection('ninv-g-inv', { ownerType: 'component', ownerId: 'rg-ninv-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-noninverting-gain-sanity-review'));
});

test('regression sample: megaohm op-amp feedback/input network still triggers bias-current review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-bias-1',
        templateId: 'tpl_general_op_amp',
        name: 'U9 Bias Sensitive Stage',
        value: 'LM358',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
      makeComponent({ instanceId: 'src-bias-1', templateId: 'tpl_probe_sensor', name: 'Signal Source' }),
      makeComponent({ instanceId: 'rin-bias-1', templateId: 'tpl_resistor', name: 'R_IN_BIAS', value: '1M' }),
      makeComponent({ instanceId: 'rfb-bias-1', templateId: 'tpl_resistor', name: 'R_FB_BIAS', value: '1M' }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('bias-src-rin', { ownerType: 'component', ownerId: 'src-bias-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'rin-bias-1', pinId: '1' }),
      makeManualConnection('bias-rin-inv', { ownerType: 'component', ownerId: 'rin-bias-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN-' }),
      makeManualConnection('bias-out-fb', { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-bias-1', pinId: '1' }),
      makeManualConnection('bias-fb-inv', { ownerType: 'component', ownerId: 'rfb-bias-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN-' }),
      makeManualConnection('bias-plus-gnd', { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN+' }, { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-input-bias-current-review'));
});

test('regression sample: op-amp ADC driver over-range review still appears on 3.3V ADC boards', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-adc-1',
        templateId: 'tpl_general_op_amp',
        name: 'U10 ADC Driver',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '3.3V', OUT: 'G25' },
      }),
      makeComponent({ instanceId: 'rfb-adc-1', templateId: 'tpl_resistor', name: 'R_FB_ADC', value: '100k' }),
      makeComponent({
        instanceId: 'rg-adc-1',
        templateId: 'tpl_resistor',
        name: 'R_G_ADC',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'esp32',
    resolveRegressionTemplate,
    [
      makeManualConnection('adc-out-fb', { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '1' }),
      makeManualConnection('adc-fb-inv', { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
      makeManualConnection('adc-g-inv', { ownerType: 'component', ownerId: 'rg-adc-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-output-adc-range-review'));
});

test('regression sample: op-amp ADC driver also respects external ADS1115 full-scale range', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-ads-1',
        templateId: 'tpl_general_op_amp',
        name: 'U_ADS_DRIVER',
        assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '5V' },
      }),
      makeComponent({ instanceId: 'rfb-ads-1', templateId: 'tpl_resistor', name: 'R_FB_ADS', value: '100k' }),
      makeComponent({
        instanceId: 'rg-ads-1',
        templateId: 'tpl_resistor',
        name: 'R_G_ADS',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'ads-2',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 Frontend',
        value: 'ADS1115',
        assignedPins: { VDD: '3.3V', GND: 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('ads-op-out-fb', { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-ads-1', pinId: '1' }),
      makeManualConnection('ads-op-fb-inv', { ownerType: 'component', ownerId: 'rfb-ads-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'IN-' }),
      makeManualConnection('ads-op-rg-inv', { ownerType: 'component', ownerId: 'rg-ads-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'IN-' }),
      makeManualConnection('ads-op-out-adc', { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'ads-2', pinId: 'AIN0' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.opamp-output-adc-range-review'));
});

test('regression sample: MCP3208 channels also behave as external ADC sinks', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'mcp-1',
        templateId: 'tpl_mcp3208',
        name: 'MCP3208 ADC',
        value: 'MCP3208',
        assignedPins: { VDD: '5V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
      }),
      makeComponent({
        instanceId: 'r-top-mcp',
        templateId: 'tpl_resistor',
        name: 'R_TOP_MCP',
        value: '220k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'r-bottom-mcp',
        templateId: 'tpl_resistor',
        name: 'R_BOTTOM_MCP',
        value: '220k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('mcp-r-top', { ownerType: 'component', ownerId: 'r-top-mcp', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-1', pinId: 'CH0' }),
      makeManualConnection('mcp-r-bot', { ownerType: 'component', ownerId: 'mcp-1', pinId: 'CH0' }, { ownerType: 'component', ownerId: 'r-bottom-mcp', pinId: '1' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.adc-sampling-settling-review'));
});

test('regression sample: MCP3208 still reviews VREF over-VDD and missing bypass', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'mcp-vref-1',
        templateId: 'tpl_mcp3208',
        name: 'MCP3208 VREF Check',
        value: 'MCP3208',
        assignedPins: { VDD: '3.3V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [],
  );

  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-over-vdd'));
  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-bypass-review'));
});

test('regression sample: MCP3208 still distinguishes pseudo-differential and single-ended usage', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'mcp-mode-1',
        templateId: 'tpl_mcp3208',
        name: 'MCP3208 Mode Check',
        value: 'MCP3208',
        assignedPins: { VDD: '5V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
      }),
      makeComponent({
        instanceId: 'load-mcp-1',
        templateId: 'tpl_load_cell',
        name: 'Diff Source',
        assignedPins: { 'E+': '5V', 'E-': 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-mcp-1',
        templateId: 'tpl_probe_sensor',
        name: 'Single Ended Probe',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('mcp-psdiff-plus', { ownerType: 'component', ownerId: 'load-mcp-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH0' }),
      makeManualConnection('mcp-psdiff-minus', { ownerType: 'component', ownerId: 'load-mcp-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH1' }),
      makeManualConnection('mcp-single-plus', { ownerType: 'component', ownerId: 'probe-mcp-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH2' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.mcp3208-pseudodiff-review'));
  assert.ok(hasRule(result.issues, 'netlist.mcp3208-input-mode-review'));
});

test('regression sample: configured MCP3208 channel modes and VREF hints refine the reviews', () => {
  const result = analyzeCircuitNetlist(
    [
      {
        ...makeComponent({
          instanceId: 'mcp-reg-config',
          templateId: 'tpl_mcp3208',
          name: 'MCP3208 Configured Regression',
          value: 'MCP3208',
          assignedPins: { VDD: '5V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
        }),
      },
      {
        ...makeComponent({
          instanceId: 'probe-reg-se',
          templateId: 'tpl_probe_sensor',
          name: 'Single Ended Regression Probe',
        }),
      },
      {
        ...makeComponent({
          instanceId: 'probe-reg-diff',
          templateId: 'tpl_probe_sensor',
          name: 'Pseudo Differential Regression Probe',
        }),
      },
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('mcp-reg-se-wire', { ownerType: 'component', ownerId: 'probe-reg-se', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-reg-config', pinId: 'CH0' }),
      makeManualConnection('mcp-reg-diff-wire', { ownerType: 'component', ownerId: 'probe-reg-diff', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-reg-config', pinId: 'CH2' }),
    ],
    {
      adcConfigurations: {
        'mcp-reg-config': {
          mcp3208: {
            vrefQuality: 'shared-digital-rail',
            vrefSourceImpedanceOhms: 330,
            channelModes: {
              CH0: 'single-ended',
              CH1: 'unused',
              CH2: 'pseudo-differential-positive',
              CH3: 'pseudo-differential-negative',
            },
          },
        },
      },
    }
  );

  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-input-mode-review' && issue.message.includes('CH0/CH1')), false);
  assert.ok(result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-input-mode-review' && issue.message.includes('CH2/CH3')));
  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-quality-review'));
  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-source-impedance-review'));
  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-filter-review'));
});

test('regression sample: actual MCP3208 VREF RC filter clears the filter review', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'mcp-filter-reg',
        templateId: 'tpl_mcp3208',
        name: 'MCP3208 Filtered Regression',
        value: 'MCP3208',
        assignedPins: { VDD: '5V', VREF: 'VREF_FILT_REG', AGND: 'GND', DGND: 'GND' },
      }),
      makeComponent({
        instanceId: 'mcp-filter-r-reg',
        templateId: 'tpl_resistor',
        name: 'R_VREF_FILT_REG',
        value: '100',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'mcp-filter-c-reg',
        templateId: 'tpl_capacitor',
        name: 'C_VREF_FILT_REG',
        value: '0.1uF',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('mcp-filter-r-reg-wire', { ownerType: 'component', ownerId: 'mcp-filter-r-reg', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-filter-reg', pinId: 'VREF' }),
      makeManualConnection('mcp-filter-c-reg-wire', { ownerType: 'component', ownerId: 'mcp-filter-c-reg', pinId: '1' }, { ownerType: 'component', ownerId: 'mcp-filter-reg', pinId: 'VREF' }),
    ],
    {
      adcConfigurations: {
        'mcp-filter-reg': {
          mcp3208: {
            vrefQuality: 'shared-digital-rail',
          },
        },
      },
    }
  );

  assert.equal(hasRule(result.issues, 'netlist.mcp3208-vref-filter-review'), false);
});

test('regression sample: MCP3208 scan rate still reviews large VREF RC time constants', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'mcp-scan-reg',
        templateId: 'tpl_mcp3208',
        name: 'MCP3208 Scan Regression',
        value: 'MCP3208',
        assignedPins: { VDD: '5V', VREF: 'VREF_SCAN_REG', AGND: 'GND', DGND: 'GND' },
      }),
      makeComponent({
        instanceId: 'mcp-scan-r-reg',
        templateId: 'tpl_resistor',
        name: 'R_VREF_SCAN_REG',
        value: '10k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'mcp-scan-c-reg',
        templateId: 'tpl_capacitor',
        name: 'C_VREF_SCAN_REG',
        value: '0.1uF',
        assignedPins: { '2': 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('mcp-scan-r-reg-wire', { ownerType: 'component', ownerId: 'mcp-scan-r-reg', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-scan-reg', pinId: 'VREF' }),
      makeManualConnection('mcp-scan-c-reg-wire', { ownerType: 'component', ownerId: 'mcp-scan-c-reg', pinId: '1' }, { ownerType: 'component', ownerId: 'mcp-scan-reg', pinId: 'VREF' }),
    ],
    {
      adcConfigurations: {
        'mcp-scan-reg': {
          mcp3208: {
            vrefQuality: 'shared-digital-rail',
            scanRateSps: 10_000,
          },
        },
      },
    }
  );

  assert.ok(hasRule(result.issues, 'netlist.mcp3208-vref-scan-rate-review'));
});

test('regression sample: HX711 still flags incomplete differential input and missing decoupling', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hx-1',
        templateId: 'tpl_hx711',
        name: 'HX711 Scale Frontend',
        value: 'HX711',
        assignedPins: { VSUP: '5V', AVDD: '5V', DVDD: '3.3V', AGND: 'GND', DGND: 'GND' },
      }),
      makeComponent({
        instanceId: 'load-1',
        templateId: 'tpl_load_cell',
        name: 'Load Cell Bridge',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('hx-load-plus', { ownerType: 'component', ownerId: 'load-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hx-1', pinId: 'INA+' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.hx711-differential-input-incomplete'));
  assert.ok(hasRule(result.issues, 'netlist.hx711-decoupling-review'));
});

test('regression sample: HX711 module still flags incomplete excitation wiring', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-1',
        templateId: 'tpl_hx711_module',
        name: 'HX711 Module',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HX_E_PLUS', 'E-': 'HX_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-ex-1',
        templateId: 'tpl_load_cell',
        name: 'Load Cell With Excitation',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('hxm-a-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A+' }),
      makeManualConnection('hxm-a-minus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A-' }),
      makeManualConnection('hxm-e-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'E+' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.hx711-excitation-incomplete'));
});

test('regression sample: HX711 module INB usage stays visible while balanced excitation clears warnings', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-2',
        templateId: 'tpl_hx711_module',
        name: 'HX711 Module B',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HXM2_E_PLUS', 'E-': 'HXM2_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-ex-2',
        templateId: 'tpl_load_cell',
        name: 'Load Cell With Excitation',
      }),
      makeComponent({
        instanceId: 'c-hxm-2',
        templateId: 'tpl_capacitor',
        name: 'C_HXM2',
        value: '0.1uF',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('hxm2-b-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B+' }),
      makeManualConnection('hxm2-b-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B-' }),
      makeManualConnection('hxm2-e-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E+' }),
      makeManualConnection('hxm2-e-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E-' }),
      makeManualConnection('hxm2-cap-v', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'VCC' }),
      makeManualConnection('hxm2-cap-g', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'GND' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.hx711-inb-channel-review'));
  assert.equal(hasRule(result.issues, 'netlist.hx711-excitation-incomplete'), false);
  assert.equal(hasRule(result.issues, 'netlist.hx711-excitation-review'), false);
});

test('regression sample: 6-wire load-cell sense aliases satisfy HX711 excitation checks', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-6w',
        templateId: 'tpl_hx711_module',
        name: 'HX711 Module 6W',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HX6_E_PLUS', 'E-': 'HX6_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-6w',
        templateId: 'tpl_load_cell',
        name: '6-Wire Load Cell',
      }),
      makeComponent({
        instanceId: 'c-hx6',
        templateId: 'tpl_capacitor',
        name: 'C_HX6',
        value: '0.1uF',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('hx6-sig-plus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'A+' }),
      makeManualConnection('hx6-sig-minus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'A-' }),
      makeManualConnection('hx6-sense-plus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'S+' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'E+' }),
      makeManualConnection('hx6-sense-minus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'S-' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'E-' }),
      makeManualConnection('hx6-cap-v', { ownerType: 'component', ownerId: 'c-hx6', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'VCC' }),
      makeManualConnection('hx6-cap-g', { ownerType: 'component', ownerId: 'c-hx6', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'GND' }),
    ],
  );

  assert.equal(hasRule(result.issues, 'netlist.hx711-excitation-incomplete'), false);
  assert.equal(hasRule(result.issues, 'netlist.hx711-excitation-review'), false);
});

test('regression sample: 6-wire load-cell sense mismatch still stays visible', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-sense-1',
        templateId: 'tpl_hx711_module',
        name: 'HX711 Module Sense Check',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HX_SENSE_E_PLUS', 'E-': 'HX_SENSE_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-sense-1',
        templateId: 'tpl_load_cell',
        name: '6-Wire Load Cell',
        assignedPins: { 'E+': '5V', 'E-': 'GND', 'S+': '3.3V', 'S-': 'GND' },
      }),
      makeComponent({
        instanceId: 'c-hx-sense-1',
        templateId: 'tpl_capacitor',
        name: 'C_HX_SENSE',
        value: '0.1uF',
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection('hxs-sig-plus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'A+' }),
      makeManualConnection('hxs-sig-minus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'A-' }),
      makeManualConnection('hxs-sense-plus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'S+' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'E+' }),
      makeManualConnection('hxs-sense-minus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'S-' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'E-' }),
      makeManualConnection('hxs-cap-v', { ownerType: 'component', ownerId: 'c-hx-sense-1', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'VCC' }),
      makeManualConnection('hxs-cap-g', { ownerType: 'component', ownerId: 'c-hx-sense-1', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'GND' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.hx711-sense-net-review'));
});

test('regression sample: direct short between 5V and GND remains a hard netlist finding', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'short-1',
        templateId: 'tpl_short_link',
        name: 'Short Link 1',
        assignedPins: { VCC_IN: '5V', GND_IN: 'GND' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'conn-short',
        { ownerType: 'component', ownerId: 'short-1', pinId: 'VCC_IN' },
        { ownerType: 'component', ownerId: 'short-1', pinId: 'GND_IN' },
      ),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.power-short.direct'));
});

test('regression sample: simple resistor divider still solves without a source-impedance warning', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'r-top',
        templateId: 'tpl_resistor',
        name: 'R Top',
        value: '1k',
        assignedPins: { '1': '5V' },
      }),
      makeComponent({
        instanceId: 'r-bottom',
        templateId: 'tpl_resistor',
        name: 'R Bottom',
        value: '1k',
        assignedPins: { '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'probe-1',
        templateId: 'tpl_probe_sensor',
        name: 'Probe 1',
        assignedPins: { AOut: 'A0' },
      }),
    ],
    'uno',
    resolveRegressionTemplate,
    [
      makeManualConnection(
        'conn-div-1',
        { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
        { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      ),
      makeManualConnection(
        'conn-div-2',
        { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
        { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' },
      ),
    ],
  );

  assert.equal(hasRule(result.issues, 'netlist.adc-source-impedance-high'), false);
});

test('regression sample: core mixed templates required by the suite still exist', () => {
  const requiredIds = [
    'tpl_resistor',
    'tpl_capacitor',
    'tpl_oled',
    'tpl_bme280',
    'tpl_ds18b20',
    'tpl_bluetooth_hc05',
    'tpl_level_shifter',
  ];

  for (const id of requiredIds) {
    assert.ok(template(id));
  }

  assert.ok(resolveRegressionTemplate('tpl_short_link'));
});
