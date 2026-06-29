import assert from 'node:assert/strict';
import test from 'node:test';

import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { auditProjectDesign } from '@/lib/datasheet-rules';
import { runProjectDrc } from '@/lib/drc-engine';
import type { ComponentTemplate } from '@/types';
import { makeComponent, makeManualConnection, makeTemplate } from './test-fixtures.ts';

function staticTemplate(id: string): ComponentTemplate {
  const resolved = getStaticTemplateById(id);
  assert.ok(resolved, `expected static template ${id}`);
  return resolved;
}

function hasRule(
  issues: Array<{ ruleId?: string; code?: string }>,
  ruleId: string,
  code?: string,
): boolean {
  return issues.some(issue => issue.ruleId === ruleId && (code ? issue.code === code : true));
}

const probeTemplate = makeTemplate({
  id: 'tpl_probe_sensor',
  name: 'Probe Sensor',
  category: 'SENSOR',
  pins: [{ name: 'AOut', allowedTypes: ['ANALOG'] }],
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

const shortLinkTemplate = makeTemplate({
  id: 'tpl_short_link',
  name: 'Short Link',
  category: 'PASSIVE',
  pins: [
    { name: 'VCC_IN', allowedTypes: ['POWER'] },
    { name: 'GND_IN', allowedTypes: ['GND'] },
  ],
});

const bluetoothTemplate = makeTemplate({
  id: 'tpl_bluetooth_hc05_virtual',
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
  id: 'tpl_level_shifter_virtual',
  name: 'BSS138 Level Shifter',
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

const bme280Template = makeTemplate({
  id: 'tpl_bme280_virtual',
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

const resetMcuTemplate = makeTemplate({
  id: 'tpl_reset_mcu_virtual',
  name: 'Reset MCU',
  category: 'COMMUNICATION',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'NRST', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const supervisorTemplate = makeTemplate({
  id: 'tpl_supervisor_ic_virtual',
  name: 'Supervisor IC',
  category: 'PASSIVE',
  pins: [
    { name: 'VDD', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'RESET', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const xtalMcuTemplate = makeTemplate({
  id: 'tpl_xtal_mcu_virtual',
  name: 'XTAL MCU',
  category: 'COMMUNICATION',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'XTAL1', allowedTypes: ['DIGITAL'] },
    { name: 'XTAL2', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const hx711ModuleTemplate = makeTemplate({
  id: 'tpl_hx711_module_virtual',
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
  id: 'tpl_load_cell_virtual',
  name: 'Load Cell',
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

function resolveVirtualTemplate(templateId: string): ComponentTemplate | undefined {
  return ({
    tpl_probe_sensor: probeTemplate,
    tpl_general_op_amp: generalOpAmpTemplate,
    tpl_short_link: shortLinkTemplate,
    tpl_bluetooth_hc05_virtual: bluetoothTemplate,
    tpl_level_shifter_virtual: levelShifterTemplate,
    tpl_bme280_virtual: bme280Template,
    tpl_boot_mcu: bootMcuTemplate,
    tpl_reset_mcu_virtual: resetMcuTemplate,
    tpl_supervisor_ic_virtual: supervisorTemplate,
    tpl_xtal_mcu_virtual: xtalMcuTemplate,
    tpl_hx711_module_virtual: hx711ModuleTemplate,
    tpl_load_cell_virtual: loadCellTemplate,
  })[templateId] ?? getStaticTemplateById(templateId);
}

test('virtual circuits: I2C OLED bus without pull-ups stays flagged', () => {
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

test('virtual circuits: I2C OLED bus with pull-ups clears the warning', () => {
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

test('virtual circuits: RC522 on UNO without explicit shifting is reviewed as mixed-voltage', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'rc522-mixed',
        templateId: 'tpl_rfid_rc522',
        name: 'RC522 RFID Module',
        value: 'RC522',
        assignedPins: {
          VCC: '3.3V',
          GND: 'GND',
          SCK: 'D13',
          MISO: 'D12',
          MOSI: 'D11',
          SDA: 'D10',
          RST: 'D9',
        },
      }),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(hasRule(report.issues, 'signal.mixed-voltage-tolerance-review'));
});

test('virtual circuits: HC-06 direct RX path from 5V board stays flagged', () => {
  const report = runProjectDrc({
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
      makeManualConnection(
        'bt-direct-rx',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'bt-direct', pinId: 'RX' },
      ),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(hasRule(report.issues, 'part-master.signal-level-mismatch', 'part-master.signal-level-mismatch'));
});

test('virtual circuits: HC-06 through matched level shifter channel clears path warnings', () => {
  const report = runProjectDrc({
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
      makeManualConnection(
        'bt-safe-hv',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-safe', pinId: 'HV1' },
      ),
      makeManualConnection(
        'bt-safe-lv',
        { ownerType: 'component', ownerId: 'bt-safe', pinId: 'RX' },
        { ownerType: 'component', ownerId: 'ls-safe', pinId: 'LV1' },
      ),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.equal(hasRule(report.issues, 'part-master.signal-level-mismatch', 'part-master.signal-level-mismatch'), false);
  assert.equal(hasRule(report.issues, 'part-master.level-shifter-path-incomplete', 'part-master.level-shifter-path-incomplete'), false);
});

test('virtual circuits: AC-coupled op-amp without midpoint bias stays flagged', () => {
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
    resolveVirtualTemplate,
    [
      makeManualConnection('src-cap', { ownerType: 'component', ownerId: 'src-2', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-2', pinId: '1' }),
      makeManualConnection('cap-inplus', { ownerType: 'component', ownerId: 'c-in-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-2', pinId: 'IN+' }),
      makeManualConnection('out-fb', { ownerType: 'component', ownerId: 'op-2', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-2', pinId: '1' }),
      makeManualConnection('fb-inminus', { ownerType: 'component', ownerId: 'rfb-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-2', pinId: 'IN-' }),
    ],
  );

  assert.ok(hasRule(result.issues, 'netlist.analog-bias-midpoint-missing'));
});

test('virtual circuits: complete mic preamp core clears midpoint and feedback warnings', () => {
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
    resolveVirtualTemplate,
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

test('virtual circuits: MQ2 on VIN 12V triggers rail budget and regulator thermal warnings', () => {
  const mq2Template = staticTemplate('tpl_gas_mq2');

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'mq2-1',
        templateId: 'tpl_gas_mq2',
        name: 'MQ2 Sensor',
        assignedPins: { VCC: '5V', GND: 'GND', AOut: 'A0', DOut: 'D2' },
      }),
    ],
    'uno',
    templateId => ({ tpl_gas_mq2: mq2Template })[templateId],
    'vin-12v',
  );

  assert.ok(report.issues.some(issue => issue.code === 'power.rail-over-budget'));
  assert.ok(report.issues.some(issue => issue.code === 'power.regulator-thermal'));
});

test('virtual circuits: floating BME280 address strap stays flagged', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_virtual',
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
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.strap-bias-missing'));
});

test('virtual circuits: grounded BME280 address strap clears the bias warning', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_virtual',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: { VDD: '3.3V', VDDIO: '3.3V', GND: 'GND', SCL: 'A5', SDA: 'A4' },
      }),
      makeComponent({
        instanceId: 'r-addr',
        templateId: 'tpl_resistor',
        name: 'R_ADDR',
        value: '10k',
        assignedPins: { '2': 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'bme-sdo-r',
        { ownerType: 'component', ownerId: 'bme-1', pinId: 'SDO' },
        { ownerType: 'component', ownerId: 'r-addr', pinId: '1' },
      ),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.equal(hasRule(report.issues, 'part-master.same-net-companion', 'part-master.strap-bias-missing'), false);
});

test('virtual circuits: unresolved boot straps stay visible in project DRC', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'boot-mcu-1',
        templateId: 'tpl_boot_mcu',
        name: 'Boot MCU',
        assignedPins: { VCC: '3.3V', GND: 'GND' },
      }),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'mcu.boot-strap-audit'));
});

test('virtual circuits: low-power mode meaningfully reduces rail budget usage', () => {
  const oledTemplate = staticTemplate('tpl_oled');
  const bluetoothBoardTemplate = staticTemplate('tpl_bluetooth_hc05');

  const components = [
    makeComponent({
      instanceId: 'oled-mode-1',
      templateId: 'tpl_oled',
      name: 'SSD1306 OLED',
      assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'bt-mode-1',
      templateId: 'tpl_bluetooth_hc05',
      name: 'HC-06 Bluetooth Module',
      assignedPins: { TX: 'D2', RX: 'D3', VCC: '5V', GND: 'GND' },
    }),
  ];

  const defaultReport = auditProjectDesign(
    components,
    'uno',
    templateId => ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothBoardTemplate })[templateId],
    'usb-5v',
  );

  const lowPowerReport = auditProjectDesign(
    components,
    'uno',
    templateId => ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothBoardTemplate })[templateId],
    'usb-5v',
    {
      'oled-mode-1': 'sleep',
      'bt-mode-1': 'idle-unpaired',
    },
  );

  const defaultFiveVolt = defaultReport.powerReport.rails.find(rail => rail.rail === '5V');
  const lowPowerFiveVolt = lowPowerReport.powerReport.rails.find(rail => rail.rail === '5V');

  assert.ok(defaultFiveVolt && lowPowerFiveVolt);
  assert.ok((lowPowerFiveVolt.usedMa ?? 0) < (defaultFiveVolt.usedMa ?? 0));
  assert.ok((lowPowerFiveVolt.peakMa ?? 0) < (defaultFiveVolt.peakMa ?? 0));
});

test('virtual circuits: reset net without supervisor stays flagged', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-rst-1',
        templateId: 'tpl_reset_mcu_virtual',
        name: 'STM32 Test MCU',
        assignedPins: { VCC: '3.3V', GND: 'GND' },
      }),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'reset.por-supervisor-review'));
});

test('virtual circuits: reset net with supervisor clears the review', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-rst-ok',
        templateId: 'tpl_reset_mcu_virtual',
        name: 'STM32 Test MCU',
        assignedPins: { VCC: '3.3V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'sup-1',
        templateId: 'tpl_supervisor_ic_virtual',
        name: 'U_RST',
        value: 'TPS3839K33DBZR',
        assignedPins: { VDD: '3.3V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'rst-supervisor-wire',
        { ownerType: 'component', ownerId: 'mcu-rst-ok', pinId: 'NRST' },
        { ownerType: 'component', ownerId: 'sup-1', pinId: 'RESET' },
      ),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.equal(report.issues.some(issue => issue.ruleId === 'reset.por-supervisor-review'), false);
});

test('virtual circuits: MCU oscillator pins without a real clock source stay flagged', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-xtal-1',
        templateId: 'tpl_xtal_mcu_virtual',
        name: 'ATmega Test MCU',
        assignedPins: { VCC: '5V', GND: 'GND' },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'mcu-xtal1-wire',
        { ownerType: 'component', ownerId: 'mcu-xtal-1', pinId: 'XTAL1' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
      ),
      makeManualConnection(
        'mcu-xtal2-wire',
        { ownerType: 'component', ownerId: 'mcu-xtal-1', pinId: 'XTAL2' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D3' },
      ),
    ],
    resolveTemplate: resolveVirtualTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'clock.clock-source-review'));
});

test('virtual circuits: direct short between 5V and GND stays a hard netlist finding', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'short-1',
        templateId: 'tpl_short_link',
        name: 'Direct Short',
        assignedPins: { VCC_IN: '5V', GND_IN: 'GND' },
      }),
    ],
    'uno',
    resolveVirtualTemplate,
    [
      makeManualConnection(
        'conn-short',
        { ownerType: 'component', ownerId: 'short-1', pinId: 'VCC_IN' },
        { ownerType: 'component', ownerId: 'short-1', pinId: 'GND_IN' },
      ),
    ],
  );

  assert.ok(result.issues.some(issue => issue.ruleId === 'netlist.power-short.direct'));
});

test('virtual circuits: op-amp output beyond 3.3V ADC range stays flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'op-adc-1',
        templateId: 'tpl_general_op_amp',
        name: 'ADC Driver',
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
    resolveVirtualTemplate,
    [
      makeManualConnection('adc-out-fb', { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '1' }),
      makeManualConnection('adc-fb-inv', { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
      makeManualConnection('adc-g-inv', { ownerType: 'component', ownerId: 'rg-adc-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
    ],
  );

  assert.ok(result.issues.some(issue => issue.ruleId === 'netlist.opamp-output-adc-range-review'));
});

test('virtual circuits: VIN 9V rail low-headroom is visible before full overload', () => {
  const mq2Template = staticTemplate('tpl_gas_mq2');
  const bluetoothBoardTemplate = staticTemplate('tpl_bluetooth_hc05');

  const report = auditProjectDesign(
    [
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
    'uno',
    templateId => ({ tpl_gas_mq2: mq2Template, tpl_bluetooth_hc05: bluetoothBoardTemplate })[templateId],
    'vin-9v',
  );

  assert.ok(report.issues.some(issue => issue.code === 'power.rail-low-headroom'));
});

test('virtual circuits: HX711 module with incomplete excitation stays flagged', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-1',
        templateId: 'tpl_hx711_module_virtual',
        name: 'HX711 Module',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HX_E_PLUS', 'E-': 'HX_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-ex-1',
        templateId: 'tpl_load_cell_virtual',
        name: 'Load Cell',
      }),
    ],
    'uno',
    resolveVirtualTemplate,
    [
      makeManualConnection('hxm-a-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A+' }),
      makeManualConnection('hxm-a-minus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A-' }),
      makeManualConnection('hxm-e-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'E+' }),
    ],
  );

  assert.ok(result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-incomplete'));
});

test('virtual circuits: HX711 balanced excitation clears excitation warnings', () => {
  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'hxm-2',
        templateId: 'tpl_hx711_module_virtual',
        name: 'HX711 Module B',
        value: 'HX711',
        assignedPins: { VCC: '5V', GND: 'GND', 'E+': 'HXM2_E_PLUS', 'E-': 'HXM2_E_MINUS' },
      }),
      makeComponent({
        instanceId: 'load-ex-2',
        templateId: 'tpl_load_cell_virtual',
        name: 'Load Cell',
      }),
      makeComponent({
        instanceId: 'c-hxm-2',
        templateId: 'tpl_capacitor',
        name: 'C_HXM2',
        value: '0.1uF',
      }),
    ],
    'uno',
    resolveVirtualTemplate,
    [
      makeManualConnection('hxm2-b-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B+' }),
      makeManualConnection('hxm2-b-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B-' }),
      makeManualConnection('hxm2-e-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E+' }),
      makeManualConnection('hxm2-e-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E-' }),
      makeManualConnection('hxm2-cap-v', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'VCC' }),
      makeManualConnection('hxm2-cap-g', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'GND' }),
    ],
  );

  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-incomplete'), false);
  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-review'), false);
});
