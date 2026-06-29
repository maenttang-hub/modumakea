'use client';

import { useMemo } from 'react';
import type { Edge, Node } from 'reactflow';
import { buildCanvasEdges, buildCanvasNodes } from '@/components/canvas/canvas-graph';
import type { BoardDefinition } from '@/constants/boards';
import type { ReviewFocusDetail } from '@/lib/review-focus';
import type {
  BoardPin,
  CollaborationParticipant,
  ComponentRuntimeState,
  GhostFixPreview,
  ImportedSchematicScene,
  ImportedSchematicViewMode,
  ManualNetConnection,
  PlacedComponent,
  ProjectCommentThread,
  WireEdgeData,
} from '@/types';

type UseCanvasGraphModelArgs = {
  activeBoardId: string;
  board: BoardDefinition;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  ghostFixPreview: GhostFixPreview | null;
  positionedComponents: PlacedComponent[];
  componentRuntimeStates: Record<string, ComponentRuntimeState | undefined>;
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicViewMode: ImportedSchematicViewMode;
  importedSchematicMode: boolean;
  reviewFocus: ReviewFocusDetail | null;
  collaborators: CollaborationParticipant[];
  manualConnections: ManualNetConnection[];
  isPreviewRouting: boolean;
  routeContextKey: string;
  commentThreads: ProjectCommentThread[];
  selectedCommentId: string | null;
  highlightedThreadId: string | null;
  openCommentThread: (commentId: string) => void;
  removeComponent: (instanceId: string) => void;
  rotateComponent: (instanceId: string) => void;
};

export function useCanvasGraphModel({
  activeBoardId,
  board,
  pins,
  components,
  ghostFixPreview,
  positionedComponents,
  componentRuntimeStates,
  importedSchematicScene,
  importedSchematicViewMode,
  importedSchematicMode,
  reviewFocus,
  collaborators,
  manualConnections,
  isPreviewRouting,
  routeContextKey,
  commentThreads,
  selectedCommentId,
  highlightedThreadId,
  openCommentThread,
  removeComponent,
  rotateComponent,
}: UseCanvasGraphModelArgs) {
  const nodes = useMemo<Node[]>(() => buildCanvasNodes({
    activeBoardId,
    board,
    pins,
    components,
    manualConnections,
    ghostComponentIds: new Set((ghostFixPreview?.components ?? []).map(component => component.instanceId)),
    importedSchematicScene,
    importedSchematicViewMode,
    positionedComponents,
    componentRuntimeStates,
    reviewFocus,
    collaborators,
      commentThreads,
      selectedCommentId,
      highlightedThreadId,
      openCommentThread,
    removeComponent,
    rotateComponent,
  }), [
    activeBoardId,
    board,
    pins,
    components,
    manualConnections,
    importedSchematicScene,
    importedSchematicViewMode,
    ghostFixPreview,
    positionedComponents,
    componentRuntimeStates,
    reviewFocus,
    collaborators,
    commentThreads,
    selectedCommentId,
    highlightedThreadId,
    openCommentThread,
    removeComponent,
    rotateComponent,
  ]);

  const edges = useMemo<Edge<WireEdgeData>[]>(() => buildCanvasEdges({
    components,
    manualConnections,
    ghostComponentIds: new Set((ghostFixPreview?.components ?? []).map(component => component.instanceId)),
    ghostConnectionIds: new Set((ghostFixPreview?.manualConnections ?? []).map(connection => connection.id)),
    importedSchematicMode,
    hasImportedSchematicScene: (importedSchematicScene?.wireSegments.length ?? 0) > 0,
    reviewFocus,
    isPreviewRouting,
    routeContextKey,
  }), [
    components,
    ghostFixPreview,
    importedSchematicScene,
    importedSchematicMode,
    manualConnections,
    reviewFocus,
    isPreviewRouting,
    routeContextKey,
  ]);

  return {
    nodes,
    edges,
  };
}
