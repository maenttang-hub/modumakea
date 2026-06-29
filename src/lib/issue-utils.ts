import { createProjectAuditIssue } from '@/lib/engine-i18n';
import type { FormalVerificationIssue, ProjectAuditIssue } from '@/types';

type IssueLike = Pick<
  ProjectAuditIssue,
  'severity' | 'title' | 'message' | 'code' | 'componentName' | 'boardPin' | 'line' | 'operation' | 'ruleId'
> &
  Partial<Pick<ProjectAuditIssue, 'recommendation'>>;

function normalizeIssuePart(value: string | number | undefined) {
  if (value == null) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

export function buildIssueDedupKey(issue: IssueLike) {
  return [
    normalizeIssuePart(issue.severity),
    normalizeIssuePart(issue.ruleId ?? issue.code),
    normalizeIssuePart(issue.componentName),
    normalizeIssuePart(issue.boardPin),
    normalizeIssuePart(issue.operation),
    normalizeIssuePart(issue.line),
    normalizeIssuePart(issue.title),
    normalizeIssuePart(issue.message),
  ].join('::');
}

export function deduplicateIssues<T extends IssueLike>(issues: T[]): T[] {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const issue of issues) {
    const key = buildIssueDedupKey(issue);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(issue);
  }

  return deduplicated;
}

export function mapFormalIssueToAuditIssue(issue: FormalVerificationIssue): ProjectAuditIssue {
  return createProjectAuditIssue({
    severity: issue.severity,
    code: issue.code ?? issue.ruleId ?? 'formal.unknown',
    params: issue.params,
    componentName: issue.componentName,
    boardPin: issue.boardPin,
    line: issue.line,
    operation: issue.operation,
    ruleId: issue.ruleId,
    title: issue.title,
    message: issue.message,
    recommendation: issue.recommendation,
    confidence: issue.severity === 'info' ? 'informational' : 'confirmed',
    evidence: {
      confidence: issue.severity === 'info' ? 'informational' : 'confirmed',
      evidenceSummary: issue.message,
      observedFacts: [
        issue.boardPin ? `Affected board pin: ${issue.boardPin}` : null,
        issue.componentName ? `Affected component: ${issue.componentName}` : null,
      ].filter(Boolean) as string[],
      assumptions: [],
      checkedBy: ['formal-code'],
      howToVerify: issue.recommendation,
    },
  });
}
