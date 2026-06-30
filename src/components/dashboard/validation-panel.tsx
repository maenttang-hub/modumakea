'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Download, FileSearch, FileText, Flag, ShieldAlert, Wrench } from 'lucide-react';
import { importKiCadSchematicAsync } from '@/lib/import-kicad-schematic-async';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import {
  getValidationReviewDecisionBadges,
  shouldHideIssueForReviewDecision,
  shouldToneDownIssueForReviewDecision,
} from '@/lib/issue-feedback';
import { buildReviewIssueKey, emitReviewFocus } from '@/lib/review-focus';
import { persistReportWorkspaceSnapshot } from '@/lib/report-workspace-snapshot';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import { useValidationReport, type ValidationDisplayIssue } from '@/hooks/use-validation-report';
import type {
  IssueFeedbackStatus,
  ProjectAuditIssueConfidence,
  ValidationReviewDecision,
} from '@/types';
import { toast } from 'sonner';

type IssueDecisionUpdate =
  NonNullable<ValidationReviewDecision['primary']> |
  ValidationReviewDecision['flags'][number];
type SourceFilter = 'all' | ValidationDisplayIssue['sourceBucket'];

const CONFIDENCE_ORDER: ProjectAuditIssueConfidence[] = [
  'confirmed',
  'strong-inference',
  'needs-review',
  'informational',
];

function confidenceMeta(confidence: ProjectAuditIssueConfidence) {
  switch (confidence) {
    case 'confirmed':
      return {
        title: '확정 오류',
        description: '실물 제작 전 반드시 확인해야 할 가능성이 큽니다.',
        accent: 'border-[#efcfcf] bg-[#fff7f7]',
        chip: 'bg-[#fbe8e8] text-[#b24f4f]',
      };
    case 'strong-inference':
      return {
        title: '강한 추정',
        description: '근거가 충분하지만 현물/모듈 조건을 한 번 더 보는 편이 안전합니다.',
        accent: 'border-[#eddcc3] bg-[#fffbf6]',
        chip: 'bg-[#fbf0d7] text-[#a57019]',
      };
    case 'needs-review':
      return {
        title: '검토 권장',
        description: '데이터시트나 실제 모듈 기준으로 확인이 필요합니다.',
        accent: 'border-[#dce5ef] bg-[#f9fbfe]',
        chip: 'bg-[#e8f0fa] text-[#4e79ac]',
      };
    default:
      return {
        title: '정보',
        description: '상태 공유용 메모입니다.',
        accent: 'border-[#dde8dd] bg-[#fbfffb]',
        chip: 'bg-[#e7f4ea] text-[#34764a]',
      };
  }
}

function checkerLabel(checker: ValidationDisplayIssue['evidence']['checkedBy'][number]) {
  switch (checker) {
    case 'formal-code':
      return '코드 검증';
    case 'datasheet-rule':
      return '데이터시트 규칙';
    case 'kicad-import':
      return 'KiCad import';
    case 'solver':
      return '회로 해석';
    default:
      return '넷리스트';
  }
}

function decisionLabel(flag: IssueFeedbackStatus) {
  switch (flag) {
    case 'fixed':
      return '수정 완료';
    case 'already-handled':
      return '이미 반영됨';
    case 'false-positive':
      return '오탐 신고';
    case 'included-in-module':
      return '모듈 포함';
    case 'verified-by-datasheet':
      return '데이터시트 확인';
    default:
      return null;
  }
}

function mappingConfidenceLabel(confidence?: ValidationDisplayIssue['mappingConfidence']) {
  switch (confidence) {
    case 'high':
      return '매핑 높음';
    case 'medium':
      return '매핑 보통';
    case 'low':
      return '매핑 낮음';
    default:
      return null;
  }
}

function mappingSourceLabel(source?: ValidationDisplayIssue['mappingSource']) {
  switch (source) {
    case 'kicad-library':
      return 'KiCad 라이브러리';
    case 'refdes':
      return 'refdes 추정';
    case 'value-regex':
      return 'value 추정';
    case 'footprint-regex':
      return 'footprint 추정';
    case 'pin-shape':
      return 'pin shape 추정';
    case 'custom-fallback':
      return 'fallback 매핑';
    default:
      return null;
  }
}

function sectionIcon(confidence: ProjectAuditIssueConfidence) {
  if (confidence === 'confirmed') {
    return <ShieldAlert size={13} className="text-[#b24f4f]" />;
  }
  if (confidence === 'strong-inference') {
    return <AlertTriangle size={13} className="text-[#a57019]" />;
  }
  if (confidence === 'needs-review') {
    return <CircleHelp size={13} className="text-[#4e79ac]" />;
  }
  return <CheckCircle2 size={13} className="text-[#34764a]" />;
}

function sourceFilterMeta(filter: SourceFilter) {
  switch (filter) {
    case 'official':
      return { label: '공식 근거', chip: 'border-[#d7e6d9] bg-[#f8fff9] text-[#34764a]' };
    case 'partial':
      return { label: 'partial', chip: 'border-[#e5dcc8] bg-[#fffaf2] text-[#8b6a2d]' };
    case 'generic':
      return { label: 'generic', chip: 'border-[#dde5ee] bg-[#f8fbff] text-[#4e79ac]' };
    case 'fallback':
      return { label: 'fallback', chip: 'border-[#ead8cf] bg-[#fff8f4] text-[#93653c]' };
    case 'other':
      return { label: '기타', chip: 'border-[#e6e0d8] bg-[#fcfaf6] text-[#7c6d60]' };
    default:
      return { label: '전체', chip: 'border-[#e6dfd4] bg-white text-[#5f5448]' };
  }
}

export function ValidationPanel() {
  const appLanguage = useBoardStore(state => state.appLanguage);
  const projectName = useBoardStore(state => state.projectName);
  const importedSchematicSource = useBoardStore(state => state.importedSchematicSource);
  const components = useBoardStore(state => state.components);
  const hydrateProject = useBoardStore(state => state.hydrateProject);
  const clearCloudProjectState = useBoardStore(state => state.clearCloudProjectState);
  const setSelectedComponentId = useBoardStore(state => state.setSelectedComponentId);
  const validationReviewDecisions = useBoardStore(state => state.validationReviewDecisions);
  const setValidationReviewDecision = useBoardStore(state => state.setValidationReviewDecision);
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const {
    issues,
    importedSchematicMode,
    activeBoard,
    hasLowConfidenceImport,
    lowConfidenceImportReasons,
    sourceBucketCounts,
  } = useValidationReport();
  const reimportInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const activeIssues = useMemo(() => {
    return issues.filter(issue => {
      const key = buildReviewIssueKey(issue);
      const decision = validationReviewDecisions[key];
      if (shouldHideIssueForReviewDecision(decision)) {
        return false;
      }
      if (sourceFilter !== 'all' && issue.sourceBucket !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [issues, sourceFilter, validationReviewDecisions]);

  const groupedIssues = useMemo(() => {
    return CONFIDENCE_ORDER.map(confidence => ({
      confidence,
      items: activeIssues.filter(issue => issue.confidence === confidence),
    }));
  }, [activeIssues]);

  const effectiveCounts = useMemo(() => {
    return activeIssues.reduce(
      (acc, issue) => {
        acc[issue.confidence] += 1;
        return acc;
      },
      {
        confirmed: 0,
        'strong-inference': 0,
        'needs-review': 0,
        informational: 0,
      } satisfies Record<ProjectAuditIssueConfidence, number>
    );
  }, [activeIssues]);

  const focusIssue = (issue: ValidationDisplayIssue) => {
    const componentIds = issue.evidence.affectedComponents ?? issue.visualTargets?.componentIds ?? [];
    const netIds = issue.evidence.affectedNets ?? issue.visualTargets?.netIds;
    const targetComponents = components.filter(component =>
      componentIds.includes(component.instanceId) || (issue.componentName != null && component.name === issue.componentName)
    );
    const targetComponent = targetComponents[0];

    emitReviewFocus({
      source: 'review',
      interaction: 'focus',
      emphasis: 'card',
      issueKey: buildReviewIssueKey(issue),
      code: issue.code,
      componentInstanceId: targetComponent?.instanceId,
      componentInstanceIds: targetComponents.map(component => component.instanceId),
      componentName: issue.componentName,
      boardPin: issue.boardPin,
      pinIds: issue.visualTargets?.pinIds,
      netIds,
      severity: issue.severity,
      title: issue.title,
      message: issue.message,
      line: issue.line,
      operation: issue.operation,
      ruleId: issue.ruleId,
    });

    if (targetComponent) {
      setSelectedComponentId(targetComponent.instanceId);
      window.dispatchEvent(new CustomEvent('modumake:focus-component', {
        detail: { instanceId: targetComponent.instanceId },
      }));
      return;
    }

    if (issue.boardPin) {
      setSelectedComponentId('board-node');
    }
  };

  const updateDecision = (
    issue: ValidationDisplayIssue,
    update: IssueDecisionUpdate
  ) => {
    const key = buildReviewIssueKey(issue);
    const existing = validationReviewDecisions[key] ?? { flags: [] };

    if (update === 'fixed' || update === 'already-handled' || update === 'false-positive') {
      setValidationReviewDecision(key, {
        ...existing,
        primary: update,
      });
      return;
    }

    const nextFlags = existing.flags.includes(update)
      ? existing.flags.filter(flag => flag !== update)
      : [...existing.flags, update];

    setValidationReviewDecision(key, {
      ...existing,
      flags: nextFlags,
    });
  };

  const handleReimport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = await importKiCadSchematicAsync(text, {
        projectName: file.name.replace(/\.kicad_sch$/i, ''),
      });
      const payload = {
        ...imported.document,
        integratedValidationJson: buildImportedSchematicIntegratedValidationJson({
          document: imported.document,
          importedSource: text,
          importSummary: imported.summary,
        }),
      };
      const result = hydrateProject(payload);
      if (!result.success) {
        toast.error(t('재import 실패', 'Re-import failed'), { description: result.error });
        return;
      }
      clearCloudProjectState();
      toast.success(t('정확한 import 기준으로 다시 불러왔습니다.', 'Re-imported with full KiCad source.'));
    } catch (error) {
      toast.error(t('재import 실패', 'Re-import failed'), {
        description: error instanceof Error ? error.message : t('파일을 읽는 중 오류가 발생했습니다.', 'Could not read the file.'),
      });
    }
  };

  const openReportWindow = (downloadPdf = false) => {
    persistReportWorkspaceSnapshot(useBoardStore.getState());
    const url = downloadPdf ? '/report?download=pdf' : '/report';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#fdfaf5] px-4 py-4 text-[#564a40]">
      <input
        ref={reimportInputRef}
        type="file"
        accept=".kicad_sch"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          if (file) {
            await handleReimport(file);
          }
          event.currentTarget.value = '';
        }}
      />

      <div className="space-y-4">
        <section className="rounded-[18px] border border-[#e5dbcf] bg-[#fffdfa] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
                Validation Summary
              </div>
              <h2 className="mt-1 text-[18px] font-semibold text-[#3f342c]">
                {projectName || t('회로 검토', 'Circuit Review')}
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-[#8d8074]">
                {activeBoard.name} · {importedSchematicSource ? `${projectName || 'project'}.kicad_sch` : t('캔버스 기반 프로젝트', 'Canvas-based project')}
              </p>
            </div>
            <div className="rounded-full bg-[#efe8dc] px-2.5 py-1 text-[10px] font-semibold text-[#7c6d60]">
              {activeIssues.length} active
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openReportWindow(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d9cebf] bg-white px-3 text-[11px] font-semibold text-[#5b4e42] transition hover:bg-[#fcfaf6]"
            >
              <FileText size={13} />
              {t('리포트 창 열기', 'Open report view')}
            </button>
            <button
              type="button"
              onClick={() => openReportWindow(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d7c1a2] bg-[#6f5235] px-3 text-[11px] font-semibold text-[#fff5e9] transition hover:bg-[#5f452c]"
            >
              <Download size={13} />
              {t('PDF 저장', 'Save PDF')}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-[#efd3d3] bg-[#fff8f8] px-3.5 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#ab928a]">{t('수정 필요', 'Fix required')}</div>
              <div className="mt-1 text-[20px] font-semibold text-[#b24f4f]">{effectiveCounts.confirmed + effectiveCounts['strong-inference']}</div>
              <div className="mt-1 text-[10px] leading-5 text-[#8a6c65]">
                {t('실물 제작 전 확인할 이슈 수', 'Issues to check before build')}
              </div>
            </div>
            <div className="rounded-[14px] border border-[#dce5ef] bg-[#f9fbfe] px-3.5 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#ab928a]">{t('확인 필요', 'Needs review')}</div>
              <div className="mt-1 text-[20px] font-semibold text-[#4e79ac]">{effectiveCounts['needs-review']}</div>
              <div className="mt-1 text-[10px] leading-5 text-[#6e7d8e]">
                {t('데이터시트·모듈 기준 확인 권장', 'Check against datasheet or module')}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {CONFIDENCE_ORDER.map(confidence => {
              const meta = confidenceMeta(confidence);
              return (
                <div key={confidence} className={`rounded-[12px] border px-3 py-2.5 ${meta.accent}`}>
                  <div className="text-[10px] font-semibold text-[#8f8173]">{meta.title}</div>
                  <div className="mt-1 text-[16px] font-semibold text-[#43372f]">{effectiveCounts[confidence]}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ab928a]">
              {t('근거 축 필터', 'Evidence axis filter')}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['all', 'official', 'partial', 'generic', 'fallback'] as const).map(filterKey => {
                const meta = sourceFilterMeta(filterKey);
                const count = filterKey === 'all'
                  ? issues.length
                  : sourceBucketCounts[filterKey];
                const selected = sourceFilter === filterKey;
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setSourceFilter(filterKey)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
                      selected
                        ? meta.chip
                        : 'border-[#e6dfd4] bg-[#fffdfa] text-[#7c6d60] hover:bg-white'
                    }`}
                  >
                    <span>{meta.label}</span>
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] text-[#7c6d60]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] leading-5 text-[#8d8074]">
              {t('공식 근거/partial/generic/fallback 축으로 현재 열린 이슈를 바로 좁혀볼 수 있습니다.', 'Filter open issues by official/partial/generic/fallback evidence quality.')}
            </div>
          </div>
        </section>

        {importedSchematicMode && hasLowConfidenceImport ? (
          <section className="rounded-[18px] border border-[#eddcc3] bg-[#fffaf3] px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a17b35]">
                  Import Quality
                </div>
                <div className="mt-1 text-[14px] font-semibold text-[#6f5425]">
                  {t('현재 결과는 보수적으로 해석해야 합니다.', 'Treat the current results conservatively.')}
                </div>
                <div className="mt-2 space-y-1 text-[11px] leading-5 text-[#7b694e]">
                  {lowConfidenceImportReasons.map((reason, reasonIndex) => (
                    <div key={`${reason}-${reasonIndex}`}>- {reason}</div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => reimportInputRef.current?.click()}
                className="inline-flex h-8 shrink-0 items-center rounded-[10px] border border-[#e1c892] bg-white px-3 text-[11px] font-semibold text-[#7a5923] transition hover:bg-[#fff8ef]"
              >
                {t('원본 다시 import', 'Re-import source')}
              </button>
            </div>
          </section>
        ) : null}

        {groupedIssues.map(group => {
          if (group.items.length === 0) {
            return null;
          }

          const meta = confidenceMeta(group.confidence);
          return (
            <section key={group.confidence} className="rounded-[18px] border border-[#e5dbcf] bg-[#fffdfa] px-4 py-4">
              <div className="flex items-center gap-2">
                {sectionIcon(group.confidence)}
                <div>
                  <div className="text-[14px] font-semibold text-[#43372f]">{meta.title}</div>
                  <div className="text-[11px] leading-5 text-[#8d8074]">{meta.description}</div>
                </div>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                  {group.items.length}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {group.items.map((issue, issueIndex) => {
                  const key = buildReviewIssueKey(issue);
                  const decision = validationReviewDecisions[key];
                  const badges = getValidationReviewDecisionBadges(decision)
                    .map(status => decisionLabel(status))
                    .filter(Boolean) as string[];
                  const tonedDown = shouldToneDownIssueForReviewDecision(decision);
                  const conservativeBadges = [
                    issue.sourceQualityLabel,
                    mappingConfidenceLabel(issue.mappingConfidence),
                    mappingSourceLabel(issue.mappingSource),
                  ].filter(Boolean) as string[];

                  return (
                    <div
                      key={`${key}-${issueIndex}`}
                      className={`rounded-[16px] border px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] ${
                        tonedDown
                          ? 'border-[#ddd6cc] bg-[#f8f4ee] opacity-80'
                          : 'border-[#e8dfd3] bg-[#fffdfa]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => focusIssue(issue)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                                {meta.title}
                              </span>
                              {badges.map((badge, badgeIndex) => (
                                <span key={`${badge}-${badgeIndex}`} className="rounded-full bg-[#efe8dc] px-2 py-0.5 text-[10px] font-semibold text-[#76685b]">
                                  {badge}
                                </span>
                              ))}
                              {conservativeBadges.map((badge, badgeIndex) => (
                                <span key={`${badge}-${badgeIndex}`} className="rounded-full bg-[#f1ede6] px-2 py-0.5 text-[10px] font-semibold text-[#8a765c]">
                                  {badge}
                                </span>
                              ))}
                            </div>
                            <div className="mt-2 text-[14px] font-semibold leading-6 text-[#43372f]">
                              {issue.componentName ? `${issue.componentName} — ${issue.title}` : issue.title}
                            </div>
                            <div className="mt-1 text-[11px] leading-6 text-[#5f5448]">
                              {issue.message}
                            </div>
                            {issue.isConservativeFinding ? (
                              <div className="mt-2 rounded-[10px] border border-[#eadfcb] bg-[#fbf7f0] px-2.5 py-2 text-[10px] leading-5 text-[#7b6a58]">
                                <div className="font-semibold text-[#6d5944]">
                                  {t('보수적 판단 이유', 'Why this was judged conservatively')}
                                </div>
                                <div className="mt-1 space-y-1">
                                  {issue.lowConfidenceReasons.map((reason, reasonIndex) => (
                                    <div key={`${reason}-${reasonIndex}`}>- {reason}</div>
                                  ))}
                                </div>
                                <div className="mt-1 text-[#8b7a68]">
                                  {t('정확한 SKU/MPN 또는 원본 KiCad 소스를 넣으면 이 판단이 더 날카로워집니다.', 'Adding the exact SKU/MPN or original KiCad source will make this judgment sharper.')}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 rounded-full bg-[#f4ede3] px-2.5 py-1 text-[10px] font-semibold text-[#7c6d60]">
                            {issue.severity}
                          </div>
                        </div>
                      </button>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-[12px] border border-[#ece3d8] bg-[#fcfaf6] px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d8d7f]">
                            {t('근거', 'Evidence')}
                          </div>
                          <div className="mt-2 text-[11px] leading-6 text-[#5d5248]">
                            {issue.evidence.evidenceSummary}
                          </div>
                          {issue.evidence.checkedBy.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {issue.evidence.checkedBy.map((checker, checkerIndex) => (
                                <span key={`${checker}-${checkerIndex}`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#7b6d60]">
                                  {checkerLabel(checker)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-[12px] border border-[#ece3d8] bg-[#fcfaf6] px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d8d7f]">
                            {t('가정', 'Assumptions')}
                          </div>
                          <div className="mt-2 space-y-1.5 text-[11px] leading-6 text-[#5d5248]">
                            {(issue.evidence.assumptions.length > 0 ? issue.evidence.assumptions : [t('추가 가정 없이 직접 검출된 항목입니다.', 'Directly detected without extra assumptions.')]).map((item, itemIndex) => (
                              <div key={`${item}-${itemIndex}`}>- {item}</div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#ece3d8] bg-[#fcfaf6] px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d8d7f]">
                            {t('확인 방법', 'How to verify')}
                          </div>
                          <div className="mt-2 text-[11px] leading-6 text-[#5d5248]">
                            {issue.evidence.howToVerify ?? issue.recommendation ?? t('관련 데이터시트와 회로 연결을 함께 확인하세요.', 'Check the related datasheet and wiring together.')}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#ece3d8] bg-[#fcfaf6] px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d8d7f]">
                            {t('관련 부품 / Net', 'Related parts / nets')}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {issue.relatedComponentLabels.map((label, labelIndex) => (
                              <button
                                key={`component-${label}-${labelIndex}`}
                                type="button"
                                onClick={() => focusIssue(issue)}
                                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#5f5448]"
                              >
                                {label}
                              </button>
                            ))}
                            {issue.relatedNetLabels.map((label, labelIndex) => (
                              <button
                                key={`net-${label}-${labelIndex}`}
                                type="button"
                                onClick={() => focusIssue(issue)}
                                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#537fb2]"
                              >
                                {label}
                              </button>
                            ))}
                            {issue.relatedComponentLabels.length === 0 && issue.relatedNetLabels.length === 0 ? (
                              <span className="text-[11px] text-[#8d8074]">
                                {t('프로젝트 전체 맥락 이슈', 'Project-wide review item')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {issue.evidence.observedFacts.length > 0 ? (
                        <div className="mt-3 rounded-[12px] border border-[#ece3d8] bg-[#fcfaf6] px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9d8d7f]">
                            {t('관측 사실', 'Observed facts')}
                          </div>
                          <div className="mt-2 space-y-1.5 text-[11px] leading-6 text-[#5d5248]">
                            {issue.evidence.observedFacts.map((item, itemIndex) => (
                              <div key={`${item}-${itemIndex}`}>- {item}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateDecision(issue, 'fixed')}
                          className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[#d8e7da] bg-[#f8fff9] px-3 text-[11px] font-semibold text-[#34764a]"
                        >
                          <Wrench size={12} />
                          {t('수정 완료', 'Resolved')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDecision(issue, 'already-handled')}
                          className="inline-flex h-8 items-center rounded-[10px] border border-[#e4dbcf] bg-white px-3 text-[11px] font-semibold text-[#5f5448]"
                        >
                          {t('이미 반영됨', 'Already handled')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDecision(issue, 'included-in-module')}
                          className="inline-flex h-8 items-center rounded-[10px] border border-[#e4dbcf] bg-white px-3 text-[11px] font-semibold text-[#5f5448]"
                        >
                          {t('모듈 포함', 'Module included')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDecision(issue, 'verified-by-datasheet')}
                          className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[#dce5ef] bg-[#f9fbfe] px-3 text-[11px] font-semibold text-[#4e79ac]"
                        >
                          <FileSearch size={12} />
                          {t('데이터시트 확인', 'Datasheet checked')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDecision(issue, 'false-positive')}
                          className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[#efe1d4] bg-[#fffaf4] px-3 text-[11px] font-semibold text-[#93653c]"
                        >
                          <Flag size={12} />
                          {t('오탐 신고', 'False positive')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {activeIssues.length === 0 ? (
          <section className="rounded-[18px] border border-[#dde8dd] bg-[#fbfffb] px-4 py-8 text-center">
            <div className="text-[16px] font-semibold text-[#34764a]">{t('열린 검토 항목이 없습니다.', 'No open review items.')}</div>
            <div className="mt-2 text-[11px] leading-5 text-[#6d7c6f]">
              {t('수정 완료 또는 오탐 처리된 항목을 제외하면 현재 추가 검토가 필요하지 않습니다.', 'After fixed or false-positive actions, there are no remaining review items.')}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
