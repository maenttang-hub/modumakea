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
  assert.match(report.markdown, /Review Decision/);
  assert.match(report.markdown, /Review status: Fix required/);
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

test('project verification report does not label generic solver review as power/GND risk', () => {
  const audit = buildReportFixture();
  audit.issues = [
    {
      severity: 'warning',
      code: 'netlist.solver-convergence',
      ruleId: 'netlist.solver-convergence',
      title: 'Circuit solver convergence needs review',
      message: 'Nonlinear DC analysis did not converge cleanly.',
      recommendation: '다이오드/전원 방향, 떠 있는 노드, 비현실적인 부품값을 다시 확인하세요.',
    },
  ];
  audit.issueCount = 1;
  audit.circuitAnalysis.issues = audit.issues;

  const report = buildProjectVerificationReport({
    projectName: 'rasphat_proj2',
    boardId: 'kicad_generic',
    audit,
    components: [],
    language: 'ko',
    generatedAt: new Date('2026-06-29T10:28:00.000Z'),
  });

  assert.match(report.markdown, /회로 해석: 추가 확인 필요/);
  assert.doesNotMatch(report.markdown, /전원\/GND: 추가 확인 필요/);
});

test('project verification report includes schematic PCB augmentation candidates', () => {
  const audit = buildReportFixture();
  audit.issues = [
    {
      severity: 'warning',
      code: 'pcb.PCB_SCHEMATIC_EXTRA_FOOTPRINT',
      ruleId: 'pcb.PCB_SCHEMATIC_EXTRA_FOOTPRINT',
      title: 'PCB-only footprint',
      message: 'TP1 exists on PCB but not in schematic.',
      recommendation: 'Review whether TP1 is a test point or a missing schematic part.',
      componentName: 'TP1',
      confidence: 'needs-review',
    },
  ];
  audit.issueCount = 1;

  const report = buildProjectVerificationReport({
    projectName: 'pcb_sync_review',
    boardId: 'kicad_generic',
    audit,
    components: [],
    language: 'ko',
    generatedAt: new Date('2026-06-29T10:28:00.000Z'),
  });

  assert.match(report.markdown, /회로도 ↔ PCB 보강 후보/);
  assert.match(report.markdown, /PCB → 회로도/);
  assert.match(report.markdown, /자동 반영 안 함/);
  assert.match(report.markdown, /TP1/);
});
