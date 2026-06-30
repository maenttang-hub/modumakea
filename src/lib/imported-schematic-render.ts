import type {
  ImportedSchematicGeometry,
  ImportedSchematicPoint,
  ImportedSchematicPrimitive,
  SensorNodeData,
  WiringMode,
} from '@/types';
import { IMPORTED_MM_TO_CANVAS } from '@/lib/imported-schematic-geometry';

type ImportedRenderData = Pick<
  SensorNodeData,
  'templateId' | 'componentName' | 'value' | 'importedReference' | 'importedMapping' | 'importedGeometry'
>;

export type ImportedSymbolFamily = 'passive' | 'power' | 'connector' | 'mcu' | 'generic';
export type ImportedTextRole = 'reference' | 'value' | 'annotation' | 'pin-name' | 'pin-number';

export function shouldUseImportedBodyFill(options: {
  family: ImportedSymbolFamily;
  pinAnchorCount: number;
}) {
  const { family, pinAnchorCount } = options;

  if (family === 'mcu') {
    return true;
  }

  if (family === 'generic' && pinAnchorCount >= 4) {
    return true;
  }

  return false;
}

const QUIET_TEMPLATE_IDS = new Set([
  'tpl_resistor',
  'tpl_capacitor',
  'tpl_led',
  'tpl_external_power',
]);

const PASSIVE_IMPORTED_KEYWORDS = [
  'diode',
  'led',
  'zener',
  'capacitor',
  'crystal',
  'resistor',
  'inductor',
];

const POWER_IMPORTED_KEYWORDS = [
  'gnd',
  'ground',
  'gndpwr',
  'pwr_flag',
  '#pwr',
  '#flg',
  'vcc',
  'vdd',
  'vin',
  '3v3',
  '5v',
  'battery',
];

const CONNECTOR_IMPORTED_KEYWORDS = [
  'connector',
  'conn_',
  'header',
  'usb',
  'jack',
  'socket',
  'terminal',
  'female',
  'male',
];

const MCU_IMPORTED_KEYWORDS = [
  'raspberry_pi',
  'atmega',
  'stm32',
  'esp32',
  'microchip',
  'mcu',
];

function buildImportedKeywordBlob(data: ImportedRenderData) {
  return [
    data.templateId,
    data.componentName,
    data.value,
    data.importedReference,
    data.importedMapping?.libraryId,
    data.importedMapping?.matchedBy,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasKeywordMatch(source: string, keywords: readonly string[]) {
  return keywords.some(keyword => source.includes(keyword));
}

function normalizeImportedTextToken(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s~\-\/]+/g, '_');
}

export function classifyImportedSymbolFamily(data: ImportedRenderData): ImportedSymbolFamily {
  if (QUIET_TEMPLATE_IDS.has(data.templateId)) {
    return data.templateId === 'tpl_external_power' ? 'power' : 'passive';
  }

  const combined = buildImportedKeywordBlob(data);

  if (hasKeywordMatch(combined, POWER_IMPORTED_KEYWORDS)) {
    return 'power';
  }

  if (hasKeywordMatch(combined, CONNECTOR_IMPORTED_KEYWORDS)) {
    return 'connector';
  }

  if (hasKeywordMatch(combined, MCU_IMPORTED_KEYWORDS)) {
    return 'mcu';
  }

  if (hasKeywordMatch(combined, PASSIVE_IMPORTED_KEYWORDS)) {
    return 'passive';
  }

  const normalizedReference = normalizeImportedTextToken(data.importedReference);
  const pinAnchorCount = data.importedGeometry?.pinAnchors.length ?? 0;
  if (pinAnchorCount > 0 && pinAnchorCount <= 3 && /^(d|c|r|l|y)\d+/.test(normalizedReference)) {
    return 'passive';
  }

  return 'generic';
}

function hasShapePrimitives(primitives: ImportedSchematicPrimitive[]) {
  return primitives.some(primitive => primitive.kind !== 'text');
}

function pointDistanceSquared(a: ImportedSchematicPoint, b: ImportedSchematicPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function hasStemNearAnchor(
  primitives: ImportedSchematicPrimitive[],
  anchor: ImportedSchematicGeometry['pinAnchors'][number]
) {
  const toleranceSq = 0.35 * 0.35;

  return primitives.some(primitive => {
    if (primitive.kind !== 'polyline' || primitive.points.length < 2) {
      return false;
    }

    const first = primitive.points[0];
    const last = primitive.points[primitive.points.length - 1];

    return (
      pointDistanceSquared(first, anchor.at) <= toleranceSq ||
      pointDistanceSquared(last, anchor.at) <= toleranceSq
    );
  });
}

function buildImportedPinStem(anchor: ImportedSchematicGeometry['pinAnchors'][number]): ImportedSchematicPrimitive {
  const radians = (anchor.angle * Math.PI) / 180;
  const inner: ImportedSchematicPoint = {
    x: Number((anchor.at.x + Math.cos(radians) * anchor.lengthMm).toFixed(3)),
    y: Number((anchor.at.y + Math.sin(radians) * anchor.lengthMm).toFixed(3)),
  };

  return {
    kind: 'polyline',
    points: [anchor.at, inner],
  };
}

function buildDerivedRectFromAnchors(
  data: ImportedRenderData,
  geometry: ImportedSchematicGeometry
): ImportedSchematicPrimitive | null {
  const anchors = geometry.pinAnchors;
  if (anchors.length === 0) {
    return null;
  }

  const innerPoints = anchors.map(anchor => {
    const radians = (anchor.angle * Math.PI) / 180;
    return {
      x: anchor.at.x + Math.cos(radians) * anchor.lengthMm,
      y: anchor.at.y + Math.sin(radians) * anchor.lengthMm,
    };
  });

  const sourcePoints = innerPoints.length > 0
    ? innerPoints
    : [
        { x: geometry.bounds.minX, y: geometry.bounds.minY },
        { x: geometry.bounds.maxX, y: geometry.bounds.maxY },
      ];

  const xs = sourcePoints.map(point => point.x);
  const ys = sourcePoints.map(point => point.y);
  const minX = Math.min(...xs, geometry.bounds.minX);
  const maxX = Math.max(...xs, geometry.bounds.maxX);
  const minY = Math.min(...ys, geometry.bounds.minY);
  const maxY = Math.max(...ys, geometry.bounds.maxY);
  const family = classifyImportedSymbolFamily(data);
  const padX = family === 'connector' ? 1.1 : family === 'mcu' ? 1.8 : 1.3;
  const padY = family === 'connector' ? 1.25 : family === 'mcu' ? 1.8 : 1.3;

  return {
    kind: 'rect',
    start: { x: minX - padX, y: minY - padY },
    end: { x: maxX + padX, y: maxY + padY },
  };
}

function buildDerivedRectFromBounds(geometry: ImportedSchematicGeometry): ImportedSchematicPrimitive | null {
  const width = geometry.bounds.maxX - geometry.bounds.minX;
  const height = geometry.bounds.maxY - geometry.bounds.minY;

  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return {
    kind: 'rect',
    start: { x: geometry.bounds.minX, y: geometry.bounds.minY },
    end: { x: geometry.bounds.maxX, y: geometry.bounds.maxY },
  };
}

function shouldDropLegacyTextPrimitive(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>,
  data: ImportedRenderData,
  geometry: ImportedSchematicGeometry
) {
  const family = classifyImportedSymbolFamily(data);
  const quietFamilies = family === 'passive' || family === 'power';
  if (!quietFamilies) {
    return false;
  }

  if (primitive.role === 'pin-name' || primitive.role === 'pin-number') {
    return true;
  }

  if (primitive.role === 'annotation') {
    const tokens = new Set(
      geometry.pinAnchors.flatMap(anchor => [
        normalizeImportedTextToken(anchor.label),
        normalizeImportedTextToken(anchor.number),
      ])
    );
    return tokens.has(normalizeImportedTextToken(primitive.text));
  }

  return false;
}

export function normalizeImportedGeometryForRender(
  data: ImportedRenderData
): ImportedSchematicGeometry | null {
  const geometry = data.importedGeometry;
  if (!geometry) {
    return null;
  }

  const filteredPrimitives = geometry.primitives.filter(primitive => {
    if (primitive.kind !== 'text') {
      return true;
    }
    return !shouldDropLegacyTextPrimitive(primitive, data, geometry);
  });

  const family = classifyImportedSymbolFamily(data);
  const shouldBackfillPinStems =
    geometry.renderSource !== 'primitive' || family === 'generic';
  const supplementalPinStems = shouldBackfillPinStems
    ? geometry.pinAnchors
        .filter(anchor => !hasStemNearAnchor(filteredPrimitives, anchor))
        .map(buildImportedPinStem)
    : [];

  if (hasShapePrimitives(filteredPrimitives)) {
    return {
      ...geometry,
      primitives: [...filteredPrimitives, ...supplementalPinStems],
    };
  }

  const pinStems = geometry.pinAnchors.map(buildImportedPinStem);
  const derivedRect = buildDerivedRectFromAnchors(data, geometry);
  const boundsRect = buildDerivedRectFromBounds(geometry);

  if (!derivedRect && !boundsRect && pinStems.length === 0) {
    return {
      ...geometry,
      primitives: filteredPrimitives,
    };
  }

  return {
    ...geometry,
    primitives: [
      ...((derivedRect ?? boundsRect) ? [derivedRect ?? boundsRect!] : []),
      ...pinStems,
      ...filteredPrimitives,
    ],
  };
}

export function shouldUseQuietImportedOverlay(data: ImportedRenderData) {
  if (data.importedGeometry?.renderSource !== 'primitive') {
    return false;
  }

  return classifyImportedSymbolFamily(data) !== 'generic';
}

export const IMPORTED_SCHEMATIC_FONT_FAMILY =
  '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", Arial, sans-serif';

export function getImportedTextFontSizePx(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>
) {
  const base = primitive.sizeMm * IMPORTED_MM_TO_CANVAS;

  if (primitive.role === 'pin-number') {
    return Math.max(base * 0.76, 3.05);
  }

  if (primitive.role === 'pin-name') {
    return Math.max(base * 0.8, 3.2);
  }

  if (primitive.role === 'reference' || primitive.role === 'value') {
    return Math.max(base * 0.92, 5.35);
  }

  return Math.max(base * 0.92, 5.15);
}

export function getImportedPinLabelDisplay(options: {
  label: string;
  pinAnchorCount: number;
  sideIndex: number;
  highlighted?: boolean;
}) {
  const { label, pinAnchorCount, sideIndex, highlighted = false } = options;
  const trimmed = label.trim();

  if (!trimmed) {
    return null;
  }

  if (!highlighted) {
    if (pinAnchorCount >= 24 && sideIndex % 4 !== 0) {
      return null;
    }

    if (pinAnchorCount >= 16 && sideIndex % 2 !== 0) {
      return null;
    }

    if (pinAnchorCount >= 10 && sideIndex > 1 && sideIndex % 2 !== 0) {
      return null;
    }
  }

  const maxLength = pinAnchorCount >= 16 ? 7 : pinAnchorCount >= 10 ? 9 : 14;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export function isLowPriorityImportedPinText(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>
) {
  if (primitive.role === 'pin-number') {
    return true;
  }

  if (primitive.role !== 'pin-name') {
    return false;
  }

  const token = primitive.text.trim().toUpperCase().replace(/\s+/g, '');
  if (!token) {
    return true;
  }

  return (
    /^\d+$/.test(token) ||
    /^(?:P[A-Z]\d+|A\d+|D\d+)$/.test(token) ||
    token === 'AREF' ||
    isPowerLikeImportedText(token) ||
    /\/P[A-Z]\d+/.test(token)
  );
}

function normalizeImportedPowerText(value?: string) {
  return value?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
}

export function isPowerLikeImportedText(value?: string) {
  const token = normalizeImportedPowerText(value);
  if (!token) {
    return false;
  }

  return (
    /^(?:AGND|DGND|GND|GNDPWR|PGND|VSS)$/.test(token) ||
    /^(?:AVCC|VCC|VDD|VDDA|VDDD|VSYS|VIN|VBAT|VBUS)$/.test(token) ||
    /^\+?(?:1V8|2V5|3V|3V3|3\.3V|5V|9V|12V|24V)$/.test(token) ||
    token === 'PWR_FLAG'
  );
}

export type ImportedNetLabelKind = 'power' | 'ground' | 'signal';

export function classifyImportedNetLabel(text: string): ImportedNetLabelKind {
  const normalized = text.trim().toUpperCase();
  if (['GND', 'GNDPWR', 'AGND', 'DGND', 'PGND', 'VSS'].includes(normalized)) {
    return 'ground';
  }
  if (isPowerLikeImportedText(text)) {
    return 'power';
  }
  return 'signal';
}

function getImportedNetLabelOffset(
  angle: 0 | 90 | 180 | 270,
  kind: ImportedNetLabelKind
) {
  if (kind !== 'signal') {
    return { x: 0, y: 0 };
  }

  const offset = 2.8;

  if (angle === 90) {
    return { x: offset, y: 0 };
  }

  if (angle === 270) {
    return { x: -offset, y: 0 };
  }

  if (angle === 180) {
    return { x: -1.6, y: -offset };
  }

  return { x: 1.6, y: -offset };
}

export function getImportedNetLabelDisplay(options: {
  text: string;
  at: ImportedSchematicPoint;
  angle?: 0 | 90 | 180 | 270;
  textAnchor?: 'start' | 'middle' | 'end';
  baseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  side?: 'left' | 'right';
}) {
  const angle = options.angle ?? 0;
  const kind = classifyImportedNetLabel(options.text);
  const offset = getImportedNetLabelOffset(angle, kind);
  const x = Number((options.at.x + offset.x).toFixed(3));
  const y = Number((options.at.y + offset.y).toFixed(3));

  if (kind !== 'signal') {
    return {
      kind,
      x,
      y,
      angle: getImportedTextDisplayAngle(angle, 'annotation', {
        preserveNativeOrientation: true,
        text: options.text,
      }),
      textAnchor: options.textAnchor ?? getImportedTextDisplayAnchor(angle, 'annotation'),
      baseline: options.baseline ?? getImportedTextDisplayBaseline(angle, 'annotation'),
      background: true,
    };
  }

  return {
    kind,
    x,
    y,
    angle: getImportedTextDisplayAngle(angle, 'annotation', {
      preserveNativeOrientation: true,
      text: options.text,
    }),
    textAnchor: options.textAnchor ?? getImportedTextDisplayAnchor(angle, 'annotation'),
    baseline: options.baseline ?? getImportedTextDisplayBaseline(angle, 'annotation'),
    background: false,
  };
}

export function getImportedTextOverviewOpacity(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>
) {
  if (primitive.role === 'pin-number') {
    return 0.18;
  }

  if (primitive.role === 'pin-name') {
    return isLowPriorityImportedPinText(primitive) ? 0.24 : 0.68;
  }

  if (primitive.role === 'annotation') {
    return 0.66;
  }

  return 0.92;
}

export function measureImportedTextPrimitiveBox(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>
) {
  const fontSizePx = getImportedTextFontSizePx(primitive);
  const sourceAngle = primitive.originalAngle ?? primitive.angle;
  const displayAngle = getImportedTextDisplayAngle(sourceAngle, primitive.role, {
    preserveNativeOrientation: primitive.preserveNativeOrientation,
    text: primitive.text,
  });
  const readableOffset = getImportedReadableTextOffset(primitive, fontSizePx);
  const at = {
    x: primitive.at.x + readableOffset.x,
    y: primitive.at.y + readableOffset.y,
  };
  const charWidthPx = Math.max(fontSizePx * 0.49, 3.7);
  const lines = primitive.text.split('\n');
  const longestLineLength = Math.max(...lines.map(line => line.length), 1);
  const textWidth = Math.max(longestLineLength * charWidthPx, charWidthPx);
  const textHeight = Math.max(fontSizePx * Math.max(lines.length * 1.12, 1.05), fontSizePx);
  const halfWidth = textWidth / 2;
  const halfHeight = textHeight / 2;

  if (displayAngle === 90 || displayAngle === 270) {
    return {
      x: at.x - halfHeight,
      y: at.y - halfWidth,
      width: textHeight,
      height: textWidth,
    };
  }

  return {
    x: at.x - halfWidth,
    y: at.y - halfHeight,
    width: textWidth,
    height: textHeight,
  };
}

export function shouldShowImportedFallbackBadge(data: ImportedRenderData) {
  const isFallbackLike =
    data.importedMapping?.source === 'custom-fallback' ||
    data.importedMapping?.confidence === 'low';

  if (!isFallbackLike) {
    return false;
  }

  const family = classifyImportedSymbolFamily(data);
  const primitives = data.importedGeometry?.primitives ?? [];
  const hasNativeShape = hasShapePrimitives(primitives);
  const pinAnchorCount = data.importedGeometry?.pinAnchors.length ?? 0;

  if (family === 'power') {
    return !hasNativeShape && pinAnchorCount === 0;
  }

  if (family === 'connector') {
    return !hasNativeShape && pinAnchorCount <= 2;
  }

  if (family === 'passive') {
    return !hasNativeShape;
  }

  return true;
}

export function hasNativeImportedText(data: ImportedRenderData) {
  return Boolean(data.importedGeometry?.primitives.some(primitive => primitive.kind === 'text'));
}

export function getImportedTextDisplayAngle(
  angle: 0 | 90 | 180 | 270,
  role?: ImportedTextRole,
  options?: { preserveNativeOrientation?: boolean; text?: string }
) {
  if (options?.preserveNativeOrientation) {
    return angle;
  }

  if (role === 'pin-name' || role === 'pin-number') {
    if (angle === 90 || angle === 270) {
      return 90;
    }
    return 0;
  }

  if (role === 'reference' || role === 'value' || role === 'annotation') {
    if (isPowerLikeImportedText(options?.text)) {
      return 0;
    }

    if (role === 'reference' || role === 'value') {
      if (angle === 90 || angle === 180 || angle === 270) {
        return 0;
      }

      return angle;
    }

    const compactText = options?.text?.replace(/\s+/g, '') ?? '';
    if ((angle === 90 || angle === 270) && compactText.length >= 5) {
      return 0;
    }
    if (angle === 180) {
      return 0;
    }

    if (angle === 270) {
      return 90;
    }

    return angle;
  }

  if (angle === 180 || angle === 270) {
    return 0;
  }

  return angle;
}

export function shouldFlattenImportedTextForReadability(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>
) {
  const sourceAngle = primitive.originalAngle ?? primitive.angle;
  const displayAngle = getImportedTextDisplayAngle(sourceAngle, primitive.role, {
    preserveNativeOrientation: primitive.preserveNativeOrientation,
    text: primitive.text,
  });

  return (
    (sourceAngle === 90 || sourceAngle === 270) &&
    displayAngle === 0 &&
    primitive.role !== 'pin-name' &&
    primitive.role !== 'pin-number'
  );
}

export function getImportedReadableTextOffset(
  primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>,
  fontSizePx: number
) {
  if (!shouldFlattenImportedTextForReadability(primitive)) {
    return { x: 0, y: 0 };
  }

  if (isPowerLikeImportedText(primitive.text)) {
    return { x: 0, y: 0 };
  }

  return {
    x: 0,
    y: -Math.max(fontSizePx * 1.15, 5.5),
  };
}

export function getImportedTextDisplayAnchor(
  angle: 0 | 90 | 180 | 270,
  role?: ImportedTextRole
) {
  if (role === 'pin-name' || role === 'pin-number') {
    if (role === 'pin-number') {
      if (angle === 180) return 'start' as const;
      if (angle === 0) return 'end' as const;
    } else {
      if (angle === 180) return 'end' as const;
      if (angle === 0) return 'start' as const;
    }
    return 'middle' as const;
  }

  if (angle === 180) {
    return 'end' as const;
  }

  return 'start' as const;
}

export function getImportedTextDisplayBaseline(
  angle: 0 | 90 | 180 | 270,
  role?: ImportedTextRole
) {
  if (role === 'pin-name' || role === 'pin-number') {
    if (angle === 90) return 'ideographic' as const;
    if (angle === 270) return 'hanging' as const;
    return 'middle' as const;
  }

  if (angle === 90) return 'ideographic' as const;
  if (angle === 270) return 'hanging' as const;
  return 'middle' as const;
}

export function shouldPreferNativeImportedLabels(
  data: ImportedRenderData,
  options?: { hasNativeText?: boolean }
) {
  const family = classifyImportedSymbolFamily(data);
  const hasNativeText = options?.hasNativeText ?? hasNativeImportedText(data);

  if (family === 'power') {
    return true;
  }

  if (!hasNativeText) {
    return false;
  }

  return family === 'connector' || family === 'mcu' || family === 'passive';
}

export function resolveImportedOverlayVisibility(options: {
  usesFallbackGraphics: boolean;
  quietOverlayMode: boolean;
  hasNativeText: boolean;
  preferNativeLabels?: boolean;
  selected: boolean;
  hovered: boolean;
  isHighlighted: boolean;
  wiringMode: WiringMode;
}) {
  const {
    usesFallbackGraphics,
    quietOverlayMode,
    hasNativeText,
    preferNativeLabels = false,
    selected,
    hovered,
    isHighlighted,
    wiringMode,
  } = options;

  if (usesFallbackGraphics) {
    return {
      showPinLabels: true,
      showFallbackLabels: true,
      showInteractionOutline: selected || hovered || isHighlighted,
    };
  }

  if (quietOverlayMode || hasNativeText) {
    return {
      showPinLabels: selected || isHighlighted || wiringMode === 'manual',
      showFallbackLabels: preferNativeLabels ? false : selected || isHighlighted,
      showInteractionOutline: selected || isHighlighted,
    };
  }

  return {
    showPinLabels: selected || hovered || isHighlighted,
    showFallbackLabels: selected || hovered || isHighlighted,
    showInteractionOutline: selected || hovered || isHighlighted,
  };
}

export function shouldRenderImportedPrimitive(
  data: ImportedRenderData,
  primitive: ImportedSchematicPrimitive
) {
  if (primitive.kind !== 'text') {
    return true;
  }

  const family = classifyImportedSymbolFamily(data);

  if (primitive.role === 'annotation') {
    return true;
  }

  if (primitive.role === 'pin-number') {
    return family === 'generic' || family === 'mcu' || family === 'connector';
  }

  if (primitive.role === 'pin-name') {
    return family === 'generic' || family === 'mcu' || family === 'connector';
  }

  if (family === 'power' && primitive.role !== 'reference' && primitive.role !== 'value' && primitive.role !== 'annotation') {
    return false;
  }

  if (family === 'passive' && primitive.role !== 'reference' && primitive.role !== 'value' && primitive.role !== 'annotation') {
    return false;
  }

  return true;
}
