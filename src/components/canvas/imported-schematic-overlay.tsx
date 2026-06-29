'use client';

import { memo, useMemo } from 'react';
import type { NodeProps } from 'reactflow';

import { hasImportedSchematicSceneContent } from '@/lib/component-template-utils';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import {
  getImportedSchematicDisplayDrawings,
  getImportedSchematicDisplayJunctions,
  getImportedSchematicDisplayLabels,
  getImportedSchematicDisplayPageFrame,
  getImportedSchematicDisplaySheetFrames,
  getImportedSchematicDisplaySymbols,
  getImportedSchematicDisplayWireSegments,
  getImportedSchematicSceneBounds,
} from '@/lib/imported-schematic-scene-bounds';
import { describeImportedSheetFrame } from '@/lib/imported-schematic-structure';
import {
  IMPORTED_SCHEMATIC_FONT_FAMILY,
  getImportedTextDisplayAngle,
  getImportedTextDisplayAnchor,
  getImportedTextDisplayBaseline,
  getImportedTextFontSizePx,
  getImportedPinLabelDisplay,
  getImportedReadableTextOffset,
  getImportedTextOverviewOpacity,
  isLowPriorityImportedPinText,
  shouldFlattenImportedTextForReadability,
  shouldUseImportedBodyFill,
} from '@/lib/imported-schematic-render';
import {
  buildImportedStructuredLayout,
  getImportedStructuredViewportBounds,
  isPowerName,
  offsetPoint,
} from '@/lib/imported-schematic-structured-view';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { useBoardStore } from '@/store/use-board-store';
import type {
  ImportedSchematicOverlayNodeData,
  ImportedSchematicScene,
  ImportedSchematicPrimitive,
  ImportedSchematicSceneSymbol,
  PlacedComponent,
} from '@/types';

type ImportedSchematicOverlayPalette = ReturnType<typeof getImportedSchematicPalette>;

function arcPath(
  start: { x: number; y: number },
  mid: { x: number; y: number },
  end: { x: number; y: number }
) {
  const ax = start.x;
  const ay = start.y;
  const bx = mid.x;
  const by = mid.y;
  const cx = end.x;
  const cy = end.y;
  const determinant = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(determinant) < 0.001) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const centerX =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    determinant;
  const centerY =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    determinant;

  const radius = Math.hypot(ax - centerX, ay - centerY);
  const startAngle = Math.atan2(ay - centerY, ax - centerX);
  const midAngle = Math.atan2(by - centerY, bx - centerX);
  const endAngle = Math.atan2(cy - centerY, cx - centerX);
  const normalizeAngle = (angle: number) => {
    const fullTurn = Math.PI * 2;
    return ((angle % fullTurn) + fullTurn) % fullTurn;
  };
  const normalizedStart = normalizeAngle(startAngle);
  const normalizedMid = normalizeAngle(midAngle);
  const normalizedEnd = normalizeAngle(endAngle);
  const ccwSweep = normalizeAngle(normalizedEnd - normalizedStart);
  const ccwMidSweep = normalizeAngle(normalizedMid - normalizedStart);
  const sweepFlag = ccwMidSweep <= ccwSweep ? 1 : 0;
  const largeArcFlag = sweepFlag === 1 ? (ccwSweep > Math.PI ? 1 : 0) : (ccwSweep < Math.PI ? 1 : 0);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

function resolveImportedPrimitiveFill(
  symbol: ImportedSchematicSceneSymbol,
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'rect' | 'polyline' | 'circle' }>,
  palette: ImportedSchematicOverlayPalette
) {
  if (primitive.fill === 'outline') {
    return palette.symbolStroke;
  }

  if (primitive.fill !== 'background') {
    return 'none';
  }

  return shouldUseImportedBodyFill({
    family: symbol.family ?? 'generic',
    pinAnchorCount: symbol.pinAnchors.length,
  })
    ? palette.symbolBodyFill
    : 'none';
}

function shouldRenderPrimitiveInOriginalOverview(
  symbol: ImportedSchematicSceneSymbol,
  primitive: ImportedSchematicPrimitive,
  highlighted: boolean
) {
  if (primitive.kind !== 'text' || highlighted) {
    return true;
  }

  const isDenseSymbol =
    symbol.family === 'mcu' ||
    symbol.family === 'connector' ||
    symbol.pinAnchors.length >= 8;

  if (!isDenseSymbol) {
    return true;
  }

  return !isLowPriorityImportedPinText(primitive);
}

function resolveImportedStrokeDasharray(
  strokeStyle: 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot' | undefined,
  context: 'symbol' | 'drawing' = 'symbol'
) {
  switch (strokeStyle) {
    case 'dash':
      return context === 'drawing' ? '7 4' : '6 4';
    case 'dot':
      return context === 'drawing' ? '1.25 4.25' : '1.2 3.7';
    case 'dash_dot':
      return context === 'drawing' ? '8 4 1.4 4' : '7 3.8 1.2 3.6';
    case 'dash_dot_dot':
      return context === 'drawing' ? '8 4 1.4 4 1.4 4' : '7 3.8 1.2 3.6 1.2 3.6';
    default:
      return undefined;
  }
}

function resolveImportedStrokeWidth(
  primitive: ImportedSchematicPrimitive,
  fallbackWidth: number
) {
  if (
    primitive.kind === 'text' ||
    primitive.strokeWidth === undefined ||
    !(primitive.strokeWidth > 0)
  ) {
    return fallbackWidth;
  }

  return Math.max(primitive.strokeWidth, fallbackWidth * 0.72);
}

function renderImportedTextLines(
  text: string,
  x: number,
  fontSize: number,
  baseline: 'auto' | 'middle' | 'hanging' | 'ideographic' | undefined
) {
  const lines = text.split('\n');
  if (lines.length <= 1) {
    return text;
  }

  const lineHeight = Math.max(fontSize * 1.15, 10);
  const firstDy =
    baseline === 'ideographic'
      ? -(lines.length - 1) * lineHeight
      : baseline === 'middle'
        ? -((lines.length - 1) * lineHeight) / 2
        : 0;

  return lines.map((line, index) => (
    <tspan key={`line-${index}`} x={x} dy={index === 0 ? firstDy : lineHeight}>
      {line}
    </tspan>
  ));
}

function isPowerSceneSymbol(symbol: ImportedSchematicSceneSymbol) {
  const reference = symbol.reference.toUpperCase();
  const value = symbol.value.toUpperCase();
  return (
    symbol.family === 'power' ||
    reference.startsWith('#PWR') ||
    ['GND', 'GNDPWR', 'PWR_FLAG'].includes(value) ||
    /^\+?(3V3|3\.3V|5V|12V|24V|VBUS|VBAT|VIN|VCC)$/.test(value)
  );
}

function classifyNetLabel(text: string) {
  const normalized = text.trim().toUpperCase();
  if (['GND', 'GNDPWR', 'AGND', 'DGND', 'PGND', 'VSS'].includes(normalized)) {
    return 'ground';
  }
  if (/^\+?(3V3|3\.3V|5V|12V|24V|VBAT|VBUS|VIN|VCC|VSYS)$/.test(normalized)) {
    return 'power';
  }
  return 'signal';
}

function truncateOverlayText(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
}

function getDisplaySheetFrameTitle(frame: NonNullable<ImportedSchematicScene['sheetFrames']>[number]) {
  return frame.pins.length > 0 ? 'SHEET I/O' : 'SHEET';
}

function getPinAnchorSide(anchor: ImportedSchematicSceneSymbol['pinAnchors'][number]) {
  return anchor.angle === 180 ? 'left' : anchor.angle === 0 ? 'right' : anchor.angle === 90 ? 'top' : 'bottom';
}

function getPinSideOrder(pinAnchors: ImportedSchematicSceneSymbol['pinAnchors']) {
  const sideOrder = new Map<string, number>();
  const sideBuckets = new Map<'left' | 'right' | 'top' | 'bottom', ImportedSchematicSceneSymbol['pinAnchors']>();

  for (const anchor of pinAnchors) {
    const side = getPinAnchorSide(anchor);
    const list = sideBuckets.get(side) ?? [];
    list.push(anchor);
    sideBuckets.set(side, list);
  }

  for (const [side, anchors] of sideBuckets) {
    const ordered = [...anchors].sort((a, b) =>
      side === 'left' || side === 'right'
        ? a.at.y - b.at.y
        : a.at.x - b.at.x
    );
    ordered.forEach((anchor, index) => {
      sideOrder.set(`${anchor.pinId}:${anchor.number ?? ''}:${anchor.at.x}:${anchor.at.y}`, index);
    });
  }

  return sideOrder;
}

function getPinSideOrderIndex(
  sideOrder: Map<string, number>,
  anchor: ImportedSchematicSceneSymbol['pinAnchors'][number],
  fallbackIndex: number
) {
  return sideOrder.get(`${anchor.pinId}:${anchor.number ?? ''}:${anchor.at.x}:${anchor.at.y}`) ?? fallbackIndex;
}

function offsetPrimitive(
  primitive: ImportedSchematicPrimitive,
  dx: number,
  dy: number
): ImportedSchematicPrimitive {
  switch (primitive.kind) {
    case 'rect':
      return {
        ...primitive,
        start: { x: primitive.start.x + dx, y: primitive.start.y + dy },
        end: { x: primitive.end.x + dx, y: primitive.end.y + dy },
      };
    case 'polyline':
      return {
        ...primitive,
        points: primitive.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
      };
    case 'circle':
      return {
        ...primitive,
        center: { x: primitive.center.x + dx, y: primitive.center.y + dy },
      };
    case 'arc':
      return {
        ...primitive,
        start: { x: primitive.start.x + dx, y: primitive.start.y + dy },
        mid: { x: primitive.mid.x + dx, y: primitive.mid.y + dy },
        end: { x: primitive.end.x + dx, y: primitive.end.y + dy },
      };
    case 'text':
      return {
        ...primitive,
        at: { x: primitive.at.x + dx, y: primitive.at.y + dy },
      };
  }
}

function inferFallbackSymbolFamily(component: PlacedComponent): ImportedSchematicSceneSymbol['family'] {
  const text = `${component.name} ${component.value ?? ''} ${component.importedReference ?? ''}`.toUpperCase();
  if (/(GND|PWR|VBUS|VCC|VIN|VSYS|\+5V|\+3V3)/.test(text)) {
    return 'power';
  }
  if (/(USB|J\d|CONN|HDR|HEADER)/.test(text)) {
    return 'connector';
  }
  if (/(ESP|STM|ATMEGA|RP2040|MCU|CPU|WROOM)/.test(text)) {
    return 'mcu';
  }
  if (/(R\d|C\d|L\d|Y\d|CRYSTAL|OHM|UF|NF|PF)/.test(text)) {
    return 'passive';
  }
  return 'generic';
}

function getStructuredConnectorKind(symbol: ImportedSchematicSceneSymbol) {
  const reference = symbol.reference.toUpperCase();
  const value = symbol.value.toUpperCase();
  const libraryId = symbol.libraryId?.toUpperCase() ?? '';
  const combined = `${reference} ${value} ${libraryId}`;

  if (/(SCREW|TERMINAL|TBLOCK|BORNIER)/.test(combined)) {
    return 'connector-terminal' as const;
  }

  if (/(UART|I2C|SPI|ISP|SWD|JTAG|DEBUG|INTERFACE|PORT)/.test(combined)) {
    return 'connector-interface' as const;
  }

  if (/^(J|P)\d+/.test(reference) || /(HEADER|HDR|PINHD|CONN_|SOCKET)/.test(combined)) {
    return 'connector-header' as const;
  }

  return 'connector' as const;
}

function buildFallbackSymbols(
  components: PlacedComponent[],
  sceneOrigin: { x: number; y: number },
  existingSymbolIds: Set<string>
) {
  return components.flatMap(component => {
    if (!component.importedGeometry || existingSymbolIds.has(component.instanceId)) {
      return [];
    }

    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });
    const offsetX = sceneOrigin.x + component.position.x;
    const offsetY = sceneOrigin.y + component.position.y;

    return [{
      instanceId: component.instanceId,
      reference: component.importedReference ?? component.name,
      value: component.value ?? component.name,
      family: inferFallbackSymbolFamily(component),
      libraryId: component.importedMapping?.libraryId,
      primitives: layout.primitives.map(primitive => offsetPrimitive(primitive, offsetX, offsetY)),
      pinAnchors: layout.pinAnchors.map(anchor => ({
        ...anchor,
        at: { x: anchor.at.x + offsetX, y: anchor.at.y + offsetY },
      })),
    }] satisfies ImportedSchematicSceneSymbol[];
  });
}

function buildStructuredSymbols(
  components: PlacedComponent[],
  sceneOrigin: { x: number; y: number },
  componentOffsets: Record<string, { x: number; y: number }>
) {
  return components.flatMap(component => {
    if (!component.importedGeometry) {
      return [];
    }

    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });
    const offset = componentOffsets[component.instanceId] ?? { x: 0, y: 0 };
    const absoluteX = sceneOrigin.x + component.position.x + offset.x;
    const absoluteY = sceneOrigin.y + component.position.y + offset.y;

    return [{
      instanceId: component.instanceId,
      reference: component.importedReference ?? component.name,
      value: component.value ?? component.name,
      family: inferFallbackSymbolFamily(component),
      libraryId: component.importedMapping?.libraryId,
      primitives: layout.primitives.map(primitive => offsetPrimitive(primitive, absoluteX, absoluteY)),
      pinAnchors: layout.pinAnchors.map(anchor => ({
        ...anchor,
        at: { x: anchor.at.x + absoluteX, y: anchor.at.y + absoluteY },
      })),
    }] satisfies ImportedSchematicSceneSymbol[];
  });
}

function getSymbolBounds(symbol: ImportedSchematicSceneSymbol) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const includePoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const primitive of symbol.primitives) {
    if (primitive.kind === 'rect') {
      includePoint(primitive.start.x, primitive.start.y);
      includePoint(primitive.end.x, primitive.end.y);
    } else if (primitive.kind === 'polyline') {
      primitive.points.forEach(point => includePoint(point.x, point.y));
    } else if (primitive.kind === 'circle') {
      includePoint(primitive.center.x - primitive.radius, primitive.center.y - primitive.radius);
      includePoint(primitive.center.x + primitive.radius, primitive.center.y + primitive.radius);
    } else if (primitive.kind === 'arc') {
      includePoint(primitive.start.x, primitive.start.y);
      includePoint(primitive.mid.x, primitive.mid.y);
      includePoint(primitive.end.x, primitive.end.y);
    } else {
      includePoint(primitive.at.x, primitive.at.y);
    }
  }

  for (const anchor of symbol.pinAnchors) {
    includePoint(anchor.at.x, anchor.at.y);
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 40, height: 28 };
  }

  return { x: minX, y: minY, width: Math.max(maxX - minX, 10), height: Math.max(maxY - minY, 10) };
}

function getStructuredSymbolKind(symbol: ImportedSchematicSceneSymbol) {
  const value = symbol.value.toUpperCase();
  if (value === 'GND' || value === 'GNDPWR') {
    return 'ground';
  }
  if (value === 'PWR_FLAG') {
    return 'pwr-flag';
  }
  if (isPowerName(value)) {
    return 'power';
  }
  if (/(UF|NF|PF|F\b)/.test(value) && symbol.pinAnchors.length <= 2) {
    return 'capacitor';
  }
  if (/(OHM|Ω|KOHM|MOHM|10K|1K|4K7|220R|R\b)/.test(value) && symbol.pinAnchors.length <= 2) {
    return 'resistor';
  }
  if (symbol.family === 'connector') {
    return getStructuredConnectorKind(symbol);
  }
  if (symbol.family === 'mcu' || symbol.pinAnchors.length >= 8) {
    return 'ic';
  }
  return 'box';
}

function renderStructuredPinStems(symbol: ImportedSchematicSceneSymbol, palette: ImportedSchematicOverlayPalette) {
  const anchorCount = symbol.pinAnchors.length;
  const sideOrder = getPinSideOrder(symbol.pinAnchors);

  return symbol.pinAnchors.map((anchor, anchorIndex) => {
    const stem = offsetPoint(anchor.at, anchor.angle, 20);
    const sideIndex = getPinSideOrderIndex(sideOrder, anchor, anchorIndex);
    const spreadStep = anchorCount >= 12 ? 5 : anchorCount >= 8 ? 4 : 3;
    const denseShift =
      anchorCount >= 8
        ? (sideIndex % 2 === 0 ? -1 : 1) * (Math.floor(sideIndex / 2) + 1) * spreadStep * 0.5
        : 0;
    const side = getPinAnchorSide(anchor);
    const labelXBase = anchor.angle === 180 ? stem.x - 5 : anchor.angle === 0 ? stem.x + 5 : stem.x;
    const labelX = labelXBase + ((side === 'top' || side === 'bottom') ? denseShift : 0);
    const labelYBase = anchor.angle === 90 ? stem.y - 5 : anchor.angle === 270 ? stem.y + 9 : stem.y + 2;
    const labelY = labelYBase + ((side === 'left' || side === 'right') ? denseShift : 0);
    const textAnchor = anchor.angle === 180 ? 'end' : anchor.angle === 0 ? 'start' : 'middle';
    const compactLabel = getImportedPinLabelDisplay({
      label: anchor.label,
      pinAnchorCount: anchorCount,
      sideIndex,
    });
    return (
      <g key={`${symbol.instanceId}-structured-pin-${anchor.pinId}-${anchor.number ?? 'na'}-${anchorIndex}`}>
        <line
          x1={anchor.at.x}
          y1={anchor.at.y}
          x2={stem.x}
          y2={stem.y}
          stroke={palette.wire}
          strokeWidth={1}
          opacity={0.5}
        />
        {compactLabel ? (
          <text
            x={labelX}
            y={labelY}
            fontSize={6.3}
            fill={palette.pinLabel}
            textAnchor={textAnchor}
            dominantBaseline={anchor.angle === 0 || anchor.angle === 180 ? 'middle' : 'auto'}
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            {compactLabel}
          </text>
        ) : null}
      </g>
    );
  });
}


export function ImportedSchematicOverlayNode({
  data,
}: NodeProps<ImportedSchematicOverlayNodeData>) {
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const palette = getImportedSchematicPalette(data.scene ? 'light' : schematicTheme);
  const scene = data.scene;
  const highlightedComponentIds = useMemo(() => new Set(data.highlightedComponentIds ?? []), [data.highlightedComponentIds]);
  const hasFocusedComponents = highlightedComponentIds.size > 0;
  const hasSceneGeometry = hasImportedSchematicSceneContent(scene);
  const baseSceneBounds = useMemo(
    () => getImportedSchematicSceneBounds([], scene),
    [scene]
  );
  const sceneBounds = useMemo(
    () =>
      data.viewMode === 'structured'
        ? getImportedStructuredViewportBounds(
            data.components,
            data.manualConnections,
            baseSceneBounds ? { x: baseSceneBounds.x, y: baseSceneBounds.y } : { x: 0, y: 0 }
          ) ?? baseSceneBounds
        : baseSceneBounds,
    [baseSceneBounds, data.components, data.manualConnections, data.viewMode]
  );
  const displayPageFrame = useMemo(
    () => getImportedSchematicDisplayPageFrame(scene),
    [scene]
  );
  const displaySheetFrames = useMemo(
    () => getImportedSchematicDisplaySheetFrames(scene),
    [scene]
  );
  const displayDrawings = useMemo(
    () => getImportedSchematicDisplayDrawings(scene),
    [scene]
  );
  const displayWireSegments = useMemo(
    () => getImportedSchematicDisplayWireSegments(scene),
    [scene]
  );
  const displayJunctions = useMemo(
    () => getImportedSchematicDisplayJunctions(scene),
    [scene]
  );
  const displaySymbols = useMemo(
    () => getImportedSchematicDisplaySymbols(scene),
    [scene]
  );
  const fallbackSymbols = useMemo(
    () => buildFallbackSymbols(
      data.components,
      baseSceneBounds ? { x: baseSceneBounds.x, y: baseSceneBounds.y } : { x: 0, y: 0 },
      new Set(displaySymbols.map(symbol => symbol.instanceId))
    ),
    [baseSceneBounds, data.components, displaySymbols]
  );
  const mergedSymbols = useMemo(
    () => [...displaySymbols, ...fallbackSymbols],
    [displaySymbols, fallbackSymbols]
  );
  const powerSymbols = useMemo(
    () => mergedSymbols.filter(isPowerSceneSymbol),
    [mergedSymbols]
  );
  const componentSymbols = useMemo(
    () => mergedSymbols.filter(symbol => !isPowerSceneSymbol(symbol)),
    [mergedSymbols]
  );
  const displayLabels = useMemo(
    () => getImportedSchematicDisplayLabels(scene),
    [scene]
  );
  const structuredLayout = useMemo(
    () => buildImportedStructuredLayout(
      data.components,
      data.manualConnections,
      { x: baseSceneBounds?.x ?? 0, y: baseSceneBounds?.y ?? 0 }
    ),
    [baseSceneBounds?.x, baseSceneBounds?.y, data.components, data.manualConnections]
  );
  const structuredSymbols = useMemo(
    () => buildStructuredSymbols(
      data.components,
      baseSceneBounds ? { x: baseSceneBounds.x, y: baseSceneBounds.y } : { x: 0, y: 0 },
      structuredLayout.componentOffsets
    ),
    [baseSceneBounds, data.components, structuredLayout.componentOffsets]
  );
  const structuredPowerSymbols = useMemo(
    () => structuredSymbols.filter(isPowerSceneSymbol),
    [structuredSymbols]
  );
  const structuredComponentSymbols = useMemo(
    () => structuredSymbols.filter(symbol => !isPowerSceneSymbol(symbol)),
    [structuredSymbols]
  );
  const showOriginalScene = data.viewMode !== 'structured';

  if (!scene || !hasSceneGeometry || !sceneBounds) {
    return null;
  }

  return (
    <div
      className="pointer-events-none overflow-visible"
      data-mm-imported-schematic-overlay="true"
      style={{
        width: sceneBounds.width,
        height: sceneBounds.height,
      }}
    >
      <svg
        className="block overflow-visible"
        width={sceneBounds.width}
        height={sceneBounds.height}
        viewBox={`0 0 ${sceneBounds.width} ${sceneBounds.height}`}
      >
        <defs>
          <filter id="mm-review-error-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComponentTransfer in="blur" result="glow">
              <feFuncA type="linear" slope="2" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${-sceneBounds.x} ${-sceneBounds.y})`}>
          {showOriginalScene ? (
            <>
              <PageFrameLayer frame={displayPageFrame} palette={palette} dimmed={data.dimNonTargets && hasFocusedComponents} />
              <SheetFramesLayer frames={displaySheetFrames} palette={palette} dimmed={data.dimNonTargets && hasFocusedComponents} />
              <SceneDrawingsLayer drawings={displayDrawings} palette={palette} dimmed={data.dimNonTargets && hasFocusedComponents} />
              <WiresLayer segments={displayWireSegments} palette={palette} dimmed={data.dimNonTargets && hasFocusedComponents} />
              <JunctionsLayer junctions={displayJunctions} palette={palette} dimmed={data.dimNonTargets && hasFocusedComponents} />
            </>
          ) : (
            <>
              <StructuredSectionsLayer sections={structuredLayout.sections} />
              <StructuredRailsLayer rails={structuredLayout.rails} palette={palette} />
              <StructuredConnectionsLayer
                connections={structuredLayout.connections}
                palette={palette}
                highlightedComponentIds={highlightedComponentIds}
                dimNonTargets={data.dimNonTargets === true}
              />
            </>
          )}
          {showOriginalScene ? (
            <>
              <SymbolsLayer symbols={powerSymbols} palette={palette} highlightedComponentIds={highlightedComponentIds} dimNonTargets={data.dimNonTargets === true} pulse={data.pulse === true} structuredMode={false} componentOffsets={{}} />
              <SymbolsLayer symbols={componentSymbols} palette={palette} highlightedComponentIds={highlightedComponentIds} dimNonTargets={data.dimNonTargets === true} pulse={data.pulse === true} structuredMode={false} componentOffsets={{}} />
              <LabelsLayer labels={displayLabels} dimmed={data.dimNonTargets && hasFocusedComponents} />
            </>
          ) : (
            <>
              <SymbolsLayer symbols={structuredPowerSymbols} palette={palette} highlightedComponentIds={highlightedComponentIds} dimNonTargets={data.dimNonTargets === true} pulse={data.pulse === true} structuredMode componentOffsets={{}} />
              <SymbolsLayer symbols={structuredComponentSymbols} palette={palette} highlightedComponentIds={highlightedComponentIds} dimNonTargets={data.dimNonTargets === true} pulse={data.pulse === true} structuredMode componentOffsets={{}} />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

const WiresLayer = memo(function WiresLayer({
  segments,
  palette,
  dimmed,
}: {
  segments: ImportedSchematicScene['wireSegments'];
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <g key={`wire-${index}`} data-mm-imported-wire="true">
          <line
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke={palette.canvasBackground}
            opacity={dimmed ? 0.12 : 0.62}
            strokeWidth={3.2}
            strokeLinecap="round"
            shapeRendering="geometricPrecision"
          />
          <line
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke={palette.wire}
            opacity={dimmed ? 0.22 : 0.72}
            strokeWidth={1.15}
            strokeLinecap="round"
            shapeRendering="geometricPrecision"
          />
        </g>
      ))}
    </>
  );
});

const StructuredConnectionsLayer = memo(function StructuredConnectionsLayer({
  connections,
  palette,
  highlightedComponentIds,
  dimNonTargets,
}: {
  connections: ReturnType<typeof buildImportedStructuredLayout>['connections'];
  palette: ImportedSchematicOverlayPalette;
  highlightedComponentIds: Set<string>;
  dimNonTargets: boolean;
}) {
  return (
    <g>
      {connections.map((connection, index) => {
        const path = connection.points
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
          .join(' ');
        const fallbackPoint = connection.points[Math.floor(connection.points.length / 2)] ?? connection.points[0];
        const labelPoint = connection.labelPoint
          ? connection.labelPoint
          : fallbackPoint
            ? { x: fallbackPoint.x, y: fallbackPoint.y - 14 - ((index % 2) * 8) }
            : null;
        const isHighlighted =
          highlightedComponentIds.has(connection.sourceComponentId) ||
          highlightedComponentIds.has(connection.targetComponentId);
        const opacity = dimNonTargets && highlightedComponentIds.size > 0 && !isHighlighted ? 0.16 : 0.5;
        const stroke =
          isHighlighted
            ? '#60a5fa'
            : connection.netKind === 'power'
              ? '#9c6f1f'
              : connection.netKind === 'ground'
                ? '#6b6259'
                : palette.wire;

        return (
          <g key={connection.id} opacity={opacity}>
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={isHighlighted ? 1.7 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={isHighlighted ? 'url(#mm-review-error-glow)' : undefined}
            />
            {connection.label && labelPoint && connection.netKind === 'signal' ? (
              <g transform={`translate(${labelPoint.x} ${labelPoint.y})`}>
                <text
                  x={0}
                  y={0}
                  fill="#4c6b88"
                  opacity={0.72}
                  fontSize={6.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
                >
                  {truncateOverlayText(connection.label, 10)}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
});

const StructuredRailsLayer = memo(function StructuredRailsLayer({
  rails,
  palette,
}: {
  rails: ReturnType<typeof buildImportedStructuredLayout>['rails'];
  palette: ImportedSchematicOverlayPalette;
}) {
  return (
    <g>
      {rails.map(rail => {
        const start = rail.points[0];
        const end = rail.points[rail.points.length - 1];
        const isVertical = start.x === end.x;
        const stroke =
          rail.netKind === 'power'
            ? '#c69a3b'
            : rail.netKind === 'ground'
              ? '#93877b'
              : palette.pinStroke;
        const textColor =
          rail.netKind === 'power'
            ? '#9c6f1f'
            : rail.netKind === 'ground'
              ? '#675f57'
              : '#496b8b';

        return (
          <g key={rail.id}>
            {rail.netKind === 'signal' ? (
              <>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={stroke}
                  strokeWidth={3}
                  opacity={0.16}
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={stroke}
                  strokeWidth={1}
                  opacity={0.48}
                />
                <rect
                  x={isVertical ? start.x - 24 : start.x - 1}
                  y={isVertical ? start.y - 15 : start.y - 6}
                  width={isVertical ? 42 : 42}
                  height={11}
                  rx={2}
                  fill="#edf3fb"
                  opacity={0.62}
                />
                <text
                  x={isVertical ? start.x : start.x + 20}
                  y={isVertical ? start.y - 10 : start.y - 0.5}
                  fontSize={5.8}
                  fill={textColor}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
                >
                  NET
                </text>
              </>
            ) : rail.netKind === 'power' ? (
              <>
                <line
                  x1={start.x}
                  y1={start.y + 12}
                  x2={end.x}
                  y2={end.y}
                  stroke={stroke}
                  strokeWidth={1.35}
                  opacity={0.54}
                />
                <polygon
                  points={`${start.x},${start.y} ${start.x - 7},${start.y + 12} ${start.x + 7},${start.y + 12}`}
                  fill={stroke}
                  opacity={0.9}
                />
                <text
                  x={start.x}
                  y={start.y - 6}
                  fontSize={8.4}
                  fill={textColor}
                  textAnchor="middle"
                  fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
                >
                  {rail.label}
                </text>
              </>
            ) : (
              <>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={stroke}
                  strokeWidth={1.25}
                  opacity={0.5}
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={start.x}
                  y2={start.y + 14}
                  stroke={stroke}
                  strokeWidth={1.25}
                />
                <line x1={start.x - 14} y1={start.y + 14} x2={start.x + 14} y2={start.y + 14} stroke={stroke} strokeWidth={1.8} />
                <line x1={start.x - 9} y1={start.y + 20} x2={start.x + 9} y2={start.y + 20} stroke={stroke} strokeWidth={1.35} />
                <line x1={start.x - 4} y1={start.y + 26} x2={start.x + 4} y2={start.y + 26} stroke={stroke} strokeWidth={0.95} />
                <text
                  x={start.x + 24}
                  y={start.y + 17}
                  fontSize={7.6}
                  fill={textColor}
                  fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
                >
                  GND
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
});

const SceneDrawingsLayer = memo(function SceneDrawingsLayer({
  drawings,
  palette,
  dimmed,
}: {
  drawings: NonNullable<ImportedSchematicScene['drawings']>;
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  return (
    <>
      {drawings.map((primitive, index) => (
        <SceneDrawingPrimitive
          key={`drawing-${index}`}
          primitive={primitive}
          palette={palette}
          dimmed={dimmed}
        />
      ))}
    </>
  );
});

const JunctionsLayer = memo(function JunctionsLayer({
  junctions,
  palette,
  dimmed,
}: {
  junctions: ImportedSchematicScene['junctions'];
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  return (
    <>
      {junctions.map((junction, index) => (
        <circle
          key={`junction-${index}`}
          data-mm-imported-junction="true"
          cx={junction.x}
          cy={junction.y}
          r={2.5}
          fill={palette.junction}
          opacity={dimmed ? 0.22 : 0.6}
        />
      ))}
    </>
  );
});

const LabelsLayer = memo(function LabelsLayer({
  labels,
  dimmed,
}: {
  labels: ImportedSchematicScene['labels'];
  dimmed?: boolean;
}) {
  return (
    <>
      {labels.map((label, index) => {
        const renderedAngle = getImportedTextDisplayAngle(label.angle ?? 0, 'annotation', {
          text: label.text,
        });
        const fontSize = Math.min(Math.max((label.sizeMm ?? 1.27) * (1 / 0.18) * 0.66, 6.25), 7.4);
        const kind = classifyNetLabel(label.text);
        const displayText = truncateOverlayText(label.text, kind === 'signal' ? 20 : 14);
        const textFill =
          kind === 'power' ? '#9c6f1f' : kind === 'ground' ? '#5e564f' : '#486b8d';
        const labelOpacity = dimmed ? 0.16 : kind === 'signal' ? 0.52 : 0.62;
        return (
          <g
            key={`label-${index}`}
            data-mm-imported-label="true"
            opacity={labelOpacity}
            transform={
              renderedAngle
                ? `rotate(${renderedAngle} ${label.at.x} ${label.at.y})`
                : undefined
            }
          >
            <text
              x={label.at.x}
              y={label.at.y}
              fontSize={fontSize}
              fill={textFill}
              textAnchor={label.angle === 180 ? 'end' : label.angle === 90 || label.angle === 270 ? 'middle' : 'start'}
              dominantBaseline="middle"
              fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
            >
              {displayText}
            </text>
          </g>
        );
      })}
    </>
  );
});

const SymbolsLayer = memo(function SymbolsLayer({
  symbols,
  palette,
  highlightedComponentIds,
  dimNonTargets,
  pulse,
  structuredMode,
  componentOffsets,
}: {
  symbols: ImportedSchematicSceneSymbol[];
  palette: ImportedSchematicOverlayPalette;
  highlightedComponentIds: Set<string>;
  dimNonTargets: boolean;
  pulse: boolean;
  structuredMode: boolean;
  componentOffsets: Record<string, { x: number; y: number }>;
}) {
  return (
    <>
      {symbols.map((symbol, symbolIndex) => {
        const isHighlighted = highlightedComponentIds.has(symbol.instanceId);
        const opacity = dimNonTargets && highlightedComponentIds.size > 0 && !isHighlighted ? 0.24 : 1;
        const fallbackPinSideOrder = getPinSideOrder(symbol.pinAnchors);
        const hasNativePinText = symbol.primitives.some(
          primitive =>
            primitive.kind === 'text' &&
            (primitive.role === 'pin-name' || primitive.role === 'pin-number')
        );

        return (
          <g
            key={`${symbol.instanceId}-${symbolIndex}`}
            data-mm-imported-symbol="true"
            opacity={opacity}
            filter={isHighlighted && pulse ? 'url(#mm-review-error-glow)' : undefined}
            transform={
              structuredMode
                ? `translate(${componentOffsets[symbol.instanceId]?.x ?? 0} ${componentOffsets[symbol.instanceId]?.y ?? 0})`
                : undefined
            }
          >
            {structuredMode ? (
              <StructuredSymbolShape symbol={symbol} palette={palette} highlighted={isHighlighted} />
            ) : (
              symbol.primitives
                .filter(primitive => shouldRenderPrimitiveInOriginalOverview(symbol, primitive, isHighlighted))
                .map((primitive, index) => (
                  <ImportedPrimitiveShape
                    key={`${symbol.instanceId}-shape-${index}`}
                    primitive={primitive}
                    symbol={symbol}
                    palette={palette}
                    highlighted={isHighlighted}
                  />
                ))
            )}

            {!structuredMode && !hasNativePinText &&
              symbol.pinAnchors.map((anchor, anchorIndex) => {
                const radians = (anchor.angle * Math.PI) / 180;
                const lengthPx = anchor.lengthMm * (1 / 0.18);
                const innerX = anchor.at.x + Math.cos(radians) * lengthPx;
                const innerY = anchor.at.y + Math.sin(radians) * lengthPx;
                const isHorizontal = anchor.angle === 0 || anchor.angle === 180;
                const sideIndex = getPinSideOrderIndex(fallbackPinSideOrder, anchor, anchorIndex);
                const displayLabel = getImportedPinLabelDisplay({
                  label: anchor.label,
                  pinAnchorCount: symbol.pinAnchors.length,
                  sideIndex,
                  highlighted: isHighlighted,
                });
                const textAnchor =
                  anchor.angle === 180 ? 'end' : anchor.angle === 0 ? 'start' : 'middle';
                const labelX =
                  anchor.angle === 180 ? innerX - 4 : anchor.angle === 0 ? innerX + 4 : innerX;
                const labelY =
                  anchor.angle === 90 ? innerY - 3 : anchor.angle === 270 ? innerY + 7 : innerY;

                if (!displayLabel) {
                  return null;
                }

                return (
                  <text
                    key={`${symbol.instanceId}-pin-label-${anchor.pinId}-${anchorIndex}`}
                    x={labelX}
                    y={labelY}
                    fontSize={5.2}
                    fill={palette.pinLabel}
                    textAnchor={textAnchor}
                    dominantBaseline={isHorizontal ? 'middle' : 'central'}
                    fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
                  >
                    {displayLabel}
                  </text>
                );
              })}
          </g>
        );
      })}
    </>
  );
});

const StructuredSectionsLayer = memo(function StructuredSectionsLayer({
  sections,
}: {
  sections: ReturnType<typeof buildImportedStructuredLayout>['sections'];
}) {
  return (
    <g>
      {sections.map(section => (
        <g key={section.id}>
          <rect
            x={section.x}
            y={section.y}
            width={section.width}
            height={section.height}
            fill="none"
            stroke="#d4c2ae"
            strokeWidth={0.9}
            strokeDasharray="3.5 3"
          />
          <rect
            x={section.x + 5}
            y={section.y - 4}
            width={Math.max(section.title.length * 7.6 + 22, 92)}
            height={17}
            rx={1.5}
            fill="#fffdf9"
          />
          <text
            x={section.x + 8}
            y={section.y + 10}
            fontSize={8.4}
            fill="#bb5f43"
            fontWeight={600}
            letterSpacing="0.05em"
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            {section.title}
          </text>
          <line
            x1={section.x + Math.max(section.title.length * 7.6 + 34, 110)}
            y1={section.y + 7}
            x2={section.x + section.width - 56}
            y2={section.y + 7}
            stroke="#e5d8c8"
            strokeWidth={0.9}
          />
          <text
            x={section.x + section.width - 8}
            y={section.y + 10}
            textAnchor="end"
            fontSize={6.2}
            fill="#b9ad9f"
            letterSpacing="0.08em"
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            {section.layoutKind === 'microcontroller' ? 'CORE' : section.layoutKind === 'vertical' ? 'RAIL' : 'BLOCK'}
          </text>
        </g>
      ))}
    </g>
  );
});

function StructuredSymbolShape({
  symbol,
  palette,
  highlighted,
}: {
  symbol: ImportedSchematicSceneSymbol;
  palette: ImportedSchematicOverlayPalette;
  highlighted: boolean;
}) {
  const bounds = getSymbolBounds(symbol);
  const stroke = highlighted ? '#5d95d0' : palette.symbolStroke;
  const fill = getStructuredSymbolKind(symbol) === 'ic' ? '#fff8d6' : '#fffdf9';
  const kind = getStructuredSymbolKind(symbol);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const shortReference = truncateOverlayText(symbol.reference, 10);
  const shortValue = truncateOverlayText(symbol.value, symbol.family === 'connector' ? 14 : 16);
  const shortFamily = symbol.family ? truncateOverlayText(symbol.family, 10) : null;
  const orientation =
    symbol.pinAnchors.length >= 2 &&
    Math.abs(symbol.pinAnchors[0].at.x - symbol.pinAnchors[symbol.pinAnchors.length - 1].at.x) >
      Math.abs(symbol.pinAnchors[0].at.y - symbol.pinAnchors[symbol.pinAnchors.length - 1].at.y)
      ? 'horizontal'
      : 'vertical';

  if (kind === 'power') {
    return (
      <g>
        <line x1={centerX} y1={bounds.y + bounds.height} x2={centerX} y2={bounds.y + 20} stroke="#c69a3b" strokeWidth={1.35} />
        <polygon points={`${centerX},${bounds.y + 10} ${centerX - 7},${bounds.y + 22} ${centerX + 7},${bounds.y + 22}`} fill="#c69a3b" />
        <text x={centerX} y={bounds.y + 3} textAnchor="middle" fontSize={8.2} fill="#9c6f1f" fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
          {symbol.value}
        </text>
      </g>
    );
  }

  if (kind === 'ground') {
    return (
      <g>
        <line x1={centerX} y1={bounds.y} x2={centerX} y2={bounds.y + 18} stroke="#6b6259" strokeWidth={1.25} />
        <line x1={centerX - 15} y1={bounds.y + 18} x2={centerX + 15} y2={bounds.y + 18} stroke="#6b6259" strokeWidth={1.8} />
        <line x1={centerX - 10} y1={bounds.y + 24} x2={centerX + 10} y2={bounds.y + 24} stroke="#6b6259" strokeWidth={1.35} />
        <line x1={centerX - 5} y1={bounds.y + 30} x2={centerX + 5} y2={bounds.y + 30} stroke="#6b6259" strokeWidth={0.95} />
        <text x={centerX} y={bounds.y + 41} textAnchor="middle" fontSize={7.6} fill="#8b8379" fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
          {symbol.value}
        </text>
      </g>
    );
  }

  if (kind === 'pwr-flag') {
    return (
      <g>
        <rect x={centerX - 18} y={centerY - 9} width={36} height={18} rx={2} fill="#fff8d6" stroke={stroke} strokeWidth={0.8} />
        <text x={centerX} y={centerY + 1} textAnchor="middle" fontSize={7.5} fill="#7c746c" dominantBaseline="central" fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
          FLAG
        </text>
      </g>
    );
  }

  if (kind === 'capacitor') {
    return (
      <g>
        {renderStructuredPinStems(symbol, palette)}
        {orientation === 'horizontal' ? (
          <>
            <line x1={centerX - 6} y1={centerY - 14} x2={centerX - 6} y2={centerY + 14} stroke={stroke} strokeWidth={3} />
            <line x1={centerX + 6} y1={centerY - 14} x2={centerX + 6} y2={centerY + 14} stroke={stroke} strokeWidth={3} />
          </>
        ) : (
          <>
            <line x1={centerX - 14} y1={centerY - 6} x2={centerX + 14} y2={centerY - 6} stroke={stroke} strokeWidth={3} />
            <line x1={centerX - 14} y1={centerY + 6} x2={centerX + 14} y2={centerY + 6} stroke={stroke} strokeWidth={3} />
          </>
        )}
        <text x={centerX} y={centerY - 18} textAnchor="middle" fontSize={6.6} fill={palette.referenceText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>{shortReference}</text>
        <text x={centerX} y={centerY + 24} textAnchor="middle" fontSize={6.8} fill={palette.valueText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>{shortValue}</text>
      </g>
    );
  }

  if (kind === 'resistor') {
    const points =
      orientation === 'horizontal'
        ? `${centerX - 20},${centerY} ${centerX - 14},${centerY - 6} ${centerX - 8},${centerY + 6} ${centerX - 2},${centerY - 6} ${centerX + 4},${centerY + 6} ${centerX + 10},${centerY - 6} ${centerX + 16},${centerY + 6} ${centerX + 20},${centerY}`
        : `${centerX},${centerY - 20} ${centerX - 6},${centerY - 14} ${centerX + 6},${centerY - 8} ${centerX - 6},${centerY - 2} ${centerX + 6},${centerY + 4} ${centerX - 6},${centerY + 10} ${centerX + 6},${centerY + 16} ${centerX},${centerY + 20}`;
    return (
      <g>
        {renderStructuredPinStems(symbol, palette)}
        <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <text x={centerX} y={centerY - 18} textAnchor="middle" fontSize={6.6} fill={palette.referenceText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>{shortReference}</text>
        <text x={centerX} y={centerY + 24} textAnchor="middle" fontSize={6.8} fill={palette.valueText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>{shortValue}</text>
      </g>
    );
  }

  if (kind === 'connector' || kind === 'connector-header' || kind === 'connector-terminal' || kind === 'connector-interface') {
    const bodyX = bounds.x + 10;
    const bodyY = bounds.y + 10;
    const bodyWidth = Math.max(bounds.width - 20, 52);
    const bodyHeight = Math.max(bounds.height - 20, 44);
    const sidePins = symbol.pinAnchors.filter(anchor => anchor.angle === 0 || anchor.angle === 180);
    const verticalPins = symbol.pinAnchors.filter(anchor => anchor.angle === 90 || anchor.angle === 270);
    const pinMarkers = sidePins.length > 0 ? sidePins : verticalPins;
    const connectorLabel =
      kind === 'connector-terminal'
        ? 'TERMINAL'
        : kind === 'connector-interface'
          ? 'INTERFACE'
          : kind === 'connector-header'
            ? 'HEADER'
            : 'CONNECTOR';
    const connectorValueLabel =
      /\.kicad_sch$/i.test(symbol.value) ||
      symbol.value === symbol.reference ||
      symbol.value.length > 18
        ? connectorLabel
        : shortValue;

    return (
      <g>
        {renderStructuredPinStems(symbol, palette)}
        <rect
          x={bodyX}
          y={bodyY}
          width={bodyWidth}
          height={bodyHeight}
          rx={3}
          fill={kind === 'connector-terminal' ? '#fff7ec' : kind === 'connector-interface' ? '#f8fbff' : '#fffdf9'}
          stroke={stroke}
          strokeWidth={1}
        />
        {pinMarkers.slice(0, 12).map((anchor, index) => {
          const markerSize = kind === 'connector-terminal' ? 6 : 4.5;
          const markerX =
            anchor.angle === 180
              ? bodyX - markerSize * 0.5
              : anchor.angle === 0
                ? bodyX + bodyWidth - markerSize * 0.5
                : anchor.at.x - markerSize / 2;
          const markerY =
            anchor.angle === 90
              ? bodyY - markerSize * 0.5
              : anchor.angle === 270
                ? bodyY + bodyHeight - markerSize * 0.5
                : anchor.at.y - markerSize / 2;
          return (
            <rect
              key={`${symbol.instanceId}-connector-marker-${anchor.pinId}-${index}`}
              x={markerX}
              y={markerY}
              width={markerSize}
              height={markerSize}
              rx={kind === 'connector-interface' ? 2.2 : 1}
              fill={kind === 'connector-terminal' ? '#efd2a9' : kind === 'connector-interface' ? '#dceafb' : '#f0e2bf'}
              stroke={stroke}
              strokeWidth={0.7}
            />
          );
        })}
        {kind === 'connector-interface' ? (
          <line
            x1={bodyX + 8}
            y1={bodyY + bodyHeight / 2}
            x2={bodyX + bodyWidth - 8}
            y2={bodyY + bodyHeight / 2}
            stroke="#9eb7d4"
            strokeDasharray="4 3"
            strokeWidth={0.9}
          />
        ) : null}
        <text
          x={bodyX + 8}
          y={bodyY + 14}
          fontSize={6.6}
          fill={palette.referenceText}
          fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
        >
          {shortReference}
        </text>
        <text
          x={bodyX + 8}
          y={bodyY + 26}
          fontSize={6.2}
          fill={palette.valueText}
          fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
        >
          {connectorValueLabel}
        </text>
      </g>
    );
  }

  return (
    <g>
      {renderStructuredPinStems(symbol, palette)}
      <rect
        x={bounds.x + 4}
        y={bounds.y + 4}
        width={Math.max(bounds.width - 8, 44)}
        height={Math.max(bounds.height - 8, 34)}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <text x={centerX} y={bounds.y + 15} textAnchor="middle" fontSize={6.4} fill={palette.referenceText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
        {shortReference}
      </text>
      <text x={centerX} y={centerY + 2} textAnchor="middle" fontSize={7.6} fill={highlighted ? '#4a78ab' : palette.valueText} fontWeight={600} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
        {shortValue}
      </text>
      {(kind === 'ic' || kind === 'box') && shortFamily ? (
        <text x={centerX} y={bounds.y + Math.max(bounds.height - 8, 25)} textAnchor="middle" fontSize={5.9} fill={palette.annotationText} fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}>
          {shortFamily}
        </text>
      ) : null}
    </g>
  );
}

function ImportedPrimitiveShape({
  primitive,
  symbol,
  palette,
  highlighted,
}: {
  primitive: ImportedSchematicPrimitive;
  symbol: ImportedSchematicSceneSymbol;
  palette: ImportedSchematicOverlayPalette;
  highlighted: boolean;
}) {
  const strokeColor = highlighted ? '#fb7185' : palette.symbolStroke;

  if (primitive.kind === 'rect') {
    const x = Math.min(primitive.start.x, primitive.end.x);
    const y = Math.min(primitive.start.y, primitive.end.y);
    const width = Math.abs(primitive.end.x - primitive.start.x);
    const height = Math.abs(primitive.end.y - primitive.start.y);
    const fill = resolveImportedPrimitiveFill(symbol, primitive, palette);

    return (
      <rect
        x={x}
        y={y}
        width={Math.max(width, 1)}
        height={Math.max(height, 1)}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.15)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle)}
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.kind === 'polyline') {
    return (
      <polyline
        points={primitive.points.map(point => `${point.x},${point.y}`).join(' ')}
        fill={resolveImportedPrimitiveFill(symbol, primitive, palette)}
        stroke={strokeColor}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.15)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle)}
        strokeLinejoin="round"
        strokeLinecap="round"
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.kind === 'circle') {
    return (
      <circle
        cx={primitive.center.x}
        cy={primitive.center.y}
        r={primitive.radius}
        fill={resolveImportedPrimitiveFill(symbol, primitive, palette)}
        stroke={strokeColor}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.15)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle)}
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.kind === 'arc') {
    return (
      <path
        d={arcPath(primitive.start, primitive.mid, primitive.end)}
        fill="none"
        stroke={strokeColor}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.15)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle)}
        strokeLinecap="round"
        shapeRendering="geometricPrecision"
      />
    );
  }

  const fontSize = getImportedTextFontSizePx(primitive);
  const sourceAngle = primitive.originalAngle ?? primitive.angle;
  const displayAngle = getImportedTextDisplayAngle(sourceAngle, primitive.role, {
    preserveNativeOrientation: primitive.preserveNativeOrientation,
    text: primitive.text,
  });
  const flattenForReadability = shouldFlattenImportedTextForReadability(primitive);
  const readableOffset = getImportedReadableTextOffset(primitive, fontSize);
  const textX = primitive.at.x + readableOffset.x;
  const textY = primitive.at.y + readableOffset.y;
  const resolvedTextAnchor = flattenForReadability
    ? 'middle'
    : primitive.textAnchor ?? getImportedTextDisplayAnchor(sourceAngle, primitive.role);
  const resolvedBaseline = flattenForReadability
    ? 'middle'
    : primitive.baseline ?? getImportedTextDisplayBaseline(sourceAngle, primitive.role);
  const textOpacity = highlighted ? 1 : getImportedTextOverviewOpacity(primitive);
  const fill =
    primitive.role === 'reference'
      ? palette.referenceText
      : primitive.role === 'value'
        ? palette.valueText
        : primitive.role === 'pin-name'
          ? palette.pinLabel
          : primitive.role === 'pin-number'
            ? palette.symbolStroke
            : palette.annotationText;

  return (
    <text
      x={textX}
      y={textY}
      fontSize={fontSize}
      fill={fill}
      opacity={textOpacity}
      stroke={flattenForReadability ? palette.canvasBackground : undefined}
      strokeWidth={flattenForReadability ? Math.max(fontSize * 0.32, 1.3) : undefined}
      paintOrder={flattenForReadability ? 'stroke' : undefined}
      textAnchor={resolvedTextAnchor}
      dominantBaseline={resolvedBaseline}
      transform={
        displayAngle ? `rotate(${displayAngle} ${textX} ${textY})` : undefined
      }
      fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
    >
      {renderImportedTextLines(
        primitive.text,
        textX,
        fontSize,
        resolvedBaseline
      )}
    </text>
  );
}

function SceneDrawingPrimitive({
  primitive,
  palette,
  dimmed,
}: {
  primitive: ImportedSchematicPrimitive;
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  const strokeColor = palette.sheetStroke;

  if (primitive.kind === 'rect') {
    const x = Math.min(primitive.start.x, primitive.end.x);
    const y = Math.min(primitive.start.y, primitive.end.y);
    const width = Math.abs(primitive.end.x - primitive.start.x);
    const height = Math.abs(primitive.end.y - primitive.start.y);

    return (
      <rect
        x={x}
        y={y}
        width={Math.max(width, 1)}
        height={Math.max(height, 1)}
        fill="none"
        stroke={strokeColor}
        opacity={dimmed ? 0.24 : 1}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.25)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle, 'drawing')}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (primitive.kind === 'polyline') {
    return (
      <polyline
        points={primitive.points.map(point => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke={strokeColor}
        opacity={dimmed ? 0.24 : 1}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.25)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle, 'drawing')}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (primitive.kind === 'circle') {
    return (
      <circle
        cx={primitive.center.x}
        cy={primitive.center.y}
        r={primitive.radius}
        fill="none"
        stroke={strokeColor}
        opacity={dimmed ? 0.24 : 1}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.25)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle, 'drawing')}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (primitive.kind === 'arc') {
    return (
      <path
        d={arcPath(primitive.start, primitive.mid, primitive.end)}
        fill="none"
        stroke={strokeColor}
        opacity={dimmed ? 0.24 : 1}
        strokeWidth={resolveImportedStrokeWidth(primitive, 1.25)}
        strokeDasharray={resolveImportedStrokeDasharray(primitive.strokeStyle, 'drawing')}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  const renderedAngle = getImportedTextDisplayAngle(
    primitive.originalAngle ?? primitive.angle,
    primitive.role,
    { preserveNativeOrientation: primitive.preserveNativeOrientation, text: primitive.text }
  );
  const sourceAngle = primitive.originalAngle ?? primitive.angle;
  const flattenForReadability = shouldFlattenImportedTextForReadability(primitive);
  const fontSize = getImportedTextFontSizePx(primitive);
  const readableOffset = getImportedReadableTextOffset(primitive, fontSize);
  const textX = primitive.at.x + readableOffset.x;
  const textY = primitive.at.y + readableOffset.y;
  const resolvedTextAnchor = flattenForReadability
    ? 'middle'
    : primitive.textAnchor ?? getImportedTextDisplayAnchor(sourceAngle, primitive.role);
  const resolvedBaseline = flattenForReadability
    ? 'middle'
    : primitive.baseline ?? getImportedTextDisplayBaseline(sourceAngle, primitive.role);
  const textOpacity = dimmed ? 0.18 : getImportedTextOverviewOpacity(primitive) * 0.78;

  return (
    <text
      x={textX}
      y={textY}
      fontSize={fontSize}
      fill={palette.sheetText}
      opacity={textOpacity}
      stroke={flattenForReadability ? palette.canvasBackground : undefined}
      strokeWidth={flattenForReadability ? Math.max(fontSize * 0.32, 1.3) : undefined}
      paintOrder={flattenForReadability ? 'stroke' : undefined}
      textAnchor={resolvedTextAnchor}
      dominantBaseline={resolvedBaseline}
      transform={
        renderedAngle
          ? `rotate(${renderedAngle} ${textX} ${textY})`
          : undefined
      }
      fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
    >
      {renderImportedTextLines(
        primitive.text,
        textX,
        fontSize,
        resolvedBaseline
      )}
    </text>
  );
}

const SheetFramesLayer = memo(function SheetFramesLayer({
  frames,
  palette,
  dimmed,
}: {
  frames: NonNullable<ImportedSchematicScene['sheetFrames']>;
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  return (
    <>
      {frames.map((frame, index) => {
        const descriptor = describeImportedSheetFrame(frame);
        const x = descriptor.bounds.x;
        const y = descriptor.bounds.y;
        const frameWidth = descriptor.bounds.width;
        const frameHeight = descriptor.bounds.height;
        const titleY = y + 10;
        const pinLabelOffset = 2.8;
        const title = getDisplaySheetFrameTitle(frame);

        return (
          <g key={`sheet-${index}`} data-mm-imported-sheet-frame="true">
            <rect
              x={x}
              y={y}
              width={frameWidth}
              height={frameHeight}
              fill="none"
              stroke={palette.sheetStroke}
              opacity={dimmed ? 0.1 : 0.28}
              strokeWidth={0.8}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x + 6}
              y={titleY}
              fontSize={5.9}
              fill={palette.sheetText}
              opacity={dimmed ? 0.1 : 0.28}
              fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
            >
              {title}
            </text>
            {frame.pins.map((pin, pinIndex) => (
              <text
                key={`sheet-${index}-pin-${pinIndex}`}
                x={pin.at.x + (pin.angle === 180 ? -pinLabelOffset : pinLabelOffset)}
                y={pin.at.y}
                textAnchor={pin.angle === 180 ? 'end' : 'start'}
                dominantBaseline="middle"
                fontSize={5.3}
                fill={palette.sheetText}
                opacity={dimmed ? 0.08 : 0.16}
                fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
              >
                {truncateOverlayText(pin.text, 10)}
              </text>
            ))}
          </g>
        );
      })}
    </>
  );
});

const PageFrameLayer = memo(function PageFrameLayer({
  frame,
  palette,
  dimmed,
}: {
  frame: NonNullable<ImportedSchematicScene['pageFrame']> | null;
  palette: ImportedSchematicOverlayPalette;
  dimmed?: boolean;
}) {
  if (!frame) {
    return null;
  }

  const x = Math.min(frame.start.x, frame.end.x);
  const y = Math.min(frame.start.y, frame.end.y);
  const width = Math.abs(frame.end.x - frame.start.x);
  const height = Math.abs(frame.end.y - frame.start.y);
  const margin = 38;
  const innerX = x + margin;
  const innerY = y + margin;
  const innerWidth = Math.max(width - margin * 2, 1);
  const innerHeight = Math.max(height - margin * 2, 1);
  const titleWidth = Math.min(380, Math.max(innerWidth * 0.28, 260));
  const titleCommentLines = [
    frame.titleBlock?.company,
    ...(frame.titleBlock?.comments ?? []),
  ].filter((line): line is string => Boolean(line?.trim()));
  const titleHeight = 70 + titleCommentLines.length * 12;
  const titleX = innerX + innerWidth - titleWidth;
  const titleY = innerY + innerHeight - titleHeight;
  const title = frame.titleBlock?.title ?? '';
  const date = frame.titleBlock?.date ?? '';
  const rev = frame.titleBlock?.rev ?? '';

  return (
    <g data-mm-imported-page-frame="true" opacity={dimmed ? 0.24 : 1}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={palette.pageFrameStroke}
        strokeWidth={0.7}
        opacity={0.32}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={innerX}
        y={innerY}
        width={innerWidth}
        height={innerHeight}
        fill="none"
        stroke={palette.pageFrameStroke}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <g opacity={0.94}>
        <rect
          x={titleX}
          y={titleY}
          width={titleWidth}
          height={titleHeight}
          fill={palette.pageTitleFill}
          stroke={palette.pageFrameStroke}
          strokeWidth={0.85}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={titleX}
          y1={titleY + 22}
          x2={titleX + titleWidth}
          y2={titleY + 22}
          stroke={palette.pageFrameStroke}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={titleX}
          y1={titleY + 42}
          x2={titleX + titleWidth}
          y2={titleY + 42}
          stroke={palette.pageFrameStroke}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={titleX + titleWidth * 0.64}
          y1={titleY + 42}
          x2={titleX + titleWidth * 0.64}
          y2={titleY + titleHeight}
          stroke={palette.pageFrameStroke}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={titleX + 8}
          y={titleY + 15}
          fill={palette.pageTitleText}
          fontSize={8.5}
          fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
        >
          {title || frame.paper || 'Imported schematic'}
        </text>
        {date ? (
          <text
            x={titleX + 8}
            y={titleY + 36}
            fill={palette.pageTitleText}
            fontSize={8}
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            Date: {date}
          </text>
        ) : null}
        <text
          x={titleX + 8}
          y={titleY + 56}
          fill={palette.pageTitleText}
          fontSize={8}
          fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
        >
          Size: {frame.paper ?? 'A4'}
        </text>
        {rev ? (
          <text
            x={titleX + titleWidth * 0.66}
            y={titleY + 56}
            fill={palette.pageTitleText}
            fontSize={8}
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            Rev: {rev}
          </text>
        ) : null}
        {titleCommentLines.map((line, index) => (
          <text
            key={`title-comment-${index}`}
            x={titleX + 8}
            y={titleY + 74 + index * 12}
            fill={palette.pageTitleText}
            fontSize={7.5}
            opacity={0.84}
            fontFamily={IMPORTED_SCHEMATIC_FONT_FAMILY}
          >
            {line}
          </text>
        ))}
      </g>
    </g>
  );
});
