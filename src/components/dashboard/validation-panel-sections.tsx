'use client';

import type { CSSProperties } from 'react';
import { PackagePlus } from 'lucide-react';

type Tone = {
  bg: string;
  border: string;
  text: string;
};

type SummaryGroup = {
  key: string;
  title: string;
  description: string;
  nextFocus: string;
  targetItems: string[];
  datasheetItems: string[];
  severity: 'error' | 'warning' | 'info';
  count: number;
  componentNames: string[];
  spotlightComponent?: string;
  spotlightHeadline?: string;
  spotlightCue?: string;
  spotlightWhyShort?: string;
  spotlightReason?: string;
};

type BomItem = {
  key: string;
  category: string;
  model: string;
  count: number;
  instanceIds: string[];
};

export function ValidationIssueSummaryList({
  groups,
  importedCardStyle,
  importedMutedTextStyle,
  importedStrongTextStyle,
  resolveTone,
  t,
}: {
  groups: SummaryGroup[];
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  importedStrongTextStyle?: CSSProperties;
  resolveTone: (severity: SummaryGroup['severity']) => Tone;
  t: (ko: string, en: string) => string;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {groups.map(group => {
        const tone = resolveTone(group.severity);

        return (
          <div
            key={group.key}
            className="rounded-xl border px-2.5 py-2"
            style={{
              background: tone.bg,
              borderColor: tone.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold" style={{ color: tone.text }}>
                {group.title}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200">
                {group.count}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400" style={importedMutedTextStyle}>
              {group.description}
            </p>
            <div className="mt-2 rounded border border-slate-800/90 bg-slate-950/30 px-2 py-2 text-[10px] leading-relaxed text-slate-200" style={importedCardStyle}>
              {group.nextFocus}
            </div>

            {group.spotlightComponent ? (
              <div className="mt-2 rounded border border-amber-800/50 bg-amber-950/20 px-2 py-2 text-[10px] leading-relaxed text-amber-100">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{t('먼저 볼 1순위 부품', 'First component to inspect')}</span>
                  <span>{group.spotlightComponent}</span>
                </div>
                {group.spotlightHeadline ? (
                  <div className="mt-1 inline-flex max-w-full rounded-full border border-amber-700/60 bg-amber-950/35 px-2 py-1 text-[10px] font-semibold text-amber-100">
                    {group.spotlightHeadline}
                  </div>
                ) : null}
                {group.spotlightCue ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-100/95">{group.spotlightCue}</div>
                ) : null}
                {group.spotlightWhyShort ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/95">
                    <span className="font-semibold text-amber-100">{t('핵심', 'Key')}</span>
                    <span className="ml-1">{group.spotlightWhyShort}</span>
                  </div>
                ) : null}
                {group.spotlightReason ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-100">{t('1순위 사유', 'Priority reason')}</span>
                    <span className="ml-1">{group.spotlightReason}</span>
                  </div>
                ) : null}
                {group.datasheetItems.length > 0 ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-100">{t('먼저 펼칠 표 / 정격', 'Open this table / rating first')}</span>
                    <span className="ml-1">{group.datasheetItems[0]}</span>
                  </div>
                ) : null}
                {group.targetItems.length > 0 ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-100">{t('먼저 볼 단자 / 경로', 'Check this terminal / path first')}</span>
                    <span className="ml-1">{group.targetItems[0]}</span>
                  </div>
                ) : null}
                {group.componentNames.length > 1 ? (
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/80">
                    <span className="font-semibold text-amber-100">{t('다음으로 같이 볼 부품', 'Next parts to inspect')}</span>
                    <span className="ml-1">{group.componentNames.filter(name => name !== group.spotlightComponent).slice(0, 2).join(', ')}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {group.targetItems.length > 0 ? (
              <div className="mt-2 rounded border border-slate-800/90 bg-slate-950/25 px-2 py-2 text-[10px] leading-relaxed text-slate-300" style={importedCardStyle}>
                <div className="font-semibold text-slate-200" style={importedStrongTextStyle}>
                  {t('먼저 볼 단자 / 경로', 'Check these terminals / paths first')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.targetItems.map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-700/80 bg-slate-950/55 px-2 py-1 text-[10px] text-slate-200"
                      style={importedCardStyle}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {group.datasheetItems.length > 0 ? (
              <div className="mt-2 rounded border border-slate-800/90 bg-slate-950/25 px-2 py-2 text-[10px] leading-relaxed text-slate-300" style={importedCardStyle}>
                <div className="font-semibold text-slate-200" style={importedStrongTextStyle}>
                  {t('먼저 펼칠 데이터시트 표', 'Open these datasheet tables first')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.datasheetItems.map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-700/80 bg-slate-950/55 px-2 py-1 text-[10px] text-slate-200"
                      style={importedCardStyle}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {group.componentNames.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.componentNames.slice(0, 5).map(name => (
                  <span
                    key={name}
                    className="rounded-full border border-slate-700/80 bg-slate-950/55 px-2 py-1 text-[10px] text-slate-200"
                    style={importedCardStyle}
                  >
                    {name}
                  </span>
                ))}
                {group.componentNames.length > 5 ? (
                  <span className="rounded-full border border-slate-700/80 bg-slate-950/55 px-2 py-1 text-[10px] text-slate-400" style={importedCardStyle}>
                    +{group.componentNames.length - 5}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ValidationBomSection({
  panelSectionClassName,
  panelCardClassName,
  importedSectionStyle,
  importedCardStyle,
  importedMutedTextStyle,
  importedStrongTextStyle,
  totalBomKinds,
  totalBomQuantity,
  totalAllBomKinds,
  totalAllBomQuantity,
  activeBomFilterLabel,
  activeBomSortLabel,
  bomFilterMode,
  bomSortMode,
  bomSearchQuery,
  hasBomSearch,
  filteredBomItems,
  setBomFilterMode,
  setBomSortMode,
  setBomSearchQuery,
  highlightBomGroupOnCanvas,
  emitReviewFocus,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  importedSectionStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  importedStrongTextStyle?: CSSProperties;
  totalBomKinds: number;
  totalBomQuantity: number;
  totalAllBomKinds: number;
  totalAllBomQuantity: number;
  activeBomFilterLabel: string;
  activeBomSortLabel: string;
  bomFilterMode: 'all' | 'sensor' | 'power' | 'passive';
  bomSortMode: 'count-desc' | 'name-asc' | 'category-asc';
  bomSearchQuery: string;
  hasBomSearch: boolean;
  filteredBomItems: BomItem[];
  setBomFilterMode: (mode: 'all' | 'sensor' | 'power' | 'passive') => void;
  setBomSortMode: (mode: 'count-desc' | 'name-asc' | 'category-asc') => void;
  setBomSearchQuery: (value: string) => void;
  highlightBomGroupOnCanvas: (instanceIds: string[], label: string) => void;
  emitReviewFocus: (detail: {
    source: 'review';
    interaction: 'hover' | 'clear';
    componentInstanceIds?: string[];
    componentInstanceId?: string;
    componentName?: string;
    severity?: 'info';
    title?: string;
    message?: string;
  }) => void;
  t: (ko: string, en: string) => string;
}) {
  const previewItems = filteredBomItems.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className={`${panelSectionClassName} space-y-3`} style={importedSectionStyle}>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <PackagePlus size={11} className="text-[#c084fc]" />
          {t('사용한 부품 목록', 'Parts inventory')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className={`${panelCardClassName} flex items-center justify-between`} style={importedCardStyle}>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 block" style={importedMutedTextStyle}>{t('지금 보이는 종류', 'Visible kinds')}</span>
              <span className="text-[10px] text-slate-500 block truncate" style={importedMutedTextStyle}>{activeBomFilterLabel}</span>
            </div>
            <span className="text-[12px] font-bold text-violet-300">{totalBomKinds}</span>
          </div>
          <div className={`${panelCardClassName} flex items-center justify-between`} style={importedCardStyle}>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 block" style={importedMutedTextStyle}>{t('지금 보이는 수량', 'Visible quantity')}</span>
              <span className="text-[10px] text-slate-500 block truncate" style={importedMutedTextStyle}>{t('전체 {{count}}개', 'All {{count}} total').replace('{{count}}', String(totalAllBomQuantity))}</span>
            </div>
            <span className="text-[12px] font-bold text-violet-300">{totalBomQuantity}</span>
          </div>
          <div className={`${panelCardClassName} flex items-center justify-between`} style={importedCardStyle}>
            <span className="text-[10px] text-slate-500" style={importedMutedTextStyle}>{t('정렬 기준', 'Sort')}</span>
            <span className="text-[11px] font-bold text-violet-300">{activeBomSortLabel}</span>
          </div>
          <div className={`${panelCardClassName} flex items-center justify-between`} style={importedCardStyle}>
            <span className="text-[10px] text-slate-500" style={importedMutedTextStyle}>{t('전체 종류', 'All kinds')}</span>
            <span className="text-[12px] font-bold text-violet-300">{totalAllBomKinds}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400" style={importedMutedTextStyle}>
          <span>{t('행을 누르면 캔버스에서 같이 강조됩니다.', 'Click a row to highlight matching parts on the canvas.')}</span>
          <span className="text-[10px] text-slate-500">{t('필요할 때만 필터와 검색을 엽니다.', 'Open filters and search only when needed.')}</span>
        </div>
        <details className="group rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-3">
          <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('필터, 정렬, 검색 열기', 'Open filters, sort, and search')}
          </summary>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">{t('필터', 'Filter')}</span>
              {([
                ['all', t('전체', 'All')],
                ['sensor', t('센서', 'Sensor')],
                ['power', t('전원', 'Power')],
                ['passive', t('수동소자', 'Passive')],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBomFilterMode(mode)}
                  className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                    bomFilterMode === mode
                      ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">{t('정렬', 'Sort')}</span>
              {([
                ['count-desc', t('수량순', 'Qty')],
                ['name-asc', t('이름순', 'Name')],
                ['category-asc', t('종류순', 'Type')],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBomSortMode(mode)}
                  className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                    bomSortMode === mode
                      ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[11px] text-slate-300" style={importedCardStyle}>
            <span className="text-[10px] text-slate-500" style={importedMutedTextStyle}>{t('검색', 'Search')}</span>
            <input
              value={bomSearchQuery}
              onChange={(event) => setBomSearchQuery(event.target.value)}
              placeholder={t('부품명, 값, 풋프린트', 'Part, value, footprint')}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-500"
            />
            </label>
            <div className="text-[10px] text-slate-500" style={importedMutedTextStyle}>
              {hasBomSearch
                ? t('{{count}}개 검색됨', '{{count}} matches').replace('{{count}}', String(filteredBomItems.length))
                : t('수량순이 가장 빨리 훑기 좋습니다.', 'Qty sort is the fastest way to scan.')}
            </div>
          </div>
        </details>
        {filteredBomItems.length === 0 ? (
          <div className={`${panelCardClassName} text-[11px] text-slate-400`} style={importedCardStyle}>
            {hasBomSearch
              ? t('검색에 맞는 부품이 없습니다.', 'No parts matched your search.')
              : t('이 필터에 맞는 부품이 없습니다.', 'There are no parts for this filter yet.')}
          </div>
        ) : (
          <div className="space-y-2">
            {previewItems.map(item => (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => {
                  emitReviewFocus({
                    source: 'review',
                    interaction: 'hover',
                    componentInstanceIds: item.instanceIds,
                    componentInstanceId: item.instanceIds[0],
                    componentName: item.model,
                    severity: 'info',
                    title: t('부품 묶음 미리보기', 'Preview part group'),
                    message: item.model,
                  });
                }}
                onMouseLeave={() => emitReviewFocus({ source: 'review', interaction: 'clear' })}
                onClick={() => highlightBomGroupOnCanvas(item.instanceIds, item.model)}
                className={`${panelCardClassName} w-full text-left transition-colors hover:border-violet-400/40 hover:text-slate-100`}
                style={importedCardStyle}
              >
                <div className="grid grid-cols-[84px_1fr_48px] gap-3 items-start">
                  <div className="text-[10px] font-bold text-slate-500" style={importedMutedTextStyle}>
                    {item.category}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-slate-200" style={importedStrongTextStyle}>
                      {item.model}
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-bold text-violet-300">
                    {item.count}
                  </div>
                </div>
              </button>
            ))}
            {filteredBomItems.length > previewItems.length ? (
              <div className={`${panelCardClassName} text-[11px] text-slate-400`} style={importedCardStyle}>
                {t('{{count}}개가 더 있습니다. 필터/정렬을 열어 자세히 볼 수 있습니다.', '{{count}} more items are available. Open filters to inspect the full list.')
                  .replace('{{count}}', String(filteredBomItems.length - previewItems.length))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
