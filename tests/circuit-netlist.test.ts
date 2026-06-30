import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCircuitNetlist, toSpiceNetlist } from '@/lib/circuit-netlist';
import type { BoardPinDriveState } from '@/types';
import { makeComponent, makeManualConnection, makeTemplate } from './test-fixtures.ts';

const shortLinkTemplate = makeTemplate({
  id: 'tpl_short_link',
  name: 'Short Link',
  category: 'PASSIVE',
  pins: [
    { name: 'VCC_IN', allowedTypes: ['POWER'] },
    { name: 'GND_IN', allowedTypes: ['GND'] },
  ],
});

const resistorTemplate = makeTemplate({
  id: 'tpl_resistor',
  name: '저항',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
  ],
});

const probeTemplate = makeTemplate({
  id: 'tpl_probe_sensor',
  name: 'Probe Sensor',
  pins: [
    { name: 'AOut', allowedTypes: ['ANALOG'] },
  ],
});

const diodeTemplate = makeTemplate({
  id: 'tpl_diode',
  name: '다이오드',
  category: 'PASSIVE',
  pins: [
    { name: 'A', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    { name: 'K', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
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

const mosfetTemplate = makeTemplate({
  id: 'tpl_mosfet',
  name: 'MOSFET',
  category: 'PASSIVE',
  pins: [
    { name: 'G', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    { name: 'D', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    { name: 'S', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
  ],
});

const regulatorTemplate = makeTemplate({
  id: 'tpl_ldo_regulator',
  name: 'LDO Regulator',
  category: 'PASSIVE',
  pins: [
    { name: 'VIN', allowedTypes: ['POWER'], preferredSide: 'left' },
    { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
    { name: 'VOUT', allowedTypes: ['POWER'], preferredSide: 'right' },
  ],
});

const capacitorTemplate = makeTemplate({
  id: 'tpl_capacitor',
  name: '콘덴서',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
  ],
});

const inductorTemplate = makeTemplate({
  id: 'tpl_inductor',
  name: '인덕터',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
  ],
});

const oledTemplate = makeTemplate({
  id: 'tpl_oled',
  name: 'OLED 디스플레이',
  category: 'DISPLAY',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'SDA', allowedTypes: ['ANALOG'] },
    { name: 'SCL', allowedTypes: ['ANALOG'] },
  ],
});

const i2cSensor33Template = makeTemplate({
  id: 'tpl_i2c_sensor_33',
  name: '3.3V I2C Sensor',
  compatibleVoltage: '3.3V',
  category: 'SENSOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'SDA', allowedTypes: ['ANALOG'] },
    { name: 'SCL', allowedTypes: ['ANALOG'] },
  ],
});

const opAmpBufferTemplate = makeTemplate({
  id: 'tpl_op_amp_buffer',
  name: 'OP-Amp 버퍼',
  category: 'PASSIVE',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'IN', allowedTypes: ['ANALOG'] },
    { name: 'OUT', allowedTypes: ['ANALOG'] },
  ],
});

const relayTemplate = makeTemplate({
  id: 'tpl_relay',
  name: 'Relay Module',
  category: 'ACTUATOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'Signal', allowedTypes: ['DIGITAL'] },
  ],
});

const rawCoilTemplate = makeTemplate({
  id: 'tpl_solenoid_test',
  name: 'Solenoid Coil',
  category: 'ACTUATOR',
  pins: [
    { name: 'COIL+', allowedTypes: ['POWER'] },
    { name: 'COIL-', allowedTypes: ['GND'] },
  ],
});

const dcMotorTemplate = makeTemplate({
  id: 'tpl_dc_motor',
  name: 'DC Motor Module',
  category: 'ACTUATOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'IN1', allowedTypes: ['DIGITAL'] },
    { name: 'IN2', allowedTypes: ['DIGITAL'] },
    { name: 'ENA', allowedTypes: ['PWM'] },
  ],
});

const audioAmpTemplate = makeTemplate({
  id: 'tpl_audio_amp',
  name: 'Audio Amplifier',
  category: 'IC',
  pins: [
    { name: 'IN', allowedTypes: ['ANALOG'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'OUT', allowedTypes: ['ANALOG'] },
    { name: 'VCC', allowedTypes: ['POWER'] },
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

function resolveTemplate(templateId: string) {
  return {
    tpl_short_link: shortLinkTemplate,
    tpl_resistor: resistorTemplate,
    tpl_probe_sensor: probeTemplate,
    tpl_diode: diodeTemplate,
    tpl_led: ledTemplate,
    tpl_mosfet: mosfetTemplate,
    tpl_ldo_regulator: regulatorTemplate,
    tpl_capacitor: capacitorTemplate,
    tpl_inductor: inductorTemplate,
    tpl_oled: oledTemplate,
    tpl_i2c_sensor_33: i2cSensor33Template,
    tpl_op_amp_buffer: opAmpBufferTemplate,
    tpl_relay: relayTemplate,
    tpl_dc_motor: dcMotorTemplate,
    tpl_solenoid_test: rawCoilTemplate,
    tpl_audio_amp: audioAmpTemplate,
    tpl_general_op_amp: generalOpAmpTemplate,
    tpl_high_impedance_sensor: highImpedanceSensorTemplate,
    tpl_ads1115: ads1115Template,
    tpl_ads1015: ads1015Template,
    tpl_hx711: hx711Template,
    tpl_hx711_module: hx711ModuleTemplate,
    tpl_load_cell: loadCellTemplate,
    tpl_mcp3208: mcp3208Template,
  }[templateId];
}

test('circuit netlist flags direct short between power and ground rails', () => {
  const components = [
    makeComponent({
      instanceId: 'short-1',
      templateId: 'tpl_short_link',
      name: 'Short Link 1',
      assignedPins: {
        VCC_IN: '5V',
        GND_IN: 'GND',
      },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-short',
      { ownerType: 'component', ownerId: 'short-1', pinId: 'VCC_IN' },
      { ownerType: 'component', ownerId: 'short-1', pinId: 'GND_IN' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.power-short.direct'),
    'expected direct short issue to be reported'
  );
});

test('circuit netlist solves simple resistor divider voltage on the measured net', () => {
  const components = [
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
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-mid-1',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-mid-2',
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const measuredNet = result.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'A0')
  );

  assert.ok(measuredNet, 'expected measured net to exist');
  assert.ok(typeof measuredNet?.solvedVoltage === 'number', 'expected solved voltage to be available');
  assert.ok(Math.abs((measuredNet?.solvedVoltage ?? 0) - 2.5) < 0.01);
});

test('circuit netlist applies code-driven output voltage to GPIO-fed LED chains', () => {
  const components = [
    makeComponent({
      instanceId: 'resistor-1',
      templateId: 'tpl_resistor',
      name: 'LED 저항',
      value: '220',
      assignedPins: { '1': 'D13' },
    }),
    makeComponent({
      instanceId: 'led-1',
      templateId: 'tpl_led',
      name: '상태 LED',
      assignedPins: { GND: 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-led-chain',
      { ownerType: 'component', ownerId: 'resistor-1', pinId: '2' },
      { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' }
    ),
  ];

  const boardPinDriveStates: BoardPinDriveState[] = [
    {
      boardPin: 'D13',
      mode: 'output_high',
      sourceOperation: 'digitalWrite',
      line: 6,
    },
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections, {
    boardPinDriveStates,
  });
  const drivenNet = result.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'D13')
  );

  assert.equal(drivenNet?.knownVoltage, 5);
  assert.ok(
    !result.issues.some(issue => issue.ruleId === 'netlist.led-current-too-low'),
    'expected driven GPIO net to avoid false low-current warning'
  );
});

test('circuit netlist models INPUT_PULLUP as a weak internal pull-up resistor', () => {
  const components = [
    makeComponent({
      instanceId: 'pull-down-1',
      templateId: 'tpl_resistor',
      name: 'Pull-down',
      value: '10k',
      assignedPins: {
        '1': 'D2',
        '2': 'GND',
      },
    }),
  ];

  const boardPinDriveStates: BoardPinDriveState[] = [
    {
      boardPin: 'D2',
      mode: 'input_pullup',
      sourceOperation: 'pinMode',
      line: 3,
    },
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [], {
    boardPinDriveStates,
  });
  const inputNet = result.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'D2')
  );

  assert.ok(typeof inputNet?.solvedVoltage === 'number', 'expected INPUT_PULLUP net to solve to a preview voltage');
  assert.ok(Math.abs((inputNet?.solvedVoltage ?? 0) - 1.25) < 0.05);
});

test('circuit netlist emits an info issue when resistor value parsing falls back', () => {
  const components = [
    makeComponent({
      instanceId: 'r-top',
      templateId: 'tpl_resistor',
      name: 'R Top',
      value: '1MegaOops',
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
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-mid-1',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-mid-2',
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'),
    'expected resistor fallback info issue to be reported'
  );
});

test('circuit netlist exports a SPICE netlist for a divider without syntax placeholders', () => {
  const components = [
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
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-mid-1',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-mid-2',
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' }
    ),
  ];

  const netlist = toSpiceNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.match(netlist, /^\* ModuMake generated SPICE netlist/m);
  assert.match(netlist, /^\* 5V :: known rail/m);
  assert.match(netlist, /^\* R Top :: /m);
  assert.match(netlist, /^V1\s+/m);
  assert.match(netlist, /^R1\s+/m);
  assert.match(netlist, /^R2\s+/m);
  assert.match(netlist, /^\.op$/m);
  assert.match(netlist, /^\.end$/m);
});

test('circuit netlist flags reverse-biased diode topology for review', () => {
  const components = [
    makeComponent({
      instanceId: 'd-1',
      templateId: 'tpl_diode',
      name: 'D1',
      value: '1N4148',
      assignedPins: {
        A: 'GND',
        K: '5V',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.diode-reverse-bias'),
    'expected reverse-biased diode to be flagged'
  );
});

test('circuit netlist flags missing flyback diode on a raw inductive coil path', () => {
  const components = [
    makeComponent({
      instanceId: 'coil-1',
      templateId: 'tpl_solenoid_test',
      name: 'Solenoid 1',
      assignedPins: {
        'COIL+': '5V',
        'COIL-': 'GND',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.inductive-flyback-missing'),
    'expected missing flyback diode issue on a raw coil'
  );
});

test('circuit netlist flags reversed flyback diode on a raw inductive coil path', () => {
  const components = [
    makeComponent({
      instanceId: 'coil-1',
      templateId: 'tpl_solenoid_test',
      name: 'Solenoid 1',
      assignedPins: {
        'COIL+': '5V',
        'COIL-': 'GND',
      },
    }),
    makeComponent({
      instanceId: 'd-rev',
      templateId: 'tpl_diode',
      name: 'D Rev',
      assignedPins: {
        A: '5V',
        K: 'GND',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.inductive-flyback-reversed'),
    'expected reversed flyback diode issue on a raw coil'
  );
});

test('circuit netlist accepts a flyback diode when the supply side is tied through a zero-ohm link', () => {
  const relay = makeComponent({
    instanceId: 'coil-zohm',
    templateId: 'tpl_solenoid_test',
    name: 'Solenoid Z',
    assignedPins: { 'COIL+': 'COIL_SUPPLY', 'COIL-': 'SW_LOW' },
  });
  const link = makeComponent({
    instanceId: 'r-link',
    templateId: 'tpl_resistor',
    name: 'R Link',
    value: '0',
    assignedPins: { '1': '5V', '2': 'COIL_SUPPLY' },
  });
  const flyback = makeComponent({
    instanceId: 'd-zohm',
    templateId: 'tpl_diode',
    name: 'D Z',
    value: '1N4007',
    assignedPins: { A: 'SW_LOW', K: '5V' },
  });

  const result = analyzeCircuitNetlist([relay, link, flyback], 'uno', resolveTemplate, []);

  assert.equal(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.inductive-flyback-missing' ||
      issue.ruleId === 'netlist.inductive-flyback-reversed'
    ),
    false,
    'expected low-impedance bridged flyback path to count as valid protection'
  );
});

test('circuit netlist warns when a raw coil uses only a small-signal flyback diode', () => {
  const relay = makeComponent({
    instanceId: 'coil-small-signal',
    templateId: 'tpl_solenoid_test',
    name: 'Solenoid Tiny',
    value: '70mA coil',
    assignedPins: { 'COIL+': '5V', 'COIL-': 'SW_LOW' },
  });
  const flyback = makeComponent({
    instanceId: 'd-small-signal',
    templateId: 'tpl_diode',
    name: 'D Tiny',
    value: '1N4148',
    assignedPins: { A: 'SW_LOW', K: '5V' },
  });

  const result = analyzeCircuitNetlist([relay, flyback], 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.inductive-flyback-diode-headroom'),
    'expected small-signal flyback diode headroom warning'
  );
  assert.match(
    result.issues.find(issue => issue.ruleId === 'netlist.inductive-flyback-diode-headroom')?.message ?? '',
    /추정 경로 전압은 약 0\.70V/
  );
  assert.match(
    result.issues.find(issue => issue.ruleId === 'netlist.inductive-flyback-diode-headroom')?.message ?? '',
    /예상 전류는 약 0\.07A급/
  );
});

test('circuit netlist estimates flyback current from coil resistance text when explicit current is absent', () => {
  const coil = makeComponent({
    instanceId: 'coil-resistance-based',
    templateId: 'tpl_solenoid_test',
    name: 'Relay Coil 360ohm',
    value: '100 ohm',
    assignedPins: { 'COIL+': '5V', 'COIL-': 'GND' },
  });

  const result = analyzeCircuitNetlist([coil], 'uno', resolveTemplate, []);
  const message = result.issues.find(issue => issue.ruleId === 'netlist.inductive-flyback-missing')?.message ?? '';

  assert.match(message, /추정 경로 전압은 약 5\.00V/);
  assert.match(message, /전압\/저항 기준 예상 전류는 약 0\.05A급/);
});

test('circuit netlist does not require an external flyback diode for relay modules with likely onboard protection', () => {
  const components = [
    makeComponent({
      instanceId: 'relay-module-1',
      templateId: 'tpl_relay',
      name: 'Relay Module 1',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        Signal: 'D2',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.equal(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.inductive-flyback-missing' ||
      issue.ruleId === 'netlist.inductive-flyback-reversed'
    ),
    false,
    'expected module-style relay interface to avoid raw flyback warnings'
  );
});

test('circuit netlist asks for flyback review on motor driver modules with likely partial protection', () => {
  const components = [
    makeComponent({
      instanceId: 'motor-module-1',
      templateId: 'tpl_dc_motor',
      name: 'L298 Motor Module',
      assignedPins: {
        VCC: '12V',
        GND: 'GND',
        IN1: 'D2',
        IN2: 'D3',
        ENA: 'D5',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.inductive-flyback-review'),
    'expected motor driver module to request manual flyback review rather than a hard missing warning'
  );
  assert.match(
    result.issues.find(issue => issue.ruleId === 'netlist.inductive-flyback-review')?.message ?? '',
    /외부 모터 단자\/배선 루프/
  );
});

test('circuit netlist uses nonlinear diode solving for a simple clamp path', () => {
  const components = [
    makeComponent({
      instanceId: 'r-top',
      templateId: 'tpl_resistor',
      name: 'R Top',
      value: '1k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'd-clamp',
      templateId: 'tpl_diode',
      name: 'D Clamp',
      value: '1N4148',
      assignedPins: { K: 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-1',
      templateId: 'tpl_probe_sensor',
      name: 'Probe 1',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-mid-1',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-mid-2',
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'd-clamp', pinId: 'A' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const measuredNet = result.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'A0')
  );

  assert.ok(measuredNet, 'expected measured net to exist');
  const solvedVoltage = measuredNet?.solvedVoltage ?? 0;
  assert.ok(solvedVoltage > 0.45 && solvedVoltage < 0.95, `expected diode clamp voltage, got ${solvedVoltage}`);
});

test('circuit netlist reviews power-path inductors that do not advertise current rating', () => {
  const components = [
    makeComponent({
      instanceId: 'l-power',
      templateId: 'tpl_inductor',
      name: 'Power Inductor 2A',
      value: '10uH',
      assignedPins: { '1': '5V', '2': '3.3V' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.power-inductor-rating-review'),
    'expected current rating review for power-path inductor'
  );
  assert.match(
    result.issues.find(issue => issue.ruleId === 'netlist.power-inductor-rating-review')?.message ?? '',
    /추정 경로 전압은 약 1\.70V/
  );
  assert.match(
    result.issues.find(issue => issue.ruleId === 'netlist.power-inductor-rating-review')?.message ?? '',
    /예상 전류는 약 2\.0A급/
  );
});

test('circuit netlist estimates inductor current from power text when only wattage is labeled', () => {
  const components = [
    makeComponent({
      instanceId: 'l-power-watts',
      templateId: 'tpl_inductor',
      name: 'Buck Inductor',
      value: '22uH 3.4W',
      assignedPins: { '1': '5V', '2': '3.3V' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);
  const message = result.issues.find(issue => issue.ruleId === 'netlist.power-inductor-rating-review')?.message ?? '';

  assert.match(message, /추정 경로 전압은 약 1\.70V/);
  assert.match(message, /전력\/전압 기준 예상 전류는 약 2\.0A급/);
});

test('circuit netlist flags direct-drive LED without a series resistor', () => {
  const components = [
    makeComponent({
      instanceId: 'led-1',
      templateId: 'tpl_led',
      name: 'LED 1',
      assignedPins: {
        Signal: '5V',
        GND: 'GND',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.led-current-limit-missing'),
    'expected missing LED resistor issue'
  );
  const issue = result.issues.find(candidate => candidate.ruleId === 'netlist.led-current-limit-missing');
  assert.equal(issue?.confidence, 'strong-inference');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.match(issue?.evidence?.howToVerify ?? '', /220Ω|220/);
});

test('circuit netlist warns when LED current is likely too low', () => {
  const components = [
    makeComponent({
      instanceId: 'r-top',
      templateId: 'tpl_resistor',
      name: 'R Limit',
      value: '10k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'led-1',
      templateId: 'tpl_led',
      name: 'LED 1',
      assignedPins: { GND: 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-led',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.led-current-too-low'),
    'expected dim LED warning'
  );
});

test('circuit netlist flags resistor dissipation that exceeds common small-signal wattage', () => {
  const components = [
    makeComponent({
      instanceId: 'r-hot',
      templateId: 'tpl_resistor',
      name: 'R Hot',
      value: '100',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.resistor-overwatt'),
    'expected resistor over-watt issue'
  );
});

test('circuit netlist respects explicit resistor wattage ratings when estimating derating', () => {
  const components = [
    makeComponent({
      instanceId: 'r-halfw',
      templateId: 'tpl_resistor',
      name: 'R HalfW',
      value: '100 1/2W',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.equal(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.resistor-overwatt' ||
      issue.ruleId === 'netlist.resistor-low-headroom'
    ),
    false,
    'expected 1/2W resistor to keep adequate margin for a 0.25W load'
  );
});

test('circuit netlist infers larger resistor wattage from 1206-class footprints', () => {
  const resistor = makeComponent({
    instanceId: 'r-1206',
    templateId: 'tpl_resistor',
    name: 'R 1206',
    value: '100',
    assignedPins: { '1': '5V', '2': 'GND' },
  });

  resistor.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Resistor_SMD:R_1206_3216Metric',
  };

  const result = analyzeCircuitNetlist([resistor], 'uno', resolveTemplate, []);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.resistor-overwatt'),
    false,
    'expected 1206 package heuristic to avoid false over-watt error at 0.25W'
  );
});

test('circuit netlist uses a stricter long-term margin for current-sense resistors', () => {
  const resistor = makeComponent({
    instanceId: 'r-shunt',
    templateId: 'tpl_resistor',
    name: 'Current Sense Shunt',
    value: '42',
    assignedPins: { '1': '5V', '2': 'GND' },
  });
  resistor.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Resistor_SMD:R_2512_6332Metric',
  };

  const result = analyzeCircuitNetlist([resistor], 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.resistor-low-headroom'),
    'expected current-sense resistor to warn earlier on long-term dissipation margin'
  );
  assert.ok(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.resistor-low-headroom' &&
      issue.message.includes('절대 정격') &&
      issue.recommendation?.includes('장기 신뢰성')
    ),
    'expected low-headroom resistor warning to distinguish long-term margin from absolute failure'
  );
});

test('circuit netlist flags capacitor voltage rating overrun', () => {
  const components = [
    makeComponent({
      instanceId: 'c-low',
      templateId: 'tpl_capacitor',
      name: 'C Low',
      value: '10uF/4V',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.capacitor-overvoltage'),
    'expected capacitor overvoltage issue'
  );
  assert.ok(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.capacitor-overvoltage' &&
      issue.recommendation?.includes('이미 내압 초과')
    ),
    'expected capacitor overvoltage message to call out an immediate rating violation'
  );
});

test('circuit netlist warns when capacitor headroom is thin even with spaced voltage notation', () => {
  const components = [
    makeComponent({
      instanceId: 'c-tight',
      templateId: 'tpl_capacitor',
      name: 'C Tight',
      value: '10uF 6V',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.capacitor-voltage-headroom'),
    'expected capacitor headroom warning'
  );
  assert.ok(
    result.issues.some(issue =>
      issue.ruleId === 'netlist.capacitor-voltage-headroom' &&
      issue.message.includes('아직 넘지 않았지만') &&
      issue.recommendation?.includes('장기 신뢰성')
    ),
    'expected capacitor headroom warning to distinguish margin loss from an outright overvoltage fault'
  );
});

test('circuit netlist uses a stricter headroom threshold for polarized electrolytic capacitors', () => {
  const components = [
    makeComponent({
      instanceId: 'c-electro',
      templateId: 'tpl_capacitor',
      name: 'C Electrolytic',
      value: '100uF/10V electrolytic',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.capacitor-voltage-headroom'),
    'expected polarized capacitor to warn earlier on voltage headroom'
  );
});

test('circuit netlist uses a stricter headroom threshold for bootstrap capacitors', () => {
  const components = [
    makeComponent({
      instanceId: 'c-bootstrap',
      templateId: 'tpl_capacitor',
      name: 'Bootstrap Cap',
      value: '100nF/10V',
      assignedPins: { '1': '5V', '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.capacitor-voltage-headroom'),
    'expected bootstrap capacitor to warn earlier on voltage headroom'
  );
});

test('circuit netlist evaluates PWM RC smoothing quality', () => {
  const components = [
    makeComponent({
      instanceId: 'r-pwm',
      templateId: 'tpl_resistor',
      name: 'R PWM',
      value: '1k',
      assignedPins: { '1': 'D3' },
    }),
    makeComponent({
      instanceId: 'c-filter',
      templateId: 'tpl_capacitor',
      name: 'C Filter',
      value: '10uF',
      assignedPins: { '2': 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-1',
      templateId: 'tpl_probe_sensor',
      name: 'Probe 1',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-rc-1',
      { ownerType: 'component', ownerId: 'r-pwm', pinId: '2' },
      { ownerType: 'component', ownerId: 'c-filter', pinId: '1' }
    ),
    makeManualConnection(
      'conn-rc-2',
      { ownerType: 'component', ownerId: 'c-filter', pinId: '1' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.rc-filter-smoothing-ok'),
    'expected RC smoothing audit info'
  );
});

test('circuit netlist warns when ADC source impedance is too high', () => {
  const components = [
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
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-hi-z-1',
      { ownerType: 'component', ownerId: 'r-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-hi-z-2',
      { ownerType: 'component', ownerId: 'probe-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-bottom', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-source-impedance-high'),
    'expected ADC source impedance warning'
  );
});

test('circuit netlist generalizes ADC impedance through a deeper resistor ladder', () => {
  const components = [
    makeComponent({
      instanceId: 'r-1',
      templateId: 'tpl_resistor',
      name: 'R1',
      value: '820k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r-2',
      templateId: 'tpl_resistor',
      name: 'R2',
      value: '820k',
    }),
    makeComponent({
      instanceId: 'r-3',
      templateId: 'tpl_resistor',
      name: 'R3',
      value: '820k',
      assignedPins: { '2': 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-2',
      templateId: 'tpl_probe_sensor',
      name: 'Probe 2',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-deep-1',
      { ownerType: 'component', ownerId: 'r-1', pinId: '2' },
      { ownerType: 'component', ownerId: 'r-2', pinId: '1' }
    ),
    makeManualConnection(
      'conn-deep-2',
      { ownerType: 'component', ownerId: 'r-2', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-2', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-deep-3',
      { ownerType: 'component', ownerId: 'probe-2', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-3', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-source-impedance-high'),
    'expected generalized ladder impedance warning'
  );
});

test('circuit netlist suppresses high-impedance warning when an op-amp buffer isolates the divider', () => {
  const components = [
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
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'probe-3',
      templateId: 'tpl_probe_sensor',
      name: 'Probe 3',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-buf-1',
      { ownerType: 'component', ownerId: 'r-top-buf', pinId: '2' },
      { ownerType: 'component', ownerId: 'r-bottom-buf', pinId: '1' }
    ),
    makeManualConnection(
      'conn-buf-2',
      { ownerType: 'component', ownerId: 'r-top-buf', pinId: '2' },
      { ownerType: 'component', ownerId: 'buf-1', pinId: 'IN' }
    ),
    makeManualConnection(
      'conn-buf-3',
      { ownerType: 'component', ownerId: 'buf-1', pinId: 'OUT' },
      { ownerType: 'component', ownerId: 'probe-3', pinId: 'AOut' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-source-impedance-high'),
    false
  );
});

test('circuit netlist reviews ADC settling on faster 3.3V SAR ADC inputs with high source impedance', () => {
  const components = [
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
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-esp-1',
      { ownerType: 'component', ownerId: 'r-top-esp', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-esp', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-esp-2',
      { ownerType: 'component', ownerId: 'probe-esp', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-bottom-esp', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'esp32', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-sampling-settling-review'),
    'expected ADC settling review on high-impedance ESP32 ADC source'
  );
});

test('circuit netlist reviews direct ADC connections from sensors that part_master marks as buffer-sensitive', () => {
  const components = [
    makeComponent({
      instanceId: 'ph-1',
      templateId: 'tpl_high_impedance_sensor',
      name: 'Gravity pH Sensor',
      value: 'SEN0161',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        AOut: 'A0',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.sensor-output-buffer-review'),
    'expected part_master-driven sensor buffer review'
  );
});

test('circuit netlist also reviews TDS/EC style analog sensor modules when they drive ADC directly', () => {
  const components = [
    makeComponent({
      instanceId: 'tds-1',
      templateId: 'tpl_high_impedance_sensor',
      name: 'Gravity TDS Sensor',
      value: 'SEN0244',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        AOut: 'A0',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.sensor-output-buffer-review'),
    'expected TDS sensor direct ADC hookup to suggest buffering'
  );
});

test('circuit netlist treats ADS1115 inputs as ADC sinks for source-impedance settling review', () => {
  const components = [
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
  ];

  const manualConnections = [
    makeManualConnection(
      'ads-r-top',
      { ownerType: 'component', ownerId: 'r-top-ads', pinId: '2' },
      { ownerType: 'component', ownerId: 'ads-1', pinId: 'AIN0' }
    ),
    makeManualConnection(
      'ads-r-bot',
      { ownerType: 'component', ownerId: 'ads-1', pinId: 'AIN0' },
      { ownerType: 'component', ownerId: 'r-bottom-ads', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-sampling-settling-review' && issue.message.includes('ADS1115 Breakout:AIN0')),
    'expected external ADS1115 ADC sink to participate in settling review'
  );
});

test('circuit netlist relaxes ADS1x15 settling review when a slow data rate is configured', () => {
  const components = [
    makeComponent({
      instanceId: 'ads-slow-1',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Slow Rate',
      value: 'ADS1115',
      assignedPins: { VDD: '5V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'r-top-ads-slow',
      templateId: 'tpl_resistor',
      name: 'R_TOP_ADS_SLOW',
      value: '220k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r-bottom-ads-slow',
      templateId: 'tpl_resistor',
      name: 'R_BOTTOM_ADS_SLOW',
      value: '220k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('ads-slow-r-top', { ownerType: 'component', ownerId: 'r-top-ads-slow', pinId: '2' }, { ownerType: 'component', ownerId: 'ads-slow-1', pinId: 'AIN0' }),
    makeManualConnection('ads-slow-r-bot', { ownerType: 'component', ownerId: 'ads-slow-1', pinId: 'AIN0' }, { ownerType: 'component', ownerId: 'r-bottom-ads-slow', pinId: '1' }),
  ], {
    adcConfigurations: {
      'ads-slow-1': {
        ads1x15: {
          dataRateSps: 8,
        },
      },
    },
  });

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-sampling-settling-review' && issue.message.includes('ADS1115 Slow Rate:AIN0')),
    false,
    'expected slow ADS1x15 data rate to provide enough settling margin for the same source impedance'
  );
});

test('circuit netlist uses external ADC limits when op-amp output would overdrive ADS1115 input range', () => {
  const components = [
    makeComponent({
      instanceId: 'op-ads-1',
      templateId: 'tpl_general_op_amp',
      name: 'U_ADS_DRIVER',
      assignedPins: { VCC: '5V', GND: 'GND', 'IN+': '5V' },
    }),
    makeComponent({
      instanceId: 'rfb-ads-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_ADS',
      value: '100k',
    }),
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('ads-op-out-fb', { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-ads-1', pinId: '1' }),
    makeManualConnection('ads-op-fb-inv', { ownerType: 'component', ownerId: 'rfb-ads-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'IN-' }),
    makeManualConnection('ads-op-rg-inv', { ownerType: 'component', ownerId: 'rg-ads-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'IN-' }),
    makeManualConnection('ads-op-out-adc', { ownerType: 'component', ownerId: 'op-ads-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'ads-2', pinId: 'AIN0' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-output-adc-range-review' && issue.message.includes('ADS1115 Frontend:AIN0')),
    'expected ADS1115 full-scale limit to be used for op-amp ADC over-range review'
  );
});

test('circuit netlist detects ADS1x15 differential pair usage when both inputs come from the same source', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('adsdiff-plus', { ownerType: 'component', ownerId: 'load-diff-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'adsdiff-1', pinId: 'AIN0' }),
    makeManualConnection('adsdiff-minus', { ownerType: 'component', ownerId: 'load-diff-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'adsdiff-1', pinId: 'AIN1' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.ads1x15-differential-pair-review'),
    'expected ADS1x15 differential pair usage review'
  );
});

test('circuit netlist warns when ADS1x15 differential full-scale and common-mode look out of range', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.ads1x15-fullscale-review'),
    'expected ADS1x15 full-scale review'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.ads1x15-common-mode-review'),
    'expected ADS1x15 common-mode review'
  );
});

test('circuit netlist honors configured ADS1x15 PGA full-scale before warning', () => {
  const components = [
    makeComponent({
      instanceId: 'ads-range-configured',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Configured PGA',
      value: 'ADS1115',
      assignedPins: { VDD: '5V', GND: 'GND', AIN0: '5V', AIN1: 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [], {
    adcConfigurations: {
      'ads-range-configured': {
        ads1x15: {
          pgaFullScaleV: 6.144,
        },
      },
    },
  });

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.ads1x15-fullscale-review'),
    false,
    'expected configured ADS1x15 PGA full-scale to clear the conservative full-scale warning'
  );
});

test('circuit netlist reviews ADS1x15 noise and bandwidth tradeoff from PGA and data rate', () => {
  const components = [
    makeComponent({
      instanceId: 'ads-noise-1',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Noise Tradeoff',
      value: 'ADS1115',
      assignedPins: { VDD: '5V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'ads-bandwidth-1',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Bandwidth Tradeoff',
      value: 'ADS1115',
      assignedPins: { VDD: '5V', GND: 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [], {
    adcConfigurations: {
      'ads-noise-1': {
        ads1x15: {
          pgaFullScaleV: 0.256,
          dataRateSps: 860,
        },
      },
      'ads-bandwidth-1': {
        ads1x15: {
          pgaFullScaleV: 4.096,
          dataRateSps: 8,
        },
      },
    },
  });

  const noiseBandwidthIssues = result.issues.filter(issue => issue.ruleId === 'netlist.ads1x15-noise-bandwidth-review');
  assert.ok(noiseBandwidthIssues.some(issue => issue.message.includes('ADS1115 Noise Tradeoff')));
  assert.ok(noiseBandwidthIssues.some(issue => issue.message.includes('ADS1115 Bandwidth Tradeoff')));
});

test('circuit netlist reviews ADS1x15 input mode when only one side of a differential pair is connected', () => {
  const components = [
    makeComponent({
      instanceId: 'adsmode-1',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Mode Check',
      value: 'ADS1115',
      assignedPins: { VDD: '3.3V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-adsmode',
      templateId: 'tpl_probe_sensor',
      name: 'Probe Diff',
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('adsmode-plus', { ownerType: 'component', ownerId: 'probe-adsmode', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'adsmode-1', pinId: 'AIN0' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.ads1x15-input-mode-review'),
    'expected ADS1x15 input mode review when only one side is connected'
  );
});

test('circuit netlist escalates ADS1x15 input mode review when project config expects differential mode', () => {
  const components = [
    makeComponent({
      instanceId: 'adsmode-config-1',
      templateId: 'tpl_ads1115',
      name: 'ADS1115 Configured Differential',
      value: 'ADS1115',
      assignedPins: { VDD: '3.3V', GND: 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-adsmode-config',
      templateId: 'tpl_probe_sensor',
      name: 'Probe Diff Configured',
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('adsmode-config-plus', { ownerType: 'component', ownerId: 'probe-adsmode-config', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'adsmode-config-1', pinId: 'AIN0' }),
  ], {
    adcConfigurations: {
      'adsmode-config-1': {
        ads1x15: {
          pairModes: {
            AIN0_AIN1: 'differential',
          },
        },
      },
    },
  });

  const configuredIssue = result.issues.find(issue => issue.ruleId === 'netlist.ads1x15-input-mode-review');
  assert.ok(configuredIssue, 'expected ADS1x15 configured differential mode review');
  assert.equal(configuredIssue?.severity, 'warning');
});

test('circuit netlist treats MCP3208 channels as external ADC sinks for source-impedance settling review', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('mcp-r-top', { ownerType: 'component', ownerId: 'r-top-mcp', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-1', pinId: 'CH0' }),
    makeManualConnection('mcp-r-bot', { ownerType: 'component', ownerId: 'mcp-1', pinId: 'CH0' }, { ownerType: 'component', ownerId: 'r-bottom-mcp', pinId: '1' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.adc-sampling-settling-review' && issue.message.includes('MCP3208 ADC:CH0')),
    'expected MCP3208 channel to participate in external ADC settling review'
  );
});

test('circuit netlist reviews MCP3208 VREF when it lacks local bypassing or exceeds VDD', () => {
  const components = [
    makeComponent({
      instanceId: 'mcp-vref-1',
      templateId: 'tpl_mcp3208',
      name: 'MCP3208 VREF Check',
      value: 'MCP3208',
      assignedPins: { VDD: '3.3V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-over-vdd'),
    'expected MCP3208 VREF over-VDD warning'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-bypass-review'),
    'expected MCP3208 VREF bypass review'
  );
});

test('circuit netlist distinguishes MCP3208 pseudo-differential and single-ended channel usage', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('mcp-psdiff-plus', { ownerType: 'component', ownerId: 'load-mcp-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH0' }),
    makeManualConnection('mcp-psdiff-minus', { ownerType: 'component', ownerId: 'load-mcp-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH1' }),
    makeManualConnection('mcp-single-plus', { ownerType: 'component', ownerId: 'probe-mcp-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-mode-1', pinId: 'CH2' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-pseudodiff-review'),
    'expected MCP3208 pseudo-differential usage review'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-input-mode-review'),
    'expected MCP3208 single-ended input mode review'
  );
});

test('circuit netlist honors configured MCP3208 channel modes and VREF quality hints', () => {
  const components = [
    makeComponent({
      instanceId: 'mcp-config-1',
      templateId: 'tpl_mcp3208',
      name: 'MCP3208 Configured',
      value: 'MCP3208',
      assignedPins: { VDD: '5V', VREF: '5V', AGND: 'GND', DGND: 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-mcp-config-se',
      templateId: 'tpl_probe_sensor',
      name: 'Single Ended Probe Config',
    }),
    makeComponent({
      instanceId: 'probe-mcp-config-diff',
      templateId: 'tpl_probe_sensor',
      name: 'Pseudo Diff Probe Config',
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('mcp-config-single', { ownerType: 'component', ownerId: 'probe-mcp-config-se', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-config-1', pinId: 'CH0' }),
    makeManualConnection('mcp-config-pdiff-plus', { ownerType: 'component', ownerId: 'probe-mcp-config-diff', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'mcp-config-1', pinId: 'CH2' }),
  ], {
    adcConfigurations: {
      'mcp-config-1': {
        mcp3208: {
          vrefQuality: 'noisy',
          vrefSourceImpedanceOhms: 2200,
          channelModes: {
            CH0: 'single-ended',
            CH1: 'unused',
            CH2: 'pseudo-differential-positive',
            CH3: 'pseudo-differential-negative',
          },
        },
      },
    },
  });

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-input-mode-review' && issue.message.includes('CH0/CH1')),
    false,
    'expected configured single-ended MCP3208 channel to skip generic pair warning'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-input-mode-review' && issue.message.includes('CH2/CH3')),
    'expected configured pseudo-differential MCP3208 pair to warn when incomplete'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-quality-review'),
    'expected MCP3208 VREF quality review'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-source-impedance-review'),
    'expected MCP3208 VREF source impedance review'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-filter-review'),
    'expected MCP3208 VREF filter review when no actual RC filter network is present'
  );
});

test('circuit netlist recognizes an actual MCP3208 VREF RC filter network', () => {
  const components = [
    makeComponent({
      instanceId: 'mcp-filter-1',
      templateId: 'tpl_mcp3208',
      name: 'MCP3208 Filtered VREF',
      value: 'MCP3208',
      assignedPins: { VDD: '5V', VREF: 'VREF_FILT', AGND: 'GND', DGND: 'GND' },
    }),
    makeComponent({
      instanceId: 'mcp-filter-r',
      templateId: 'tpl_resistor',
      name: 'R_VREF_FILT',
      value: '100',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'mcp-filter-c',
      templateId: 'tpl_capacitor',
      name: 'C_VREF_FILT',
      value: '0.1uF',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('mcp-filter-r-vref', { ownerType: 'component', ownerId: 'mcp-filter-r', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-filter-1', pinId: 'VREF' }),
    makeManualConnection('mcp-filter-c-vref', { ownerType: 'component', ownerId: 'mcp-filter-c', pinId: '1' }, { ownerType: 'component', ownerId: 'mcp-filter-1', pinId: 'VREF' }),
  ], {
    adcConfigurations: {
      'mcp-filter-1': {
        mcp3208: {
          vrefQuality: 'shared-digital-rail',
        },
      },
    },
  });

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-filter-review'),
    false,
    'expected actual MCP3208 VREF RC filter network to clear the filter review'
  );
});

test('circuit netlist reviews MCP3208 VREF filter time constant against scan rate', () => {
  const components = [
    makeComponent({
      instanceId: 'mcp-scan-1',
      templateId: 'tpl_mcp3208',
      name: 'MCP3208 Scan Rate Check',
      value: 'MCP3208',
      assignedPins: { VDD: '5V', VREF: 'VREF_SCAN', AGND: 'GND', DGND: 'GND' },
    }),
    makeComponent({
      instanceId: 'mcp-scan-r',
      templateId: 'tpl_resistor',
      name: 'R_VREF_SCAN',
      value: '10k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'mcp-scan-c',
      templateId: 'tpl_capacitor',
      name: 'C_VREF_SCAN',
      value: '0.1uF',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('mcp-scan-r-wire', { ownerType: 'component', ownerId: 'mcp-scan-r', pinId: '2' }, { ownerType: 'component', ownerId: 'mcp-scan-1', pinId: 'VREF' }),
    makeManualConnection('mcp-scan-c-wire', { ownerType: 'component', ownerId: 'mcp-scan-c', pinId: '1' }, { ownerType: 'component', ownerId: 'mcp-scan-1', pinId: 'VREF' }),
  ], {
    adcConfigurations: {
      'mcp-scan-1': {
        mcp3208: {
          vrefQuality: 'shared-digital-rail',
          scanRateSps: 10_000,
        },
      },
    },
  });

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.mcp3208-vref-scan-rate-review'),
    'expected MCP3208 scan rate review when VREF RC time constant is large versus conversion period'
  );
});

test('circuit netlist accepts 6-wire load-cell sense aliases for HX711 excitation checks', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hx6-sig-plus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'A+' }),
    makeManualConnection('hx6-sig-minus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'A-' }),
    makeManualConnection('hx6-sense-plus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'S+' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'E+' }),
    makeManualConnection('hx6-sense-minus', { ownerType: 'component', ownerId: 'load-6w', pinId: 'S-' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'E-' }),
    makeManualConnection('hx6-cap-v', { ownerType: 'component', ownerId: 'c-hx6', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'VCC' }),
    makeManualConnection('hx6-cap-g', { ownerType: 'component', ownerId: 'c-hx6', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-6w', pinId: 'GND' }),
  ]);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-incomplete' || issue.ruleId === 'netlist.hx711-excitation-review'),
    false,
    'expected 6-wire load-cell sense aliases to satisfy HX711 excitation checks'
  );
});

test('circuit netlist reviews 6-wire load-cell sense lines when they do not watch the same excitation nets', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hxs-sig-plus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'A+' }),
    makeManualConnection('hxs-sig-minus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'A-' }),
    makeManualConnection('hxs-sense-plus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'S+' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'E+' }),
    makeManualConnection('hxs-sense-minus', { ownerType: 'component', ownerId: 'load-sense-1', pinId: 'S-' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'E-' }),
    makeManualConnection('hxs-cap-v', { ownerType: 'component', ownerId: 'c-hx-sense-1', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'VCC' }),
    makeManualConnection('hxs-cap-g', { ownerType: 'component', ownerId: 'c-hx-sense-1', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-sense-1', pinId: 'GND' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-sense-net-review'),
    'expected HX711 sense/excitation net review'
  );
});

test('circuit netlist reviews incomplete HX711 differential hookup and missing decoupling', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hx-load-plus', { ownerType: 'component', ownerId: 'load-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hx-1', pinId: 'INA+' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-differential-input-incomplete'),
    'expected incomplete HX711 differential pair warning'
  );
  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-decoupling-review'),
    'expected HX711 decoupling review'
  );
});

test('circuit netlist reviews HX711 module excitation wiring when load-cell E+/E- are incomplete', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hxm-a-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A+' }),
    makeManualConnection('hxm-a-minus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'A-' }),
    makeManualConnection('hxm-e-plus', { ownerType: 'component', ownerId: 'load-ex-1', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-1', pinId: 'E+' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-incomplete'),
    'expected incomplete HX711 excitation wiring warning'
  );
});

test('circuit netlist reports HX711 INB-channel usage and accepts balanced excitation wiring', () => {
  const components = [
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
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hxm2-b-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B+' }),
    makeManualConnection('hxm2-b-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'B-' }),
    makeManualConnection('hxm2-e-plus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E+' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E+' }),
    makeManualConnection('hxm2-e-minus', { ownerType: 'component', ownerId: 'load-ex-2', pinId: 'E-' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'E-' }),
    makeManualConnection('hxm2-cap-v', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '1' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'VCC' }),
    makeManualConnection('hxm2-cap-g', { ownerType: 'component', ownerId: 'c-hxm-2', pinId: '2' }, { ownerType: 'component', ownerId: 'hxm-2', pinId: 'GND' }),
  ]);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-inb-channel-review'),
    'expected INB-channel usage review'
  );
  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-excitation-incomplete' || issue.ruleId === 'netlist.hx711-excitation-review'),
    false,
    'expected balanced HX711 module excitation wiring to clear excitation warnings'
  );
});

test('circuit netlist suppresses HX711 bridge-balance review when both differential legs come from the same load cell', () => {
  const components = [
    makeComponent({
      instanceId: 'hx-2',
      templateId: 'tpl_hx711',
      name: 'HX711 Balanced Frontend',
      value: 'HX711',
      assignedPins: { VSUP: '5V', AVDD: '5V', DVDD: '3.3V', AGND: 'GND', DGND: 'GND' },
    }),
    makeComponent({
      instanceId: 'load-2',
      templateId: 'tpl_load_cell',
      name: 'Load Cell Bridge',
    }),
    makeComponent({
      instanceId: 'c-hx-2',
      templateId: 'tpl_capacitor',
      name: 'C_HX711',
      value: '0.1uF',
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, [
    makeManualConnection('hx2-load-plus', { ownerType: 'component', ownerId: 'load-2', pinId: 'SIG+' }, { ownerType: 'component', ownerId: 'hx-2', pinId: 'INA+' }),
    makeManualConnection('hx2-load-minus', { ownerType: 'component', ownerId: 'load-2', pinId: 'SIG-' }, { ownerType: 'component', ownerId: 'hx-2', pinId: 'INA-' }),
    makeManualConnection('hx2-cap-v', { ownerType: 'component', ownerId: 'c-hx-2', pinId: '1' }, { ownerType: 'component', ownerId: 'hx-2', pinId: 'AVDD' }),
    makeManualConnection('hx2-cap-g', { ownerType: 'component', ownerId: 'c-hx-2', pinId: '2' }, { ownerType: 'component', ownerId: 'hx-2', pinId: 'AGND' }),
  ]);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-bridge-balance-review'),
    false,
    'expected shared load-cell source to clear HX711 bridge-balance review'
  );
  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.hx711-decoupling-review'),
    false,
    'expected local HX711 bypass cap to clear decoupling review'
  );
});

test('circuit netlist warns when a display lacks a local decoupling capacitor', () => {
  const components = [
    makeComponent({
      instanceId: 'oled-1',
      templateId: 'tpl_oled',
      name: 'OLED 1',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        SDA: 'A4',
        SCL: 'A5',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.decoupling-capacitor-missing'),
    'expected decoupling recommendation'
  );
});

test('circuit netlist warns when an op-amp buffer lacks a local decoupling capacitor', () => {
  const components = [
    makeComponent({
      instanceId: 'buf-dec-1',
      templateId: 'tpl_op_amp_buffer',
      name: 'LM358 Buffer Stage',
      value: 'LM358',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(
      issue =>
        issue.ruleId === 'netlist.decoupling-capacitor-missing' &&
        issue.message.includes('LM358 Buffer Stage')
    ),
    'expected op-amp decoupling recommendation'
  );
});

test('circuit netlist clears op-amp decoupling warning when a 0.1uF bypass cap is present', () => {
  const components = [
    makeComponent({
      instanceId: 'buf-dec-2',
      templateId: 'tpl_op_amp_buffer',
      name: 'LM358 Buffer Stage',
      value: 'LM358',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'c-buf',
      templateId: 'tpl_capacitor',
      name: 'C_BUF',
      value: '0.1uF',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'buf-cap-vcc',
      { ownerType: 'component', ownerId: 'c-buf', pinId: '1' },
      { ownerType: 'component', ownerId: 'buf-dec-2', pinId: 'VCC' }
    ),
    makeManualConnection(
      'buf-cap-gnd',
      { ownerType: 'component', ownerId: 'c-buf', pinId: '2' },
      { ownerType: 'component', ownerId: 'buf-dec-2', pinId: 'GND' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.equal(
    result.issues.some(
      issue =>
        issue.ruleId === 'netlist.decoupling-capacitor-missing' &&
        issue.message.includes('LM358 Buffer Stage')
    ),
    false
  );
});

test('circuit netlist warns when an audio amplifier lacks a local decoupling capacitor', () => {
  const components = [
    makeComponent({
      instanceId: 'amp-dec-1',
      templateId: 'tpl_audio_amp',
      name: 'LM386 Audio Amp',
      value: 'LM386',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, []);

  assert.ok(
    result.issues.some(
      issue =>
        issue.ruleId === 'netlist.decoupling-capacitor-missing' &&
        issue.message.includes('LM386 Audio Amp')
    ),
    'expected audio amplifier decoupling recommendation'
  );
});

test('circuit netlist warns when a general op-amp stage lacks a feedback resistor path', () => {
  const components = [
    makeComponent({
      instanceId: 'op-1',
      templateId: 'tpl_general_op_amp',
      name: 'U1 General Op-Amp',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'probe-op-1',
      templateId: 'tpl_probe_sensor',
      name: 'Probe Source',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'op-src-inplus',
      { ownerType: 'component', ownerId: 'probe-op-1', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'op-1', pinId: 'IN+' }
    ),
    makeManualConnection(
      'op-out-probe',
      { ownerType: 'component', ownerId: 'op-1', pinId: 'OUT' },
      { ownerType: 'board', ownerId: 'uno', pinId: 'A1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-feedback-missing'),
    'expected op-amp feedback warning'
  );
});

test('circuit netlist warns when an AC-coupled op-amp input lacks midpoint bias resistors', () => {
  const components = [
    makeComponent({
      instanceId: 'op-2',
      templateId: 'tpl_general_op_amp',
      name: 'U2 Mic Preamp',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-2',
      templateId: 'tpl_probe_sensor',
      name: 'Mic Source',
    }),
    makeComponent({
      instanceId: 'c-in-2',
      templateId: 'tpl_capacitor',
      name: 'C_IN',
      value: '0.1uF',
    }),
    makeComponent({
      instanceId: 'rfb-2',
      templateId: 'tpl_resistor',
      name: 'R_FB',
      value: '47k',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'src-cap',
      { ownerType: 'component', ownerId: 'src-2', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'c-in-2', pinId: '1' }
    ),
    makeManualConnection(
      'cap-inplus',
      { ownerType: 'component', ownerId: 'c-in-2', pinId: '2' },
      { ownerType: 'component', ownerId: 'op-2', pinId: 'IN+' }
    ),
    makeManualConnection(
      'out-fb',
      { ownerType: 'component', ownerId: 'op-2', pinId: 'OUT' },
      { ownerType: 'component', ownerId: 'rfb-2', pinId: '1' }
    ),
    makeManualConnection(
      'fb-inminus',
      { ownerType: 'component', ownerId: 'rfb-2', pinId: '2' },
      { ownerType: 'component', ownerId: 'op-2', pinId: 'IN-' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.analog-bias-midpoint-missing'),
    'expected midpoint bias warning'
  );
});

test('circuit netlist warns when a biased op-amp midpoint lacks a bypass capacitor', () => {
  const components = [
    makeComponent({
      instanceId: 'op-3',
      templateId: 'tpl_general_op_amp',
      name: 'U3 Mic Preamp',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-3',
      templateId: 'tpl_probe_sensor',
      name: 'Mic Source',
    }),
    makeComponent({
      instanceId: 'c-in-3',
      templateId: 'tpl_capacitor',
      name: 'C_IN',
      value: '0.1uF',
    }),
    makeComponent({
      instanceId: 'rfb-3',
      templateId: 'tpl_resistor',
      name: 'R_FB',
      value: '47k',
    }),
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
  ];

  const manualConnections = [
    makeManualConnection('src3-cap', { ownerType: 'component', ownerId: 'src-3', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-3', pinId: '1' }),
    makeManualConnection('cap3-inplus', { ownerType: 'component', ownerId: 'c-in-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
    makeManualConnection('out3-fb', { ownerType: 'component', ownerId: 'op-3', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-3', pinId: '1' }),
    makeManualConnection('fb3-inminus', { ownerType: 'component', ownerId: 'rfb-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN-' }),
    makeManualConnection('bias-top', { ownerType: 'component', ownerId: 'rbias-top-3', pinId: '2' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
    makeManualConnection('bias-bot', { ownerType: 'component', ownerId: 'rbias-bot-3', pinId: '1' }, { ownerType: 'component', ownerId: 'op-3', pinId: 'IN+' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.virtual-ground-bypass-missing'),
    'expected midpoint bypass warning'
  );
});

test('circuit netlist clears core op-amp front-end warnings when feedback, midpoint bias, and bypass are present', () => {
  const components = [
    makeComponent({
      instanceId: 'op-4',
      templateId: 'tpl_general_op_amp',
      name: 'U4 Mic Preamp',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-4',
      templateId: 'tpl_probe_sensor',
      name: 'Mic Source',
    }),
    makeComponent({
      instanceId: 'c-in-4',
      templateId: 'tpl_capacitor',
      name: 'C_IN',
      value: '0.1uF',
    }),
    makeComponent({
      instanceId: 'rfb-4',
      templateId: 'tpl_resistor',
      name: 'R_FB',
      value: '47k',
    }),
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
    makeComponent({
      instanceId: 'c-mid-4',
      templateId: 'tpl_capacitor',
      name: 'C_MID',
      value: '1uF',
    }),
  ];

  const manualConnections = [
    makeManualConnection('src4-cap', { ownerType: 'component', ownerId: 'src-4', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'c-in-4', pinId: '1' }),
    makeManualConnection('cap4-inplus', { ownerType: 'component', ownerId: 'c-in-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
    makeManualConnection('out4-fb', { ownerType: 'component', ownerId: 'op-4', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-4', pinId: '1' }),
    makeManualConnection('fb4-inminus', { ownerType: 'component', ownerId: 'rfb-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN-' }),
    makeManualConnection('bias4-top', { ownerType: 'component', ownerId: 'rbias-top-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
    makeManualConnection('bias4-bot', { ownerType: 'component', ownerId: 'rbias-bot-4', pinId: '1' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
    makeManualConnection('midcap4-a', { ownerType: 'component', ownerId: 'c-mid-4', pinId: '1' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'IN+' }),
    makeManualConnection('midcap4-b', { ownerType: 'component', ownerId: 'c-mid-4', pinId: '2' }, { ownerType: 'component', ownerId: 'op-4', pinId: 'GND' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.opamp-feedback-missing'), false);
  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.analog-bias-midpoint-missing'), false);
  assert.equal(result.issues.some(issue => issue.ruleId === 'netlist.virtual-ground-bypass-missing'), false);
});

test('circuit netlist warns when an inverting op-amp input is driven without an input resistor', () => {
  const components = [
    makeComponent({
      instanceId: 'op-inv-1',
      templateId: 'tpl_general_op_amp',
      name: 'U5 Inverting Stage',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-inv-1',
      templateId: 'tpl_probe_sensor',
      name: 'Signal Source',
    }),
    makeComponent({
      instanceId: 'rfb-inv-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_INV',
      value: '47k',
    }),
  ];

  const manualConnections = [
    makeManualConnection('inv-src-direct', { ownerType: 'component', ownerId: 'src-inv-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'IN-' }),
    makeManualConnection('inv-out-fb', { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-inv-1', pinId: '1' }),
    makeManualConnection('inv-fb-back', { ownerType: 'component', ownerId: 'rfb-inv-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-inverting-input-resistor-missing'),
    'expected inverting input resistor warning'
  );
});

test('circuit netlist reviews extreme inverting op-amp gain ratios', () => {
  const components = [
    makeComponent({
      instanceId: 'op-inv-2',
      templateId: 'tpl_general_op_amp',
      name: 'U6 High Gain Stage',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-inv-2',
      templateId: 'tpl_probe_sensor',
      name: 'Signal Source',
    }),
    makeComponent({
      instanceId: 'rfb-inv-2',
      templateId: 'tpl_resistor',
      name: 'R_FB_INV',
      value: '1M',
    }),
    makeComponent({
      instanceId: 'rin-inv-2',
      templateId: 'tpl_resistor',
      name: 'R_IN_INV',
      value: '1k',
    }),
  ];

  const manualConnections = [
    makeManualConnection('inv2-src-rin', { ownerType: 'component', ownerId: 'src-inv-2', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'rin-inv-2', pinId: '1' }),
    makeManualConnection('inv2-rin-op', { ownerType: 'component', ownerId: 'rin-inv-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'IN-' }),
    makeManualConnection('inv2-out-fb', { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-inv-2', pinId: '1' }),
    makeManualConnection('inv2-fb-op', { ownerType: 'component', ownerId: 'rfb-inv-2', pinId: '2' }, { ownerType: 'component', ownerId: 'op-inv-2', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-gain-sanity-review'),
    'expected gain sanity review'
  );
});

test('circuit netlist reviews common-mode headroom when a non-rail-to-rail op-amp input sits near the upper rail', () => {
  const components = [
    makeComponent({
      instanceId: 'op-head-1',
      templateId: 'tpl_general_op_amp',
      name: 'U7 Signal Conditioner',
      value: 'LM324',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': '5V',
      },
    }),
    makeComponent({
      instanceId: 'rfb-head-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_HEAD',
      value: '10k',
    }),
  ];

  const manualConnections = [
    makeManualConnection('head-out-fb', { ownerType: 'component', ownerId: 'op-head-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-head-1', pinId: '1' }),
    makeManualConnection('head-fb-op', { ownerType: 'component', ownerId: 'rfb-head-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-head-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-common-mode-headroom-review'),
    'expected common-mode headroom review'
  );
});

test('circuit netlist reviews closed-loop bandwidth when low-GBW op-amps are used at high gain', () => {
  const components = [
    makeComponent({
      instanceId: 'op-gbw-1',
      templateId: 'tpl_general_op_amp',
      name: 'U7 High Gain Filter',
      value: 'LM358',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': 'A0',
      },
    }),
    makeComponent({
      instanceId: 'rfb-gbw-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_GBW',
      value: '1M',
    }),
    makeComponent({
      instanceId: 'rg-gbw-1',
      templateId: 'tpl_resistor',
      name: 'R_G_GBW',
      value: '10k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection('gbw-out-fb', { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-gbw-1', pinId: '1' }),
    makeManualConnection('gbw-fb-inv', { ownerType: 'component', ownerId: 'rfb-gbw-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'IN-' }),
    makeManualConnection('gbw-g-inv', { ownerType: 'component', ownerId: 'rg-gbw-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-gbw-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-gbw-review'),
    'expected GBW review on low-GBW high-gain stage'
  );
});

test('circuit netlist reviews output swing headroom when non-rail-to-rail op-amp output is pushed near the upper rail', () => {
  const components = [
    makeComponent({
      instanceId: 'op-headroom-1',
      templateId: 'tpl_general_op_amp',
      name: 'U8 ADC Driver',
      value: 'LM358',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': '3.3V',
        OUT: 'A1',
      },
    }),
    makeComponent({
      instanceId: 'rfb-headroom-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_HEADROOM',
      value: '100k',
    }),
    makeComponent({
      instanceId: 'rg-headroom-1',
      templateId: 'tpl_resistor',
      name: 'R_G_HEADROOM',
      value: '10k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection('headroom-out-fb', { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-headroom-1', pinId: '1' }),
    makeManualConnection('headroom-fb-inv', { ownerType: 'component', ownerId: 'rfb-headroom-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'IN-' }),
    makeManualConnection('headroom-g-inv', { ownerType: 'component', ownerId: 'rg-headroom-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-headroom-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-output-headroom-review'),
    'expected output swing headroom review near positive rail'
  );
});

test('circuit netlist suppresses upper-rail swing and common-mode reviews for rail-to-rail op-amps from part_master', () => {
  const components = [
    makeComponent({
      instanceId: 'op-r2r-1',
      templateId: 'tpl_general_op_amp',
      name: 'U9 Precision ADC Driver',
      value: 'MCP6002',
      assignedPins: {
        VCC: '3.3V',
        GND: 'GND',
        'IN+': '3.3V',
        OUT: 'G25',
      },
    }),
    makeComponent({
      instanceId: 'rfb-r2r-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_R2R',
      value: '100k',
    }),
    makeComponent({
      instanceId: 'rg-r2r-1',
      templateId: 'tpl_resistor',
      name: 'R_G_R2R',
      value: '10k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection('r2r-out-fb', { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-r2r-1', pinId: '1' }),
    makeManualConnection('r2r-fb-inv', { ownerType: 'component', ownerId: 'rfb-r2r-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'IN-' }),
    makeManualConnection('r2r-g-inv', { ownerType: 'component', ownerId: 'rg-r2r-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-r2r-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'esp32', resolveTemplate, manualConnections);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-output-headroom-review'),
    false
  );
  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-common-mode-headroom-review'),
    false
  );
});

test('circuit netlist reviews extreme non-inverting gain ratios', () => {
  const components = [
    makeComponent({
      instanceId: 'op-ninv-1',
      templateId: 'tpl_general_op_amp',
      name: 'U8 Non-Inverting Stage',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': 'A0',
      },
    }),
    makeComponent({
      instanceId: 'rfb-ninv-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_NINV',
      value: '1M',
    }),
    makeComponent({
      instanceId: 'rg-ninv-1',
      templateId: 'tpl_resistor',
      name: 'R_G_NINV',
      value: '1k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection('ninv-out-fb', { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-ninv-1', pinId: '1' }),
    makeManualConnection('ninv-fb-inv', { ownerType: 'component', ownerId: 'rfb-ninv-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'IN-' }),
    makeManualConnection('ninv-g-inv', { ownerType: 'component', ownerId: 'rg-ninv-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-ninv-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-noninverting-gain-sanity-review'),
    'expected non-inverting gain sanity review'
  );
});

test('circuit netlist reviews very large op-amp input resistances for bias-current sensitivity', () => {
  const components = [
    makeComponent({
      instanceId: 'op-bias-1',
      templateId: 'tpl_general_op_amp',
      name: 'U9 Bias Sensitive Stage',
      value: 'LM358',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'src-bias-1',
      templateId: 'tpl_probe_sensor',
      name: 'Signal Source',
    }),
    makeComponent({
      instanceId: 'rin-bias-1',
      templateId: 'tpl_resistor',
      name: 'R_IN_BIAS',
      value: '1M',
    }),
    makeComponent({
      instanceId: 'rfb-bias-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_BIAS',
      value: '1M',
    }),
  ];

  const manualConnections = [
    makeManualConnection('bias-src-rin', { ownerType: 'component', ownerId: 'src-bias-1', pinId: 'AOut' }, { ownerType: 'component', ownerId: 'rin-bias-1', pinId: '1' }),
    makeManualConnection('bias-rin-inv', { ownerType: 'component', ownerId: 'rin-bias-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN-' }),
    makeManualConnection('bias-out-fb', { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-bias-1', pinId: '1' }),
    makeManualConnection('bias-fb-inv', { ownerType: 'component', ownerId: 'rfb-bias-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN-' }),
    makeManualConnection('bias-plus-gnd', { ownerType: 'component', ownerId: 'op-bias-1', pinId: 'IN+' }, { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-input-bias-current-review'),
    'expected input bias current review'
  );
});

test('circuit netlist warns when op-amp gain can push an ADC-connected output beyond the reference range', () => {
  const components = [
    makeComponent({
      instanceId: 'op-adc-1',
      templateId: 'tpl_general_op_amp',
      name: 'U10 ADC Driver',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        'IN+': '3.3V',
        OUT: 'G25',
      },
    }),
    makeComponent({
      instanceId: 'rfb-adc-1',
      templateId: 'tpl_resistor',
      name: 'R_FB_ADC',
      value: '100k',
    }),
    makeComponent({
      instanceId: 'rg-adc-1',
      templateId: 'tpl_resistor',
      name: 'R_G_ADC',
      value: '10k',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection('adc-out-fb', { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'OUT' }, { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '1' }),
    makeManualConnection('adc-fb-inv', { ownerType: 'component', ownerId: 'rfb-adc-1', pinId: '2' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
    makeManualConnection('adc-g-inv', { ownerType: 'component', ownerId: 'rg-adc-1', pinId: '1' }, { ownerType: 'component', ownerId: 'op-adc-1', pinId: 'IN-' }),
  ];

  const result = analyzeCircuitNetlist(components, 'esp32', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.ruleId === 'netlist.opamp-output-adc-range-review'),
    'expected ADC range review from op-amp gain'
  );
});

test('circuit netlist traces low-impedance short path between power and ground rails', () => {
  const components = [
    makeComponent({
      instanceId: 'l1',
      templateId: 'tpl_inductor',
      name: 'L1',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r0',
      templateId: 'tpl_resistor',
      name: 'R0',
      value: '0.05',
      assignedPins: { '2': 'GND' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-short-trace',
      { ownerType: 'component', ownerId: 'l1', pinId: '2' },
      { ownerType: 'component', ownerId: 'r0', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const traceIssue = result.issues.find(issue => issue.ruleId === 'netlist.power-short.trace');

  assert.ok(traceIssue, 'expected low-impedance short path issue');
  assert.match(traceIssue?.message ?? '', /L1/);
  assert.match(traceIssue?.message ?? '', /R0/);
});

test('circuit netlist validates I2C pull-up impedance and voltage domain', () => {
  const components = [
    makeComponent({
      instanceId: 'i2c-sensor-1',
      templateId: 'tpl_i2c_sensor_33',
      name: 'IMU 1',
      assignedPins: {
        VCC: '3.3V',
        GND: 'GND',
        SDA: 'A4',
        SCL: 'A5',
      },
    }),
    makeComponent({
      instanceId: 'r-sda',
      templateId: 'tpl_resistor',
      name: 'R_SDA',
      value: '20k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r-scl-a',
      templateId: 'tpl_resistor',
      name: 'R_SCL_A',
      value: '1.5k',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r-scl-b',
      templateId: 'tpl_resistor',
      name: 'R_SCL_B',
      value: '1.5k',
      assignedPins: { '1': '5V' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-sda',
      { ownerType: 'component', ownerId: 'r-sda', pinId: '2' },
      { ownerType: 'component', ownerId: 'i2c-sensor-1', pinId: 'SDA' }
    ),
    makeManualConnection(
      'conn-scl-a',
      { ownerType: 'component', ownerId: 'r-scl-a', pinId: '2' },
      { ownerType: 'component', ownerId: 'i2c-sensor-1', pinId: 'SCL' }
    ),
    makeManualConnection(
      'conn-scl-b',
      { ownerType: 'component', ownerId: 'r-scl-b', pinId: '2' },
      { ownerType: 'component', ownerId: 'i2c-sensor-1', pinId: 'SCL' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.ok(
    result.issues.some(issue => issue.code === 'bus.i2c-impedance-voltage.pullup-too-weak'),
    'expected weak SDA pull-up warning'
  );
  assert.ok(
    result.issues.some(issue => issue.code === 'bus.i2c-impedance-voltage.pullup-too-strong'),
    'expected strong SCL pull-up warning'
  );
  assert.ok(
    result.issues.some(issue => issue.code === 'bus.i2c-impedance-voltage.level-mismatch'),
    'expected pull-up voltage mismatch warning'
  );
});

test('circuit netlist separates exact missing I2C pull-ups from module pull-up uncertainty', () => {
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
  const genericModuleTemplate = makeTemplate({
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

  const exactResult = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'exact-i2c-1',
        templateId: 'tpl_exact_i2c_ic',
        name: 'Exact I2C IC',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
    'uno',
    templateId => ({ tpl_exact_i2c_ic: exactI2cTemplate })[templateId],
    []
  );
  const exactIssue = exactResult.issues.find(issue => issue.code === 'bus.i2c-impedance-voltage.missing-pullup');

  assert.equal(exactIssue?.severity, 'error');
  assert.equal(exactIssue?.confidence, 'strong-inference');

  const genericResult = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'generic-i2c-1',
        templateId: 'tpl_generic_i2c_module',
        name: 'Generic I2C Module',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
    'uno',
    templateId => ({ tpl_generic_i2c_module: genericModuleTemplate })[templateId],
    []
  );
  const genericIssue = genericResult.issues.find(issue => issue.code === 'bus.i2c-impedance-voltage.missing-pullup');

  assert.equal(genericIssue?.severity, 'warning');
  assert.equal(genericIssue?.confidence, 'needs-review');
  assert.ok(genericIssue?.evidence?.assumptions.some(line => line.includes('generic/module')));
});

test('circuit netlist accepts declared onboard I2C pull-ups when no external resistor is visible', () => {
  const moduleTemplate = makeTemplate({
    id: 'tpl_onboard_i2c_pullup_module',
    name: 'I2C Module With Onboard Pullups',
    compatibleVoltage: '3.3V',
    category: 'SENSOR',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SDA', allowedTypes: ['ANALOG'] },
      { name: 'SCL', allowedTypes: ['ANALOG'] },
    ],
    design: {
      datasheetStatus: 'official-partial',
      preferredInterface: 'I2C',
      pullups: [
        { pins: ['SDA'], source: 'onboard', resistanceOhms: 4_700 },
        { pins: ['SCL'], source: 'onboard', resistanceOhms: 4_700 },
      ],
    },
  });

  const result = analyzeCircuitNetlist(
    [
      makeComponent({
        instanceId: 'module-i2c-1',
        templateId: 'tpl_onboard_i2c_pullup_module',
        name: 'I2C Module',
        assignedPins: { VCC: '3.3V', GND: 'GND', SDA: 'A4', SCL: 'A5' },
      }),
    ],
    'uno',
    templateId => ({ tpl_onboard_i2c_pullup_module: moduleTemplate })[templateId],
    []
  );

  assert.equal(
    result.issues.some(issue => issue.code === 'bus.i2c-impedance-voltage.missing-pullup'),
    false
  );
});

test('circuit netlist flags imported pinout mismatch against canonical pin mapping', () => {
  const diode = makeComponent({
    instanceId: 'd-imported',
    templateId: 'tpl_diode',
    name: 'D Imported',
  });

  diode.importedMapping = {
    confidence: 'high',
    source: 'kicad-library',
    footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
  };
  diode.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'A', label: 'A', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'K', label: 'K', number: '2', at: { x: 1, y: 0 }, angle: 180, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([diode], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected imported pinout mismatch issue');
  assert.match(issue?.message ?? '', /A: 심볼 1번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /K: 심볼 2번 \/ 기대 1번/);
});

test('circuit netlist accepts Central 2N2222A TO-18 lead code', () => {
  const transistor = makeComponent({
    instanceId: 'q-2n2222a',
    templateId: 'tpl_transistor_npn',
    name: '2N2222A',
    value: '2N2222A',
  });

  transistor.importedMapping = {
    confidence: 'medium',
    source: 'refdes',
    footprint: 'digikey-footprints:TO-18-3',
    libraryId: 'dk_Transistors-Bipolar-BJT-Single:2N2222A',
  };
  transistor.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'E', label: 'E', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'B', label: 'B', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'C', label: 'C', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([transistor], 'kicad_generic', resolveTemplate, []);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'electrical.pinout-mismatch'),
    false
  );
});

test('circuit netlist flags clear symbol and footprint family mismatches', () => {
  const terminal = makeComponent({
    instanceId: 'j-terminal',
    templateId: 'kicad_dk_terminal_blocks_wire_to_board_osttc020162',
    name: 'OSTTC020162',
  });
  terminal.importedReference = 'J1';
  terminal.importedMapping = {
    confidence: 'low',
    source: 'custom-fallback',
    footprint: 'Capacitor_THT:C_Disc_D12.0mm_W4.4mm_P7.75mm',
    libraryId: 'dk_Terminal-Blocks-Wire-to-Board:OSTTC020162',
  };

  const microphone = makeComponent({
    instanceId: 'mk-mic',
    templateId: 'kicad_microphone',
    name: 'Microphone',
  });
  microphone.importedReference = 'MK1';
  microphone.importedMapping = {
    confidence: 'low',
    source: 'custom-fallback',
    footprint: 'Inductor_THT:L_Radial_D10.5mm_P5.00mm_Abacron_AISR-01',
    libraryId: 'Device:Microphone',
  };

  const result = analyzeCircuitNetlist(
    [terminal, microphone],
    'kicad_generic',
    resolveTemplate,
    []
  );
  const issues = result.issues.filter(issue => issue.ruleId === 'electrical.symbol-footprint-family-mismatch');

  assert.equal(issues.length, 2);
  assert.ok(issues.some(issue => issue.componentName === 'OSTTC020162'));
  assert.ok(issues.some(issue => issue.componentName === 'Microphone'));
  assert.ok(issues.every(issue => (issue.evidence?.observedFacts.length ?? 0) >= 4));
});

test('circuit netlist flags imported MOSFET pinout mismatch from native pin roles', () => {
  const mosfet = makeComponent({
    instanceId: 'q-imported',
    templateId: 'tpl_mosfet',
    name: 'Q1 MOSFET',
    value: 'IRLZ44N',
  });

  mosfet.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_TO_SOT_THT:TO-220-3_Vertical',
    libraryId: 'Transistor_FET:Q_NMOS_GDS',
  };
  mosfet.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'G', label: 'Gate', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'D', label: 'Drain', number: '1', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'S', label: 'Source', number: '2', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([mosfet], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected MOSFET pinout mismatch issue');
  assert.match(issue?.message ?? '', /MOSFET/);
  assert.match(issue?.message ?? '', /G: 심볼 3번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /D: 심볼 1번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /S: 심볼 2번 \/ 기대 3번/);
});

test('circuit netlist flags imported LDO regulator pinout mismatch from native pin roles', () => {
  const regulator = makeComponent({
    instanceId: 'u-reg',
    templateId: 'tpl_ldo_regulator',
    name: 'U5 LDO',
    value: 'AMS1117-5.0',
  });

  regulator.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
    libraryId: 'Regulator_Linear:AMS1117-5.0',
  };
  regulator.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'VIN', label: 'VI', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '1', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VOUT', label: 'VO', number: '2', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([regulator], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected LDO pinout mismatch issue');
  assert.match(issue?.message ?? '', /LDO\/레귤레이터/);
  assert.match(issue?.message ?? '', /VIN: 심볼 3번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /GND: 심볼 1번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /VOUT: 심볼 2번 \/ 기대 3번/);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['u-reg:VIN', 'u-reg:GND', 'u-reg:VOUT']);
});

test('circuit netlist flags imported adjustable regulator pinout mismatch with ADJ role aliases', () => {
  const regulator = makeComponent({
    instanceId: 'u-adj',
    templateId: 'tpl_ldo_regulator',
    name: 'U9 Adjustable Regulator',
    value: 'LM317',
  });

  regulator.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_TO_SOT_THT:TO-220-3_Vertical',
    libraryId: 'Regulator_Linear:LM317_TO220',
  };
  regulator.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'VI', label: 'VI', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VO', label: 'VO', number: '3', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'ADJUST', label: 'ADJUST', number: '2', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([regulator], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected adjustable regulator pinout mismatch issue');
  assert.match(issue?.message ?? '', /가변 레귤레이터/);
  assert.match(issue?.message ?? '', /ADJ: 심볼 2번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /VOUT: 심볼 3번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /VIN: 심볼 1번 \/ 기대 3번/);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['u-adj:ADJUST', 'u-adj:VO', 'u-adj:VI']);
});

test('circuit netlist parses embedded resistor notation without fallback side effects', () => {
  const components = [
    makeComponent({
      instanceId: 'r-emb-top',
      templateId: 'tpl_resistor',
      name: 'R Emb Top',
      value: '4k7',
      assignedPins: { '1': '5V' },
    }),
    makeComponent({
      instanceId: 'r-emb-bottom',
      templateId: 'tpl_resistor',
      name: 'R Emb Bottom',
      value: '4k7',
      assignedPins: { '2': 'GND' },
    }),
    makeComponent({
      instanceId: 'probe-emb',
      templateId: 'tpl_probe_sensor',
      name: 'Probe Emb',
      assignedPins: { AOut: 'A0' },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-emb-1',
      { ownerType: 'component', ownerId: 'r-emb-top', pinId: '2' },
      { ownerType: 'component', ownerId: 'probe-emb', pinId: 'AOut' }
    ),
    makeManualConnection(
      'conn-emb-2',
      { ownerType: 'component', ownerId: 'probe-emb', pinId: 'AOut' },
      { ownerType: 'component', ownerId: 'r-emb-bottom', pinId: '1' }
    ),
  ];

  const result = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);

  assert.equal(
    result.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'),
    false
  );
});

test('circuit netlist parses common resistor value labels as ohms', () => {
  const cases = [
    { value: '10Kohm', expectedOhms: 10_000 },
    { value: '10 kohm', expectedOhms: 10_000 },
    { value: '10KΩ', expectedOhms: 10_000 },
    { value: '330ohm', expectedOhms: 330 },
    { value: '330 Ohm', expectedOhms: 330 },
    { value: '330R', expectedOhms: 330 },
    { value: '4.7kΩ', expectedOhms: 4_700 },
  ];

  for (const { value, expectedOhms } of cases) {
    const result = analyzeCircuitNetlist(
      [
        makeComponent({
          instanceId: `r-${value}`,
          templateId: 'tpl_resistor',
          name: `R ${value}`,
          value,
          assignedPins: { '1': '5V', '2': 'GND' },
        }),
      ],
      'uno',
      resolveTemplate,
      [],
    );

    assert.equal(result.resistors.length, 1);
    assert.equal(result.resistors[0]?.resistanceOhms, expectedOhms, value);
    assert.equal(
      result.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'),
      false,
      value
    );
  }
});

test('circuit netlist clears imported pinout mismatch when saved overrides match expected pads', () => {
  const diode = makeComponent({
    instanceId: 'd-fixed',
    templateId: 'tpl_diode',
    name: 'D2',
    value: '1N4007',
  });

  diode.importedMapping = {
    confidence: 'high',
    source: 'kicad-library',
    footprint: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
  };
  diode.footprintPinPadOverrides = {
    A: '2',
    K: '1',
  };
  diode.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'A', label: 'A', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'K', label: 'K', number: '2', at: { x: 1, y: 0 }, angle: 180, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([diode], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.equal(issue, undefined);
});

test('circuit netlist flags imported op-amp buffer pinout mismatch from native pin roles', () => {
  const buffer = makeComponent({
    instanceId: 'u-buffer',
    templateId: 'tpl_op_amp_buffer',
    name: 'U7 Buffer',
    value: 'LM358 Buffer',
  });

  buffer.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-8_W7.62mm',
    libraryId: 'Amplifier_Operational:LM358',
  };
  buffer.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'OUT', number: '7', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'IN', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '4', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([buffer], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected op-amp buffer pinout mismatch issue');
  assert.match(issue?.message ?? '', /OP-Amp 버퍼/);
  assert.match(issue?.message ?? '', /OUT: 심볼 7번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /IN: 심볼 2번 \/ 기대 3번/);
});

test('circuit netlist flags imported audio amplifier pinout mismatch for LM386-style packages', () => {
  const amp = makeComponent({
    instanceId: 'u-audio',
    templateId: 'tpl_audio_amp',
    name: 'U7 Audio Amplifier',
    value: 'LM386',
  });

  amp.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-8_W7.62mm',
    libraryId: 'Amplifier_Audio:LM386',
  };
  amp.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '3', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '5', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([amp], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected audio amplifier pinout mismatch issue');
  assert.match(issue?.message ?? '', /오디오 앰프/);
  assert.match(issue?.message ?? '', /IN: 심볼 2번 \/ 기대 3번/);
  assert.match(issue?.message ?? '', /GND: 심볼 3번 \/ 기대 4번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 6번 \/ 기대 5번/);
  assert.match(issue?.message ?? '', /VCC: 심볼 5번 \/ 기대 6번/);
});

test('circuit netlist flags imported ULN2803-style driver pinout mismatch with 18-pin expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-driver-2803',
    templateId: 'tpl_driver_ic',
    name: 'U10 Driver Array',
    value: 'ULN2803A',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-18_W7.62mm',
    libraryId: 'Driver_Array:ULN2803A',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'COM', number: '9', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT', number: '17', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected ULN2803 pinout mismatch issue');
  assert.match(issue?.message ?? '', /8채널 드라이버 어레이/);
  assert.match(issue?.message ?? '', /IN: 심볼 2번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /GND: 심볼 8번 \/ 기대 9번/);
  assert.match(issue?.message ?? '', /COM: 심볼 9번 \/ 기대 10번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 17번 \/ 기대 18번/);
});

test('circuit netlist flags imported ULN2003-style driver pinout mismatch with 16-pin expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-driver-2003',
    templateId: 'tpl_driver_ic',
    name: 'U12 Driver Array',
    value: 'ULN2003A',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-16_W7.62mm',
    libraryId: 'Driver_Array:ULN2003A',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'COM', number: '8', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT', number: '15', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected ULN2003 pinout mismatch issue');
  assert.match(issue?.message ?? '', /7채널 드라이버 어레이/);
  assert.match(issue?.message ?? '', /IN: 심볼 2번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /GND: 심볼 7번 \/ 기대 8번/);
  assert.match(issue?.message ?? '', /COM: 심볼 8번 \/ 기대 9번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 15번 \/ 기대 16번/);
});

test('circuit netlist flags imported ULN2004-style driver pinout mismatch with 16-pin expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-driver-2004',
    templateId: 'tpl_driver_ic',
    name: 'U15 Driver Array',
    value: 'ULN2004A',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-16_W7.62mm',
    libraryId: 'Driver_Array:ULN2004A',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'COM', number: '8', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT', number: '14', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected ULN2004 pinout mismatch issue');
  assert.match(issue?.message ?? '', /7채널 드라이버 어레이/);
  assert.match(issue?.message ?? '', /IN: 심볼 3번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /GND: 심볼 7번 \/ 기대 8번/);
  assert.match(issue?.message ?? '', /COM: 심볼 8번 \/ 기대 9번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 14번 \/ 기대 16번/);
});

test('circuit netlist flags imported ULN2804-style driver pinout mismatch with 18-pin expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-driver-2804',
    templateId: 'tpl_driver_ic',
    name: 'U13 Driver Array',
    value: 'ULN2804A',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_DIP:DIP-18_W7.62mm',
    libraryId: 'Driver_Array:ULN2804A',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '10', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'COM', number: '11', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT', number: '16', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected ULN2804 pinout mismatch issue');
  assert.match(issue?.message ?? '', /8채널 드라이버 어레이/);
  assert.match(issue?.message ?? '', /IN: 심볼 3번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /GND: 심볼 10번 \/ 기대 9번/);
  assert.match(issue?.message ?? '', /COM: 심볼 11번 \/ 기대 10번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 16번 \/ 기대 18번/);
});

test('circuit netlist flags imported gate driver pinout mismatch with dedicated driver expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-gate-driver',
    templateId: 'tpl_driver_ic',
    name: 'U11 Gate Driver',
    value: 'IR2101',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    libraryId: 'Driver_FET:IR2101',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'VCC', label: 'VCC', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'IN', number: '3', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'HO', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'COM', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected gate driver pinout mismatch issue');
  assert.match(issue?.message ?? '', /게이트 드라이버 IC/);
  assert.match(issue?.message ?? '', /VCC: 심볼 1번 \/ 기대 3번/);
  assert.match(issue?.message ?? '', /IN: 심볼 3번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 6번 \/ 기대 7번/);
  assert.match(issue?.message ?? '', /GND: 심볼 4번 \/ 기대 5번/);
});

test('circuit netlist flags imported L298 bridge driver mismatch with bridge-specific expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver',
    templateId: 'tpl_driver_ic',
    name: 'U14 H-Bridge Driver',
    value: 'L298N',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_SO:Multiwatt-15',
    libraryId: 'Driver_Motor:L298N',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'OUT1', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VS', number: '5', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'IN1', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'ENA', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '9', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VSS', number: '10', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected bridge driver pinout mismatch issue');
  assert.match(issue?.message ?? '', /브리지 모터 드라이버/);
  assert.match(issue?.message ?? '', /OUT: 심볼 3번 \/ 기대 2번/);
  assert.match(issue?.message ?? '', /VIN: 심볼 5번 \/ 기대 4번/);
  assert.match(issue?.message ?? '', /IN: 심볼 6번 \/ 기대 5번/);
  assert.match(issue?.message ?? '', /EN: 심볼 7번 \/ 기대 6번/);
  assert.match(issue?.message ?? '', /GND: 심볼 9번 \/ 기대 8번/);
  assert.match(issue?.message ?? '', /VCC: 심볼 10번 \/ 기대 9번/);
});

test('circuit netlist routes DRV8833-family parts through the bridge-driver rule', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-drv8833',
    templateId: 'tpl_driver_ic',
    name: 'U17 Motor Driver',
    value: 'DRV8833',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_SO:HTSSOP-16',
    libraryId: 'Driver_Motor:DRV8833',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'AOUT1', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '5', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'AIN1', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'ENABLE', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '9', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '10', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8833 bridge-driver mismatch issue');
  assert.match(issue?.message ?? '', /브리지 모터 드라이버/);
});

test('circuit netlist normalizes TB6612-style bridge driver aliases for EN IN and OUT roles', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-tb6612',
    templateId: 'tpl_driver_ic',
    name: 'U12 Motor Driver',
    value: 'TB6612FNG',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_SO:SSOP-24',
    libraryId: 'Driver_Motor:TB6612FNG',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'PWMA', label: 'PWMA', number: '6', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AIN1', label: 'AIN1', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AO1', label: 'AO1', number: '9', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '24', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '20', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'PGND', label: 'PGND', number: '3', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected TB6612 bridge-driver mismatch issue');
  assert.match(issue?.message ?? '', /브리지 모터 드라이버/);
  assert.match(issue?.message ?? '', /IN: 심볼 7번 \/ 기대 5번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 9번 \/ 기대 2번/);
  assert.doesNotMatch(issue?.message ?? '', /EN:/);
  assert.match(issue?.recommendation ?? '', /TB6612/);
  assert.match(issue?.recommendation ?? '', /PWMA|PWMB/);
});

test('circuit netlist recognizes HiLetgo-style TB6612 carriers as bridge-driver breakouts', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-tb6612-hiletgo',
    templateId: 'tpl_driver_ic',
    name: 'HiLetgo TB6612 Motor Driver',
    value: 'TB6612 breakout board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:HiLetgo_TB6612',
    libraryId: 'Driver_Motor:TB6612_HiLetgo',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'PWMA', label: 'PWMA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AIN1', label: 'AIN1', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AO1', label: 'AO1', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'PGND', label: 'PGND', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected HiLetgo TB6612 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /VM\/VCC\/PGND/);
});

test('circuit netlist recognizes DIYmore-style TB6612 carriers as bridge-driver breakouts', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-tb6612-diymore',
    templateId: 'tpl_driver_ic',
    name: 'DIYmore TB6612 Motor Driver',
    value: 'TB6612 carrier board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:DIYmore_TB6612',
    libraryId: 'Driver_Motor:TB6612_DIYmore',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'PWMA', label: 'PWMA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AIN1', label: 'AIN1', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'AO1', label: 'AO1', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'PGND', label: 'PGND', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DIYmore TB6612 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6612 브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /PWMA\/PWMB|STBY/);
});

test('circuit netlist recognizes MakerHawk-style DRV8833 bridge modules as breakout carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-drv8833-makerhawk',
    templateId: 'tpl_driver_ic',
    name: 'MakerHawk DRV8833 Module',
    value: 'DRV8833 carrier board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:MakerHawk_DRV8833',
    libraryId: 'Driver_Motor:DRV8833_MakerHawk',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'VIN', label: 'VM', number: '4', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN1', label: 'AIN1', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN2', label: 'AIN2', number: '1', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'AOUT1', number: '3', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '16', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected MakerHawk DRV8833 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /브리지 드라이버 브레이크아웃\/캐리어/);
});

test('circuit netlist routes DRV8876-family parts through the bridge-driver rule', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8876',
    templateId: 'tpl_driver_ic',
    name: 'U19 Driver',
    value: 'DRV8876',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Package_SO:HTSSOP',
    libraryId: 'Driver_Motor:DRV8876',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN1', label: 'IN1', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT1', label: 'OUT1', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '11', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'NSLEEP', label: 'nSLEEP', number: '1', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'PGND', label: 'PGND', number: '12', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8876 bridge-driver mismatch issue');
  assert.match(issue?.message ?? '', /브리지 모터 드라이버/);
  assert.match(issue?.recommendation ?? '', /DRV8871\/DRV8876/);
  assert.match(issue?.recommendation ?? '', /OUT1\/OUT2/);
});

test('circuit netlist recognizes breakout-style DRV8876 modules and points at module silkscreen order', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8876-breakout',
    templateId: 'tpl_driver_ic',
    name: 'Pololu DRV8876 Carrier',
    value: 'DRV8876 breakout',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Pololu_DRV8876_Carrier',
    libraryId: 'Driver_Motor:DRV8876_Pololu',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN1', label: 'IN1', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT1', label: 'OUT1', number: '7', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '11', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'NSLEEP', label: 'nSLEEP', number: '1', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'PGND', label: 'PGND', number: '12', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8876 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /OUT1\/OUT2/);
});

test('circuit netlist recognizes Keyestudio-style DRV8876 modules as bridge-driver carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8876-keyestudio',
    templateId: 'tpl_driver_ic',
    name: 'Keyestudio DRV8876 Motor Driver',
    value: 'DRV8876 carrier board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Keyestudio_DRV8876',
    libraryId: 'Driver_Motor:DRV8876_Keyestudio',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN1', label: 'IN1', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN2', label: 'IN2', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT1', label: 'OUT1', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT2', label: 'OUT2', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VM', label: 'VM', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'NSLEEP', label: 'nSLEEP', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Keyestudio DRV8876 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8871\/DRV8876 브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /부하 단자와 전원 단자/);
});

test('circuit netlist recognizes Makerbase-style DRV8825 stepper modules as breakout carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8825-makerbase',
    templateId: 'tpl_driver_ic',
    name: 'Makerbase DRV8825 StepStick',
    value: 'DRV8825 module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:MKS_DRV8825_StepStick',
    libraryId: 'Driver_Motor:DRV8825_Makerbase',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RESET', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Makerbase DRV8825 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8825 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});

test('circuit netlist recognizes Waveshare-style DRV8833 bridge modules as breakout carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8833-waveshare',
    templateId: 'tpl_driver_ic',
    name: 'Waveshare DRV8833 breakout',
    value: 'DRV8833 motor driver',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Waveshare_DRV8833',
    libraryId: 'Driver_Motor:DRV8833_Waveshare',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'AOUT1', number: '3', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '5', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'AIN1', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'nSLEEP', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '9', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '10', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Waveshare DRV8833 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /VM\/VBAT/);
});

test('circuit netlist recognizes Makerbase-style DRV8833 bridge modules as breakout carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8833-makerbase',
    templateId: 'tpl_driver_ic',
    name: 'Makerbase DRV8833 Module',
    value: 'MKS DRV8833 motor driver',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:MKS_DRV8833',
    libraryId: 'Driver_Motor:DRV8833_Makerbase',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'BOUT2', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '5', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'BIN1', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'nSLEEP', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '9', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '10', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Makerbase DRV8833 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /브리지 드라이버 브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /VM\/VBAT/);
});

test('circuit netlist recognizes SunFounder-style DRV8833 bridge modules as breakout carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8833-sunfounder',
    templateId: 'tpl_driver_ic',
    name: 'SunFounder DRV8833 Carrier',
    value: 'DRV8833 breakout board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:SunFounder_DRV8833',
    libraryId: 'Driver_Motor:DRV8833_SunFounder',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'OUT', label: 'AOUT2', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VBAT', number: '5', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'IN', label: 'AIN2', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'nSLEEP', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '9', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '10', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected SunFounder DRV8833 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /브리지 드라이버 브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /VM\/VBAT/);
});

test('circuit netlist recognizes Cytron-style DRV8876 modules as bridge-driver carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-bridge-driver-drv8876-cytron',
    templateId: 'tpl_driver_ic',
    name: 'Cytron DRV8876 Motor Driver',
    value: 'DRV8876 carrier module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Cytron_DRV8876',
    libraryId: 'Driver_Motor:DRV8876_Cytron',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'IN', label: 'IN1', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'OUT1', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'nSLEEP', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Cytron DRV8876 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8871\/DRV8876 브레이크아웃\/캐리어/);
  assert.match(issue?.recommendation ?? '', /부하 단자와 전원 단자/);
});

test('circuit netlist recognizes Pololu-style DRV8880 carriers as stepper modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8880-pololu',
    templateId: 'tpl_driver_ic',
    name: 'Pololu DRV8880 Carrier',
    value: 'DRV8880 stepper module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Pololu_DRV8880_Carrier',
    libraryId: 'Driver_Motor:DRV8880_Pololu',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8880 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8880 캐리어/);
  assert.match(issue?.recommendation ?? '', /nSLEEP\/STEP\/DIR/);
});

test('circuit netlist recognizes Pimoroni-style DRV8880 carriers as stepper modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8880-pimoroni',
    templateId: 'tpl_driver_ic',
    name: 'Pimoroni DRV8880 Carrier',
    value: 'DRV8880 stepper driver module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Pimoroni_DRV8880',
    libraryId: 'Driver_Motor:DRV8880_Pimoroni',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '2A', number: '12', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Pimoroni DRV8880 carrier mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8880 캐리어/);
  assert.match(issue?.recommendation ?? '', /nSLEEP\/STEP\/DIR/);
});

test('circuit netlist recognizes Makerbase-style DRV8834 carriers as stepper breakouts', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8834-makerbase',
    templateId: 'tpl_driver_ic',
    name: 'Makerbase DRV8834 Carrier',
    value: 'DRV8834 module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:MKS_DRV8834_Carrier',
    libraryId: 'Driver_Motor:DRV8834_Makerbase',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VINT', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8834 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8834 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VM\/VINT\/GND/);
});

test('circuit netlist recognizes Cytron-style DRV8834 carriers as stepper breakouts', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8834-cytron',
    templateId: 'tpl_driver_ic',
    name: 'Cytron DRV8834 Carrier',
    value: 'DRV8834 breakout',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Cytron_DRV8834',
    libraryId: 'Driver_Motor:DRV8834_Cytron',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VINT', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '2B', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Cytron DRV8834 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8834 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VM\/VINT\/GND/);
});

test('circuit netlist recognizes StepperOnline-style TB6600 terminal modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb6600-stepperonline',
    templateId: 'tpl_driver_ic',
    name: 'StepperOnline TB6600 module',
    value: 'TB6600 driver',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:StepperOnline_TB6600',
    libraryId: 'Driver_Motor:TB6600_StepperOnline',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'PUL', number: '6', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '11', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '12', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '15', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected TB6600 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6600 단자대형 모듈/);
  assert.match(issue?.recommendation ?? '', /PUL\/DIR\/ENA/);
});

test('circuit netlist recognizes Geekcreit-style TB6600 terminal modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb6600-geekcreit',
    templateId: 'tpl_driver_ic',
    name: 'Geekcreit TB6600 module',
    value: 'TB6600 driver board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Geekcreit_TB6600',
    libraryId: 'Driver_Motor:TB6600_Geekcreit',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'PUL', number: '6', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '11', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '12', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '15', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Geekcreit TB6600 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6600 단자대형 모듈/);
  assert.match(issue?.recommendation ?? '', /PUL\/DIR\/ENA/);
});

test('circuit netlist recognizes AITRIP-style TB67S109 carriers as module variants', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67-aitrip',
    templateId: 'tpl_driver_ic',
    name: 'AITRIP TB67S109 Driver',
    value: 'TB67S109 carrier module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:AITRIP_TB67S109',
    libraryId: 'Driver_Motor:TB67S109_AITRIP',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected AITRIP TB67S109 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB67S109 모듈\/캐리어/);
  assert.match(issue?.recommendation ?? '', /STEP\/DIR\/ENA/);
});

test('circuit netlist recognizes RobotDyn-style TB6600 terminal modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb6600-robotdyn',
    templateId: 'tpl_driver_ic',
    name: 'RobotDyn TB6600 Driver Module',
    value: 'TB6600 module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:RobotDyn_TB6600',
    libraryId: 'Driver_Motor:TB6600_RobotDyn',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'STEP', label: 'PUL+', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR+', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'ENA+', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected RobotDyn TB6600 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6600 단자대형 모듈/);
  assert.match(issue?.recommendation ?? '', /PUL\/DIR\/ENA/);
});

test('circuit netlist recognizes Geeetech-style DRV8825 stepper carriers as breakout modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8825-geeetech',
    templateId: 'tpl_driver_ic',
    name: 'Geeetech DRV8825 StepStick',
    value: 'DRV8825 carrier',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Geeetech_DRV8825',
    libraryId: 'Driver_Motor:DRV8825_Geeetech',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected DRV8825 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8825 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});

test('circuit netlist recognizes Elecrow-style DRV8825 stepper carriers as breakout modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8825-elecrow',
    templateId: 'tpl_driver_ic',
    name: 'Elecrow DRV8825 Stepper Driver',
    value: 'DRV8825 carrier board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Elecrow_DRV8825',
    libraryId: 'Driver_Motor:DRV8825_Elecrow',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1B', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Elecrow DRV8825 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8825 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});

test('circuit netlist recognizes BigTreeTech-style A4988 carriers as breakout modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-a4988-btt',
    templateId: 'tpl_driver_ic',
    name: 'BigTreeTech A4988 StepStick',
    value: 'A4988 module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:BTT_A4988_StepStick',
    libraryId: 'Driver_Motor:A4988_BTT',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected A4988 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /A4988 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});

test('circuit netlist flags imported A4988-style stepper carrier mismatch with family expectations', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-driver',
    templateId: 'tpl_driver_ic',
    name: 'U16 Stepper Driver',
    value: 'A4988',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Pololu_Breakout',
    libraryId: 'Driver_Motor:A4988',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected stepper driver carrier mismatch issue');
  assert.match(issue?.message ?? '', /스테퍼 드라이버 캐리어/);
  assert.match(issue?.message ?? '', /EN: 심볼 2번 \/ 기대 1번/);
  assert.match(issue?.message ?? '', /RESET: 심볼 4번 \/ 기대 5번/);
  assert.match(issue?.message ?? '', /STEP: 심볼 6번 \/ 기대 7번/);
  assert.match(issue?.message ?? '', /DIR: 심볼 7번 \/ 기대 8번/);
  assert.match(issue?.message ?? '', /GND: 심볼 8번 \/ 기대 9번/);
  assert.match(issue?.message ?? '', /VCC: 심볼 11번 \/ 기대 10번/);
  assert.match(issue?.message ?? '', /OUT: 심볼 12번 \/ 기대 11번/);
  assert.match(issue?.message ?? '', /VIN: 심볼 15번 \/ 기대 16번/);
});

test('circuit netlist routes TB67-stepper parts through the stepper-carrier rule', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67',
    templateId: 'tpl_driver_ic',
    name: 'U18 Stepper Driver',
    value: 'TB67S109',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Stepper_Driver',
    libraryId: 'Driver_Motor:TB67S109',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'PUL', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'CW/CCW', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '2A', number: '13', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected TB67 stepper-driver mismatch issue');
  assert.match(issue?.message ?? '', /스테퍼 드라이버 캐리어/);
  assert.match(issue?.recommendation ?? '', /TB67S109/);
  assert.match(issue?.recommendation ?? '', /STEP\/DIR\/ENA/);
});

test('circuit netlist recognizes StepStick-style TB67S109 carriers', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67-stepstick',
    templateId: 'tpl_driver_ic',
    name: 'TB67S109 StepStick',
    value: 'SilentStepStick TB67S109',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:StepStick_TB67S109',
    libraryId: 'Driver_Motor:TB67S109_StepStick',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'PUL', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'CW/CCW', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '2A', number: '13', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected TB67 StepStick mismatch issue');
  assert.match(issue?.recommendation ?? '', /StepStick/);
  assert.match(issue?.recommendation ?? '', /A\+\/A-|B\+\/B-/);
});

test('circuit netlist recognizes Geeetech-style TB67S109 carriers as module variants', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67-geeetech',
    templateId: 'tpl_driver_ic',
    name: 'Geeetech TB67S109 Module',
    value: 'TB67S109 stepper driver board',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Geeetech_TB67S109',
    libraryId: 'Driver_Motor:TB67S109_Geeetech',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Geeetech TB67S109 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB67S109 모듈\/캐리어/);
  assert.match(issue?.recommendation ?? '', /STEP\/DIR\/ENA/);
});

test('circuit netlist recognizes Keyestudio-style TB67S109 carriers as module variants', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67-keyestudio',
    templateId: 'tpl_driver_ic',
    name: 'Keyestudio TB67S109 Driver',
    value: 'TB67S109 carrier module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:Keyestudio_TB67S109',
    libraryId: 'Driver_Motor:TB67S109_Keyestudio',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'B+', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected Keyestudio TB67S109 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB67S109 모듈\/캐리어/);
  assert.match(issue?.recommendation ?? '', /STEP\/DIR\/ENA/);
});

test('circuit netlist recognizes AZDelivery-style TB67S109 carriers as module variants', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb67-azdelivery',
    templateId: 'tpl_driver_ic',
    name: 'AZDelivery TB67S109 Stepper Driver',
    value: 'TB67S109 carrier module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:AZDelivery_TB67S109',
    libraryId: 'Driver_Motor:TB67S109_AZDelivery',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'ENA', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'A+', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected AZDelivery TB67S109 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB67S109 모듈\/캐리어/);
  assert.match(issue?.recommendation ?? '', /STEP\/DIR\/ENA/);
});

test('circuit netlist recognizes SunFounder-style TB6600 terminal modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb6600-sunfounder',
    templateId: 'tpl_driver_ic',
    name: 'SunFounder TB6600 Driver Board',
    value: 'TB6600 terminal module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:SunFounder_TB6600',
    libraryId: 'Driver_Motor:TB6600_SunFounder',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'STEP', label: 'PUL', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'ENA', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'B+', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected SunFounder TB6600 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6600 단자대형 모듈/);
  assert.match(issue?.recommendation ?? '', /PUL\/DIR\/ENA/);
});

test('circuit netlist recognizes OpenBuilds-style TB6600 terminal modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-tb6600-openbuilds',
    templateId: 'tpl_driver_ic',
    name: 'OpenBuilds TB6600 Driver',
    value: 'TB6600 stepper module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:OpenBuilds_TB6600',
    libraryId: 'Driver_Motor:TB6600_OpenBuilds',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'STEP', label: 'PUL+', number: '1', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR+', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'EN', label: 'ENA+', number: '3', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VCC', number: '4', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '5', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: 'B+', number: '6', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VM', number: '7', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected OpenBuilds TB6600 module mismatch issue');
  assert.match(issue?.recommendation ?? '', /TB6600 단자대형 모듈/);
  assert.match(issue?.recommendation ?? '', /PUL\/DIR\/ENA/);
});

test('circuit netlist recognizes AZDelivery-style DRV8825 stepper carriers as breakout modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-drv8825-azdelivery',
    templateId: 'tpl_driver_ic',
    name: 'AZDelivery DRV8825 Stepper Driver',
    value: 'DRV8825 carrier',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:AZDelivery_DRV8825',
    libraryId: 'Driver_Motor:DRV8825_AZDelivery',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '2A', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected AZDelivery DRV8825 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /DRV8825 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});

test('circuit netlist recognizes HiLetgo-style A4988 carriers as breakout modules', () => {
  const driver = makeComponent({
    instanceId: 'u-stepper-a4988-hiletgo',
    templateId: 'tpl_driver_ic',
    name: 'HiLetgo A4988 Stepper Driver',
    value: 'A4988 module',
  });

  driver.importedMapping = {
    confidence: 'medium',
    source: 'value-regex',
    footprint: 'Module:HiLetgo_A4988',
    libraryId: 'Driver_Motor:A4988_HiLetgo',
  };
  driver.importedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    primitives: [],
    pinAnchors: [
      { pinId: 'EN', label: 'EN', number: '2', at: { x: 0, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'RESET', label: 'RST', number: '4', at: { x: 1, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'STEP', label: 'STEP', number: '6', at: { x: 2, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'DIR', label: 'DIR', number: '7', at: { x: 3, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'GND', label: 'GND', number: '8', at: { x: 4, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VCC', label: 'VDD', number: '11', at: { x: 5, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'OUT', label: '1B', number: '12', at: { x: 6, y: 0 }, angle: 0, lengthMm: 1.27 },
      { pinId: 'VIN', label: 'VMOT', number: '15', at: { x: 7, y: 0 }, angle: 0, lengthMm: 1.27 },
    ],
  };

  const result = analyzeCircuitNetlist([driver], 'kicad_generic', resolveTemplate, []);
  const issue = result.issues.find(item => item.ruleId === 'electrical.pinout-mismatch');

  assert.ok(issue, 'expected HiLetgo A4988 breakout mismatch issue');
  assert.match(issue?.recommendation ?? '', /A4988 브레이크아웃/);
  assert.match(issue?.recommendation ?? '', /VMOT\/VDD\/GND/);
});
