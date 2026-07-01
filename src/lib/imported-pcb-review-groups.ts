import type {
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ImportedPcbValidationSource,
  WarningSeverity,
} from '@/types';
import {
  baseImportedPcbIssueCode,
  classifyImportedPcbReviewImpact,
  importedPcbReviewImpactRank,
  isRepresentativeImportedPcbLimitIssue,
  type ImportedPcbReviewImpact,
} from '@/lib/imported-pcb-review-policy';

const HIDDEN_CANDIDATE_PATTERN = /숨긴 반복 후보\s+(\d+)건/;
const MAX_SCOPE_LABELS = 4;

export interface ImportedPcbReviewGroup {
  id: string;
  source: ImportedPcbValidationSource;
  code: string;
  title: string;
  message: string;
  recommendation?: string;
  severity: WarningSeverity;
  count: number;
  visibleIssueCount: number;
  hiddenCandidateCount: number;
  issueIds: string[];
  leadIssueId: string;
  affectedFootprints: string[];
  affectedNets: string[];
  affectedLayers: string[];
  impact: ImportedPcbReviewImpact;
  priority: number;
}

export interface ImportedPcbReviewComparison {
  officialIssueCount: number;
  precheckIssueCount: number;
  officialGroups: ImportedPcbReviewGroup[];
  precheckGroups: ImportedPcbReviewGroup[];
  allGroups: ImportedPcbReviewGroup[];
  hasOfficialDrc: boolean;
}

export type ImportedPcbReviewImpactCounts = Record<ImportedPcbReviewImpact, number>;

type MutableImportedPcbReviewGroup = Omit<
  ImportedPcbReviewGroup,
  'affectedFootprints' | 'affectedNets' | 'affectedLayers'
> & {
  affectedFootprints: Set<string>;
  affectedNets: Set<string>;
  affectedLayers: Set<string>;
};

function reviewSeverity(issue: ImportedPcbValidationIssue): WarningSeverity {
  if (issue.source !== 'kicad-cli' && issue.severity === 'error') {
    return 'warning';
  }

  return issue.severity;
}

function severityRank(severity: WarningSeverity) {
  if (severity === 'error') {
    return 3;
  }
  if (severity === 'warning') {
    return 2;
  }
  return 1;
}

function hiddenCandidateCount(issue: ImportedPcbValidationIssue) {
  return (issue.items ?? []).reduce((sum, item) => {
    const match = item.description.match(HIDDEN_CANDIDATE_PATTERN);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

function issuePriority(issue: ImportedPcbValidationIssue) {
  const sourceBoost = issue.source === 'kicad-cli' ? 500 : 0;
  const summaryPenalty = isRepresentativeImportedPcbLimitIssue(issue) ? -100 : 0;
  return importedPcbReviewImpactRank(classifyImportedPcbReviewImpact(issue)) * 2000 +
    severityRank(reviewSeverity(issue)) * 100 +
    sourceBoost +
    summaryPenalty;
}

function groupPriority(group: MutableImportedPcbReviewGroup) {
  const sourceBoost = group.source === 'kicad-cli' ? 500 : 0;
  const repeatWeight = Math.min(400, group.visibleIssueCount * 18 + Math.floor(group.hiddenCandidateCount / 4));
  return importedPcbReviewImpactRank(group.impact) * 2000 + severityRank(group.severity) * 100 + sourceBoost + repeatWeight;
}

function stripRepresentativeSuffix(title: string) {
  return title.replace(/\s+대표 항목만 표시$/, '');
}

function createGroup(issue: ImportedPcbValidationIssue, code: string): MutableImportedPcbReviewGroup {
  const severity = reviewSeverity(issue);
  return {
    id: `${issue.source}:${code}`,
    source: issue.source,
    code,
    title: stripRepresentativeSuffix(issue.title),
    message: issue.message,
    recommendation: issue.recommendation,
    severity,
    count: 0,
    visibleIssueCount: 0,
    hiddenCandidateCount: 0,
    issueIds: [],
    leadIssueId: issue.id,
    affectedFootprints: new Set(),
    affectedNets: new Set(),
    affectedLayers: new Set(),
    impact: classifyImportedPcbReviewImpact(issue),
    priority: issuePriority(issue),
  };
}

function rememberScope(group: MutableImportedPcbReviewGroup, issue: ImportedPcbValidationIssue) {
  if (issue.footprintRef) {
    group.affectedFootprints.add(issue.footprintRef);
  }
  if (issue.netName) {
    group.affectedNets.add(issue.netName);
  }
  if (issue.layer) {
    group.affectedLayers.add(issue.layer);
  }
}

function toSortedLabels(values: Set<string>) {
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_SCOPE_LABELS);
}

export function countImportedPcbReviewGroupImpacts(groups: ImportedPcbReviewGroup[]): ImportedPcbReviewImpactCounts {
  return groups.reduce(
    (acc, group) => {
      acc[group.impact] += 1;
      return acc;
    },
    {
      blocking: 0,
      actionable: 0,
      'intent-dependent': 0,
      informational: 0,
    } satisfies ImportedPcbReviewImpactCounts
  );
}

export function buildImportedPcbReviewGroups(
  report: ImportedPcbValidationReport | null | undefined
): ImportedPcbReviewGroup[] {
  if (!report || report.issues.length === 0) {
    return [];
  }

  const groups = new Map<string, MutableImportedPcbReviewGroup>();
  for (const issue of report.issues) {
    const code = baseImportedPcbIssueCode(issue.code);
    const key = `${issue.source}:${code}`;
    const group = groups.get(key) ?? createGroup(issue, code);
    const hiddenCount = hiddenCandidateCount(issue);
    const issueSeverity = reviewSeverity(issue);
    const issueImpact = classifyImportedPcbReviewImpact(issue);

    group.count += 1;
    group.hiddenCandidateCount += hiddenCount;
    group.issueIds.push(issue.id);
    rememberScope(group, issue);

    if (!isRepresentativeImportedPcbLimitIssue(issue)) {
      group.visibleIssueCount += 1;
    }

    if (severityRank(issueSeverity) > severityRank(group.severity)) {
      group.severity = issueSeverity;
    }
    if (importedPcbReviewImpactRank(issueImpact) > importedPcbReviewImpactRank(group.impact)) {
      group.impact = issueImpact;
    }

    const currentIssuePriority = issuePriority(issue);
    if (currentIssuePriority > group.priority) {
      group.leadIssueId = issue.id;
      group.title = issue.title;
      group.message = issue.message;
      group.recommendation = issue.recommendation;
      group.priority = currentIssuePriority;
    }

    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      title: stripRepresentativeSuffix(group.title),
      affectedFootprints: toSortedLabels(group.affectedFootprints),
      affectedNets: toSortedLabels(group.affectedNets),
      affectedLayers: toSortedLabels(group.affectedLayers),
      priority: groupPriority(group),
    }))
    .sort((a, b) => b.priority - a.priority || b.hiddenCandidateCount - a.hiddenCandidateCount || a.title.localeCompare(b.title));
}

export function buildImportedPcbReviewComparison(
  report: ImportedPcbValidationReport | null | undefined
): ImportedPcbReviewComparison {
  const allGroups = buildImportedPcbReviewGroups(report);
  const officialIssueCount = report?.issues.filter(issue => issue.source === 'kicad-cli').length ?? 0;
  const precheckIssueCount = report?.issues.filter(issue => issue.source === 'modumake-pcb').length ?? 0;

  return {
    officialIssueCount,
    precheckIssueCount,
    officialGroups: allGroups.filter(group => group.source === 'kicad-cli'),
    precheckGroups: allGroups.filter(group => group.source === 'modumake-pcb'),
    allGroups,
    hasOfficialDrc: Boolean(report?.checks.kicadDrc || officialIssueCount > 0),
  };
}
