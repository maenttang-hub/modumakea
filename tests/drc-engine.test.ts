import test from 'node:test';
import assert from 'node:assert/strict';

import { runProjectDrc } from '@/lib/drc-engine';
import { buildImportedSchematicAuditIssues } from '@/lib/imported-schematic-audit';
import { makeComponent, makeManualConnection, makeTemplate } from './test-fixtures.ts';

const passiveGroundTrapTemplate = makeTemplate({
  id: 'tpl_ground_trap',
  name: 'Ground Trap',
  category: 'PASSIVE',
  pins: [
    { name: 'Signal', allowedTypes: ['DIGITAL'] },
    { name: 'GND', allowedTypes: ['GND'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const passiveProbeTemplate = makeTemplate({
  id: 'tpl_probe_sensor',
  name: 'Probe Sensor',
  category: 'PASSIVE',
  pins: [
    { name: 'AOut', allowedTypes: ['ANALOG'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const passiveShortLinkTemplate = makeTemplate({
  id: 'tpl_short_link',
  name: 'Short Link',
  category: 'PASSIVE',
  pins: [
    { name: 'VCC_IN', allowedTypes: ['POWER'] },
    { name: 'GND_IN', allowedTypes: ['GND'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const passiveRc522Template = makeTemplate({
  id: 'tpl_rfid_rc522',
  name: 'RC522',
  category: 'COMMUNICATION',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'SCK', allowedTypes: ['DIGITAL'] },
    { name: 'MOSI', allowedTypes: ['DIGITAL'] },
    { name: 'MISO', allowedTypes: ['DIGITAL'] },
    { name: 'SDA', allowedTypes: ['DIGITAL'] },
    { name: 'RST', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const passiveExternalPowerTemplate = makeTemplate({
  id: 'tpl_external_power',
  name: '외부 전원',
  category: 'PASSIVE',
  pins: [
    { name: 'V+', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const regulatorTemplate = makeTemplate({
  id: 'tpl_ldo_regulator',
  name: 'AMS1117 Regulator',
  category: 'PASSIVE',
  pins: [
    { name: 'VIN', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'VOUT', allowedTypes: ['POWER'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const crystalTemplate = makeTemplate({
  id: 'tpl_crystal',
  name: 'Crystal',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL'] },
    { name: '2', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const capacitorTemplate = makeTemplate({
  id: 'tpl_capacitor',
  name: 'Capacitor',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL', 'POWER'] },
    { name: '2', allowedTypes: ['GND', 'DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const resistorTemplate = makeTemplate({
  id: 'tpl_resistor',
  name: 'Resistor',
  category: 'PASSIVE',
  pins: [
    { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], allowBoardRails: true },
    { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], allowBoardRails: true },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const diodeTemplate = makeTemplate({
  id: 'tpl_diode',
  name: 'Diode',
  category: 'PASSIVE',
  pins: [
    { name: 'A', allowedTypes: ['DIGITAL', 'POWER', 'GND'], allowBoardRails: true },
    { name: 'K', allowedTypes: ['DIGITAL', 'POWER', 'GND'], allowBoardRails: true },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const ledTemplate = makeTemplate({
  id: 'tpl_led',
  name: 'LED',
  category: 'ACTUATOR',
  pins: [
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'Signal', allowedTypes: ['DIGITAL', 'PWM'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const ncTemplate = makeTemplate({
  id: 'tpl_nc_sensor',
  name: 'NC Sensor',
  category: 'SENSOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'NC', allowedTypes: ['DIGITAL'] },
  ],
  design: {
    datasheetStatus: 'official-complete',
  },
});

const bootstrapTemplate = makeTemplate({
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

function resolveTemplate(templateId: string) {
  return {
    tpl_ground_trap: passiveGroundTrapTemplate,
    tpl_probe_sensor: passiveProbeTemplate,
    tpl_short_link: passiveShortLinkTemplate,
    tpl_rfid_rc522: passiveRc522Template,
    tpl_external_power: passiveExternalPowerTemplate,
    tpl_ldo_regulator: regulatorTemplate,
    tpl_crystal: crystalTemplate,
    tpl_capacitor: capacitorTemplate,
    tpl_resistor: resistorTemplate,
    tpl_diode: diodeTemplate,
    tpl_led: ledTemplate,
    tpl_nc_sensor: ncTemplate,
    tpl_boot_mcu: bootstrapTemplate,
  }[templateId];
}

test('runProjectDrc merges netlist and formal verification issues into one review report', () => {
  const components = [
    makeComponent({
      instanceId: 'trap-1',
      templateId: 'tpl_ground_trap',
      name: 'Ground Trap 1',
      assignedPins: {
        Signal: 'D2',
        GND: 'GND',
      },
    }),
    makeComponent({
      instanceId: 'probe-1',
      templateId: 'tpl_probe_sensor',
      name: 'Probe 1',
      assignedPins: {
        AOut: 'A0',
      },
    }),
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
      'trap-link',
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'Signal' },
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'GND' }
    ),
    makeManualConnection(
      'short-link',
      { ownerType: 'component', ownerId: 'short-1', pinId: 'VCC_IN' },
      { ownerType: 'component', ownerId: 'short-1', pinId: 'GND_IN' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'uno',
    resolveTemplate,
    generatedCode: `
      void setup() {
        pinMode(D2, OUTPUT);
      }
      void loop() {
        digitalWrite(D2, HIGH);
        int raw = analogRead(D2);
      }
    `,
  });

  assert.ok(report.circuitAnalysis.issues.some(issue => issue.ruleId === 'netlist.power-short.direct'));
  assert.ok(report.formalVerification.issues.some(issue => issue.ruleId === 'formal.output-drive-grounded-net'));
  assert.ok(report.formalVerification.issues.some(issue => issue.ruleId === 'formal.analog-read-on-non-adc'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'netlist.power-short.direct'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'formal.output-drive-grounded-net'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'formal.analog-read-on-non-adc'));
  assert.equal(report.formalVerification.analyzed, true);
  assert.ok(report.issueCount >= 3);
});

test('runProjectDrc flags SPI CS collisions from shared board mappings', () => {
  const components = [
    makeComponent({
      instanceId: 'spi-1',
      templateId: 'tpl_rfid_rc522',
      name: 'RFID 1',
      assignedPins: {
        VCC: '3.3V',
        GND: 'GND',
        SCK: 'D13',
        MOSI: 'D11',
        MISO: 'D12',
        SDA: 'D10',
        RST: 'D9',
      },
    }),
    makeComponent({
      instanceId: 'spi-2',
      templateId: 'tpl_rfid_rc522',
      name: 'RFID 2',
      assignedPins: {
        VCC: '3.3V',
        GND: 'GND',
        SCK: 'D13',
        MOSI: 'D11',
        MISO: 'D12',
        SDA: 'D10',
        RST: 'D8',
      },
    }),
  ];

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'bus.spi-cs-collision'));
});

test('runProjectDrc feeds formal pin drive states back into circuit netlist analysis', () => {
  const components = [
    makeComponent({
      instanceId: 'resistor-1',
      templateId: 'tpl_resistor',
      name: 'LED 저항',
      value: '220',
      assignedPins: {
        '1': 'D13',
      },
    }),
    makeComponent({
      instanceId: 'led-1',
      templateId: 'tpl_led',
      name: '상태 LED',
      assignedPins: {
        GND: 'GND',
      },
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'conn-led-chain',
      { ownerType: 'component', ownerId: 'resistor-1', pinId: '2' },
      { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'uno',
    resolveTemplate,
    generatedCode: `
      void setup() {
        pinMode(D13, OUTPUT);
      }
      void loop() {
        digitalWrite(D13, HIGH);
      }
    `,
  });

  const drivenState = report.formalVerification.boardPinDriveStates?.find(state => state.boardPin === 'D13');
  const drivenNet = report.circuitAnalysis.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'D13')
  );

  assert.equal(drivenState?.mode, 'output_high');
  assert.equal(drivenNet?.knownVoltage, 5);
  assert.ok(
    !report.circuitAnalysis.issues.some(issue => issue.ruleId === 'netlist.led-current-too-low'),
    'expected DRC re-analysis to use code-driven GPIO voltage'
  );
});

test('runProjectDrc models INPUT_PULLUP as a weak pull-up preview in circuit analysis', () => {
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

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate,
    generatedCode: `
      void setup() {
        pinMode(D2, INPUT_PULLUP);
      }
    `,
  });

  const drivenState = report.formalVerification.boardPinDriveStates?.find(state => state.boardPin === 'D2');
  const inputNet = report.circuitAnalysis.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'D2')
  );

  assert.equal(drivenState?.mode, 'input_pullup');
  assert.ok(typeof inputNet?.solvedVoltage === 'number');
  assert.ok(Math.abs((inputNet?.solvedVoltage ?? 0) - 1.25) < 0.05);
});

test('runProjectDrc flags USB back-powering risk when external rail is tied to 5V', () => {
  const components = [
    makeComponent({
      instanceId: 'psu-1',
      templateId: 'tpl_external_power',
      name: 'PSU 1',
      assignedPins: {
        'V+': '5V',
        GND: 'GND',
      },
    }),
  ];

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate,
    powerInputMode: 'usb-5v',
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'power.usb-backpower-risk'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'power.source-collision'));
  const backpowerIssue = report.issues.find(issue => issue.ruleId === 'power.usb-backpower-risk');
  assert.equal(backpowerIssue?.confidence, 'strong-inference');
  assert.ok((backpowerIssue?.evidence?.assumptions.length ?? 0) >= 1);
  const collisionIssue = report.issues.find(issue => issue.ruleId === 'power.source-collision');
  assert.equal(collisionIssue?.confidence, 'confirmed');
  assert.ok((collisionIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((collisionIssue?.visualTargets?.netIds?.length ?? 0) >= 1);
});

test('runProjectDrc flags missing crystal load capacitors on oscillator nets', () => {
  const components = [
    makeComponent({
      instanceId: 'xtal-1',
      templateId: 'tpl_crystal',
      name: 'Y1',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'xtal-left',
      { ownerType: 'component', ownerId: 'xtal-1', pinId: '1' },
      { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }
    ),
    makeManualConnection(
      'xtal-right',
      { ownerType: 'component', ownerId: 'xtal-1', pinId: '2' },
      { ownerType: 'board', ownerId: 'uno', pinId: 'D3' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'uno',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'clock.crystal-load-cap-missing'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'clock.crystal-load-cap-missing');
  assert.equal(issue?.confidence, 'strong-inference');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.deepEqual(issue?.visualTargets?.componentIds, ['xtal-1']);
});

test('runProjectDrc flags a crystal that has load caps but no real clock consumer', () => {
  const components = [
    makeComponent({
      instanceId: 'xtal-srcless',
      templateId: 'tpl_crystal',
      name: 'Y2',
    }),
    makeComponent({
      instanceId: 'c-srcless-1',
      templateId: 'tpl_capacitor',
      name: 'C1',
    }),
    makeComponent({
      instanceId: 'c-srcless-2',
      templateId: 'tpl_capacitor',
      name: 'C2',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'xtal-srcless-left',
      { ownerType: 'component', ownerId: 'xtal-srcless', pinId: '1' },
      { ownerType: 'component', ownerId: 'c-srcless-1', pinId: '1' }
    ),
    makeManualConnection(
      'xtal-srcless-right',
      { ownerType: 'component', ownerId: 'xtal-srcless', pinId: '2' },
      { ownerType: 'component', ownerId: 'c-srcless-2', pinId: '1' }
    ),
    makeManualConnection(
      'xtal-srcless-left-gnd',
      { ownerType: 'component', ownerId: 'c-srcless-1', pinId: '2' },
      { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }
    ),
    makeManualConnection(
      'xtal-srcless-right-gnd',
      { ownerType: 'component', ownerId: 'c-srcless-2', pinId: '2' },
      { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'uno',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'clock.clock-source-review'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'clock.clock-source-review');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.assumptions.length ?? 0) >= 1);
});

test('runProjectDrc flags MCU oscillator pins when no crystal or clock source is actually present', () => {
  const mcuTemplate = makeTemplate({
    id: 'tpl_xtal_mcu',
    name: 'MCU Core',
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

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'mcu-xtal-1',
        templateId: 'tpl_xtal_mcu',
        name: 'ATmega Test MCU',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'mcu-xtal1-wire',
        { ownerType: 'component', ownerId: 'mcu-xtal-1', pinId: 'XTAL1' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }
      ),
      makeManualConnection(
        'mcu-xtal2-wire',
        { ownerType: 'component', ownerId: 'mcu-xtal-1', pinId: 'XTAL2' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D3' }
      ),
    ],
    boardId: 'uno',
    resolveTemplate: templateId => ({ tpl_xtal_mcu: mcuTemplate })[templateId],
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'clock.clock-source-review'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'clock.clock-source-review');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.visualTargets?.netIds?.length ?? 0) >= 1);
});

test('runProjectDrc flags NC pin wiring violations', () => {
  const components = [
    makeComponent({
      instanceId: 'nc-1',
      templateId: 'tpl_nc_sensor',
      name: 'NC Sensor 1',
      assignedPins: {
        VCC: '5V',
        GND: 'GND',
        NC: 'D2',
      },
    }),
  ];

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'electrical.nc-pin-violation'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'electrical.nc-pin-violation');
  assert.equal(issue?.confidence, 'confirmed');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['NC']);
});

test('runProjectDrc flags regulator max input violations from external sources', () => {
  const components = [
    makeComponent({
      instanceId: 'psu-24v',
      templateId: 'tpl_external_power',
      name: '24V Supply',
      value: '24V',
    }),
    makeComponent({
      instanceId: 'ldo-1',
      templateId: 'tpl_ldo_regulator',
      name: 'AMS1117-3.3',
      value: 'AMS1117-3.3',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'vin-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'V+' },
      { ownerType: 'component', ownerId: 'ldo-1', pinId: 'VIN' }
    ),
    makeManualConnection(
      'gnd-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'GND' },
      { ownerType: 'component', ownerId: 'ldo-1', pinId: 'GND' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'kicad_generic',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'power.regulator-max-input'));
});

test('runProjectDrc still flags overvoltage for common regulator families even when part-master lookup misses', () => {
  const components = [
    makeComponent({
      instanceId: 'psu-24v',
      templateId: 'tpl_external_power',
      name: '24V Supply',
      value: '24V',
    }),
    makeComponent({
      instanceId: 'ldo-fallback',
      templateId: 'tpl_ldo_regulator',
      name: 'AZ1117-3.3',
      value: 'AZ1117-3.3',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'vin-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'V+' },
      { ownerType: 'component', ownerId: 'ldo-fallback', pinId: 'VIN' }
    ),
    makeManualConnection(
      'gnd-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'GND' },
      { ownerType: 'component', ownerId: 'ldo-fallback', pinId: 'GND' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'kicad_generic',
    resolveTemplate,
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'power.regulator-max-input' &&
      issue.code === 'power.regulator-max-input'
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'power.regulator-max-input');
  assert.equal(issue?.confidence, 'confirmed');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.equal(issue?.visualTargets?.componentIds?.[0], 'ldo-fallback');
});

test('runProjectDrc warns when a regulator input path exists but max input data is still unknown', () => {
  const unknownRegulatorTemplate = makeTemplate({
    id: 'tpl_linear_regulator_unknown',
    name: 'Generic Linear Regulator',
    category: 'PASSIVE',
    pins: [
      { name: 'VIN', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'VOUT', allowedTypes: ['POWER'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const components = [
    makeComponent({
      instanceId: 'psu-24v',
      templateId: 'tpl_external_power',
      name: '24V Supply',
      value: '24V',
    }),
    makeComponent({
      instanceId: 'ldo-unknown',
      templateId: 'tpl_linear_regulator_unknown',
      name: 'Custom Linear Regulator',
      value: 'XYZ123',
    }),
  ];

  const manualConnections = [
    makeManualConnection(
      'vin-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'V+' },
      { ownerType: 'component', ownerId: 'ldo-unknown', pinId: 'VIN' }
    ),
    makeManualConnection(
      'gnd-link',
      { ownerType: 'component', ownerId: 'psu-24v', pinId: 'GND' },
      { ownerType: 'component', ownerId: 'ldo-unknown', pinId: 'GND' }
    ),
  ];

  const report = runProjectDrc({
    components,
    manualConnections,
    boardId: 'kicad_generic',
    resolveTemplate: templateId =>
      ({
        tpl_ground_trap: passiveGroundTrapTemplate,
        tpl_probe_sensor: passiveProbeTemplate,
        tpl_short_link: passiveShortLinkTemplate,
        tpl_rfid_rc522: passiveRc522Template,
        tpl_external_power: passiveExternalPowerTemplate,
        tpl_ldo_regulator: regulatorTemplate,
        tpl_linear_regulator_unknown: unknownRegulatorTemplate,
        tpl_crystal: crystalTemplate,
        tpl_capacitor: capacitorTemplate,
        tpl_resistor: resistorTemplate,
        tpl_diode: diodeTemplate,
        tpl_led: ledTemplate,
        tpl_nc_sensor: ncTemplate,
        tpl_boot_mcu: bootstrapTemplate,
      })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'power.regulator-max-input' &&
      issue.code === 'power.regulator-max-input-unknown'
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'power.regulator-max-input-unknown');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.equal(issue?.visualTargets?.componentIds?.[0], 'ldo-unknown');
});

test('runProjectDrc flags unresolved MCU boot strap bias nets', () => {
  const components = [
    makeComponent({
      instanceId: 'mcu-1',
      templateId: 'tpl_boot_mcu',
      name: 'ESP32 Core',
      assignedPins: {
        VCC: '3.3V',
        GND: 'GND',
      },
    }),
  ];

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'mcu.boot-strap-audit'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'mcu.boot-strap-audit');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.match(issue?.evidence?.howToVerify ?? '', /부트 상태|풀업|풀다운/);
});

test('runProjectDrc flags reset nets that have no POR hold or supervisor path', () => {
  const resetMcuTemplate = makeTemplate({
    id: 'tpl_reset_mcu',
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

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'mcu-rst-1',
        templateId: 'tpl_reset_mcu',
        name: 'STM32 Test MCU',
        assignedPins: {
          VCC: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'rst-wire',
        { ownerType: 'component', ownerId: 'mcu-rst-1', pinId: 'NRST' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }
      ),
    ],
    boardId: 'uno',
    resolveTemplate: templateId => ({ tpl_reset_mcu: resetMcuTemplate })[templateId],
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'reset.por-supervisor-review'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'reset.por-supervisor-review');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.match(issue?.evidence?.howToVerify ?? '', /리셋|POR|supervisor/i);
});

test('runProjectDrc accepts reset nets when a real supervisor part is present by MPN identity', () => {
  const resetMcuTemplate = makeTemplate({
    id: 'tpl_reset_mcu',
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
    id: 'tpl_supervisor_ic',
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

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'mcu-rst-ok',
        templateId: 'tpl_reset_mcu',
        name: 'STM32 Test MCU',
        assignedPins: {
          VCC: '3.3V',
          GND: 'GND',
        },
      }),
      makeComponent({
        instanceId: 'sup-1',
        templateId: 'tpl_supervisor_ic',
        name: 'U_RST',
        value: 'TPS3839K33DBZR',
        assignedPins: {
          VDD: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'rst-supervisor-wire',
        { ownerType: 'component', ownerId: 'mcu-rst-ok', pinId: 'NRST' },
        { ownerType: 'component', ownerId: 'sup-1', pinId: 'RESET' }
      ),
    ],
    boardId: 'uno',
    resolveTemplate: templateId =>
      ({ tpl_reset_mcu: resetMcuTemplate, tpl_supervisor_ic: supervisorTemplate })[templateId],
  });

  assert.equal(report.issues.some(issue => issue.ruleId === 'reset.por-supervisor-review'), false);
});

test('runProjectDrc reviews mixed-voltage GPIO nets without an explicit level shifter path', () => {
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
    resolveTemplate,
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'signal.mixed-voltage-tolerance-review'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'signal.mixed-voltage-tolerance-review');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.deepEqual(issue?.visualTargets?.netIds, issue?.evidence?.affectedNets);
});

test('runProjectDrc flags reserved pins when an ESP32 reserved pin is wired out', () => {
  const esp32Template = makeTemplate({
    id: 'tpl_esp32_custom',
    name: 'ESP32 Module',
    category: 'COMMUNICATION',
    pins: [
      { name: '3V3', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'GPIO6', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'esp32-resv',
        templateId: 'tpl_esp32_custom',
        name: 'ESP32-WROOM-32E',
        value: 'ESP32-WROOM-32E',
        assignedPins: {
          '3V3': '3.3V',
          GND: 'GND',
          GPIO6: 'D2',
        },
      }),
    ],
    resolveTemplate: templateId => ({ tpl_esp32_custom: esp32Template })[templateId],
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'electrical.reserved-pin-violation'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'electrical.reserved-pin-violation');
  assert.equal(issue?.confidence, 'confirmed');
  assert.ok((issue?.visualTargets?.pinIds?.length ?? 0) >= 1);
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 3);
});

test('runProjectDrc reviews floating unused GPIO pins on MCU-like parts', () => {
  const gpioMcuTemplate = makeTemplate({
    id: 'tpl_gpio_mcu',
    name: 'MCU GPIO Bank',
    category: 'COMMUNICATION',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'GPIO1', allowedTypes: ['DIGITAL'] },
      { name: 'GPIO2', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-unused-1',
        templateId: 'tpl_gpio_mcu',
        name: 'Generic MCU',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
    ],
    resolveTemplate: templateId => ({ tpl_gpio_mcu: gpioMcuTemplate })[templateId],
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'signal.unused-pin-review'));
});

test('runProjectDrc suppresses unused-pin review when project settings declare internal pull handling', () => {
  const gpioMcuTemplate = makeTemplate({
    id: 'tpl_gpio_mcu',
    name: 'MCU GPIO Bank',
    category: 'COMMUNICATION',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'GPIO1', allowedTypes: ['DIGITAL'] },
      { name: 'GPIO2', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'mcu-unused-2',
        templateId: 'tpl_gpio_mcu',
        name: 'Generic MCU',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
    ],
    componentUnusedPinModes: {
      'mcu-unused-2': {
        GPIO1: 'internal-pullup',
        GPIO2: 'internal-pulldown',
      },
    },
    resolveTemplate: templateId => ({ tpl_gpio_mcu: gpioMcuTemplate })[templateId],
  });

  assert.equal(report.issues.some(issue => issue.ruleId === 'signal.unused-pin-review'), false);
});

test('runProjectDrc flags direct 5V UART drive into HC-06 RX from the actual net path', () => {
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

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          TX: 'D3',
          RX: 'D2',
        },
      }),
    ],
    manualConnections: [],
    resolveTemplate: templateId => ({ tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.signal-level-mismatch' &&
      issue.code === 'part-master.signal-level-mismatch' &&
      issue.message.includes('HC-06') &&
      issue.message.includes('D2')
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'part-master.signal-level-mismatch');
  assert.equal(issue?.confidence, 'confirmed');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['RX']);
});

test('runProjectDrc flags BME280 address strap when the actual SDO net has no reference resistor', () => {
  const bmeTemplate = makeTemplate({
    id: 'tpl_bme280_custom',
    name: 'BME280 Sensor',
    category: 'SENSOR',
    pins: [
      { name: 'VDD', allowedTypes: ['POWER'] },
      { name: 'VDDIO', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SCL', allowedTypes: ['DIGITAL'] },
      { name: 'SDA', allowedTypes: ['DIGITAL'] },
      { name: 'SDO', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: '3.3V',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const missingStrapReport = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: {
          VDD: '3.3V',
          VDDIO: '3.3V',
          GND: 'GND',
          SCL: 'A5',
          SDA: 'A4',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'bme-sdo-floating',
        { ownerType: 'component', ownerId: 'bme-1', pinId: 'SDO' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' }
      ),
    ],
    resolveTemplate: templateId => ({ tpl_bme280_custom: bmeTemplate })[templateId],
  });

  assert.ok(
    missingStrapReport.issues.some(issue =>
      issue.ruleId === 'part-master.same-net-companion' &&
      issue.code === 'part-master.strap-bias-missing' &&
      issue.message.includes('SDO')
    )
  );
  const missingStrapIssue = missingStrapReport.issues.find(candidate => candidate.code === 'part-master.strap-bias-missing');
  assert.equal(missingStrapIssue?.confidence, 'needs-review');
  assert.ok((missingStrapIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.deepEqual(missingStrapIssue?.visualTargets?.pinIds, ['SDO']);

  const strappedReport = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-1',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: {
          VDD: '3.3V',
          VDDIO: '3.3V',
          GND: 'GND',
          SCL: 'A5',
          SDA: 'A4',
        },
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
        { ownerType: 'component', ownerId: 'r-addr', pinId: '1' }
      ),
      makeManualConnection(
        'bme-sdo-r2',
        { ownerType: 'component', ownerId: 'r-addr', pinId: '2' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bme280_custom: bmeTemplate })[templateId] ?? resolveTemplate(templateId),
  });

  assert.ok(
    strappedReport.issues.every(issue => issue.code !== 'part-master.strap-bias-missing')
  );
});

test('runProjectDrc flags a low-voltage UART pin placed on the HV side of a level shifter channel', () => {
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
    id: 'tpl_level_shifter',
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
        instanceId: 'bt-2',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
      makeComponent({
        instanceId: 'ls-1',
        templateId: 'tpl_level_shifter',
        name: 'BSS138 Level Shifter',
        assignedPins: {
          HV: '5V',
          LV: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'uno-to-ls-lv1',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-1', pinId: 'LV1' }
      ),
      makeManualConnection(
        'bt-rx-to-ls-hv1',
        { ownerType: 'component', ownerId: 'bt-2', pinId: 'RX' },
        { ownerType: 'component', ownerId: 'ls-1', pinId: 'HV1' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bluetooth_hc05: bluetoothTemplate, tpl_level_shifter: levelShifterTemplate })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.same-net-companion' &&
      issue.code === 'part-master.level-shifter-side-mismatch' &&
      issue.message.includes('HV1')
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'part-master.level-shifter-side-mismatch');
  assert.equal(issue?.confidence, 'strong-inference');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['RX']);
});

test('runProjectDrc accepts a low-voltage UART pin when the same level shifter channel carries the real path', () => {
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
    id: 'tpl_level_shifter',
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
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
      makeComponent({
        instanceId: 'ls-ok',
        templateId: 'tpl_level_shifter',
        name: 'BSS138 Level Shifter',
        assignedPins: {
          HV: '5V',
          LV: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'uno-to-ls-hv1',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-ok', pinId: 'HV1' }
      ),
      makeManualConnection(
        'bt-rx-to-ls-lv1',
        { ownerType: 'component', ownerId: 'bt-ok', pinId: 'RX' },
        { ownerType: 'component', ownerId: 'ls-ok', pinId: 'LV1' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bluetooth_hc05: bluetoothTemplate, tpl_level_shifter: levelShifterTemplate })[templateId],
  });

  assert.equal(
    report.issues.some(issue => issue.code === 'part-master.signal-level-mismatch' || issue.code === 'part-master.level-shifter-side-mismatch' || issue.code === 'part-master.level-shifter-path-incomplete'),
    false
  );
});

test('runProjectDrc flags direct 5V I2C drive into BME280 SDA from the actual net path', () => {
  const bmeTemplate = makeTemplate({
    id: 'tpl_bme280_custom',
    name: 'BME280 Sensor',
    category: 'SENSOR',
    pins: [
      { name: 'VDD', allowedTypes: ['POWER'] },
      { name: 'VDDIO', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SDA', allowedTypes: ['DIGITAL'] },
      { name: 'SCL', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: '3.3V',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bme-risk',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: {
          VDD: '3.3V',
          VDDIO: '3.3V',
          GND: 'GND',
          SDA: 'D2',
          SCL: 'A5',
        },
      }),
    ],
    resolveTemplate: templateId => ({ tpl_bme280_custom: bmeTemplate })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.signal-level-mismatch' &&
      issue.code === 'part-master.signal-level-mismatch' &&
      issue.message.includes('SDA')
    )
  );
});

test('runProjectDrc accepts a low-voltage I2C pin when the same level shifter channel carries the real path', () => {
  const bmeTemplate = makeTemplate({
    id: 'tpl_bme280_custom',
    name: 'BME280 Sensor',
    category: 'SENSOR',
    pins: [
      { name: 'VDD', allowedTypes: ['POWER'] },
      { name: 'VDDIO', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SDA', allowedTypes: ['DIGITAL'] },
      { name: 'SCL', allowedTypes: ['DIGITAL'] },
    ],
    compatibleVoltage: '3.3V',
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const levelShifterTemplate = makeTemplate({
    id: 'tpl_level_shifter',
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
        instanceId: 'bme-ok',
        templateId: 'tpl_bme280_custom',
        name: 'BME280 Breakout',
        value: 'BME280',
        assignedPins: {
          VDD: '3.3V',
          VDDIO: '3.3V',
          GND: 'GND',
        },
      }),
      makeComponent({
        instanceId: 'ls-i2c',
        templateId: 'tpl_level_shifter',
        name: 'BSS138 Level Shifter',
        assignedPins: {
          HV: '5V',
          LV: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'uno-i2c-hv1',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-i2c', pinId: 'HV1' }
      ),
      makeManualConnection(
        'bme-i2c-lv1',
        { ownerType: 'component', ownerId: 'bme-ok', pinId: 'SDA' },
        { ownerType: 'component', ownerId: 'ls-i2c', pinId: 'LV1' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bme280_custom: bmeTemplate, tpl_level_shifter: levelShifterTemplate })[templateId],
  });

  assert.equal(
    report.issues.some(issue =>
      issue.code === 'part-master.signal-level-mismatch' ||
      issue.code === 'part-master.level-shifter-side-mismatch' ||
      issue.code === 'part-master.level-shifter-path-incomplete'
    ),
    false
  );
});

test('runProjectDrc flags direct 5V SPI drive into RC522 SCK from the actual net path', () => {
  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'rc522-risk',
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
    resolveTemplate,
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.signal-level-mismatch' &&
      issue.code === 'part-master.signal-level-mismatch' &&
      issue.message.includes('SCK')
    )
  );
});

test('runProjectDrc requires the protection clamp to be on the actual low-voltage signal net', () => {
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

  const report = runProjectDrc({
    boardId: 'uno',
    components: [
      makeComponent({
        instanceId: 'bt-protect',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          TX: 'D3',
          RX: 'D2',
        },
      }),
      makeComponent({
        instanceId: 'tvs-offpath',
        templateId: 'tpl_diode',
        name: 'USB ESD TVS',
        value: 'PESD5V',
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'tvs-other-net-signal',
        { ownerType: 'component', ownerId: 'tvs-offpath', pinId: 'A' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'D3' }
      ),
      makeManualConnection(
        'tvs-other-net-ground',
        { ownerType: 'component', ownerId: 'tvs-offpath', pinId: 'K' },
        { ownerType: 'board', ownerId: 'uno', pinId: 'GND' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bluetooth_hc05: bluetoothTemplate, tpl_diode: diodeTemplate })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.same-net-companion' &&
      issue.code === 'part-master.protection-path-missing' &&
      issue.message.includes('D2')
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'part-master.protection-path-missing');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.deepEqual(issue?.visualTargets?.pinIds, ['RX']);
});

test('runProjectDrc flags incomplete level shifter paths when the signal does not traverse the same channel pair', () => {
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
    id: 'tpl_level_shifter',
    name: 'Level Shifter',
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
        instanceId: 'bt-badpath',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        value: 'HC-06',
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
        },
      }),
      makeComponent({
        instanceId: 'ls-badpath',
        templateId: 'tpl_level_shifter',
        name: 'BSS138 Level Shifter',
        assignedPins: {
          HV: '5V',
          LV: '3.3V',
          GND: 'GND',
        },
      }),
    ],
    manualConnections: [
      makeManualConnection(
        'uno-to-ls-hv2',
        { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        { ownerType: 'component', ownerId: 'ls-badpath', pinId: 'HV2' }
      ),
      makeManualConnection(
        'bt-rx-to-ls-lv1',
        { ownerType: 'component', ownerId: 'bt-badpath', pinId: 'RX' },
        { ownerType: 'component', ownerId: 'ls-badpath', pinId: 'LV1' }
      ),
    ],
    resolveTemplate: templateId =>
      ({ tpl_bluetooth_hc05: bluetoothTemplate, tpl_level_shifter: levelShifterTemplate })[templateId],
  });

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'part-master.level-shifter-path-incomplete' &&
      issue.code === 'part-master.level-shifter-path-incomplete' &&
      issue.message.includes('LV1')
    )
  );
  const issue = report.issues.find(candidate => candidate.code === 'part-master.level-shifter-path-incomplete');
  assert.equal(issue?.confidence, 'needs-review');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.match(issue?.evidence?.howToVerify ?? '', /레벨 시프터|연결|peer|분압/);
  assert.deepEqual(issue?.visualTargets?.componentIds, ['bt-badpath', 'ls-badpath']);
});

test('runProjectDrc returns a graceful warning when a downstream phase throws', () => {
  const components = [
    makeComponent({
      instanceId: 'broken-1',
      templateId: 'tpl_missing_template',
      name: 'Broken Template 1',
    }),
  ];

  const report = runProjectDrc({
    components,
    boardId: 'uno',
    resolveTemplate(templateId: string) {
      if (templateId === 'tpl_missing_template') {
        throw new Error('template lookup exploded');
      }

      return resolveTemplate(templateId);
    },
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'engine.runtime-error'));
  assert.ok(report.issues.some(issue => issue.message.includes('template lookup exploded')));
  assert.equal(report.engineId, 'modumake-drc-v1');
});

test('runProjectDrc adds imported schematic baseline issues for floating power and isolated symbols', () => {
  const importedSensorTemplate = makeTemplate({
    id: 'tpl_imported_sensor',
    name: 'Imported Sensor',
    category: 'SENSOR',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'DATA', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'imported-1',
        templateId: 'tpl_imported_sensor',
        name: 'Imported Sensor 1',
      }),
    ],
    boardId: 'kicad_generic',
    resolveTemplate(templateId: string) {
      return templateId === 'tpl_imported_sensor' ? importedSensorTemplate : resolveTemplate(templateId);
    },
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'imported.power-pin-unconnected'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'imported.ground-pin-unconnected'));
  assert.ok(report.issues.some(issue => issue.ruleId === 'imported.symbol-isolated'));
  const powerIssue = report.issues.find(issue => issue.ruleId === 'imported.power-pin-unconnected');
  const isolatedIssue = report.issues.find(issue => issue.ruleId === 'imported.symbol-isolated');
  assert.equal(powerIssue?.confidence, 'strong-inference');
  assert.equal(powerIssue?.evidence?.sourceQuality, 'needs-vendor-pin');
  assert.equal(isolatedIssue?.confidence, 'needs-review');
  assert.ok((isolatedIssue?.evidence?.assumptions.length ?? 0) >= 1);
});

test('imported schematic baseline audit de-duplicates identical local issues with the shared key', () => {
  const importedSensorTemplate = makeTemplate({
    id: 'tpl_imported_sensor',
    name: 'Imported Sensor',
    category: 'SENSOR',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'DATA', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const floatingSensor = makeComponent({
    instanceId: 'imported-1',
    templateId: 'tpl_imported_sensor',
    name: 'Imported Sensor 1',
  });

  const issues = buildImportedSchematicAuditIssues({
    components: [floatingSensor, floatingSensor],
    resolveTemplate(templateId: string) {
      if (templateId === 'tpl_imported_sensor') {
        return importedSensorTemplate;
      }
      return resolveTemplate(templateId);
    },
    manualConnections: [],
  });

  assert.equal(issues.filter(issue => issue.ruleId === 'imported.power-pin-unconnected').length, 1);
  assert.equal(issues.filter(issue => issue.ruleId === 'imported.ground-pin-unconnected').length, 1);
  assert.equal(issues.filter(issue => issue.ruleId === 'imported.symbol-isolated').length, 1);
  const importedPower = issues.find(issue => issue.ruleId === 'imported.power-pin-unconnected');
  assert.deepEqual(importedPower?.visualTargets?.componentIds, ['imported-1']);
});

test('runProjectDrc warns when a hierarchical sheet frame visually overlaps an imported symbol area', () => {
  const importedConnectorTemplate = makeTemplate({
    id: 'tpl_imported_connector',
    name: 'Imported Connector',
    category: 'COMMUNICATION',
    pins: [{ name: 'SIG', allowedTypes: ['DIGITAL'] }],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'imported-connector-1',
        templateId: 'tpl_imported_connector',
        name: 'Connector sheet proxy',
      }),
    ],
    importedSchematicScene: {
      wireSegments: [],
      junctions: [],
      labels: [],
      sheetFrames: [
        {
          start: { x: 500, y: 400 },
          end: { x: 860, y: 760 },
          name: 'connectors1',
          file: 'connectors1.sch',
          pins: [{ text: 'MISO', at: { x: 860, y: 520 }, angle: 0 }],
        },
      ],
      symbols: [
        {
          instanceId: 'imported-connector-1',
          reference: 'J1',
          value: 'Conn_01x20',
          primitives: [
            {
              kind: 'rect',
              start: { x: 560, y: 440 },
              end: { x: 720, y: 680 },
            },
          ],
          pinAnchors: [],
        },
      ],
    },
    boardId: 'kicad_generic',
    resolveTemplate(templateId: string) {
      return templateId === 'tpl_imported_connector' ? importedConnectorTemplate : resolveTemplate(templateId);
    },
  });

  assert.ok(report.issues.some(issue => issue.ruleId === 'imported.sheet-frame-overlap'));
  const issue = report.issues.find(candidate => candidate.ruleId === 'imported.sheet-frame-overlap');
  assert.equal(issue?.confidence, 'needs-review');
  assert.equal(issue?.evidence?.sourceQuality, 'needs-vendor-pin');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 3);
});

test('runProjectDrc does not flag imported power pins when the schematic already restored their connections', () => {
  const importedSensorTemplate = makeTemplate({
    id: 'tpl_imported_sensor_connected',
    name: 'Imported Sensor Connected',
    category: 'SENSOR',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'DATA', allowedTypes: ['DIGITAL'] },
    ],
    design: {
      datasheetStatus: 'official-complete',
    },
  });

  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'imported-2',
        templateId: 'tpl_imported_sensor_connected',
        name: 'Imported Sensor 2',
        assignedPins: {
          VCC: '3V',
          GND: 'GNDPWR',
        },
      }),
    ],
    boardId: 'kicad_generic',
    resolveTemplate(templateId: string) {
      return templateId === 'tpl_imported_sensor_connected'
        ? importedSensorTemplate
        : resolveTemplate(templateId);
    },
  });

  assert.equal(report.issues.some(issue => issue.ruleId === 'imported.power-pin-unconnected'), false);
  assert.equal(report.issues.some(issue => issue.ruleId === 'imported.ground-pin-unconnected'), false);
});

test('runProjectDrc passes ADC configuration through to netlist analysis', () => {
  const report = runProjectDrc({
    components: [
      makeComponent({
        instanceId: 'ads-drc-config',
        templateId: 'tpl_ads1115',
        name: 'ADS1115 DRC Config',
        value: 'ADS1115',
        assignedPins: { VDD: '5V', GND: 'GND', AIN0: '5V', AIN1: 'GND' },
      }),
    ],
    boardId: 'uno',
    resolveTemplate,
    adcConfigurations: {
      'ads-drc-config': {
        ads1x15: {
          pgaFullScaleV: 6.144,
        },
      },
    },
  });

  assert.equal(report.issues.some(issue => issue.ruleId === 'netlist.ads1x15-fullscale-review'), false);
});
