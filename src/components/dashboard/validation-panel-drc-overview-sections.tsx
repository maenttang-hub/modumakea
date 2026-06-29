'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Download } from 'lucide-react';
import { PANEL_CARD, PANEL_SECTION_SUBTLE } from '@/components/dashboard/validation-panel-helpers';
import { buildKiCadExportSummary } from '@/lib/export-kicad';

type Translator = (ko: string, en: string) => string;

type KiCadExportSummary = NonNullable<ReturnType<typeof buildKiCadExportSummary>>;

export function ValidationKiCadExportSection({
  kicadExportSummary,
  importedSchematicMode,
  importedSubtleSectionStyle,
  importedCardStyle,
  importedMutedTextStyle,
  importedStrongTextStyle,
  onExportKiCad,
  t,
}: {
  kicadExportSummary: KiCadExportSummary | null;
  importedSchematicMode: boolean;
  importedSubtleSectionStyle?: CSSProperties;
  importedCardStyle?: CSSProperties;
  importedMutedTextStyle?: CSSProperties;
  importedStrongTextStyle?: CSSProperties;
  onExportKiCad: () => void;
  t: Translator;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!kicadExportSummary) {
    return null;
  }

  const boardExportReasonTone =
    kicadExportSummary.board.mode === 'generic-connector-fallback'
      ? 'border-amber-500/20 bg-amber-500/8 text-amber-200'
      : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-200';

  return (
    <div className={PANEL_SECTION_SUBTLE} style={importedSubtleSectionStyle}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500" style={importedMutedTextStyle}>
            {t('리뷰 내보내기', 'Review exit')}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300" style={importedStrongTextStyle}>
            {t(
              '현재 검토 상태를 그대로 KiCad 회로도로 넘겨서, 전문 정리는 바깥에서 이어갈 수 있습니다.',
              'Send the current review state straight into a KiCad schematic and continue the detailed cleanup there.'
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-300">
              {t(`표준 심볼 ${kicadExportSummary.standardCount}`, `Standard symbols ${kicadExportSummary.standardCount}`)}
            </span>
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-amber-200">
              {t(`범용 커넥터 대체 ${kicadExportSummary.fallbackCount}`, `Fallback connectors ${kicadExportSummary.fallbackCount}`)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onExportKiCad}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-bold transition-colors"
          style={{
            background: 'rgba(37,99,235,0.14)',
            borderColor: 'rgba(59,130,246,0.35)',
            color: '#bfdbfe',
          }}
          title={t('현재 리뷰 상태로 KiCad 회로도 저장', 'Save KiCad schematic from the current review state')}
        >
          <Download size={12} />
          {t('KiCad 저장', 'Save KiCad')}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-400" style={importedMutedTextStyle}>
        <span>
          {t(
            '표준 심볼과 대체 커넥터 구성을 먼저 요약해서 봅니다.',
            'Start with a quick summary of standard symbols and fallback connectors.'
          )}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-bold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
        >
          {expanded ? t('접기', 'Hide') : t('자세히', 'Details')}
        </button>
      </div>

      {expanded ? (
        <div
          className="mt-4 space-y-2.5 border-t border-slate-800 pt-3.5"
          style={importedSchematicMode ? { borderColor: importedSubtleSectionStyle?.borderColor } : undefined}
        >
        <div className={`${PANEL_CARD} flex items-center justify-between gap-3`} style={importedCardStyle}>
          <div>
            <div className="text-[11px] font-semibold text-slate-200" style={importedStrongTextStyle}>
              {kicadExportSummary.board.name}
            </div>
            <div className="text-[10px] text-slate-500" style={importedMutedTextStyle}>
              {kicadExportSummary.board.libraryId}
            </div>
            {kicadExportSummary.board.reason ? (
              <div className={`mt-2 rounded border px-2 py-1.5 text-[10px] leading-relaxed ${boardExportReasonTone}`}>
                {kicadExportSummary.board.reason}
              </div>
            ) : null}
          </div>
          <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
            {t('표준 심볼', 'Standard symbol')}
          </span>
        </div>

        <div className="max-h-40 space-y-2.5 overflow-y-auto pr-1">
          {kicadExportSummary.components.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 px-2.5 py-3 text-[11px] text-slate-500" style={importedCardStyle}>
              {t('아직 KiCad로 넘길 부품이 없습니다.', 'There are no parts to send to KiCad yet.')}
            </div>
          ) : (
            kicadExportSummary.components.map(entry => {
              const reasonTone =
                entry.mode === 'standard-symbol'
                  ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-200'
                  : 'border-amber-500/20 bg-amber-500/8 text-amber-200';

              return (
                <div
                  key={entry.ownerId}
                  className={`${PANEL_CARD} flex items-start justify-between gap-3`}
                  style={importedCardStyle}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-slate-200" style={importedStrongTextStyle}>
                      {entry.name}
                    </div>
                    <div className="truncate text-[10px] text-slate-500" style={importedMutedTextStyle}>
                      {entry.libraryId}
                    </div>
                    {entry.reason ? (
                      <div className={`mt-2 rounded border px-2 py-1.5 text-[10px] leading-relaxed ${reasonTone}`}>
                        {entry.reason}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 rounded-full border px-2 py-1 text-[10px]"
                    style={
                      entry.mode === 'standard-symbol'
                        ? {
                            borderColor: 'rgba(16,185,129,0.35)',
                            background: 'rgba(16,185,129,0.10)',
                            color: '#86efac',
                          }
                        : {
                            borderColor: 'rgba(245,158,11,0.35)',
                            background: 'rgba(245,158,11,0.10)',
                            color: '#fde68a',
                          }
                    }
                  >
                    {entry.mode === 'standard-symbol'
                      ? t('표준 심볼', 'Standard symbol')
                      : t('범용 커넥터 대체', 'Fallback connector')}
                  </span>
                </div>
              );
            })
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}
