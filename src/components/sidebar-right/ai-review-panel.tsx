'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Sparkles, Zap } from 'lucide-react';
import {
  buildSchematicPcbAugmentationCandidates,
  schematicPcbAugmentationDirectionLabel,
} from '@/lib/schematic-pcb-augmentation-candidates';
import { classifyIssueActionBucket } from '@/lib/validation-issue-classification';
import type { ImportedKiCadMapping, ProjectAuditIssue } from '@/types';

type ReviewPanelIssue = ProjectAuditIssue & {
  sourceBucketLabel?: string;
  sourceQualityLabel?: string;
  mappingConfidence?: ImportedKiCadMapping['confidence'];
  mappingSource?: ImportedKiCadMapping['source'];
  lowConfidenceReasons?: string[];
  isConservativeFinding?: boolean;
};

type ReviewItem = {
  id: string;
  severity: ProjectAuditIssue['severity'];
  confidence?: ProjectAuditIssue['confidence'];
  title: string;
  body: string;
  evidenceSummary?: string;
  observedFacts: string[];
  assumptions: string[];
  howToVerify?: string;
  componentName?: string;
  sourceBadges: string[];
  lowConfidenceReasons: string[];
  isConservativeFinding: boolean;
};

function confidenceLabel(confidence: ProjectAuditIssue['confidence']) {
  switch (confidence) {
    case 'confirmed':
      return '확정 오류';
    case 'strong-inference':
      return '강한 추정';
    case 'needs-review':
      return '검토 권장';
    case 'informational':
      return '정보';
    default:
      return null;
  }
}

function toneBySeverity(severity: ProjectAuditIssue['severity']) {
  if (severity === 'error') {
    return {
      icon: <AlertTriangle size={13} className="text-[#c45a5a]" />,
      chip: 'bg-[#fbe8e8] text-[#b24f4f]',
      border: '#efd3d3',
      body: '#7e615b',
    };
  }

  if (severity === 'warning') {
    return {
      icon: <AlertTriangle size={13} className="text-[#b27a1f]" />,
      chip: 'bg-[#fbf0d7] text-[#a57019]',
      border: '#ece0c5',
      body: '#7d6a57',
    };
  }

  return {
    icon: <CheckCircle2 size={13} className="text-[#3f915b]" />,
    chip: 'bg-[#e7f4ea] text-[#34764a]',
    border: '#d8eadc',
    body: '#6f7c6d',
  };
}

function sectionTitleTone(severity: ProjectAuditIssue['severity']) {
  if (severity === 'error') {
    return 'text-[#9f4c4c]';
  }

  if (severity === 'warning') {
    return 'text-[#94641b]';
  }

  return 'text-[#3d7a52]';
}

function decisionLabel(
  errorCount: number,
  warningCount: number,
  hasReviewTarget: boolean
) {
  if (!hasReviewTarget) {
    return {
      label: '검토 대기',
      description: '검토할 파일이 아직 없습니다.',
      className: 'border-[#dce8f3] bg-[#f8fbff] text-[#365f8f]',
    };
  }

  if (errorCount > 0) {
    return {
      label: '수정 필요',
      description: '강한 근거 항목을 먼저 확인하세요.',
      className: 'border-[#efd3d3] bg-[#fff8f8] text-[#a94f4f]',
    };
  }

  if (warningCount > 0) {
    return {
      label: '검토 필요',
      description: '강한 추정과 검토 권장 항목을 확인하세요.',
      className: 'border-[#ece0c5] bg-[#fffdf7] text-[#94641b]',
    };
  }

  return {
    label: '현재 안정적',
    description: '차단 이슈는 보이지 않습니다.',
    className: 'border-[#d8eadc] bg-[#fbfffb] text-[#34764a]',
  };
}

function severityLabel(severity: ProjectAuditIssue['severity']) {
  if (severity === 'error') {
    return '오류';
  }

  if (severity === 'warning') {
    return '경고';
  }

  return '정보';
}

function mappingConfidenceLabel(confidence?: ImportedKiCadMapping['confidence']) {
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

function mappingSourceLabel(source?: ImportedKiCadMapping['source']) {
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

function sourceBadgesForIssue(issue: ReviewPanelIssue) {
  return Array.from(new Set([
    issue.sourceLabel,
    issue.sourceBucketLabel,
    issue.sourceQualityLabel,
    mappingConfidenceLabel(issue.mappingConfidence),
    mappingSourceLabel(issue.mappingSource),
  ].filter((item): item is string => Boolean(item))));
}

function nextActionLine(issue: ProjectAuditIssue | undefined, hasReviewTarget: boolean) {
  if (!hasReviewTarget) {
    return '기존 KiCad 회로도 또는 PCB 파일을 열면 검토가 시작됩니다.';
  }

  if (!issue) {
    return '차단 이슈는 없습니다. 리포트로 내보내기 전에 실제 배선과 전원 입력 조건만 한 번 더 확인하세요.';
  }

  const target = issue.componentName ? `${issue.componentName}: ` : '';
  return `${target}${issue.recommendation ?? issue.evidence?.howToVerify ?? issue.message}`;
}

export function AiReviewPanel({
  projectName,
  boardName,
  fileLabel,
  hasReviewTarget,
  issues,
  onSelectIssue,
}: {
  projectName: string;
  boardName: string;
  fileLabel: string;
  hasReviewTarget: boolean;
  issues: ReviewPanelIssue[];
  onSelectIssue: (issue: ReviewPanelIssue) => void;
}) {
  const actionCounts = issues.reduce(
    (counts, issue) => {
      counts[classifyIssueActionBucket(issue)] += 1;
      return counts;
    },
    {
      'must-fix': 0,
      review: 0,
      info: 0,
    }
  );
  const errorCount = actionCounts['must-fix'];
  const warningCount = actionCounts.review;
  const infoCount = actionCounts.info;
  const lead = issues[0];
  const decision = decisionLabel(errorCount, warningCount, hasReviewTarget);
  const actionLine = nextActionLine(lead, hasReviewTarget);
  const augmentationCandidates = hasReviewTarget ? buildSchematicPcbAugmentationCandidates(issues) : [];
  const visibleItems: ReviewItem[] =
    !hasReviewTarget
      ? [
          {
            id: 'waiting-for-file',
            severity: 'info',
            title: '파일을 먼저 열어주세요',
            body: '빈 작업공간에서는 분석 결과를 판단하지 않습니다. `.kicad_sch` 또는 `.kicad_pcb` 파일을 열면 검토 항목이 표시됩니다.',
            observedFacts: [],
            assumptions: [],
            sourceBadges: [],
            lowConfidenceReasons: [],
            isConservativeFinding: false,
          },
        ]
      : issues.length > 0
      ? issues.slice(0, 4).map((issue, index) => ({
          id: `${issue.ruleId ?? issue.title}-${index}`,
          severity: issue.severity,
          confidence: issue.confidence,
          title: issue.title,
          body: issue.message,
          evidenceSummary: issue.evidence?.evidenceSummary,
          observedFacts: issue.evidence?.observedFacts ?? [],
          assumptions: issue.evidence?.assumptions ?? [],
          howToVerify: issue.evidence?.howToVerify ?? issue.recommendation,
          componentName: issue.componentName,
          sourceBadges: sourceBadgesForIssue(issue),
          lowConfidenceReasons: issue.lowConfidenceReasons ?? [],
          isConservativeFinding: Boolean(issue.isConservativeFinding),
        }))
      : [
          {
            id: 'passed',
            severity: 'info',
            title: '차단 이슈 없음',
            body: '현재 눈에 띄는 차단 이슈가 없습니다. 배치와 코드 연결만 한 번 더 확인하면 됩니다.',
            observedFacts: [],
            assumptions: [],
            sourceBadges: [],
            lowConfidenceReasons: [],
            isConservativeFinding: false,
          },
        ];

  return (
    <div className="flex h-full flex-col bg-[#fdfaf5]">
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a19386]">
              AI 감수
            </div>
            <div className="mt-1 text-[15px] font-semibold text-[#3f342c]">
              {projectName || '새 회로'}
            </div>
          </div>
          <div className="max-w-[132px] truncate rounded-full bg-[#efe8dc] px-2.5 py-1 text-[10px] font-semibold text-[#7c6d60]" title={boardName}>
            {!hasReviewTarget ? '파일 대기' : boardName === 'Imported schematic' ? '가져온 회로도' : boardName}
          </div>
        </div>
        <div className="mt-3 rounded-[14px] border border-[#eadfce] bg-white px-3 py-3">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="mt-0.5 text-[#537fb2]" />
            <div className="min-w-0">
              <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${decision.className}`}>
                {decision.label}
              </div>
              <div className="mt-2 text-[11px] font-semibold text-[#43372f]">
                {decision.description}
              </div>
              <div className="mt-2 rounded-[10px] border border-[#dce8f3] bg-[#f8fbff] px-2.5 py-2 text-[11px] font-semibold leading-5 text-[#365f8f]">
                {actionLine}
              </div>
              <div className="mt-1 text-[10px] leading-5 text-[#918375]">
                {fileLabel}
              </div>
              {lead ? (
                <div className="mt-2 text-[10px] leading-5 text-[#6f6359]">
                  {lead.componentName ? `${lead.componentName} · ` : ''}
                  {lead.evidence?.evidenceSummary ?? lead.message}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {hasReviewTarget ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[12px] border border-[#edd8d8] bg-[#fff8f8] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">수정 필요</div>
              <div data-testid="editor-error-count" className="mt-1 text-[16px] font-semibold text-[#b24f4f]">{errorCount}</div>
            </div>
            <div className="rounded-[12px] border border-[#ece2cf] bg-[#fffdf7] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">확인 필요</div>
              <div data-testid="editor-warning-count" className="mt-1 text-[16px] font-semibold text-[#a57019]">{warningCount}</div>
            </div>
            <div className="rounded-[12px] border border-[#dde8dd] bg-[#fbfffb] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">정보</div>
              <div data-testid="editor-info-count" className="mt-1 text-[16px] font-semibold text-[#34764a]">{infoCount}</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {augmentationCandidates.length > 0 ? (
          <section className="mb-4 rounded-[14px] border border-[#d9c9b8] bg-[#fffaf2] px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9b8066]">
                  회로도 ↔ PCB 보강 후보
                </div>
                <div className="mt-1 text-[11px] leading-5 text-[#6a5a4c]">
                  자동 반영 없이 누락/불일치 후보만 기록합니다.
                </div>
              </div>
              <div className="rounded-full border border-[#d4c2ae] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6f5235]">
                {augmentationCandidates.length}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {augmentationCandidates.slice(0, 5).map(candidate => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectIssue(candidate.sourceIssue)}
                  className="w-full rounded-[12px] border border-[#eadfce] bg-white px-3 py-2.5 text-left transition hover:border-[#d6cab8] hover:bg-[#fffdfa]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#efe5d8] px-2 py-0.5 text-[10px] font-semibold text-[#6f5235]">
                      {schematicPcbAugmentationDirectionLabel(candidate.direction)}
                    </span>
                    <span className="rounded-full bg-[#edf4fb] px-2 py-0.5 text-[10px] font-semibold text-[#496f9e]">
                      후보 기록됨
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-[#43372f]">
                    {candidate.targetLabel} · {candidate.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-[1.55] text-[#76685b]">
                    {candidate.suggestedAction}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
          <Zap size={12} className="text-[#537fb2]" />
          {hasReviewTarget ? '감수 항목' : '다음 단계'}
        </div>
        <div className="space-y-2.5">
          {visibleItems.map((item, index) => {
            const sourceIssue = issues[index];
            const tone = toneBySeverity(item.severity);
            const sectionTone = sectionTitleTone(item.severity);
            const visibleFacts = item.observedFacts.slice(0, 4);
            const evidenceLine = item.evidenceSummary ?? item.body;
            const hasDetails =
              item.sourceBadges.length > 0 ||
              visibleFacts.length > 0 ||
              item.assumptions.length > 0 ||
              item.lowConfidenceReasons.length > 0 ||
              Boolean(item.howToVerify);
            return (
              <div
                key={item.id}
                className="w-full rounded-[14px] border bg-white text-left transition hover:border-[#d6cab8] hover:bg-[#fffdfa]"
                style={{ borderColor: tone.border }}
              >
                <button
                  type="button"
                  disabled={!sourceIssue}
                  onClick={() => {
                    if (sourceIssue) {
                      onSelectIssue(sourceIssue);
                    }
                  }}
                  className={`flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left ${sourceIssue ? '' : 'cursor-default'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {tone.icon}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        {severityLabel(item.severity)}
                      </span>
                      {item.confidence ? (
                        <span className="rounded-full bg-[#f4eee7] px-2 py-0.5 text-[10px] font-semibold text-[#806f60]">
                          {confidenceLabel(item.confidence)}
                        </span>
                      ) : null}
                      {item.sourceBadges.slice(0, 3).map(badge => (
                        <span key={badge} className="rounded-full bg-[#edf4fb] px-2 py-0.5 text-[10px] font-semibold text-[#496f9e]">
                          {badge}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-[12px] font-semibold leading-5 text-[#43372f]">
                      {item.componentName ? `${item.componentName} — ${item.title}` : item.title}
                    </div>
                    <div className={`mt-1 text-[10px] leading-[1.55] ${sourceIssue ? 'line-clamp-2' : ''}`} style={{ color: tone.body }}>
                      {evidenceLine}
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-[#6f7f9a]">
                      {sourceIssue ? '항목 위치 보기' : '파일을 열면 자동으로 채워집니다'}
                    </div>
                  </div>
                  {sourceIssue ? <ChevronRight size={14} className="mt-0.5 shrink-0 text-[#b3a79a]" /> : null}
                </button>
                {hasDetails ? (
                  <details className="group border-t border-[#f0e7dc] px-3.5 pb-3 pt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold text-[#8a7868]">
                      <ChevronDown size={12} className="transition group-open:rotate-180" />
                      근거 상세
                    </summary>
                    {item.sourceBadges.length > 0 ? (
                      <div className="mt-2">
                        <div className={`text-[10px] font-semibold ${sectionTone}`}>출처 / 신뢰 축</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {item.sourceBadges.map(badge => (
                            <span key={badge} className="rounded-full border border-[#e7dccf] bg-[#fffdf9] px-2 py-0.5 text-[10px] font-semibold text-[#6f6359]">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {visibleFacts.length > 0 ? (
                      <div className="mt-2">
                        <div className={`text-[10px] font-semibold ${sectionTone}`}>관측 사실</div>
                        <div className="mt-1 space-y-1 text-[10px] leading-[1.55] text-[#6f6359]">
                          {visibleFacts.map((fact, factIndex) => (
                            <div key={`${fact}-${factIndex}`}>- {fact}</div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.assumptions.length > 0 ? (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold text-[#8b745f]">가정</div>
                        <div className="mt-1 space-y-1 text-[10px] leading-[1.55] text-[#7a6d61]">
                          {item.assumptions.slice(0, 3).map((assumption, assumptionIndex) => (
                            <div key={`${assumption}-${assumptionIndex}`}>- {assumption}</div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.isConservativeFinding && item.lowConfidenceReasons.length > 0 ? (
                      <div className="mt-2 rounded-[10px] border border-[#eadfcb] bg-[#fbf7f0] px-2.5 py-2 text-[10px] leading-[1.55] text-[#6f6359]">
                        <div className="font-semibold text-[#6d5944]">보수적 판단 이유</div>
                        <div className="mt-1 space-y-1">
                          {item.lowConfidenceReasons.map((reason, reasonIndex) => (
                            <div key={`${reason}-${reasonIndex}`}>- {reason}</div>
                          ))}
                        </div>
                        <div className="mt-1 text-[#8b7a68]">
                          정확한 SKU/MPN 또는 원본 KiCad 소스를 넣으면 판단 정확도가 올라갑니다.
                        </div>
                      </div>
                    ) : null}
                    {item.howToVerify ? (
                      <div className="mt-2 rounded-[10px] border border-[#ebe1d4] bg-[#fcfaf6] px-2.5 py-2 text-[10px] leading-[1.55] text-[#5f554d]">
                        <span className="font-semibold text-[#4f443b]">확인 방법</span>
                        {' · '}
                        {item.howToVerify}
                      </div>
                    ) : null}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
