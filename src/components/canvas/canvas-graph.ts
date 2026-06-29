import type { Edge, Node } from 'reactflow';

import { buildCommentPreview, getCommentTargetLabel, resolveCommentAnchor } from '@/lib/project-comments';
import type { BoardDefinition } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { getPinColorType } from '@/lib/auto-router';
import type { ReviewFocusDetail } from '@/lib/review-focus';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { getImportedSchematicSceneBounds } from '@/lib/imported-schematic-scene-bounds';
import { getImportedStructuredViewportBounds } from '@/lib/imported-schematic-structured-view';
import type {
  BoardNodeData,
  CommentPinNodeData,
  CollaborationParticipant,
  ComponentRuntimeState,
  ImportedSchematicViewMode,
  ImportedSchematicOverlayNodeData,
  ImportedSchematicScene,
  ManualNetConnection,
  PlacedComponent,
  ProjectCommentThread,
  SensorNodeData,
  WireEdgeData,
  BoardPin,
} from '@/types';

export const BOARD_NODE_ID = 'board-node';
export const BOARD_NODE_POSITION = { x: 80, y: 60 };
export const IMPORTED_SCHEMATIC_OVERLAY_NODE_ID = 'imported-schematic-overlay-node';

function getManualPinType(sourcePin: string, targetPin: string): WireEdgeData['pinType'] {
  const pair = `${sourcePin}|${targetPin}`.toLowerCase();
  if (pair.includes('gnd') || pair.includes('ground')) {
    return 'GND';
  }
  if (pair.includes('vcc') || pair.includes('vin') || pair.includes('5v') || pair.includes('3.3v') || pair.includes('3v3')) {
    return 'VCC';
  }
  return 'SIGNAL';
}

function isComponentHighlighted(
  component: PlacedComponent,
  reviewFocus: ReviewFocusDetail | null
) {
  const focusedIds = new Set([
    reviewFocus?.componentInstanceId,
    ...(reviewFocus?.componentInstanceIds ?? []),
  ].filter((value): value is string => Boolean(value)));
  return (
    focusedIds.has(component.instanceId) ||
    (!!reviewFocus?.boardPin && Object.values(component.assignedPins).includes(reviewFocus.boardPin))
  );
}

function getHighlightedComponentPin(
  component: PlacedComponent,
  reviewFocus: ReviewFocusDetail | null
) {
  const focusedIds = new Set([
    reviewFocus?.componentInstanceId,
    ...(reviewFocus?.componentInstanceIds ?? []),
  ].filter((value): value is string => Boolean(value)));
  if (!focusedIds.has(component.instanceId)) {
    return undefined;
  }

  return (
    reviewFocus?.componentPin ??
    Object.entries(component.assignedPins).find(([, boardPin]) => boardPin === reviewFocus?.boardPin)?.[0]
  );
}

function hasActiveReviewFocus(reviewFocus: ReviewFocusDetail | null) {
  return Boolean(
    reviewFocus &&
      reviewFocus.interaction !== 'clear' &&
      (
        reviewFocus.boardPin ||
        reviewFocus.componentInstanceId ||
        (reviewFocus.componentInstanceIds?.length ?? 0) > 0
      )
  );
}

function isSignalEdgeHighlighted(
  component: PlacedComponent,
  pinName: string,
  boardPinId: string,
  reviewFocus: ReviewFocusDetail | null
) {
  const focusedIds = new Set([
    reviewFocus?.componentInstanceId,
    ...(reviewFocus?.componentInstanceIds ?? []),
  ].filter((value): value is string => Boolean(value)));
  return (
    (focusedIds.has(component.instanceId) &&
      (!reviewFocus?.componentPin || reviewFocus.componentPin === pinName)) ||
    (!!reviewFocus?.boardPin && reviewFocus.boardPin === boardPinId)
  );
}

function isManualEdgeHighlighted(
  connection: ManualNetConnection,
  reviewFocus: ReviewFocusDetail | null
) {
  const focusedIds = new Set([
    reviewFocus?.componentInstanceId,
    ...(reviewFocus?.componentInstanceIds ?? []),
  ].filter((value): value is string => Boolean(value)));
  return (
    (focusedIds.size > 0 &&
      [connection.source.ownerId, connection.target.ownerId].some(ownerId => focusedIds.has(ownerId)) &&
      (!reviewFocus?.componentPin ||
        connection.source.pinId === reviewFocus.componentPin ||
        connection.target.pinId === reviewFocus.componentPin)) ||
    (!!reviewFocus?.boardPin &&
      (connection.source.pinId === reviewFocus.boardPin || connection.target.pinId === reviewFocus.boardPin))
  );
}

type BuildCanvasNodesArgs = {
  activeBoardId: string;
  board: BoardDefinition;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  ghostComponentIds: Set<string>;
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicViewMode: ImportedSchematicViewMode;
  positionedComponents: PlacedComponent[];
  componentRuntimeStates: Record<string, ComponentRuntimeState | undefined>;
  reviewFocus: ReviewFocusDetail | null;
  collaborators: CollaborationParticipant[];
  commentThreads: ProjectCommentThread[];
  selectedCommentId: string | null;
  highlightedThreadId: string | null;
  openCommentThread: (commentId: string) => void;
  removeComponent: (instanceId: string) => void;
  rotateComponent: (instanceId: string) => void;
};

export function buildCanvasNodes({
  activeBoardId,
  board,
  pins,
  components,
  manualConnections,
  ghostComponentIds = new Set<string>(),
  importedSchematicScene = null,
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
}: BuildCanvasNodesArgs): Node[] {
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const baseImportedSceneBounds =
    importedSchematicMode && importedSchematicScene
      ? getImportedSchematicSceneBounds([], importedSchematicScene)
      : null;
  const importedSceneBounds =
    importedSchematicMode && importedSchematicScene
      ? (
          importedSchematicViewMode === 'structured'
            ? getImportedStructuredViewportBounds(
                positionedComponents.filter(component => Boolean(component.importedGeometry)),
                manualConnections,
                baseImportedSceneBounds
                  ? { x: baseImportedSceneBounds.x, y: baseImportedSceneBounds.y }
                  : { x: 0, y: 0 }
              ) ?? baseImportedSceneBounds
            : baseImportedSceneBounds
        )
      : null;
  const importedSceneOrigin = importedSceneBounds
    ? { x: importedSceneBounds.x, y: importedSceneBounds.y }
    : { x: 0, y: 0 };
  const showBoardNode = !importedSchematicMode;
  const focusActive = hasActiveReviewFocus(reviewFocus);
  const pinUsage = components.reduce<Record<string, { componentName: string; componentPin: string; componentInstanceId?: string }>>((acc, component) => {
    Object.entries(component.assignedPins).forEach(([componentPin, boardPin]) => {
      acc[boardPin] = {
        componentName: component.name,
        componentPin,
        componentInstanceId: component.instanceId,
      };
    });
    return acc;
  }, {});

  const collaboratorSelections = collaborators.reduce<Record<string, Array<Pick<CollaborationParticipant, 'sessionId' | 'userName' | 'color'>>>>((acc, collaborator) => {
    const targetId = collaborator.selection?.componentId;
    if (!targetId) {
      return acc;
    }

    const next = acc[targetId] ?? [];
    next.push({
      sessionId: collaborator.sessionId,
      userName: collaborator.userName,
      color: collaborator.color,
    });
    acc[targetId] = next;
    return acc;
  }, {});

  const boardCollaborators = collaborators
    .filter(collaborator =>
      collaborator.selection?.componentId === BOARD_NODE_ID ||
      collaborator.selection?.boardPin
    )
    .map(collaborator => ({
      sessionId: collaborator.sessionId,
      userName: collaborator.userName,
      color: collaborator.color,
    }));

  const boardNode: Node<BoardNodeData> = {
    id: BOARD_NODE_ID,
    type: 'boardNode',
    position: BOARD_NODE_POSITION,
    draggable: false,
    data: {
      boardId: activeBoardId,
      boardName: board.name,
      chipset: board.chipset,
      logicVoltage: board.logicVoltage,
      targetLanguage: board.targetLanguage,
      color: board.color,
      accentColor: board.accentColor,
      digitalPins: board.digitalPins,
      leftPins: board.leftPins,
      pins,
      pinUsage,
      collaborators: boardCollaborators,
      highlightedBoardPin: reviewFocus?.boardPin,
      highlightSeverity: reviewFocus?.severity,
      highlightTitle: reviewFocus?.title,
      isDimmed: focusActive && !reviewFocus?.boardPin,
    },
  };

  const normalizedPositionedComponents = importedSchematicMode
    ? positionedComponents.map(component => ({
        ...component,
        position: {
          x: component.position.x - importedSceneOrigin.x,
          y: component.position.y - importedSceneOrigin.y,
        },
      }))
    : positionedComponents;

  const componentNodes: Node<SensorNodeData>[] = normalizedPositionedComponents.map(component => {
    const template = getTemplateById(component.templateId);
    const isHighlighted = isComponentHighlighted(component, reviewFocus);

    return {
      id: component.instanceId,
      type: component.importedGeometry ? 'importedSchematicComponent' : 'sensorComponent',
      position: component.position,
      draggable: importedSchematicMode ? false : undefined,
      selectable: true,
      data: {
        instanceId: component.instanceId,
        templateId: component.templateId,
        componentName: component.name,
        value: component.value,
        category: template?.category ?? 'SENSOR',
        rotation: component.rotation,
        assignedPins: component.assignedPins,
        requiredPins: template?.requiredPins ?? [],
        isFullyRouted: component.isFullyRouted,
        importedGeometry: component.importedGeometry,
        importedReference: component.importedReference,
        importedMapping: component.importedMapping,
        isOverlayOnly: importedSchematicMode && Boolean(importedSchematicScene),
        runtimeState: componentRuntimeStates[component.instanceId],
        collaborators: collaboratorSelections[component.instanceId] ?? [],
        isHighlighted,
        highlightedPinId: getHighlightedComponentPin(component, reviewFocus),
        highlightSeverity: isHighlighted ? reviewFocus?.severity : undefined,
        highlightTitle: isHighlighted ? reviewFocus?.title : undefined,
        isDimmed: focusActive && !isHighlighted,
        isGhost: ghostComponentIds.has(component.instanceId),
        onDelete: removeComponent,
        onRotate: rotateComponent,
      },
    };
  });

  const commentNodes: Node<CommentPinNodeData>[] = commentThreads.flatMap(thread => {
    if (thread.root.status !== 'open') {
      return [];
    }

    const anchor = resolveCommentAnchor(thread.root, normalizedPositionedComponents);
    if (!anchor) {
      return [];
    }

    return [{
      id: `comment-${thread.root.id}`,
      type: 'commentPin',
      draggable: false,
      selectable: false,
      position: anchor,
      data: {
        commentId: thread.root.id,
        status: thread.root.status,
        label: getCommentTargetLabel(thread.root.targetType, thread.root.targetMeta, components),
        preview: buildCommentPreview(thread.root.content),
        replyCount: thread.replies.length,
        isSelected: selectedCommentId === thread.root.id,
        isRecentlyHighlighted: highlightedThreadId === thread.root.id,
        onOpen: openCommentThread,
      },
    }];
  });

  const overlayNodes: Node<ImportedSchematicOverlayNodeData>[] =
    importedSchematicMode && importedSchematicScene
      ? (() => {
          const sceneBounds = importedSceneBounds;
          return sceneBounds ? [{
          id: IMPORTED_SCHEMATIC_OVERLAY_NODE_ID,
          type: 'importedSchematicOverlayNode',
          position: { x: 0, y: 0 },
          draggable: false,
          selectable: false,
          deletable: false,
          focusable: false,
          zIndex: 0,
          style: {
            width: sceneBounds.width,
            height: sceneBounds.height,
          },
          data: {
            scene: importedSchematicScene,
            components: normalizedPositionedComponents.filter(component => Boolean(component.importedGeometry)),
            manualConnections,
            viewMode: importedSchematicViewMode,
            highlightedComponentIds: [
              reviewFocus?.componentInstanceId,
              ...(reviewFocus?.componentInstanceIds ?? []),
            ].filter((value): value is string => Boolean(value)),
            dimNonTargets: focusActive,
            pulse: reviewFocus?.interaction !== 'hover',
          },
        }] : [];
        })()
      : [];

  return showBoardNode
    ? [...overlayNodes, boardNode, ...componentNodes, ...commentNodes]
    : [...overlayNodes, ...componentNodes, ...commentNodes];
}

type BuildCanvasEdgesArgs = {
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  ghostComponentIds: Set<string>;
  ghostConnectionIds: Set<string>;
  importedSchematicMode: boolean;
  hasImportedSchematicScene: boolean;
  reviewFocus: ReviewFocusDetail | null;
  isPreviewRouting: boolean;
  routeContextKey: string;
};

export function buildCanvasEdges({
  components,
  manualConnections,
  ghostComponentIds = new Set<string>(),
  ghostConnectionIds = new Set<string>(),
  importedSchematicMode,
  hasImportedSchematicScene,
  reviewFocus,
  isPreviewRouting,
  routeContextKey,
}: BuildCanvasEdgesArgs): Edge<WireEdgeData>[] {
  const result: Edge<WireEdgeData>[] = [];
  const focusActive = hasActiveReviewFocus(reviewFocus);

  if (!importedSchematicMode) {
    for (const component of components) {
      const template = getTemplateById(component.templateId);
      const pinOrder = template?.requiredPins.map(pin => pin.name) ?? [];

      for (const [pinName, boardPinId] of Object.entries(component.assignedPins)) {
        const pinType = getPinColorType(pinName);
        if (pinType !== 'SIGNAL') {
          continue;
        }

        const isHighlighted = isSignalEdgeHighlighted(component, pinName, boardPinId, reviewFocus);

        result.push({
          id: `edge-${component.instanceId}-${pinName}`,
          source: BOARD_NODE_ID,
          sourceHandle: `${boardPinId}__source`,
          target: component.instanceId,
          targetHandle: pinName,
          type: 'wireEdge',
          animated: true,
          data: {
            pinName,
            pinType,
            laneOffset: Math.max(pinOrder.indexOf(pinName), 0),
            isGhost: ghostComponentIds.has(component.instanceId),
            isHighlighted,
            highlightSeverity: isHighlighted ? reviewFocus?.severity : undefined,
            isDimmed: focusActive && !isHighlighted,
            routingMode: isPreviewRouting ? 'preview' : 'full',
            routeContextKey,
          },
        });
      }
    }
  }

  for (const connection of manualConnections) {
    const sourceNodeId = connection.source.ownerType === 'board' ? BOARD_NODE_ID : connection.source.ownerId;
    const targetNodeId = connection.target.ownerType === 'board' ? BOARD_NODE_ID : connection.target.ownerId;
    const isHighlighted = isManualEdgeHighlighted(connection, reviewFocus);
    const isGhost =
      ghostConnectionIds.has(connection.id) ||
      (connection.source.ownerType === 'component' && ghostComponentIds.has(connection.source.ownerId)) ||
      (connection.target.ownerType === 'component' && ghostComponentIds.has(connection.target.ownerId));

    result.push({
      id: `manual-${connection.id}`,
      source: sourceNodeId,
      sourceHandle: `${connection.source.pinId}__source`,
      target: targetNodeId,
      targetHandle: connection.target.pinId,
      type: 'wireEdge',
      animated: false,
      data: {
        pinName: connection.suggestedNetName ?? `${connection.source.pinId}↔${connection.target.pinId}`,
        pinType: getManualPinType(connection.source.pinId, connection.target.pinId),
        laneOffset: 0,
        label: connection.suggestedNetName ?? `${connection.source.pinId}↔${connection.target.pinId}`,
        sourcePin: connection.source.pinId,
        targetPin: connection.target.pinId,
        connectionId: connection.id,
        renderStyle: importedSchematicMode ? 'kicad-import' : 'default',
        isOverlayOnly: importedSchematicMode && hasImportedSchematicScene,
        isManual: true,
        isGhost,
        isHighlighted,
        highlightSeverity: isHighlighted ? reviewFocus?.severity : undefined,
        isDimmed: focusActive && !isHighlighted,
        routingMode: isPreviewRouting ? 'preview' : 'full',
        routeContextKey,
      },
    });
  }

  return result;
}
