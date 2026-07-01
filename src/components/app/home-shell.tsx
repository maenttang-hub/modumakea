'use client';

/**
 * app/page.tsx
 * 메인 대시보드 - EasyEDA 스타일의 4단 분할 리사이저블 레이아웃 (리팩토링 버전)
 * - 설정(LAYOUT_CONFIG)을 최상단으로 분리하여 패널 비율 조정 용이성 제공
 * - 드래그용 커스텀 구분선 Handle을 컴포넌트로 독립화
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { ComponentCanvas } from '@/components/canvas/component-canvas';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import { AppContextMenu } from '@/components/dashboard/app-context-menu';
import { PcbWorkspace } from '@/components/dashboard/pcb-workspace';
import { WorkspaceModeBar } from '@/components/dashboard/workspace-mode-bar';
import { useProjectComments } from '@/components/comments/project-comments-provider';
import { BottomBar } from '@/components/layout/bottom-bar';
import { TitleBar } from '@/components/layout/title-bar';
import { WorkspaceShell } from '@/components/layout/workspace-shell';
import { SidebarLeft } from '@/components/sidebar-left/sidebar-left';
import { AiReviewPanel } from '@/components/sidebar-right/ai-review-panel';
import { CodeReviewPanel } from '@/components/sidebar-right/code-review-panel';
import { PropertyPanel } from '@/components/sidebar-right/property-panel';
import { SidebarRight } from '@/components/sidebar-right/sidebar-right';
import { getSafeRightTab, getVisibleRightTabs, type RightPanelTab, type ShellMode } from '@/components/app/home-shell-layout';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { getSurfaceFlags } from '@/constants/product-surface';
import { recordBetaEvent } from '@/lib/beta-telemetry';
import { getLocalizedTemplateName } from '@/lib/catalog-i18n';
import { buildCloudProjectPath } from '@/lib/cloud-projects';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import { detectKiCadFileKind, type KiCadFileKind } from '@/lib/kicad-file-kind';
import { importKiCadSchematicAsync } from '@/lib/import-kicad-schematic-async';
import {
  buildImportFailureReport,
  buildImportFileTelemetryAttributes,
  type ImportFailureStage,
} from '@/lib/import-failure-report';
import { getProductFeedbackHref } from '@/lib/product-config';
import { getImportedPcbIssueId, isImportedPcbAuditIssue } from '@/lib/imported-pcb-audit-issues';
import { validateImportedPcbDocument } from '@/lib/imported-pcb-validation';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import { pickLanguage } from '@/lib/ui-language';
import { useAppContextMenu } from '@/hooks/use-app-context-menu';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useCloudProjectLoader } from '@/hooks/use-cloud-project-loader';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useUiPreferences, type RightTabValue } from '@/hooks/use-ui-preferences';
import { useValidationReport } from '@/hooks/use-validation-report';
import { useBoardStore } from '@/store/use-board-store';
import { persistReportWorkspaceSnapshot } from '@/lib/report-workspace-snapshot';
import {
  AlertTriangle,
  FileUp,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { COMMENT_PANEL_OPEN_EVENT } from '@/lib/comment-focus';
import { buildReviewIssueKey, emitReviewFocus, REVIEW_FOCUS_EVENT, type ReviewFocusDetail } from '@/lib/review-focus';
import { getDevScenarioDocument } from '@/lib/dev-scenarios';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { countIssueSeverities } from '@/lib/validation-issue-classification';
import type { AppLanguage, ComponentTemplate, ProjectAuditIssue } from '@/types';

const UI_PREFERENCES_STORAGE_KEY = 'modumake-ui-preferences-v2';

function normalizeLegacyRightTab(tab: RightTabValue): RightPanelTab {
  switch (tab) {
    case 'code':
    case 'comments':
    case 'validation':
      return tab;
    case 'inspector':
    case 'simulation':
    default:
      return 'validation';
  }
}

type WorkspacePresence = 'empty' | 'restored' | 'imported';
type WorkspaceFileKind = WorkspacePresence | 'pcb';

type KiCadImportProgress = {
  status: 'running' | 'failed';
  fileName: string;
  title: string;
  description: string;
  recoveryActions?: string[];
};

function buildWorkspaceFileLabel({
  projectName,
  presence,
}: {
  projectName: string;
  presence: WorkspaceFileKind;
}) {
  if (presence === 'imported') {
    return `${projectName || 'project'}.kicad_sch`;
  }

  if (presence === 'pcb') {
    return `${projectName || 'project'}.kicad_pcb`;
  }

  if (presence === 'restored') {
    return `${projectName || 'project'}.modumake.json`;
  }

  return '파일을 열어주세요';
}

function KiCadImportProgressOverlay({
  progress,
  onOpenFile,
}: {
  progress: KiCadImportProgress;
  onOpenFile: () => void;
}) {
  const failed = progress.status === 'failed';

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#fbf7ef]/88 p-6 backdrop-blur-sm"
      aria-live="polite"
      data-testid="kicad-import-progress"
    >
      <div className="w-full max-w-md rounded-[14px] border border-[#ded2c2] bg-[#fffdf9] px-5 py-4 text-left shadow-[0_18px_48px_rgba(88,68,50,0.16)]">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
              failed
                ? 'border-[#efd3d3] bg-[#fff8f8] text-[#b24f4f]'
                : 'border-[#dce8f3] bg-[#f8fbff] text-[#4f84be]'
            }`}
          >
            {failed ? <AlertTriangle size={17} /> : <Loader2 size={17} className="animate-spin" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#3f342c]">{progress.title}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-[#7f7265]" title={progress.fileName}>
              {progress.fileName}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-[#75685c]">{progress.description}</div>
            {failed && progress.recoveryActions?.length ? (
              <div className="mt-3 space-y-1 text-[10px] leading-5 text-[#8a7868]">
                {progress.recoveryActions.slice(0, 2).map(action => (
                  <div key={action}>- {action}</div>
                ))}
              </div>
            ) : null}
            {failed ? (
              <button
                type="button"
                onClick={onOpenFile}
                className="mt-4 inline-flex h-8 items-center justify-center rounded-[9px] bg-[#4f84be] px-3 text-[11px] font-semibold text-white transition hover:bg-[#3f74af]"
              >
                파일 다시 선택
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export type HomeShellProps = {
  initialCloudProjectId?: string;
  initialAppLanguage?: AppLanguage;
};

export default function HomeShell({ initialCloudProjectId, initialAppLanguage }: HomeShellProps = {}) {
  const router = useRouter();
  const surfaceFlags = getSurfaceFlags();
  const { isLoading: isCloudProjectLoading, error: cloudProjectLoadError } =
    useCloudProjectLoader(initialCloudProjectId);
  useAutoSave();
  const workspaceMode = useBoardStore(state => state.workspaceMode);
  const [, setSelectedCanvasNodeIds] = useState<string[]>([]);
  const [reviewDropActive, setReviewDropActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editorRightTab, setEditorRightTab] = useState<'ai' | 'property' | 'code'>('ai');
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select');
  const [canvasZoomLabel, setCanvasZoomLabel] = useState('100%');
  const [importProgress, setImportProgress] = useState<KiCadImportProgress | null>(null);
  const [leftSectionState, setLeftSectionState] = useState({
    components: false,
    nets: false,
    files: false,
  });
  const schematicFileInputRef = useRef<HTMLInputElement | null>(null);
  const codeFileInputRef = useRef<HTMLInputElement | null>(null);
  const importedDensityAppliedRef = useRef(false);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const importedSchematicViewMode = useBoardStore(state => state.importedSchematicViewMode);
  const setImportedSchematicViewMode = useBoardStore(state => state.setImportedSchematicViewMode);
  const appLanguage = useBoardStore(state => state.appLanguage);
  const setAppLanguage = useBoardStore(state => state.setAppLanguage);
  const components = useBoardStore(state => state.components);
  const manualConnections = useBoardStore(state => state.manualConnections);
  const importedSchematicScene = useBoardStore(state => state.importedSchematicScene);
  const importedSchematicSource = useBoardStore(state => state.importedSchematicSource);
  const importedPcbDocument = useBoardStore(state => state.importedPcbDocument);
  const importedPcbSource = useBoardStore(state => state.importedPcbSource);
  const generatedCode = useBoardStore(state => state.generatedCode);
  const setGeneratedCode = useBoardStore(state => state.setGeneratedCode);
  const setImportedPcbDocument = useBoardStore(state => state.setImportedPcbDocument);
  const setWorkspaceMode = useBoardStore(state => state.setWorkspaceMode);
  const isGenerating = useBoardStore(state => state.isGenerating);
  const projectName = useBoardStore(state => state.projectName);
  const setProjectName = useBoardStore(state => state.setProjectName);
  const selectedComponentId = useBoardStore(state => state.selectedComponentId);
  const removeComponent = useBoardStore(state => state.removeComponent);
  const duplicateComponent = useBoardStore(state => state.duplicateComponent);
  const rotateComponent = useBoardStore(state => state.rotateComponent);
  const setSelectedComponentId = useBoardStore(state => state.setSelectedComponentId);
  const showGrid = useBoardStore(state => state.showGrid);
  const showMinimap = useBoardStore(state => state.showMinimap);
  const toggleGrid = useBoardStore(state => state.toggleGrid);
  const toggleMinimap = useBoardStore(state => state.toggleMinimap);
  const cloudProjectId = useBoardStore(state => state.cloudProjectId);
  const cloudIsOwner = useBoardStore(state => state.cloudIsOwner);
  const createCloudProject = useBoardStore(state => state.createCloudProject);
  const saveProjectToCloud = useBoardStore(state => state.saveProjectToCloud);
  const clearCloudProjectState = useBoardStore(state => state.clearCloudProjectState);
  const {
    toggleCommentMode,
  } = useProjectComments();
  const undo = useBoardStore(state => state.undo);
  const redo = useBoardStore(state => state.redo);
  const canUndo = useBoardStore(state => state.canUndo);
  const canRedo = useBoardStore(state => state.canRedo);
  const saveProjectToBrowser = useBoardStore(state => state.saveProjectToBrowser);
  const serializeProject = useBoardStore(state => state.serializeProject);
  const hydrateProject = useBoardStore(state => state.hydrateProject);
  const devScenarioRef = useRef<string | null>(null);

  const board = getBoardById(activeBoardId);
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const importedPalette = getImportedSchematicPalette(importedSchematicMode ? 'light' : schematicTheme);
  const t = useCallback((ko: string, en: string) => pickLanguage(appLanguage, { ko, en }), [appLanguage]);
  const isViewOnly = Boolean(cloudProjectId && !cloudIsOwner);
  const effectiveShellMode: ShellMode = 'review';
  const visibleRightTabs = useMemo(
    () => getVisibleRightTabs(effectiveShellMode, isViewOnly),
    [effectiveShellMode, isViewOnly]
  );
  const { audit, issues: validationIssues } = useValidationReport();
  const validationSeverityCounts = useMemo(
    () => countIssueSeverities(validationIssues),
    [validationIssues]
  );
  const hasSchematicContent = useMemo(
    () =>
      components.length > 0 ||
      Boolean(importedSchematicSource?.trim()) ||
      Boolean(importedSchematicScene),
    [components.length, importedSchematicScene, importedSchematicSource]
  );
  const hasWorkspaceContent = useMemo(
    () =>
      hasSchematicContent ||
      Boolean(importedPcbDocument) ||
      Boolean(importedPcbSource?.trim()) ||
      Boolean(generatedCode.trim()),
    [generatedCode, hasSchematicContent, importedPcbDocument, importedPcbSource]
  );
  const workspacePresence: WorkspaceFileKind = importedSchematicMode || Boolean(importedSchematicSource?.trim())
    ? 'imported'
    : hasWorkspaceContent
      ? 'restored'
      : 'empty';
  const showPcbWorkspace =
    (workspaceMode === 'pcb' || workspaceMode === 'manufacturing') &&
    (Boolean(importedPcbDocument) || surfaceFlags.showPcbWorkspace);
  const schematicFileLabel = useMemo(
    () => buildWorkspaceFileLabel({ projectName, presence: workspacePresence }),
    [projectName, workspacePresence]
  );
  const pcbFileLabel = useMemo(
    () => importedPcbDocument?.sourceFilename ?? buildWorkspaceFileLabel({ projectName, presence: 'pcb' }),
    [importedPcbDocument?.sourceFilename, projectName]
  );
  const generatedCodeFileLabel = board.targetLanguage === 'Python' ? 'firmware.py' : 'firmware.ino';
  const selectedFileId = editorRightTab === 'code' && generatedCode.trim()
    ? 'generated-code'
    : showPcbWorkspace
      ? 'pcb-file'
      : 'schematic-file';
  const workspaceFileLabel = selectedFileId === 'pcb-file'
    ? pcbFileLabel
    : selectedFileId === 'generated-code'
      ? generatedCodeFileLabel
      : schematicFileLabel;
  const importedReviewSurface = importedSchematicMode || Boolean(importedPcbDocument);
  const showReviewDropzone = useMemo(
    () => !isCloudProjectLoading && workspacePresence === 'empty',
    [isCloudProjectLoading, workspacePresence]
  );
  const shellStyle = useMemo<CSSProperties>(() => {
    if (!importedSchematicMode) {
      return {};
    }

    return {
      background: importedPalette.shellBackground,
      color: importedPalette.shellForeground,
      '--mm-shell-bg': importedPalette.shellBackground,
      '--mm-shell-fg': importedPalette.shellForeground,
      '--mm-shell-border': importedPalette.shellBorder,
      '--mm-shell-panel': importedPalette.shellPanelBackground,
      '--mm-shell-panel-alt': importedPalette.shellPanelAltBackground,
      '--mm-shell-elevated': importedPalette.shellElevatedBackground,
      '--mm-shell-overlay': importedPalette.shellOverlayBackground,
      '--mm-shell-muted': importedPalette.shellMutedText,
      '--mm-shell-handle': importedPalette.shellHandleBackground,
      '--mm-shell-handle-accent': importedPalette.shellHandleAccent,
    } as CSSProperties;
  }, [importedPalette, importedSchematicMode]);

  React.useEffect(() => {
    const animationFrame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (initialAppLanguage && initialAppLanguage !== appLanguage) {
      setAppLanguage(initialAppLanguage);
    }
  }, [appLanguage, initialAppLanguage, setAppLanguage]);

  useEffect(() => {
    const handleViewportUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ zoom?: number }>).detail;
      if (typeof detail?.zoom === 'number' && Number.isFinite(detail.zoom)) {
        setCanvasZoomLabel(`${Math.round(detail.zoom * 100)}%`);
      }
    };

    window.addEventListener('modumake:viewport-change', handleViewportUpdate as EventListener);
    return () => window.removeEventListener('modumake:viewport-change', handleViewportUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (
      importedPcbDocument ||
      surfaceFlags.showPcbWorkspace ||
      (workspaceMode !== 'pcb' && workspaceMode !== 'manufacturing')
    ) {
      return;
    }

    useBoardStore.getState().setWorkspaceMode('schematic');
    toast.info(t('리뷰 모드로 전환됨', 'Review mode restored'), {
      description: t(
        '리뷰 모드에서는 회로도/시뮬레이션만 사용할 수 있습니다.',
        'Review mode is limited to schematic and simulation.'
      ),
    });
  }, [importedPcbDocument, surfaceFlags.showPcbWorkspace, t, workspaceMode]);

  useEffect(() => {
    if (!importedReviewSurface) {
      importedDensityAppliedRef.current = false;
      return;
    }

    if (importedDensityAppliedRef.current) {
      return;
    }

    importedDensityAppliedRef.current = true;
    setLeftSectionState({
      components: true,
      nets: true,
      files: false,
    });
  }, [importedReviewSurface]);

  const {
    setActiveRightTab,
  } = useUiPreferences({
    storageKey: UI_PREFERENCES_STORAGE_KEY,
    initialRightTab: 'validation',
    sanitizeRightTab: useCallback(
      tab => getSafeRightTab(normalizeLegacyRightTab(tab), effectiveShellMode, isViewOnly),
      [effectiveShellMode, isViewOnly]
    ),
  });

  const openRightTab = useCallback((tab: RightPanelTab) => {
    const visibleTabs = getVisibleRightTabs(effectiveShellMode, isViewOnly);
    const nextTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] ?? 'validation';
    setActiveRightTab(nextTab);
    setEditorRightTab(nextTab === 'code' ? 'code' : nextTab === 'comments' ? 'property' : 'ai');
  }, [effectiveShellMode, isViewOnly, setActiveRightTab]);

  const handleSelectValidationIssue = useCallback((issue: ProjectAuditIssue) => {
    if (isImportedPcbAuditIssue(issue) && (importedPcbDocument || surfaceFlags.showPcbWorkspace)) {
      setWorkspaceMode('pcb');
      const pcbIssueId = getImportedPcbIssueId(issue);
      if (pcbIssueId) {
        window.dispatchEvent(new CustomEvent('modumake:pcb-issue-focus', {
          detail: { issueId: pcbIssueId },
        }));
      }
    }

    const componentIds = issue.evidence?.affectedComponents ?? issue.visualTargets?.componentIds ?? [];
    const targetComponents = components.filter(component =>
      componentIds.includes(component.instanceId) ||
      (issue.componentName != null && component.name === issue.componentName)
    );
    const targetComponentId = targetComponents[0]?.instanceId ?? null;

    if (targetComponentId) {
      setSelectedComponentId(targetComponentId);
    }

    emitReviewFocus({
      source: 'review',
      interaction: 'focus',
      emphasis: 'card',
      issueKey: buildReviewIssueKey(issue),
      code: issue.code,
      componentInstanceId: targetComponentId ?? undefined,
      componentInstanceIds: targetComponents.map(component => component.instanceId),
      componentName: issue.componentName,
      boardPin: issue.boardPin,
      pinIds: issue.visualTargets?.pinIds,
      netIds: issue.evidence?.affectedNets ?? issue.visualTargets?.netIds,
      severity: issue.severity,
      title: issue.title,
      message: issue.message,
      line: issue.line,
      operation: issue.operation,
      ruleId: issue.ruleId,
    });
    openRightTab('validation');
  }, [components, importedPcbDocument, openRightTab, setSelectedComponentId, setWorkspaceMode, surfaceFlags.showPcbWorkspace]);

  useEffect(() => {
    const handleOpenCommentsPanel = () => openRightTab('comments');
    window.addEventListener(COMMENT_PANEL_OPEN_EVENT, handleOpenCommentsPanel);
    return () => window.removeEventListener(COMMENT_PANEL_OPEN_EVENT, handleOpenCommentsPanel);
  }, [openRightTab]);

  useEffect(() => {
    const handleReviewFocus = (event: Event) => {
      const detail = (event as CustomEvent<ReviewFocusDetail>).detail;
      if (detail?.source !== 'code') {
        return;
      }

      openRightTab('validation');
      if (detail.replayedFromShell) {
        return;
      }

      if (importedSchematicMode) {
        return;
      }

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent<ReviewFocusDetail>(REVIEW_FOCUS_EVENT, {
            detail: {
              ...detail,
              replayedFromShell: true,
            },
          })
        );
      }, 90);
    };

    window.addEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
    return () => window.removeEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
  }, [importedSchematicMode, openRightTab]);

  useEffect(() => {
    if (initialCloudProjectId || typeof window === 'undefined') {
      return;
    }

    const scenarioId = new URLSearchParams(window.location.search).get('scenario');
    if (!scenarioId || devScenarioRef.current === scenarioId) {
      return;
    }

    const scenarioDocument = getDevScenarioDocument(scenarioId);
    if (!scenarioDocument) {
      return;
    }

    const result = hydrateProject(scenarioDocument);
    if (!result.success) {
      return;
    }

    devScenarioRef.current = scenarioId;
    const applyScenarioUi = window.requestAnimationFrame(() => {
      openRightTab('validation');
      setSelectedComponentId(null);
    });

    return () => window.cancelAnimationFrame(applyScenarioUi);
  }, [hydrateProject, initialCloudProjectId, openRightTab, setSelectedComponentId]);

  useEffect(() => {
    const handleSelectionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeIds?: string[] }>).detail;
      setSelectedCanvasNodeIds((detail?.nodeIds ?? []).filter(nodeId => nodeId !== 'board-node' && !nodeId.startsWith('comment-')));
    };

    window.addEventListener('modumake:canvas-selection-change', handleSelectionChange as EventListener);
    return () => window.removeEventListener('modumake:canvas-selection-change', handleSelectionChange as EventListener);
  }, []);

  useGlobalShortcuts({
    canRedo,
    canUndo,
    cloudIsOwner,
    cloudProjectId,
    components,
    duplicateComponent,
    isViewOnly,
    openRightTab,
    redo,
    removeComponent,
    rotateComponent,
    saveProjectToBrowser,
    saveProjectToCloud,
    selectedComponentId,
    toggleCommentMode,
    undo,
  });

  const selectedComponent = useMemo(
    () => components.find(component => component.instanceId === selectedComponentId) ?? null,
    [components, selectedComponentId]
  );

  const selectedTemplate = useMemo<ComponentTemplate | null>(() => {
    if (!selectedComponent) {
      return null;
    }

    return getTemplateById(selectedComponent.templateId) ?? null;
  }, [selectedComponent]);

  const propertyRows = useMemo(() => {
    if (!selectedComponent || !selectedTemplate) {
      return [];
    }

    const connectedNets = audit.circuitAnalysis.nets.filter(net =>
      net.nodes.some(node => node.ownerType === 'component' && node.ownerId === selectedComponent.instanceId)
    );
    const datasheetSource = selectedTemplate.design?.datasheetSources?.[0];

    return [
      { label: '레퍼런스', value: selectedComponent.importedReference ?? selectedComponent.name },
      { label: '값', value: selectedComponent.value ?? selectedTemplate.defaultValue ?? selectedTemplate.name },
      { label: '패키지', value: selectedTemplate.pcb?.packageType ?? selectedComponent.templateId },
      { label: '넷 수', value: String(connectedNets.length) },
      ...(selectedTemplate.compatibleVoltage ? [{ label: '공급전압', value: selectedTemplate.compatibleVoltage }] : []),
      ...(datasheetSource ? [{ label: '데이터시트', value: datasheetSource.label, href: datasheetSource.url }] : []),
    ];
  }, [audit.circuitAnalysis.nets, selectedComponent, selectedTemplate]);

  const sidebarComponentItems = useMemo(() => {
    return components.map(component => {
      const template = getTemplateById(component.templateId);
      const localizedTemplateName = template ? getLocalizedTemplateName(template, appLanguage) : component.name;
      const componentIssues = audit.issues.filter(issue => issue.visualTargets?.componentIds?.includes(component.instanceId));
      const status = componentIssues.some(issue => issue.severity === 'error')
        ? 'error'
        : componentIssues.some(issue => issue.severity === 'warning')
          ? 'warning'
          : 'ok';
      const kind = template?.category === 'PASSIVE'
        ? 'passive'
        : component.importedReference?.startsWith('J')
          ? 'connector'
          : component.templateId.includes('board') || component.templateId.includes('esp32') || component.templateId.includes('arduino')
            ? 'mcu'
            : template
              ? 'unknown'
              : 'unknown';

      return {
        id: component.instanceId,
        ref: component.importedReference ?? component.name,
        value: component.value ?? localizedTemplateName,
        label: localizedTemplateName,
        status,
        kind,
      } as const;
    });
  }, [appLanguage, audit.issues, components]);

  const sidebarNetItems = useMemo(() => {
    return audit.circuitAnalysis.nets.slice(0, 40).map(net => {
      const hasMismatch = audit.issues.some(issue => issue.visualTargets?.netIds?.includes(net.id));
      const netLabel = net.id;
      return {
        id: net.id,
        name: netLabel,
        connectionSummary: `${net.nodes.length} connections`,
        kind: /^(gnd|3\.3v|5v|vin|vcc)$/i.test(netLabel) ? 'power' : 'signal',
        hasMismatch,
      } as const;
    });
  }, [audit.circuitAnalysis.nets, audit.issues]);

  const sidebarFiles = useMemo(() => {
    const files: Array<{
      id: string;
      label: string;
      kind: 'schematic' | 'pcb' | 'code';
      removable?: boolean;
    }> = [];

    if (hasSchematicContent || !importedPcbDocument) {
      files.push({
        id: 'schematic-file',
        label: schematicFileLabel,
        kind: 'schematic' as const,
      });
    }

    if (importedPcbDocument || importedPcbSource?.trim()) {
      files.push({
        id: 'pcb-file',
        label: pcbFileLabel,
        kind: 'pcb' as const,
      });
    }

    if (generatedCode.trim()) {
      files.push({
        id: 'generated-code',
        label: generatedCodeFileLabel,
        kind: 'code' as const,
        removable: true,
      });
    }

    return files;
  }, [generatedCode, generatedCodeFileLabel, hasSchematicContent, importedPcbDocument, importedPcbSource, pcbFileLabel, schematicFileLabel]);

  const importDroppedKiCadFile = useCallback(async (file: File) => {
    let importStage: ImportFailureStage = 'read';
    let kiCadFileKind: KiCadFileKind | null = null;
    const setRunningProgress = (title: string, description: string) => {
      setImportProgress({
        status: 'running',
        fileName: file.name,
        title,
        description,
      });
    };

    setRunningProgress(
      t('파일을 읽는 중입니다', 'Reading file'),
      t('로컬 파일 내용을 작업공간으로 가져오고 있습니다.', 'Loading the local file into the workspace.')
    );

    recordBetaEvent({
      name: 'import_attempt',
      source: 'editor-import',
      route: '/editor',
      attributes: buildImportFileTelemetryAttributes({
        fileName: file.name,
        fileSizeBytes: file.size,
      }),
    });

    try {
      const text = await file.text();
      importStage = 'detect';
      setRunningProgress(
        t('KiCad 파일 형식을 확인하는 중입니다', 'Checking KiCad file type'),
        t('회로도와 PCB 중 어떤 작업공간으로 열지 판단하고 있습니다.', 'Detecting whether this should open as a schematic or PCB.')
      );
      kiCadFileKind = detectKiCadFileKind(file.name, text);

      if (!kiCadFileKind) {
        const report = buildImportFailureReport({
          fileName: file.name,
          fileSizeBytes: file.size,
          fileKind: null,
          stage: 'unsupported',
          language: appLanguage,
        });
        setImportProgress({
          status: 'failed',
          fileName: file.name,
          title: report.title,
          description: report.description,
          recoveryActions: report.recoveryActions,
        });
        toast.info(report.title, {
          description: report.toastDescription,
        });
        recordBetaEvent({
          name: 'import_failed',
          source: 'editor-import',
          route: '/editor',
          outcome: report.reasonCategory,
          attributes: report.telemetry,
        });
        return;
      }

      if (kiCadFileKind === 'pcb') {
        importStage = 'parse-pcb';
        setRunningProgress(
          t('PCB를 해석하는 중입니다', 'Parsing PCB'),
          t('보드 형상, 레이어, 넷, 풋프린트를 읽고 있습니다.', 'Reading board geometry, layers, nets, and footprints.')
        );
        const document = parseKiCadPcb(text, { sourceFilename: file.name });
        const validation = validateImportedPcbDocument(document, {
          schematicParity: {
            components,
            manualConnections,
            importedSchematicScene,
            resolveTemplate: getTemplateById,
          },
        });
        setImportedPcbDocument(document, text, validation);
        setWorkspaceMode('pcb');
        setLeftSectionState({
          components: true,
          nets: true,
          files: false,
        });
        clearCloudProjectState();
        if (initialCloudProjectId) {
          router.replace('/editor', { scroll: false });
        }
        setImportProgress(null);
        recordBetaEvent({
          name: 'import_succeeded',
          source: 'editor-import',
          route: '/editor',
          outcome: 'pcb',
          attributes: {
            ...buildImportFileTelemetryAttributes({
              fileName: file.name,
              fileSizeBytes: file.size,
              fileKind: 'pcb',
            }),
            issueCount: validation.issueCount,
            errorCount: validation.errorCount,
            warningCount: validation.warningCount,
          },
        });
        toast.success(t('KiCad PCB 파일을 불러왔습니다.', 'KiCad PCB loaded.'), {
          duration: 900,
          description: appLanguage === 'ko'
            ? `${file.name}을 PCB 검증 화면으로 가져왔습니다.`
            : `Imported ${file.name} into the PCB review workspace.`,
        });
        return;
      }

      importStage = 'parse-schematic';
      setRunningProgress(
        t('회로도를 분석하는 중입니다', 'Parsing schematic'),
        t('심볼, 와이어, 라벨을 읽고 리뷰 화면을 준비하고 있습니다.', 'Reading symbols, wires, and labels for the review canvas.')
      );
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
      importStage = 'hydrate';
      setRunningProgress(
        t('리뷰 화면을 구성하는 중입니다', 'Preparing review canvas'),
        t('파싱된 회로도를 작업공간 상태로 변환하고 있습니다.', 'Converting the parsed schematic into workspace state.')
      );
      const result = hydrateProject(payload);
      if (!result.success) {
        const report = buildImportFailureReport({
          fileName: file.name,
          fileSizeBytes: file.size,
          fileKind: kiCadFileKind,
          stage: 'hydrate',
          error: result.error,
          language: appLanguage,
        });
        setImportProgress({
          status: 'failed',
          fileName: file.name,
          title: report.title,
          description: report.description,
          recoveryActions: report.recoveryActions,
        });
        toast.error(report.title, { description: report.toastDescription });
        recordBetaEvent({
          name: 'import_failed',
          source: 'editor-import',
          route: '/editor',
          outcome: report.reasonCategory,
          attributes: report.telemetry,
        });
        return;
      }

      clearCloudProjectState();
      if (initialCloudProjectId) {
        router.replace('/editor', { scroll: false });
      }
      setWorkspaceMode('schematic');
      setLeftSectionState({
        components: true,
        nets: true,
        files: false,
      });
      setImportProgress(null);
      recordBetaEvent({
        name: 'import_succeeded',
        source: 'editor-import',
        route: '/editor',
        outcome: 'schematic',
        attributes: {
          ...buildImportFileTelemetryAttributes({
            fileName: file.name,
            fileSizeBytes: file.size,
            fileKind: 'schematic',
          }),
          noticeShown: Boolean(result.notice),
        },
      });
      toast.success(t('KiCad 회로도를 불러왔습니다.', 'KiCad schematic loaded.'), {
        duration: 900,
        description: appLanguage === 'ko'
          ? `${file.name}을 리뷰 캔버스로 가져왔습니다.${result.notice ? ` ${result.notice}` : ''}`
          : `Imported ${file.name} into the review canvas.${result.notice ? ` ${result.notice}` : ''}`,
      });
    } catch (error) {
      const report = buildImportFailureReport({
        fileName: file.name,
        fileSizeBytes: file.size,
        fileKind: kiCadFileKind,
        stage: importStage,
        error,
        language: appLanguage,
      });
      setImportProgress({
        status: 'failed',
        fileName: file.name,
        title: report.title,
        description: report.description,
        recoveryActions: report.recoveryActions,
      });
      toast.error(report.title, {
        description: report.toastDescription,
      });
      recordBetaEvent({
        name: 'import_failed',
        source: 'editor-import',
        route: '/editor',
        outcome: report.reasonCategory,
        attributes: report.telemetry,
      });
    }
  }, [appLanguage, clearCloudProjectState, components, hydrateProject, importedSchematicScene, initialCloudProjectId, manualConnections, router, setImportedPcbDocument, setWorkspaceMode, t]);

  const handleReviewDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setReviewDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await importDroppedKiCadFile(file);
  }, [importDroppedKiCadFile]);

  const handleReviewDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setReviewDropActive(true);
  }, []);

  const handleReviewDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setReviewDropActive(false);
  }, []);

  const handleOpenImportFromEmptyState = useCallback(() => {
    schematicFileInputRef.current?.click();
  }, []);

  const handleImportSchematicFile = useCallback(async (file: File) => {
    await importDroppedKiCadFile(file);
  }, [importDroppedKiCadFile]);

  const handleImportCodeFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      setGeneratedCode(text);
      openRightTab('code');
      toast.success(t('코드를 불러왔습니다.', 'Code imported.'), {
        description: file.name,
      });
    } catch (error) {
      toast.error(t('코드 불러오기 실패', 'Code import failed'), {
        description: error instanceof Error ? error.message : t('코드 파일을 읽을 수 없습니다.', 'Could not read the code file.'),
      });
    }
  }, [openRightTab, setGeneratedCode, t]);

  const handleSaveWorkspace = useCallback(async () => {
    const result = await saveProjectToBrowser();
    if (!result.success) {
      toast.error(t('저장 실패', 'Save failed'), { description: result.error });
      return;
    }

    toast.success(t('브라우저 저장 완료', 'Saved locally'), result.savedAt ? { description: result.savedAt } : undefined);
  }, [saveProjectToBrowser, t]);

  const handleRunAnalysis = useCallback(() => {
    openRightTab('validation');
  }, [openRightTab]);

  const persistCurrentWorkspaceSnapshotForReport = useCallback(() => {
    persistReportWorkspaceSnapshot(useBoardStore.getState());
  }, []);

  const handleOpenReportView = useCallback(() => {
    persistCurrentWorkspaceSnapshotForReport();
    router.push('/report', { scroll: false });
  }, [persistCurrentWorkspaceSnapshotForReport, router]);

  const handleOpenProductScope = useCallback(() => {
    router.push('/product-scope', { scroll: false });
  }, [router]);

  const handleOpenPrivacy = useCallback(() => {
    router.push('/privacy', { scroll: false });
  }, [router]);

  const handleOpenFeedback = useCallback(() => {
    const href = getProductFeedbackHref();
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(href, { scroll: false });
  }, [router]);

  const handleExportReport = useCallback(() => {
    const projectDocument = serializeProject();
    const filename = `${projectName || 'modumake-project'}-report.json`;
    const blob = new Blob([JSON.stringify(projectDocument, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    recordBetaEvent({
      name: 'report_exported',
      source: 'editor-report',
      route: '/editor',
      outcome: 'json',
      attributes: {
        issueCount: validationIssues.length,
        errorCount: validationSeverityCounts.error,
        warningCount: validationSeverityCounts.warning,
        infoCount: validationSeverityCounts.info,
      },
    });
    toast.success(t('리포트를 내보냈습니다.', 'Report exported.'), { description: filename });
  }, [projectName, serializeProject, t, validationIssues.length, validationSeverityCounts.error, validationSeverityCounts.info, validationSeverityCounts.warning]);

  const handleShare = useCallback(async () => {
    if (cloudProjectId) {
      const result = await saveProjectToCloud();
      if (!result.success) {
        toast.error(t('공유 저장 실패', 'Share save failed'), { description: result.error });
        return;
      }

      toast.success(t('공유 링크에 저장했습니다.', 'Saved to the shared link.'));
      return;
    }

    const created = await createCloudProject('unlisted');
    if (!created.success || !created.projectId) {
      toast.error(t('공유 링크 생성 실패', 'Could not create a share link'), { description: created.error });
      return;
    }

    router.push(buildCloudProjectPath(created.projectId), { scroll: false });
    toast.success(t('공유 링크를 만들었습니다.', 'Share link created.'));
  }, [cloudProjectId, createCloudProject, router, saveProjectToCloud, t]);

  const handleRemoveFile = useCallback((fileId: string) => {
    if (fileId !== 'generated-code') {
      return;
    }

    setGeneratedCode('');
    toast.success(t('코드 파일을 제거했습니다.', 'Removed the code file.'));
  }, [setGeneratedCode, t]);

  const handleSelectFile = useCallback((fileId: string) => {
    if (fileId === 'pcb-file') {
      if (!importedPcbDocument && !surfaceFlags.showPcbWorkspace) {
        toast.info(t('열린 PCB 파일이 없습니다.', 'No PCB file is open.'));
        return;
      }

      setWorkspaceMode('pcb');
      openRightTab('validation');
      return;
    }

    if (fileId === 'generated-code') {
      openRightTab('code');
      return;
    }

    setWorkspaceMode('schematic');
    openRightTab('validation');
  }, [importedPcbDocument, openRightTab, setWorkspaceMode, surfaceFlags.showPcbWorkspace, t]);

  const handleToggleLeftSection = useCallback((section: 'components' | 'nets' | 'files') => {
    setLeftSectionState(current => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const { contextMenu, contextMenuItems, handleAppContextMenu, setContextMenu } = useAppContextMenu({
    boardName: board.name,
    components,
    importedReviewMode: importedSchematicMode,
    openRightTab,
    setSelectedComponentId,
    showGrid,
    showMinimap,
    toggleGrid,
    toggleMinimap,
    visibleRightTabs,
  });

  if (!mounted) {
    return (
      <div
        className="h-screen w-screen"
        style={{ background: importedSchematicMode ? importedPalette.shellBackground : '#1e1e1e' }}
      />
    );
  }

  return (
    <div
      data-mm-scope="app-shell"
      data-mm-shell-theme={importedSchematicMode ? schematicTheme : 'default'}
      onContextMenu={handleAppContextMenu}
      className="relative font-mono select-none"
      style={importedSchematicMode ? shellStyle : { background: '#f7f3ec', color: '#5b4f45' }}
    >
      <input
        ref={schematicFileInputRef}
        type="file"
        accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportSchematicFile(file);
          }
          currentTarget.value = '';
        }}
      />
      <input
        ref={codeFileInputRef}
        type="file"
        accept=".ino,.py,.txt,.cpp,.c,.h,.hpp"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportCodeFile(file);
          }
          currentTarget.value = '';
        }}
      />

      <WorkspaceShell
        titleBar={
          <TitleBar
            projectName={projectName}
            fileLabel={workspaceFileLabel}
            hasCode={generatedCode.trim().length > 0}
            hasWorkspaceContent={hasWorkspaceContent}
            isAnalyzing={isGenerating}
            onProjectNameChange={setProjectName}
            onOpenSchematic={() => schematicFileInputRef.current?.click()}
            onAddCode={() => {
              setEditorRightTab('code');
              codeFileInputRef.current?.click();
            }}
            onRunAnalysis={handleRunAnalysis}
            onOpenReport={handleOpenReportView}
            onSave={handleSaveWorkspace}
            onOpenProductScope={handleOpenProductScope}
            onOpenPrivacy={handleOpenPrivacy}
            onOpenFeedback={handleOpenFeedback}
          />
        }
        leftSidebar={
          <SidebarLeft
            components={sidebarComponentItems}
            nets={sidebarNetItems}
            files={sidebarFiles}
            selectedComponentId={selectedComponentId}
            selectedFileId={selectedFileId}
            sectionState={leftSectionState}
            compact={importedReviewSurface}
            onToggleSection={handleToggleLeftSection}
            onSelectComponent={id => {
              setWorkspaceMode('schematic');
              setSelectedComponentId(id);
              setEditorRightTab('property');
            }}
            onSelectFile={handleSelectFile}
            onRemoveFile={handleRemoveFile}
          />
        }
        canvasArea={
          <CanvasArea
            toolbar={showReviewDropzone ? null : (
              <>
                {surfaceFlags.showPcbWorkspace || importedPcbDocument ? <WorkspaceModeBar /> : null}
                {!showPcbWorkspace ? (
                  <CanvasToolbar
                    mode={canvasMode}
                    showGrid={showGrid}
                    showMinimap={showMinimap}
                    zoomLabel={canvasZoomLabel}
                    importedSchematicMode={importedSchematicMode}
                    importedSchematicViewMode={importedSchematicViewMode}
                    onModeChange={setCanvasMode}
                    onZoomIn={() => window.dispatchEvent(new CustomEvent('modumake:zoom-in'))}
                    onZoomOut={() => window.dispatchEvent(new CustomEvent('modumake:zoom-out'))}
                    onFitView={() => window.dispatchEvent(new CustomEvent('modumake:fit-view'))}
                    onReadView={() => window.dispatchEvent(new CustomEvent('modumake:read-view'))}
                    onToggleGrid={toggleGrid}
                    onToggleMinimap={toggleMinimap}
                    onImportedSchematicViewModeChange={setImportedSchematicViewMode}
                  />
                ) : null}
              </>
            )}
            canvas={showReviewDropzone ? null : showPcbWorkspace ? <PcbWorkspace /> : <ComponentCanvas />}
            overlay={importProgress ? (
              <KiCadImportProgressOverlay
                progress={importProgress}
                onOpenFile={() => schematicFileInputRef.current?.click()}
              />
            ) : !showPcbWorkspace && showReviewDropzone ? (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center p-6"
                onDrop={handleReviewDrop}
                onDragOver={handleReviewDragOver}
                onDragEnter={handleReviewDragOver}
                onDragLeave={handleReviewDragLeave}
              >
                <div
                  className="w-full max-w-2xl rounded-[16px] border-2 border-dashed px-7 py-10 text-center transition-colors"
                  style={{
                    borderColor: reviewDropActive ? '#7aa8dc' : importedSchematicMode ? importedPalette.shellBorder : '#d6cec3',
                    background: reviewDropActive
                      ? 'rgba(122,168,220,0.10)'
                      : importedSchematicMode
                        ? `${importedPalette.shellElevatedBackground}eb`
                        : '#fffdf9',
                  }}
                >
                  <div
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border text-sky-300"
                    style={{
                      borderColor: importedSchematicMode ? importedPalette.shellBorder : '#ddd5ca',
                      background: importedSchematicMode ? importedPalette.shellPanelBackground : '#fcfbf8',
                      color: '#6b94c1',
                    }}
                  >
                    <FileUp size={26} />
                  </div>
                  <div className="mt-5 text-2xl font-semibold" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#40362e' }}>
                    {t('KiCad 파일을 올려서 바로 리뷰 시작', 'Drop a KiCad file to start the review')}
                  </div>
                  <div className="mx-auto mt-3 max-w-2xl text-sm leading-6" style={{ color: importedSchematicMode ? importedPalette.shellMutedText : '#8f8377' }}>
                    {t(
                      '기존 `.kicad_sch` 회로도나 `.kicad_pcb` 보드를 바로 가져와서 리뷰와 검증을 시작합니다.',
                      'Bring in an existing `.kicad_sch` schematic or `.kicad_pcb` board and jump straight into review.'
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleOpenImportFromEmptyState}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#4f84be] px-4 text-sm font-semibold text-white transition hover:bg-[#3f74af]"
                    >
                      {t('파일 열기', 'Open file')}
                    </button>
                    <div
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                      style={{
                        borderColor: importedSchematicMode ? importedPalette.shellBorder : '#ddd5ca',
                        background: importedSchematicMode ? importedPalette.shellPanelBackground : '#fcfbf8',
                        color: importedSchematicMode ? importedPalette.shellForeground : '#74685d',
                      }}
                    >
                      {t('지원 형식 · .kicad_sch · .kicad_pcb', 'Supported · .kicad_sch · .kicad_pcb')}
                    </div>
                  </div>
                </div>
              </div>
            ) : undefined}
          />
        }
        rightSidebar={
          <SidebarRight
            activeTab={editorRightTab}
            compact={importedReviewSurface}
            onTabChange={tab => {
              setEditorRightTab(tab);
              if (tab === 'code') {
                openRightTab('code');
                return;
              }

              setActiveRightTab(tab === 'property' ? 'comments' : 'validation');
            }}
            aiPanel={
              <AiReviewPanel
                projectName={projectName}
                boardName={board.name}
                fileLabel={workspaceFileLabel}
                hasReviewTarget={hasWorkspaceContent}
                issues={validationIssues}
                onSelectIssue={handleSelectValidationIssue}
              />
            }
            propertyPanel={
              <PropertyPanel
                title={selectedComponent?.name ?? '속성'}
                description={selectedTemplate ? getLocalizedTemplateName(selectedTemplate, appLanguage) : ''}
                rows={propertyRows}
              />
            }
            codePanel={
              <CodeReviewPanel
                code={generatedCode}
                languageLabel={board.targetLanguage}
                onChange={setGeneratedCode}
              />
            }
          />
        }
        bottomBar={
          <BottomBar
            errorCount={validationSeverityCounts.error}
            warningCount={validationSeverityCounts.warning}
            okLabel={!hasWorkspaceContent ? '검토 대기' : validationIssues.length === 0 ? '분석 통과' : `분석 이슈 ${validationIssues.length}`}
            hasWorkspaceContent={hasWorkspaceContent}
            issues={validationIssues}
            onSelectIssue={handleSelectValidationIssue}
            onExportReport={handleExportReport}
            onShare={handleShare}
          />
        }
        mobileAction={
          <button
            type="button"
            onClick={handleOpenImportFromEmptyState}
            className="inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-[#4f84be] px-4 text-[12px] font-semibold text-white transition hover:bg-[#3f74af]"
          >
            파일 열기
          </button>
        }
      />

      {(isCloudProjectLoading || cloudProjectLoadError) && (
        <div
          className="absolute inset-0 z-[120] flex items-center justify-center backdrop-blur-sm"
          style={{ background: importedSchematicMode ? importedPalette.shellOverlayBackground : 'rgba(2, 6, 23, 0.78)' }}
        >
          <div
            className="w-full max-w-md rounded-xl border p-5 shadow-2xl"
            style={{
              borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
              background: importedSchematicMode ? importedPalette.shellElevatedBackground : '#0b1220',
            }}
          >
            <div className="text-sm font-semibold" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#f8fafc' }}>
              {isCloudProjectLoading ? '공유 프로젝트를 불러오는 중입니다' : '공유 프로젝트를 열 수 없습니다'}
            </div>
            <div className="mt-2 text-xs leading-relaxed" style={{ color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8' }}>
              {isCloudProjectLoading ? '링크에 담긴 회로와 코드를 작업 공간으로 가져오고 있습니다.' : cloudProjectLoadError}
            </div>
          </div>
        </div>
      )}

      {contextMenu && contextMenuItems.length > 0 ? (
        <AppContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
