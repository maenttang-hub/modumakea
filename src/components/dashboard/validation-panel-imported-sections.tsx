'use client';

import type { CSSProperties } from 'react';
import { FileStack, LayoutTemplate, ScanSearch } from 'lucide-react';
import { getImportedHierarchicalSheetDescriptors } from '@/lib/imported-schematic-structure';
import type { ImportedSchematicScene, ProjectAuditIssue } from '@/types';

type Translator = (ko: string, en: string) => string;

export function ValidationImportedStructureSection({
  importedSchematicScene,
  issues,
  panelSectionClassName,
  cardClassName,
  sectionStyle,
  cardStyle,
  mutedTextStyle,
  strongTextStyle,
  onFocusIssue,
  t,
}: {
  importedSchematicScene: ImportedSchematicScene | null | undefined;
  issues: ProjectAuditIssue[];
  panelSectionClassName: string;
  cardClassName: string;
  sectionStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  onFocusIssue: (issue: ProjectAuditIssue) => void;
  t: Translator;
}) {
  const scene = importedSchematicScene ?? null;
  if (!scene) {
    return null;
  }

  const sheetDescriptors = getImportedHierarchicalSheetDescriptors(scene);
  const structureIssues = issues.filter(issue => issue.ruleId === 'imported.sheet-frame-overlap');
  const symbolCount = scene.symbols?.length ?? 0;
  const drawingCount = scene.drawings?.length ?? 0;
  const connectorSymbolCount = (scene.symbols ?? []).filter(symbol => symbol.family === 'connector').length;
  const pageTitle = scene.pageFrame?.titleBlock?.title?.trim() || null;

  if (sheetDescriptors.length === 0 && structureIssues.length === 0 && !pageTitle) {
    return null;
  }

  return (
    <div className={`${panelSectionClassName} space-y-3`} style={sectionStyle}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={mutedTextStyle}>
        <LayoutTemplate size={11} className="text-[#60a5fa]" />
        {t('문서 구조 먼저 보기', 'Document structure first')}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={cardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('하위 시트', 'Sub-sheets')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{sheetDescriptors.length}</div>
        </div>
        <div className={cardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('실제 심볼', 'Real symbols')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{symbolCount}</div>
        </div>
        <div className={cardClassName} style={cardStyle}>
          <div className="text-slate-500" style={mutedTextStyle}>{t('자유 드로잉', 'Free drawings')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{drawingCount}</div>
        </div>
      </div>

      <div className={`rounded-xl border px-3 py-3 text-[11px] leading-relaxed text-slate-300`} style={cardStyle}>
        <div className="font-semibold text-slate-100" style={strongTextStyle}>
          {t('점선 박스와 제목은 먼저 문서 구조로 읽습니다.', 'Read dashed boxes and titles as document structure first.')}
        </div>
        <div className="mt-1 text-slate-400" style={mutedTextStyle}>
          {t(
            '커넥터 몸체나 MCU 박스처럼 바로 재배치하지 않고, 문서 레이어인지 실제 심볼인지 먼저 구분해서 보여줍니다.',
            'We do not treat them like connector bodies or MCU boxes right away. We first separate document layers from real symbols.'
          )}
        </div>
        <div className="mt-2 rounded-lg border border-sky-900/30 bg-sky-950/12 px-2.5 py-2 text-[10px] leading-relaxed text-sky-100">
          {t(
            structureIssues.length > 0
              ? `현재 ${structureIssues.length}곳은 문서 경계와 심볼이 가까워 보여 한 번 더 구분해서 보는 편이 안전합니다.`
              : '지금은 문서 구조와 실제 부품을 따로 읽도록만 안내합니다.',
            structureIssues.length > 0
              ? `Right now ${structureIssues.length} areas place document bounds close to symbols, so they need one extra look.`
              : 'For now we simply keep document structure and real parts visually separated.'
          )}
        </div>
      </div>

      {pageTitle ? (
        <div className={`rounded-xl border px-3 py-3`} style={cardStyle}>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={mutedTextStyle}>
            <FileStack size={11} className="text-[#93c5fd]" />
            {t('문서 제목', 'Document title')}
          </div>
          <div className="mt-1 text-[12px] font-semibold text-slate-100" style={strongTextStyle}>
            {pageTitle}
          </div>
        </div>
      ) : null}

      {sheetDescriptors.length > 0 ? (
        <div className={`rounded-xl border px-3 py-3`} style={cardStyle}>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={mutedTextStyle}>
            <ScanSearch size={11} className="text-[#93c5fd]" />
            {t('문서 구조로 인식된 시트', 'Recognized document sheets')}
          </div>
          <div className="mt-2 space-y-2">
            {sheetDescriptors.slice(0, 3).map(descriptor => (
              <div key={`${descriptor.title}-${descriptor.bounds.x}-${descriptor.bounds.y}`} className="rounded-lg border border-slate-800/80 bg-slate-950/35 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-200" style={strongTextStyle}>
                    {descriptor.title}
                  </span>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                    {t(`${descriptor.pinCount}개 핀`, `${descriptor.pinCount} pins`)}
                  </span>
                </div>
                {descriptor.subtitle ? (
                  <div className="mt-1 text-[10px] text-slate-400" style={mutedTextStyle}>
                    {descriptor.subtitle}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {structureIssues.length > 0 ? (
        <div className={`rounded-xl border px-3 py-3`} style={cardStyle}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {t('헷갈리기 쉬운 imported 구조', 'Potentially confusing imported structure')}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-300" style={strongTextStyle}>
            {t(
              '이 imported 문서에서는 시트 경계가 심볼 영역과 겹쳐 보여서, 커넥터를 사람이 직접 그린 큰 박스로 오해하기 쉽습니다.',
              'In this imported document, a sheet boundary visually overlaps symbol areas, so it can be mistaken for a hand-drawn connector box.'
            )}
          </div>
          <div className="mt-2 space-y-2">
            {structureIssues.slice(0, 4).map(issue => (
              <div key={`${issue.ruleId}-${issue.componentName ?? issue.message}`} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-amber-100">
                    {issue.componentName || t('겹침 심볼', 'Overlapped symbol')}
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-amber-200/85">
                    {t('문서 경계와 심볼이 겹쳐 보여 실제 부품 몸체처럼 오해될 수 있습니다.', 'The document boundary overlaps the symbol area and may look like a real component body.')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onFocusIssue(issue)}
                  className="shrink-0 rounded border border-amber-400/35 bg-slate-950/40 px-2.5 py-1.5 text-[10px] font-bold text-amber-100 transition-colors hover:border-amber-300/55"
                >
                  {t('캔버스 보기', 'View')}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : connectorSymbolCount > 0 && sheetDescriptors.length > 0 ? (
        <div className={`rounded-xl border px-3 py-3 text-[11px] leading-relaxed text-slate-300`} style={cardStyle}>
          {t(
            '커넥터가 많은 imported 문서에서는 점선 시트 경계가 커넥터 몸체처럼 보일 수 있습니다. 아직 자동 재배치는 하지 않고, 먼저 구조 진단으로 분리해서 보여줍니다.',
            'On connector-heavy imported documents, dashed sheet boundaries can look like connector bodies. We keep auto-repositioning off and separate that confusion with structural diagnosis first.'
          )}
        </div>
      ) : null}
    </div>
  );
}
