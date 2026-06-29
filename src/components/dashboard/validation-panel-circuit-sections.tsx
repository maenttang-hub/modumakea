'use client';

import { useState, type CSSProperties, type MutableRefObject } from 'react';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { FootprintMatcherViewer } from '@/components/dashboard/footprint-matcher-viewer';
import { ValidationIssueSummaryList } from '@/components/dashboard/validation-panel-sections';
import {
  buildReviewIssueKey,
} from '@/lib/review-focus';
import {
  PANEL_CARD,
  PANEL_SECTION_NEUTRAL,
  type IssueGroupSummary,
} from '@/components/dashboard/validation-panel-helpers';
import { translateEngineIssue } from '@/lib/engine-i18n';
import type { ProjectAuditIssue, WarningSeverity } from '@/types';

type IssueCardItem = {
  issue: ProjectAuditIssue;
  analysis?: {
    sources?: Array<{ label: string; url: string }>;
  };
  suggestion: string;
};

type IssueTone = {
  bg: string;
  border: string;
  text: string;
  labelKey: {
    ko: string;
    en: string;
  };
};

type FootprintMatcherPayload = {
  component: { instanceId: string; name: string };
  model: {
    mappingSource?: 'component' | 'cache' | 'default';
  };
} | null;

type IssueChecklistSection = {
  key: string;
  title: string;
  items: string[];
};

type FocusChip = {
  key: string;
  label: string;
};

type SmartLinterGroup = {
  id: string;
  label: string;
  tone: string;
  count: number;
  topIssue: ProjectAuditIssue | null;
};

export function ValidationCircuitIssuesSection({
  t,
  appLanguage,
  uiDebugMode,
  severityFilter,
  setSeverityFilter,
  smartLinterGroups,
  issueCards,
  filteredIssueCards,
  groupedIssueSummaries,
  ghostFixPreview,
  commitGhostFix,
  rollbackGhostFix,
  importedSectionStyle,
  importedCardStyle,
  importedMutedTextStyle,
  importedStrongTextStyle,
  activeIssueKey,
  activeIssueActionKey,
  issueCardRefs,
  issueActionRefs,
  resolveTone,
  getFocusChips,
  getReferenceHint,
  getChecklistSections,
  getIssueActionLabel,
  getIssueFriendlyLead,
  buildIssueFootprintMatcher,
  hoverIssueOnCanvas,
  highlightIssueOnCanvas,
  applyIssueFix,
  setFootprintPinPadOverride,
}: {
  t: (ko: string, en: string) => string;
  appLanguage: 'ko' | 'en';
  uiDebugMode: boolean;
  severityFilter: WarningSeverity | 'all';
  setSeverityFilter: (value: WarningSeverity | 'all') => void;
  smartLinterGroups: SmartLinterGroup[];
  issueCards: IssueCardItem[];
  filteredIssueCards: IssueCardItem[];
  groupedIssueSummaries: IssueGroupSummary[];
  ghostFixPreview: {
    components: unknown[];
    explanation: string;
    recommendation: string;
  } | null;
  commitGhostFix: () => { success: boolean; error?: string };
  rollbackGhostFix: () => void;
  importedSectionStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  importedStrongTextStyle?: CSSProperties;
  activeIssueKey: string | null;
  activeIssueActionKey: string | null;
  issueCardRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  issueActionRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  resolveTone: (severity: WarningSeverity) => IssueTone;
  getFocusChips: (issue: ProjectAuditIssue) => FocusChip[];
  getReferenceHint: (issue: ProjectAuditIssue) => string | null;
  getChecklistSections: (issue: ProjectAuditIssue) => IssueChecklistSection[];
  getIssueActionLabel: (issue: ProjectAuditIssue) => string | null;
  getIssueFriendlyLead: (issue: ProjectAuditIssue) => string;
  buildIssueFootprintMatcher: (issue: ProjectAuditIssue) => FootprintMatcherPayload;
  hoverIssueOnCanvas: (issue: ProjectAuditIssue | null) => void;
  highlightIssueOnCanvas: (issue: ProjectAuditIssue) => void;
  applyIssueFix: (issue: ProjectAuditIssue) => void;
  setFootprintPinPadOverride: (componentId: string, pinId: string, padId: string) => void;
}) {
  const [expandedSeverity, setExpandedSeverity] = useState<WarningSeverity | 'all' | null>(null);
  const showAllIssues = expandedSeverity === severityFilter;
  const visibleSeverityCounts = {
    error: issueCards.filter(({ issue }) => issue.severity === 'error').length,
    warning: issueCards.filter(({ issue }) => issue.severity === 'warning').length,
    info: issueCards.filter(({ issue }) => issue.severity === 'info').length,
  };
  const previewCount = 3;
  const previewIssueCards = showAllIssues
    ? filteredIssueCards
    : filteredIssueCards.slice(0, previewCount);
  const hiddenIssueCount = Math.max(0, filteredIssueCards.length - previewCount);

  return (
    <div className={`${PANEL_SECTION_NEUTRAL} space-y-3.5`} style={importedSectionStyle}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b8f82]">
          {t('실시간 하드웨어 리뷰', 'Live Hardware Review')}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['all', 'error', 'warning', 'info'] as const).map(level => {
            const count =
              level === 'all'
                ? issueCards.length
                : visibleSeverityCounts[level];
            const isActive = severityFilter === level;
            const tone = level === 'all'
              ? { labelKey: { ko: '전체', en: 'All' } }
              : resolveTone(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSeverityFilter(level)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? 'border-[#bcd2ea] bg-[#e9f2fc] text-[#2f5d91]'
                    : 'border-[#e3dbcf] bg-[#fffdfa] text-[#9b8f82] hover:text-[#5f5246]'
                }`}
              >
                {level === 'all' ? t('전체', 'All') : (appLanguage === 'ko' ? tone.labelKey.ko : tone.labelKey.en)} {count}
              </button>
            );
          })}
        </div>
      </div>

      {smartLinterGroups.length > 0 ? (
        <div className={`${PANEL_CARD} space-y-2.5`} style={importedCardStyle}>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9b8f82]" style={importedMutedTextStyle}>
            {t('핵심 린터', 'Smart linter')}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {smartLinterGroups.map(group => {
              const translatedTopIssue = group.topIssue ? translateEngineIssue(group.topIssue, appLanguage) : null;
              return (
                <div
                  key={group.id}
                  className="rounded-[14px] border border-[#e9dfd3] bg-[#fffdfa] px-3 py-2.5"
                  style={importedCardStyle}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${group.tone}`}>{group.label}</span>
                    <span className="rounded-full border border-[#e1d8cc] px-2 py-0.5 text-[10px] text-[#8d8074]">
                      {group.count}
                    </span>
                  </div>
                  {translatedTopIssue ? (
                    <p className="mt-1.5 text-[10px] leading-[1.55] text-[#8d8074]" style={importedMutedTextStyle}>
                      {translatedTopIssue.title}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {ghostFixPreview ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-[11px]" style={importedCardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-amber-200">{t('AI 수정안 미리보기', 'AI fix preview')}</div>
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-100">
              {ghostFixPreview.components.length}{t('개 부품', ' parts')}
            </span>
          </div>
          <p className="mt-2 leading-relaxed text-slate-200" style={importedStrongTextStyle}>{ghostFixPreview.explanation}</p>
          <div className="mt-2 rounded border border-slate-800 bg-slate-950/45 px-2.5 py-2 text-slate-300" style={importedCardStyle}>
            {ghostFixPreview.recommendation}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const result = commitGhostFix();
                if (!result.success) {
                  toast.error(t('자동 수정 반영 실패', 'Could not apply the fix'), {
                    description: result.error,
                  });
                  return;
                }
                toast.success(t('수정안을 회로에 반영했습니다.', 'Applied the fix to the circuit.'));
              }}
              className="rounded border border-emerald-500/40 bg-emerald-500/12 px-2.5 py-1.5 text-[10px] font-bold text-emerald-100"
            >
              {t('회로에 반영', 'Apply to circuit')}
            </button>
            <button
              type="button"
              onClick={() => {
                rollbackGhostFix();
                toast.info(t('AI 수정안 미리보기를 닫았습니다.', 'Closed the AI fix preview.'));
              }}
              className="rounded border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-200"
            >
              {t('취소', 'Cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {issueCards.length === 0 ? (
        <div className="border border-emerald-900/40 bg-emerald-950/20 px-2.5 py-2 text-[11px] text-emerald-200">
          {t('현재 설계에서는 즉시 차단할 데이터시트 기반 경고가 없습니다.', 'There are no datasheet-based warnings that need an immediate block right now.')}
        </div>
      ) : filteredIssueCards.length === 0 ? (
        <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-[11px] text-slate-300">
          {t('선택한 수준의 이슈가 없습니다. 다른 필터를 눌러 더 넓게 확인해 보세요.', 'There are no issues at this level. Try another filter for a wider view.')}
        </div>
      ) : (
        <div className="space-y-2">
          <ValidationIssueSummaryList
            groups={groupedIssueSummaries}
            importedCardStyle={importedCardStyle}
            importedMutedTextStyle={importedMutedTextStyle}
            importedStrongTextStyle={importedStrongTextStyle}
            resolveTone={resolveTone}
            t={t}
          />
          {filteredIssueCards.length > previewCount ? (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/90 bg-slate-950/45 px-3 py-2"
              style={importedCardStyle}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-100" style={importedStrongTextStyle}>
                  {showAllIssues
                    ? t('상세 이슈를 모두 보는 중입니다.', 'Showing the full issue list.')
                    : t('우선순위 높은 3개만 먼저 보여줍니다.', 'Showing the top 3 issues first.')}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400" style={importedMutedTextStyle}>
                  {showAllIssues
                    ? t('핵심 확인이 끝나면 다시 접어서 첫 화면을 가볍게 볼 수 있습니다.', 'Collapse again after review to keep the first screen light.')
                    : t(
                        `나머지 ${hiddenIssueCount}개는 필요할 때 펼쳐서 보면 됩니다.`,
                        `Open the remaining ${hiddenIssueCount} when you need more detail.`
                      )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedSeverity(current => current === severityFilter ? null : severityFilter)}
                className="shrink-0 rounded-md border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-semibold text-slate-100 transition-colors hover:border-sky-400/40 hover:text-sky-200"
              >
                {showAllIssues ? t('다시 접기', 'Collapse') : t('나머지 보기', 'Show more')}
              </button>
            </div>
          ) : null}
          {previewIssueCards.map(({ issue, analysis, suggestion }) => {
            const tone = resolveTone(issue.severity);
            const translatedIssue = translateEngineIssue(issue, appLanguage);
            const focusChips = getFocusChips(issue);
            const referenceHint = getReferenceHint(issue);
            const checklistSections = getChecklistSections(issue);
            const actionLabel = getIssueActionLabel(issue);
            const issueKey = buildReviewIssueKey(issue);
            const issueFootprintMatcher = buildIssueFootprintMatcher(issue);
            const friendlyLead = getIssueFriendlyLead(issue);
            const isActive = activeIssueKey === issueKey;
            const isActionActive = activeIssueActionKey === issueKey;
            const hasCanvasTarget =
              Boolean(issue.componentName) ||
              Boolean(issue.boardPin) ||
              (issue.visualTargets?.componentIds?.length ?? 0) > 0 ||
              (issue.visualTargets?.pinIds?.length ?? 0) > 0 ||
              (issue.visualTargets?.netIds?.length ?? 0) > 0;

            return (
              <div
                key={issueKey}
                ref={node => {
                  if (node) {
                    issueCardRefs.current.set(issueKey, node);
                    return;
                  }
                  issueCardRefs.current.delete(issueKey);
                }}
                data-mm-review-issue-key={issueKey}
                data-mm-review-active={isActive ? 'true' : 'false'}
                data-mm-review-severity={issue.severity}
                onMouseEnter={() => hoverIssueOnCanvas(issue)}
                onMouseLeave={() => hoverIssueOnCanvas(null)}
                className="border px-2.5 py-2 transition-shadow"
                style={{
                  background: tone.bg,
                  borderColor: isActive ? '#7dd3fc' : tone.border,
                  boxShadow: isActive ? '0 0 0 1px rgba(125,211,252,0.25), 0 0 0 4px rgba(14,165,233,0.08)' : 'none',
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-bold" style={{ color: tone.text }}>
                    [{appLanguage === 'ko' ? tone.labelKey.ko : tone.labelKey.en}] {translatedIssue.title}
                  </span>
                  {issue.componentName ? (
                    <span className="truncate text-[10px] text-slate-400">{issue.componentName}</span>
                  ) : null}
                </div>
                <p className="text-[11px] font-semibold leading-relaxed text-slate-200" style={importedStrongTextStyle}>{friendlyLead}</p>
                {uiDebugMode ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400" style={importedMutedTextStyle}>{translatedIssue.message}</p>
                ) : null}
                {focusChips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {focusChips.map(chip => (
                      <span
                        key={chip.key}
                        className="rounded-full border border-slate-700/80 bg-slate-950/55 px-2 py-1 text-[10px] font-semibold text-slate-200"
                        style={importedCardStyle}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div
                  className="mt-2 border border-slate-800 bg-slate-950/40 px-2 py-2 text-[11px] text-slate-200"
                  style={importedCardStyle}
                >
                  <span className="font-semibold">{t('다음 조치', 'Next step')}</span>
                  <span className="ml-1">{suggestion}</span>
                </div>
                {referenceHint ? (
                  <div className="mt-2 rounded border border-slate-800/90 bg-slate-950/30 px-2 py-2 text-[10px] leading-relaxed text-slate-400" style={importedCardStyle}>
                    {referenceHint}
                  </div>
                ) : null}
                {checklistSections.length > 0 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {checklistSections.map(section => (
                      <div
                        key={section.key}
                        className="rounded border border-slate-800/90 bg-slate-950/30 px-2 py-2"
                        style={importedCardStyle}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" style={importedMutedTextStyle}>
                          {section.title}
                        </div>
                        <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-slate-300" style={importedStrongTextStyle}>
                          {section.items.map(item => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
                {issueFootprintMatcher ? (
                  <div className="mt-2">
                    <FootprintMatcherViewer
                      model={issueFootprintMatcher.model as never}
                      editable
                      onLinkChange={(pinId, padId) => {
                        setFootprintPinPadOverride(issueFootprintMatcher.component.instanceId, pinId, padId);
                        toast.success(
                          t('핀-패드 매핑 저장됨', 'Pin-to-pad mapping saved'),
                          {
                            description: t(
                              `${issueFootprintMatcher.component.name}.${pinId}를 패드 ${padId} 기준으로 검수에 반영합니다.`,
                              `${issueFootprintMatcher.component.name}.${pinId} will now be validated against pad ${padId}.`
                            ),
                          }
                        );
                      }}
                    />
                    {issueFootprintMatcher.model.mappingSource === 'component' ? (
                      <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-950/15 px-3 py-2 text-[11px] leading-relaxed text-emerald-100">
                        {t(
                          '사용자 지정 핀 규칙 기반 검수입니다. 이 부품에서 직접 저장한 매핑을 우선 사용하고 있습니다.',
                          'This check is using a user-defined pin rule. The mapping saved on this part is taking priority.'
                        )}
                      </div>
                    ) : issueFootprintMatcher.model.mappingSource === 'cache' ? (
                      <div className="mt-2 rounded-lg border border-sky-500/25 bg-sky-950/15 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
                        {t(
                          '사용자 지정 핀 규칙 기반 검수입니다. 비슷한 부품군에서 저장된 매핑을 자동 제안으로 재사용했습니다.',
                          'This check is using a user-defined pin rule. A saved mapping from a similar part family was reused as an automatic suggestion.'
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {(issue.componentName || actionLabel) ? (
                  <div
                    className="mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 transition-all"
                    style={{
                      borderColor: isActionActive ? 'rgba(52,211,153,0.5)' : 'rgba(51,65,85,0.45)',
                      background: isActionActive ? 'rgba(16,185,129,0.12)' : 'rgba(2,6,23,0.18)',
                      boxShadow: isActionActive ? '0 0 0 1px rgba(52,211,153,0.16), 0 0 0 4px rgba(16,185,129,0.08)' : 'none',
                    }}
                  >
                    {hasCanvasTarget ? (
                      <button
                        type="button"
                        onClick={() => highlightIssueOnCanvas(issue)}
                        className="rounded border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-100 transition-colors hover:border-sky-400/40 hover:text-sky-200"
                      >
                        {t('캔버스 보기', 'View on canvas')}
                      </button>
                    ) : (
                      <span />
                    )}
                    {actionLabel ? (
                      <button
                        type="button"
                        ref={node => {
                          if (node) {
                            issueActionRefs.current.set(issueKey, node);
                            return;
                          }
                          issueActionRefs.current.delete(issueKey);
                        }}
                        data-mm-review-action-key={issueKey}
                        data-mm-review-action-active={isActionActive ? 'true' : 'false'}
                        onClick={() => applyIssueFix(issue)}
                        className="rounded border bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-100 transition-all hover:border-emerald-400/40 hover:text-emerald-200"
                        style={{
                          borderColor: isActionActive ? 'rgba(52,211,153,0.65)' : 'rgba(71,85,105,0.85)',
                          color: isActionActive ? '#bbf7d0' : undefined,
                          boxShadow: isActionActive ? '0 0 0 1px rgba(52,211,153,0.3)' : 'none',
                        }}
                      >
                        {actionLabel}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {(issue.sourceUrl || analysis?.sources?.[0]) ? (
                  <a
                    href={issue.sourceUrl ?? analysis?.sources?.[0]?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    <span className="truncate">{t('근거', 'Source')}: {issue.sourceLabel ?? analysis?.sources?.[0]?.label}</span>
                    <ExternalLink size={10} className="flex-shrink-0" />
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ValidationPowerBudgetSection({
  t,
  audit,
  powerInputLabel,
  importedSectionStyle,
  importedCardStyle,
}: {
  t: (ko: string, en: string) => string;
  audit: {
    powerReport: {
      rails: Array<{
        rail: string;
        usedMa: number;
        budgetMa?: number;
        usageRatio?: number;
        headroomMa?: number;
        note?: string;
        inferred?: boolean;
        status?: 'ok' | 'warning' | 'error';
      }>;
      regulators: Array<{
        id: string;
        label: string;
        status?: 'ok' | 'warning' | 'error';
        junctionTempC?: number;
        usageRatio?: number;
        dissipationW: number;
        safeLimitW: number;
        inputVoltage: number;
        outputVoltage: number;
        estimatedCurrentMa: number;
        ambientTempC?: number;
        thermalResistanceCPerW?: number;
        packageLabel?: string;
        note?: string;
      }>;
    };
  };
  powerInputLabel: string;
  importedSectionStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
}) {
  const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  if (audit.powerReport.rails.length === 0) {
    return null;
  }

  return (
    <div className={`${PANEL_SECTION_NEUTRAL} space-y-3`} style={importedSectionStyle}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {t('전원 예산 리뷰', 'Power Budget Review')}
      </div>
      <div className="text-[10px] text-slate-500">
        {t('기준 입력', 'Input basis')}: <span className="font-bold text-slate-300">{powerInputLabel}</span>
      </div>
      <div className="space-y-2">
        {audit.powerReport.rails.map(rail => {
          const usageRatio = rail.usageRatio ?? (rail.budgetMa ? rail.usedMa / rail.budgetMa : 0);
          const usagePercent = clampPercent(usageRatio * 100);
          const tone =
            rail.status === 'error' || (rail.budgetMa && usageRatio > 1)
              ? 'text-[#fca5a5]'
              : rail.status === 'warning' || (rail.budgetMa && usageRatio >= 0.85)
                ? 'text-[#fcd34d]'
                : 'text-[#86efac]';
          const gaugeColor =
            rail.status === 'error' || usageRatio > 1
              ? 'bg-red-400'
              : rail.status === 'warning' || usageRatio >= 0.85
                ? 'bg-amber-400'
                : 'bg-emerald-400';
          const advisory =
            rail.budgetMa && usageRatio >= 0.85
              ? t(
                  `${rail.rail} 레일이 예산의 ${Math.round(usagePercent)}%를 사용 중입니다. 센서를 더 붙이기 전에 외부 전원이나 레일 분리를 먼저 검토하세요.`,
                  `The ${rail.rail} rail is already using ${Math.round(usagePercent)}% of its budget. Review external power or split the rail before adding more load.`
                )
              : null;

          return (
            <div key={rail.rail} className={PANEL_CARD} style={importedCardStyle}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-400">{rail.rail} Rail</span>
                <span className={`font-bold ${tone}`}>
                  {rail.budgetMa ? `${Math.round(usagePercent)}%` : `${rail.usedMa}mA`}
                </span>
              </div>
              {rail.budgetMa ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900">
                    <div className={`h-full ${gaugeColor}`} style={{ width: `${Math.max(6, usagePercent)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    {t('사용량', 'Usage')} {rail.usedMa}mA / {t('한계치', 'Limit')} {rail.budgetMa}mA
                    {typeof rail.headroomMa === 'number' ? ` · ${t('여유', 'Headroom')} ${rail.headroomMa}mA` : ''}
                  </p>
                  {advisory ? (
                    <div className="mt-2 rounded border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100">
                      {advisory}
                    </div>
                  ) : null}
                </>
              ) : null}
              {rail.note ? (
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {rail.note}{rail.inferred ? ` (${t('보수적 추정 포함', 'includes conservative estimate')})` : ''}
                </p>
              ) : null}
            </div>
          );
        })}
        {audit.powerReport.regulators.map(regulator => {
          const tone =
            regulator.status === 'error'
              ? 'text-[#fca5a5]'
              : regulator.status === 'warning'
                ? 'text-[#fcd34d]'
                : 'text-[#86efac]';
          const junctionTemp = regulator.junctionTempC;
          const thermalPercent =
            typeof junctionTemp === 'number'
              ? clampPercent(((junctionTemp - 25) / 100) * 100)
              : clampPercent((regulator.usageRatio ?? 0) * 100);
          const thermometerColor =
            regulator.status === 'error'
              ? 'bg-red-400'
              : regulator.status === 'warning'
                ? 'bg-amber-400'
                : 'bg-emerald-400';
          const regulatorAdvisory =
            typeof junctionTemp === 'number' && junctionTemp >= 100
              ? t(
                  `${regulator.label}의 예상 접합 온도가 ${junctionTemp.toFixed(1)}℃입니다. 입력 전압을 낮추거나 스위칭 레귤레이터로 바꾸는 편이 안전합니다.`,
                  `${regulator.label} is projected to reach ${junctionTemp.toFixed(1)}℃ at the junction. Lower the input voltage or switch to a buck regulator.`
                )
              : null;

          return (
            <div key={regulator.id} className={PANEL_CARD} style={importedCardStyle}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-400">{regulator.label}</span>
                <span className={`font-bold ${tone}`}>
                  {typeof junctionTemp === 'number'
                    ? `${junctionTemp.toFixed(1)}℃`
                    : `${regulator.dissipationW}W / ${regulator.safeLimitW}W`}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Vin {regulator.inputVoltage}V {'->'} Vout {regulator.outputVoltage}V, {t('추정 부하', 'estimated load')} {regulator.estimatedCurrentMa}mA
              </p>
              <div className="mt-2">
                <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                  <div className={`h-full ${thermometerColor}`} style={{ width: `${Math.max(8, thermalPercent)}%` }} />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {typeof junctionTemp === 'number'
                    ? `${t('대기', 'Ambient')} ${regulator.ambientTempC ?? 25}℃ · θJA ${regulator.thermalResistanceCPerW ?? 0}℃/W · ${t('열손실', 'dissipation')} ${regulator.dissipationW}W`
                    : `${t('열손실', 'dissipation')} ${regulator.dissipationW}W / ${t('안전한계', 'safe limit')} ${regulator.safeLimitW}W`}
                  {regulator.packageLabel ? ` · ${regulator.packageLabel}` : ''}
                </p>
              </div>
              {regulatorAdvisory ? (
                <div className="mt-2 rounded border border-red-500/25 bg-red-500/8 px-2.5 py-2 text-[10px] leading-relaxed text-red-100">
                  {regulatorAdvisory}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
