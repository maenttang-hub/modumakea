import type {
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ImportedPcbValidationSource,
  WarningSeverity,
} from '@/types';

const REPRESENTATIVE_LIMIT_SUFFIX = '_REPRESENTATIVE_LIMIT';
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

type MutableImportedPcbReviewGroup = Omit<
  ImportedPcbReviewGroup,
  'affectedFootprints' | 'affectedNets' | 'affectedLayers'
> & {
  affectedFootprints: Set<string>;
  affectedNets: Set<string>;
  affectedLayers: Set<string>;
};

function baseIssueCode(code: string) {
  return code.endsWith(REPRESENTATIVE_LIMIT_SUFFIX)
    ? code.slice(0, -REPRESENTATIVE_LIMIT_SUFFIX.length)
    : code;
}

function isRepresentativeLimitIssue(issue: ImportedPcbValidationIssue) {
  return issue.code.endsWith(REPRESENTATIVE_LIMIT_SUFFIX);
}

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
  const summaryPenalty = isRepresentativeLimitIssue(issue) ? -100 : 0;
  return severityRank(reviewSeverity(issue)) * 1000 + sourceBoost + summaryPenalty;
}

function groupPriority(group: MutableImportedPcbReviewGroup) {
  const sourceBoost = group.source === 'kicad-cli' ? 500 : 0;
  const repeatWeight = Math.min(400, group.visibleIssueCount * 18 + Math.floor(group.hiddenCandidateCount / 4));
  return severityRank(group.severity) * 1000 + sourceBoost + repeatWeight;
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

export function buildImportedPcbReviewGroups(
  report: ImportedPcbValidationReport | null | undefined
): ImportedPcbReviewGroup[] {
  if (!report || report.issues.length === 0) {
    return [];
  }

  const groups = new Map<string, MutableImportedPcbReviewGroup>();
  for (const issue of report.issues) {
    const code = baseIssueCode(issue.code);
    const key = `${issue.source}:${code}`;
    const group = groups.get(key) ?? createGroup(issue, code);
    const hiddenCount = hiddenCandidateCount(issue);
    const issueSeverity = reviewSeverity(issue);

    group.count += 1;
    group.hiddenCandidateCount += hiddenCount;
    group.issueIds.push(issue.id);
    rememberScope(group, issue);

    if (!isRepresentativeLimitIssue(issue)) {
      group.visibleIssueCount += 1;
    }

    if (severityRank(issueSeverity) > severityRank(group.severity)) {
      group.severity = issueSeverity;
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
