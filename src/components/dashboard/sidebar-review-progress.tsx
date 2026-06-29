'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Check, ChevronLeft, ShieldCheck } from 'lucide-react';
import { pickLanguage } from '@/lib/ui-language';
import type { AppLanguage } from '@/types';

type ReviewModeCard = {
  id: 'circuit' | 'code' | 'combined';
  title: string;
  detail: string;
  active: boolean;
};

type ReviewSummary = {
  boardName: string;
  partCount: number;
  issueCount: number;
  codeReady: boolean;
};

type Props = {
  appLanguage: AppLanguage;
  boardName: string;
  componentsCount: number;
  issueCount: number;
  reviewSummary?: ReviewSummary;
  reviewModes?: ReviewModeCard[];
  onSelectReviewMode?: (modeId: 'circuit' | 'code' | 'combined') => void;
  onCollapse?: () => void;
};

export function SidebarReviewProgress({
  appLanguage,
  boardName,
  componentsCount,
  issueCount,
  reviewSummary,
  reviewModes,
  onSelectReviewMode,
  onCollapse,
}: Props) {
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });

  const progressSteps = [
    {
      title: t('1. 회로 확인', '1. Schematic'),
      body: t(
        '배선과 부품 배치를 먼저 훑어서 큰 충돌이 없는지 봅니다.',
        'Start by checking the wiring and part layout for broad conflicts.'
      ),
      done: (reviewSummary?.partCount ?? componentsCount) > 0,
    },
    {
      title: t('2. 코드 확인', '2. Code'),
      body: t(
        '오른쪽 패널에서 코드를 붙여넣으면 핀 사용과 회로 연결을 같이 볼 수 있습니다.',
        'Paste code into the right panel to compare pin usage with the schematic.'
      ),
      done: reviewSummary?.codeReady ?? false,
    },
    {
      title: t('3. 회로 검증', '3. Circuit review'),
      body: t(
        '전원, 쇼트, 매핑 누락처럼 제작 전에 막아야 할 문제를 먼저 확인합니다.',
        'Check blocking issues like power conflicts, shorts, and missing mappings first.'
      ),
      done: (reviewSummary?.issueCount ?? issueCount) === 0,
    },
  ];

  return (
    <aside
      data-mm-scope="sidebar-review-progress"
      className="flex h-full w-full flex-col border-r bg-[#080e1d] text-[#e2e8f0]"
      style={{ borderColor: 'rgba(37,99,235,0.15)' }}
    >
      <div className="border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="truncate">{t('검증 진행', 'Review progress')}</span>
          </h2>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
              style={{
                borderColor: '#1f2937',
                background: 'rgba(2,6,23,0.60)',
                color: '#94a3b8',
              }}
              title={t('왼쪽 패널 접기', 'Collapse left panel')}
            >
              <ChevronLeft size={14} />
            </button>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          {t(
            '왼쪽은 진행 흐름만 가볍게 보고, 실제 검토는 가운데 회로와 오른쪽 검증 패널에서 이어갑니다.',
            'Use the left side for lightweight progress only, then do the real review in the canvas and right-side verification panel.'
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3">
            <div className="text-[10px] text-slate-500">{t('도면 부품', 'Parts in view')}</div>
            <div className="mt-2 text-2xl font-bold text-cyan-300">{reviewSummary?.partCount ?? componentsCount}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3">
            <div className="text-[10px] text-slate-500">{t('검토 이슈', 'Issues')}</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">{reviewSummary?.issueCount ?? issueCount}</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {t('현재 기준', 'Current focus')}
          </div>
          <div className="mt-2 text-[12px] font-semibold text-slate-100">
            {reviewSummary?.boardName ?? boardName}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {reviewSummary?.codeReady
              ? t('코드와 회로를 같이 검토할 준비가 됐습니다.', 'Code and schematic are both ready to review.')
              : t('오른쪽 검증 패널에서 코드 검증으로 바로 이어갈 수 있습니다.', 'You can continue straight into code review from the right panel.')}
          </div>
        </div>

        {reviewModes && reviewModes.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {t('검증 흐름', 'Verification flow')}
            </div>
            <div className="mt-2 space-y-2">
              {reviewModes.map(modeItem => (
                <button
                  key={modeItem.id}
                  type="button"
                  onClick={() => onSelectReviewMode?.(modeItem.id)}
                  className="w-full rounded-lg border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: modeItem.active ? 'rgba(56,189,248,0.45)' : '#1f2937',
                    background: modeItem.active ? 'rgba(14,165,233,0.14)' : 'rgba(2,6,23,0.24)',
                    color: modeItem.active ? '#e0f2fe' : '#cbd5e1',
                  }}
                >
                  <div className="text-[11px] font-semibold">{modeItem.title}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                    {modeItem.detail}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {progressSteps.map(step => (
            <div key={step.title} className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  {step.done ? <Check size={13} className="text-emerald-400" /> : <AlertTriangle size={13} className="text-amber-400" />}
                </span>
                <div>
                  <div className="text-[11px] font-semibold text-slate-100">{step.title}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-slate-400">{step.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
