import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectCppOperations,
  collectCppReviewArtifacts,
  collectPythonReviewArtifactsAsync,
  collectPythonReviewArtifacts,
  collectPythonOperations,
  findCalls,
  parseCpp,
  parsePython,
  parsePythonAsync,
} from '@/lib/ast-parser';
import {
  clearModuMakeWasmKernelBindings,
  registerModuMakeWasmKernelBindings,
} from '@/lib/modumake-wasm-kernel';
import {
  clearModuMakePythonAstBindings,
  registerModuMakePythonAstBindings,
} from '@/lib/python-ast-provider';

test.afterEach(() => {
  clearModuMakeWasmKernelBindings();
  clearModuMakePythonAstBindings();
});

test('ast parser facade captures direct and wrapped Arduino pin operations', async () => {
  const source = `
    #define LED_PIN 13

    void safeWrite(int pin, int state) {
      digitalWrite(pin, state);
    }

    void setup() {
      pinMode(LED_PIN, OUTPUT);
    }

    void loop() {
      safeWrite(LED_PIN, HIGH);
      analogRead(A0);
    }
  `;

  const tree = await parseCpp(source);
  assert.ok(tree, 'expected parse tree');
  const digitalWrites = findCalls(tree, 'digitalWrite');

  assert.equal(tree?.hasErrors, false);
  assert.equal(digitalWrites.length, 1);
  assert.deepEqual(
    digitalWrites[0]?.arguments.map(argument => ({ kind: argument.kind, value: argument.value })),
    [
      { kind: 'identifier', value: 'pin' },
      { kind: 'identifier', value: 'state' },
    ]
  );

  const operations = collectCppOperations(source, 'uno');
  assert.ok(
    operations.some(operation => operation.type === 'pinMode' && operation.boardPin === 'D13'),
    'expected pinMode alias resolution'
  );
  assert.ok(
    operations.some(operation => operation.type === 'digitalWrite' && operation.boardPin === 'D13'),
    'expected wrapped digitalWrite to resolve to D13'
  );
  assert.ok(
    operations.some(operation => operation.type === 'analogRead' && operation.boardPin === 'A0'),
    'expected analogRead operation to be extracted'
  );
});

test('ast parser facade ignores commented-out operations', async () => {
  const source = `
    void loop() {
      // digitalWrite(D2, HIGH);
      /* analogRead(A0); */
    }
  `;

  const tree = await parseCpp(source);
  const operations = collectCppOperations(source, 'uno');

  assert.equal(findCalls(tree, 'digitalWrite').length, 0);
  assert.equal(operations.length, 0);
});

test('ast parser facade returns null for obvious syntax errors', async () => {
  const tree = await parseCpp(`
    void loop( {
      digitalWrite(D2, HIGH);
    }
  `);

  assert.equal(tree, null);
});

test('ast parser facade traces multi-stage wrapper calls and branch context', () => {
  const source = `
    #define LED_PIN 13

    void finalWrite(int pin, int value) {
      digitalWrite(pin, value);
    }

    void stageTwo(int pin) {
      if (pin == LED_PIN) {
        finalWrite(pin, HIGH);
      } else {
        finalWrite(pin, LOW);
      }
    }

    void stageOne(int pin) {
      stageTwo(pin);
    }

    void loop() {
      stageOne(LED_PIN);
    }
  `;

  const operations = collectCppOperations(source, 'uno');
  const highWrite = operations.find(
    operation =>
      operation.type === 'digitalWrite' &&
      operation.boardPin === 'D13' &&
      operation.value === 'HIGH'
  );

  assert.ok(highWrite, 'expected nested wrapper write to be resolved');
  assert.ok(highWrite?.callPath?.some(entry => entry.startsWith('stageOne@')));
  assert.ok(highWrite?.callPath?.some(entry => entry.startsWith('stageTwo@')));
  assert.ok(highWrite?.callPath?.some(entry => entry.startsWith('finalWrite@')));
  assert.ok(highWrite?.conditional, 'expected branch-derived operation to be marked conditional');
  assert.deepEqual(highWrite?.conditions, ['if(13 == 13)']);
});

test('ast parser facade can consume registered wasm bindings', async () => {
  registerModuMakeWasmKernelBindings({
    parseCppJson: source =>
      JSON.stringify({
        backend: 'rust-wasm',
        source,
        preprocessedSource: source,
        sanitizedSource: source,
        hasErrors: false,
        calls: [
          {
            name: 'digitalWrite',
            arguments: [
              { raw: 'D2', kind: 'identifier', value: 'D2' },
              { raw: 'HIGH', kind: 'identifier', value: 'HIGH' },
            ],
            line: 1,
            raw: 'digitalWrite(D2, HIGH)',
          },
        ],
      }),
    collectCppOperationsJson: () =>
      JSON.stringify([
        {
          type: 'digitalWrite',
          boardPin: 'D2',
          value: 'HIGH',
          line: 1,
          scope: 'loop',
        },
      ]),
    collectCppReviewArtifactsJson: () =>
      JSON.stringify({
        language: 'cpp',
        operations: [
          {
            type: 'digitalWrite',
            boardPin: 'D2',
            value: 'HIGH',
            line: 1,
            scope: 'loop',
          },
        ],
        i2cAddressUses: [{ address: '0x3C', line: 2, source: 'Wire.beginTransmission' }],
        interruptUses: [{ boardPin: 'D3', line: 3 }],
        includedHeaders: ['Servo.h'],
        parseTree: {
          backend: 'rust-wasm',
          source: 'digitalWrite(D2, HIGH);',
          preprocessedSource: 'digitalWrite(D2, HIGH);',
          sanitizedSource: 'digitalWrite(D2, HIGH);',
          hasErrors: false,
          calls: [
            {
              name: 'digitalWrite',
              arguments: [
                { raw: 'D2', kind: 'identifier', value: 'D2' },
                { raw: 'HIGH', kind: 'identifier', value: 'HIGH' },
              ],
              line: 1,
              raw: 'digitalWrite(D2, HIGH)',
            },
          ],
        },
      }),
  });

  const tree = await parseCpp('digitalWrite(D2, HIGH);');
  const operations = collectCppOperations('digitalWrite(D2, HIGH);', 'uno');

  assert.equal(tree?.backend, 'rust-wasm');
  assert.equal(findCalls(tree, 'digitalWrite').length, 1);
  assert.equal(operations[0]?.boardPin, 'D2');
  assert.equal(operations[0]?.scope, 'loop');
});

test('ast parser facade collects review artifacts for verifier handoff', () => {
  const source = `
    #include <Servo.h>
    #define IRQ_PIN 2

    void setup() {
      attachInterrupt(digitalPinToInterrupt(IRQ_PIN), onPulse, RISING);
      Wire.beginTransmission(0x3C);
    }
  `;

  const artifacts = collectCppReviewArtifacts(source, 'uno');

  assert.ok(artifacts.includedHeaders.includes('Servo.h'));
  assert.equal(artifacts.interruptUses[0]?.boardPin, 'D2');
  assert.equal(artifacts.i2cAddressUses[0]?.address, '0x3C');
  assert.ok(
    artifacts.operations.every(operation => operation.boardPin.length > 0),
    'expected collected operations to stay normalized for verifier input'
  );
});

test('ast parser facade prefers wasm review artifacts when bindings are registered', () => {
  registerModuMakeWasmKernelBindings({
    collectCppReviewArtifactsJson: () =>
      JSON.stringify({
        language: 'cpp',
        operations: [
          {
            type: 'pinMode',
            boardPin: 'D4',
            mode: 'INPUT_PULLUP',
            line: 4,
            scope: 'setup',
          },
        ],
        i2cAddressUses: [{ address: '0x27', line: 6, source: 'lcd.begin', templateHint: 'tpl_lcd1602' }],
        interruptUses: [{ boardPin: 'D2', line: 8 }],
        includedHeaders: ['LiquidCrystal_I2C.h'],
        parseTree: null,
      }),
  });

  const artifacts = collectCppReviewArtifacts('void setup() {}', 'uno');

  assert.equal(artifacts.operations[0]?.boardPin, 'D4');
  assert.equal(artifacts.operations[0]?.type, 'pinMode');
  assert.equal(artifacts.i2cAddressUses[0]?.address, '0x27');
  assert.equal(artifacts.interruptUses[0]?.boardPin, 'D2');
  assert.deepEqual(artifacts.includedHeaders, ['LiquidCrystal_I2C.h']);
});

test('python parser facade returns structured review artifacts through the parser boundary', () => {
  const source = `
from gpiozero import LED

status_led = LED(17)
status_led.on()
status_led.off()
`;

  const parseTree = parsePython(source, 'rpi4');
  const artifacts = collectPythonReviewArtifacts(source, 'rpi4');

  assert.equal(parseTree.backend, 'fallback');
  assert.equal(parseTree.hasErrors, false);
  assert.equal(parseTree.aliases[0]?.name, 'status_led');
  assert.equal(parseTree.aliases[0]?.boardPin, 'GPIO17');
  assert.equal(parseTree.calls.length, 2);
  assert.equal(parseTree.calls[0]?.name, 'on');
  assert.equal(parseTree.operations.length, 2);
  assert.equal(artifacts.language, 'python');
  assert.equal(artifacts.operations[0]?.boardPin, 'GPIO17');
  const secondOperation = artifacts.parseTree.operations[1];
  assert.equal(secondOperation?.type, 'digitalWrite');
  if (secondOperation?.type !== 'digitalWrite') {
    assert.fail('expected the second python operation to be a digitalWrite');
  }
  assert.equal(secondOperation.value, 'LOW');
});

test('python parser facade prefers wasm review artifacts when bindings are registered', () => {
  registerModuMakeWasmKernelBindings({
    parsePythonJson: () =>
      JSON.stringify({
        backend: 'rust-wasm',
        source: 'led.on()',
        sanitizedSource: 'led.on()',
        hasErrors: false,
        calls: [{ name: 'on', subject: 'led', arguments: [], line: 1, raw: 'led.on()' }],
        aliases: [{ name: 'led', boardPin: 'GPIO17' }],
        operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
      }),
    collectPythonReviewArtifactsJson: () =>
      JSON.stringify({
        language: 'python',
        operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
        parseTree: {
          backend: 'rust-wasm',
          source: 'led.on()',
          sanitizedSource: 'led.on()',
          hasErrors: false,
          calls: [{ name: 'on', subject: 'led', arguments: [], line: 1, raw: 'led.on()' }],
          aliases: [{ name: 'led', boardPin: 'GPIO17' }],
          operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
        },
      }),
  });

  const parseTree = parsePython('led.on()', 'rpi4');
  const artifacts = collectPythonReviewArtifacts('led.on()', 'rpi4');

  assert.equal(parseTree.backend, 'rust-wasm');
  assert.equal(parseTree.aliases[0]?.boardPin, 'GPIO17');
  assert.equal(artifacts.parseTree.backend, 'rust-wasm');
  assert.equal(artifacts.operations[0]?.boardPin, 'GPIO17');
});

test('ast parser facade normalizes Python pin aliases behind the parser boundary', () => {
  const operations = collectPythonOperations(
    `
      led = Pin(2)
      sensor = DigitalInOut(board.GPIO4)
      led.on()
      sensor.value()
    `,
    'rpi4'
  );

  assert.ok(
    operations.some(operation => operation.type === 'digitalWrite' && operation.boardPin === 'GPIO2'),
    'expected Python Pin alias to normalize through parser facade'
  );
  assert.ok(
    operations.some(operation => operation.type === 'digitalRead' && operation.boardPin === 'GPIO4'),
    'expected DigitalInOut alias read to normalize through parser facade'
  );
});

test('ast parser facade strips Python comments before extracting operations', () => {
  const operations = collectPythonOperations(
    `
      # led = Pin(2)
      # led.on()
      live = Pin(3)
      live.off()
    `,
    'rpi4'
  );

  assert.equal(operations.length, 1);
  assert.equal(operations[0]?.boardPin, 'GPIO3');
});

test('python parser facade marks obvious syntax errors and keeps async review path aligned', async () => {
  const source = `
from machine import Pin

led = Pin(2
led.on()
`;

  const parseTree = parsePython(source, 'rpi4');
  const artifacts = await collectPythonReviewArtifactsAsync(source, 'rpi4');

  assert.equal(parseTree.hasErrors, true);
  assert.equal(artifacts.parseTree.hasErrors, true);
});

test('python parser async facade loads generated bindings and keeps branch context', async () => {
  const source = `
from machine import Pin

LED_PIN = 17
led = Pin(LED_PIN)

def loop():
    if ready:
        led.on()
    else:
        led.off()
`;

  const asyncTree = await parsePythonAsync(source, 'rpi4');
  const artifacts = await collectPythonReviewArtifactsAsync(source, 'rpi4');

  assert.equal(asyncTree.backend, 'generated');
  assert.equal(asyncTree.aliases[0]?.boardPin, 'GPIO17');
  assert.ok(
    asyncTree.operations.some(operation =>
      operation.type === 'digitalWrite' &&
      operation.boardPin === 'GPIO17' &&
      operation.scope === 'loop' &&
      operation.conditional === true &&
      operation.conditions?.[0]?.includes('if ready')
    ),
    'expected generated provider to retain loop/branch context for Python writes'
  );
  assert.equal(artifacts.parseTree.backend, 'generated');
  assert.equal(artifacts.operations.length, 2);
});

test('python parser async facade prefers a registered tree-sitter provider when available', async () => {
  registerModuMakePythonAstBindings({
    parsePython: () => ({
      backend: 'tree-sitter',
      source: 'led.on()',
      sanitizedSource: 'led.on()',
      hasErrors: false,
      calls: [{ name: 'on', subject: 'led', arguments: [], line: 1, raw: 'led.on()' }],
      aliases: [{ name: 'led', boardPin: 'GPIO17' }],
      operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
    }),
    collectPythonReviewArtifacts: () => ({
      language: 'python',
      operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
      parseTree: {
        backend: 'tree-sitter',
        source: 'led.on()',
        sanitizedSource: 'led.on()',
        hasErrors: false,
        calls: [{ name: 'on', subject: 'led', arguments: [], line: 1, raw: 'led.on()' }],
        aliases: [{ name: 'led', boardPin: 'GPIO17' }],
        operations: [{ type: 'digitalWrite', boardPin: 'GPIO17', value: 'HIGH', line: 1, scope: 'other' }],
      },
    }),
  });

  const parseTree = parsePython('led.on()', 'rpi4');
  const asyncTree = await parsePythonAsync('led.on()', 'rpi4');
  const artifacts = await collectPythonReviewArtifactsAsync('led.on()', 'rpi4');

  assert.equal(parseTree.backend, 'fallback');
  assert.equal(asyncTree.backend, 'tree-sitter');
  assert.equal(artifacts.parseTree.backend, 'tree-sitter');
  assert.equal(artifacts.operations[0]?.boardPin, 'GPIO17');
});
