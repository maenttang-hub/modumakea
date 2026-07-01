import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES,
  runBetaValidationGoldenSample,
} from './fixtures/beta-validation-golden-corpus.ts';

type ExpectedIssue = {
  ruleId: string;
  code?: string;
  severity?: string;
  confidence?: string;
};

type ActualIssue = {
  ruleId?: string;
  code?: string;
  severity?: string;
  confidence?: string;
};

type GoldenManifest = {
  schemaVersion: number;
  corpusId: string;
  labelStatus: string;
  entries: Array<{
    sampleId: string;
    title: string;
    boardId: string;
    fixtureKind: 'synthetic-circuit' | 'unsupported-import';
    expectNoIssues?: boolean;
    expectedIssues: ExpectedIssue[];
    expectedNonIssues: ExpectedIssue[];
    expectedImportFailure?: {
      reasonCategory: string;
      fileExtension: string;
      fileKind: string;
    };
  }>;
};

const manifestPath = new URL('../config/golden-corpus/beta-validation-golden-corpus-v1.json', import.meta.url);

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as GoldenManifest;
}

function issueMatches(issue: ActualIssue, expected: ExpectedIssue) {
  return issue.ruleId === expected.ruleId && (!expected.code || issue.code === expected.code);
}

test('beta validation golden corpus manifest matches synthetic fixture set', () => {
  const manifest = loadManifest();
  const fixtureIds = new Set(Object.keys(BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES));
  const manifestIds = new Set<string>();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.corpusId, 'beta-validation-golden-corpus-v1');
  assert.equal(manifest.labelStatus, 'human-reviewed');
  assert.equal(manifest.entries.length, 15);

  for (const entry of manifest.entries) {
    assert.equal(manifestIds.has(entry.sampleId), false, `duplicate sample id: ${entry.sampleId}`);
    manifestIds.add(entry.sampleId);
    assert.ok(fixtureIds.has(entry.sampleId), `missing fixture for sample: ${entry.sampleId}`);
    assert.ok(entry.fixtureKind === 'synthetic-circuit' || entry.fixtureKind === 'unsupported-import');
    assert.ok(entry.title.length > 0);
    assert.ok(entry.boardId.length > 0);
  }

  assert.deepEqual(manifestIds, fixtureIds);
});

test('beta validation golden corpus expected issues stay stable', () => {
  const manifest = loadManifest();

  for (const entry of manifest.entries) {
    const result = runBetaValidationGoldenSample(entry.sampleId);

    if (entry.fixtureKind === 'unsupported-import') {
      assert.equal(result.kind, 'import-failure', `${entry.sampleId} should be an import failure sample`);
      assert.ok(entry.expectedImportFailure, `${entry.sampleId} should define expected import failure metadata`);
      assert.equal(result.failure.reasonCategory, entry.expectedImportFailure.reasonCategory);
      assert.equal(result.failure.telemetry.fileExtension, entry.expectedImportFailure.fileExtension);
      assert.equal(result.failure.telemetry.fileKind, entry.expectedImportFailure.fileKind);
      assert.equal(Object.keys(result.failure.telemetry).includes('fileName'), false);
      continue;
    }

    if (result.kind !== 'analysis') {
      assert.fail(`${entry.sampleId} should be an analysis sample`);
    }

    const actualIssues: ActualIssue[] = result.issues;

    for (const expected of entry.expectedIssues) {
      const issue = actualIssues.find(candidate => issueMatches(candidate, expected));
      assert.ok(
        issue,
        `${entry.sampleId} should emit ${expected.code ?? expected.ruleId}; actual ${actualIssues.map(item => item.code ?? item.ruleId).join(', ')}`
      );
      if (expected.severity) {
        assert.equal(issue.severity, expected.severity, `${entry.sampleId} severity for ${expected.code ?? expected.ruleId}`);
      }
      if (expected.confidence) {
        assert.equal(issue.confidence, expected.confidence, `${entry.sampleId} confidence for ${expected.code ?? expected.ruleId}`);
      }
    }

    for (const expectedAbsent of entry.expectedNonIssues) {
      assert.equal(
        actualIssues.some(candidate => issueMatches(candidate, expectedAbsent)),
        false,
        `${entry.sampleId} should not emit ${expectedAbsent.code ?? expectedAbsent.ruleId}`
      );
    }

    if (entry.expectNoIssues) {
      assert.deepEqual(
        actualIssues.map(issue => issue.code ?? issue.ruleId),
        [],
        `${entry.sampleId} should stay completely clean`
      );
    }
  }
});
