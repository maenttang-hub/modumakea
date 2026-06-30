'use client';

import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { CSSProperties } from 'react';

import type { WireEdgeData } from '@/types';
import type { CollaborationParticipant, ImportedSchematicScene } from '@/types';
import type { CommentDraft } from '@/components/comments/project-comments-provider';
import { ArduinoNode } from './arduino-node';
import { CommentPinNode } from './comment-pin-node';
import { CommentDraftPopover } from './comment-draft-popover';
import { ImportedSchematicOverlayNode } from './imported-schematic-overlay';
import { ImportedSchematicNode } from './imported-schematic-node';
import { SensorNode } from './sensor-node';
import { WireEdge } from './wire-edge';
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { useBoardStore } from '@/store/use-board-store';

const nodeTypes: NodeTypes = {
  boardNode: ArduinoNode,
  sensorComponent: SensorNode,
  importedSchematicComponent: ImportedSchematicNode,
  importedSchematicOverlayNode: ImportedSchematicOverlayNode,
  commentPin: CommentPinNode,
};

const edgeTypes: EdgeTypes = {
  wireEdge: WireEdge,
};

type ComponentCanvasViewProps = {
  boardAccentColor: string;
  isEditable: boolean;
  wiringMode: 'auto' | 'manual';
  showGrid: boolean;
  showMinimap: boolean;
  exportRef: MutableRefObject<HTMLDivElement | null>;
  collaborators: CollaborationParticipant[];
  nodes: Node[];
  edges: Edge<WireEdgeData>[];
  importedSchematicScene: ImportedSchematicScene | null;
  hasLegacyImportedScene: boolean;
  commentDraft: CommentDraft | null;
  commentMode: boolean;
  commentDraftAnchor: { x: number; y: number } | null;
  commentDraftTargetLabel: string;
  cancelCommentDraft: () => void;
  submitCommentDraft: (content: string) => Promise<{ success: boolean }>;
  toggleCommentMode: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onNodeDragStart: (event: React.MouseEvent, node: Node) => void;
  onNodeDrag: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  onSelectionChange: (params: { nodes: Node[]; edges: Edge[] }) => void;
  onConnect: (connection: Connection) => void;
  onPaneClick: (event: React.MouseEvent) => void;
  onPaneMouseMove: (event: React.MouseEvent) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseMove: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge<WireEdgeData>) => void;
  onFocusCollaborator: (sessionId: string) => void;
  setRfInstance: (instance: ReactFlowInstance) => void;
  importedViewportDebug: {
    targetBounds: { x: number; y: number; width: number; height: number } | null;
    appliedViewport: { x: number; y: number; zoom: number } | null;
    samples: Array<{ label: string; x: number; y: number; zoom: number }>;
    actions: string[];
  };
  importedViewportKey: string | null;
  onImportedCanvasResize: () => void;
};

type CanvasTooltipDetail = {
  title: string;
  lines?: string[];
  note?: string;
  accent?: string;
  clientX?: number;
  clientY?: number;
};

export function ComponentCanvasView({
  isEditable,
  showGrid,
  exportRef,
  nodes,
  edges,
  importedSchematicScene,
  commentDraft,
  commentDraftAnchor,
  commentDraftTargetLabel,
  cancelCommentDraft,
  submitCommentDraft,
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
  setRfInstance,
  importedViewportKey,
  onImportedCanvasResize,
}: ComponentCanvasViewProps) {
  const rf = useReactFlow();
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const importedSchematicViewMode = useBoardStore(state => state.importedSchematicViewMode);
  const importedSchematicMode =
    Boolean(importedSchematicScene) ||
    nodes.some(node => node.type === 'importedSchematicComponent') ||
    activeBoardId === 'kicad_generic';
  const importedPalette = getImportedSchematicPalette(importedSchematicMode ? 'light' : schematicTheme);
  const importedCanvasStyle: CSSProperties & Record<string, string | undefined> = {
    background: importedSchematicMode ? importedPalette.canvasBackground : undefined,
    '--mm-rf-renderer-bg': importedSchematicMode ? importedPalette.canvasBackground : '#fbf8f2',
    '--mm-rf-controls-bg': importedSchematicMode ? importedPalette.controlsBackground : '#ffffff',
    '--mm-rf-controls-border': importedSchematicMode ? importedPalette.controlsBorder : '#ded5ca',
    '--mm-rf-controls-button-bg': importedSchematicMode ? importedPalette.controlsButtonBackground : '#ffffff',
    '--mm-rf-controls-button-hover-bg': importedSchematicMode ? importedPalette.controlsButtonHoverBackground : '#f4eee6',
    '--mm-rf-controls-button-color': importedSchematicMode ? importedPalette.controlsButtonColor : '#8d7f73',
    '--mm-rf-controls-button-hover-color': importedSchematicMode ? importedPalette.controlsButtonHoverColor : '#5f5247',
    '--mm-rf-minimap-bg': importedSchematicMode ? importedPalette.minimapBackground : '#fffdfa',
    '--mm-rf-selection-bg': importedSchematicMode ? importedPalette.selectionBackground : 'rgba(122,168,220,0.08)',
    '--mm-rf-selection-border': importedSchematicMode ? importedPalette.selectionBorder : '#7aa8dc',
  };
  const effectiveShowGrid = importedSchematicMode ? true : showGrid;
  const [canvasTooltip, setCanvasTooltip] = useState<{
    title: string;
    lines: string[];
    note?: string;
    accent: string;
    x: number;
    y: number;
  } | null>(null);

  const setCanvasRoot = useCallback((node: HTMLDivElement | null) => {
    exportRef.current = node;
    setCanvasElement(node);
  }, [exportRef]);

  useEffect(() => {
    if (!importedSchematicMode || !canvasElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        onImportedCanvasResize();
      });
    });

    observer.observe(canvasElement);
    return () => {
      observer.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [canvasElement, importedSchematicMode, onImportedCanvasResize]);

  useEffect(() => {
    const handleTooltip = (event: Event) => {
      if (!canvasElement) {
        return;
      }
      const detail = (event as CustomEvent<CanvasTooltipDetail>).detail;
      if (!detail?.title) {
        return;
      }
      const bounds = canvasElement.getBoundingClientRect();
      const rawX = (detail.clientX ?? bounds.left + bounds.width * 0.68) - bounds.left;
      const rawY = (detail.clientY ?? bounds.top + 24) - bounds.top;
      setCanvasTooltip({
        title: detail.title,
        lines: detail.lines ?? [],
        note: detail.note,
        accent: detail.accent ?? '#d7988d',
        x: Math.min(Math.max(rawX, 18), Math.max(bounds.width - 256, 18)),
        y: Math.min(Math.max(rawY - 18, 18), Math.max(bounds.height - 116, 18)),
      });
    };

    const clearTooltip = () => setCanvasTooltip(null);
    window.addEventListener('modumake:canvas-tooltip', handleTooltip as EventListener);
    window.addEventListener('modumake:canvas-tooltip-clear', clearTooltip);
    return () => {
      window.removeEventListener('modumake:canvas-tooltip', handleTooltip as EventListener);
      window.removeEventListener('modumake:canvas-tooltip-clear', clearTooltip);
    };
  }, [canvasElement]);

  const inlineDraftPosition = commentDraftAnchor && canvasElement
    ? (() => {
        const screenPoint = rf.flowToScreenPosition(commentDraftAnchor);
        const canvasBounds = canvasElement.getBoundingClientRect();
        return {
          x: screenPoint.x - canvasBounds.left,
          y: screenPoint.y - canvasBounds.top,
        };
      })()
    : null;

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, [setRfInstance]);

  return (
    <div
      ref={setCanvasRoot}
      data-mm-export="schematic-canvas"
      className="w-full h-full relative transition-colors"
      style={importedCanvasStyle}
    >
      {canvasTooltip ? (
        <div
          className="pointer-events-none absolute z-20 w-[220px] rounded-[16px] border bg-[#fffdf9]/95 px-3.5 py-3 text-left shadow-[0_18px_40px_rgba(102,78,64,0.16)] backdrop-blur-sm"
          style={{
            left: canvasTooltip.x,
            top: canvasTooltip.y,
            borderColor: `${canvasTooltip.accent}44`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: canvasTooltip.accent }} />
            <div className="truncate text-[11px] font-semibold text-[#43372f]">{canvasTooltip.title}</div>
          </div>
          {canvasTooltip.lines.length > 0 ? (
            <div className="mt-2 space-y-1 text-[10px] leading-[1.45] text-[#8d8074]">
              {canvasTooltip.lines.map(line => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}
          {canvasTooltip.note ? (
            <div className="mt-2 text-[10px] leading-[1.45] text-[#b06878]">
              {canvasTooltip.note}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="absolute inset-0">
        <div
          className={importedSchematicMode
            ? 'absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,#fffdf9_0%,#fbf7ef_100%)]'
            : 'absolute inset-0 overflow-hidden'}
        >
          <div className="absolute inset-0">
            <ReactFlow
              key={importedViewportKey ?? activeBoardId}
              className="relative z-10"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onSelectionChange={onSelectionChange}
              onConnect={onConnect}
              onPaneClick={onPaneClick}
              onPaneMouseMove={onPaneMouseMove}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeMouseMove={onNodeMouseMove}
              onEdgeClick={onEdgeClick}
              onInit={handleInit}
              onMoveEnd={(_, viewport) => {
                window.dispatchEvent(new CustomEvent('modumake:viewport-change', {
                  detail: { zoom: viewport.zoom },
                }));
              }}
              fitView={!importedSchematicMode}
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.15}
              maxZoom={3}
              nodesDraggable={!importedSchematicMode && isEditable}
              nodesConnectable={false}
              connectionRadius={24}
              connectionMode={ConnectionMode.Loose}
              snapToGrid={!importedSchematicMode}
              snapGrid={importedSchematicMode ? undefined : [15, 15]}
              defaultEdgeOptions={{
                type: 'step',
                style: { stroke: '#22c55e', strokeWidth: 1.5 },
              }}
              connectionLineStyle={{ stroke: '#60a5fa', strokeWidth: 1.5 }}
              proOptions={{ hideAttribution: true }}
            >
              {effectiveShowGrid && (
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={importedSchematicMode ? 12 : 15}
                  size={importedSchematicMode ? 1.1 : 1.5}
                  color={importedSchematicMode ? importedPalette.reactFlowGrid : '#475569'}
                />
              )}
            </ReactFlow>
          </div>
          {importedSchematicMode ? (
            <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full border border-[#e5daca] bg-[#fffdf9]/92 px-3 py-1.5 text-[10px] font-semibold text-[#7b6c5f] shadow-[0_10px_24px_rgba(100,76,57,0.08)]">
              {importedSchematicViewMode === 'structured' ? '정리된 회로도' : '원본 도면'} · {nodes.length}개 심볼
            </div>
          ) : null}
        </div>
      </div>
      {commentDraft?.mode === 'new' && inlineDraftPosition && commentDraftTargetLabel ? (
        <CommentDraftPopover
          anchor={inlineDraftPosition}
          targetLabel={commentDraftTargetLabel}
          onCancel={cancelCommentDraft}
          onSubmit={async content => {
            const result = await submitCommentDraft(content);
            if (!result.success) {
              return;
            }
          }}
        />
      ) : null}
    </div>
  );
}
