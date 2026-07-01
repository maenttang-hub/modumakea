'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ClipboardCopy, Download, PackagePlus, ShieldAlert, Sparkles } from 'lucide-react';

type Translator = (ko: string, en: string) => string;

type ValidationTabKey = 'drc' | 'ai' | 'recommendations' | 'bom';

export function ValidationReportHeaderSection({
  importedSectionStyle,
  importedActionButtonStyle,
  importedCardStyle,
  importedMutedTextStyle,
  importedStrongTextStyle,
  importedReportPreviewStyle,
  uiDebugMode,
  verificationReport,
  formalSummaryIssueCount,
  projectName,
  activeBoardName,
  cloudLastValidationJobId,
  cloudLastSavedAt,
  appLanguage,
  t,
  onCopyReport,
  onDownloadReport,
}: {
  importedSectionStyle?: CSSProperties;
  importedActionButtonStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  importedStrongTextStyle?: CSSProperties;
  importedReportPreviewStyle?: CSSProperties;
  uiDebugMode: boolean;
  verificationReport: {
    status: 'critical' | 'warning' | 'passed';
    errorCount: number;
    warningCount: number;
    reportId: string;
    markdown: string;
  };
  formalSummaryIssueCount: number;
  projectName: string;
  activeBoardName: string;
  cloudLastValidationJobId?: string | null;
  cloudLastSavedAt?: string | null;
  appLanguage: string;
  t: Translator;
  onCopyReport: () => void;
  onDownloadReport: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-3.5 rounded-[18px] border p-4" style={importedSectionStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b8f82]" style={importedMutedTextStyle}>
              <ShieldAlert size={11} className="text-[#22c55e]" />
              {t('회로 검증 상태', 'Circuit review status')}
            </div>
            <div className="mt-2 text-[14px] font-semibold leading-5 text-[#3f342c]" style={importedStrongTextStyle}>
              {verificationReport.status === 'critical'
                ? t('먼저 고쳐야 할 충돌이 있습니다.', 'Blocking issues need attention first.')
                : verificationReport.status === 'warning'
                  ? t('제작 전 다시 볼 항목이 남아 있습니다.', 'A few items still need review before build.')
                  : t('지금 단계에서는 큰 차단 이슈가 없습니다.', 'No blocking issue is standing in the way right now.')}
            </div>
            <div className="mt-1 text-[11px] text-[#9b8f82]" style={importedMutedTextStyle}>
              {projectName || 'Untitled Project'} · {activeBoardName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onCopyReport}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e4dbcf] bg-[#fffdfa] text-[#8d8074] transition-colors hover:border-[#cdbfaa] hover:text-[#5f5246]"
              style={importedActionButtonStyle}
              title={t('검증 리포트 복사', 'Copy verification report')}
            >
              <ClipboardCopy size={13} />
            </button>
            <button
              type="button"
              onClick={onDownloadReport}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e4dbcf] bg-[#fffdfa] text-[#8d8074] transition-colors hover:border-[#cdbfaa] hover:text-[#5f5246]"
              style={importedActionButtonStyle}
              title={t('검증 리포트 저장', 'Save verification report')}
            >
              <Download size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[14px] border px-3 py-2.5" style={importedCardStyle}>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[#9b8f82]" style={importedMutedTextStyle}>{t('수정 필요', 'Must fix')}</span>
            <span className={verificationReport.errorCount > 0 ? 'font-bold text-[#fca5a5]' : 'font-bold text-[#86efac]'}>
              {verificationReport.errorCount}
            </span>
          </div>
          <div className="rounded-[14px] border px-3 py-2.5" style={importedCardStyle}>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[#9b8f82]" style={importedMutedTextStyle}>{t('확인 필요', 'Needs review')}</span>
            <span className={verificationReport.warningCount > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
              {verificationReport.warningCount}
            </span>
          </div>
          <div className="rounded-[14px] border px-3 py-2.5" style={importedCardStyle}>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[#9b8f82]" style={importedMutedTextStyle}>{t('코드 논리', 'Code logic')}</span>
            <span className={formalSummaryIssueCount > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
              {formalSummaryIssueCount}
            </span>
          </div>
        </div>

        {cloudLastValidationJobId ? (
          <div className="rounded-[14px] border px-3 py-2.5 text-[10px]" style={importedCardStyle}>
            <span className="text-[#9b8f82]" style={importedMutedTextStyle}>
              {t('최근 저장된 검증', 'Latest saved review')}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#4a3f36]" style={importedStrongTextStyle}>
                {cloudLastValidationJobId}
              </span>
              {cloudLastSavedAt ? (
                <span className="text-[#9b8f82]" style={importedMutedTextStyle}>
                  {new Date(cloudLastSavedAt).toLocaleString(appLanguage === 'ko' ? 'ko-KR' : 'en-US', {
                    hour12: false,
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {uiDebugMode ? (
          <pre
            className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-[10px] leading-relaxed text-slate-300"
            style={importedReportPreviewStyle}
          >
            {verificationReport.markdown.split('\n').slice(0, 24).join('\n')}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

export function ValidationPanelTabBar({
  activeTab,
  setActiveTab,
  importedSchematicMode,
  importedPalette,
  aiSemanticIssueCount,
  recommendationCount,
  bomCount,
  t,
}: {
  activeTab: ValidationTabKey;
  setActiveTab: (tab: ValidationTabKey) => void;
  importedSchematicMode: boolean;
  importedPalette: {
    shellBorder: string;
    shellPanelBackground?: string;
  };
  aiSemanticIssueCount: number;
  recommendationCount: number;
  bomCount: number;
  t: Translator;
}) {
  return (
    <div
      className="mb-3 flex border-b border-[#e8dfd3] py-1"
      style={importedSchematicMode ? {
        borderColor: importedPalette.shellBorder,
        backgroundColor: importedPalette.shellPanelBackground ? `${importedPalette.shellPanelBackground}dd` : undefined,
      } : undefined}
    >
      <ValidationPanelTabButton
        active={activeTab === 'drc'}
        label={t('핵심 확인', 'Key checks')}
        onClick={() => setActiveTab('drc')}
        icon={<ShieldAlert size={12} />}
      />
      <ValidationPanelTabButton
        active={activeTab === 'ai'}
        label={t('더 보기', 'More')}
        onClick={() => setActiveTab('ai')}
        icon={<Sparkles size={12} />}
        count={aiSemanticIssueCount}
        countTone="amber"
      />
      <ValidationPanelTabButton
        active={activeTab === 'recommendations'}
        label={t('부품 추천', 'Recommendations')}
        onClick={() => setActiveTab('recommendations')}
        icon={<PackagePlus size={12} />}
        count={recommendationCount}
        countTone="blue"
      />
      <ValidationPanelTabButton
        active={activeTab === 'bom'}
        label={t('주문 목록', 'Parts list')}
        onClick={() => setActiveTab('bom')}
        icon={<PackagePlus size={12} />}
        count={bomCount}
        countTone="violet"
      />
    </div>
  );
}

function ValidationPanelTabButton({
  active,
  label,
  onClick,
  icon,
  count,
  countTone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
  count?: number;
  countTone?: 'amber' | 'blue' | 'violet';
}) {
  const toneClass =
    countTone === 'amber'
      ? 'bg-[#fff1c9] border-[#f0d79e] text-[#9a6a0f]'
      : countTone === 'blue'
        ? 'bg-[#deecfb] border-[#bfd4ef] text-[#2f5d91]'
        : 'bg-[#efe2fb] border-[#dcc8f3] text-[#7c4cc2]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-2 pt-1 text-center text-xs font-semibold transition-all duration-200 ${
        active
          ? 'border-[#2f5d91] text-[#3f342c]'
          : 'border-transparent text-[#9b8f82] hover:text-[#5f5246]'
      }`}
    >
      {icon}
      {label}
      {count ? (
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${toneClass}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
