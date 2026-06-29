import type { ProjectAuditIssue, ProjectAuditIssueConfidence } from '@/types';

export type ReviewActionBucket = 'must-fix' | 'review' | 'info';

export function resolveIssueConfidence(issue: ProjectAuditIssue): ProjectAuditIssueConfidence {
  return issue.confidence ?? issue.evidence?.confidence ?? (
    issue.severity === 'error'
      ? 'strong-inference'
      : issue.severity === 'info'
        ? 'informational'
        : 'needs-review'
  );
}

export function classifyIssueActionBucket(issue: ProjectAuditIssue): ReviewActionBucket {
  const confidence = resolveIssueConfidence(issue);
  if (issue.severity === 'error' || confidence === 'confirmed') {
    return 'must-fix';
  }

  if (issue.severity === 'warning' || confidence === 'strong-inference' || confidence === 'needs-review') {
    return 'review';
  }

  return 'info';
}

export function countIssueSeverities(issues: ProjectAuditIssue[]) {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    {
      error: 0,
      warning: 0,
      info: 0,
    }
  );
}
