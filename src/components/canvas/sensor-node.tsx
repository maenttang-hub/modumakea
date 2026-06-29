'use client';

/**
 * components/canvas/sensor-node.tsx
 * EDA 스타일 IC 칩 노드 (리팩토링 버전)
 * - 설정(CONFIG)을 최상단으로 분리하여 유지보수성 극대화
 * - 개별 Pin 아이템을 독립적인 PinItem 컴포넌트로 구조화
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from 'reactflow';
import type { SensorNodeData } from '@/types';
import { formatCanvasComponentName } from '@/lib/component-display-name';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { formatRequiredPinSummary } from '@/lib/component-tooltip';
import { useBoardStore } from '@/store/use-board-store';
import { X } from 'lucide-react';

// ==========================================
// 1. 레이아웃 및 디자인 설정 (수정 시 여기만 변경하세요)
// ==========================================
const CONFIG = {
  // 크기 정의 (단위: px)
  WIDTH: 92,
  SENSOR_WIDTH: 82,
  ROW_HEIGHT: 14,
  HEADER_HEIGHT: 18,
  FOOTER_HEIGHT: 10,
  
  // 핀 디자인 설정
  PIN_LEG_LENGTH: 8,    // 바깥으로 돌출되는 핀 다리 길이
  PIN_HANDLE_SIZE: 10,  // 연결 가능 영역(핸들) 크기
  MANUAL_HANDLE_SIZE: 12,
  MANUAL_SOURCE_OFFSET: 4,
  
  // 색상 테마
  COLORS: {
    bgMain: '#fff7f7',
    bgHeader: '#fbe8ea',
    bgFooter: '#f6ece8',
    borderColor: '#d7988d',
    pinLegColor: '#d9a79a',
    pinTextColor: '#8d7467',
    shadowSelected: 'rgba(215, 152, 141, 0.28)',
  },
  
  POWER_KEYWORDS: ['vcc', 'vin', '5v', '3.3v', 'gnd', 'ground', 'power'],
};

// ==========================================
// 2. 하위 컴포넌트: 개별 핀(다리선 + 보이지 않는 실제 핸들 + 라벨)
// ==========================================
interface PinItemProps {
  pinName: string;
  side: 'left' | 'right';
  title?: string;
  isHighlighted?: boolean;
  highlightSeverity?: 'info' | 'warning' | 'error';
}

function PinItem({ pinName, side, title, isHighlighted, highlightSeverity }: PinItemProps) {
  const isLeft = side === 'left';
  const highlightColor =
    highlightSeverity === 'error'
      ? '#fb7185'
      : highlightSeverity === 'warning'
        ? '#fbbf24'
        : '#60a5fa';

  return (
    <div
      className={`flex items-center h-full relative w-full ${isLeft ? 'justify-start' : 'justify-end'}`}
      title={title}
    >
      {/* [1] 칩 바깥쪽으로 10px 돌출된 핀 다리선 */}
      <div
        className="absolute bg-current"
        style={{
          [isLeft ? 'left' : 'right']: -CONFIG.PIN_LEG_LENGTH,
          width: CONFIG.PIN_LEG_LENGTH,
          height: 1,
          top: '50%',
          transform: 'translateY(-50%)',
          color: CONFIG.COLORS.pinLegColor,
        }}
      />

      {/* [2] 다리선 끝 지점에 위치하는 투명 핸들 (실제 드래그 타겟) */}
      {/* [2] 아주 작고 선명한 핀 라벨 텍스트 */}
      <span
        className={`text-[7px] font-mono uppercase ${isLeft ? 'pl-1.5' : 'pr-1.5'}`}
        style={{
          color: isHighlighted ? highlightColor : CONFIG.COLORS.pinTextColor,
          background: isHighlighted ? `${highlightColor}18` : 'transparent',
          borderRadius: 4,
          paddingInline: isHighlighted ? 4 : 0,
          boxShadow: isHighlighted ? `0 0 10px ${highlightColor}22` : 'none',
        }}
      >
        {pinName}
      </span>
    </div>
  );
}

type PinSide = 'left' | 'right';

function rotateOffset(
  dx: number,
  dy: number,
  rotation: 0 | 90 | 180 | 270
) {
  switch (rotation) {
    case 90:
      return { dx: -dy, dy: dx };
    case 180:
      return { dx: -dx, dy: -dy };
    case 270:
      return { dx: dy, dy: -dx };
    default:
      return { dx, dy };
  }
}

function getRotatedHandlePosition(
  side: PinSide,
  rotation: 0 | 90 | 180 | 270
) {
  if (side === 'left') {
    switch (rotation) {
      case 90:
        return Position.Top;
      case 180:
        return Position.Right;
      case 270:
        return Position.Bottom;
      default:
        return Position.Left;
    }
  }

  switch (rotation) {
    case 90:
      return Position.Bottom;
    case 180:
      return Position.Left;
    case 270:
      return Position.Top;
    default:
      return Position.Right;
  }
}

// ==========================================
// 3. 메인 컴포넌트: SensorNode
// ==========================================
function SensorNodeInner({ id, data, selected }: NodeProps<SensorNodeData>) {
  const [hovered, setHovered] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const wiringMode = useBoardStore(state => state.wiringMode);
  const setSelectedComponentId = useBoardStore(state => state.setSelectedComponentId);

  // 데이터 가드 및 핀 분류
  const nodeName = data.name || data.componentName || 'Component';
  const compactNodeName = formatCanvasComponentName(nodeName, { maxLength: 10 });
  const { leftPins, rightPins } = getComponentPinLayout(data.requiredPins, data.category);
  const isSingleSided = rightPins.length === 0;
  const bodyWidth = data.category === 'SENSOR' ? CONFIG.SENSOR_WIDTH : CONFIG.WIDTH;
  const headerText = compactNodeName;

  // 대칭 핀 구조 렌더링을 위한 최대 행 수 계산
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const contentHeight =
    CONFIG.HEADER_HEIGHT +
    (maxPins * CONFIG.ROW_HEIGHT) +
    CONFIG.FOOTER_HEIGHT;
  const isVertical = data.rotation === 90 || data.rotation === 270;
  const pinExtent = CONFIG.PIN_LEG_LENGTH + CONFIG.PIN_HANDLE_SIZE / 2;
  const rotatedBodyWidth = isVertical ? contentHeight : bodyWidth;
  const rotatedBodyHeight = isVertical ? bodyWidth : contentHeight;
  const outerWidth = rotatedBodyWidth + pinExtent * 2;
  const outerHeight = rotatedBodyHeight + pinExtent * 2;

  const handleAnchors = useMemo(() => {
    const bodyCenterX = bodyWidth / 2;
    const bodyCenterY = contentHeight / 2;
    const outerCenterX = outerWidth / 2;
    const outerCenterY = outerHeight / 2;

    const buildAnchor = (pinName: string, side: PinSide, rowIndex: number) => {
      const baseX =
        side === 'left'
          ? -CONFIG.PIN_LEG_LENGTH
          : bodyWidth + CONFIG.PIN_LEG_LENGTH;
      const baseY =
        CONFIG.HEADER_HEIGHT + rowIndex * CONFIG.ROW_HEIGHT + CONFIG.ROW_HEIGHT / 2;

      const { dx, dy } = rotateOffset(
        baseX - bodyCenterX,
        baseY - bodyCenterY,
        data.rotation
      );

      return {
        key: `${side}:${rowIndex}:${pinName}`,
        id: pinName,
        x: outerCenterX + dx,
        y: outerCenterY + dy,
        position: getRotatedHandlePosition(side, data.rotation),
      };
    };

    return [
      ...leftPins.map((pin, index) => buildAnchor(pin.name, 'left', index)),
      ...rightPins.map((pin, index) => buildAnchor(pin.name, 'right', index)),
    ];
  }, [bodyWidth, contentHeight, data.rotation, leftPins, outerHeight, outerWidth, rightPins]);

  const isManualMode = wiringMode === 'manual';
  const handleSize = isManualMode ? CONFIG.MANUAL_HANDLE_SIZE : CONFIG.PIN_HANDLE_SIZE;
  const sourceOffset = isManualMode ? CONFIG.MANUAL_SOURCE_OFFSET : 0;

  const runtimeTone = data.runtimeState?.mode ?? 'idle';
  const highlightColor =
    data.highlightSeverity === 'error'
      ? '#fb7185'
      : data.highlightSeverity === 'warning'
        ? '#fbbf24'
        : '#60a5fa';
  const runtimeBadgeColor =
    runtimeTone === 'active'
      ? '#4ade80'
      : runtimeTone === 'pulse'
      ? '#60a5fa'
      : '#64748b';

  const emitTooltip = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('modumake:canvas-tooltip', {
      detail: {
        title: nodeName,
        lines: [
          data.value ? `Value · ${data.value}` : null,
          `Pins · ${formatRequiredPinSummary(data.requiredPins)}`,
          Object.keys(data.assignedPins).length > 0
            ? `Mapped · ${Object.entries(data.assignedPins).map(([pinName, boardPin]) => `${pinName}->${boardPin}`).join(', ')}`
            : null,
        ].filter(Boolean),
        note: data.category,
        accent: data.isHighlighted ? highlightColor : '#d7988d',
        clientX: rect.left + rect.width * 0.74,
        clientY: rect.top + 14,
      },
    }));
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => cancelAnimationFrame(frame);
  }, [handleAnchors, id, updateNodeInternals]);

  return (
    <div
      className="relative font-mono select-none cursor-pointer"
      data-mm-component-id={data.instanceId}
      data-mm-component-name={nodeName}
      data-mm-component-highlighted={data.isHighlighted ? 'true' : 'false'}
      data-mm-component-highlighted-pin={data.highlightedPinId ?? ''}
      style={{
        width: outerWidth,
        height: outerHeight,
        opacity: data.isDimmed ? 0.28 : data.isGhost ? 0.52 : 1,
        filter: data.isGhost ? 'grayscale(100%)' : 'none',
        transition: 'opacity 180ms ease, filter 180ms ease',
      }}
      onMouseEnter={event => {
        setHovered(true);
        emitTooltip(event);
      }}
      onMouseMove={emitTooltip}
      onMouseLeave={() => {
        setHovered(false);
        window.dispatchEvent(new CustomEvent('modumake:canvas-tooltip-clear'));
      }}
      onClick={() => setSelectedComponentId(id)}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedComponentId(id);
        window.dispatchEvent(new CustomEvent('modumake:open-context-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            scope: 'component-node',
            selectedNodeId: id,
            title: nodeName,
          },
        }));
      }}
    >
      {handleAnchors.map(anchor => (
        <React.Fragment key={anchor.key}>
          <Handle
            type="source"
            position={anchor.position}
            id={`${anchor.id}__source`}
            style={{
              position: 'absolute',
              left:
                anchor.position === Position.Left
                  ? anchor.x - sourceOffset
                  : anchor.position === Position.Right
                    ? anchor.x + sourceOffset
                    : anchor.x,
              top:
                anchor.position === Position.Top
                  ? anchor.y - sourceOffset
                  : anchor.position === Position.Bottom
                    ? anchor.y + sourceOffset
                    : anchor.y,
              width: handleSize,
              height: handleSize,
              transform: 'translate(-50%, -50%)',
              background: isManualMode ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              border: isManualMode ? '1px solid rgba(34, 197, 94, 0.55)' : 'none',
              borderRadius: '999px',
              opacity: isManualMode ? 1 : 0,
              pointerEvents: data.isGhost ? 'none' : 'auto',
            }}
          />
          <Handle
            type="target"
            position={anchor.position}
            id={anchor.id}
            style={{
              position: 'absolute',
              left: anchor.x,
              top: anchor.y,
              width: handleSize,
              height: handleSize,
              transform: 'translate(-50%, -50%)',
              background: isManualMode ? 'rgba(96, 165, 250, 0.16)' : 'transparent',
              border: isManualMode ? '1px solid rgba(96, 165, 250, 0.45)' : 'none',
              borderRadius: '999px',
              opacity: isManualMode ? 1 : 0,
              pointerEvents: data.isGhost ? 'none' : 'auto',
            }}
          />
        </React.Fragment>
      ))}

      {(hovered || selected) && !data.isGhost && (
        <button
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            data.onDelete(data.instanceId);
          }}
          className="nodrag nopan absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center transition-colors cursor-pointer rounded-md"
          style={{
            background: 'rgba(160, 58, 75, 0.92)',
            border: '1px solid rgba(243, 188, 197, 0.82)',
            color: '#fff',
          }}
          title="부품 삭제"
        >
          <X size={9} />
        </button>
      )}

      {data.collaborators && data.collaborators.length > 0 && (
        <div
          className="absolute left-1.5 top-1.5 z-10 flex max-w-[52px] flex-wrap gap-1"
          title={data.collaborators.map(collaborator => collaborator.userName).join(', ')}
        >
          {data.collaborators.slice(0, 3).map(collaborator => (
            <span
              key={collaborator.sessionId}
              className="h-2.5 w-2.5 rounded-full border border-black/30"
              style={{ background: collaborator.color }}
            />
          ))}
        </div>
      )}

      {data.isGhost ? (
        <div
          className="absolute right-1.5 top-1.5 z-10 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: 'rgba(205, 146, 85, 0.14)',
            border: '1px dashed rgba(205, 146, 85, 0.52)',
            color: '#a66b2e',
          }}
        >
          AI
        </div>
      ) : null}

      {/* 메인 IC 칩 바디 */}
      <div
        className="flex flex-col rounded-[10px]"
        style={{
          width: bodyWidth,
          height: contentHeight,
          background: CONFIG.COLORS.bgMain,
          border: `${data.isGhost ? 1.5 : 1}px ${data.isGhost ? 'dashed' : 'solid'} ${data.isHighlighted ? highlightColor : data.isGhost ? '#ff9f43' : CONFIG.COLORS.borderColor}`,
          boxShadow:
            data.isHighlighted
              ? `0 0 0 1px ${highlightColor}22, 0 12px 24px ${highlightColor}22`
              : runtimeTone === 'active'
                ? '0 12px 22px rgba(74, 222, 128, 0.16)'
                : runtimeTone === 'pulse'
                  ? '0 12px 22px rgba(96, 165, 250, 0.15)'
                  : selected
                    ? `0 10px 20px ${CONFIG.COLORS.shadowSelected}`
                    : '0 10px 18px rgba(122, 91, 79, 0.08)',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${data.rotation}deg)`,
          transformOrigin: 'center',
        }}
      >
        {/* 상단 칩 헤더 (칩 이름 표시) */}
        <div
          className="flex items-center justify-between gap-2 border-b px-2.5"
          style={{ 
            height: CONFIG.HEADER_HEIGHT,
            backgroundColor: CONFIG.COLORS.bgHeader,
            borderColor: CONFIG.COLORS.borderColor,
          }}
        >
          <span className="truncate font-mono text-[8px] font-bold tracking-tight" style={{ color: '#8f5a51' }}>
            {headerText}
          </span>
          {data.value && (
            <span className="max-w-[34px] truncate text-[6px] font-bold text-[#6b7d53]">
              {data.value}
            </span>
          )}
          {data.runtimeState && (
            <span
              className="max-w-[52px] truncate rounded px-1 py-0.5 text-[6px] font-bold"
              style={{
                background: `${runtimeBadgeColor}22`,
                color: runtimeBadgeColor,
              }}
            >
              {data.runtimeState.label ?? data.runtimeState.mode}
            </span>
          )}
        </div>

        {/* 핀 배치 영역 (행 단위 매핑) */}
        <div className="relative flex-1 py-1.5">
          {Array.from({ length: maxPins }).map((_, i) => (
            <div
              key={i}
              className={`relative flex items-center ${isSingleSided ? 'justify-start' : 'justify-between'}`}
              style={{ height: CONFIG.ROW_HEIGHT }}
            >
              {/* 좌측 핀 영역 */}
              <div className={`h-full relative ${isSingleSided ? 'w-full' : 'w-1/2'}`}>
                {leftPins[i] && (
                  <PinItem
                    pinName={leftPins[i].name}
                    side="left"
                    title={`${leftPins[i].name}: ${leftPins[i].allowedTypes.join('/')}`}
                    isHighlighted={data.highlightedPinId === leftPins[i].name}
                    highlightSeverity={data.highlightSeverity}
                  />
                )}
              </div>

              {/* 우측 핀 영역 */}
              {!isSingleSided && (
                <div className="h-full relative w-1/2">
                  {rightPins[i] && (
                    <PinItem
                      pinName={rightPins[i].name}
                      side="right"
                      title={`${rightPins[i].name}: ${rightPins[i].allowedTypes.join('/')}`}
                      isHighlighted={data.highlightedPinId === rightPins[i].name}
                      highlightSeverity={data.highlightSeverity}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 하단 푸터 영역 (카테고리 약칭 표시) */}
        <div
          className="flex items-center justify-center border-t"
          style={{ height: CONFIG.FOOTER_HEIGHT, backgroundColor: CONFIG.COLORS.bgFooter, borderColor: '#e4c8c1' }}
        >
          <span className="font-mono text-[6px] uppercase text-[#9f8578]">
            {data.category}
          </span>
        </div>
      </div>
    </div>
  );
}

function areAssignedPinsEqual(
  left: Record<string, string>,
  right: Record<string, string>
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function areRequiredPinsEqual(
  left: SensorNodeData['requiredPins'],
  right: SensorNodeData['requiredPins']
) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.name !== right[index]?.name) {
      return false;
    }
  }

  return true;
}

export const SensorNode = React.memo(
  SensorNodeInner,
  (prev, next) =>
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.data.componentName === next.data.componentName &&
    prev.data.value === next.data.value &&
    prev.data.category === next.data.category &&
    prev.data.rotation === next.data.rotation &&
    prev.data.isFullyRouted === next.data.isFullyRouted &&
    prev.data.runtimeState?.mode === next.data.runtimeState?.mode &&
    prev.data.runtimeState?.label === next.data.runtimeState?.label &&
    prev.data.collaborators?.map(item => `${item.sessionId}:${item.color}`).join('|') ===
      next.data.collaborators?.map(item => `${item.sessionId}:${item.color}`).join('|') &&
    prev.data.isHighlighted === next.data.isHighlighted &&
    prev.data.highlightedPinId === next.data.highlightedPinId &&
    prev.data.highlightSeverity === next.data.highlightSeverity &&
    prev.data.highlightTitle === next.data.highlightTitle &&
    prev.data.isDimmed === next.data.isDimmed &&
    prev.data.isGhost === next.data.isGhost &&
    areAssignedPinsEqual(prev.data.assignedPins, next.data.assignedPins) &&
    areRequiredPinsEqual(prev.data.requiredPins, next.data.requiredPins)
);
