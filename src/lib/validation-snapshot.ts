import { createHash } from 'node:crypto';

import type {
  ValidationJobIngestMetadata,
  ValidationJobIngestPlan,
} from '@/lib/validation-job-ingest';
import type {
  ValidationIssueDiff,
  ValidationIssueDiffEntry,
  ValidationSnapshot,
  ValidationSnapshotIssue,
  ValidationIssueConfidence,
} from '@/types/validation-snapshot';
import { VALIDATION_SNAPSHOT_SCHEMA_VERSION } from '@/types/validation-snapshot';

function normalizeConfidence(value: unknown): ValidationIssueConfidence | null {
  return value === 'confirmed' ||
    value === 'strong-inference' ||
    value === 'needs-review' ||
    value === 'informational'
    ? value
    : null;
}

export function buildValidationIssueFingerprint(input: {
  sourceEngine: string;
  severity: string;
  findingCode: string;
  ruleId: string | null;
  title: string;
  message: string;
  componentReference: string | null;
  boardPin: string | null;
  netLabel: string | null;
  lineNumber: number | null;
  operation: string | null;
}) {
  return createHash('sha256')
    .update([
      input.sourceEngine,
      input.severity,
      input.findingCode,
      input.ruleId ?? '',
      input.title,
      input.message,
      input.componentReference ?? '',
      input.boardPin ?? '',
      input.netLabel ?? '',
      String(input.lineNumber ?? ''),
      input.operation ?? '',
    ].join('::'))
    .digest('hex');
}

export function buildValidationSnapshotIssue(
  finding: ValidationJobIngestPlan['errorFindings'][number]
): ValidationSnapshotIssue {
  const evidence = finding.evidence_json ?? {};
  const sourceBucket =
    evidence.sourceBucket === 'official' ||
    evidence.sourceBucket === 'partial' ||
    evidence.sourceBucket === 'generic' ||
    evidence.sourceBucket === 'fallback' ||
    evidence.sourceBucket === 'other'
      ? evidence.sourceBucket
      : null;
  return {
    fingerprint: buildValidationIssueFingerprint({
      sourceEngine: finding.source_engine,
      severity: finding.severity,
      findingCode: finding.finding_code,
      ruleId: finding.rule_id,
      title: finding.title,
      message: finding.message,
      componentReference: typeof evidence.componentReference === 'string' ? evidence.componentReference : null,
      boardPin: finding.board_pin,
      netLabel: finding.net_label,
      lineNumber: finding.line_number,
      operation: finding.operation,
    }),
    sourceEngine: finding.source_engine,
    severity: finding.severity,
    findingCode: finding.finding_code,
    ruleId: finding.rule_id,
    title: finding.title,
    message: finding.message,
    confidence: normalizeConfidence(evidence.confidence),
    componentReference: typeof evidence.componentReference === 'string' ? evidence.componentReference : null,
    boardPin: finding.board_pin,
    netLabel: finding.net_label,
    lineNumber: finding.line_number,
    operation: finding.operation,
    recommendation: finding.recommendation,
    sourceBucket,
    evidence,
  };
}

export function buildValidationSnapshot(
  plan: Pick<
    ValidationJobIngestPlan,
    'validationJob' | 'validationNets' | 'validationNetMembers' | 'componentInstances' | 'codePinUsages' | 'errorFindings'
  >,
  metadata: ValidationJobIngestMetadata,
  version: number
): ValidationSnapshot {
  const issues = plan.errorFindings.map(buildValidationSnapshotIssue);
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const infoCount = issues.filter(issue => issue.severity === 'info').length;
  const sourceBucketCounts = issues.reduce(
    (acc, issue) => {
      acc[issue.sourceBucket ?? 'other'] += 1;
      return acc;
    },
    {
      official: 0,
      partial: 0,
      generic: 0,
      fallback: 0,
      other: 0,
    }
  );

  return {
    schemaVersion: VALIDATION_SNAPSHOT_SCHEMA_VERSION,
    validationInputSchemaVersion: plan.validationJob.schema_version,
    projectId: metadata.projectId,
    projectName: plan.validationJob.project_name,
    sourceKind: metadata.sourceKind,
    boardId: plan.validationJob.board_id,
    boardName: plan.validationJob.board_name,
    logicVoltage: plan.validationJob.logic_voltage,
    version,
    stats: {
      componentCount: plan.validationJob.component_count,
      netCount: plan.validationJob.net_count,
      issueCount: issues.length,
      unresolvedSymbolCount: plan.validationJob.unresolved_symbol_count,
      errorCount,
      warningCount,
      infoCount,
      sourceBucketCounts,
    },
    validationInput: plan.validationJob.validation_input_json,
    issues,
  };
}

function toIssueMap(snapshot: ValidationSnapshot | null) {
  return new Map((snapshot?.issues ?? []).map(issue => [issue.fingerprint, issue]));
}

function buildDiffEntry(before: ValidationSnapshotIssue | null, after: ValidationSnapshotIssue | null): ValidationIssueDiffEntry {
  return {
    fingerprint: after?.fingerprint ?? before?.fingerprint ?? 'unknown',
    before,
    after,
  };
}

export function diffValidationSnapshots(input: {
  baselineJobId: string | null;
  baselineSnapshotVersion: number | null;
  currentJobId: string;
  currentSnapshotVersion: number | null;
  baselineSnapshot: ValidationSnapshot | null;
  currentSnapshot: ValidationSnapshot | null;
}): ValidationIssueDiff {
  const beforeMap = toIssueMap(input.baselineSnapshot);
  const afterMap = toIssueMap(input.currentSnapshot);

  const newIssues: ValidationIssueDiffEntry[] = [];
  const resolvedIssues: ValidationIssueDiffEntry[] = [];
  const confidenceChangedIssues: ValidationIssueDiffEntry[] = [];
  const sourceBucketChangedIssues: ValidationIssueDiffEntry[] = [];

  for (const [fingerprint, after] of afterMap) {
    const before = beforeMap.get(fingerprint) ?? null;
    if (!before) {
      newIssues.push(buildDiffEntry(null, after));
      continue;
    }
    if (before.confidence !== after.confidence) {
      confidenceChangedIssues.push(buildDiffEntry(before, after));
    }
    if (before.sourceBucket !== after.sourceBucket) {
      sourceBucketChangedIssues.push(buildDiffEntry(before, after));
    }
  }

  for (const [fingerprint, before] of beforeMap) {
    if (!afterMap.has(fingerprint)) {
      resolvedIssues.push(buildDiffEntry(before, null));
    }
  }

  return {
    baselineJobId: input.baselineJobId,
    baselineSnapshotVersion: input.baselineSnapshotVersion,
    currentJobId: input.currentJobId,
    currentSnapshotVersion: input.currentSnapshotVersion,
    newIssues,
    resolvedIssues,
    confidenceChangedIssues,
    sourceBucketChangedIssues,
  };
}
