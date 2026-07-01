import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportFailureReport,
  buildImportFileTelemetryAttributes,
  getFileExtensionForTelemetry,
  getFileSizeBucketForTelemetry,
} from '@/lib/import-failure-report';

test('import failure report gives recovery guidance for unsupported files', () => {
  const report = buildImportFailureReport({
    fileName: 'board.zip',
    fileSizeBytes: 240_000,
    fileKind: null,
    stage: 'unsupported',
    language: 'ko',
  });

  assert.equal(report.reasonCategory, 'unsupported-file');
  assert.match(report.title, /KiCad/);
  assert.ok(report.recoveryActions.some(action => action.includes('.kicad_sch')));
  assert.equal(report.telemetry.fileExtension, '.zip');
  assert.equal(report.telemetry.fileSizeBucket, '100kb-1mb');
  assert.equal(report.telemetry.fileKind, 'unknown');
});

test('import failure report classifies parser errors without exposing raw file names in telemetry', () => {
  const report = buildImportFailureReport({
    fileName: 'secret-client-board.kicad_sch',
    fileSizeBytes: 32_000,
    fileKind: 'schematic',
    stage: 'parse-schematic',
    error: new Error('Unexpected token near symbol block'),
    language: 'en',
  });

  assert.equal(report.reasonCategory, 'parse-error');
  assert.equal(report.telemetry.fileExtension, '.kicad_sch');
  assert.equal(report.telemetry.errorCategory, 'invalid-kicad-syntax');
  assert.equal(Object.keys(report.telemetry).includes('fileName'), false);
  assert.match(report.toastDescription, /Unexpected token/);
});

test('import telemetry file helpers bucket only coarse file metadata', () => {
  assert.equal(getFileExtensionForTelemetry('/private/project/name.KICAD_PCB'), '.kicad_pcb');
  assert.equal(getFileExtensionForTelemetry('README'), 'none');
  assert.equal(getFileSizeBucketForTelemetry(0), 'empty');
  assert.equal(getFileSizeBucketForTelemetry(99 * 1024), '<100kb');
  assert.equal(getFileSizeBucketForTelemetry(2 * 1024 * 1024), '1mb-5mb');
  assert.deepEqual(
    buildImportFileTelemetryAttributes({
      fileName: 'sample.kicad_sch',
      fileSizeBytes: 12,
      fileKind: 'schematic',
    }),
    {
      fileExtension: '.kicad_sch',
      fileSizeBucket: '<100kb',
      fileKind: 'schematic',
    }
  );
});
