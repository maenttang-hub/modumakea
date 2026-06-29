'use client';

/**
 * components/canvas/arduino-node.tsx
 * EDA 스타일 보드 노드: PCB 그린/블루 배경, 각진 모서리, 튀어나온 핀 다리
 */

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BoardNodeData } from '@/types';
import { formatCanvasComponentName } from '@/lib/component-display-name';
import { emitReviewFocus } from '@/lib/review-focus';
import { useBoardStore } from '@/store/use-board-store';
import { Cpu, Lock, Terminal, Wifi } from 'lucide-react';

const PIN_LEG_W  = 16;   // 핀 다리 길이(px)
const PIN_ROW_H  = 24;   // 핀 한 행 높이
const HEADER_H   = 38;   // 헤더 높이
const MANUAL_HANDLE_SIZE = 12;
const MANUAL_SOURCE_OFFSET = 4;

function BoardHeaderIcon({ boardId, color }: { boardId: string; color: string }) {
  const props = { size: 12, style: { color } };
  if (boardId === 'esp32') return <Wifi {...props} />;
  if (boardId === 'rpi4')  return <Terminal {...props} />;
  return <Cpu {...props} />;
}

// 핀 종류별 색상
function getPinLineColor(pinId: string): string {
  if (['5V', '3.3V', 'VCC'].includes(pinId)) return '#ef4444';
  if (pinId === 'GND')                         return '#94a3b8';
  return '#22c55e';
}

function PinRow({
  pinId,
  position,
  isUsed,
  pinTypes,
  logicVoltage,
  isManualMode,
  assignmentMode,
  connectionLabel,
  connectionPinLabel,
  connectionTitle,
  connectionInstanceId,
  isHighlighted,
  highlightSeverity,
  onPinFocus,
}: {
  pinId:       string;
  position:    'left' | 'right';
  isUsed:      boolean;
  pinTypes:    string[];
  logicVoltage: string;
  isManualMode: boolean;
  assignmentMode?: 'auto' | 'manual';
  connectionLabel?: string;
  connectionPinLabel?: string;
  connectionTitle?: string;
  connectionInstanceId?: string;
  isHighlighted?: boolean;
  highlightSeverity?: 'info' | 'warning' | 'error';
  onPinFocus?: (detail: {
    boardPin: string;
    componentPin?: string;
    componentName?: string;
    componentInstanceId?: string;
  }) => void;
}) {
  const isManualLocked = assignmentMode === 'manual';
  const highlightColor =
    highlightSeverity === 'error'
      ? '#fb7185'
      : highlightSeverity === 'warning'
        ? '#fbbf24'
        : '#60a5fa';
  const lineColor = isHighlighted
    ? highlightColor
    : isManualLocked
      ? '#94a3b8'
      : isUsed
        ? '#f97316'
        : getPinLineColor(pinId);
  const isLeft    = position === 'left';
  const targetSize = isManualMode ? MANUAL_HANDLE_SIZE : 13;
  const sourceSize = isManualMode ? MANUAL_HANDLE_SIZE - 2 : 7;
  const isClickable = Boolean(onPinFocus);

  const handlePinFocus = () => {
    onPinFocus?.({
      boardPin: pinId,
      componentPin: connectionPinLabel,
      componentName: connectionLabel,
      componentInstanceId: connectionInstanceId,
    });
  };

  return (
    <div
      className="relative flex items-center font-mono"
      title={`${pinId}: ${pinTypes.join('/')} · 로직 ${logicVoltage}${isManualLocked ? ' · 수동 핀 락' : ''}${connectionTitle ? ` · ${connectionTitle}` : ''}`}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `${pinId} 핀 코드 연결 보기` : undefined}
      style={{
        height:        PIN_ROW_H,
        paddingLeft:   isLeft  ? 8  : 0,
        paddingRight:  isLeft  ? 0  : 8,
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        cursor: isClickable ? 'pointer' : 'default',
      }}
      onClick={isClickable ? event => {
        event.stopPropagation();
        handlePinFocus();
      } : undefined}
      onKeyDown={isClickable ? event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          handlePinFocus();
        }
      } : undefined}
    >
      {/* 핀 다리 선 */}
      <div
        className="absolute"
        style={{
          [isLeft ? 'left' : 'right']: -(PIN_LEG_W),
          top:       '50%',
          transform: 'translateY(-50%)',
          width:     PIN_LEG_W,
          height:    1.5,
          background: lineColor,
          opacity:   isUsed ? 1 : 0.5,
        }}
      />

      {/* React Flow Handle (핀 다리 끝, 사각형) */}
      <Handle
        type="source"
        position={isLeft ? Position.Left : Position.Right}
        id={`${pinId}__source`}
        style={{
          position:     'absolute',
          [isLeft ? 'left' : 'right']: -(PIN_LEG_W + 5 + (isManualMode ? MANUAL_SOURCE_OFFSET : 0)),
          top:          '50%',
          transform:    'translateY(-50%)',
          width:        sourceSize,
          height:       sourceSize,
          background:   isManualMode ? 'rgba(34, 197, 94, 0.2)' : lineColor,
          border:       isManualMode ? `1px solid ${isHighlighted ? highlightColor : 'rgba(34, 197, 94, 0.55)'}` : 'none',
          borderRadius: isManualMode ? 999 : 0,
          opacity:      isManualMode ? 1 : isUsed ? 1 : 0.6,
          boxShadow:    isHighlighted ? `0 0 10px ${highlightColor}` : isUsed ? `0 0 4px ${lineColor}` : 'none',
        }}
      />
      <Handle
        type="target"
        position={isLeft ? Position.Left : Position.Right}
        id={pinId}
        style={{
          position:     'absolute',
          [isLeft ? 'left' : 'right']: -(PIN_LEG_W + 5),
          top:          '50%',
          transform:    'translateY(-50%)',
          width:        targetSize,
          height:       targetSize,
          background:   isManualMode ? `${highlightColor}22` : 'transparent',
          border:       isManualMode ? `1px solid ${isHighlighted ? highlightColor : 'rgba(96, 165, 250, 0.45)'}` : 'none',
          borderRadius: isManualMode ? 999 : 0,
          opacity:      isManualMode ? 1 : 0,
        }}
      />

      {/* 핀 라벨 */}
      <div
        className="min-w-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isLeft ? 'flex-start' : 'flex-end',
          maxWidth: 86,
        }}
      >
        <span
          className="flex items-center gap-1"
          style={{
            color:    isManualLocked ? '#cbd5e1' : isUsed ? '#f97316' : 'rgba(255,255,255,0.55)',
            background: isHighlighted ? `${highlightColor}18` : 'transparent',
            fontSize: 8,
            fontWeight: isUsed ? 700 : 400,
            letterSpacing: '0.03em',
            borderRadius: 4,
            paddingInline: isHighlighted ? 4 : 0,
          }}
        >
          {isManualLocked && <Lock size={8} style={{ color: '#94a3b8' }} />}
          {pinId}
        </span>
        {connectionLabel && (
          <div
            className="truncate"
            style={{
              maxWidth: '100%',
              marginTop: 1,
            }}
            title={connectionTitle}
          >
            <span
              className="truncate"
              style={{
                maxWidth: '100%',
                color: '#93c5fd',
                fontSize: 6.6,
                lineHeight: 1.1,
                opacity: 0.96,
                fontWeight: 600,
              }}
            >
              {connectionPinLabel ? `${connectionLabel} · ${connectionPinLabel}` : connectionLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ArduinoNodeInner({ data }: NodeProps<BoardNodeData>) {
  const wiringMode = useBoardStore(state => state.wiringMode);
  const setSelectedComponentId = useBoardStore(state => state.setSelectedComponentId);
  const totalRows = Math.max(data.digitalPins.length, data.leftPins.length);
  const nodeH     = HEADER_H + totalRows * PIN_ROW_H + 12;
  const nodeW     = 232;
  const highlightedPin = data.highlightedBoardPin;
  const boardHighlightColor =
    data.highlightSeverity === 'error'
      ? '#fb7185'
      : data.highlightSeverity === 'warning'
        ? '#fbbf24'
        : '#60a5fa';

  // 보드별 PCB 배경색
  const PCB_BG: Record<string, string> = {
    uno:   '#0a1a0e',
    nano:  '#0a1518',
    esp32: '#0a140a',
    rpi4:  '#140a14',
  };
  const pcbBg = PCB_BG[data.boardId] ?? '#0a1215';

  const handlePinFocus = React.useCallback((detail: {
    boardPin: string;
    componentPin?: string;
    componentName?: string;
    componentInstanceId?: string;
  }) => {
    setSelectedComponentId(detail.componentInstanceId ?? 'board-node');
    emitReviewFocus({
      source: 'review',
      interaction: 'focus',
      emphasis: 'card',
      boardPin: detail.boardPin,
      componentPin: detail.componentPin,
      componentName: detail.componentName,
      componentInstanceId: detail.componentInstanceId,
      severity: data.highlightSeverity ?? 'info',
      title: detail.componentName
        ? `${detail.boardPin} ↔ ${detail.componentName}`
        : `${detail.boardPin} 핀 연결`,
      message: detail.componentPin
        ? `${detail.boardPin} 핀은 ${detail.componentPin} 단자로 연결됩니다`
        : `${detail.boardPin} 핀을 사용하는 코드를 확인합니다`,
    });
  }, [data.highlightSeverity, setSelectedComponentId]);

  return (
    <div
      className="relative font-mono select-none cursor-pointer"
      data-mm-board-node="true"
      data-mm-board-highlighted-pin={highlightedPin ?? ''}
      style={{
        width: nodeW,
        height: nodeH,
        opacity: data.isDimmed ? 0.28 : 1,
        transition: 'opacity 180ms ease',
      }}
      onClick={() => setSelectedComponentId('board-node')}
    >
      {/* ── 메인 PCB 박스 ── */}
      <div
        className="absolute inset-0"
        style={{
          background: pcbBg,
          border:     `2px solid ${highlightedPin ? boardHighlightColor : data.accentColor}`,
          boxShadow: highlightedPin ? `0 0 20px ${boardHighlightColor}33` : 'none',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center gap-2 px-2"
          style={{
            height:       HEADER_H,
            background:   data.accentColor + '22',
            borderBottom: `1px solid ${data.accentColor}60`,
          }}
        >
          <BoardHeaderIcon boardId={data.boardId} color={data.accentColor} />

          <div className="flex flex-col min-w-0">
            <span
              className="font-black tracking-widest uppercase truncate"
              style={{ color: data.accentColor, fontSize: 9, letterSpacing: '0.12em' }}
            >
              {data.boardName}
            </span>
            <span
              className="font-mono"
              style={{ color: data.accentColor + '70', fontSize: 7 }}
            >
              {data.chipset}
            </span>
          </div>

          {data.collaborators && data.collaborators.length > 0 && (
            <div className="flex items-center gap-1">
              {data.collaborators.slice(0, 3).map(collaborator => (
                <span
                  key={collaborator.sessionId}
                  className="h-2.5 w-2.5 rounded-full border border-black/20"
                  style={{ background: collaborator.color }}
                  title={collaborator.userName}
                />
              ))}
            </div>
          )}

          <div className="ml-auto flex flex-col items-end gap-0.5">
            {/* 전압 배지 */}
            <span
              className="font-mono font-bold"
              style={{
                color:   data.logicVoltage === '5V' ? '#fca5a5' : '#67e8f9',
                fontSize: 7,
              }}
            >
              {data.logicVoltage}
            </span>
            {/* 언어 배지 */}
            <span
              className="font-mono"
              style={{ color: data.accentColor + '80', fontSize: 6 }}
            >
              {data.targetLanguage}
            </span>
          </div>
        </div>

        {/* 핀 영역 */}
        <div
          className="flex justify-between"
          style={{ padding: '4px 0' }}
        >
          {/* 좌측 핀 */}
          <div style={{ minWidth: 78 }}>
            {data.leftPins.map((pinId, index) => (
              <PinRow
                key={`${pinId}:${index}`}
                pinId={pinId}
                position="left"
                isUsed={data.pins[pinId]?.isUsed ?? false}
                pinTypes={data.pins[pinId]?.type ?? []}
                logicVoltage={data.logicVoltage}
                isManualMode={wiringMode === 'manual'}
                assignmentMode={data.pins[pinId]?.assignmentMode}
                connectionLabel={
                  data.pinUsage[pinId]
                    ? formatCanvasComponentName(data.pinUsage[pinId].componentName, { maxLength: 12 })
                    : undefined
                }
                connectionPinLabel={data.pinUsage[pinId]?.componentPin}
                connectionInstanceId={data.pinUsage[pinId]?.componentInstanceId}
                connectionTitle={
                  data.pinUsage[pinId]
                    ? `연결: ${data.pinUsage[pinId].componentName} (${data.pinUsage[pinId].componentPin})`
                    : undefined
                }
                isHighlighted={highlightedPin === pinId}
                highlightSeverity={data.highlightSeverity}
                onPinFocus={handlePinFocus}
              />
            ))}
          </div>

          {/* 중앙 칩 심볼 */}
          <div className="flex flex-col items-center justify-center px-1">
            <div
              className="flex flex-col items-center justify-center"
              style={{
                width:  44,
                height: 44,
                border: `1px solid ${data.accentColor}40`,
                background: data.accentColor + '10',
              }}
            >
              <BoardHeaderIcon boardId={data.boardId} color={data.accentColor} />
              <span
                className="font-mono text-center mt-0.5"
                style={{ color: data.accentColor + '60', fontSize: 5, lineHeight: 1.2, maxWidth: 40 }}
              >
                {data.chipset.replace('-', '\n')}
              </span>
            </div>
            {/* IC 식별번호 스타일 */}
            <span
              className="font-mono mt-1"
              style={{ color: 'rgba(255,255,255,0.12)', fontSize: 5, letterSpacing: '0.05em' }}
            >
              {data.boardId.toUpperCase()}-01
            </span>
          </div>

          {/* 우측 핀 */}
          <div style={{ minWidth: 78 }}>
            {data.digitalPins.map((pinId, index) => (
              <PinRow
                key={`${pinId}:${index}`}
                pinId={pinId}
                position="right"
                isUsed={data.pins[pinId]?.isUsed ?? false}
                pinTypes={data.pins[pinId]?.type ?? []}
                logicVoltage={data.logicVoltage}
                isManualMode={wiringMode === 'manual'}
                assignmentMode={data.pins[pinId]?.assignmentMode}
                connectionLabel={
                  data.pinUsage[pinId]
                    ? formatCanvasComponentName(data.pinUsage[pinId].componentName, { maxLength: 12 })
                    : undefined
                }
                connectionPinLabel={data.pinUsage[pinId]?.componentPin}
                connectionInstanceId={data.pinUsage[pinId]?.componentInstanceId}
                connectionTitle={
                  data.pinUsage[pinId]
                    ? `연결: ${data.pinUsage[pinId].componentName} (${data.pinUsage[pinId].componentPin})`
                    : undefined
                }
                isHighlighted={highlightedPin === pinId}
                highlightSeverity={data.highlightSeverity}
                onPinFocus={handlePinFocus}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── PCB 코너 마킹 ── */}
      {[
        'top-0 left-0',
        'top-0 right-0',
        'bottom-0 left-0',
        'bottom-0 right-0',
      ].map((pos, i) => (
        <div
          key={i}
          className={`absolute ${pos} pointer-events-none`}
          style={{
            width:  10,
            height: 10,
            borderColor:  data.accentColor + '80',
            borderStyle:  'solid',
            borderWidth:  0,
            ...(i === 0 && { borderTopWidth: 2, borderLeftWidth: 2 }),
            ...(i === 1 && { borderTopWidth: 2, borderRightWidth: 2 }),
            ...(i === 2 && { borderBottomWidth: 2, borderLeftWidth: 2 }),
            ...(i === 3 && { borderBottomWidth: 2, borderRightWidth: 2 }),
          }}
        />
      ))}

      {/* ── 실크스크린 텍스트 ── */}
      <span
        className="absolute font-mono pointer-events-none"
        style={{
          bottom: 3,
          left:   '50%',
          transform: 'translateX(-50%)',
          color:  data.accentColor + '25',
          fontSize: 5,
          letterSpacing: '0.15em',
          whiteSpace: 'nowrap',
        }}
      >
        MODUMAKE v2.0
      </span>
    </div>
  );
}

function arePinStatesEqual(
  left: BoardNodeData['pins'],
  right: BoardNodeData['pins']
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    const leftPin = left[key];
    const rightPin = right[key];
    if (
      !rightPin ||
      leftPin.isUsed !== rightPin.isUsed ||
      leftPin.connectedTo !== rightPin.connectedTo ||
      leftPin.assignmentMode !== rightPin.assignmentMode
    ) {
      return false;
    }
  }

  return true;
}

function arePinUsageEqual(
  left: BoardNodeData['pinUsage'],
  right: BoardNodeData['pinUsage']
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (
      left[key]?.componentName !== right[key]?.componentName ||
      left[key]?.componentPin !== right[key]?.componentPin ||
      left[key]?.componentInstanceId !== right[key]?.componentInstanceId
    ) {
      return false;
    }
  }

  return true;
}

export const ArduinoNode = React.memo(
  ArduinoNodeInner,
  (prev, next) =>
    prev.data.boardId === next.data.boardId &&
    prev.data.boardName === next.data.boardName &&
    prev.data.chipset === next.data.chipset &&
    prev.data.logicVoltage === next.data.logicVoltage &&
    prev.data.targetLanguage === next.data.targetLanguage &&
    prev.data.color === next.data.color &&
    prev.data.accentColor === next.data.accentColor &&
    prev.data.digitalPins.join('|') === next.data.digitalPins.join('|') &&
    prev.data.leftPins.join('|') === next.data.leftPins.join('|') &&
    prev.data.collaborators?.map(item => `${item.sessionId}:${item.color}`).join('|') ===
      next.data.collaborators?.map(item => `${item.sessionId}:${item.color}`).join('|') &&
    prev.data.highlightedBoardPin === next.data.highlightedBoardPin &&
    prev.data.highlightSeverity === next.data.highlightSeverity &&
    prev.data.highlightTitle === next.data.highlightTitle &&
    arePinStatesEqual(prev.data.pins, next.data.pins) &&
    arePinUsageEqual(prev.data.pinUsage, next.data.pinUsage)
);
