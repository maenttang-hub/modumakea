'use client';

import { BookOpen, Grid2X2, Hand, Layers3, Minus, MousePointer2, Scan, Plus } from 'lucide-react';
import type { ImportedSchematicViewMode } from '@/types';

type Mode = 'select' | 'pan';

function ToolButton({
  active = false,
  toggle = false,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  toggle?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={toggle ? active : undefined}
      className={`flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border text-[#8b7d70] transition ${
        active
          ? 'border-[#8bb4e5] bg-[#dbe9fa] text-[#3c6899]'
          : 'border-transparent bg-transparent hover:border-[#ddd5ca] hover:bg-white'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-[#e6ddd2]" aria-hidden="true" />;
}

function applyImportedViewModeChange(
  mode: ImportedSchematicViewMode,
  onImportedSchematicViewModeChange?: (mode: ImportedSchematicViewMode) => void
) {
  onImportedSchematicViewModeChange?.(mode);
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('modumake:fit-view'));
    }, 40);
  }
}

export function CanvasToolbar({
  mode,
  showGrid,
  showMinimap,
  zoomLabel,
  importedSchematicMode = false,
  importedSchematicViewMode = 'original',
  onModeChange,
  onZoomIn,
  onZoomOut,
  onFitView,
  onReadView,
  onToggleGrid,
  onToggleMinimap,
  onImportedSchematicViewModeChange,
}: {
  mode: Mode;
  showGrid: boolean;
  showMinimap: boolean;
  zoomLabel: string;
  importedSchematicMode?: boolean;
  importedSchematicViewMode?: ImportedSchematicViewMode;
  onModeChange: (mode: Mode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onReadView?: () => void;
  onToggleGrid: () => void;
  onToggleMinimap: () => void;
  onImportedSchematicViewModeChange?: (mode: ImportedSchematicViewMode) => void;
}) {
  return (
    <div className="relative z-10 flex h-[44px] min-w-0 items-center gap-2 overflow-hidden border-b border-[#e4d8ca] bg-[linear-gradient(180deg,#fdfaf6_0%,#f7f1e8_100%)] px-2.5">
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolButton active={mode === 'select'} toggle onClick={() => onModeChange('select')} title="선택 모드">
          <MousePointer2 size={14} />
        </ToolButton>
        <ToolButton active={mode === 'pan'} toggle onClick={() => onModeChange('pan')} title="패닝 모드">
          <Hand size={14} />
        </ToolButton>
        <Divider />
        <ToolButton onClick={onZoomIn} title="줌 인">
          <Plus size={14} />
        </ToolButton>
        <ToolButton onClick={onZoomOut} title="줌 아웃">
          <Minus size={14} />
        </ToolButton>
        <ToolButton onClick={onFitView} title="화면 맞춤">
          <Scan size={14} />
        </ToolButton>
        {importedSchematicMode && onReadView ? (
          <ToolButton onClick={onReadView} title="읽기 보기">
            <BookOpen size={14} />
          </ToolButton>
        ) : null}
        <span data-testid="schematic-zoom-label" className="ml-1.5 min-w-[42px] shrink-0 font-mono text-[10px] text-[#8b7d70]">{zoomLabel}</span>
        <Divider />
        <ToolButton active={showMinimap} toggle onClick={onToggleMinimap} title="레이어/미니맵 토글">
          <Layers3 size={14} />
        </ToolButton>
        <ToolButton active={showGrid} toggle onClick={onToggleGrid} title="격자 토글">
          <Grid2X2 size={14} />
        </ToolButton>
      </div>
      {importedSchematicMode && onImportedSchematicViewModeChange ? (
        <div className="flex shrink-0 items-center">
          <div className="inline-flex shrink-0 items-center rounded-[10px] border border-[#ddd5ca] bg-white p-[2px] shadow-[0_1px_2px_rgba(64,54,46,0.05)]">
            <button
              type="button"
              onClick={() => applyImportedViewModeChange('original', onImportedSchematicViewModeChange)}
              aria-label="원본 도면 보기"
              aria-pressed={importedSchematicViewMode === 'original'}
              className={`rounded-[8px] whitespace-nowrap px-2 py-1 text-[10px] font-semibold transition ${
                importedSchematicViewMode === 'original'
                  ? 'bg-[#dbe9fa] text-[#315f95]'
                  : 'text-[#8b7d70] hover:bg-[#f6f1ea]'
              }`}
            >
              원본
            </button>
            <button
              type="button"
              onClick={() => applyImportedViewModeChange('structured', onImportedSchematicViewModeChange)}
              aria-label="자동정리 도면 보기"
              aria-pressed={importedSchematicViewMode === 'structured'}
              className={`rounded-[8px] whitespace-nowrap px-2 py-1 text-[10px] font-semibold transition ${
                importedSchematicViewMode === 'structured'
                  ? 'bg-[#d8f0e4] text-[#216c4d]'
                  : 'text-[#8b7d70] hover:bg-[#f6f1ea]'
              }`}
            >
              자동정리
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
