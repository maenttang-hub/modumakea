import { translateEngineIssue } from '@/lib/engine-i18n';
import { buildIssueDedupKey } from '@/lib/issue-utils';
import type { AppLanguage, FormalVerificationIssue, WarningSeverity } from '@/types';
import { buildReviewIssueKey } from '@/lib/review-focus';

export interface EditorDiagnostic {
  severity: WarningSeverity;
  line: number;
  startColumn: number;
  endColumn: number;
  title: string;
  message: string;
  ruleId?: string;
  boardPin?: string;
  componentName?: string;
  operation?: string;
  issueKey: string;
  issue: FormalVerificationIssue;
}

export interface EditorDiagnosticBundle {
  markers: EditorDiagnostic[];
  generalIssues: FormalVerificationIssue[];
}

function normalizeDiagnosticMessageForLanguage(issue: FormalVerificationIssue, language: AppLanguage) {
  const translated = translateEngineIssue(issue, language);
  const parts = [translated.title.trim(), translated.message.trim()];
  if (translated.recommendation?.trim()) {
    parts.push(
      language === 'ko'
        ? `권장 수정: ${translated.recommendation.trim()}`
        : `Suggested fix: ${translated.recommendation.trim()}`
    );
  }

  return parts.filter(Boolean).join('\n');
}

export function buildEditorDiagnosticBundle(
  code: string,
  issues: FormalVerificationIssue[],
  language: AppLanguage = 'ko'
): EditorDiagnosticBundle {
  const lines = code.split(/\r?\n/);
  const lineCount = Math.max(lines.length, 1);
  const generalIssues: FormalVerificationIssue[] = [];
  const markers: EditorDiagnostic[] = [];
  const markerSeen = new Set<string>();
  const generalSeen = new Set<string>();

  for (const issue of issues) {
    if (!issue.line || !Number.isFinite(issue.line)) {
      const generalKey = buildIssueDedupKey(issue);
      if (generalSeen.has(generalKey)) {
        continue;
      }
      generalSeen.add(generalKey);
      generalIssues.push(issue);
      continue;
    }

    const normalizedLine = Math.min(Math.max(Math.trunc(issue.line), 1), lineCount);
    const lineText = lines[normalizedLine - 1] ?? '';
    const firstVisibleColumn = (lineText.match(/\S/) ?? { index: 0 }).index ?? 0;
    const startColumn = Math.max(firstVisibleColumn + 1, 1);
    const endColumn = Math.max(lineText.length + 1, startColumn + 1);
    const markerKey = buildIssueDedupKey({
      ...issue,
      line: normalizedLine,
    });
    if (markerSeen.has(markerKey)) {
      continue;
    }
    markerSeen.add(markerKey);

    markers.push({
      severity: issue.severity,
      line: normalizedLine,
      startColumn,
      endColumn,
      title: translateEngineIssue(issue, language).title,
      message: normalizeDiagnosticMessageForLanguage(issue, language),
      ruleId: issue.ruleId,
      boardPin: issue.boardPin,
      componentName: issue.componentName,
      operation: issue.operation,
      issueKey: buildReviewIssueKey({
        code: issue.code,
        componentName: issue.componentName,
        boardPin: issue.boardPin,
        operation: issue.operation,
        line: issue.line,
        ruleId: issue.ruleId,
        title: issue.title,
        message: issue.message,
      }),
      issue,
    });
  }

  markers.sort((left, right) => left.line - right.line || left.startColumn - right.startColumn);

  return {
    markers,
    generalIssues,
  };
}
