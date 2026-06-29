'use client';

/**
 * components/canvas/wire-edge.tsx
 * EDA 스타일 직각 전선: step 라우팅, 색상 구분, 핀 라벨
 */

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, Position, type EdgeProps } from 'reactflow';
import type { WireEdgeData } from '@/types';
import { getPinColorType } from '@/lib/auto-router';
import { getWireRouteObstacles } from '@/lib/canvas-route-cache';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { buildOrthogonalRoute } from '@/lib/orthogonal-router';
import { useBoardStore } from '@/store/use-board-store';

const PIN_COLORS: Record<'VCC' | 'GND' | 'SIGNAL', string> = {
  VCC:    '#ef4444', // 빨간색 (전원)
  GND:    '#6b7280', // 회색   (접지)
  SIGNAL: '#22c55e', // 초록색 (신호)
};

function buildOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  laneOffset: number
) {
  if (Math.abs(sourceY - targetY) < 4 && sourcePosition !== targetPosition) {
    return {
      path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
      labelX: (sourceX + targetX) / 2,
      labelY: sourceY - 10,
    };
  }

  const lane = laneOffset * 14;

  if (sourcePosition === Position.Left && targetPosition === Position.Left) {
    const corridorX = Math.min(sourceX, targetX) - 28 - lane;
    return {
      path: `M ${sourceX},${sourceY} L ${corridorX},${sourceY} L ${corridorX},${targetY} L ${targetX},${targetY}`,
      labelX: corridorX,
      labelY: sourceY + (targetY - sourceY) / 2,
    };
  }

  if (sourcePosition === Position.Right && targetPosition === Position.Right) {
    const corridorX = Math.max(sourceX, targetX) + 28 + lane;
    return {
      path: `M ${sourceX},${sourceY} L ${corridorX},${sourceY} L ${corridorX},${targetY} L ${targetX},${targetY}`,
      labelX: corridorX,
      labelY: sourceY + (targetY - sourceY) / 2,
    };
  }

  const middleX = sourceX + (targetX - sourceX) / 2 + lane / 2;

  return {
    path: `M ${sourceX},${sourceY} L ${middleX},${sourceY} L ${middleX},${targetY} L ${targetX},${targetY}`,
    labelX: middleX,
    labelY: sourceY + (targetY - sourceY) / 2,
  };
}

function buildPathFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return { path: '', labelX: 0, labelY: 0 };
  }

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
  const middle = points[Math.floor(points.length / 2)] ?? points[0];

  return {
    path,
    labelX: middle.x,
    labelY: middle.y - 10,
  };
}

function WireEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<WireEdgeData>) {
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const palette = getImportedSchematicPalette(schematicTheme);
  const isPreviewRouting = data?.routingMode === 'preview';
  const obstacleRects = getWireRouteObstacles(data?.routeContextKey);
  const { path: edgePath, labelX, labelY } =
    !isPreviewRouting && obstacleRects.length > 0
      ? buildPathFromPoints(
          buildOrthogonalRoute(
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
            obstacleRects,
            data?.laneOffset ?? 0
          )
        )
      : buildOrthogonalPath(
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          data?.laneOffset ?? 0
        );

  const pinType    = data?.pinType ?? (data?.pinName ? getPinColorType(data.pinName) : 'SIGNAL');
  const isKiCadImportStyle = data?.renderStyle === 'kicad-import';
  const isOverlayOnly = data?.isOverlayOnly === true && !data?.isHighlighted;
  const highlightColor =
    data?.highlightSeverity === 'error'
      ? '#fb7185'
      : data?.highlightSeverity === 'warning'
        ? '#fbbf24'
        : '#60a5fa';
  const strokeColor = data?.isHighlighted
    ? highlightColor
    : data?.isGhost
      ? '#ff9f43'
    : isOverlayOnly
      ? 'rgba(0,0,0,0.001)'
    : isKiCadImportStyle
      ? (pinType === 'VCC' ? palette.symbolStroke : pinType === 'GND' ? palette.sheetText : palette.wire)
      : PIN_COLORS[pinType];
  const showImportedEdgeLabel = !isKiCadImportStyle || Boolean(data?.isHighlighted);
  const edgeLabel = isOverlayOnly || !showImportedEdgeLabel ? undefined : (data?.label ?? data?.pinName);
  const strokeWidth = isOverlayOnly
    ? 10
    : data?.isHighlighted
      ? (isKiCadImportStyle ? 2.1 : 2.6)
      : data?.isGhost
        ? 1.8
      : (isKiCadImportStyle ? 1.15 : 1.5);
  const strokeDasharray = data?.isGhost ? '5 4' : isKiCadImportStyle ? 'none' : pinType === 'SIGNAL' ? 'none' : '4 3';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke:      strokeColor,
          strokeWidth,
          strokeDasharray,
          opacity: data?.isDimmed ? 0.22 : 1,
          filter: data?.isHighlighted ? `drop-shadow(0 0 4px ${highlightColor})` : 'none',
          animation: data?.isGhost ? 'mm-ghost-dash 1s linear infinite' : undefined,
        }}
      />
      {!isKiCadImportStyle && !isOverlayOnly ? (
        <>
          <circle
            cx={sourceX}
            cy={sourceY}
            r={data?.isManual ? 3 : 2.5}
            fill="#0d1117"
            stroke={strokeColor}
            strokeWidth={1.2}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={data?.isManual ? 3 : 2.5}
            fill="#0d1117"
            stroke={strokeColor}
            strokeWidth={1.2}
          />
        </>
      ) : null}
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position:  'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize:  isKiCadImportStyle ? 9 : 8,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span
              className={isKiCadImportStyle ? 'font-mono' : 'px-1 font-mono font-bold tracking-wider'}
              style={{
                color:           strokeColor,
                backgroundColor: isKiCadImportStyle ? 'transparent' : 'rgba(10,14,26,0.9)',
                border:          isKiCadImportStyle ? 'none' : `1px solid ${strokeColor}60`,
                padding:         isKiCadImportStyle ? 0 : '0 3px',
                boxShadow:       data?.isHighlighted ? `0 0 10px ${highlightColor}22` : 'none',
              }}
            >
              {edgeLabel}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const WireEdge = React.memo(
  WireEdgeInner,
  (prev, next) =>
    prev.id === next.id &&
    prev.sourceX === next.sourceX &&
    prev.sourceY === next.sourceY &&
    prev.targetX === next.targetX &&
    prev.targetY === next.targetY &&
    prev.sourcePosition === next.sourcePosition &&
    prev.targetPosition === next.targetPosition &&
    prev.data?.pinName === next.data?.pinName &&
    prev.data?.label === next.data?.label &&
    prev.data?.isHighlighted === next.data?.isHighlighted &&
    prev.data?.highlightSeverity === next.data?.highlightSeverity &&
    prev.data?.isDimmed === next.data?.isDimmed &&
    prev.data?.isGhost === next.data?.isGhost &&
    prev.data?.routingMode === next.data?.routingMode &&
    prev.data?.routeContextKey === next.data?.routeContextKey &&
    prev.data?.laneOffset === next.data?.laneOffset &&
    prev.data?.isManual === next.data?.isManual
);
