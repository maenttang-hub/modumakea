'use client';

import { useCallback, type CSSProperties, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ValidationAiPreviewCard } from '@/components/dashboard/validation-ai-preview-card';
import { ValidationAiResults } from '@/components/dashboard/validation-ai-results';
import { buildAiAnalyzeRequest } from '@/lib/build-ai-analyze-request';
import type { ImportedSchematicTheme, LightweightValidationJson, AIAnalyzeResponse, AIAnalyzeRequestPayload } from '@/types';

type ValidationAiSectionProps = {
  t: (ko: string, en: string) => string;
  componentsCount: number;
  importedSchematicMode: boolean;
  hasCanonicalImportedValidationInput: boolean;
  hasLegacyIntegratedFallback: boolean;
  schematicTheme: ImportedSchematicTheme;
  verificationReportFilenameBase: string;
  panelSectionClassName: string;
  panelCardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  actionButtonStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  validationInputPreview: LightweightValidationJson | null;
  buildValidationInput: () => LightweightValidationJson;
  aiAnalyzeStatus: 'idle' | 'loading' | 'success' | 'error';
  aiAnalyzeResult: AIAnalyzeResponse | null;
  aiAnalyzeError: string | null;
  runAiAnalyze: (payload: AIAnalyzeRequestPayload) => Promise<AIAnalyzeResponse>;
  resetAiAnalyze: () => void;
  onReimport?: (file: File) => Promise<void>;
};

export function ValidationAiSection({
  t,
  componentsCount,
  importedSchematicMode,
  hasCanonicalImportedValidationInput,
  hasLegacyIntegratedFallback,
  schematicTheme,
  verificationReportFilenameBase,
  panelSectionClassName,
  panelCardClassName,
  sectionStyle,
  cardStyle,
  actionButtonStyle,
  mutedTextStyle,
  strongTextStyle,
  validationInputPreview,
  buildValidationInput,
  aiAnalyzeStatus,
  aiAnalyzeResult,
  aiAnalyzeError,
  runAiAnalyze,
  resetAiAnalyze,
  onReimport,
}: ValidationAiSectionProps) {

  const reimportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingReimport, setIsDraggingReimport] = useState(false);

  const handleReimportDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReimport(true);
  };

  const handleReimportDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReimport(false);
  };

  const handleReimportDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReimport(false);

    const file = e.dataTransfer.files?.[0];
    if (file && onReimport) {
      await onReimport(file);
    }
  };

  const deterministicSemanticIssues = aiAnalyzeResult?.deterministic.semanticIssues ?? [];
  const deterministicRecommendations = aiAnalyzeResult?.deterministic.recommendations ?? [];
  const aiSemanticIssues = aiAnalyzeResult?.ai.semanticIssues ?? [];
  const aiRecommendations = aiAnalyzeResult?.ai.recommendations ?? [];
  const totalSemanticIssues = deterministicSemanticIssues.length + aiSemanticIssues.length;
  const totalRecommendations = deterministicRecommendations.length + aiRecommendations.length;

  const resolveValidationInput = useCallback(() => {
    return validationInputPreview ?? buildValidationInput();
  }, [buildValidationInput, validationInputPreview]);

  const handleRunAiAnalyze = useCallback(async () => {
    try {
      const payload = resolveValidationInput();
      const result = await runAiAnalyze(buildAiAnalyzeRequest(payload));

      toast.success(t('AI 교차 검증 완료', 'AI cross-check finished'), {
        description: t(
          `${result.semanticIssues.length}개 의미 이슈, ${result.recommendations.length}개 추천을 정리했습니다.`,
          `Prepared ${result.semanticIssues.length} semantic issues and ${result.recommendations.length} recommendations.`
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('AI 분석 요청에 실패했습니다.', 'AI analysis request failed.');
      toast.error(t('AI 교차 검증 실패', 'AI cross-check failed'), {
        description: message,
      });
    }
  }, [resolveValidationInput, runAiAnalyze, t]);

  useEffect(() => {
    const handleExternalRun = () => {
      void handleRunAiAnalyze();
    };

    window.addEventListener('modumake:run-ai-analysis', handleExternalRun);
    return () => window.removeEventListener('modumake:run-ai-analysis', handleExternalRun);
  }, [handleRunAiAnalyze]);

  const runButtonStyle = importedSchematicMode
    ? {
        ...actionButtonStyle,
        background: schematicTheme === 'light' ? '#eff6ff' : 'rgba(59,130,246,0.12)',
        borderColor: schematicTheme === 'light' ? '#93c5fd' : 'rgba(96,165,250,0.35)',
        color: schematicTheme === 'light' ? '#1d4ed8' : '#bfdbfe',
      }
    : undefined;

  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" style={mutedTextStyle}>
            <Sparkles size={11} className="text-[#60a5fa]" />
            {t('AI 교차 검증', 'AI cross-check')}
          </div>
          <div className="mt-2 text-[13px] font-bold text-slate-100" style={strongTextStyle}>
            {t('룰 엔진 결과 위에 의미 해석을 한 번 더 얹습니다.', 'Adds one more semantic pass on top of the rule-engine output.')}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500" style={mutedTextStyle}>
            {hasCanonicalImportedValidationInput
              ? t(
                  '지금 AI 입력은 원본 .kicad_sch를 다시 읽어 만든 canonical lightweight 포맷을 사용합니다.',
                  'AI is using the canonical lightweight input rebuilt directly from the original .kicad_sch.'
                )
              : hasLegacyIntegratedFallback
                ? t(
                    '이 저장본은 원본 KiCad 텍스트가 없어, 예전 integrated 스냅샷을 legacy fallback으로만 사용합니다.',
                    'This save has no original KiCad source, so it falls back to the older integrated snapshot.'
                  )
                : t(
                    '원본 KiCad 텍스트도, legacy 스냅샷도 없어 공용 fallback 입력을 사용합니다.',
                    'There is no KiCad source or legacy snapshot, so the shared fallback input is being used.'
                  )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {aiAnalyzeStatus !== 'idle' ? (
            <button
              type="button"
              onClick={resetAiAnalyze}
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2.5 text-[10px] font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
              style={actionButtonStyle}
            >
              {t('초기화', 'Reset')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleRunAiAnalyze}
            disabled={componentsCount === 0 || aiAnalyzeStatus === 'loading'}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 text-[10px] font-semibold text-sky-200 transition-colors hover:border-sky-400/55 hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-50"
            style={runButtonStyle}
          >
            <Sparkles size={12} />
            {aiAnalyzeStatus === 'loading' ? t('분석 중...', 'Analyzing...') : t('AI 실행', 'Run AI')}
          </button>
        </div>
      </div>

      {hasLegacyIntegratedFallback ? (
        <div
          className="rounded-lg border px-3 py-2 transition-all duration-200"
          style={{
            ...(cardStyle ?? {}),
            borderStyle: isDraggingReimport ? 'dashed' : 'solid',
            background: isDraggingReimport
              ? (schematicTheme === 'light' ? '#ffedd5' : 'rgba(245,158,11,0.18)')
              : (schematicTheme === 'light' ? '#fff7ed' : 'rgba(245,158,11,0.10)'),
            borderColor: isDraggingReimport
              ? (schematicTheme === 'light' ? '#ea580c' : '#fbbf24')
              : (schematicTheme === 'light' ? '#fdba74' : 'rgba(245,158,11,0.32)'),
            color: schematicTheme === 'light' ? '#9a3412' : '#fde68a',
          }}
          onDragOver={handleReimportDragOver}
          onDragLeave={handleReimportDragLeave}
          onDrop={handleReimportDrop}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <AlertTriangle size={12} />
            {t('같은 KiCad 파일을 다시 import하면 더 정확해집니다', 'Re-import the same KiCad file for a cleaner result')}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed">
            {t(
              '지금 AI는 예전 integrated 스냅샷을 fallback으로 읽고 있습니다. 같은 .kicad_sch 파일을 한 번 다시 올리면, 원본 텍스트에서 다시 만든 최신 lightweight 입력을 바로 사용합니다.',
              'AI is currently reading an older integrated snapshot as fallback. Re-importing the same .kicad_sch once lets it switch back to the latest lightweight input rebuilt from the original source.'
            )}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2 border-amber-500/10">
            <span className="text-[10px] text-amber-500/80 font-medium">
              {isDraggingReimport ? t('파일을 놓아주세요!', 'Drop the file here!') : t('kicad_sch 드래그 가능', 'kicad_sch drag-and-drop supported')}
            </span>
            <button
              type="button"
              onClick={() => reimportFileInputRef.current?.click()}
              className="inline-flex h-6 items-center justify-center gap-1 rounded-md border px-2 text-[10px] font-bold transition-all hover:brightness-110 active:scale-95"
              style={{
                borderColor: schematicTheme === 'light' ? '#d97706' : 'rgba(245,158,11,0.36)',
                background: schematicTheme === 'light' ? '#f59e0b' : 'rgba(245,158,11,0.20)',
                color: schematicTheme === 'light' ? '#ffffff' : '#fde68a',
              }}
            >
              <Upload size={10} className="stroke-[2.5]" />
              {t('지금 다시 가져오기', 'Re-import now')}
            </button>
          </div>
          <input
            ref={reimportFileInputRef}
            type="file"
            accept=".kicad_sch"
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file && onReimport) {
                await onReimport(file);
              }
              e.currentTarget.value = '';
            }}
          />
        </div>
      ) : null}

      <ValidationAiPreviewCard
        t={t}
        panelCardClassName={panelCardClassName}
        verificationReportFilenameBase={verificationReportFilenameBase}
        cardStyle={cardStyle}
        actionButtonStyle={actionButtonStyle}
        mutedTextStyle={mutedTextStyle}
        strongTextStyle={strongTextStyle}
        resolveValidationInput={resolveValidationInput}
        validationInputPreview={validationInputPreview}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className={panelCardClassName} style={cardStyle}>
          <span className="block text-slate-500" style={mutedTextStyle}>{t('의미 이슈', 'Semantic issues')}</span>
          <span className={totalSemanticIssues > 0 ? 'font-bold text-[#fcd34d]' : 'font-bold text-[#86efac]'}>
            {totalSemanticIssues}
          </span>
        </div>
        <div className={panelCardClassName} style={cardStyle}>
          <span className="block text-slate-500" style={mutedTextStyle}>{t('부품 추천', 'Recommendations')}</span>
          <span className={totalRecommendations > 0 ? 'font-bold text-[#93c5fd]' : 'font-bold text-slate-300'}>
            {totalRecommendations}
          </span>
        </div>
      </div>

      <ValidationAiResults
        t={t}
        panelCardClassName={panelCardClassName}
        importedSchematicMode={importedSchematicMode}
        schematicTheme={schematicTheme}
        cardStyle={cardStyle}
        mutedTextStyle={mutedTextStyle}
        deterministicSemanticIssues={deterministicSemanticIssues}
        deterministicRecommendations={deterministicRecommendations}
        aiSemanticIssues={aiSemanticIssues}
        aiRecommendations={aiRecommendations}
        error={aiAnalyzeError}
        showIdleNote={aiAnalyzeStatus === 'idle'}
      />
    </div>
  );
}
