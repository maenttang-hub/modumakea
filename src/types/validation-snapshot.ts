import type { DatasheetReviewSeverity } from './datasheet-review';
import type { LightweightValidationJson } from './lightweight-validation-json';

export const VALIDATION_SNAPSHOT_SCHEMA_VERSION = '2026-06-28';

export type ValidationIssueConfidence =
  | 'confirmed'
  | 'strong-inference'
  | 'needs-review'
  | 'informational';

export interface ValidationSnapshotIssue {
  fingerprint: string;
  sourceEngine: 'rule_based' | 'formal_verifier' | 'datasheet_ai';
  severity: DatasheetReviewSeverity;
  findingCode: string;
  ruleId: string | null;
  title: string;
  message: string;
  confidence: ValidationIssueConfidence | null;
  componentReference: string | null;
  boardPin: string | null;
  netLabel: string | null;
  lineNumber: number | null;
  operation: string | null;
  recommendation: string | null;
  sourceBucket: 'official' | 'partial' | 'generic' | 'fallback' | 'other' | null;
  evidence: Record<string, unknown>;
}

export interface ValidationSnapshot {
  schemaVersion: typeof VALIDATION_SNAPSHOT_SCHEMA_VERSION;
  validationInputSchemaVersion: string;
  projectId: string;
  projectName: string;
  sourceKind: 'kicad_import' | 'modumake_canvas';
  boardId: string | null;
  boardName: string | null;
  logicVoltage: string | null;
  version: number;
  stats: {
    componentCount: number;
    netCount: number;
    issueCount: number;
    unresolvedSymbolCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    sourceBucketCounts: {
      official: number;
      partial: number;
      generic: number;
      fallback: number;
      other: number;
    };
  };
  validationInput: LightweightValidationJson;
  issues: ValidationSnapshotIssue[];
}

export interface ValidationJobSummary {
  id: string;
  projectId: string;
  status: string;
  sourceKind: 'kicad_import' | 'modumake_canvas';
  projectName: string;
  boardName: string | null;
  createdAt: string | null;
  completedAt: string | null;
  snapshotId: string | null;
  snapshotVersion: number | null;
  issueCount: number;
  componentCount: number;
  netCount: number;
  unresolvedSymbolCount: number;
}

export interface ValidationJobDetail extends ValidationJobSummary {
  requestId: string | null;
  failureReason: string | null;
  snapshot: ValidationSnapshot | null;
}

export interface ValidationIssueDiffEntry {
  fingerprint: string;
  before: ValidationSnapshotIssue | null;
  after: ValidationSnapshotIssue | null;
}

export interface ValidationIssueDiff {
  baselineJobId: string | null;
  baselineSnapshotVersion: number | null;
  currentJobId: string;
  currentSnapshotVersion: number | null;
  newIssues: ValidationIssueDiffEntry[];
  resolvedIssues: ValidationIssueDiffEntry[];
  confidenceChangedIssues: ValidationIssueDiffEntry[];
  sourceBucketChangedIssues: ValidationIssueDiffEntry[];
}

export interface ProjectValidationSummary {
  projectId: string;
  latestValidationJobId: string | null;
  latestValidationSnapshotId: string | null;
  mainValidationJobId: string | null;
  mainValidationSnapshotId: string | null;
  latestIssueCount: number;
  updatedAt: string | null;
}
