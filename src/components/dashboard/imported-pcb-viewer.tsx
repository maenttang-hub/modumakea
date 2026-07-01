'use client';

import { useMemo, useState, type WheelEvent } from 'react';
import { pickLanguage } from '@/lib/ui-language';
import type {
  AppLanguage,
  ImportedPcbDocument,
  ImportedPcbGraphic,
  ImportedPcbLayerId,
  ImportedPcbPad,
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ImportedPcbZone,
} from '@/types';
import { Eye, EyeOff, Layers3, Minus, Plus, Scan } from 'lucide-react';

const DEFAULT_VISIBLE_LAYERS = new Set([
  'Edge.Cuts',
  'F.Cu',
  'B.Cu',
  'F.SilkS',
  'B.SilkS',
]);

const LAYER_COLORS: Record<string, string> = {
  'F.Cu': '#c76428',
  'B.Cu': '#2f7fa7',
  'F.SilkS': '#4b4036',
  'B.SilkS': '#76685b',
  'F.Mask': '#4f8f65',
  'B.Mask': '#3f7a58',
  'F.Paste': '#8d8074',
  'B.Paste': '#a19386',
  'F.Fab': '#7a6aa6',
  'B.Fab': '#5f6fa4',
  'F.CrtYd': '#a57019',
  'B.CrtYd': '#8b6a2d',
  'Edge.Cuts': '#3f342c',
  'Dwgs.User': '#7c8a9a',
  'Cmts.User': '#8d8074',
};

const MAX_VISIBLE_ISSUE_MARKERS = 240;
const BOARD_OUTLINE_STROKE = '#1f2937';
const BOARD_OUTLINE_HALO = '#fffdf9';
const MIN_PCB_ZOOM = 0.5;
const MAX_PCB_ZOOM = 8;

function layerColor(layer: ImportedPcbLayerId) {
  return LAYER_COLORS[layer] ?? '#94a3b8';
}

function expandPadLayers(layers: ImportedPcbLayerId[]) {
  const expanded = new Set<ImportedPcbLayerId>();
  for (const layer of layers) {
    if (layer === '*.Cu') {
      expanded.add('F.Cu');
      expanded.add('B.Cu');
      continue;
    }
    if (layer === '*.Mask') {
      expanded.add('F.Mask');
      expanded.add('B.Mask');
      continue;
    }
    expanded.add(layer);
  }
  return expanded;
}

function isPadVisible(pad: ImportedPcbPad, visibleLayers: Set<string>) {
  const layers = expandPadLayers(pad.layers);
  return Array.from(layers).some(layer => visibleLayers.has(layer));
}

function getPadColor(pad: ImportedPcbPad, visibleLayers: Set<string>) {
  const layers = Array.from(expandPadLayers(pad.layers));
  const preferred = layers.find(layer => visibleLayers.has(layer) && layer.endsWith('.Cu')) ?? layers.find(layer => visibleLayers.has(layer));
  return layerColor(preferred ?? 'F.Cu');
}

function issueToneSeverity(issue: ImportedPcbValidationIssue): ImportedPcbValidationIssue['severity'] {
  if (issue.source !== 'kicad-cli' && issue.severity === 'error') {
    return 'warning';
  }

  return issue.severity;
}

function severityColor(severity: ImportedPcbValidationIssue['severity']) {
  if (severity === 'error') {
    return '#b24f4f';
  }
  if (severity === 'warning') {
    return '#a57019';
  }
  return '#4e79ac';
}

function severityRank(severity: ImportedPcbValidationIssue['severity']) {
  if (severity === 'error') {
    return 0;
  }
  if (severity === 'warning') {
    return 1;
  }
  return 2;
}

function severityLabel(severity: ImportedPcbValidationIssue['severity'], language: AppLanguage) {
  if (language === 'en') {
    return severity;
  }
  if (severity === 'error') {
    return '오류';
  }
  if (severity === 'warning') {
    return '경고';
  }
  return '정보';
}

function issueToneLabel(issue: ImportedPcbValidationIssue, language: AppLanguage) {
  if (issue.source !== 'kicad-cli' && issue.severity === 'error') {
    return language === 'ko' ? '검토' : 'Review';
  }

  return severityLabel(issue.severity, language);
}

function issueToneColor(issue: ImportedPcbValidationIssue) {
  return severityColor(issueToneSeverity(issue));
}

function countIssuesBySource(
  validation: ImportedPcbValidationReport | null | undefined,
  source: 'kicad-cli' | 'modumake-pcb'
) {
  return validation?.issues.filter(issue => issue.source === source).length ?? 0;
}

function pathForArc(graphic: Extract<ImportedPcbGraphic, { kind: 'arc' }>) {
  const { start, mid, end } = graphic;
  const denominator =
    2 *
    (start.x * (mid.y - end.y) +
      mid.x * (end.y - start.y) +
      end.x * (start.y - mid.y));

  if (Math.abs(denominator) < 1e-9) {
    return `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
  }

  const startSq = start.x * start.x + start.y * start.y;
  const midSq = mid.x * mid.x + mid.y * mid.y;
  const endSq = end.x * end.x + end.y * end.y;
  const center = {
    x:
      (startSq * (mid.y - end.y) +
        midSq * (end.y - start.y) +
        endSq * (start.y - mid.y)) /
      denominator,
    y:
      (startSq * (end.x - mid.x) +
        midSq * (start.x - end.x) +
        endSq * (mid.x - start.x)) /
      denominator,
  };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (!Number.isFinite(radius) || radius <= 0) {
    return `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
  }

  const normalizeAngle = (angle: number) => {
    const full = Math.PI * 2;
    return ((angle % full) + full) % full;
  };
  const ccwDistance = (from: number, to: number) => normalizeAngle(to - from);
  const startAngle = normalizeAngle(Math.atan2(start.y - center.y, start.x - center.x));
  const midAngle = normalizeAngle(Math.atan2(mid.y - center.y, mid.x - center.x));
  const endAngle = normalizeAngle(Math.atan2(end.y - center.y, end.x - center.x));
  const ccwSpan = ccwDistance(startAngle, endAngle);
  const midOnCcwArc = ccwDistance(startAngle, midAngle) <= ccwSpan + 1e-7;
  const arcSpan = midOnCcwArc ? ccwSpan : ccwDistance(endAngle, startAngle);
  const largeArcFlag = arcSpan > Math.PI ? 1 : 0;
  const sweepFlag = midOnCcwArc ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

function polygonPoints(points: Array<{ x: number; y: number }>) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

type GraphicShapeVariant = 'default' | 'outline-halo' | 'outline';
type PcbViewBox = { x: number; y: number; width: number; height: number };
type PcbViewBoxState = { key: string; viewBox: PcbViewBox };

function viewBoxToString(viewBox: PcbViewBox) {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

function clampZoomViewBox(next: PcbViewBox, base: PcbViewBox) {
  const minWidth = Math.max(base.width / MAX_PCB_ZOOM, 1);
  const maxWidth = base.width / MIN_PCB_ZOOM;
  const width = Math.min(maxWidth, Math.max(minWidth, next.width));
  const height = width * (base.height / base.width);
  const centerX = next.x + next.width / 2;
  const centerY = next.y + next.height / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function zoomViewBox(current: PcbViewBox, base: PcbViewBox, factor: number, anchor?: { x: number; y: number }) {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const targetWidth = current.width / safeFactor;
  const targetHeight = current.height / safeFactor;
  const focus = anchor ?? {
    x: current.x + current.width / 2,
    y: current.y + current.height / 2,
  };
  const relativeX = (focus.x - current.x) / current.width;
  const relativeY = (focus.y - current.y) / current.height;

  return clampZoomViewBox(
    {
      x: focus.x - relativeX * targetWidth,
      y: focus.y - relativeY * targetHeight,
      width: targetWidth,
      height: targetHeight,
    },
    base
  );
}

function isBoardOutlineGraphic(graphic: ImportedPcbGraphic) {
  return graphic.layer === 'Edge.Cuts';
}

function graphicStroke(graphic: ImportedPcbGraphic, variant: GraphicShapeVariant) {
  if (variant === 'outline-halo') {
    return BOARD_OUTLINE_HALO;
  }
  if (variant === 'outline') {
    return BOARD_OUTLINE_STROKE;
  }
  return layerColor(graphic.layer);
}

function graphicStrokeWidth(graphic: ImportedPcbGraphic, variant: GraphicShapeVariant) {
  if (variant === 'outline-halo') {
    return 5;
  }
  if (variant === 'outline') {
    return 2.25;
  }
  return 'width' in graphic ? Math.max(graphic.width, 0.04) : 0.04;
}

function graphicOpacity(graphic: ImportedPcbGraphic, variant: GraphicShapeVariant) {
  if (variant !== 'default') {
    return 1;
  }
  return graphic.layer.includes('Fab') || graphic.layer.includes('CrtYd') ? 0.55 : 0.9;
}

function GraphicShape({ graphic, variant = 'default' }: { graphic: ImportedPcbGraphic; variant?: GraphicShapeVariant }) {
  const color = graphicStroke(graphic, variant);
  const strokeWidth = graphicStrokeWidth(graphic, variant);
  const opacity = graphicOpacity(graphic, variant);
  const fill = variant === 'default' && 'fill' in graphic && graphic.fill ? `${color}22` : 'none';

  switch (graphic.kind) {
    case 'line':
      return (
        <line
          x1={graphic.start.x}
          y1={graphic.start.y}
          x2={graphic.end.x}
          y2={graphic.end.y}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={opacity}
        />
      );
    case 'polyline':
      return (
        <polyline
          points={polygonPoints(graphic.points)}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={fill}
          vectorEffect="non-scaling-stroke"
          opacity={variant === 'default' ? (graphic.layer.includes('Fab') || graphic.layer.includes('CrtYd') ? 0.5 : 0.85) : opacity}
        />
      );
    case 'circle':
      return (
        <circle
          cx={graphic.center.x}
          cy={graphic.center.y}
          r={graphic.radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fill}
          vectorEffect="non-scaling-stroke"
          opacity={variant === 'default' ? (graphic.layer.includes('Fab') || graphic.layer.includes('CrtYd') ? 0.5 : 0.85) : opacity}
        />
      );
    case 'arc':
      return (
        <path
          d={pathForArc(graphic)}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
          opacity={variant === 'default' ? 0.85 : opacity}
        />
      );
    case 'text':
      return (
        <text
          x={graphic.at.x}
          y={graphic.at.y}
          transform={`rotate(${graphic.angle} ${graphic.at.x} ${graphic.at.y})`}
          fill={color}
          fontSize={Math.max(graphic.size.height, 0.6)}
          textAnchor="middle"
          dominantBaseline="middle"
          opacity={graphic.layer.includes('Fab') ? 0.55 : 0.9}
        >
          {graphic.text}
        </text>
      );
  }
}

function BoardOutlineShape({ graphic }: { graphic: ImportedPcbGraphic }) {
  return (
    <g pointerEvents="none">
      <GraphicShape graphic={graphic} variant="outline-halo" />
      <GraphicShape graphic={graphic} variant="outline" />
    </g>
  );
}

function PadShape({ pad, visibleLayers }: { pad: ImportedPcbPad; visibleLayers: Set<string> }) {
  const color = getPadColor(pad, visibleLayers);
  const x = pad.absoluteAt.x - pad.size.width / 2;
  const y = pad.absoluteAt.y - pad.size.height / 2;
  const transform = `rotate(${pad.angle} ${pad.absoluteAt.x} ${pad.absoluteAt.y})`;
  const isRound = pad.shape === 'circle' || pad.shape === 'oval';
  const radius = pad.shape === 'circle' ? Math.min(pad.size.width, pad.size.height) / 2 : undefined;

  if (pad.shape === 'circle' && radius) {
    return (
      <g>
        <circle cx={pad.absoluteAt.x} cy={pad.absoluteAt.y} r={radius} fill={`${color}d9`} stroke="#fffdfa" strokeWidth={0.08} />
        {pad.drill ? <circle cx={pad.absoluteAt.x} cy={pad.absoluteAt.y} r={pad.drill / 2} fill="#fffdfa" opacity={0.95} /> : null}
      </g>
    );
  }

  return (
    <g transform={transform}>
      <rect
        x={x}
        y={y}
        width={pad.size.width}
        height={pad.size.height}
        rx={isRound ? Math.min(pad.size.width, pad.size.height) / 2 : pad.shape === 'roundrect' ? Math.min(pad.size.width, pad.size.height) * 0.2 : 0}
        ry={isRound ? Math.min(pad.size.width, pad.size.height) / 2 : pad.shape === 'roundrect' ? Math.min(pad.size.width, pad.size.height) * 0.2 : 0}
        fill={`${color}d9`}
        stroke="#fffdfa"
        strokeWidth={0.08}
      />
      {pad.drill ? (
        <circle cx={pad.absoluteAt.x} cy={pad.absoluteAt.y} r={pad.drill / 2} fill="#fffdfa" opacity={0.95} />
      ) : null}
    </g>
  );
}

function ZoneShape({ zone }: { zone: ImportedPcbZone }) {
  const color = layerColor(zone.layer);
  const polygons = zone.filledPolygons.length > 0 ? zone.filledPolygons : zone.polygon.length >= 3 ? [zone.polygon] : [];

  return (
    <g>
      {polygons.map((points, index) => (
        <polygon
          key={`${zone.id}:${index}`}
          points={polygonPoints(points)}
          fill={`${color}18`}
          stroke={`${color}55`}
          strokeWidth={0.08}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

function LayerToggle({
  layer,
  active,
  onToggle,
}: {
  layer: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10px] font-semibold transition hover:bg-white"
      style={{
        borderColor: active ? `${layerColor(layer)}99` : '#e6dfd4',
        background: active ? `${layerColor(layer)}14` : '#fffdfa',
        color: active ? '#3f342c' : '#8d8074',
      }}
      title={layer}
      aria-label={`${layer} ${active ? '레이어 숨기기' : '레이어 보이기'}`}
      aria-pressed={active}
    >
      {active ? <Eye size={11} /> : <EyeOff size={11} />}
      <span className="truncate max-w-20">{layer}</span>
    </button>
  );
}

export function ImportedPcbViewer({
  document,
  validation,
  selectedIssueId,
  onSelectIssue,
  language = 'ko',
}: {
  document: ImportedPcbDocument;
  validation: ImportedPcbValidationReport | null;
  selectedIssueId?: string | null;
  onSelectIssue?: (issueId: string | null) => void;
  language?: AppLanguage;
}) {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const availableLayers = useMemo(() => {
    const layers = new Set(document.layers.map(layer => layer.name));
    document.footprints.forEach(footprint => {
      footprint.graphics.forEach(graphic => layers.add(graphic.layer));
      footprint.pads.forEach(pad => expandPadLayers(pad.layers).forEach(layer => layers.add(layer)));
    });
    document.drawings.forEach(graphic => layers.add(graphic.layer));
    document.segments.forEach(segment => layers.add(segment.layer));
    document.zones.forEach(zone => layers.add(zone.layer));
    return Array.from(layers).sort((a, b) => {
      const order = ['Edge.Cuts', 'F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS', 'F.Fab', 'B.Fab'];
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      }
      return a.localeCompare(b);
    });
  }, [document]);
  const [visibleLayers, setVisibleLayers] = useState(() => {
    const initial = new Set<string>();
    availableLayers.forEach(layer => {
      if (DEFAULT_VISIBLE_LAYERS.has(layer) || layer.endsWith('.Cu')) {
        initial.add(layer);
      }
    });
    return initial;
  });

  const bounds = document.bounds ?? { minX: 0, minY: 0, maxX: 100, maxY: 70 };
  const padding = Math.max(4, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08);
  const baseViewBox = useMemo(
    () => ({
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: Math.max(20, bounds.maxX - bounds.minX + padding * 2),
      height: Math.max(20, bounds.maxY - bounds.minY + padding * 2),
    }),
    [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, padding]
  );
  const baseViewBoxKey = `${baseViewBox.x}:${baseViewBox.y}:${baseViewBox.width}:${baseViewBox.height}`;
  const [activeViewBoxState, setActiveViewBoxState] = useState<PcbViewBoxState>(() => ({
    key: baseViewBoxKey,
    viewBox: baseViewBox,
  }));
  const activeViewBox = activeViewBoxState.key === baseViewBoxKey ? activeViewBoxState.viewBox : baseViewBox;
  const viewBox = viewBoxToString(activeViewBox);
  const zoomLabel = `${Math.round((baseViewBox.width / activeViewBox.width) * 100)}%`;
  const selectedIssue = validation?.issues.find(issue => issue.id === selectedIssueId) ?? null;
  const kicadDrcIssueCount = countIssuesBySource(validation, 'kicad-cli');
  const modumakePrecheckIssueCount = countIssuesBySource(validation, 'modumake-pcb');
  const hasKiCadDrc = Boolean(validation?.checks.kicadDrc || kicadDrcIssueCount > 0);
  const issueMarkerState = useMemo(() => {
    const issues = validation?.issues.filter(issue => issue.at) ?? [];
    const selectedMarker = selectedIssueId
      ? issues.find(issue => issue.id === selectedIssueId)
      : null;
    const sorted = issues.slice().sort((a, b) => {
      const severityDiff = severityRank(a.severity) - severityRank(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.id.localeCompare(b.id);
    });
    let visible = sorted.slice(0, MAX_VISIBLE_ISSUE_MARKERS);

    if (selectedMarker && !visible.some(issue => issue.id === selectedMarker.id)) {
      visible = [selectedMarker, ...visible.slice(0, MAX_VISIBLE_ISSUE_MARKERS - 1)];
    }

    return {
      visible,
      total: issues.length,
      hidden: Math.max(0, issues.length - visible.length),
    };
  }, [selectedIssueId, validation]);

  const toggleLayer = (layer: string) => {
    setVisibleLayers(current => {
      const next = new Set(current);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  };
  const setZoomViewBox = (getNextViewBox: (current: PcbViewBox) => PcbViewBox) => {
    setActiveViewBoxState(current => {
      const currentViewBox = current.key === baseViewBoxKey ? current.viewBox : baseViewBox;
      return {
        key: baseViewBoxKey,
        viewBox: getNextViewBox(currentViewBox),
      };
    });
  };
  const handleZoomIn = () => {
    setZoomViewBox(current => zoomViewBox(current, baseViewBox, 1.25));
  };
  const handleZoomOut = () => {
    setZoomViewBox(current => zoomViewBox(current, baseViewBox, 0.8));
  };
  const handleFitView = () => {
    setZoomViewBox(() => baseViewBox);
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;

    setZoomViewBox(current =>
      zoomViewBox(current, baseViewBox, factor, {
        x: current.x + xRatio * current.width,
        y: current.y + yRatio * current.height,
      })
    );
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f7f1e8]">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(#eadfcb 1px, transparent 1px), linear-gradient(90deg, #eadfcb 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <svg
        data-testid="imported-pcb-svg"
        className="relative h-full w-full touch-none"
        viewBox={viewBox}
        role="img"
        aria-label="Imported KiCad PCB"
        onWheel={handleWheel}
      >
        <rect x={bounds.minX - padding} y={bounds.minY - padding} width={bounds.maxX - bounds.minX + padding * 2} height={bounds.maxY - bounds.minY + padding * 2} fill="#fffdf9" />
        {document.zones.filter(zone => visibleLayers.has(zone.layer)).map(zone => (
          <ZoneShape key={zone.id} zone={zone} />
        ))}
        {document.drawings.filter(graphic => visibleLayers.has(graphic.layer) && !isBoardOutlineGraphic(graphic)).map(graphic => (
          <GraphicShape key={graphic.id} graphic={graphic} />
        ))}
        {document.footprints.flatMap(footprint =>
          footprint.graphics
            .filter(graphic => visibleLayers.has(graphic.layer))
            .map(graphic => <GraphicShape key={graphic.id} graphic={graphic} />)
        )}
        {document.segments.filter(segment => visibleLayers.has(segment.layer)).map(segment => (
          <line
            key={segment.id}
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke={segment.netCode === 0 ? '#b24f4f' : layerColor(segment.layer)}
            strokeWidth={Math.max(segment.width, 0.05)}
            strokeLinecap="round"
            opacity={segment.netCode === 0 ? 0.95 : 0.86}
          />
        ))}
        {document.vias.filter(via => via.layers.some(layer => visibleLayers.has(layer) || layer === '*.Cu')).map(via => (
          <g key={via.id}>
            <circle cx={via.at.x} cy={via.at.y} r={via.size / 2} fill="#a57019cc" stroke="#fffdfa" strokeWidth={0.08} />
            <circle cx={via.at.x} cy={via.at.y} r={via.drill / 2} fill="#fffdfa" />
          </g>
        ))}
        {document.footprints.flatMap(footprint =>
          footprint.pads
            .filter(pad => isPadVisible(pad, visibleLayers))
            .map(pad => <PadShape key={pad.id} pad={pad} visibleLayers={visibleLayers} />)
        )}
        {document.drawings.filter(graphic => visibleLayers.has(graphic.layer) && isBoardOutlineGraphic(graphic)).map(graphic => (
          <BoardOutlineShape key={`${graphic.id}:outline`} graphic={graphic} />
        ))}
        {issueMarkerState.visible.map(issue => (
          <g
            key={issue.id}
            role="button"
            aria-label={issue.title}
            tabIndex={0}
            onClick={() => onSelectIssue?.(issue.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectIssue?.(issue.id);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={issue.at!.x}
              cy={issue.at!.y}
              r={selectedIssueId === issue.id ? 1.7 : 1.15}
              fill="none"
              stroke={issueToneColor(issue)}
              strokeWidth={selectedIssueId === issue.id ? 0.26 : 0.18}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={issue.at!.x} cy={issue.at!.y} r={0.25} fill={issueToneColor(issue)} />
          </g>
        ))}
      </svg>

      <div
        className="absolute bottom-3 left-3 z-20 flex h-9 items-center gap-1 rounded-full border border-[#e6dfd4] bg-[#fffdfa]/95 px-1.5 text-[11px] font-semibold text-[#4e4238] shadow-sm backdrop-blur"
        aria-label={t('PCB 확대/축소', 'PCB zoom controls')}
        data-testid="imported-pcb-zoom-controls"
      >
        <button
          type="button"
          onClick={handleZoomOut}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b5d51] transition hover:bg-[#f1e7d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4e79ac]"
          title={t('축소', 'Zoom out')}
          aria-label={t('축소', 'Zoom out')}
        >
          <Minus size={14} />
        </button>
        <span className="min-w-10 text-center tabular-nums" data-testid="imported-pcb-zoom-label">
          {zoomLabel}
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b5d51] transition hover:bg-[#f1e7d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4e79ac]"
          title={t('확대', 'Zoom in')}
          aria-label={t('확대', 'Zoom in')}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={handleFitView}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b5d51] transition hover:bg-[#f1e7d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4e79ac]"
          title={t('화면 맞춤', 'Fit view')}
          aria-label={t('화면 맞춤', 'Fit view')}
        >
          <Scan size={14} />
        </button>
      </div>

      <div
        className="pointer-events-none absolute left-3 right-3 top-16 z-10 flex h-8 max-w-[calc(100%-24px)] flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        data-testid="imported-pcb-layer-controls"
      >
        <div className="pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#e6dfd4] bg-[#fffdfa]/92 px-2 text-[10px] font-semibold text-[#6b5d51] shadow-sm backdrop-blur">
          <Layers3 size={11} />
          {availableLayers.length}
        </div>
        {availableLayers.map(layer => (
          <LayerToggle
            key={layer}
            layer={layer}
            active={visibleLayers.has(layer)}
            onToggle={() => toggleLayer(layer)}
          />
        ))}
      </div>

      {validation && validation.issueCount > 0 ? (
        <div
          data-testid="imported-pcb-issue-summary"
          className={`absolute right-3 z-10 max-w-[min(360px,calc(100%-24px))] rounded-[10px] border border-[#e6dfd4] bg-[#fffdfa]/94 px-3 py-2 text-[11px] leading-5 text-[#4e4238] shadow-sm backdrop-blur ${
            selectedIssue ? 'bottom-[118px] md:bottom-3' : 'bottom-3'
          }`}
        >
          <div className="font-semibold text-[#3f342c]">
            {hasKiCadDrc
              ? language === 'ko'
                ? `KiCad DRC ${kicadDrcIssueCount}개 · 사전점검 ${modumakePrecheckIssueCount}개`
                : `${kicadDrcIssueCount} KiCad DRC · ${modumakePrecheckIssueCount} pre-checks`
              : language === 'ko'
                ? `ModuMake 사전점검 ${validation.issueCount}개 · 검토 필요`
                : `${validation.issueCount} ModuMake pre-checks · review needed`}
          </div>
          {!hasKiCadDrc ? (
            <div className="mt-0.5 text-[10px] text-[#8d8074]">
              {language === 'ko'
                ? 'KiCad 공식 DRC는 아직 실행되지 않았습니다.'
                : 'KiCad official DRC has not been run yet.'}
            </div>
          ) : null}
          {issueMarkerState.hidden > 0 ? (
            <div className="mt-0.5 text-[10px] text-[#8d8074]">
              {language === 'ko'
                ? `마커 ${issueMarkerState.visible.length}개 표시 · ${issueMarkerState.hidden}개는 목록에서 확인`
                : `${issueMarkerState.visible.length} markers shown · ${issueMarkerState.hidden} in the list`}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedIssue ? (
        <div
          data-testid="imported-pcb-selected-issue"
          className="absolute bottom-14 left-3 z-10 max-w-[min(520px,calc(100%-24px))] rounded-[10px] border bg-[#fffdfa]/94 px-3 py-2 text-[11px] leading-5 text-[#4e4238] shadow-sm backdrop-blur"
          style={{ borderColor: `${issueToneColor(selectedIssue)}66` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${issueToneColor(selectedIssue)}16`, color: issueToneColor(selectedIssue) }}>
              {issueToneLabel(selectedIssue, language)}
            </span>
            <span className="font-semibold text-[#3f342c]">{selectedIssue.title}</span>
          </div>
          <div className="mt-1">{selectedIssue.message}</div>
          {selectedIssue.at ? (
            <div className="mt-1 text-[10px] text-[#8d8074]">
              {t('위치', 'Location')}: {selectedIssue.at.x.toFixed(3)}, {selectedIssue.at.y.toFixed(3)} mm
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
