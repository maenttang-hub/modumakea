'use client';

/**
 * components/dashboard/sidebar.tsx
 * 좌측 부품 라이브러리 패널 (Phase 2: 전압 호환성 필터 추가)
 */

import { useState, useMemo, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getBoardById } from '@/constants/boards';
import {
  analyzeComponentForBoard,
  isDatasheetVerifiedStatus,
} from '@/lib/datasheet-rules';
import {
  getLocalizedDatasheetStatusLabel,
  getLocalizedTemplateDescription,
  getLocalizedTemplateName,
} from '@/lib/catalog-i18n';
import { buildComponentTooltip } from '@/lib/component-tooltip';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import {
  hasLegacyImportedSchematicState,
  isImportedSchematicProject,
  isVoltageCompatible,
  matchesComponentCategory,
  matchesComponentSearch,
} from '@/lib/component-template-utils';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { importKiCadSchematicAsync } from '@/lib/import-kicad-schematic-async';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import {
  buildPlatformIoConfigForPackages,
  collectArduinoDependencies,
  formatArduinoDependencyLabel,
} from '@/lib/platformio-manifest';
import {
  extractKiCadSymbols,
  kicadSymbolToCustomComponentPackage,
} from '@/lib/kicad-sym-parser';
import { pickLanguage } from '@/lib/ui-language';
import { useComponentCatalog } from '@/hooks/use-component-catalog';
import { useArduinoLibraryCatalog } from '@/hooks/use-arduino-library-catalog';
import { useBoardStore } from '@/store/use-board-store';
import { SidebarReviewProgress } from '@/components/dashboard/sidebar-review-progress';
import type { AppLanguage, ArduinoLibraryCatalogEntry, ComponentTemplate, ComponentCategory, CustomComponentPackage } from '@/types';
import {
  ChevronLeft,
  Search, Radar, Eye, Thermometer, Sun, Droplets, Wind, Mic, Radio,
  Lightbulb, Palette, RotateCcw, Cog, Volume2, Zap, Monitor,
  AlignLeft, Hash, Bluetooth, CreditCard, Square, Layers, AlertTriangle,
  Minus, Cylinder, Orbit, ArrowRightLeft, Workflow, ArrowLeftRight, Microchip, Combine, PlugZap, Plus, FileJson, Trash2, Download, Upload, BookOpen, Check,
} from 'lucide-react';
import { toast } from 'sonner';

type FilterCategory = 'ALL' | ComponentCategory;

const CATEGORY_TABS: { id: FilterCategory; label: { ko: string; en: string }; color: string }[] = [
  { id: 'ALL',           label: { ko: '전체', en: 'All' }, color: '#64748b' },
  { id: 'SENSOR',        label: { ko: '센서', en: 'Sensor' }, color: '#3b82f6' },
  { id: 'ACTUATOR',      label: { ko: '구동', en: 'Actuator' }, color: '#8b5cf6' },
  { id: 'DISPLAY',       label: { ko: '표시', en: 'Display' }, color: '#06b6d4' },
  { id: 'COMMUNICATION', label: { ko: '통신', en: 'Comm' }, color: '#f59e0b' },
  { id: 'PASSIVE',       label: { ko: '수동', en: 'Passive' }, color: '#22c55e' },
];

const TEMPLATE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Radar,
  Eye,
  Thermometer,
  Sun,
  Droplets,
  Wind,
  Mic,
  Radio,
  Lightbulb,
  Palette,
  RotateCcw,
  Cog,
  Volume2,
  Zap,
  Monitor,
  AlignLeft,
  Hash,
  Bluetooth,
  CreditCard,
  Square,
  Minus,
  Cylinder,
  Orbit,
  ArrowRightLeft,
  Workflow,
  ArrowLeftRight,
  Microchip,
  Combine,
  PlugZap,
};

const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  SENSOR:        { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  ACTUATOR:      { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  DISPLAY:       { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  COMMUNICATION: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  PASSIVE:       { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

const CATEGORY_LABEL: Record<ComponentCategory, { ko: string; en: string }> = {
  SENSOR: { ko: '센서', en: 'Sensor' },
  ACTUATOR: { ko: '구동', en: 'Actuator' },
  DISPLAY: { ko: '표시', en: 'Display' },
  COMMUNICATION: { ko: '통신', en: 'Comm' },
  PASSIVE: { ko: '수동', en: 'Passive' },
  IC: { ko: 'IC', en: 'IC' },
  CONNECTOR: { ko: '커넥터', en: 'Connector' },
};

function ComponentCard({
  template,
  isCompatible,
  boardId,
  boardVoltage,
  appLanguage,
  onQuickAdd,
  importedSchematicMode,
}: {
  template: ComponentTemplate;
  isCompatible: boolean;
  boardId: string;
  boardVoltage: string;
  appLanguage: AppLanguage;
  onQuickAdd: (template: ComponentTemplate) => void;
  importedSchematicMode: boolean;
}) {
  const Icon  = TEMPLATE_ICON_MAP[template.icon] ?? Layers;
  const style = CATEGORY_STYLE[template.category] ?? CATEGORY_STYLE.SENSOR;
  const [showTooltip, setShowTooltip] = useState(false);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const importedPalette = getImportedSchematicPalette(schematicTheme);
  const analysis = analyzeComponentForBoard(template, boardId);
  const localizedName = getLocalizedTemplateName(template, appLanguage);
  const localizedDescription = getLocalizedTemplateDescription(template, appLanguage);
  const specTooltip = buildComponentTooltip(template, appLanguage);
  const pinPreview = template.requiredPins.map(pin => pin.name).slice(0, 4).join(' · ');
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCompatible) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/modumake-component', template.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="relative mb-2">
      {/* 비호환 툴팁 */}
      {!isCompatible && showTooltip && (
        <div
          className="absolute left-0 right-0 -top-12 z-50 px-3 py-2 rounded-lg text-xs text-white pointer-events-none"
          style={{
            background: 'rgba(239,68,68,0.95)',
            border: '1px solid rgba(239,68,68,0.5)',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={11} />
            <span>
              {t(
                `⚠️ 이 부품은 ${template.compatibleVoltage} 전용입니다. ${boardVoltage} 보드에서 사용 불가.`,
                `⚠️ This part is ${template.compatibleVoltage}-only and cannot be used on a ${boardVoltage} board.`
              )}
            </span>
          </div>
          {/* 화살표 */}
          <div
            className="absolute left-4 -bottom-1.5 w-3 h-3 rotate-45"
            style={{ background: 'rgba(239,68,68,0.95)' }}
          />
        </div>
      )}

      <div
        draggable={isCompatible}
        onDragStart={handleDragStart}
        onMouseEnter={() => !isCompatible && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={specTooltip}
        className={`group flex items-center gap-3 p-3 rounded-md border transition-all duration-200 ${
          isCompatible
            ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5'
            : 'cursor-not-allowed'
        }`}
        style={{
          background: importedSchematicMode
            ? isCompatible
              ? importedPalette.shellElevatedBackground
              : importedPalette.shellPanelBackground
            : isCompatible
              ? '#0d1428'
              : '#0a0f1e',
          borderColor: importedSchematicMode
            ? isCompatible
              ? importedPalette.shellBorder
              : 'rgba(239,68,68,0.15)'
            : isCompatible
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(239,68,68,0.15)',
          opacity:      isCompatible ? 1 : 0.38,
          boxShadow:    isCompatible ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
        }}
        onMouseOver={isCompatible ? (e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = style.color + '60';
          el.style.boxShadow   = `0 4px 16px ${style.color}20`;
        }) : undefined}
        onMouseOut={isCompatible ? (e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = 'rgba(255,255,255,0.06)';
          el.style.boxShadow   = '0 2px 8px rgba(0,0,0,0.2)';
        }) : undefined}
      >
        {/* 아이콘 */}
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${
            isCompatible ? 'transition-transform duration-200 group-hover:scale-110' : ''
          }`}
          style={{
            background: isCompatible ? style.bg : 'rgba(100,100,100,0.15)',
            color:      isCompatible ? style.color : '#4b5563',
          }}
        >
          <Icon size={16} />
        </div>

        {/* 텍스트 */}
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold leading-tight truncate"
            style={{
              color: importedSchematicMode
                ? isCompatible
                  ? importedPalette.shellForeground
                  : importedPalette.shellMutedText
                : isCompatible
                  ? '#ffffff'
                  : '#4b5563',
            }}
          >
            {localizedName}
          </p>
          <p
            className="text-xs leading-tight mt-0.5 truncate"
            style={{ color: importedSchematicMode ? importedPalette.shellMutedText : '#4b5563' }}
          >
            {localizedDescription.split(':')[0]}
          </p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                background: isCompatible ? style.bg : 'rgba(100,100,100,0.15)',
                color: isCompatible ? style.color : '#4b5563',
              }}
            >
              {pickLanguage(appLanguage, CATEGORY_LABEL[template.category])}
            </span>
            {pinPreview && (
              <span
                className="max-w-[132px] truncate text-[10px]"
                style={{
                  color: importedSchematicMode
                    ? importedPalette.shellMutedText
                    : isCompatible
                      ? '#94a3b8'
                      : '#475569',
                }}
              >
                {pinPreview}
              </span>
            )}
          </div>
        </div>

        {/* 우측 배지들 */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isCompatible && (
            <button
              type="button"
              draggable={false}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onQuickAdd(template);
              }}
              className="h-6 w-6 flex items-center justify-center rounded-md border transition-colors"
              style={{
                background: 'rgba(59,130,246,0.12)',
                borderColor: 'rgba(59,130,246,0.35)',
                color: '#93c5fd',
              }}
              title={t('캔버스에 바로 추가', 'Add to canvas')}
            >
              <Plus size={12} />
            </button>
          )}
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{
              background: isCompatible ? style.bg : 'rgba(100,100,100,0.15)',
              color:      isCompatible ? style.color : '#4b5563',
              fontSize:   9,
            }}
          >
            {appLanguage === 'ko' ? `${template.requiredPins.length}핀` : `${template.requiredPins.length} pins`}
          </span>
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(34,197,94,0.12)',
              color: '#86efac',
              fontSize: 8,
            }}
          >
            {template.pcb?.packageType ?? 'MODULE'}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{
              background: 'rgba(96,165,250,0.14)',
              color: '#93c5fd',
              fontSize: 8,
            }}
          >
            {getLocalizedDatasheetStatusLabel(analysis.datasheetStatus, appLanguage)}
          </span>
          {/* 전압 배지 */}
          {template.compatibleVoltage !== 'BOTH' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                background: isCompatible
                  ? (template.compatibleVoltage === '5V' ? 'rgba(239,68,68,0.2)' : 'rgba(6,182,212,0.2)')
                  : 'rgba(239,68,68,0.15)',
                color: isCompatible
                  ? (template.compatibleVoltage === '5V' ? '#f87171' : '#22d3ee')
                  : '#ef4444',
                fontSize: 8,
              }}
            >
              {isCompatible ? template.compatibleVoltage : t('⚠️ 비호환', '⚠️ Incompatible')}
            </span>
          )}
          {isCompatible && analysis.warnings.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                background: 'rgba(245,158,11,0.18)',
                color: '#fbbf24',
                fontSize: 8,
              }}
            >
              Warn {analysis.warnings.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

type SidebarProps = {
  mode?: 'library' | 'review-progress';
  reviewSummary?: {
    boardName: string;
    partCount: number;
    issueCount: number;
    codeReady: boolean;
  };
  reviewModes?: Array<{
    id: 'circuit' | 'code' | 'combined';
    title: string;
    detail: string;
    active: boolean;
  }>;
  onSelectReviewMode?: (modeId: 'circuit' | 'code' | 'combined') => void;
  onCollapse?: () => void;
  onBackToReview?: () => void;
};

export function Sidebar({
  mode = 'library',
  reviewSummary,
  reviewModes,
  onSelectReviewMode,
  onCollapse,
  onBackToReview,
}: SidebarProps) {
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('ALL');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [isLibraryManagerOpen, setIsLibraryManagerOpen] = useState(false);
  const [isArduinoLibraryManagerOpen, setIsArduinoLibraryManagerOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryTab, setLibraryTab] = useState<'catalog' | 'installed'>('catalog');
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const kicadFileInputRef = useRef<HTMLInputElement | null>(null);
  const reimportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingReimport, setIsDraggingReimport] = useState(false);
  const {
    activeBoardId,
    appLanguage,
    addComponent,
    components,
    importedSchematicScene,
    importedSchematicSource,
    installedLibraries,
    installProjectLibrary,
    removeProjectLibrary,
    customComponentPackages,
    importCustomComponentPackage,
    removeCustomComponentPackage,
    hydrateProject,
  } = useBoardStore();
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const board = getBoardById(activeBoardId);
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const hasLegacyImportedScene = hasLegacyImportedSchematicState(
    activeBoardId,
    components,
    importedSchematicScene
  );
  const missingImportedSource = importedSchematicMode && !(importedSchematicSource?.trim());
  const shouldShowReimportGuidance = hasLegacyImportedScene || missingImportedSource;

  const handleReimportKiCadSchematic = async (file: File) => {
    try {
      const text = await file.text();
      const isKiCadSchematic = file.name.toLowerCase().endsWith('.kicad_sch');
      if (!isKiCadSchematic) {
        toast.error(t('KiCad 회로도 파일(.kicad_sch)을 선택해 주세요.', 'Please select a KiCad schematic file (.kicad_sch).'));
        return;
      }

      const imported = await importKiCadSchematicAsync(text, {
        projectName: file.name.replace(/\.kicad_sch$/i, ''),
      });

      const payload = {
        ...imported.document,
        integratedValidationJson: buildImportedSchematicIntegratedValidationJson({
          document: imported.document,
          importedSource: text,
          importSummary: imported.summary,
        }),
      };

      const result = hydrateProject(payload);

      if (!result.success) {
        toast.error(t('재import 실패', 'Re-import failed'), { description: result.error });
        return;
      }

      toast.success(t('⚡ 회로도 재import 완료', '⚡ Schematic re-imported successfully'), {
        description: t(
          '최신 배선 구조와 정렬 기준으로 회로도를 갱신했습니다.',
          'Updated the schematic with the latest routing standards and coordinates alignment.'
        ),
      });
    } catch (error) {
      toast.error(t('재import 실패', 'Re-import failed'), {
        description: error instanceof Error ? error.message : t('파일을 읽는 중 오류가 발생했습니다.', 'An error occurred while reading the file.'),
      });
    }
  };

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
    if (file) {
      await handleReimportKiCadSchematic(file);
    }
  };
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const importedPalette = getImportedSchematicPalette(schematicTheme);
  const importedStatStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellCardBackground,
      }
    : undefined;
  const importedSurfaceStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellCardBackground,
      }
    : undefined;
  const importedWarningPanelStyle = importedSchematicMode
    ? schematicTheme === 'light'
      ? {
          borderColor: '#d97706',
          background: '#fff7ed',
          color: '#7c2d12',
        }
      : {
          borderColor: 'rgba(245,158,11,0.36)',
          background: 'rgba(245,158,11,0.10)',
          color: '#fde68a',
        }
    : undefined;
  const importedWarningTitleStyle = importedSchematicMode
    ? {
        color: schematicTheme === 'light' ? '#92400e' : '#fde68a',
      }
    : undefined;
  const voltageReviewEnabled = !importedSchematicMode;
  const customTemplates = useMemo(
    () => customComponentPackages.map(customComponentPackageToTemplate),
    [customComponentPackages]
  );
  const excludedTemplateIds = useMemo(
    () => customTemplates.map(template => template.id).sort(),
    [customTemplates]
  );
  const {
    items: catalogTemplates,
    total: catalogTotal,
    source: catalogSource,
    isLoading: isCatalogLoading,
    error: catalogError,
    hasMore: catalogHasMore,
    loadMore: loadMoreCatalog,
  } = useComponentCatalog({
    boardId: activeBoardId,
    category: activeCategory,
    search,
    verifiedOnly,
    excludeIds: excludedTemplateIds,
    pageSize: search.trim() ? 24 : 20,
  });
  const platformIoPreview = useMemo(
    () => buildPlatformIoConfigForPackages(activeBoardId, customComponentPackages),
    [activeBoardId, customComponentPackages]
  );
  const arduinoDependencyCount = useMemo(
    () => collectArduinoDependencies(customComponentPackages).length,
    [customComponentPackages]
  );
  const {
    items: libraryItems,
    total: libraryTotal,
    source: librarySource,
    isLoading: isLibraryCatalogLoading,
    error: libraryCatalogError,
    hasMore: libraryHasMore,
    loadMore: loadMoreLibraries,
  } = useArduinoLibraryCatalog({
    search: librarySearch,
    pageSize: librarySearch.trim() ? 24 : 20,
  });
  const installedLibraryNameSet = useMemo(
    () => new Set(installedLibraries.map(library => library.name)),
    [installedLibraries]
  );
  const allTemplates = useMemo(() => {
    const filteredCustom = customTemplates
      .filter(template => matchesComponentCategory(template, activeCategory))
      .filter(template => matchesComponentSearch(template, search))
      .filter(template => {
        if (!verifiedOnly || template.category !== 'SENSOR') return true;
        const status = analyzeComponentForBoard(template, activeBoardId).datasheetStatus;
        return isDatasheetVerifiedStatus(status);
      });

    return [...filteredCustom, ...catalogTemplates];
  }, [customTemplates, activeCategory, search, verifiedOnly, activeBoardId, catalogTemplates]);

  const handleQuickAdd = (template: ComponentTemplate) => {
    const localizedName = getLocalizedTemplateName(template, appLanguage);
    const index = components.length;
    const column = index % 3;
    const row = Math.floor(index / 3);
    const position = {
      x: 360 + column * 210,
      y: 90 + row * 145,
    };

    const result = addComponent(template, position);
    if (!result.success) {
      toast.error(t(`⚠️ "${localizedName}" 추가 실패`, `⚠️ Could not add "${localizedName}"`), {
        description: result.error ?? t('현재 보드 조건에서는 바로 추가할 수 없습니다.', 'This part cannot be added on the current board setup.'),
      });
      return;
    }

    const { components: updated } = useBoardStore.getState();
    const newComp = updated[updated.length - 1];
    if (newComp && !newComp.isFullyRouted) {
      toast.warning(t(`"${localizedName}" 배치 완료`, `"${localizedName}" placed`), {
        description: t('전원선만 먼저 묶였고, 나머지 배선은 추가 확인이 필요합니다.', 'Only power lines were connected first. Please review the remaining wiring.'),
      });
      return;
    }

    toast.success(t(`✅ "${localizedName}" 배치 완료`, `✅ "${localizedName}" placed`), {
      description: t('리뷰 캔버스에 추가했습니다. 필요한 연결은 도면에서 확인하세요.', 'Added it to the review canvas. Check any required connections on the schematic.'),
    });
  };

  // 호환 / 비호환 분류
  const { compatible, incompatible } = useMemo(() => {
    const compatible:   ComponentTemplate[] = [];
    const incompatible: ComponentTemplate[] = [];
    for (const t of allTemplates) {
      if (!voltageReviewEnabled || isVoltageCompatible(t.compatibleVoltage, board.logicVoltage)) {
        compatible.push(t);
      } else {
        incompatible.push(t);
      }
    }
    return { compatible, incompatible };
  }, [allTemplates, board.logicVoltage, voltageReviewEnabled]);

  const incompatibleCount = incompatible.length;
  const visibleTemplateCount = allTemplates.length;
  const availableTemplateCount = catalogTotal + customTemplates.length;

  const handleImportCustomPackageFile = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = importCustomComponentPackage(payload);

      if (!result.success) {
        toast.error(t('커스텀 부품 가져오기 실패', 'Could not import custom part'), { description: result.error });
        return;
      }

      toast.success(t('커스텀 부품 등록 완료', 'Custom part added'), {
        description: t(`${file.name} 패키지를 라이브러리에 추가했습니다.`, `Added ${file.name} to the library.`),
      });
    } catch {
      toast.error(t('커스텀 부품 가져오기 실패', 'Could not import custom part'), {
        description: t('JSON 패키지 파일을 읽는 중 오류가 발생했습니다.', 'There was a problem reading the JSON package file.'),
      });
    }
  };

  const handleImportKiCadSymbolFile = async (file: File) => {
    try {
      const text = await file.text();
      const symbols = extractKiCadSymbols(text);

      if (symbols.length === 0) {
        toast.error(t('KiCad 심볼 가져오기 실패', 'Could not import KiCad symbols'), {
          description: t('읽을 수 있는 심볼 핀 정보가 없습니다. .kicad_sym 파일인지 확인해 주세요.', 'No readable symbol pin data was found. Please check that this is a .kicad_sym file.'),
        });
        return;
      }

      const packages = symbols.map(symbol =>
        kicadSymbolToCustomComponentPackage(symbol, { templateIdPrefix: 'kicad' })
      );

      const importedTemplateIds: string[] = [];
      const failed: string[] = [];

      for (const pkg of packages) {
        const result = importCustomComponentPackage(pkg);
        if (result.success && result.templateId) {
          importedTemplateIds.push(result.templateId);
        } else {
          failed.push(pkg.name);
        }
      }

      if (importedTemplateIds.length === 0) {
        toast.error(t('KiCad 심볼 가져오기 실패', 'Could not import KiCad symbols'), {
          description: t('변환된 심볼을 라이브러리에 등록하지 못했습니다.', 'The converted symbols could not be added to the library.'),
        });
        return;
      }

      toast.success(t('KiCad 심볼 라이브러리 가져오기 완료', 'KiCad symbol import complete'), {
        description:
          failed.length > 0
            ? t(`${importedTemplateIds.length}개 등록, ${failed.length}개는 건너뛰었습니다.`, `Added ${importedTemplateIds.length}, skipped ${failed.length}.`)
            : t(`${importedTemplateIds.length}개 심볼을 커스텀 부품으로 바로 등록했습니다.`, `Added ${importedTemplateIds.length} symbols as custom parts.`),
      });
    } catch {
      toast.error(t('KiCad 심볼 가져오기 실패', 'Could not import KiCad symbols'), {
        description: t('.kicad_sym 파일을 읽는 중 오류가 발생했습니다.', 'There was a problem reading the .kicad_sym file.'),
      });
    }
  };

  const handleExportCustomPackage = (pkg: CustomComponentPackage) => {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${pkg.templateId}.modumake.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(t('커스텀 부품 패키지 저장 완료', 'Custom part package saved'));
  };

  const handleRemoveCustomPackage = (templateId: string) => {
    const result = removeCustomComponentPackage(templateId);
    if (!result.success) {
      toast.error(t('커스텀 부품 삭제 실패', 'Could not delete custom part'), { description: result.error });
      return;
    }

    toast.success(t('커스텀 부품 삭제 완료', 'Custom part deleted'));
  };

  const handleInstallLibrary = (library: ArduinoLibraryCatalogEntry) => {
    if (board.targetLanguage !== 'C++') {
      toast.warning(t('현재 보드는 Arduino 라이브러리 설치 대상이 아닙니다.', 'This board does not use Arduino library installs.'), {
        description: t('C++ 보드에서 라이브러리 매니저를 사용하는 흐름으로 먼저 맞춰두었습니다.', 'The library manager flow is currently set up for C++ boards first.'),
      });
      return;
    }

    const result = installProjectLibrary(library);
    if (result.alreadyInstalled) {
      toast.message(t('이미 이 프로젝트에 설치된 라이브러리입니다.', 'This library is already installed in the project.'), {
        description: library.name,
      });
      return;
    }

    window.dispatchEvent(new CustomEvent('modumake:library-installed', {
      detail: { includes: library.includes },
    }));

    toast.success(t('라이브러리를 프로젝트에 추가했습니다.', 'Library added to the project.'), {
      description: `${library.name} · ${library.includes.join(', ')}`,
    });
  };

  const handleRemoveLibrary = (libraryName: string) => {
    removeProjectLibrary(libraryName);
    toast.success(t('라이브러리를 프로젝트에서 제거했습니다.', 'Library removed from the project.'), {
      description: libraryName,
    });
  };

  if (importedSchematicMode) {
    const importedStats = [
      {
        label: t('도면 부품', 'Schematic parts'),
        value: components.length,
      },
      {
        label: t('원본 배선', 'Original wires'),
        value: importedSchematicScene?.wireSegments.length ?? 0,
      },
      {
        label: t('넷 라벨', 'Net labels'),
        value: importedSchematicScene?.labels.length ?? 0,
      },
      {
        label: t('시트 박스', 'Sheet frames'),
        value: importedSchematicScene?.sheetFrames?.length ?? 0,
      },
    ];

    const reviewSteps = [
      {
        title: t('1. 도면 그대로 보기', '1. View the schematic'),
        body: t(
          'KiCad 원본 심볼, 배선, 라벨을 최대한 그대로 보존해서 보여줍니다.',
          'Keeps KiCad symbols, wires, and labels as close to the source as possible.'
        ),
      },
      {
        title: t('2. 회로 검증 확인', '2. Check circuit review'),
        body: t(
          '전원, 미연결, 쇼트, 매핑 누락처럼 제작 전에 막아야 할 항목을 우측에서 확인합니다.',
          'Review power, missing nets, shorts, and mapping gaps before fabrication.'
        ),
      },
      {
        title: t('3. 팀 피드백 남기기', '3. Leave team feedback'),
        body: t(
          '공유 링크에서 도면 위치와 부품을 기준으로 코멘트를 남기는 흐름이 중심입니다.',
          'The main workflow is commenting on schematic locations and parts through a shared link.'
        ),
      },
    ];

    return (
      <aside
        data-mm-scope="sidebar"
        className="flex h-full w-full flex-col border-r"
        style={{
          background: importedPalette.shellPanelBackground,
          borderColor: importedPalette.shellBorder,
          color: importedPalette.shellForeground,
        }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: importedPalette.shellBorder }}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold" style={{ color: importedPalette.shellForeground }}>
              <Layers size={14} className="text-sky-400" />
              <span className="truncate">{t('도면 리뷰', 'Schematic review')}</span>
            </h2>
            <Badge
              className="ml-auto border-none text-[10px] font-mono"
              style={{
                background: 'rgba(14,165,233,0.14)',
                color: '#7dd3fc',
              }}
            >
              KiCad
            </Badge>
            {onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
                style={{
                  borderColor: importedPalette.shellBorder,
                  background: importedPalette.shellElevatedBackground,
                  color: importedPalette.shellMutedText,
                }}
                title={t('왼쪽 패널 접기', 'Collapse left panel')}
              >
                <ChevronLeft size={14} />
              </button>
            ) : null}
          </div>

          <div
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              borderColor: importedPalette.shellBorder,
              background: importedPalette.shellElevatedBackground,
              color: importedPalette.shellMutedText,
            }}
          >
            {t(
              '이 화면은 부품을 새로 고르는 곳이 아니라, 업로드한 회로도를 검토하고 공유하는 곳입니다.',
              'This screen is for reviewing and sharing the uploaded schematic, not for picking new parts.'
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 px-3 py-3">
          {shouldShowReimportGuidance ? (
            <div
              className="mb-3 rounded-xl border p-3 transition-all duration-200"
              style={{
                ...importedWarningPanelStyle,
                borderStyle: isDraggingReimport ? 'dashed' : 'solid',
                borderColor: isDraggingReimport
                  ? (schematicTheme === 'light' ? '#ea580c' : '#fbbf24')
                  : (importedWarningPanelStyle?.borderColor ?? '#d97706'),
                background: isDraggingReimport
                  ? (schematicTheme === 'light' ? '#ffedd5' : 'rgba(245,158,11,0.18)')
                  : (importedWarningPanelStyle?.background ?? '#fff7ed'),
              }}
              onDragOver={handleReimportDragOver}
              onDragLeave={handleReimportDragLeave}
              onDrop={handleReimportDrop}
            >
              <div className="flex items-center gap-2 text-[11px] font-bold" style={importedWarningTitleStyle}>
                <AlertTriangle size={13} />
                {t('이 저장본은 다시 import가 필요할 수 있음', 'This saved review may need a re-import')}
              </div>
              <p
                className="mt-2 text-[11px] leading-relaxed"
                style={{
                  color: schematicTheme === 'light' ? '#7c2d12' : importedPalette.shellMutedText,
                }}
              >
                {hasLegacyImportedScene
                  ? t(
                      '예전에 저장된 imported schematic이라 원본 배선/라벨 레이어가 빠져 있을 수 있습니다. 같은 .kicad_sch 파일을 한 번 다시 올리면 선과 심볼을 최신 기준으로 다시 맞춥니다.',
                      'This looks like an older imported schematic save with missing source wire or label layers. Re-import the same .kicad_sch once to rebuild wires and symbols with the latest alignment rules.'
                    )
                  : t(
                      '이 저장본에는 원본 KiCad 텍스트가 남아 있지 않아 일부 검토 정보가 legacy 경로를 탈 수 있습니다. 가능하면 같은 .kicad_sch 파일을 다시 올려 최신 검증 경로로 바꿔 주세요.',
                      'This save no longer contains the original KiCad text, so some review data can fall back to the legacy path. If possible, re-import the same .kicad_sch to switch back to the current validation path.'
                    )}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2 border-amber-500/10">
                <span className="text-[10px] text-amber-500/80 font-medium">
                  {isDraggingReimport ? t('파일을 놓아주세요!', 'Drop the file here!') : t('kicad_sch 드래그 가능', 'kicad_sch drag-and-drop supported')}
                </span>
                <button
                  type="button"
                  onClick={() => reimportFileInputRef.current?.click()}
                  className="inline-flex h-6 items-center justify-center gap-1 rounded-md border px-2.5 text-[10px] font-bold transition-all hover:brightness-110 active:scale-95"
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
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {importedStats.map(item => (
              <div
                key={item.label}
                className="rounded-lg border px-3 py-2"
                style={{
                  borderColor: importedPalette.shellBorder,
                  background: importedPalette.shellCardBackground,
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: importedPalette.shellMutedText }}>
                  {item.label}
                </div>
                <div className="mt-1 text-base font-bold text-sky-300">{item.value}</div>
              </div>
            ))}
          </div>

          <div
            className="mt-3 rounded-xl border p-3"
            style={{
              borderColor: importedPalette.shellBorder,
              background: importedPalette.shellSubtleBackground,
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              {t('리뷰 흐름', 'Review flow')}
            </div>
            <div className="mt-3 space-y-2">
              {reviewSteps.map(step => (
                <div
                  key={step.title}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor: importedPalette.shellBorder,
                    background: importedPalette.shellCardBackground,
                  }}
                >
                  <div className="text-xs font-bold" style={{ color: importedPalette.shellForeground }}>
                    {step.title}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed" style={{ color: importedPalette.shellMutedText }}>
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-3 rounded-xl border p-3"
            style={importedWarningPanelStyle}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-200" style={importedWarningTitleStyle}>
              <AlertTriangle size={13} />
              {t('새 설계 기능은 숨김', 'New-design tools hidden')}
            </div>
            <p
              className="mt-2 text-[11px] leading-relaxed"
              style={{
                color: schematicTheme === 'light' ? '#7c2d12' : importedPalette.shellMutedText,
              }}
            >
              {t(
                '이 화면은 새 부품을 고르는 곳이 아니라, 이미 있는 회로를 검토하고 의견을 남기는 흐름에 맞춰 둔 상태입니다.',
                'This view is tuned for reviewing an existing schematic and leaving feedback, not for browsing new parts.'
              )}
            </p>
          </div>
        </ScrollArea>
      </aside>
    );
  };

  if (mode === 'review-progress') {
      return (
        <SidebarReviewProgress
          appLanguage={appLanguage}
          boardName={board.name}
          componentsCount={components.length}
        issueCount={reviewSummary?.issueCount ?? 0}
          reviewSummary={reviewSummary}
          reviewModes={reviewModes}
          onSelectReviewMode={onSelectReviewMode}
          onCollapse={onCollapse}
        />
      );
  }

  return (
    <>
    <aside
      data-mm-scope="sidebar"
      className="flex flex-col w-full h-full border-r"
      style={{
        background: importedSchematicMode ? importedPalette.shellPanelBackground : '#080e1d',
        borderColor: importedSchematicMode ? importedPalette.shellBorder : 'rgba(37,99,235,0.15)',
      }}
    >
      {/* 패널 헤더 */}
      <div className="px-4 py-3 border-b" style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : 'rgba(255,255,255,0.05)' }}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-bold text-sm flex items-center gap-2 min-w-0" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#ffffff' }}>
            <Layers size={14} className="text-blue-400" />
            <span className="truncate">{t('부품 라이브러리', 'Parts library')}</span>
          </h2>
          {onBackToReview ? (
            <button
              type="button"
              onClick={onBackToReview}
              className="rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors"
              style={{
                borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
                background: importedSchematicMode ? importedPalette.shellElevatedBackground : 'rgba(2,6,23,0.60)',
                color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8',
              }}
            >
              {t('검증으로', 'Back to review')}
            </button>
          ) : null}
          <Badge
            className="ml-auto text-xs font-mono"
            style={{ background: 'rgba(37,99,235,0.2)', color: '#60a5fa', border: 'none' }}
          >
            {appLanguage === 'ko' ? `${availableTemplateCount}종` : `${availableTemplateCount} types`}
          </Badge>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="h-7 w-7 flex items-center justify-center rounded-md border transition-colors"
              style={{
                borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
                background: importedSchematicMode ? importedPalette.shellElevatedBackground : 'rgba(2,6,23,0.60)',
                color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8',
              }}
              title={t('부품 라이브러리 접기', 'Collapse parts library')}
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-[10px]">
          <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5" style={importedStatStyle}>
            <span className="text-slate-500 block">{t('현재 보드', 'Current board')}</span>
            <span className="text-[#93c5fd] font-bold truncate block">{board.name}</span>
          </div>
          <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5" style={importedStatStyle}>
            <span className="text-slate-500 block">{t('즉시 사용', 'Ready now')}</span>
            <span className="text-[#86efac] font-bold">{appLanguage === 'ko' ? `${compatible.length}개` : `${compatible.length}`}</span>
          </div>
          <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5" style={importedStatStyle}>
            <span className="text-slate-500 block">{t('보류 확인', 'Needs review')}</span>
            <span className="text-[#fca5a5] font-bold">{appLanguage === 'ko' ? `${incompatibleCount}개` : `${incompatibleCount}`}</span>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5" style={importedStatStyle}>
            <span className="text-slate-500 block">Library</span>
            <span className="text-slate-300 font-bold">
              {catalogSource === 'supabase' ? 'Cloud catalog' : 'Starter catalog'}
            </span>
          </div>
          <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5" style={importedStatStyle}>
            <span className="text-slate-500 block">Loaded Now</span>
            <span className="text-[#86efac] font-bold">{appLanguage === 'ko' ? `${visibleTemplateCount}개 로드됨` : `${visibleTemplateCount} loaded`}</span>
          </div>
        </div>

        {/* 검색창 */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('부품 검색...', 'Search parts...')}
            className="pl-8 h-8 text-xs bg-slate-800/60 border-slate-700/50 text-white placeholder-gray-600 focus:border-blue-500/60 focus:ring-0"
            style={importedSchematicMode ? {
              background: importedPalette.shellElevatedBackground,
              borderColor: importedPalette.shellBorder,
              color: importedPalette.shellForeground,
            } : undefined}
          />
        </div>

        <div
          className="mt-3 flex items-center justify-between gap-2 border px-2.5 py-2 text-[10px]"
          style={{
            borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
              background: importedSchematicMode ? importedPalette.shellElevatedBackground : 'rgba(2,6,23,0.50)',
            }}
          >
          <div>
            <span className="text-slate-500 block">Datasheet Gate</span>
            <span className="text-slate-300 font-bold">{t('공식 문서 확인 센서 우선', 'Verified sensors first')}</span>
          </div>
          <button
            type="button"
            onClick={() => setVerifiedOnly(prev => !prev)}
            className="px-2 py-1 border text-[10px] font-bold transition-colors"
            style={{
              background: verifiedOnly ? 'rgba(34,197,94,0.16)' : '#0d1117',
              borderColor: verifiedOnly ? 'rgba(34,197,94,0.45)' : '#30363d',
              color: verifiedOnly ? '#bbf7d0' : '#94a3b8',
            }}
          >
            {verifiedOnly ? t('검증된 센서만', 'Verified only') : t('전체 보기', 'Show all')}
          </button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-1 px-3 py-2 flex-wrap border-b" style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : 'rgba(255,255,255,0.05)' }}>
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            className="px-2 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              background:  activeCategory === tab.id ? tab.color + '25' : 'transparent',
              color:       activeCategory === tab.id ? tab.color : '#64748b',
              border:      `1px solid ${activeCategory === tab.id ? tab.color + '60' : 'transparent'}`,
            }}
          >
            {pickLanguage(appLanguage, tab.label)}
          </button>
        ))}
      </div>

      {/* 전압 경고 배너 (비호환 부품이 있을 때) */}
      {voltageReviewEnabled && incompatibleCount > 0 && (
        <div
          className="mx-3 mt-2 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-xs leading-tight">
            {t(
              `${incompatibleCount}개 부품이 ${board.logicVoltage} 보드와 호환되지 않습니다.`,
              `${incompatibleCount} parts are not compatible with ${board.logicVoltage} boards.`
            )}
          </p>
        </div>
      )}

      {/* 안내 텍스트 */}
      <div className="px-4 py-2 text-[10px] border-b border-white/5" style={{ color: importedSchematicMode ? importedPalette.shellMutedText : '#64748b', borderColor: importedSchematicMode ? importedPalette.shellBorder : 'rgba(255,255,255,0.05)' }}>
        {t(
          '처음에는 자주 쓰는 부품만 가볍게 불러오고, 검색할수록 더 가져옵니다. 드래그하거나 `+` 버튼으로 바로 배치할 수 있습니다.',
          'We start with common parts and load more as you search. Drag a part in or use `+` to place it right away.'
        )}
      </div>

      {/* 부품 목록 */}
      <ScrollArea className="flex-1 px-3 py-1">
        {isCatalogLoading && visibleTemplateCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Layers size={24} className="text-slate-700 mb-2 animate-pulse" />
            <p className="text-slate-500 text-sm">{t('부품 카탈로그를 불러오는 중입니다', 'Loading parts catalog')}</p>
          </div>
        ) : visibleTemplateCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search size={24} className="text-gray-700 mb-2" />
            <p className="text-gray-600 text-sm">{t('검색 결과가 없습니다', 'No matching parts found')}</p>
          </div>
        ) : (
          <>
            {/* 호환 부품 먼저 */}
            {compatible.map(template => (
              <ComponentCard
                key={template.id}
                template={template}
                isCompatible={true}
                boardId={activeBoardId}
                boardVoltage={board.logicVoltage}
                appLanguage={appLanguage}
                onQuickAdd={handleQuickAdd}
                importedSchematicMode={importedSchematicMode}
              />
            ))}

            {/* 비호환 구분선 */}
            {incompatible.length > 0 && compatible.length > 0 && (
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.2)' }} />
                <span className="text-xs text-red-500/60 font-medium">{t(`비호환 (${incompatibleCount})`, `Incompatible (${incompatibleCount})`)}</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.2)' }} />
              </div>
            )}

            {/* 비호환 부품 (하단에 흐리게) */}
            {incompatible.map(template => (
                <ComponentCard
                  key={template.id}
                  template={template}
                  isCompatible={false}
                  boardId={activeBoardId}
                  boardVoltage={board.logicVoltage}
                  appLanguage={appLanguage}
                  onQuickAdd={handleQuickAdd}
                  importedSchematicMode={importedSchematicMode}
                />
              ))}
            {catalogError && (
              <div
                className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
                style={importedWarningPanelStyle}
              >
                {t('카탈로그 요청 중 경고가 있었지만, 현재 불러온 목록은 계속 사용할 수 있습니다.', 'There was a catalog warning, but you can keep using the loaded list.')}
              </div>
            )}
            {catalogHasMore && (
              <button
                type="button"
                onClick={loadMoreCatalog}
                className="mt-3 flex w-full items-center justify-center rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
                style={importedSurfaceStyle}
              >
                {isCatalogLoading ? t('불러오는 중...', 'Loading...') : t('더 보기', 'Load more')}
              </button>
            )}
          </>
        )}
      </ScrollArea>

      <div className="border-t border-white/5 px-3 py-3" style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : 'rgba(255,255,255,0.05)' }}>

        <button
          type="button"
          onClick={() => setIsArduinoLibraryManagerOpen(true)}
          className="mb-2 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors hover:border-slate-700"
          style={{
            borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
            background: importedSchematicMode ? importedPalette.shellElevatedBackground : 'rgba(2,6,23,0.50)',
          }}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-sky-300" />
            <div>
              <div className="text-xs font-bold text-slate-200">{t('라이브러리 관리자', 'Library manager')}</div>
              <div className="text-[10px] text-slate-500">{t('검색 · 설치 · 프로젝트별 헤더 반영', 'Search, install, and add project headers')}</div>
            </div>
          </div>
          <Badge
            className="text-[10px] font-mono"
            style={{ background: 'rgba(14,165,233,0.18)', color: '#7dd3fc', border: 'none' }}
          >
            {installedLibraries.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setIsLibraryManagerOpen(true)}
          className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors hover:border-slate-700"
          style={{
            borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
            background: importedSchematicMode ? importedPalette.shellElevatedBackground : 'rgba(2,6,23,0.50)',
          }}
        >
          <div className="flex items-center gap-2">
            <FileJson size={14} className="text-violet-300" />
            <div>
              <div className="text-xs font-bold text-slate-200">{t('커스텀 부품 관리', 'Manage custom parts')}</div>
              <div className="text-[10px] text-slate-500">{t('JSON 패키지 + KiCad 심볼 가져오기 / 내보내기 / 삭제', 'Import, export, or remove JSON packages and KiCad symbols')}</div>
            </div>
          </div>
          <Badge
            className="text-[10px] font-mono"
            style={{ background: 'rgba(124,58,237,0.18)', color: '#c4b5fd', border: 'none' }}
          >
            {customComponentPackages.length}
          </Badge>
        </button>
      </div>
    </aside>
      <input
        ref={customFileInputRef}
        type="file"
        accept=".json,.modumake.json,application/json"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportCustomPackageFile(file);
          }
          if (currentTarget) {
            currentTarget.value = '';
          }
        }}
      />
      <input
        ref={kicadFileInputRef}
        type="file"
        accept=".kicad_sym,text/plain"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportKiCadSymbolFile(file);
          }
          if (currentTarget) {
            currentTarget.value = '';
          }
        }}
      />
      <input
        ref={reimportFileInputRef}
        type="file"
        accept=".kicad_sch"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleReimportKiCadSchematic(file);
          }
          if (currentTarget) {
            currentTarget.value = '';
          }
        }}
      />
      <Dialog open={isLibraryManagerOpen} onOpenChange={setIsLibraryManagerOpen}>
        <DialogContent
          showCloseButton
          className="w-[min(860px,calc(100vw-2rem))] max-w-none rounded-xl border border-slate-800 bg-[#0b1220] p-0 text-slate-200"
        >
          <DialogHeader className="border-b border-slate-800 px-5 py-4">
            <DialogTitle className="text-sm font-bold text-slate-100">{t('커스텀 라이브러리 매니저', 'Custom library manager')}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-slate-400">
              {t(
                '`.modumake.json` 패키지와 `.kicad_sym` 심볼 파일을 바로 가져와서, 커스텀 부품 라이브러리로 이어서 쓸 수 있습니다.',
                'Import `.modumake.json` packages and `.kicad_sym` files directly into your custom parts library.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="border-b border-slate-800 p-5 lg:border-r lg:border-b-0">
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => customFileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/10 px-4 py-4 text-sm font-bold text-violet-200 transition-colors hover:bg-violet-500/15"
                >
                  <Plus size={16} />
                  {t('JSON 패키지 가져오기', 'Import JSON package')}
                </button>

                <button
                  type="button"
                  onClick={() => kicadFileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-500/40 bg-sky-500/10 px-4 py-4 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/15"
                >
                  <Download size={16} />
                  KiCad 심볼 가져오기
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">동적 확장 범위</div>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-300">
                  <li>- 새 센서 템플릿 등록</li>
                  <li>- Arduino 의존성 메타데이터 저장</li>
                  <li>- AI 힌트 프롬프트 주입</li>
                  <li>- 브라우저 로컬 영구 저장</li>
                  <li>- KiCad 심볼 핀맵 즉시 변환</li>
                </ul>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">커뮤니티 탐색기</div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Supabase 기반 공개 카탈로그 검색 API와 느린 전체 로딩을 피하는 페이지 단위 로딩 구조까지 연결해 두었습니다.
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">의존성 준비도</div>
                  <Badge
                    className="text-[10px] font-mono"
                    style={{
                      background: arduinoDependencyCount > 0 ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.14)',
                      color: arduinoDependencyCount > 0 ? '#bbf7d0' : '#cbd5e1',
                      border: 'none',
                    }}
                  >
                    {arduinoDependencyCount > 0 ? 'PlatformIO Ready' : 'No extra libs'}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  커스텀 패키지에 들어 있는 Arduino 라이브러리 정보는 저장되고, AI 코드 생성 프롬프트와 이후 원격 빌드 파이프라인에서 그대로 재사용됩니다.
                </p>
              </div>
            </div>
            <div className="min-h-[420px] p-5">
              {customComponentPackages.length === 0 ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                  {t('아직 등록된 커스텀 부품이 없습니다. JSON 패키지를 가져오면 여기에서 바로 관리할 수 있습니다.', 'No custom parts have been added yet. Import a JSON package to manage it here.')}
                </div>
              ) : (
                <div className="space-y-3">
                  {customComponentPackages.map(pkg => (
                    <div key={pkg.templateId} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-100">{pkg.name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {pkg.templateId} · {pkg.category ?? 'SENSOR'} · {pkg.compatibleVoltage} · v{pkg.version}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportCustomPackage(pkg)}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-950/40 text-slate-300 hover:text-white"
                            title={t('패키지 내보내기', 'Export package')}
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomPackage(pkg.templateId)}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-950/60 bg-red-950/20 text-red-300 hover:text-red-100"
                            title={t('패키지 삭제', 'Delete package')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">핀 구성</div>
                          <div className="mt-1 text-[11px] text-slate-200">{pkg.requiredPins.map(pin => pin.name).join(', ')}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('Arduino 의존성', 'Arduino deps')}</div>
                          <div className="mt-1 text-[11px] text-slate-200">{appLanguage === 'ko' ? `${pkg.dependencies?.arduino?.length ?? 0}개` : `${pkg.dependencies?.arduino?.length ?? 0}`}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('AI 힌트', 'AI hints')}</div>
                          <div className="mt-1 text-[11px] text-slate-200">{appLanguage === 'ko' ? `${pkg.aiHints ? Object.keys(pkg.aiHints).length : 0}개` : `${pkg.aiHints ? Object.keys(pkg.aiHints).length : 0}`}</div>
                        </div>
                      </div>
                      {(pkg.dependencies?.arduino?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">Arduino Libraries</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(pkg.dependencies?.arduino ?? []).map(dep => (
                              <Badge
                                key={`${pkg.templateId}-${dep.name}-${dep.version ?? 'latest'}`}
                                className="border-none text-[10px] font-mono"
                                style={{ background: 'rgba(37,99,235,0.16)', color: '#bfdbfe' }}
                              >
                                {formatArduinoDependencyLabel(dep)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {pkg.aiHints && Object.keys(pkg.aiHints).length > 0 && (
                        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">AI Hint Keys</div>
                          <div className="mt-1 text-[11px] text-slate-200">{Object.keys(pkg.aiHints).join(', ')}</div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-100">{t('PlatformIO 미리보기', 'PlatformIO preview')}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {t('현재 보드 기준으로 외부 Arduino 라이브러리 설정이 어떻게 묶이는지 미리 봅니다.', 'Preview how external Arduino library settings are grouped for the current board.')}
                        </div>
                      </div>
                      <Badge
                        className="text-[10px] font-mono"
                        style={{
                          background: platformIoPreview ? 'rgba(37,99,235,0.16)' : 'rgba(148,163,184,0.14)',
                          color: platformIoPreview ? '#bfdbfe' : '#cbd5e1',
                          border: 'none',
                        }}
                      >
                        {platformIoPreview ? board.name : t('C++ 보드 전용', 'C++ board only')}
                      </Badge>
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-[#080d18] p-3 text-[11px] leading-relaxed text-slate-300">
{platformIoPreview ?? t('Raspberry Pi 같은 Python 보드는 PlatformIO 대신 Python 패키지/런타임 경로로 분기합니다.', 'Python boards like Raspberry Pi use Python package/runtime paths instead of PlatformIO.')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isArduinoLibraryManagerOpen} onOpenChange={setIsArduinoLibraryManagerOpen}>
        <DialogContent
          showCloseButton
          className="w-[min(920px,calc(100vw-2rem))] max-w-none rounded-xl border border-slate-800 bg-[#0b1220] p-0 text-slate-200"
        >
          <DialogHeader className="border-b border-slate-800 px-5 py-4">
            <DialogTitle className="text-sm font-bold text-slate-100">{t('웹 라이브러리 매니저', 'Web library manager')}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-slate-400">
              {t(
                '아두이노 IDE처럼 원하는 라이브러리를 검색해서 이 프로젝트에만 붙일 수 있습니다. 설치한 항목은 코드 생성과 클라우드 컴파일 준비 상태에 함께 반영됩니다.',
                'Search for libraries like Arduino IDE and attach them only to this project. Installed items are reflected in code generation and cloud compile readiness.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-b border-slate-800 p-5 lg:border-r lg:border-b-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLibraryTab('catalog')}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-bold transition-colors"
                  style={{
                    background: libraryTab === 'catalog' ? 'rgba(14,165,233,0.16)' : 'rgba(15,23,42,0.42)',
                    borderColor: libraryTab === 'catalog' ? 'rgba(56,189,248,0.36)' : 'rgba(51,65,85,0.7)',
                    color: libraryTab === 'catalog' ? '#bae6fd' : '#94a3b8',
                  }}
                >
                  {t('검색 결과', 'Search results')}
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryTab('installed')}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-bold transition-colors"
                  style={{
                    background: libraryTab === 'installed' ? 'rgba(34,197,94,0.16)' : 'rgba(15,23,42,0.42)',
                    borderColor: libraryTab === 'installed' ? 'rgba(74,222,128,0.36)' : 'rgba(51,65,85,0.7)',
                    color: libraryTab === 'installed' ? '#bbf7d0' : '#94a3b8',
                  }}
                >
                  {t(`설치됨 ${installedLibraries.length}`, `Installed ${installedLibraries.length}`)}
                </button>
              </div>

              <div className="relative mt-4">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  value={librarySearch}
                  onChange={event => setLibrarySearch(event.target.value)}
                  placeholder={t('라이브러리 검색...', 'Search libraries...')}
                  className="pl-8 h-9 text-xs bg-slate-800/60 border-slate-700/50 text-white placeholder-gray-600 focus:border-sky-500/60 focus:ring-0"
                />
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">현재 경로</div>
                  <Badge
                    className="text-[10px] font-mono"
                    style={{
                      background: librarySource === 'supabase' ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.14)',
                      color: librarySource === 'supabase' ? '#bbf7d0' : '#cbd5e1',
                      border: 'none',
                    }}
                  >
                    {librarySource === 'supabase' ? 'Cloud catalog' : 'Starter catalog'}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {t(
                    `지금은 ${board.targetLanguage === 'C++' ? '설치와 헤더 반영' : '검색과 검토'} 흐름까지 연결되어 있습니다.`,
                    `Right now this is wired through the ${board.targetLanguage === 'C++' ? 'install-and-header' : 'search-and-review'} flow.`
                  )}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">프로젝트 반영 방식</div>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-300">
                  <li>- 프로젝트별 설치 목록 저장</li>
                  <li>- 코드 에디터 상단에 헤더 자동 삽입</li>
                  <li>- AI 코드 생성 프롬프트에 라이브러리 문맥 전달</li>
                  <li>- 클라우드 컴파일 준비도에 명시적 의존성 반영</li>
                </ul>
              </div>
            </div>
            <div className="min-h-[480px] p-5">
              {libraryTab === 'installed' ? (
                installedLibraries.length === 0 ? (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                    {t('아직 이 프로젝트에 설치된 라이브러리가 없습니다. 검색 결과에서 바로 추가해 주세요.', 'No libraries are installed in this project yet. Add one directly from the search results.')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {installedLibraries.map(library => (
                      <div key={library.name} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-100">{library.name}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {library.author ?? t('알 수 없음', 'Unknown')} · {library.version}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveLibrary(library.name)}
                            className="rounded-md border border-red-950/60 bg-red-950/20 px-3 py-1.5 text-[11px] font-bold text-red-200 transition-colors hover:bg-red-950/35"
                          >
                            {t('제거', 'Remove')}
                          </button>
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{library.sentence ?? t('설명이 준비되지 않았습니다.', 'No description is available yet.')}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {library.includes.map(include => (
                            <Badge
                              key={`${library.name}-${include}`}
                              className="border-none text-[10px] font-mono"
                              style={{ background: 'rgba(14,165,233,0.16)', color: '#bae6fd' }}
                            >
                              {include}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : isLibraryCatalogLoading && libraryItems.length === 0 ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                  {t('라이브러리 카탈로그를 불러오는 중입니다.', 'Loading library catalog.')}
                </div>
              ) : (
                <div className="space-y-3">
                  {libraryItems.map(library => {
                    const installed = installedLibraryNameSet.has(library.name);
                    return (
                      <div key={library.name} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-100">{library.name}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {library.author} · {library.category}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={installed}
                            onClick={() => handleInstallLibrary(library)}
                            className="rounded-md border px-3 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-default"
                            style={{
                              background: installed ? 'rgba(34,197,94,0.14)' : 'rgba(14,165,233,0.14)',
                              borderColor: installed ? 'rgba(74,222,128,0.28)' : 'rgba(56,189,248,0.28)',
                              color: installed ? '#bbf7d0' : '#bae6fd',
                              opacity: board.targetLanguage === 'C++' ? 1 : 0.75,
                            }}
                            title={board.targetLanguage === 'C++' ? undefined : t('현재는 Arduino C++ 보드용 설치 흐름만 연결되어 있습니다.', 'The install flow is currently connected only for Arduino C++ boards.')}
                          >
                            {installed ? (
                              <span className="inline-flex items-center gap-1"><Check size={12} />{t('설치됨', 'Installed')}</span>
                            ) : t('설치', 'Install')}
                          </button>
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{library.sentence}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {library.includes.map(include => (
                            <Badge
                              key={`${library.name}-${include}`}
                              className="border-none text-[10px] font-mono"
                              style={{ background: 'rgba(99,102,241,0.16)', color: '#c7d2fe' }}
                            >
                              {include}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {libraryCatalogError && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                      {t('라이브러리 카탈로그 요청 중 경고가 있었지만, 현재 불러온 목록은 계속 사용할 수 있습니다.', 'There was a library catalog warning, but you can keep using the loaded list.')}
                    </div>
                  )}
                  {libraryHasMore && (
                    <button
                      type="button"
                      onClick={loadMoreLibraries}
                      className="flex w-full items-center justify-center rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
                    >
                      {isLibraryCatalogLoading ? t('불러오는 중...', 'Loading...') : t(`더 보기 · ${libraryItems.length}/${libraryTotal}`, `Load more · ${libraryItems.length}/${libraryTotal}`)}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
