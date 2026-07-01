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

type GoldenManifest = {
  schemaVersion: number;
  corpusId: string;
  labelStatus: string;
  entries: Array<{
    sampleId: string;
    title: string;
    boardId: string;
    fixtureKind: string;
    expectedIssues: ExpectedIssue[];
    expectedNonIssues: ExpectedIssue[];
  }>;
};

const manifestPath = new URL('../config/golden-corpus/beta-validation-golden-corpus-v1.json', import.meta.url);

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as GoldenManifest;
}

function issueMatches(issue: { ruleId?: string; code?: string }, expected: ExpectedIssue) {
  return issue.ruleId === expected.ruleId && (!expected.code || issue.code === expected.code);
}

test('beta validation golden corpus manifest matches synthetic fixture set', () => {
  const manifest = loadManifest();
  const fixtureIds = new Set(Object.keys(BETA_VALIDATION_GOLDEN_CORPUS_FIXTURES));
  const manifestIds = new Set<string>();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.corpusId, 'beta-validation-golden-corpus-v1');
  assert.equal(manifest.labelStatus, 'human-reviewed');
  assert.equal(manifest.entries.length, 5);

  for (const entry of manifest.entries) {
    assert.equal(manifestIds.has(entry.sampleId), false, `duplicate sample id: ${entry.sampleId}`);
    manifestIds.add(entry.sampleId);
    assert.ok(fixtureIds.has(entry.sampleId), `missing fixture for sample: ${entry.sampleId}`);
    assert.equal(entry.fixtureKind, 'synthetic-circuit');
    assert.ok(entry.title.length > 0);
    assert.ok(entry.boardId.length > 0);
  }

  assert.deepEqual(manifestIds, fixtureIds);
});

test('beta validation golden corpus expected issues stay stable', () => {
  const manifest = loadManifest();

  for (const entry of manifest.entries) {
    const result = runBetaValidationGoldenSample(entry.sampleId);

    for (const expected of entry.expectedIssues) {
      const issue = result.issues.find(candidate => issueMatches(candidate, expected));
      assert.ok(
        issue,
        `${entry.sampleId} should emit ${expected.code ?? expected.ruleId}; actual ${result.issues.map(item => item.code ?? item.ruleId).join(', ')}`
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
        result.issues.some(candidate => issueMatches(candidate, expectedAbsent)),
        false,
        `${entry.sampleId} should not emit ${expectedAbsent.code ?? expectedAbsent.ruleId}`
      );
    }

    if (entry.expectedIssues.length === 0) {
      assert.deepEqual(
        result.issues.map(issue => issue.code ?? issue.ruleId),
        [],
        `${entry.sampleId} is the clean control sample`
      );
    }
  }
});
