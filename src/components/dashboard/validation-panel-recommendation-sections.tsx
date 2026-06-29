'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { analyzeComponentForBoard } from '@/lib/datasheet-rules';
import {
  getLocalizedDatasheetStatusLabel,
  getLocalizedDesignWarning,
  getLocalizedTemplateName,
} from '@/lib/catalog-i18n';
import { getCompanionDisplayValue, getCompanionOriginalValueRange, getCompanionValueSelectionHint } from '@/lib/companion-part-display';
import { ExternalLink, FileCheck2, PackagePlus, Sparkles } from 'lucide-react';
import type { AppLanguage, CompanionPartSuggestion } from '@/types';

type Translator = (ko: string, en: string) => string;

type SensorAnalysisEntry = {
  template: (typeof COMPONENT_TEMPLATES)[number];
  analysis: ReturnType<typeof analyzeComponentForBoard>;
};

type AiRecommendation = {
  originalPartName: string;
  recommendedPartName: string;
  compatibilityScore: number;
  estimatedSavings?: string;
  reason: string;
  purchaseLink?: string;
};

type CompanionSummaryItem = {
  key: string;
  kind: string;
  label: string;
  value?: string;
  quantity: number;
  level: 'required' | 'recommended' | 'conditional';
  components: string[];
  note?: string;
};

type CompanionSuggestionEntry = {
  componentName?: string;
  items: CompanionPartSuggestion[];
};

type CompanionReport = {
  requiredCount: number;
  recommendedCount: number;
  conditionalCount: number;
  summary: CompanionSummaryItem[];
  suggestions: CompanionSuggestionEntry[];
};

export function ValidationRecommendationsSection({
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  mutedTextStyle,
  strongTextStyle,
  holdSensorCardStyle,
  appLanguage,
  uiDebugMode,
  aiAnalyzeStatus,
  aiAnalyzeError,
  aiRecommendations,
  companionReport,
  verifiedSensors,
  holdSensors,
  applyCompanionItems,
  t,
}: {
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  holdSensorCardStyle?: CSSProperties;
  appLanguage: AppLanguage;
  uiDebugMode: boolean;
  aiAnalyzeStatus: 'idle' | 'loading' | 'success' | 'error';
  aiAnalyzeError?: string | null;
  aiRecommendations: AiRecommendation[];
  companionReport: CompanionReport;
  verifiedSensors: SensorAnalysisEntry[];
  holdSensors: SensorAnalysisEntry[];
  applyCompanionItems: (componentName: string | undefined, items: CompanionPartSuggestion[]) => void;
  t: Translator;
}) {
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [showCompanionDetails, setShowCompanionDetails] = useState(false);

  return (
    <div className="space-y-5">
      <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Sparkles size={11} className="text-[#60a5fa]" />
          {t('AI 대체 부품 추천', 'AI part recommendations')}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className={panelCardClassName} style={cardStyle}>
            <div className="text-slate-500">{t('추천 수', 'Suggestions')}</div>
            <div className="font-bold text-sky-300">{aiRecommendations.length}</div>
          </div>
          <div className={panelCardClassName} style={cardStyle}>
            <div className="text-slate-500">{t('필수 동반', 'Required')}</div>
            <div className="font-bold text-[#fca5a5]">{companionReport.requiredCount}</div>
          </div>
          <div className={panelCardClassName} style={cardStyle}>
            <div className="text-slate-500">{t('보류 센서', 'Hold')}</div>
            <div className="font-bold text-[#fcd34d]">{holdSensors.length}</div>
          </div>
        </div>

        {aiAnalyzeStatus === 'idle' && (
          <div className={`${panelCardClassName} text-[11px] leading-relaxed text-slate-400`} style={cardStyle}>
            {t(
              'AI 검증을 실행하면 대체 부품과 교체 이유를 여기서 바로 볼 수 있습니다.',
              'Run the AI review to see replacement parts and the reason for each suggestion here.'
            )}
          </div>
        )}

        {aiAnalyzeStatus === 'loading' && (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map(index => (
              <div key={index} className={`${panelCardClassName} space-y-2`} style={cardStyle}>
                <div className="h-4 w-1/3 rounded bg-slate-800" />
                <div className="h-3 w-2/3 rounded bg-slate-800" />
                <div className="h-3 w-1/2 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {aiAnalyzeStatus === 'error' && (
          <div className="border border-red-900/40 bg-red-950/20 px-2.5 py-2 text-[11px] text-red-400">
            {aiAnalyzeError}
          </div>
        )}

        {aiAnalyzeStatus === 'success' && aiRecommendations.length === 0 && (
          <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-[11px] text-slate-400">
            {t('추천된 대체 부품이 없습니다.', 'No alternative part recommendations found.')}
          </div>
        )}

        {aiAnalyzeStatus === 'success' && aiRecommendations.length > 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/35 px-3 py-3" style={cardStyle}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-slate-200" style={strongTextStyle}>
                {t('추천 미리보기', 'Recommendation preview')}
              </div>
              <button
                type="button"
                onClick={() => setShowAiDetails(value => !value)}
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-[10px] font-bold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
              >
                {showAiDetails ? t('접기', 'Hide') : t('자세히', 'Details')}
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {aiRecommendations.slice(0, showAiDetails ? aiRecommendations.length : 2).map((item, index) => (
                <div
                  key={`${item.originalPartName}-${index}`}
                  className={`${panelCardClassName} flex flex-col gap-2.5 transition-all duration-200 hover:border-sky-400/40 hover:shadow-[0_0_12px_rgba(56,189,248,0.06)]`}
                  style={cardStyle}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {t('기존 부품', 'Original part')}
                      </span>
                      <div className="truncate text-[12px] font-bold text-slate-200" style={strongTextStyle}>
                        {item.originalPartName}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-emerald-400">
                          {t('→ 대체 추천:', '→ Recommend:')}
                        </span>
                        <span className="text-[11px] font-bold text-sky-300">
                          {item.recommendedPartName}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                        {t('핀 호환성', 'Pin compat')}: {item.compatibilityScore}%
                      </span>
                      {item.estimatedSavings ? (
                        <span className="animate-pulse rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          {item.estimatedSavings}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400" style={mutedTextStyle}>
                    {item.reason}
                  </p>
                  {item.purchaseLink ? (
                    <a
                      href={item.purchaseLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 self-start text-[10px] text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      <ExternalLink size={11} />
                      {t('구매/상세 링크', 'Datasheet & purchase')}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {companionReport.summary.length > 0 ? (
        <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <PackagePlus size={11} className="text-[#c084fc]" />
            {t('동반 부품 리뷰', 'Companion parts review')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className={panelCardClassName} style={cardStyle}>
              <div className="text-slate-500">{t('필수', 'Required')}</div>
              <div className="font-bold text-[#fca5a5]">{companionReport.requiredCount}</div>
            </div>
            <div className={panelCardClassName} style={cardStyle}>
              <div className="text-slate-500">{t('권장', 'Recommended')}</div>
              <div className="font-bold text-[#fcd34d]">{companionReport.recommendedCount}</div>
            </div>
            <div className={panelCardClassName} style={cardStyle}>
              <div className="text-slate-500">{t('조건부', 'Conditional')}</div>
              <div className="font-bold text-[#93c5fd]">{companionReport.conditionalCount}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-400" style={mutedTextStyle}>
              {t('필수와 권장 항목만 먼저 짧게 훑을 수 있습니다.', 'Start with the required and recommended companion parts.')}
            </div>
            <button
              type="button"
              onClick={() => setShowCompanionDetails(value => !value)}
              className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-[10px] font-bold text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
            >
              {showCompanionDetails ? t('접기', 'Hide') : t('자세히', 'Details')}
            </button>
          </div>
          <div className="space-y-2">
            {companionReport.summary.slice(0, showCompanionDetails ? 8 : 3).map(item => {
              const tone =
                item.level === 'required'
                  ? 'text-[#fca5a5] border-red-950/40 bg-red-950/10'
                  : item.level === 'recommended'
                    ? 'text-[#fcd34d] border-amber-950/40 bg-amber-950/10'
                    : 'text-[#93c5fd] border-sky-950/40 bg-sky-950/10';
              const relatedSuggestionItems = companionReport.suggestions.flatMap(suggestion =>
                suggestion.items.filter(
                  suggestionItem =>
                    suggestionItem.kind === item.kind &&
                    suggestionItem.label === item.label &&
                    suggestionItem.value === item.value
                )
              );
              const representativeItem = relatedSuggestionItems[0];
              const displayValue = representativeItem ? getCompanionDisplayValue(representativeItem) : item.value;
              const originalValueRange = representativeItem
                ? getCompanionOriginalValueRange(representativeItem, displayValue)
                : undefined;
              const selectionHint = representativeItem
                ? getCompanionValueSelectionHint(representativeItem)
                : undefined;

              return (
                <div key={item.key} className={`border px-2.5 py-2 ${tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-current">
                        {item.label}{displayValue ? ` · ${displayValue}` : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-slate-300">x{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const relatedSuggestions = companionReport.suggestions.flatMap(suggestion =>
                            suggestion.items
                              .filter(
                                suggestionItem =>
                                  suggestionItem.kind === item.kind &&
                                  suggestionItem.label === item.label &&
                                  suggestionItem.value === item.value
                              )
                              .map(suggestionItem => ({
                                componentName: suggestion.componentName,
                                item: suggestionItem,
                              }))
                          );

                          if (relatedSuggestions.length === 0) {
                            return;
                          }

                          relatedSuggestions.forEach(({ componentName, item: suggestionItem }) => {
                            applyCompanionItems(componentName, [suggestionItem]);
                          });
                        }}
                        className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-slate-200 transition-colors hover:border-violet-400/40 hover:text-violet-200"
                      >
                        {t('배치', 'Place')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {t('적용 대상', 'Targets')}: {item.components.join(', ')}
                  </div>
                  {originalValueRange ? (
                    <div className="mt-1 text-[10px] text-slate-300">
                      {t('추천 범위', 'Suggested range')}: {originalValueRange}
                    </div>
                  ) : null}
                  {selectionHint ? (
                    <div className="mt-1 rounded border border-white/8 bg-black/15 px-2 py-1 text-[10px] leading-relaxed text-slate-200">
                      {selectionHint}
                    </div>
                  ) : null}
                  {item.note ? (
                    <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      {item.note}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {uiDebugMode ? (
        <div className={`${panelSectionClassName} space-y-5`} style={sectionStyle}>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <FileCheck2 size={11} className="text-[#60a5fa]" />
                {t('검증된 센서 디렉터리', 'Verified sensors')}
              </div>
              <div className="space-y-2">
                {verifiedSensors.map(({ template, analysis }) => (
                  <div key={template.id} className={panelCardClassName} style={cardStyle}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-200" style={strongTextStyle}>
                          {getLocalizedTemplateName(template, appLanguage)}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {analysis.preferredInterface ?? 'GPIO'} / {template.compatibleVoltage}
                        </div>
                      </div>
                      <span className="border border-sky-900/40 bg-sky-950/40 px-1.5 py-0.5 text-[10px] text-sky-300">
                        {getLocalizedDatasheetStatusLabel(analysis.datasheetStatus, appLanguage)}
                      </span>
                    </div>
                    {analysis.sources[0] ? (
                      <a
                        href={analysis.sources[0].url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400 hover:text-slate-200"
                      >
                        <span className="truncate">{analysis.sources[0].label}</span>
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {holdSensors.length > 0 ? (
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('문서 보강이 필요한 센서', 'Sensors that need documentation')}
                </div>
                <div className="space-y-2">
                  {holdSensors.slice(0, 8).map(({ template, analysis }) => {
                    const localizedWarning = analysis.warnings[0]
                      ? getLocalizedDesignWarning(analysis.warnings[0], appLanguage)
                      : undefined;

                    return (
                      <div
                        key={template.id}
                        className="border border-red-950/40 bg-red-950/10 px-2.5 py-2"
                        style={holdSensorCardStyle}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-bold text-slate-200" style={strongTextStyle}>
                            {getLocalizedTemplateName(template, appLanguage)}
                          </span>
                          <span className="text-[10px] text-red-300">
                            {getLocalizedDatasheetStatusLabel(analysis.datasheetStatus, appLanguage)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400" style={mutedTextStyle}>
                          {localizedWarning?.message ?? t(
                            '제조사 문서 또는 정확한 모듈 SKU를 먼저 고정해야 합니다.',
                            'Pin down the vendor documentation or the exact module SKU first.'
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Sparkles size={11} className="text-[#60a5fa]" />
              {t('추천 포지션과 타깃', 'Positioning and target')}
            </div>
            <div className="space-y-2 text-[11px] leading-relaxed">
              <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-slate-300">
                {t(
                  '차별점: Tinkercad는 시뮬레이션, EasyEDA는 PCB 제작, ModuMake는 설계 실수 검증',
                  'Positioning: Tinkercad focuses on simulation, EasyEDA on PCB production, ModuMake on design verification.'
                )}
              </div>
              <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-slate-300">
                {t(
                  '1차 타깃: 하드웨어 비전공자, IoT 프로토타입 제작자, 메이커 교육',
                  'Primary users: non-hardware builders, IoT prototypers, and maker education.'
                )}
              </div>
              <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-slate-300">
                {t(
                  '제품 심장: 검증 리포트, 데이터시트 근거, 위험 차단, 수정 제안',
                  'Core value: verification reports, datasheet evidence, risk blocking, and suggested fixes.'
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
