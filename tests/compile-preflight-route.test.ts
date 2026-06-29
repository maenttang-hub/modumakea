import test from 'node:test';
import assert from 'node:assert/strict';

import type { AICodeGenerationPayload, CompilerPreflightResponse } from '@/types';

const { POST: compilePreflightPost } = await import('@/app/api/compile/preflight/route');

const payload: AICodeGenerationPayload = {
  boardId: 'uno',
  boardName: 'Arduino UNO',
  chipset: 'ATmega328P',
  targetLanguage: 'C++',
  connectedComponents: [
    {
      templateId: 'tpl_oled',
      componentName: 'OLED 디스플레이',
      pinConnections: {
        VCC: '5V',
        GND: 'GND',
        SDA: 'A4',
        SCL: 'A5',
      },
      libraryIncludes: ['Wire.h', 'Adafruit_GFX.h', 'Adafruit_SSD1306.h'],
    },
  ],
};

test('compile preflight route returns ready status for known headers', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';

  try {
    const response = await compilePreflightPost(
      new Request('http://localhost/api/compile/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          code: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n',
        }),
      })
    );

    assert.equal(response.status, 200);
    const result = (await response.json()) as CompilerPreflightResponse;
    assert.equal(result.ready, true);
    assert.equal(result.manifest.compileStrategy, 'cloud-compiler-ready');
    assert.equal(result.manifest.unresolvedHeaders.length, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
  }
});

test('compile preflight route surfaces unresolved headers for cloud compile', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';

  try {
    const response = await compilePreflightPost(
      new Request('http://localhost/api/compile/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          code: '#include <Wire.h>\n#include <MysteryCloudPart.h>\n',
        }),
      })
    );

    assert.equal(response.status, 200);
    const result = (await response.json()) as CompilerPreflightResponse;
    assert.equal(result.ready, false);
    assert.ok(result.manifest.unresolvedHeaders.includes('MysteryCloudPart.h'));
    assert.ok(result.summary.includes('헤더'));
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
  }
});

test('compile preflight route respects explicitly installed project libraries', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';

  try {
    const response = await compilePreflightPost(
      new Request('http://localhost/api/compile/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            ...payload,
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
          code: 'void setup() {}\nvoid loop() {}\n',
        }),
      })
    );

    assert.equal(response.status, 200);
    const result = (await response.json()) as CompilerPreflightResponse;
    assert.equal(result.ready, true);
    assert.ok(result.manifest.arduinoDependencies.includes('Servo'));
    assert.ok(result.manifest.requiredHeaders.includes('Servo.h'));
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
  }
});

test('compile preflight route keeps real cloud compile disabled by default', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;

  try {
    const response = await compilePreflightPost(
      new Request('http://localhost/api/compile/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          code: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n',
        }),
      })
    );

    assert.equal(response.status, 200);
    const result = (await response.json()) as CompilerPreflightResponse;
    assert.equal(result.ready, false);
    assert.equal(result.manifest.compileStrategy, 'local-review-only');
    assert.match(result.summary, /샌드박스/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
  }
});
