'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Sparkles, Zap } from 'lucide-react';
import type { ProjectAuditIssue } from '@/types';

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

function decisionLabel(errorCount: number, warningCount: number) {
  if (errorCount > 0) {
    return {
      label: '수정 필요',
      description: '확정 오류를 먼저 처리하세요.',
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

export function AiReviewPanel({
  projectName,
  boardName,
  fileLabel,
  issues,
  onSelectIssue,
}: {
  projectName: string;
  boardName: string;
  fileLabel: string;
  issues: ProjectAuditIssue[];
  onSelectIssue: (issue: ProjectAuditIssue) => void;
}) {
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const infoCount = issues.filter(issue => issue.severity === 'info').length;
  const lead = issues[0];
  const decision = decisionLabel(errorCount, warningCount);
  const visibleItems: ReviewItem[] =
    issues.length > 0
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
        }))
      : [
          {
            id: 'passed',
            severity: 'info',
            title: '차단 이슈 없음',
            body: '현재 눈에 띄는 차단 이슈가 없습니다. 배치와 코드 연결만 한 번 더 확인하면 됩니다.',
            observedFacts: [],
            assumptions: [],
          },
        ];

  return (
    <div className="flex h-full flex-col bg-[#fdfaf5]">
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
              AI Review
            </div>
            <div className="mt-1 text-[15px] font-semibold text-[#3f342c]">
              {projectName || '새 회로 리뷰'}
            </div>
          </div>
          <div className="rounded-full bg-[#efe8dc] px-2.5 py-1 text-[10px] font-semibold text-[#7c6d60]">
            {boardName}
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
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-[12px] border border-[#edd8d8] bg-[#fff8f8] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">오류</div>
            <div className="mt-1 text-[16px] font-semibold text-[#b24f4f]">{errorCount}</div>
          </div>
          <div className="rounded-[12px] border border-[#ece2cf] bg-[#fffdf7] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">경고</div>
            <div className="mt-1 text-[16px] font-semibold text-[#a57019]">{warningCount}</div>
          </div>
          <div className="rounded-[12px] border border-[#dde8dd] bg-[#fbfffb] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#ac938b]">정보</div>
            <div className="mt-1 text-[16px] font-semibold text-[#34764a]">{infoCount}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
          <Zap size={12} className="text-[#537fb2]" />
          감수 항목
        </div>
        <div className="space-y-2.5">
          {visibleItems.map((item, index) => {
            const sourceIssue = issues[index];
            const tone = toneBySeverity(item.severity);
            const sectionTone = sectionTitleTone(item.severity);
            const visibleFacts = item.observedFacts.slice(0, 3);
            const evidenceLine = item.evidenceSummary ?? item.body;
            const hasDetails = visibleFacts.length > 0 || item.assumptions.length > 0 || Boolean(item.howToVerify);
            return (
              <div
                key={item.id}
                className="w-full rounded-[14px] border bg-white text-left transition hover:border-[#d6cab8] hover:bg-[#fffdfa]"
                style={{ borderColor: tone.border }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (sourceIssue) {
                      onSelectIssue(sourceIssue);
                    }
                  }}
                  className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left"
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
                    </div>
                    <div className="mt-2 text-[12px] font-semibold leading-5 text-[#43372f]">
                      {item.componentName ? `${item.componentName} — ${item.title}` : item.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-[1.55]" style={{ color: tone.body }}>
                      {evidenceLine}
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-[#6f7f9a]">
                      {sourceIssue ? '항목 위치 보기' : '요약 확인'}
                    </div>
                  </div>
                  <ChevronRight size={14} className="mt-0.5 shrink-0 text-[#b3a79a]" />
                </button>
                {hasDetails ? (
                  <details className="group border-t border-[#f0e7dc] px-3.5 pb-3 pt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold text-[#8a7868]">
                      <ChevronDown size={12} className="transition group-open:rotate-180" />
                      근거 상세
                    </summary>
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
                          {item.assumptions.slice(0, 2).map((assumption, assumptionIndex) => (
                            <div key={`${assumption}-${assumptionIndex}`}>- {assumption}</div>
                          ))}
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
