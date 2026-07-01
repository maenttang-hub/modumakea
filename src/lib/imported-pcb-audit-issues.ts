import type {
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
} from '@/types';
import { classifyImportedPcbReviewImpact } from '@/lib/imported-pcb-review-policy';
import { buildReviewIssueKey } from '@/lib/review-focus';

function confidenceForPcbIssue(issue: ImportedPcbValidationIssue): ProjectAuditIssueConfidence {
  if (issue.source === 'kicad-cli') {
    return 'confirmed';
  }

  const impact = classifyImportedPcbReviewImpact(issue);
  if (impact === 'informational') {
    return 'informational';
  }

  if (impact === 'blocking') {
    return 'strong-inference';
  }

  return 'needs-review';
}

function sourceLabelForPcbIssue(issue: ImportedPcbValidationIssue) {
  return issue.source === 'kicad-cli' ? 'KiCad PCB DRC' : 'ModuMake PCB 사전점검';
}

function projectSeverityForPcbIssue(
  issue: ImportedPcbValidationIssue,
  confidence: ProjectAuditIssueConfidence
): ProjectAuditIssue['severity'] {
  if (issue.source !== 'kicad-cli' && confidence === 'needs-review' && issue.severity === 'error') {
    return 'warning';
  }

  return issue.severity;
}

function formatPcbPoint(point: { x: number; y: number }) {
  return `${point.x.toFixed(3)}, ${point.y.toFixed(3)} mm`;
}

function buildObservedFacts(issue: ImportedPcbValidationIssue) {
  return [
    `Source: ${sourceLabelForPcbIssue(issue)}`,
    issue.layer ? `Layer: ${issue.layer}` : null,
    issue.netName ? `Net: ${issue.netName}` : null,
    issue.footprintRef ? `Footprint: ${issue.footprintRef}` : null,
    issue.padNumber ? `Pad: ${issue.padNumber}` : null,
    issue.at ? `Location: ${formatPcbPoint(issue.at)}` : null,
    ...(issue.items ?? []).slice(0, 4).map(item =>
      item.at ? `${item.description} (${formatPcbPoint(item.at)})` : item.description
    ),
  ].filter((item): item is string => Boolean(item));
}

function buildAssumptions(issue: ImportedPcbValidationIssue) {
  if (issue.source === 'kicad-cli') {
    return [];
  }

  return [
    'ModuMake 자체 PCB 검사는 사전 검토 신호이며 KiCad 공식 DRC와 제조사 DFM을 대체하지 않습니다.',
  ];
}

export function isImportedPcbAuditIssue(issue: ProjectAuditIssue) {
  return issue.ruleId?.startsWith('pcb.') || issue.code?.startsWith('pcb.');
}

export function getImportedPcbIssueId(issue: ProjectAuditIssue) {
  const value = issue.params?.pcbIssueId;
  return typeof value === 'string' ? value : null;
}

export function buildImportedPcbAuditIssueKey(issue: ImportedPcbValidationIssue) {
  const code = `pcb.${issue.code}`;
  return buildReviewIssueKey({
    code,
    ruleId: code,
    componentName: issue.footprintRef,
    operation: issue.layer,
    title: issue.title,
    message: issue.message,
  });
}

export function mapImportedPcbValidationIssuesToProjectAuditIssues(
  report: ImportedPcbValidationReport | null | undefined
): ProjectAuditIssue[] {
  if (!report) {
    return [];
  }

  return report.issues.map(issue => {
    const confidence = confidenceForPcbIssue(issue);
    const observedFacts = buildObservedFacts(issue);
    const assumptions = buildAssumptions(issue);

    return {
      severity: projectSeverityForPcbIssue(issue, confidence),
      title: issue.title,
      message: issue.message,
      code: `pcb.${issue.code}`,
      ruleId: `pcb.${issue.code}`,
      params: {
        pcbIssueId: issue.id,
      },
      componentName: issue.footprintRef,
      operation: issue.layer,
      recommendation: issue.recommendation,
      sourceLabel: sourceLabelForPcbIssue(issue),
      confidence,
      evidence: {
        confidence,
        evidenceSummary: issue.message,
        observedFacts,
        assumptions,
        checkedBy: ['kicad-import'],
        affectedNets: issue.netName ? [issue.netName] : undefined,
        howToVerify: issue.recommendation,
      },
      visualTargets: {
        netIds: issue.netName ? [issue.netName] : undefined,
      },
    };
  });
}
