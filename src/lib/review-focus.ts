import type { WarningSeverity } from '@/types';
import { sanitizePlainText } from '@/lib/security-input';

export const REVIEW_FOCUS_EVENT = 'modumake:review-focus';

export type ReviewIssueLocator = {
  code?: string;
  componentName?: string;
  boardPin?: string;
  operation?: string;
  line?: number;
  ruleId?: string;
  title?: string;
  message?: string;
};

export interface ReviewFocusDetail {
  source: 'review' | 'code';
  replayedFromShell?: boolean;
  interaction?: 'hover' | 'focus' | 'clear';
  emphasis?: 'card' | 'action';
  code?: string;
  componentInstanceId?: string;
  componentInstanceIds?: string[];
  componentName?: string;
  boardPin?: string;
  componentPin?: string;
  pinIds?: string[];
  netIds?: string[];
  severity?: WarningSeverity;
  title?: string;
  message?: string;
  line?: number;
  operation?: string;
  ruleId?: string;
  issueKey?: string;
}

export type ReviewFocusTarget =
  | {
      kind: 'components';
      instanceIds: string[];
    }
  | {
      kind: 'board';
    }
  | null;

export function buildReviewIssueKey(detail: ReviewIssueLocator) {
  return sanitizePlainText([
    detail.code ?? '',
    detail.componentName ?? '',
    detail.boardPin ?? '',
    detail.operation ?? '',
    detail.line ?? '',
    detail.ruleId ?? '',
    detail.title ?? '',
    detail.message ?? '',
  ].join('::'), { maxLength: 240 });
}

export function resolveReviewFocusTarget(
  detail: Pick<ReviewFocusDetail, 'componentInstanceId' | 'componentInstanceIds' | 'boardPin'>
): ReviewFocusTarget {
  const instanceIds = detail.componentInstanceIds?.filter(Boolean) ?? [];
  if (detail.componentInstanceId) {
    return {
      kind: 'components',
      instanceIds: [detail.componentInstanceId, ...instanceIds].filter((value, index, array) => array.indexOf(value) === index),
    };
  }

  if (instanceIds.length > 0) {
    return {
      kind: 'components',
      instanceIds: instanceIds.filter((value, index, array) => array.indexOf(value) === index),
    };
  }

  if (detail.boardPin) {
    return { kind: 'board' };
  }

  return null;
}

export function emitReviewFocus(detail: ReviewFocusDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ReviewFocusDetail>(REVIEW_FOCUS_EVENT, {
    detail: {
      ...detail,
      issueKey:
        detail.issueKey ??
        buildReviewIssueKey({
          componentName: detail.componentName,
          boardPin: detail.boardPin,
          operation: detail.operation,
          line: detail.line,
          code: detail.code,
          ruleId: detail.ruleId,
          title: detail.title,
          message: detail.message,
        }),
    },
  }));
}
