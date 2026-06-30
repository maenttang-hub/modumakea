'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Connection, Edge, Node, ReactFlowInstance } from 'reactflow';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { BOARD_NODE_ID } from '@/components/canvas/canvas-graph';
import { useProjectCollaboration } from '@/components/collaboration/project-collaboration-provider';
import { useProjectComments } from '@/components/comments/project-comments-provider';
import { getTemplateById, isVoltageCompatible } from '@/constants/component-templates';
import { getLocalizedTemplateName } from '@/lib/catalog-i18n';
import { COMMENT_FOCUS_EVENT, type CommentFocusDetail } from '@/lib/comment-focus';
import { hasLegacyImportedSchematicState, isImportedSchematicProject } from '@/lib/component-template-utils';
import { getBoardBodyRect, getComponentBodyRect } from '@/hooks/use-canvas-routing';
import {
  getCommentTargetLabel,
  resolveCommentTargetAnchor,
  shouldUseInlineCommentComposer,
} from '@/lib/project-comments';
import { useCanvasRouting } from '@/hooks/use-canvas-routing';
import { useCanvasExport } from '@/hooks/use-canvas-export';
import { useCanvasGraphModel } from '@/hooks/use-canvas-graph-model';
import {
  useCanvasReviewFocus,
  type ReviewViewportRequest,
} from '@/hooks/use-canvas-review-focus';
import { useCanvasViewportShortcuts } from '@/hooks/use-canvas-viewport-shortcuts';
import { useEnsureComponentTemplates } from '@/hooks/use-ensure-component-templates';
import {
  getImportedSchematicReviewViewportBounds,
  getImportedSchematicSceneBounds,
  getImportedSchematicViewportBounds,
} from '@/lib/imported-schematic-scene-bounds';
import { getImportedStructuredViewportBounds } from '@/lib/imported-schematic-structured-view';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import type { BoardDefinition } from '@/constants/boards';
import type { PlacedComponent } from '@/types';

type CameraMode = 'editor' | 'imported-review' | 'interactive-review';

type ViewportActionRequest =
  | ReviewViewportRequest
  | {
      kind: 'fit-imported-review';
      source: 'imported-init' | 'imported-restore';
      bounds: { x: number; y: number; width: number; height: number };
      padding: number;
      duration: number;
    }
  | {
      kind: 'focus-point';
      source: 'comment-focus';
      centerX: number;
      centerY: number;
      minimumZoom: number;
      duration: number;
    };

function centerBoardViewport(
  rfInstance: ReactFlowInstance,
  board: BoardDefinition,
  minimumZoom: number,
  duration: number
) {
  const boardRect = getBoardBodyRect(board);
  rfInstance.setCenter(boardRect.x + boardRect.width / 2, boardRect.y + boardRect.height / 2, {
    zoom: Math.max(rfInstance.getZoom(), minimumZoom),
    duration,
  });
}

function centerComponentsViewport(
  rfInstance: ReactFlowInstance,
  components: PlacedComponent[],
  minimumZoom: number,
  duration: number
) {
  if (components.length === 0) {
    return;
  }

  if (components.length === 1) {
    const rect = getComponentBodyRect(components[0], getTemplateById(components[0].templateId));
    rfInstance.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
      zoom: Math.max(rfInstance.getZoom(), minimumZoom),
      duration,
    });
    return;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const component of components) {
    const rect = getComponentBodyRect(component, getTemplateById(component.templateId));
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return;
  }

  rfInstance.fitBounds(
    {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 20),
      height: Math.max(maxY - minY, 20),
    },
    {
      padding: 0.22,
      duration,
    }
  );

  if (rfInstance.getZoom() < minimumZoom) {
    rfInstance.setCenter(minX + Math.max(maxX - minX, 20) / 2, minY + Math.max(maxY - minY, 20) / 2, {
      zoom: minimumZoom,
      duration,
    });
  }
}

function getImportedReviewFitPadding(
  bounds: { width: number; height: number },
  viewMode: 'original' | 'structured'
) {
  if (bounds.width > 1800 || bounds.height > 1200) {
    return viewMode === 'structured' ? 0.035 : 0.045;
  }

  if (bounds.width > 1200 || bounds.height > 900) {
    return viewMode === 'structured' ? 0.045 : 0.06;
  }

  return viewMode === 'structured' ? 0.055 : 0.075;
}

function getImportedReviewZoomBias(viewMode: 'original' | 'structured') {
  return viewMode === 'original' ? 1 : 1;
}

function getImportedReviewFocusBounds(
  bounds: { x: number; y: number; width: number; height: number }
) {
  return bounds;
}

function publishCanvasViewportZoom(zoom: number) {
  if (typeof window === 'undefined' || !Number.isFinite(zoom)) {
    return;
  }

  window.dispatchEvent(new CustomEvent('modumake:viewport-change', {
    detail: { zoom },
  }));
}

function normalizeStructuredViewportBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewMode: 'original' | 'structured'
) {
  if (viewMode !== 'structured') {
    return bounds;
  }

  return {
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
  };
}

export function useComponentCanvasController() {
  const {
    components,
    manualConnections,
    ghostFixPreview,
    importedSchematicScene,
    importedSchematicViewMode,
    pins,
    componentRuntimeStates,
    activeBoardId,
    wiringMode,
    cloudProjectId,
    cloudIsOwner,
    addComponent,
    connectPads,
    removeComponent,
    updateComponentPosition,
    rotateComponent,
    setSelectedComponentId,
    showGrid,
    showMinimap,
    projectName,
    appLanguage,
  } = useBoardStore(useShallow(state => ({
    components: state.components,
    manualConnections: state.manualConnections,
    ghostFixPreview: state.ghostFixPreview,
    importedSchematicScene: state.importedSchematicScene,
    importedSchematicViewMode: state.importedSchematicViewMode,
    pins: state.pins,
    componentRuntimeStates: state.componentRuntimeStates,
    activeBoardId: state.activeBoardId,
    wiringMode: state.wiringMode,
    cloudProjectId: state.cloudProjectId,
    cloudIsOwner: state.cloudIsOwner,
    addComponent: state.addComponent,
    connectPads: state.connectPads,
    removeComponent: state.removeComponent,
    updateComponentPosition: state.updateComponentPosition,
    rotateComponent: state.rotateComponent,
    setSelectedComponentId: state.setSelectedComponentId,
    showGrid: state.showGrid,
    showMinimap: state.showMinimap,
    projectName: state.projectName,
    appLanguage: state.appLanguage,
  })));
  const isEditable = !(cloudProjectId && !cloudIsOwner);
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const hasLegacyImportedScene = hasLegacyImportedSchematicState(activeBoardId, components, importedSchematicScene);
  const {
    commentMode,
    toggleCommentMode,
    openThreads,
    selectedCommentId,
    highlightedThreadId,
    draft,
    startCommentDraft,
    submitDraft,
    cancelDraft,
    focusComment,
    selectComment,
  } = useProjectComments();
  const {
    enabled: collaborationEnabled,
    participants,
    updatePresence,
    focusParticipant,
  } = useProjectCollaboration();

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const cameraModeRef = useRef<CameraMode>('editor');
  const initialImportedFitDoneRef = useRef(false);
  const cameraLockUntilRef = useRef(0);
  const previousImportedViewModeRef = useRef<typeof importedSchematicViewMode | null>(null);
  const [importedViewportDebug, setImportedViewportDebug] = useState<{
    targetBounds: { x: number; y: number; width: number; height: number } | null;
    appliedViewport: { x: number; y: number; zoom: number } | null;
    samples: Array<{ label: string; x: number; y: number; zoom: number }>;
    actions: string[];
  }>({
    targetBounds: null,
    appliedViewport: null,
    samples: [],
    actions: [],
  });
  const exportRef = useRef<HTMLDivElement | null>(null);
  const importedReviewViewportBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const importedReviewBoostTimeoutRef = useRef<number | null>(null);

  const {
    board,
    isPreviewRouting,
    positionedComponents,
    routeContextKey,
    onNodeDragStart: routingOnNodeDragStart,
    onNodeDrag: routingOnNodeDrag,
    onNodeDragStop: routingOnNodeDragStop,
  } = useCanvasRouting({
    activeBoardId,
    components,
    updateComponentPosition,
  });

  useEnsureComponentTemplates(
    components.map(component => component.templateId),
    activeBoardId
  );

  useCanvasExport(exportRef, projectName);

  const appendViewportDebugAction = useCallback((message: string) => {
    setImportedViewportDebug(current => ({
      ...current,
      actions: [...current.actions, message].slice(-12),
    }));
  }, []);

  const requestViewportAction = useCallback((request: ViewportActionRequest) => {
    if (!rfInstance) {
      return false;
    }

    const importedLockActive =
      importedSchematicMode &&
      (!initialImportedFitDoneRef.current || Date.now() < cameraLockUntilRef.current);

    if (request.kind === 'fit-imported-review') {
      cameraModeRef.current = 'imported-review';
      const focusBounds = getImportedReviewFocusBounds(request.bounds);
      rfInstance.fitBounds(focusBounds, {
        padding: request.padding,
        duration: request.duration,
      });
      appendViewportDebugAction(`policy:${request.source}:owner=imported-review`);

      if (typeof window !== 'undefined') {
        const centerX = focusBounds.x + focusBounds.width / 2;
        const centerY = focusBounds.y + focusBounds.height / 2;
        const zoomBias = getImportedReviewZoomBias(importedSchematicViewMode);
        if (importedReviewBoostTimeoutRef.current !== null) {
          window.clearTimeout(importedReviewBoostTimeoutRef.current);
          importedReviewBoostTimeoutRef.current = null;
        }
        const applyBoost = () => {
          const viewport = rfInstance.getViewport();
          const nextZoom = Number((viewport.zoom * zoomBias).toFixed(4));
          rfInstance.setCenter(centerX, centerY, {
            zoom: nextZoom,
            duration: 0,
          });
          publishCanvasViewportZoom(nextZoom);
          appendViewportDebugAction(`boost:${request.source}:z=${nextZoom.toFixed(3)}`);
        };

        if (request.duration > 0) {
          importedReviewBoostTimeoutRef.current = window.setTimeout(() => {
            importedReviewBoostTimeoutRef.current = null;
            applyBoost();
          }, request.duration + 24);
        } else {
          window.requestAnimationFrame(() => {
            applyBoost();
          });
        }
      }

      return true;
    }

    if (importedLockActive) {
      appendViewportDebugAction(`blocked:${request.source}:owner=${cameraModeRef.current}`);
      return false;
    }

    cameraModeRef.current = importedSchematicMode ? 'interactive-review' : 'editor';
    appendViewportDebugAction(`allow:${request.source}:owner=${cameraModeRef.current}`);

    if (request.kind === 'focus-board') {
      centerBoardViewport(rfInstance, board, request.minimumZoom, request.duration);
      return true;
    }

    if (request.kind === 'focus-components') {
      centerComponentsViewport(rfInstance, request.components, request.minimumZoom, request.duration);
      return true;
    }

    rfInstance.setCenter(request.centerX, request.centerY, {
      zoom: Math.max(rfInstance.getZoom(), request.minimumZoom),
      duration: request.duration,
    });
    return true;
  }, [appendViewportDebugAction, board, importedSchematicMode, importedSchematicViewMode, rfInstance]);

  const { reviewFocus, clearReviewFocus } = useCanvasReviewFocus({
    positionedComponents,
    setSelectedComponentId,
    requestViewportAction,
  });

  const renderedComponents = useMemo(
    () => [...components, ...(ghostFixPreview?.components ?? [])],
    [components, ghostFixPreview]
  );
  const renderedPositionedComponents = useMemo(
    () => [...positionedComponents, ...(ghostFixPreview?.components ?? [])],
    [ghostFixPreview, positionedComponents]
  );
  const renderedManualConnections = useMemo(
    () => [...manualConnections, ...(ghostFixPreview?.manualConnections ?? [])],
    [ghostFixPreview, manualConnections]
  );

  const { nodes, edges } = useCanvasGraphModel({
    activeBoardId,
    board,
    pins,
    components: renderedComponents,
    ghostFixPreview,
    positionedComponents: renderedPositionedComponents,
    componentRuntimeStates,
    importedSchematicScene,
    importedSchematicViewMode,
    importedSchematicMode,
    reviewFocus,
    collaborators: participants,
    manualConnections: renderedManualConnections,
    isPreviewRouting,
    routeContextKey,
    commentThreads: openThreads,
    selectedCommentId,
    highlightedThreadId,
    openCommentThread: (commentId: string) => {
      const thread = openThreads.find(item => item.root.id === commentId);
      if (!thread) {
        return;
      }
      selectComment(commentId);
      focusComment(thread.root);
    },
    removeComponent,
    rotateComponent,
  });

  const commentDraftAnchor = useMemo(() => {
    const activeDraft = shouldUseInlineCommentComposer(draft) ? draft : null;
    if (!activeDraft) {
      return null;
    }

    return resolveCommentTargetAnchor(activeDraft.targetType, activeDraft.targetMeta, positionedComponents);
  }, [draft, positionedComponents]);

  const commentDraftTargetLabel = useMemo(() => {
    if (!draft) {
      return '';
    }

    return getCommentTargetLabel(draft.targetType, draft.targetMeta, components, appLanguage);
  }, [appLanguage, components, draft]);

  const importedViewportBounds = useMemo(
    () => getImportedSchematicViewportBounds(components, importedSchematicScene),
    [components, importedSchematicScene]
  );
  const importedReviewViewportBounds = useMemo(
    () => {
      if (importedSchematicViewMode === 'structured') {
        const sceneBounds = getImportedSchematicSceneBounds([], importedSchematicScene);
        const structuredBounds = getImportedStructuredViewportBounds(
          components.filter(component => Boolean(component.importedGeometry)),
          manualConnections,
          sceneBounds ? { x: sceneBounds.x, y: sceneBounds.y } : { x: 0, y: 0 }
        );
        return structuredBounds
          ? normalizeStructuredViewportBounds(structuredBounds, importedSchematicViewMode)
          : getImportedSchematicReviewViewportBounds(components, importedSchematicScene);
      }

      const sourceFaithfulBounds = getImportedSchematicSceneBounds([], importedSchematicScene);
      return sourceFaithfulBounds
        ? {
            x: 0,
            y: 0,
            width: sourceFaithfulBounds.width,
            height: sourceFaithfulBounds.height,
          }
        : getImportedSchematicReviewViewportBounds(components, importedSchematicScene);
    },
    [components, importedSchematicScene, importedSchematicViewMode, manualConnections]
  );

  useEffect(() => {
    importedReviewViewportBoundsRef.current = importedReviewViewportBounds;
  }, [importedReviewViewportBounds]);

  const importedViewportKey = useMemo(() => {
    if (!importedSchematicMode || !importedViewportBounds) {
      return null;
    }

    const pageFrameKey = importedSchematicScene?.pageFrame
      ? [
          importedSchematicScene.pageFrame.start.x,
          importedSchematicScene.pageFrame.start.y,
          importedSchematicScene.pageFrame.end.x,
          importedSchematicScene.pageFrame.end.y,
        ].join(':')
      : 'no-frame';

    return [
      cloudProjectId ?? 'local-import',
      activeBoardId,
      components.filter(component => component.importedGeometry).map(component => component.instanceId).join(','),
      importedSchematicScene?.wireSegments.length ?? 0,
      importedSchematicScene?.junctions.length ?? 0,
      importedSchematicScene?.labels.length ?? 0,
      importedSchematicScene?.sheetFrames?.length ?? 0,
      pageFrameKey,
    ].join('|');
  }, [activeBoardId, cloudProjectId, components, importedViewportBounds, importedSchematicMode, importedSchematicScene]);

  const fitCanvasViewport = useCallback(() => {
    if (!rfInstance) {
      return;
    }

    if (importedSchematicMode && importedReviewViewportBounds) {
      const fitPadding = getImportedReviewFitPadding(importedReviewViewportBounds, importedSchematicViewMode);
      requestViewportAction({
        kind: 'fit-imported-review',
        source: 'imported-restore',
        bounds: importedReviewViewportBounds,
        padding: fitPadding,
        duration: 180,
      });
      appendViewportDebugAction('policy:toolbar-imported-fit');
      return;
    }

    rfInstance.fitView({ padding: 0.25 });
  }, [
    appendViewportDebugAction,
    importedReviewViewportBounds,
    importedSchematicMode,
    importedSchematicViewMode,
    requestViewportAction,
    rfInstance,
  ]);

  useCanvasViewportShortcuts(rfInstance, fitCanvasViewport);

  useEffect(() => {
    if (!importedSchematicMode) {
      cameraModeRef.current = 'editor';
      initialImportedFitDoneRef.current = false;
      cameraLockUntilRef.current = 0;
      if (importedReviewBoostTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(importedReviewBoostTimeoutRef.current);
        importedReviewBoostTimeoutRef.current = null;
      }
      return;
    }

    cameraModeRef.current = 'imported-review';
    initialImportedFitDoneRef.current = false;
    cameraLockUntilRef.current = Number.POSITIVE_INFINITY;
  }, [importedSchematicMode, importedViewportKey]);

  useEffect(() => {
    return () => {
      if (importedReviewBoostTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(importedReviewBoostTimeoutRef.current);
        importedReviewBoostTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!rfInstance || !importedSchematicMode || !importedReviewViewportBounds || !importedViewportKey) {
      return;
    }

    const fitPadding = getImportedReviewFitPadding(importedReviewViewportBounds, importedSchematicViewMode);

    let settleTimeout: number | null = null;
    const sampleTimeouts: number[] = [];

    const frame = requestAnimationFrame(() => {
      requestViewportAction({
        kind: 'fit-imported-review',
        source: 'imported-init',
        bounds: importedReviewViewportBounds,
        padding: fitPadding,
        duration: 220,
      });

      const pushViewportSample = (label: string) => {
        const viewport = rfInstance.getViewport();
        setImportedViewportDebug(current => ({
          targetBounds: getImportedReviewFocusBounds(importedReviewViewportBounds),
          appliedViewport: {
            x: Number(viewport.x.toFixed(2)),
            y: Number(viewport.y.toFixed(2)),
            zoom: Number(viewport.zoom.toFixed(4)),
          },
          actions: label === 'raf' ? [] : current.actions,
          samples: [
            ...current.samples.filter(sample => sample.label !== label),
            {
              label,
              x: Number(viewport.x.toFixed(2)),
              y: Number(viewport.y.toFixed(2)),
              zoom: Number(viewport.zoom.toFixed(4)),
            },
          ].slice(-6),
        }));
      };

      requestAnimationFrame(() => pushViewportSample('raf'));
      settleTimeout = window.setTimeout(() => {
        initialImportedFitDoneRef.current = true;
        cameraLockUntilRef.current = Date.now() + 1800;
        cameraModeRef.current = 'interactive-review';
        appendViewportDebugAction('policy:imported-lock:settled');
        pushViewportSample('fit-260ms');
      }, 260);

      for (const [delay, label] of [
        [600, 'sample-600ms'],
        [1200, 'sample-1200ms'],
        [2200, 'sample-2200ms'],
      ] as const) {
        sampleTimeouts.push(window.setTimeout(() => pushViewportSample(label), delay));
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      if (settleTimeout !== null) {
        window.clearTimeout(settleTimeout);
      }
      sampleTimeouts.forEach(timeout => window.clearTimeout(timeout));
    };
  }, [appendViewportDebugAction, importedReviewViewportBounds, importedSchematicMode, importedSchematicViewMode, importedViewportKey, requestViewportAction, rfInstance]);

  useEffect(() => {
    if (!rfInstance || !importedSchematicMode || !importedReviewViewportBounds || !initialImportedFitDoneRef.current) {
      return;
    }

    const fitPadding = getImportedReviewFitPadding(importedReviewViewportBounds, importedSchematicViewMode);
    requestViewportAction({
      kind: 'fit-imported-review',
      source: 'imported-restore',
      bounds: importedReviewViewportBounds,
      padding: fitPadding,
      duration: 180,
    });
    appendViewportDebugAction(`policy:viewmode-refit:${importedSchematicViewMode}`);
  }, [
    appendViewportDebugAction,
    importedReviewViewportBounds,
    importedSchematicMode,
    importedSchematicViewMode,
    requestViewportAction,
    rfInstance,
  ]);

  useEffect(() => {
    if (!rfInstance || !importedSchematicMode || !importedReviewViewportBounds) {
      previousImportedViewModeRef.current = importedSchematicViewMode;
      return;
    }

    const previousMode = previousImportedViewModeRef.current;
    previousImportedViewModeRef.current = importedSchematicViewMode;

    if (!previousMode || previousMode === importedSchematicViewMode) {
      return;
    }

    const focusBounds = getImportedReviewFocusBounds(importedReviewViewportBounds);
    const padding = getImportedReviewFitPadding(importedReviewViewportBounds, importedSchematicViewMode);
    const zoomBias = getImportedReviewZoomBias(importedSchematicViewMode);

    cameraModeRef.current = 'imported-review';
    rfInstance.fitBounds(focusBounds, {
      padding,
      duration: 220,
    });
    appendViewportDebugAction(`policy:viewmode-direct-fit:${previousMode}->${importedSchematicViewMode}`);

    if (typeof window !== 'undefined') {
      const centerX = focusBounds.x + focusBounds.width / 2;
      const centerY = focusBounds.y + focusBounds.height / 2;
      window.setTimeout(() => {
        const viewport = rfInstance.getViewport();
        const nextZoom = Number((viewport.zoom * zoomBias).toFixed(4));
        rfInstance.setCenter(centerX, centerY, {
          zoom: nextZoom,
          duration: 0,
        });
        publishCanvasViewportZoom(nextZoom);
        appendViewportDebugAction(`boost:viewmode:${importedSchematicViewMode}`);
      }, 240);
    }
  }, [
    appendViewportDebugAction,
    importedReviewViewportBounds,
    importedSchematicMode,
    importedSchematicViewMode,
    rfInstance,
  ]);

  const updateCanvasPresence = useCallback((
    scope: 'canvas' | 'review' | 'code' | 'idle',
    selection?: { componentId?: string; boardPin?: string; label?: string } | null,
    cursor?: { x?: number; y?: number } | null
  ) => {
    if (!collaborationEnabled) {
      return;
    }

    updatePresence({
      scope,
      selection:
        selection === undefined
          ? undefined
          : selection === null
            ? null
            : {
                componentId: selection.componentId,
                boardPin: selection.boardPin,
                label: selection.label,
              },
      cursor:
        cursor === undefined
          ? undefined
          : cursor === null
            ? null
            : {
                x: cursor.x,
                y: cursor.y,
              },
    });
  }, [collaborationEnabled, updatePresence]);

  const onImportedCanvasResize = useCallback(() => {
    if (!rfInstance || !importedSchematicMode) {
      return;
    }

    const bounds = importedReviewViewportBoundsRef.current;
    if (!bounds) {
      return;
    }

    const lockActive =
      !initialImportedFitDoneRef.current || Date.now() < cameraLockUntilRef.current;

    if (!lockActive) {
      return;
    }

    const fitPadding = getImportedReviewFitPadding(bounds, importedSchematicViewMode);

    requestViewportAction({
      kind: 'fit-imported-review',
      source: 'imported-restore',
      bounds,
      padding: fitPadding,
      duration: 0,
    });
    appendViewportDebugAction('policy:resize-refit');
  }, [appendViewportDebugAction, importedSchematicMode, importedSchematicViewMode, requestViewportAction, rfInstance]);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isEditable) {
      toast.info('이 링크는 보기 전용입니다. 복제본을 만들어서 편집해 주세요.');
      return;
    }

    const templateId = event.dataTransfer.getData('application/modumake-component');
    if (!templateId) return;

    const template = getTemplateById(templateId);
    if (!template) return;
    const localizedName = getLocalizedTemplateName(template, appLanguage);
    const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });

    if (!importedSchematicMode && !isVoltageCompatible(template.compatibleVoltage, board.logicVoltage)) {
      toast.error(t('⚠️ 전압 비호환', '⚠️ Voltage mismatch'), {
        description: t(
          `"${localizedName}"은 ${template.compatibleVoltage} 전용입니다. ${board.name}(${board.logicVoltage})에서 사용할 수 없습니다.`,
          `"${localizedName}" is ${template.compatibleVoltage}-only and cannot be used on ${board.name} (${board.logicVoltage}).`
        ),
      });
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = {
      x: Math.round((event.clientX - bounds.left - 80) / 15) * 15,
      y: Math.round((event.clientY - bounds.top - 50) / 15) * 15,
    };

    const addResult = addComponent(template, position);
    if (!addResult.success) {
      toast.error(t(`⚠️ "${localizedName}" 배치 실패`, `⚠️ Could not place "${localizedName}"`), {
        description: addResult.error ?? t(
          '부품을 현재 보드 조건에 맞게 배치할 수 없습니다.',
          'This part cannot be placed on the current board setup.'
        ),
      });
      return;
    }

    const { components: updated } = useBoardStore.getState();
    const newComponent = updated[updated.length - 1];
    if (newComponent && !newComponent.isFullyRouted) {
      toast.error(t(`⚠️ "${localizedName}" 배치 실패`, `⚠️ Could not place "${localizedName}"`), {
        description: t('아두이노 핀이 부족합니다. 기존 부품을 제거해주세요.', 'There are not enough board pins left. Remove an existing part and try again.'),
      });
      return;
    }

    toast.success(t(`✅ "${localizedName}" 배치 완료`, `✅ "${localizedName}" placed`), {
      description: t('리뷰 캔버스에 추가했습니다.', 'Added to the review canvas.'),
    });
  }, [addComponent, appLanguage, board, importedSchematicMode, isEditable]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    const selectedNode = params.nodes[0];
    clearReviewFocus();
    setSelectedComponentId(selectedNode ? selectedNode.id : null);
    if (selectedNode?.id === BOARD_NODE_ID) {
      updateCanvasPresence('canvas', {
        componentId: BOARD_NODE_ID,
        label: board.name,
      });
    } else if (selectedNode) {
      const component = components.find(item => item.instanceId === selectedNode.id);
      updateCanvasPresence('canvas', {
        componentId: selectedNode.id,
        label: component?.name ?? selectedNode.id,
      });
    } else {
      updateCanvasPresence('canvas', null);
    }
    window.dispatchEvent(new CustomEvent('modumake:canvas-selection-change', {
      detail: {
        nodeIds: params.nodes.map(node => node.id),
      },
    }));
  }, [board.name, clearReviewFocus, components, setSelectedComponentId, updateCanvasPresence]);

  const screenPointToFlowPosition = useCallback((point: { x: number; y: number }) => {
    if (!rfInstance) {
      return null;
    }

    if (typeof rfInstance.screenToFlowPosition === 'function') {
      return rfInstance.screenToFlowPosition(point);
    }

    if (typeof rfInstance.project === 'function') {
      return rfInstance.project(point);
    }

    return null;
  }, [rfInstance]);

  const toFlowPosition = useCallback((event: React.MouseEvent) => {
    return screenPointToFlowPosition({ x: event.clientX, y: event.clientY });
  }, [screenPointToFlowPosition]);

  useEffect(() => {
    const handleStartCanvasComment = (event: Event) => {
      const detail = (event as CustomEvent<{
        targetType?: 'canvas_coord' | 'node';
        nodeId?: string;
        clientX?: number;
        clientY?: number;
      }>).detail;
      if (!detail || typeof detail.clientX !== 'number' || typeof detail.clientY !== 'number') {
        return;
      }

      const point = screenPointToFlowPosition({ x: detail.clientX, y: detail.clientY });
      if (!point) {
        return;
      }

      if (detail.targetType === 'node' && detail.nodeId) {
        startCommentDraft('node', {
          nodeId: detail.nodeId,
          x: Math.round(point.x),
          y: Math.round(point.y),
        });
        return;
      }

      startCommentDraft('canvas_coord', {
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
    };

    window.addEventListener('modumake:start-canvas-comment', handleStartCanvasComment as EventListener);
    return () => {
      window.removeEventListener('modumake:start-canvas-comment', handleStartCanvasComment as EventListener);
    };
  }, [screenPointToFlowPosition, startCommentDraft]);

  const onConnect = useCallback((connection: Connection) => {
    if (!isEditable) {
      toast.info('보기 전용 링크에서는 수동 넷 편집을 할 수 없습니다.');
      return;
    }

    if (wiringMode !== 'manual') {
      toast.info('수동 넷 편집 모드에서만 핀을 직접 연결할 수 있습니다.');
      return;
    }

    if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) {
      toast.error('연결할 패드 정보를 읽지 못했습니다.');
      return;
    }

    const result = connectPads(
      connection.source,
      connection.sourceHandle,
      connection.target,
      connection.targetHandle
    );

    if (!result.success) {
      toast.error('수동 넷 연결 실패', {
        description: result.error ?? '패드 연결 중 문제가 발생했습니다.',
      });
      return;
    }

    toast.success('수동 넷 연결 완료', {
      description: `${connection.sourceHandle} ↔ ${connection.targetHandle}`,
    });
  }, [connectPads, isEditable, wiringMode]);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    updateCanvasPresence('canvas', null);
    if (!commentMode) {
      return;
    }

    const point = toFlowPosition(event);
    if (!point) {
      return;
    }

    startCommentDraft('canvas_coord', {
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }, [commentMode, startCommentDraft, toFlowPosition, updateCanvasPresence]);

  const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
    const point = toFlowPosition(event);
    if (!point) {
      return;
    }

    updateCanvasPresence('canvas', undefined, {
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }, [toFlowPosition, updateCanvasPresence]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type !== 'commentPin') {
      const component =
        node.id === BOARD_NODE_ID
          ? null
          : components.find(item => item.instanceId === node.id);
      updateCanvasPresence('canvas', {
        componentId: node.id,
        label: node.id === BOARD_NODE_ID ? board.name : component?.name ?? node.id,
      });
    }

    if (!commentMode) {
      return;
    }

    if (node.type === 'commentPin') {
      return;
    }

    const point = toFlowPosition(event);
    startCommentDraft('node', {
      nodeId: node.id,
      x: point ? Math.round(point.x) : undefined,
      y: point ? Math.round(point.y) : undefined,
    });
  }, [board.name, commentMode, components, startCommentDraft, toFlowPosition, updateCanvasPresence]);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    if (node.type !== 'commentPin') {
      setSelectedComponentId(node.id);
    }
  }, [setSelectedComponentId]);

  const onNodeMouseMove = useCallback((event: React.MouseEvent, node: Node) => {
    const point = toFlowPosition(event);
    if (!point) {
      return;
    }

    const component = node.id === BOARD_NODE_ID
      ? null
      : components.find(item => item.instanceId === node.id);
    updateCanvasPresence('canvas', {
      componentId: node.id,
      label: node.id === BOARD_NODE_ID ? board.name : component?.name ?? node.id,
    }, {
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }, [board.name, components, toFlowPosition, updateCanvasPresence]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (!commentMode) {
      return;
    }

    const point = toFlowPosition(event);
    if (!point) {
      return;
    }

    startCommentDraft('wire', {
      wireId: edge.id,
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }, [commentMode, startCommentDraft, toFlowPosition]);

  const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
    routingOnNodeDragStart(event, node);
    updateCanvasPresence('canvas', {
      componentId: node.id,
      label: node.id === BOARD_NODE_ID ? board.name : components.find(item => item.instanceId === node.id)?.name ?? node.id,
    }, {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    });
  }, [board.name, components, routingOnNodeDragStart, updateCanvasPresence]);

  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    routingOnNodeDrag(event, node);
    updateCanvasPresence('canvas', {
      componentId: node.id,
      label: node.id === BOARD_NODE_ID ? board.name : components.find(item => item.instanceId === node.id)?.name ?? node.id,
    }, {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    });
  }, [board.name, components, routingOnNodeDrag, updateCanvasPresence]);

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    routingOnNodeDragStop(event, node);
    updateCanvasPresence('canvas', {
      componentId: node.id,
      label: node.id === BOARD_NODE_ID ? board.name : components.find(item => item.instanceId === node.id)?.name ?? node.id,
    }, {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    });
  }, [board.name, components, routingOnNodeDragStop, updateCanvasPresence]);

  useEffect(() => {
    const handleCommentFocus = (event: Event) => {
      const detail = (event as CustomEvent<CommentFocusDetail>).detail;
      if (!detail || detail.targetType === 'code_line') {
        return;
      }

      if (detail.targetType === 'node' && 'nodeId' in detail.targetMeta) {
        if (detail.targetMeta.nodeId === BOARD_NODE_ID) {
          setSelectedComponentId(BOARD_NODE_ID);
        } else {
          setSelectedComponentId(detail.targetMeta.nodeId);
        }
      }

      let centerX: number | null = null;
      let centerY: number | null = null;

      if ('x' in detail.targetMeta && 'y' in detail.targetMeta) {
        centerX = detail.targetMeta.x ?? 0;
        centerY = detail.targetMeta.y ?? 0;
      } else if (detail.targetType === 'node' && 'nodeId' in detail.targetMeta) {
        const nodeId = detail.targetMeta.nodeId;
        if (nodeId === BOARD_NODE_ID) {
          const boardRect = getBoardBodyRect(board);
          centerX = boardRect.x + boardRect.width / 2;
          centerY = boardRect.y + boardRect.height / 2;
        } else {
          const component = positionedComponents.find(item => item.instanceId === nodeId);
          if (component) {
            const componentRect = getComponentBodyRect(component, getTemplateById(component.templateId));
            centerX = componentRect.x + componentRect.width / 2;
            centerY = componentRect.y + componentRect.height / 2;
          }
        }
      }

      if (centerX !== null && centerY !== null) {
        requestViewportAction({
          kind: 'focus-point',
          source: 'comment-focus',
          centerX,
          centerY,
          minimumZoom: 0.95,
          duration: 240,
        });
      }
    };

    window.addEventListener(COMMENT_FOCUS_EVENT, handleCommentFocus as EventListener);
    return () => {
      window.removeEventListener(COMMENT_FOCUS_EVENT, handleCommentFocus as EventListener);
    };
  }, [board, positionedComponents, requestViewportAction, setSelectedComponentId]);

  return {
    board,
    isEditable,
    wiringMode,
    showGrid,
    showMinimap,
    exportRef,
    collaborators: participants,
    nodes,
    edges,
    positionedComponents,
    importedSchematicScene,
    hasLegacyImportedScene,
    commentDraft: draft,
    commentMode,
    commentDraftAnchor,
    commentDraftTargetLabel,
    cancelCommentDraft: cancelDraft,
    submitCommentDraft: submitDraft,
    toggleCommentMode,
    onDrop,
    onDragOver,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onSelectionChange,
    onConnect,
    onPaneClick,
    onPaneMouseMove,
    onNodeClick,
    onNodeDoubleClick,
    onNodeMouseMove,
    onEdgeClick,
    onFocusCollaborator: focusParticipant,
    setRfInstance,
    importedViewportDebug,
    importedReviewViewportBounds,
    importedViewportKey,
    onImportedCanvasResize,
  };
}
