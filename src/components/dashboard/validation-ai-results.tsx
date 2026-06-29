'use client';

import type { CSSProperties } from 'react';

import type {
  AIAnalyzeRecommendation,
  AIAnalyzeSemanticIssue,
  ImportedSchematicTheme,
} from '@/types';

const ISSUE_TONES = {
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)', text: '#fcd34d' },
  info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd' },
} as const;

const LIGHT_ISSUE_TONES = {
  error: { bg: '#fff1f2', border: '#fca5a5', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
  info: { bg: '#eff6ff', border: '#93c5fd', text: '#075985' },
} as const;

type ValidationAiResultsProps = {
  t: (ko: string, en: string) => string;
  panelCardClassName: string;
  importedSchematicMode: boolean;
  schematicTheme: ImportedSchematicTheme;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  deterministicSemanticIssues: AIAnalyzeSemanticIssue[];
  deterministicRecommendations: AIAnalyzeRecommendation[];
  aiSemanticIssues: AIAnalyzeSemanticIssue[];
  aiRecommendations: AIAnalyzeRecommendation[];
  error: string | null;
  showIdleNote: boolean;
};

export function ValidationAiResults({
  t,
  panelCardClassName,
  importedSchematicMode,
  schematicTheme,
  cardStyle,
  mutedTextStyle,
  deterministicSemanticIssues,
  deterministicRecommendations,
  aiSemanticIssues,
  aiRecommendations,
  error,
  showIdleNote,
}: ValidationAiResultsProps) {
  const semanticIssues = [...deterministicSemanticIssues, ...aiSemanticIssues];
  const recommendations = [...deterministicRecommendations, ...aiRecommendations];

  return (
    <>
      {showIdleNote ? (
        <div className={`${panelCardClassName} text-[11px] leading-relaxed text-slate-400`} style={cardStyle}>
          {t(
            '입력 계약은 이제 LightweightValidationJson 하나로 고정합니다. 새로 import한 KiCad는 v3 직행, 예전 legacy 저장본은 원본 텍스트가 없으면 fallback을 탑니다.',
            'The contract is now fixed on LightweightValidationJson. Fresh KiCad imports go straight through the v3 path, while legacy saves fall back when the original source text is missing.'
          )}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border px-3 py-2 text-[11px] leading-relaxed"
          style={importedSchematicMode && schematicTheme === 'light'
            ? { borderColor: '#fca5a5', background: '#fff1f2', color: '#991b1b' }
            : { borderColor: 'rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}
        >
          {error}
        </div>
      ) : null}

      {semanticIssues.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500" style={mutedTextStyle}>
            {t(
              `룰/휴리스틱 ${deterministicSemanticIssues.length}개 + AI ${aiSemanticIssues.length}개`,
              `Deterministic ${deterministicSemanticIssues.length} + AI ${aiSemanticIssues.length}`
            )}
          </div>
          {semanticIssues.slice(0, 4).map((issue, index) => {
            const tone =
              importedSchematicMode && schematicTheme === 'light'
                ? LIGHT_ISSUE_TONES[issue.severity]
                : ISSUE_TONES[issue.severity];

            return (
              <div
                key={`${issue.title}-${index}`}
                className="rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: tone.border,
                  background: tone.bg,
                  color: tone.text,
                }}
              >
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                  {issue.severity}
                </div>
                <div className="mt-1 text-[11px] font-semibold">{issue.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90">{issue.description}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {recommendations.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] text-slate-500" style={mutedTextStyle}>
            {t(
              `룰/휴리스틱 ${deterministicRecommendations.length}개 + AI ${aiRecommendations.length}개`,
              `Deterministic ${deterministicRecommendations.length} + AI ${aiRecommendations.length}`
            )}
          </div>
          {recommendations.slice(0, 4).map((item, index) => (
            <div key={`${item.originalPartName}-${index}`} className={panelCardClassName} style={cardStyle}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-slate-200">
                    {item.originalPartName}
                  </div>
                  <div className="truncate text-[10px] text-sky-300">
                    {item.recommendedPartName}
                  </div>
                </div>
                <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-200">
                  {item.compatibilityScore}%
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400" style={mutedTextStyle}>
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
