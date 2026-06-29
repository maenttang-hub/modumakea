'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { type NodeProps, useUpdateNodeInternals } from 'reactflow';
import type { SensorNodeData } from '@/types';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import {
  normalizeImportedGeometryForRender,
  shouldShowImportedFallbackBadge,
} from '@/lib/imported-schematic-render';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { useBoardStore } from '@/store/use-board-store';

const HIGHLIGHT_BY_SEVERITY = {
  info: '#60a5fa',
  warning: '#fbbf24',
  error: '#fb7185',
} as const;

function ImportedSchematicNodeInner({ id, data }: NodeProps<SensorNodeData>) {
  const [hovered, setHovered] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedComponentId = useBoardStore(state => state.setSelectedComponentId);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const palette = getImportedSchematicPalette(schematicTheme);

  const effectiveImportedGeometry = useMemo(
    () => normalizeImportedGeometryForRender(data),
    [data]
  );

  const layout = useMemo(
    () => (
      effectiveImportedGeometry
        ? layoutImportedGeometry(effectiveImportedGeometry, data.rotation, undefined, { preserveStoredBounds: true })
        : null
    ),
    [effectiveImportedGeometry, data.rotation]
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(frame);
  }, [id, layout, updateNodeInternals]);

  if (!layout || !effectiveImportedGeometry) {
    return null;
  }

  const strokeColor =
    data.isHighlighted && data.highlightSeverity
      ? HIGHLIGHT_BY_SEVERITY[data.highlightSeverity]
      : palette.symbolStroke;
  const showInteractionOutline = hovered || Boolean(data.isHighlighted);

  const showFallbackBadge = shouldShowImportedFallbackBadge(data);
  const emitTooltip = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('modumake:canvas-tooltip', {
      detail: {
        title: data.importedReference ?? data.componentName,
        lines: [
          data.value ? `Value · ${data.value}` : null,
          data.requiredPins.length > 0 ? `Pins · ${data.requiredPins.map(pin => pin.name).join(', ')}` : null,
        ].filter(Boolean),
        note: showFallbackBadge ? 'Imported through fallback mapping for review.' : undefined,
        accent: data.highlightSeverity ? HIGHLIGHT_BY_SEVERITY[data.highlightSeverity] : '#d47d8d',
        clientX: rect.left + rect.width * 0.68,
        clientY: rect.top + 18,
      },
    }));
  };

  return (
    <div
      className="relative cursor-pointer select-none font-mono"
      style={{
        width: layout.width,
        height: layout.height,
        opacity: data.isDimmed ? 0.28 : 1,
        transition: 'opacity 180ms ease',
      }}
      data-mm-component-id={data.instanceId}
      data-mm-component-name={data.componentName}
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
            title: data.importedReference ?? data.componentName,
          },
        }));
      }}
    >
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="overflow-visible"
      >
        {/* 투명한 클릭 영역 사각형 (클릭 감도 개선) */}
        <rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          fill="transparent"
          className="cursor-pointer"
        />

        {showInteractionOutline && (
          <>
            <rect
              x={-3}
              y={-3}
              width={Math.max(layout.width + 6, 1)}
              height={Math.max(layout.height + 6, 1)}
              rx={7}
              fill="none"
              stroke={data.isHighlighted ? strokeColor : palette.hoverOutline}
              strokeWidth={1.5}
              opacity={data.isHighlighted ? 0.85 : 0.7}
            />
            <rect
              x={1}
              y={1}
              width={Math.max(layout.width - 2, 1)}
              height={Math.max(layout.height - 2, 1)}
              rx={4}
              fill="none"
              stroke={data.isHighlighted ? strokeColor : palette.hoverOutline}
              strokeWidth={1}
              opacity={data.isHighlighted ? 0.9 : 0.45}
            />
          </>
        )}
      </svg>

      {showFallbackBadge && showInteractionOutline ? (
        <div
          className="pointer-events-none absolute -right-1 -top-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-normal"
          style={{
            borderColor: 'rgba(212, 125, 141, 0.42)',
            background: 'rgba(255, 251, 247, 0.96)',
            color: '#b85b71',
          }}
          aria-label="Imported fallback note"
        >
          i
        </div>
      ) : null}
    </div>
  );
}

export const ImportedSchematicNode = React.memo(ImportedSchematicNodeInner);
