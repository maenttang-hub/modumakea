import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProjectVerificationReport } from '@/lib/project-verification-report';
import type { DrcEngineReport } from '@/lib/drc-engine';

function buildReportFixture(): DrcEngineReport {
  return {
    engineId: 'modumake-drc-v1',
    ruleCatalog: [],
    verifiedCount: 1,
    partialCount: 0,
    genericCount: 0,
    issueCount: 2,
    issues: [
      {
        severity: 'error',
        code: 'formal.output-drive-grounded-net',
        ruleId: 'formal.output-drive-grounded-net',
        title: 'Logic drive conflict',
        message: 'digitalWrite drives a grounded net high.',
        recommendation: 'Move the signal to a free GPIO or remove the HIGH drive.',
        componentName: 'LED 1',
        boardPin: 'D2',
        line: 42,
        operation: 'digitalWrite',
      },
      {
        severity: 'warning',
        code: 'electrical.i2c-pullup-missing',
        ruleId: 'electrical.i2c-pullup-missing',
        title: 'I2C pull-up missing',
        message: 'SDA/SCL need pull-up resistors.',
        recommendation: 'Add 4.7k Ohm pull-ups on SDA and SCL.',
        componentName: 'Sensor_I2C_Bus',
      },
    ],
    powerReport: {
      rails: [{ rail: '3.3V', usedMa: 280, budgetMa: 500, headroomMa: 220 }],
      regulators: [
        {
          id: 'ams1117',
          label: 'AMS1117_3.3V',
          inputVoltage: 5,
          outputVoltage: 3.3,
          estimatedCurrentMa: 280,
          dissipationW: 0.48,
          safeLimitW: 0.8,
          status: 'ok',
        },
      ],
    },
    companionReport: {
      requiredCount: 0,
      recommendedCount: 0,
      conditionalCount: 0,
      suggestions: [],
      summary: [],
    },
    circuitAnalysis: {
      nets: [],
      resistors: [],
      issues: [],
    },
    formalVerification: {
      analyzed: true,
      operationCount: 1,
      issueCount: 1,
      issues: [],
      engineMeta: {
        language: 'cpp',
        parserBackend: 'rust-wasm',
        parserTier: 'structured-review',
      },
    },
  };
}

test('project verification report groups formal, DRC, and power findings', () => {
  const report = buildProjectVerificationReport({
    projectName: 'Smart_IoT_Sensor_Hub',
    boardId: 'esp32',
    audit: buildReportFixture(),
    components: [],
    language: 'en',
    generatedAt: new Date('2026-06-19T00:00:00.000Z'),
  });

  assert.equal(report.status, 'critical');
  assert.equal(report.errorCount, 1);
  assert.equal(report.warningCount, 1);
  assert.match(report.markdown, /ModuMake Circuit Review Report/);
  assert.match(report.markdown, /Pre-Fabrication Decision/);
  assert.match(report.markdown, /Fabrication status: Fix required/);
  assert.match(report.markdown, /Must fix: 1/);
  assert.match(report.markdown, /\[High-confidence finding\] Code is driving a grounded net/);
  assert.match(report.markdown, /Location: Line 42 \/ LED 1 \/ Pin D2 \/ digitalWrite/);
  assert.match(report.markdown, /How to fix: Remove that output drive from the code or fix the wiring so the pin is no longer tied directly to GND\./);
  assert.match(report.markdown, /Component Recognition/);
  assert.match(report.markdown, /Code-to-Circuit Cross-Check/);
  assert.match(report.markdown, /System Peak Current: 280mA/);
  assert.match(report.markdown, /Limits \/ Assumptions \/ Engine Notes/);
  assert.match(report.filenameBase, /smart_iot_sensor_hub/i);
});
