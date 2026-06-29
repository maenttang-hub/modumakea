'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Node } from 'reactflow';
import { getBoardById } from '@/constants/boards';
import type { BoardDefinition } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import {
  clearWireRouteObstacles,
  setWireRouteObstacles,
} from '@/lib/canvas-route-cache';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import type { ComponentTemplate, PlacedComponent } from '@/types';

const BOARD_NODE_ID = 'board-node';
const BOARD_NODE_POSITION = { x: 80, y: 60 };
const BOARD_NODE_HEADER_HEIGHT = 38;
const BOARD_NODE_ROW_HEIGHT = 24;
const BOARD_NODE_WIDTH = 232;
const SENSOR_NODE_WIDTH = 82;
const DEFAULT_COMPONENT_WIDTH = 92;
const COMPONENT_HEADER_HEIGHT = 18;
const COMPONENT_ROW_HEIGHT = 14;
const COMPONENT_FOOTER_HEIGHT = 10;
const MAX_COMPONENT_RECT_CACHE_ENTRIES = 256;
const componentBodyRectCache = new Map<string, ReturnType<typeof getComponentBodyRect>>();

export function getBoardBodyRect(board: BoardDefinition) {
  const totalRows = Math.max(board.digitalPins.length, board.leftPins.length);
  const height = BOARD_NODE_HEADER_HEIGHT + totalRows * BOARD_NODE_ROW_HEIGHT + 12;

  return {
    x: BOARD_NODE_POSITION.x,
    y: BOARD_NODE_POSITION.y,
    width: BOARD_NODE_WIDTH,
    height,
  };
}

export function getComponentBodyRect(
  component: PlacedComponent,
  template: ComponentTemplate | undefined
) {
  if (component.importedGeometry) {
    const importedLayout = layoutImportedGeometry(
      component.importedGeometry,
      component.rotation,
      undefined,
      { preserveStoredBounds: true }
    );
    return {
      x: component.position.x,
      y: component.position.y,
      width: importedLayout.width,
      height: importedLayout.height,
    };
  }

  const requiredPins = template?.requiredPins ?? [];
  const { leftPins, rightPins } = getComponentPinLayout(requiredPins, template?.category);
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const contentHeight =
    COMPONENT_HEADER_HEIGHT +
    maxPins * COMPONENT_ROW_HEIGHT +
    COMPONENT_FOOTER_HEIGHT;
  const isVertical = component.rotation === 90 || component.rotation === 270;
  const bodyWidth = template?.category === 'SENSOR' ? SENSOR_NODE_WIDTH : DEFAULT_COMPONENT_WIDTH;

  return {
    x: component.position.x + 12,
    y: component.position.y + 12,
    width: isVertical ? contentHeight : bodyWidth,
    height: isVertical ? bodyWidth : contentHeight,
  };
}

function buildComponentBodyRectCacheKey(
  component: PlacedComponent,
  template: ComponentTemplate | undefined
) {
  return [
    component.instanceId,
    component.position.x,
    component.position.y,
    component.rotation,
    component.importedGeometry ? 'imported' : 'default',
    template?.id ?? component.templateId,
    template?.category ?? '',
    template?.requiredPins.length ?? 0,
  ].join(':');
}

function getCachedComponentBodyRect(
  component: PlacedComponent,
  template: ComponentTemplate | undefined
) {
  const cacheKey = buildComponentBodyRectCacheKey(component, template);
  const cachedRect = componentBodyRectCache.get(cacheKey);
  if (cachedRect) {
    return cachedRect;
  }

  const rect = getComponentBodyRect(component, template);
  componentBodyRectCache.set(cacheKey, rect);

  while (componentBodyRectCache.size > MAX_COMPONENT_RECT_CACHE_ENTRIES) {
    const oldestKey = componentBodyRectCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    componentBodyRectCache.delete(oldestKey);
  }

  return rect;
}

function hashRouteContext(activeBoardId: string, components: PlacedComponent[]) {
  let hash = 2166136261;
  const feed = (value: number) => {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (value >>> 8) & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (value >>> 16) & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (value >>> 24) & 0xff;
    hash = Math.imul(hash, 16777619);
  };

  for (let index = 0; index < activeBoardId.length; index += 1) {
    feed(activeBoardId.charCodeAt(index));
  }

  for (const component of components) {
    for (let index = 0; index < component.instanceId.length; index += 1) {
      feed(component.instanceId.charCodeAt(index));
    }
    feed(component.position.x);
    feed(component.position.y);
    feed(component.rotation);
  }

  return `${activeBoardId}:${components.length}:${(hash >>> 0).toString(16)}`;
}

type DragPreviewState = {
  instanceId: string;
  position: { x: number; y: number };
} | null;

function applyDragPreview(
  components: PlacedComponent[],
  dragPreview: DragPreviewState
) {
  if (!dragPreview) {
    return components;
  }

  const targetIndex = components.findIndex(component => component.instanceId === dragPreview.instanceId);
  if (targetIndex < 0) {
    return components;
  }

  const currentComponent = components[targetIndex]!;
  if (
    currentComponent.position.x === dragPreview.position.x &&
    currentComponent.position.y === dragPreview.position.y
  ) {
    return components;
  }

  const nextComponents = components.slice();
  nextComponents[targetIndex] = {
    ...currentComponent,
    position: dragPreview.position,
  };
  return nextComponents;
}

type UseCanvasRoutingArgs = {
  activeBoardId: string;
  components: PlacedComponent[];
  updateComponentPosition: (instanceId: string, position: { x: number; y: number }) => void;
};

export function useCanvasRouting({
  activeBoardId,
  components,
  updateComponentPosition,
}: UseCanvasRoutingArgs) {
  const [dragPreview, setDragPreview] = useState<DragPreviewState>(null);
  const board = getBoardById(activeBoardId);
  const isPreviewRouting = dragPreview !== null;

  const positionedComponents = useMemo(
    () => applyDragPreview(components, dragPreview),
    [components, dragPreview]
  );

  const routingObstacleRects = useMemo(() => {
    const componentRects = positionedComponents.map(component => {
      const template = getTemplateById(component.templateId);
      return getCachedComponentBodyRect(component, template);
    });

    return [getBoardBodyRect(board), ...componentRects];
  }, [board, positionedComponents]);

  const routeContextKey = useMemo(
    () => hashRouteContext(activeBoardId, positionedComponents),
    [activeBoardId, positionedComponents]
  );

  useEffect(() => {
    setWireRouteObstacles(routeContextKey, routingObstacleRects);

    return () => {
      clearWireRouteObstacles(routeContextKey);
    };
  }, [routeContextKey, routingObstacleRects]);

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === BOARD_NODE_ID) {
      return;
    }

    setDragPreview(current => {
      if (
        current?.instanceId === node.id &&
        current.position.x === node.position.x &&
        current.position.y === node.position.y
      ) {
        return current;
      }

      return {
        instanceId: node.id,
        position: node.position,
      };
    });
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === BOARD_NODE_ID) {
      return;
    }

    setDragPreview(current => {
      if (
        current?.instanceId === node.id &&
        current.position.x === node.position.x &&
        current.position.y === node.position.y
      ) {
        return current;
      }

      return { instanceId: node.id, position: node.position };
    });
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    setDragPreview(current => (current?.instanceId === node.id ? null : current));
    if (node.id === BOARD_NODE_ID) {
      return;
    }

    const snappedPosition = {
      x: Math.round(node.position.x / 15) * 15,
      y: Math.round(node.position.y / 15) * 15,
    };

    const persistedComponent = components.find(component => component.instanceId === node.id);
    if (
      persistedComponent &&
      persistedComponent.position.x === snappedPosition.x &&
      persistedComponent.position.y === snappedPosition.y
    ) {
      return;
    }

    updateComponentPosition(node.id, snappedPosition);
  }, [components, updateComponentPosition]);

  return {
    board,
    isPreviewRouting,
    positionedComponents,
    routeContextKey,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
