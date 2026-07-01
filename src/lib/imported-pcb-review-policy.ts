import type { ImportedPcbValidationIssue } from '@/types';

export type ImportedPcbReviewImpact =
  | 'blocking'
  | 'actionable'
  | 'intent-dependent'
  | 'informational';

const REPRESENTATIVE_LIMIT_SUFFIX = '_REPRESENTATIVE_LIMIT';

const LOCAL_STRUCTURE_BLOCKERS = new Set([
  'PCB_EMPTY_GEOMETRY',
  'PCB_NO_FOOTPRINTS',
  'PCB_NO_EDGE_CUTS',
]);

const LOCAL_ACTIONABLE_CODES = new Set([
  'PCB_DUPLICATE_REFERENCE',
  'PCB_STRAY_COPPER',
  'PCB_TRACK_TOO_NARROW',
  'PCB_ZONE_WITHOUT_POLYGON',
  'PCB_NET_HAS_NO_COPPER_PATH',
  'PCB_NET_DISCONNECTED',
]);

const LOCAL_INFORMATIONAL_CODES = new Set([
  'PCB_DIFF_PAIR_RULES_MISSING',
  'PCB_DIFF_PAIR_IMPEDANCE_UNVERIFIED',
]);

export function baseImportedPcbIssueCode(code: string) {
  return code.endsWith(REPRESENTATIVE_LIMIT_SUFFIX)
    ? code.slice(0, -REPRESENTATIVE_LIMIT_SUFFIX.length)
    : code;
}

export function isRepresentativeImportedPcbLimitIssue(issue: ImportedPcbValidationIssue) {
  return issue.code.endsWith(REPRESENTATIVE_LIMIT_SUFFIX);
}

export function classifyImportedPcbReviewImpact(issue: ImportedPcbValidationIssue): ImportedPcbReviewImpact {
  if (issue.source === 'kicad-cli') {
    if (issue.severity === 'error') {
      return 'blocking';
    }
    if (issue.severity === 'warning') {
      return 'actionable';
    }
    return 'informational';
  }

  const code = baseImportedPcbIssueCode(issue.code);
  if (LOCAL_STRUCTURE_BLOCKERS.has(code)) {
    return 'blocking';
  }
  if (LOCAL_ACTIONABLE_CODES.has(code)) {
    return 'actionable';
  }
  if (LOCAL_INFORMATIONAL_CODES.has(code) || issue.severity === 'info') {
    return 'informational';
  }

  return 'intent-dependent';
}

export function importedPcbReviewImpactRank(impact: ImportedPcbReviewImpact) {
  if (impact === 'blocking') {
    return 4;
  }
  if (impact === 'actionable') {
    return 3;
  }
  if (impact === 'intent-dependent') {
    return 2;
  }
  return 1;
}

