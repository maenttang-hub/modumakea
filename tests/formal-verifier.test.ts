import test from 'node:test';
import assert from 'node:assert/strict';

import { getTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { verifyCircuitCodeConsistency, verifyCircuitCodeConsistencyAsync } from '@/lib/formal-verifier';
import { clearModuMakeWasmKernelBindings, registerModuMakeWasmKernelBindings } from '@/lib/modumake-wasm-kernel';
import { makeComponent, makeManualConnection, makeTemplate } from './test-fixtures.ts';

test.afterEach(() => {
  clearModuMakeWasmKernelBindings();
});

const groundTrapTemplate = makeTemplate({
  id: 'tpl_ground_trap',
  name: 'Ground Trap',
  pins: [
    { name: 'Signal', allowedTypes: ['DIGITAL'] },
    { name: 'GND', allowedTypes: ['GND'] },
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

const buttonTemplate = makeTemplate({
  id: 'tpl_button',
  name: '버튼',
  category: 'SENSOR',
  pins: [
    { name: 'VCC', allowedTypes: ['POWER'] },
    { name: 'GND', allowedTypes: ['GND'] },
    { name: 'Signal', allowedTypes: ['DIGITAL'] },
  ],
});

function resolveTemplate(templateId: string) {
  return {
    tpl_ground_trap: groundTrapTemplate,
    tpl_oled: oledTemplate,
    tpl_button: buttonTemplate,
  }[templateId];
}

test('formal verifier blocks driving a board pin that is physically shorted to ground', () => {
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
  ];

  const manualConnections = [
    makeManualConnection(
      'trap-link',
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'Signal' },
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'GND' }
    ),
  ];

  const circuitAnalysis = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        pinMode(D2, OUTPUT);
      }
      void loop() {
        digitalWrite(D2, HIGH);
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis,
  });

  assert.ok(report.analyzed);
  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.output-drive-grounded-net'),
    'expected grounded net drive to be flagged'
  );
});

test('formal verifier flags analogRead on a non-ADC pin', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void loop() {
        int raw = analogRead(D2);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.analog-read-on-non-adc'),
    'expected analogRead misuse to be flagged'
  );
});

test('formal verifier exposes review engine metadata so the UI can describe parser rigor honestly', () => {
  registerModuMakeWasmKernelBindings({
    collectCppReviewArtifactsJson: () =>
      JSON.stringify({
        language: 'cpp',
        operations: [
          {
            type: 'digitalWrite',
            boardPin: 'D2',
            value: 'HIGH',
            line: 2,
            scope: 'loop',
          },
        ],
        i2cAddressUses: [],
        interruptUses: [],
        includedHeaders: [],
        parseTree: {
          backend: 'rust-wasm',
          source: 'digitalWrite(D2, HIGH);',
          preprocessedSource: 'digitalWrite(D2, HIGH);',
          sanitizedSource: 'digitalWrite(D2, HIGH);',
          hasErrors: false,
          calls: [],
        },
      }),
  });

  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void loop() {
        digitalWrite(D2, HIGH);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(report.engineMeta?.language, 'cpp');
  assert.equal(report.engineMeta?.parserBackend, 'rust-wasm');
  assert.equal(report.engineMeta?.parserTier, 'structured-review');
});

test('formal verifier de-duplicates identical structured issues from repeated parser operations', () => {
  registerModuMakeWasmKernelBindings({
    collectCppReviewArtifactsJson: () =>
      JSON.stringify({
        language: 'cpp',
        operations: [
          {
            type: 'analogRead',
            boardPin: 'D2',
            line: 3,
            scope: 'loop',
          },
          {
            type: 'analogRead',
            boardPin: 'D2',
            line: 3,
            scope: 'loop',
          },
        ],
        i2cAddressUses: [],
        interruptUses: [],
        includedHeaders: [],
        parseTree: null,
      }),
  });

  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void loop() {
        analogRead(D2);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(
    report.issues.filter(issue => issue.ruleId === 'formal.analog-read-on-non-adc').length,
    1
  );
});

test('formal verifier ignores commented-out C++ operations', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        // pinMode(D2, OUTPUT);
        /* digitalWrite(D2, HIGH); */
      }
      void loop() {
        // analogRead(D2);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(report.issueCount, 0);
  assert.equal(report.operationCount, 0);
});

test('formal verifier follows a simple wrapper function call for output-drive checks', () => {
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
  ];

  const manualConnections = [
    makeManualConnection(
      'trap-link',
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'Signal' },
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'GND' }
    ),
  ];

  const circuitAnalysis = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void safeWrite(int pin, int val) {
        digitalWrite(pin, val);
      }

      void loop() {
        safeWrite(D2, HIGH);
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis,
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.output-drive-grounded-net'),
    'expected wrapper-based drive to be flagged'
  );
});

test('formal verifier surfaces branch and call-chain context for nested wrappers', () => {
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
  ];

  const manualConnections = [
    makeManualConnection(
      'trap-link',
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'Signal' },
      { ownerType: 'component', ownerId: 'trap-1', pinId: 'GND' }
    ),
  ];

  const circuitAnalysis = analyzeCircuitNetlist(components, 'uno', resolveTemplate, manualConnections);
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void leaf(int pin) {
        digitalWrite(pin, HIGH);
      }

      void branch(int pin, bool armed) {
        if (armed) {
          leaf(pin);
        }
      }

      void loop() {
        branch(D2, true);
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis,
  });

  const issue = report.issues.find(item => item.ruleId === 'formal.output-drive-grounded-net');
  assert.ok(issue, 'expected grounded drive issue');
  assert.equal(issue?.code, 'formal.output-drive-grounded-net');
  assert.equal(issue?.params?.boardPin, 'D2');
});

test('formal verifier flags a pin mode conflict across setup and loop', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        pinMode(D2, INPUT);
      }

      void loop() {
        digitalWrite(D2, HIGH);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.pin-mode-state-conflict'),
    'expected setup/loop pin mode conflict to be flagged'
  );
});

test('formal verifier flags I2C address mismatch against canvas devices', () => {
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

  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      #include <Wire.h>

      void setup() {
        Wire.begin();
      }

      void loop() {
        Wire.beginTransmission(0x27);
        Wire.endTransmission();
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis: analyzeCircuitNetlist(components, 'uno', resolveTemplate, []),
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.i2c-address-mismatch'),
    'expected I2C address mismatch to be flagged'
  );
});

test('formal verifier flags unsupported interrupt pin usage on Uno', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        attachInterrupt(digitalPinToInterrupt(D4), onPulse, RISING);
      }

      void loop() {}
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.interrupt-pin-unsupported'),
    'expected unsupported interrupt pin to be flagged'
  );
});

test('formal verifier recognizes dotted Python Pin object output calls', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
from machine import Pin

def loop():
    Pin(board.D13).on()
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(report.operationCount, 1);
  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.unwired-pin-reference'),
    'expected dotted Python Pin object call to flow into normal unwired-pin diagnostics'
  );
});

test('formal verifier async entrypoint reports C++ syntax errors without throwing', async () => {
  const report = await verifyCircuitCodeConsistencyAsync({
    boardId: 'uno',
    code: `
      void loop( {
        digitalWrite(D2, HIGH);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(report.analyzed, false);
  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.syntax-error'),
    'expected syntax error issue from async verifier'
  );
});

test('formal verifier async entrypoint reports Python syntax errors without throwing', async () => {
  const report = await verifyCircuitCodeConsistencyAsync({
    boardId: 'rpi4',
    code: `
from machine import Pin

led = Pin(17
led.on()
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.equal(report.analyzed, false);
  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.syntax-error'),
    'expected Python syntax error issue from async verifier'
  );
});

test('formal verifier flags library API arity mismatches', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      #include <LiquidCrystal_I2C.h>
      LiquidCrystal_I2C lcd(0x27, 16);

      void setup() {
        lcd.setCursor(0);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.library-api-arity-mismatch'),
    'expected library API arity mismatch'
  );
});

test('formal verifier does not confuse Serial.begin with DHT.begin', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `#include <DHT.h>
#define DHTPIN 2
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
void setup() {
  Serial.begin(9600);
  dht.begin();
}
void loop() {}`,
    components: [
      makeComponent({
        instanceId: 'dht-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        assignedPins: {
          DATA: 'D2',
          VCC: '5V',
          GND: 'GND',
        },
      }),
    ],
    resolveTemplate: getTemplateById,
    circuitAnalysis: analyzeCircuitNetlist([], 'uno', getTemplateById, []),
  });

  assert.equal(
    report.issues.some(issue => issue.ruleId === 'formal.library-api-arity-mismatch'),
    false
  );
});

test('formal verifier flags forbidden library API calls', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      #include <DHT.h>
      DHT dht(2, DHT11);

      void loop() {
        dht.read(true);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.library-api-forbidden-call'),
    'expected forbidden library call to be flagged'
  );
});

test('formal verifier flags Servo vs PWM timer conflicts on Uno', () => {
  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      #include <Servo.h>
      Servo servo1;

      void loop() {
        analogWrite(9, 120);
      }
    `,
    components: [],
    resolveTemplate,
    circuitAnalysis: { nets: [], resistors: [], issues: [] },
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.timer-servo-pwm-conflict'),
    'expected Servo/PWM timer conflict'
  );
});

test('formal verifier recommends INPUT_PULLUP for grounded buttons without a pull resistor', () => {
  const components = [
    makeComponent({
      instanceId: 'btn-1',
      templateId: 'tpl_button',
      name: 'Button 1',
      assignedPins: {
        Signal: 'D2',
        GND: 'GND',
      },
    }),
  ];

  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        pinMode(D2, INPUT);
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis: analyzeCircuitNetlist(components, 'uno', resolveTemplate, []),
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.button-grounded-needs-input-pullup'),
    'expected INPUT_PULLUP recommendation'
  );
});

test('formal verifier flags VCC-side buttons that incorrectly use INPUT_PULLUP', () => {
  const components = [
    makeComponent({
      instanceId: 'btn-1',
      templateId: 'tpl_button',
      name: 'Button 1',
      assignedPins: {
        Signal: 'D2',
        VCC: '5V',
      },
    }),
  ];

  const report = verifyCircuitCodeConsistency({
    boardId: 'uno',
    code: `
      void setup() {
        pinMode(D2, INPUT_PULLUP);
      }
    `,
    components,
    resolveTemplate,
    circuitAnalysis: analyzeCircuitNetlist(components, 'uno', resolveTemplate, []),
  });

  assert.ok(
    report.issues.some(issue => issue.ruleId === 'formal.button-vcc-incompatible-pullup'),
    'expected VCC-side polarity mismatch warning'
  );
});
