import assert from 'node:assert/strict';
import test from 'node:test';
import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeComponentForBoard, auditProjectDesign, getProjectStageReadiness } from '@/lib/datasheet-rules';
import { makeComponent, makeTemplate } from './test-fixtures.ts';

test('imported schematic board skips board-voltage compatibility warnings', () => {
  const template = getStaticTemplateById('tpl_rfid_rc522');
  assert.ok(template);

  const analysis = analyzeComponentForBoard(template, 'kicad_generic');

  assert.equal(
    analysis.warnings.some(warning => warning.title === '보드 전압 비호환'),
    false,
  );
  assert.equal(analysis.requiredRail, 'BOTH');
});

test('auditProjectDesign resolves top-level audit issues from code + params without local hardcoded copy', () => {
  const partialTemplate = makeTemplate({
    id: 'tpl_partial_sensor',
    name: 'Partial Sensor',
    pins: [{ name: 'Data', allowedTypes: ['DIGITAL'] }],
    design: {
      datasheetStatus: 'official-partial',
      requiresExternalParts: ['데이터 라인 풀업 저항 확인'],
    },
  });

  const genericTemplate = makeTemplate({
    id: 'tpl_generic_sensor',
    name: 'Generic Sensor',
    pins: [{ name: 'Signal', allowedTypes: ['DIGITAL'] }],
    design: {
      datasheetStatus: 'generic-module',
    },
  });

  const report = auditProjectDesign(
    [
      {
        ...makeComponent({
          instanceId: 'partial-1',
          templateId: 'tpl_partial_sensor',
          name: 'Partial Sensor 1',
        }),
        isFullyRouted: false,
      },
      makeComponent({
        instanceId: 'generic-1',
        templateId: 'tpl_generic_sensor',
        name: 'Generic Sensor 1',
      }),
      makeComponent({
        instanceId: 'missing-1',
        templateId: 'tpl_missing_sensor',
        name: 'Missing Sensor 1',
      }),
    ],
    'uno',
    templateId => ({
      tpl_partial_sensor: partialTemplate,
      tpl_generic_sensor: genericTemplate,
    })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'audit.template-missing' &&
      issue.title === '템플릿 누락' &&
      issue.message.includes('라이브러리 정의')
    )
  );
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'routing.unrouted-component' &&
      issue.recommendation?.includes('자동 배선')
    )
  );
  assert.equal(report.issues.some(issue => issue.code === 'audit.generic-sku-unfixed'), false);
  const genericSummary = report.issues.find(issue => issue.code === 'audit.generic-sku-summary');
  assert.ok(genericSummary);
  assert.equal(genericSummary.severity, 'info');
  assert.match(genericSummary.message, /Generic Sensor 1|generic/i);
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'audit.partial-datasheet' &&
      issue.title === '부분 공개 데이터시트'
    )
  );
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'companion.external-part-check' &&
      issue.message === '데이터 라인 풀업 저항 확인'
    )
  );
});

test('imported schematic components do not emit stale unrouted warnings from editor routing state', () => {
  const template = makeTemplate({
    id: 'tpl_imported_resistor',
    name: 'Imported Resistor',
    category: 'PASSIVE',
    pins: [
      { name: '1', allowedTypes: ['DIGITAL'] },
      { name: '2', allowedTypes: ['DIGITAL'] },
    ],
  });

  const component = {
    ...makeComponent({
      instanceId: 'r1',
      templateId: 'tpl_imported_resistor',
      name: 'R1',
    }),
    importedReference: 'R1',
    isFullyRouted: false,
  };

  const report = auditProjectDesign([component], 'kicad_generic', templateId =>
    templateId === template.id ? template : undefined
  );
  const readiness = getProjectStageReadiness([component], 'kicad_generic', templateId =>
    templateId === template.id ? template : undefined
  );

  assert.equal(report.issues.some(issue => issue.code === 'routing.unrouted-component'), false);
  assert.equal(readiness.pcbReasons.some(reason => reason.includes('미배선 부품')), false);
  assert.equal(readiness.manufacturingReasons.some(reason => reason.includes('미배선 부품')), false);
});

test('auditProjectDesign does not treat shared power rails and passive parts as output collisions', () => {
  const capacitorTemplate = makeTemplate({
    id: 'tpl_test_capacitor',
    name: 'Test Capacitor',
    category: 'PASSIVE',
    pins: [
      { name: '1', allowedTypes: ['DIGITAL', 'ANALOG'] },
      { name: '2', allowedTypes: ['DIGITAL', 'ANALOG'] },
    ],
  });
  const resistorTemplate = makeTemplate({
    id: 'tpl_test_resistor',
    name: 'Test Resistor',
    category: 'PASSIVE',
    pins: [
      { name: '1', allowedTypes: ['DIGITAL', 'ANALOG'] },
      { name: '2', allowedTypes: ['DIGITAL', 'ANALOG'] },
    ],
  });
  const rtcTemplate = makeTemplate({
    id: 'tpl_test_rtc',
    name: 'Test RTC',
    category: 'IC',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'INTA', allowedTypes: ['DIGITAL'] },
    ],
  });
  const eepromTemplate = makeTemplate({
    id: 'tpl_test_eeprom',
    name: 'Test EEPROM',
    category: 'IC',
    pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'A2', allowedTypes: ['DIGITAL'] },
    ],
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'c1',
        templateId: capacitorTemplate.id,
        name: 'C1 10uF',
        assignedPins: { '1': 'VCC', '2': 'GND' },
      }),
      makeComponent({
        instanceId: 'r1',
        templateId: resistorTemplate.id,
        name: 'R1 10K',
        assignedPins: { '1': 'VCC', '2': 'NET_INT_PULLUP' },
      }),
      makeComponent({
        instanceId: 'u1',
        templateId: rtcTemplate.id,
        name: 'DS1337_PDv2',
        assignedPins: { VCC: 'VCC', GND: 'GND', INTA: 'VCC' },
      }),
      makeComponent({
        instanceId: 'u2',
        templateId: eepromTemplate.id,
        name: '24LC1025',
        assignedPins: { VCC: 'VCC', GND: 'GND', A2: 'VCC' },
      }),
    ],
    'kicad_generic',
    templateId => ({
      [capacitorTemplate.id]: capacitorTemplate,
      [resistorTemplate.id]: resistorTemplate,
      [rtcTemplate.id]: rtcTemplate,
      [eepromTemplate.id]: eepromTemplate,
    })[templateId],
  );

  assert.equal(report.issues.some(issue => issue.ruleId === 'io.output-collision'), false);
});

test('auditProjectDesign still reports output collisions on non-power signal nets', () => {
  const outputTemplate = makeTemplate({
    id: 'tpl_test_output_driver',
    name: 'Test Output Driver',
    category: 'IC',
    pins: [
      { name: 'OUT', allowedTypes: ['DIGITAL'] },
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
    ],
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'u1',
        templateId: outputTemplate.id,
        name: 'Driver A',
        assignedPins: { OUT: 'NET_SHARED_OUT', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'u2',
        templateId: outputTemplate.id,
        name: 'Driver B',
        assignedPins: { OUT: 'NET_SHARED_OUT', VCC: '5V', GND: 'GND' },
      }),
    ],
    'kicad_generic',
    templateId => (templateId === outputTemplate.id ? outputTemplate : undefined),
  );

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'io.output-collision' &&
      issue.message.includes('NET_SHARED_OUT')
    )
  );
});

test('auditProjectDesign emits structured I2C planning and pull-up issues from datasheet rules', () => {
  const oledTemplate = getStaticTemplateById('tpl_oled');
  assert.ok(oledTemplate);

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'oled-1',
        templateId: 'tpl_oled',
        name: 'OLED A',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'oled-2',
        templateId: 'tpl_oled',
        name: 'OLED B',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_oled: oledTemplate })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'bus.i2c-address-planning' &&
      issue.title === 'I2C 주소 계획 필요' &&
      issue.message.includes('OLED A, OLED B') &&
      issue.message.includes('0x3C')
    )
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'bus.i2c-pullup-missing' &&
      issue.title === 'I2C 풀업 저항 확인 필요' &&
      issue.message.includes('OLED A, OLED B')
    )
  );
  const i2cPullupIssue = report.issues.find(issue => issue.code === 'bus.i2c-pullup-missing');
  assert.equal(i2cPullupIssue?.confidence, 'needs-review');
  assert.ok((i2cPullupIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok(i2cPullupIssue?.evidence?.observedFacts.some(fact => fact.includes('Reliable SDA pull-up source: no')));
  assert.ok(((i2cPullupIssue?.visualTargets?.componentIds)?.length ?? 0) >= 2);
});

test('auditProjectDesign accepts confirmed onboard I2C pull-ups without creating generic pull-up noise', () => {
  const moduleTemplate = makeTemplate({
    id: 'tpl_oled_with_pullups',
    name: 'OLED module with onboard pullups',
    category: 'DISPLAY',
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

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'oled-module-1',
        templateId: 'tpl_oled_with_pullups',
        name: 'OLED Module',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_oled_with_pullups: moduleTemplate })[templateId],
  );

  assert.equal(report.issues.some(issue => issue.ruleId === 'bus.i2c-pullup-missing'), false);
});

test('auditProjectDesign computes power budget usage and thermal junction risk for VIN-powered boards', () => {
  const mq2Template = getStaticTemplateById('tpl_gas_mq2');
  assert.ok(mq2Template);

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
    'vin-12v'
  );

  const fiveVoltRail = report.powerReport.rails.find(rail => rail.rail === '5V');
  assert.ok(fiveVoltRail);
  assert.equal(fiveVoltRail?.usedMa, 195);
  assert.equal(fiveVoltRail?.budgetMa, 160);
  assert.equal(fiveVoltRail?.status, 'error');
  assert.ok((fiveVoltRail?.usageRatio ?? 0) > 1);

  const regulator = report.powerReport.regulators.find(item => item.id === 'uno-vin-12v');
  assert.ok(regulator);
  assert.equal(regulator?.status, 'error');
  assert.ok((regulator?.junctionTempC ?? 0) >= 100);
  assert.equal(regulator?.thermalResistanceCPerW, 80);

  assert.ok(
    report.issues.some(issue => issue.code === 'power.rail-over-budget'),
    'expected 5V rail over-budget warning once board quiescent current is included'
  );
  const railBudgetIssue = report.issues.find(issue => issue.code === 'power.rail-over-budget');
  assert.equal(railBudgetIssue?.confidence, 'strong-inference');
  assert.ok((railBudgetIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((railBudgetIssue?.evidence?.assumptions.length ?? 0) >= 1);
  const reversePolarityIssue = report.issues.find(issue => issue.code === 'power.reverse-polarity-protection-missing');
  assert.equal(reversePolarityIssue?.confidence, 'strong-inference');
  assert.ok((reversePolarityIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((reversePolarityIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.ok(
    report.issues.some(issue => issue.code === 'power.regulator-thermal'),
    'expected thermal warning for the VIN regulator'
  );
  const thermalIssue = report.issues.find(issue => issue.code === 'power.regulator-thermal');
  assert.equal(thermalIssue?.confidence, 'confirmed');
  assert.ok((thermalIssue?.evidence?.observedFacts.length ?? 0) >= 4);
});

test('auditProjectDesign uses part_master current profiles to budget common modules conservatively', () => {
  const oledTemplate = getStaticTemplateById('tpl_oled');
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  assert.ok(oledTemplate);
  assert.ok(bluetoothTemplate);

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'oled-power-1',
        templateId: 'tpl_oled',
        name: 'SSD1306 OLED',
        assignedPins: { SDA: 'A4', SCL: 'A5', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'bt-power-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Bluetooth Module',
        assignedPins: { TX: 'D2', RX: 'D3', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
    'usb-5v'
  );

  const fiveVoltRail = report.powerReport.rails.find(rail => rail.rail === '5V');
  assert.ok(fiveVoltRail);
  assert.ok((fiveVoltRail?.usedMa ?? 0) >= 80, 'expected OLED + HC-06 plus board baseline to exceed trivial idle current');
  assert.ok((fiveVoltRail?.peakMa ?? 0) >= 105, 'expected peak budget to include Bluetooth bursts, OLED draw, and board baseline');
});

test('auditProjectDesign honors componentPowerModes overrides before conservative fallback', () => {
  const oledTemplate = getStaticTemplateById('tpl_oled');
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  assert.ok(oledTemplate);
  assert.ok(bluetoothTemplate);

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
    templateId => ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
    'usb-5v'
  );

  const lowPowerReport = auditProjectDesign(
    components,
    'uno',
    templateId => ({ tpl_oled: oledTemplate, tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
    'usb-5v',
    {
      'oled-mode-1': 'sleep',
      'bt-mode-1': 'idle-unpaired',
    }
  );

  const default5v = defaultReport.powerReport.rails.find(rail => rail.rail === '5V');
  const lowPower5v = lowPowerReport.powerReport.rails.find(rail => rail.rail === '5V');
  assert.ok(default5v);
  assert.ok(lowPower5v);
  assert.ok(
    (lowPower5v?.usedMa ?? 0) < (default5v?.usedMa ?? 0),
    'expected explicit low-power modes to reduce typical rail load'
  );
  assert.ok(
    (lowPower5v?.peakMa ?? 0) <= (default5v?.peakMa ?? 0),
    'expected explicit low-power modes to avoid increasing peak load'
  );
});

test('auditProjectDesign catches missing datasheet support parts on an arbitrary mixed-sensor circuit', () => {
  const bme280Template = getStaticTemplateById('tpl_bme280');
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  const ds18b20Template = getStaticTemplateById('tpl_ds18b20');
  const resistorTemplate = getStaticTemplateById('tpl_resistor');
  const capacitorTemplate = getStaticTemplateById('tpl_capacitor');
  assert.ok(bme280Template);
  assert.ok(bluetoothTemplate);
  assert.ok(ds18b20Template);
  assert.ok(resistorTemplate);
  assert.ok(capacitorTemplate);

  const resolveTemplate = (templateId: string) => ({
    tpl_bme280: bme280Template,
    tpl_bluetooth_hc05: bluetoothTemplate,
    tpl_ds18b20: ds18b20Template,
    tpl_resistor: resistorTemplate,
    tpl_capacitor: capacitorTemplate,
  })[templateId];

  const sparseReport = auditProjectDesign(
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
    resolveTemplate,
    'usb-5v'
  );

  assert.ok(
    sparseReport.issues.some(issue =>
      issue.ruleId === 'part-master.decoupling-missing' &&
      issue.message.includes('BME280')
    ),
    'expected BME280 decoupling hint to surface in sparse circuit'
  );
  assert.ok(
    sparseReport.issues.some(issue =>
      issue.ruleId === 'part-master.bias-resistor-missing' &&
      issue.message.includes('DS18B20')
    ),
    'expected DS18B20 pull-up hint to surface in sparse circuit'
  );
  assert.ok(
    sparseReport.issues.some(issue =>
      issue.ruleId === 'bus.i2c-pullup-missing'
    ),
    'expected generic I2C pull-up rule to still trigger'
  );
  const decouplingIssue = sparseReport.issues.find(issue => issue.ruleId === 'part-master.decoupling-missing');
  const biasIssue = sparseReport.issues.find(issue => issue.ruleId === 'part-master.bias-resistor-missing');
  const pullupIssue = sparseReport.issues.find(issue => issue.ruleId === 'bus.i2c-pullup-missing');
  const bulkWirelessIssue = sparseReport.issues.find(issue => issue.ruleId === 'power.bulk-cap-wireless');
  assert.equal(decouplingIssue?.confidence, 'needs-review');
  assert.ok((decouplingIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.equal(biasIssue?.confidence, 'needs-review');
  assert.ok((biasIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.equal(pullupIssue?.confidence, 'needs-review');
  assert.ok((pullupIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((pullupIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.equal(bulkWirelessIssue?.confidence, 'needs-review');
  assert.ok((bulkWirelessIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((bulkWirelessIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.ok(((bulkWirelessIssue?.visualTargets?.componentIds)?.length ?? 0) >= 1);

  const fixedReport = auditProjectDesign(
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
      makeComponent({
        instanceId: 'r-pullup-1',
        templateId: 'tpl_resistor',
        name: 'I2C Pull-up 1',
        value: '4.7k Ohm',
      }),
      makeComponent({
        instanceId: 'r-pullup-2',
        templateId: 'tpl_resistor',
        name: 'Bus Pull-up 2',
        value: '4.7k Ohm',
      }),
      makeComponent({
        instanceId: 'c-decouple-1',
        templateId: 'tpl_capacitor',
        name: 'Bypass Cap',
        value: '0.1uF',
      }),
    ],
    'uno',
    resolveTemplate,
    'usb-5v'
  );

  assert.equal(
    fixedReport.issues.some(issue => issue.ruleId === 'part-master.decoupling-missing'),
    false
  );
  assert.equal(
    fixedReport.issues.some(issue => issue.ruleId === 'part-master.bias-resistor-missing'),
    false
  );
  assert.equal(
    fixedReport.issues.some(issue => issue.ruleId === 'bus.i2c-pullup-missing'),
    false
  );
});

test('auditProjectDesign does not treat an unrelated level shifter as mitigation for a direct UART overvoltage path', () => {
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  const levelShifterTemplate = getStaticTemplateById('tpl_level_shifter');
  assert.ok(bluetoothTemplate);
  assert.ok(levelShifterTemplate);

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'bt-risk-1',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Risk',
        value: 'HC-06',
        assignedPins: { TX: 'D3', RX: 'D2', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'ls-idle-1',
        templateId: 'tpl_level_shifter',
        name: 'Idle Level Shifter',
        assignedPins: { HV: '5V', LV: '3.3V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({
      tpl_bluetooth_hc05: bluetoothTemplate,
      tpl_level_shifter: levelShifterTemplate,
    })[templateId],
    'usb-5v'
  );

  assert.ok(
    report.issues.some(issue =>
      issue.ruleId === 'electrical.logic-level.overvoltage' &&
      issue.severity === 'error' &&
      issue.message.includes('HC-06 Risk')
    ),
    'expected a direct 5V UART path to remain an error unless mitigation is on the actual signal path'
  );
  const issue = report.issues.find(candidate => candidate.ruleId === 'electrical.logic-level.overvoltage');
  assert.equal(issue?.confidence, 'confirmed');
  assert.ok((issue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.match(issue?.evidence?.evidenceSummary ?? '', /입력 허용치/);
});

test('auditProjectDesign warns earlier when a linear regulator enters low long-term thermal headroom', () => {
  const mq2Template = getStaticTemplateById('tpl_gas_mq2');
  assert.ok(mq2Template);

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'mq2-headroom',
        templateId: 'tpl_gas_mq2',
        name: 'MQ2 Headroom Sensor',
        assignedPins: { VCC: '5V', GND: 'GND', AOut: 'A0', DOut: 'D2' },
      }),
    ],
    'uno',
    templateId => ({ tpl_gas_mq2: mq2Template })[templateId],
    'vin-9v'
  );

  const regulator = report.powerReport.regulators.find(item => item.id === 'uno-vin-9v');
  assert.ok(regulator);
  assert.equal(regulator?.status, 'error');
  assert.ok((regulator?.usageRatio ?? 0) >= 0.8);

  assert.ok(
    report.issues.some(issue => issue.code === 'power.regulator-thermal'),
    'expected regulator thermal warning once board baseline current is included'
  );
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'power.regulator-thermal' &&
      issue.recommendation?.includes('RθJA')
    ),
    'expected regulator thermal warning to point the user at datasheet thermal items'
  );
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'power.regulator-thermal' &&
      issue.recommendation?.includes('정격')
    ),
    'expected regulator thermal warning to keep the recommendation grounded in datasheet limits'
  );
  const thermalIssue = report.issues.find(issue => issue.code === 'power.regulator-thermal');
  assert.equal(thermalIssue?.confidence, 'confirmed');
  assert.ok((thermalIssue?.evidence?.observedFacts.length ?? 0) >= 4);
  const thermalLayoutIssue = report.issues.find(issue => issue.code === 'thermal.via-copper-review');
  assert.equal(thermalLayoutIssue?.confidence, 'needs-review');
  assert.ok((thermalLayoutIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((thermalLayoutIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.ok(((thermalLayoutIssue?.visualTargets?.componentIds)?.length ?? 0) >= 1);
});

test('auditProjectDesign emits structured low-headroom rail evidence before a rail is fully over budget', () => {
  const mq2Template = getStaticTemplateById('tpl_gas_mq2');
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  assert.ok(mq2Template);
  assert.ok(bluetoothTemplate);

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
    templateId => ({ tpl_gas_mq2: mq2Template, tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
    'vin-9v'
  );

  const railIssue = report.issues.find(issue => issue.code === 'power.rail-low-headroom');
  assert.ok(railIssue, 'expected 5V rail low-headroom issue under VIN 9V load');
  assert.equal(railIssue?.confidence, 'needs-review');
  assert.ok((railIssue?.evidence?.observedFacts.length ?? 0) >= 3);
  assert.ok((railIssue?.evidence?.assumptions.length ?? 0) >= 1);
});

test('auditProjectDesign emits structured regulator headroom evidence before thermal failure', () => {
  const bluetoothTemplate = getStaticTemplateById('tpl_bluetooth_hc05');
  assert.ok(bluetoothTemplate);

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'bt-reg-headroom',
        templateId: 'tpl_bluetooth_hc05',
        name: 'HC-06 Regulator Headroom',
        value: 'HC-06',
        assignedPins: { TX: 'D10', RX: 'D11', VCC: '5V', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_bluetooth_hc05: bluetoothTemplate })[templateId],
    'vin-12v'
  );

  const regulatorIssue = report.issues.find(issue => issue.code === 'power.regulator-headroom');
  assert.ok(regulatorIssue, 'expected regulator headroom warning under VIN 12V Bluetooth load');
  assert.equal(regulatorIssue?.confidence, 'needs-review');
  assert.ok((regulatorIssue?.evidence?.observedFacts.length ?? 0) >= 4);
  assert.ok((regulatorIssue?.evidence?.assumptions.length ?? 0) >= 1);
  assert.ok(((regulatorIssue?.visualTargets?.componentIds)?.length ?? 0) >= 1);
});

test('auditProjectDesign warns when a MOSFET gate path has no damping resistor candidate', () => {
  const mosfetTemplate = makeTemplate({
    id: 'tpl_power_mosfet',
    name: 'Power MOSFET',
    pins: [
      { name: 'G', allowedTypes: ['DIGITAL'] },
      { name: 'D', allowedTypes: ['DIGITAL'] },
      { name: 'S', allowedTypes: ['GND'] },
    ],
    category: 'PASSIVE',
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'q1',
        templateId: 'tpl_power_mosfet',
        name: 'Q1',
        value: 'IRLZ44N MOSFET',
        assignedPins: { G: 'D9', D: 'VIN', S: 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_power_mosfet: mosfetTemplate })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'maker.mosfet-gate-resistor' &&
      issue.message.includes('10Ω~220Ω')
    )
  );
});

test('auditProjectDesign flags adjustable regulator projects that miss divider resistors', () => {
  const lm317Template = makeTemplate({
    id: 'tpl_lm317_adj',
    name: 'LM317 Adjustable Regulator',
    pins: [
      { name: 'IN', allowedTypes: ['POWER'] },
      { name: 'OUT', allowedTypes: ['POWER'] },
      { name: 'ADJ', allowedTypes: ['ANALOG'] },
    ],
    category: 'PASSIVE',
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'u1',
        templateId: 'tpl_lm317_adj',
        name: 'U1',
        value: 'LM317',
        assignedPins: { IN: 'VIN', OUT: 'VREG', ADJ: 'ADJ_NET' },
      }),
    ],
    'uno',
    templateId => ({ tpl_lm317_adj: lm317Template })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'maker.adjustable-regulator-divider-missing' &&
      issue.severity === 'error'
    )
  );
});

test('auditProjectDesign flags polarized parts whose positive side is tied to a negative rail', () => {
  const polarizedCapTemplate = makeTemplate({
    id: 'tpl_polarized_cap',
    name: 'Polarized Capacitor',
    pins: [
      { name: '+', allowedTypes: ['POWER'] },
      { name: '-', allowedTypes: ['GND'] },
    ],
    category: 'PASSIVE',
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'c1',
        templateId: 'tpl_polarized_cap',
        name: 'C1',
        value: '100uF',
        assignedPins: { '+': '-12V', '-': 'GND' },
      }),
    ],
    'uno',
    templateId => ({ tpl_polarized_cap: polarizedCapTemplate })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'maker.dual-rail-polarity' &&
      issue.severity === 'error' &&
      issue.message.includes('-12V')
    )
  );
});

test('auditProjectDesign emits audio protection review issues for amplifier projects without coupling or zobel parts', () => {
  const amplifierTemplate = makeTemplate({
    id: 'tpl_audio_amp',
    name: 'Audio Amplifier',
    pins: [
      { name: 'IN', allowedTypes: ['ANALOG'] },
      { name: 'OUT', allowedTypes: ['ANALOG'] },
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
    ],
    category: 'IC',
  });

  const jackTemplate = makeTemplate({
    id: 'tpl_audio_jack',
    name: 'Speaker Jack',
    pins: [
      { name: 'TIP', allowedTypes: ['ANALOG'] },
      { name: 'GND', allowedTypes: ['GND'] },
    ],
    category: 'CONNECTOR',
  });

  const report = auditProjectDesign(
    [
      makeComponent({
        instanceId: 'amp-1',
        templateId: 'tpl_audio_amp',
        name: 'U1 Audio Amplifier',
        value: 'LM386',
        assignedPins: { IN: 'AUDIO_IN', OUT: 'SPK_OUT', VCC: '5V', GND: 'GND' },
      }),
      makeComponent({
        instanceId: 'jack-1',
        templateId: 'tpl_audio_jack',
        name: 'J1 Speaker Jack',
        assignedPins: { TIP: 'SPK_OUT', GND: 'GND' },
      }),
    ],
    'uno',
    templateId => ({
      tpl_audio_amp: amplifierTemplate,
      tpl_audio_jack: jackTemplate,
    })[templateId],
  );

  assert.ok(
    report.issues.some(issue =>
      issue.code === 'maker.audio-input-coupling-review' &&
      issue.message.includes('0.47uF')
    )
  );
  assert.ok(
    report.issues.some(issue =>
      issue.code === 'maker.audio-zobel-review' &&
      issue.message.includes('10Ω + 0.1uF')
    )
  );
});
