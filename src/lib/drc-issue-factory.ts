import { createProjectAuditIssue } from '@/lib/engine-i18n';
import { getRuleConfidencePolicy } from '@/lib/drc-issue-policy';
import type {
  I18nMessageParams,
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
  RuleConfidencePolicy,
} from '@/types';

type DrcIssueInput = Omit<ProjectAuditIssue, 'title' | 'message' | 'recommendation' | 'severity' | 'confidence'> & {
  code: string;
  params?: I18nMessageParams;
  title?: string;
  message?: string;
  recommendation?: string;
  severity?: ProjectAuditIssue['severity'];
  confidence?: ProjectAuditIssueConfidence;
  policyKey?: string;
};

function hasVisualTargets(issue: ProjectAuditIssue) {
  return Boolean(
    issue.visualTargets?.componentIds?.length ||
      issue.visualTargets?.netIds?.length ||
      issue.visualTargets?.pinIds?.length
  );
}

function validateIssueAgainstPolicy(issue: ProjectAuditIssue, policy: RuleConfidencePolicy) {
  const observedFactsCount = issue.evidence?.observedFacts.length ?? 0;
  if ((policy.evidenceRequirements.observedFactsMin ?? 0) > observedFactsCount) {
    throw new Error(
      `[createDrcIssue] ${policy.ruleId} requires at least ${policy.evidenceRequirements.observedFactsMin} observedFacts, got ${observedFactsCount}`
    );
  }

  if (policy.evidenceRequirements.requireVisualTargets && !hasVisualTargets(issue)) {
    throw new Error(`[createDrcIssue] ${policy.ruleId} requires visualTargets`);
  }

  if (policy.evidenceRequirements.requireAssumptions && (issue.evidence?.assumptions.length ?? 0) === 0) {
    throw new Error(`[createDrcIssue] ${policy.ruleId} requires assumptions`);
  }

  if (policy.evidenceRequirements.requireHowToVerify && !issue.evidence?.howToVerify?.trim()) {
    throw new Error(`[createDrcIssue] ${policy.ruleId} requires howToVerify`);
  }
}

export function createDrcIssue(input: DrcIssueInput): ProjectAuditIssue {
  const policyKey = input.policyKey ?? input.ruleId ?? input.code;
  const policy = getRuleConfidencePolicy(policyKey);

  const issue = createProjectAuditIssue({
    ...input,
    severity: input.severity ?? policy?.defaultSeverity ?? 'warning',
    confidence: input.confidence ?? policy?.defaultConfidence,
  });

  if (!policy) {
    return issue;
  }

  validateIssueAgainstPolicy(issue, policy);
  return issue;
}
