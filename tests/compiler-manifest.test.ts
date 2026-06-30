import test from 'node:test';
import assert from 'node:assert/strict';

import type { AICodeGenerationPayload } from '@/types';
import { buildCompilerManifest } from '@/lib/platformio-manifest';

const basePayload: AICodeGenerationPayload = {
  boardId: 'uno',
  boardName: 'Arduino UNO',
  chipset: 'ATmega328P',
  targetLanguage: 'C++',
  connectedComponents: [
    {
      templateId: 'tpl_dht11',
      componentName: '온습도 센서',
      pinConnections: {
        VCC: '5V',
        GND: 'GND',
        Data: 'D2',
      },
      libraryIncludes: ['DHT.h'],
    },
  ],
};

test('compiler manifest infers known header dependencies and marks Arduino UNO as cloud ready', () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousPublic = process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = 'true';

  const code = [
    '#include <DHT.h>',
    '',
    'void setup() {',
    '  Serial.begin(9600);',
    '}',
  ].join('\n');

  try {
    const manifest = buildCompilerManifest(basePayload, code);

    assert.equal(manifest.compileStrategy, 'cloud-compiler-ready');
    assert.equal(manifest.cloudTarget.supported, true);
    assert.equal(manifest.cloudTarget.fqbn, 'arduino:avr:uno');
    assert.deepEqual(manifest.unresolvedHeaders, []);
    assert.ok(manifest.arduinoDependencies.includes('DHT sensor library'));
    assert.ok(manifest.requiredHeaders.includes('DHT.h'));
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousPublic === undefined) {
      delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
    } else {
      process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = previousPublic;
    }
  }
});

test('compiler manifest reports unresolved unknown headers from edited code', () => {
  const code = [
    '#include <DHT.h>',
    '#include <MySecretSensor.h>',
    '',
    'void setup() {',
    '  Serial.begin(9600);',
    '}',
  ].join('\n');

  const manifest = buildCompilerManifest(basePayload, code);

  assert.equal(manifest.compileStrategy, 'local-review-only');
  assert.ok(manifest.unresolvedHeaders.includes('MySecretSensor.h'));
  assert.ok(
    manifest.libraryRequirements.some(
      requirement => requirement.header === 'MySecretSensor.h' && requirement.resolved === false
    )
  );
});

test('compiler manifest keeps Python boards in local review mode', () => {
  const manifest = buildCompilerManifest(
    {
      boardId: 'rpi4',
      boardName: 'Raspberry Pi 4',
      chipset: 'BCM2711',
      targetLanguage: 'Python',
      connectedComponents: [],
    },
    'print("hello")'
  );

  assert.equal(manifest.compileStrategy, 'local-review-only');
  assert.equal(manifest.cloudTarget.supported, false);
  assert.equal(manifest.cloudTarget.provider, 'micropython');
});

test('compiler manifest includes explicitly installed project libraries', () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousPublic = process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = 'true';

  try {
    const manifest = buildCompilerManifest(
      {
        ...basePayload,
        connectedComponents: [],
        installedLibraries: [
          {
            name: 'Servo',
            version: 'latest',
            includes: ['Servo.h'],
            author: 'Arduino',
            sentence: 'Servo motor control library',
            category: 'Device Control',
          },
        ],
      },
      'void setup() {}\nvoid loop() {}\n'
    );

    assert.ok(manifest.arduinoDependencies.includes('Servo'));
    assert.ok(manifest.requiredHeaders.includes('Servo.h'));
    assert.deepEqual(manifest.unresolvedHeaders, []);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousPublic === undefined) {
      delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
    } else {
      process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = previousPublic;
    }
  }
});

test('compiler manifest keeps public cloud compile disabled by default', () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousPublic = process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
  delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;

  const code = '#include <DHT.h>\nvoid setup() {}\n';
  try {
    const manifest = buildCompilerManifest(basePayload, code);
    assert.equal(manifest.compileStrategy, 'local-review-only');
    assert.equal(manifest.cloudTarget.supported, false);
    assert.match(manifest.cloudTarget.reason ?? '', /MVP|public cloud compile/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousPublic === undefined) {
      delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
    } else {
      process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = previousPublic;
    }
  }
});

test('compiler manifest still requires sandbox opt-in after public gate is enabled', () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousPublic = process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
  delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = 'true';

  const code = '#include <DHT.h>\nvoid setup() {}\n';
  try {
    const manifest = buildCompilerManifest(basePayload, code);
    assert.equal(manifest.compileStrategy, 'local-review-only');
    assert.equal(manifest.cloudTarget.supported, false);
    assert.match(manifest.cloudTarget.reason ?? '', /샌드박스/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousPublic === undefined) {
      delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
    } else {
      process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = previousPublic;
    }
  }
});
