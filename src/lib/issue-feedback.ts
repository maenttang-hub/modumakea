import type {
  IssueFeedbackStatus,
  ValidationReviewDecision,
  ValidationReviewFlagStatus,
  ValidationReviewPrimaryStatus,
} from '@/types';

const VALID_PRIMARY_STATUSES = new Set<ValidationReviewPrimaryStatus>([
  'fixed',
  'already-handled',
  'false-positive',
]);

const VALID_FLAG_STATUSES = new Set<ValidationReviewFlagStatus>([
  'included-in-module',
  'verified-by-datasheet',
]);

function normalizePrimaryStatus(value: unknown): ValidationReviewPrimaryStatus | undefined {
  if (value === 'resolved') {
    return 'fixed';
  }
  if (value === 'intentional' || value === 'already-handled') {
    return 'already-handled';
  }
  if (value === 'fixed' || value === 'false-positive') {
    return value;
  }
  return undefined;
}

function normalizeFlagStatus(value: unknown): ValidationReviewFlagStatus | null {
  if (value === 'module-included' || value === 'included-in-module') {
    return 'included-in-module';
  }
  if (value === 'datasheet-checked' || value === 'verified-by-datasheet') {
    return 'verified-by-datasheet';
  }
  return null;
}

export function normalizeValidationReviewDecision(value: unknown): ValidationReviewDecision | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ValidationReviewDecision> & {
    primary?: unknown;
    flags?: unknown;
    updatedAt?: unknown;
  };

  const rawFlags: unknown[] = Array.isArray(candidate.flags) ? candidate.flags : [];
  const normalizedPrimary = normalizePrimaryStatus(candidate.primary);
  const primary = normalizedPrimary ?? (rawFlags.includes('intentional') ? 'already-handled' : undefined);
  const flags = Array.from(new Set(rawFlags.map(normalizeFlagStatus).filter((flag): flag is ValidationReviewFlagStatus => flag != null)));
  const updatedAt = typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim().length > 0
    ? candidate.updatedAt
    : undefined;

  if (!primary && flags.length === 0) {
    return null;
  }

  return {
    primary,
    flags,
    updatedAt,
  };
}

export function shouldHideIssueForReviewDecision(decision?: ValidationReviewDecision | null) {
  return decision?.primary === 'fixed' || decision?.primary === 'false-positive';
}

export function shouldToneDownIssueForReviewDecision(decision?: ValidationReviewDecision | null) {
  return decision?.primary === 'already-handled' || (decision?.flags.length ?? 0) > 0;
}

export function getValidationReviewDecisionBadges(decision?: ValidationReviewDecision | null): IssueFeedbackStatus[] {
  if (!decision) {
    return [];
  }

  const badges: IssueFeedbackStatus[] = [];
  if (decision.primary && VALID_PRIMARY_STATUSES.has(decision.primary)) {
    badges.push(decision.primary);
  }
  for (const flag of decision.flags) {
    if (VALID_FLAG_STATUSES.has(flag)) {
      badges.push(flag);
    }
  }
  return badges;
}
