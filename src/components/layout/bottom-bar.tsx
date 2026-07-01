'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, FileText, ListChecks, Share2, X, XCircle } from 'lucide-react';
import type { ImportedKiCadMapping, ProjectAuditIssue } from '@/types';

type BottomBarIssue = ProjectAuditIssue & {
  relatedComponentLabels?: string[];
  relatedNetLabels?: string[];
  sourceBucketLabel?: string;
  sourceQualityLabel?: string;
  mappingConfidence?: ImportedKiCadMapping['confidence'];
  mappingSource?: ImportedKiCadMapping['source'];
  lowConfidenceReasons?: string[];
  isConservativeFinding?: boolean;
};

type IssueListMode = 'error' | 'warning' | 'erc';

function Divider() {
  return <span className="h-3 w-px bg-[#ddd5ca]" aria-hidden="true" />;
}

function issueTone(severity: ProjectAuditIssue['severity']) {
  if (severity === 'error') {
    return {
      icon: <XCircle size={12} />,
      label: '오류',
      chip: 'bg-[#fbe7e7] text-[#b24f4f]',
      text: 'text-[#b94747]',
      border: 'border-[#efd2d2]',
      bg: 'bg-[#fff8f8]',
    };
  }

  if (severity === 'warning') {
    return {
      icon: <AlertTriangle size={12} />,
      label: '경고',
      chip: 'bg-[#fbefd3] text-[#a57019]',
      text: 'text-[#b67b17]',
      border: 'border-[#eadcbd]',
      bg: 'bg-[#fffdf7]',
    };
  }

  return {
    icon: <Check size={12} />,
    label: '정보',
    chip: 'bg-[#e8f4ea] text-[#34764a]',
    text: 'text-[#2f8a46]',
    border: 'border-[#d8eadc]',
    bg: 'bg-[#fbfffb]',
  };
}

function panelTitle(mode: IssueListMode) {
  if (mode === 'error') {
    return '오류 목록';
  }

  if (mode === 'warning') {
    return '경고 목록';
  }

  return 'ERC 이슈 목록';
}

function issueTargetLabel(issue: BottomBarIssue) {
  const components = issue.relatedComponentLabels ?? issue.evidence?.affectedComponents ?? issue.visualTargets?.componentIds ?? [];
  const nets = issue.relatedNetLabels ?? issue.evidence?.affectedNets ?? issue.visualTargets?.netIds ?? [];
  const componentLabel = issue.componentName ?? components[0];
  const netLabel = nets[0];

  if (componentLabel && netLabel) {
    return `${componentLabel} · ${netLabel}`;
  }

  return componentLabel ?? netLabel ?? issue.boardPin ?? issue.ruleId ?? issue.code ?? '프로젝트 전체';
}

function confidenceLabel(confidence?: ProjectAuditIssue['confidence']) {
  switch (confidence) {
    case 'confirmed':
      return '확정';
    case 'strong-inference':
      return '강한 근거';
    case 'needs-review':
      return '검토';
    case 'informational':
      return '정보';
    default:
      return null;
  }
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
      return 'fallback';
    default:
      return null;
  }
}

function issueBadges(issue: BottomBarIssue) {
  return Array.from(new Set([
    confidenceLabel(issue.confidence),
    issue.sourceBucketLabel,
    issue.sourceQualityLabel,
    mappingConfidenceLabel(issue.mappingConfidence),
    mappingSourceLabel(issue.mappingSource),
  ].filter((item): item is string => Boolean(item))));
}

export function BottomBar({
  errorCount,
  warningCount,
  okLabel,
  hasWorkspaceContent,
  issues,
  onSelectIssue,
  onExportReport,
  onShare,
}: {
  errorCount: number;
  warningCount: number;
  okLabel: string;
  hasWorkspaceContent: boolean;
  issues: BottomBarIssue[];
  onSelectIssue: (issue: BottomBarIssue) => void;
  onExportReport: () => void;
  onShare: () => void;
}) {
  const [openMode, setOpenMode] = useState<IssueListMode | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const filteredIssues = useMemo(() => {
    if (!openMode) {
      return [];
    }

    if (openMode === 'erc') {
      return issues;
    }

    return issues.filter(issue => issue.severity === openMode);
  }, [issues, openMode]);

  useEffect(() => {
    if (!openMode) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }

      setOpenMode(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMode(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMode]);

  const toggleMode = (mode: IssueListMode) => {
    if (!hasWorkspaceContent) {
      return;
    }

    setOpenMode(current => current === mode ? null : mode);
  };

  return (
    <footer ref={rootRef} className="relative flex h-[38px] items-center justify-between border-t border-[#e3d7c9] bg-[#fbf8f3] px-4 text-[11px]">
      {openMode ? (
        <div className="absolute bottom-[calc(100%+8px)] left-3 z-50 w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[16px] border border-[#d9cdbd] bg-[#fffdf9] shadow-[0_22px_70px_rgba(76,58,42,0.18)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#eadfd1] bg-[#fbf6ef] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#3f342c]">
                <ListChecks size={14} className="text-[#6d8db4]" />
                {panelTitle(openMode)}
              </div>
              <div className="mt-1 text-[10px] text-[#8a7a6b]">
                {filteredIssues.length > 0 ? `${filteredIssues.length}개 항목` : '표시할 항목이 없습니다.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenMode(null)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8a7a6b] transition hover:bg-[#efe5d8] hover:text-[#4f4339]"
              aria-label="닫기"
            >
              <X size={13} />
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-2.5">
            {filteredIssues.length > 0 ? (
              <div className="space-y-2">
                {filteredIssues.map((issue, index) => {
                  const tone = issueTone(issue.severity);
                  const evidenceLine = issue.evidence?.evidenceSummary ?? issue.message;
                  const badges = issueBadges(issue);
                  const conservativeReason = issue.isConservativeFinding
                    ? issue.lowConfidenceReasons?.[0]
                    : null;
                  return (
                    <button
                      type="button"
                      key={`${issue.ruleId ?? issue.code ?? issue.title}-${index}`}
                      onClick={() => {
                        onSelectIssue(issue);
                        setOpenMode(null);
                      }}
                      className={`flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left transition hover:border-[#cdbda8] hover:bg-[#fffaf3] ${tone.border} ${tone.bg}`}
                    >
                      <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        {tone.icon}
                        {tone.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-[#40352d]">
                          {issue.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#6d7f9a]">
                          {issueTargetLabel(issue)}
                        </span>
                        {badges.length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {badges.slice(0, 4).map(badge => (
                              <span key={badge} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#75685d]">
                                {badge}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        <span className="mt-1 line-clamp-2 block text-[10px] leading-[1.55] text-[#76675a]">
                          {evidenceLine}
                        </span>
                        {conservativeReason ? (
                          <span className="mt-1 line-clamp-1 block text-[10px] leading-[1.55] text-[#8a765c]">
                            보수적 판단: {conservativeReason}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight size={14} className="mt-1 shrink-0 text-[#b5a797]" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[12px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-6 text-center text-[11px] font-semibold text-[#7d6e61]">
                선택한 분류에는 현재 항목이 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-[#6c6056]">
        <button
          type="button"
          onClick={() => toggleMode('error')}
          disabled={!hasWorkspaceContent}
          className={`inline-flex h-7 items-center gap-1 rounded-[9px] px-2 font-semibold text-[#b94747] transition hover:bg-[#fbeaea] disabled:cursor-default disabled:opacity-45 ${openMode === 'error' ? 'bg-[#fbeaea]' : ''}`}
          aria-expanded={openMode === 'error'}
        >
          <XCircle size={12} />
          오류 {errorCount}
        </button>
        <Divider />
        <button
          type="button"
          onClick={() => toggleMode('warning')}
          disabled={!hasWorkspaceContent}
          className={`inline-flex h-7 items-center gap-1 rounded-[9px] px-2 font-semibold text-[#b67b17] transition hover:bg-[#fbf0d7] disabled:cursor-default disabled:opacity-45 ${openMode === 'warning' ? 'bg-[#fbf0d7]' : ''}`}
          aria-expanded={openMode === 'warning'}
        >
          <AlertTriangle size={12} />
          경고 {warningCount}
        </button>
        <Divider />
        <button
          type="button"
          onClick={() => toggleMode('erc')}
          disabled={!hasWorkspaceContent}
          className={`inline-flex h-7 items-center gap-1 rounded-[9px] px-2 font-semibold text-[#2f8a46] transition hover:bg-[#e7f4ea] disabled:cursor-default disabled:opacity-60 ${openMode === 'erc' ? 'bg-[#e7f4ea]' : ''}`}
          aria-expanded={openMode === 'erc'}
        >
          <Check size={12} />
          {okLabel}
        </button>
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <button
          type="button"
          onClick={onExportReport}
          disabled={!hasWorkspaceContent}
          className="inline-flex items-center gap-1 text-[#847568] transition hover:text-[#4f4339] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <FileText size={12} />
          리포트 내보내기
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={!hasWorkspaceContent}
          className="inline-flex items-center gap-1 text-[#847568] transition hover:text-[#4f4339] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Share2 size={12} />
          공유
        </button>
      </div>
    </footer>
  );
}
