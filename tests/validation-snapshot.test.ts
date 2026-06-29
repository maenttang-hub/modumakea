import test from 'node:test';
import assert from 'node:assert/strict';

import { diffValidationSnapshots } from '@/lib/validation-snapshot';
import type { ValidationSnapshot } from '@/types';

function createSnapshot(overrides: Partial<ValidationSnapshot>): ValidationSnapshot {
  return {
    schemaVersion: '2026-06-28',
    validationInputSchemaVersion: '2026-06-19',
    projectId: 'project-1',
    projectName: 'Diff Test',
    sourceKind: 'kicad_import',
    boardId: null,
    boardName: null,
    logicVoltage: null,
    version: 1,
    stats: {
      componentCount: 1,
      netCount: 1,
      issueCount: 0,
      unresolvedSymbolCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      sourceBucketCounts: {
        official: 0,
        partial: 0,
        generic: 0,
        fallback: 0,
        other: 0,
      },
    },
    validationInput: {
      schema_version: '2026-06-19',
      source: {
        source_file_kind: 'kicad_sch',
        project_name: 'Diff Test',
      },
      components: [],
      nets: [],
      unresolved: { symbols: [] },
      stats: {
        component_count: 0,
        net_count: 0,
        unresolved_symbol_count: 0,
        wire_segment_count: 0,
        junction_count: 0,
        label_count: 0,
      },
    },
    issues: [],
    ...overrides,
  };
}

test('diffValidationSnapshots separates new, resolved, and confidence-changed issues', () => {
  const before = createSnapshot({
    issues: [
      {
        fingerprint: 'stable-confidence-change',
        sourceEngine: 'rule_based',
        severity: 'warning',
        findingCode: 'rule.1',
        ruleId: 'rule.1',
        title: 'Stable',
        message: 'same message',
        confidence: 'needs-review',
        componentReference: 'U1',
        boardPin: null,
        netLabel: 'SDA',
        lineNumber: null,
        operation: null,
        recommendation: null,
        sourceBucket: 'generic',
        evidence: {},
      },
      {
        fingerprint: 'resolved-issue',
        sourceEngine: 'rule_based',
        severity: 'warning',
        findingCode: 'rule.2',
        ruleId: 'rule.2',
        title: 'Resolved',
        message: 'gone now',
        confidence: 'confirmed',
        componentReference: 'U1',
        boardPin: null,
        netLabel: 'SCL',
        lineNumber: null,
        operation: null,
        recommendation: null,
        sourceBucket: 'fallback',
        evidence: {},
      },
    ],
  });

  const after = createSnapshot({
    version: 2,
    issues: [
      {
        ...before.issues[0]!,
        confidence: 'confirmed',
        sourceBucket: 'official',
      },
      {
        fingerprint: 'new-issue',
        sourceEngine: 'formal_verifier',
        severity: 'error',
        findingCode: 'rule.3',
        ruleId: 'rule.3',
        title: 'New',
        message: 'new issue',
        confidence: 'confirmed',
        componentReference: 'U2',
        boardPin: 'D2',
        netLabel: null,
        lineNumber: 42,
        operation: 'digitalWrite',
        recommendation: 'Fix it',
        sourceBucket: 'official',
        evidence: {},
      },
    ],
  });

  const diff = diffValidationSnapshots({
    baselineJobId: 'job-1',
    baselineSnapshotVersion: 1,
    currentJobId: 'job-2',
    currentSnapshotVersion: 2,
    baselineSnapshot: before,
    currentSnapshot: after,
  });

  assert.equal(diff.newIssues.length, 1);
  assert.equal(diff.newIssues[0]?.fingerprint, 'new-issue');
  assert.equal(diff.resolvedIssues.length, 1);
  assert.equal(diff.resolvedIssues[0]?.fingerprint, 'resolved-issue');
  assert.equal(diff.confidenceChangedIssues.length, 1);
  assert.equal(diff.confidenceChangedIssues[0]?.fingerprint, 'stable-confidence-change');
  assert.equal(diff.confidenceChangedIssues[0]?.before?.confidence, 'needs-review');
  assert.equal(diff.confidenceChangedIssues[0]?.after?.confidence, 'confirmed');
  assert.equal(diff.sourceBucketChangedIssues.length, 1);
  assert.equal(diff.sourceBucketChangedIssues[0]?.fingerprint, 'stable-confidence-change');
  assert.equal(diff.sourceBucketChangedIssues[0]?.before?.sourceBucket, 'generic');
  assert.equal(diff.sourceBucketChangedIssues[0]?.after?.sourceBucket, 'official');
});
