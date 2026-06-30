import type {
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
} from '@/types';

function confidenceForPcbIssue(issue: ImportedPcbValidationIssue): ProjectAuditIssueConfidence {
  if (issue.severity === 'info') {
    return 'informational';
  }

  if (issue.source === 'kicad-cli' || issue.severity === 'error') {
    return 'confirmed';
  }

  return 'needs-review';
}

function sourceLabelForPcbIssue(issue: ImportedPcbValidationIssue) {
  return issue.source === 'kicad-cli' ? 'KiCad PCB DRC' : 'ModuMake PCB DRC';
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

export function isImportedPcbAuditIssue(issue: ProjectAuditIssue) {
  return issue.ruleId?.startsWith('pcb.') || issue.code?.startsWith('pcb.');
}

export function getImportedPcbIssueId(issue: ProjectAuditIssue) {
  const value = issue.params?.pcbIssueId;
  return typeof value === 'string' ? value : null;
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

    return {
      severity: issue.severity,
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
        assumptions: [],
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
