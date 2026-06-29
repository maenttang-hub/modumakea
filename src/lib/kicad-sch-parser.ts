/**
 * Legacy KiCad importer for the old ModuMake canvas document model.
 *
 * Important:
 * - This module exists to turn `.kicad_sch` into `ModuMakeProjectData`
 *   for the legacy No-Code / canvas editing flow.
 * - It is NOT the source of truth for the v3 validation pipeline.
 * - New validation / AI review work should use `@/lib/parse-kicad-for-validation`
 *   and the `src/lib/v3-kicad-parser/` pipeline instead.
 */

import kicadMapper from '../constants/kicad-mapper.json' with { type: 'json' };
import { STATIC_COMPONENT_TEMPLATES, enrichComponentTemplate, getStaticTemplateById } from '@/constants/component-templates';
import { getBoardById, type BoardDefinition } from '@/constants/boards';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import { kicadSymbolToCustomComponentPackage, type ParsedKiCadSymbol } from '@/lib/kicad-sym-parser';
import { canonicalizeJoinableNetLabel } from '@/lib/net-label-utils';
import {
  childForms,
  collectNestedForms,
  isSExprList,
  parseKiCadSExpression,
  stringAt,
  type SExprNode,
} from '@/lib/s-expr-parser';
import {
  IMPORTED_MM_TO_CANVAS,
  layoutImportedGeometry,
  measureImportedGeometry,
} from '@/lib/imported-schematic-geometry';
import { resolveKiCadTemplate } from '@/lib/resolve-kicad-template';
import { sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';
import { createProjectDocument } from '@/store/project-document';
import { buildDefaultProjectState } from '@/store/store-defaults';
import { PROJECT_FILE_VERSION } from '@/store/store-config';
import {
  classifyImportedSymbolFamily,
  getImportedTextDisplayAngle,
  getImportedTextDisplayAnchor,
  getImportedTextDisplayBaseline,
  normalizeImportedGeometryForRender,
} from '@/lib/imported-schematic-render';
import type {
  ComponentTemplate,
  CustomComponentPackage,
  ImportedKiCadMapping,
  KiCadMappingConfidence,
  ImportedSchematicGeometry,
  ImportedSchematicPoint,
  ImportedSchematicPrimitive,
  ImportedSchematicPinAnchor,
  ImportedSchematicSceneSymbol,
  ImportedSchematicScene,
  ManualNetConnection,
  ModuMakeProjectData,
  PlacedComponent,
} from '@/types';

type KiCadComponentMapping = {
  kicadLibrary: string;
  kicadSymbol: string;
  pinMap: Record<string, string>;
};

type KiCadMappingDictionary = {
  boards: Record<string, KiCadComponentMapping>;
  templates: Record<string, KiCadComponentMapping>;
};

type ParsedLibraryPin = {
  number: string;
  name: string;
  electricalType: string;
  hidden: boolean;
  lengthMm: number;
  nameSizeMm: number;
  numberSizeMm: number;
  nameJustify?: {
    horizontal: 'left' | 'right' | 'center';
    vertical: 'top' | 'bottom' | 'center';
  };
  numberJustify?: {
    horizontal: 'left' | 'right' | 'center';
    vertical: 'top' | 'bottom' | 'center';
  };
  nameTextAnchor?: 'start' | 'middle' | 'end';
  nameBaseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  numberTextAnchor?: 'start' | 'middle' | 'end';
  numberBaseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  at: { x: number; y: number; angle: number };
};

type ParsedLibrarySymbol = {
  libraryId: string;
  extendsId?: string;
  displayName: string;
  referencePrefix: string;
  footprint?: string;
  isPowerSymbol: boolean;
  hidePinNumbers: boolean;
  pinNamesHide: boolean;
  pinNamesOffsetMm?: number;
  bodyBoundsMm: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  bodyWidthMm: number;
  bodyHeightMm: number;
  pins: ParsedLibraryPin[];
  graphics: ImportedSchematicPrimitive[];
  variants: ParsedLibrarySymbolVariant[];
};

type ParsedLibrarySymbolVariant = {
  sourceName: string;
  unit: number | null;
  bodyStyle: number | null;
  isPowerSymbol: boolean;
  hidePinNumbers: boolean;
  pinNamesHide: boolean;
  pinNamesOffsetMm?: number;
  pins: ParsedLibraryPin[];
  graphics: ImportedSchematicPrimitive[];
};

function unprefixedLibrarySymbolName(libraryId: string) {
  return libraryId.includes(':') ? libraryId.split(':').pop() ?? libraryId : libraryId;
}

type ParsedSchematicInstance = {
  uuid: string;
  libraryId: string;
  unit: number;
  bodyStyle: number;
  at: {
    x: number;
    y: number;
    rotation: 0 | 90 | 180 | 270;
    mirrorX: boolean;
    mirrorY: boolean;
  };
  reference: string;
  value: string;
  footprint?: string;
  referenceAt?: { x: number; y: number; rotation: 0 | 90 | 180 | 270 };
  valueAt?: { x: number; y: number; rotation: 0 | 90 | 180 | 270 };
  referenceSizeMm?: number;
  valueSizeMm?: number;
  referenceTextAnchor?: 'start' | 'middle' | 'end';
  referenceBaseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  valueTextAnchor?: 'start' | 'middle' | 'end';
  valueBaseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  referenceAlignmentExplicit?: boolean;
  valueAlignmentExplicit?: boolean;
};

type Point = { x: number; y: number };

type ParsedPageFrame = {
  start: Point;
  end: Point;
  paper?: string;
  titleBlock?: {
    title?: string;
    date?: string;
    rev?: string;
    company?: string;
    comments: string[];
  };
};

type Endpoint =
  | { ownerType: 'board'; ownerId: string; pinId: string }
  | { ownerType: 'component'; ownerId: string; pinId: string };

type SymbolResolution =
  | {
      kind: 'board';
      boardId: string;
      librarySymbol: ParsedLibrarySymbol;
      board: BoardDefinition;
      pinNumberToId: Map<string, string>;
    }
  | {
      kind: 'template';
      templateId: string;
      template: ComponentTemplate;
      librarySymbol: ParsedLibrarySymbol;
      pinNumberToId: Map<string, string>;
      importedMapping: ImportedKiCadMapping;
    }
  | {
      kind: 'custom';
      templateId: string;
      template: ComponentTemplate;
      customPackage: CustomComponentPackage;
      librarySymbol: ParsedLibrarySymbol;
      pinNumberToId: Map<string, string>;
      importedMapping: ImportedKiCadMapping;
    };

export interface KiCadImportSummary {
  boardId: string;
  importedComponentCount: number;
  importedConnectionCount: number;
  generatedCustomComponentCount: number;
  fallbackComponentCount: number;
  lowConfidenceComponentCount: number;
}

export interface KiCadSchematicImportResult {
  document: ModuMakeProjectData;
  summary: KiCadImportSummary;
}

const MM_TO_CANVAS = IMPORTED_MM_TO_CANVAS;
const mappingDictionary = kicadMapper as KiCadMappingDictionary;
const POINT_KEY_PRECISION = 6;
const POINT_SNAP_TOLERANCE_MM = 0.05;

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pointKey(point: Point) {
  return `${point.x.toFixed(POINT_KEY_PRECISION)}:${point.y.toFixed(POINT_KEY_PRECISION)}`;
}

function snapBucketIndex(value: number, toleranceMm = POINT_SNAP_TOLERANCE_MM) {
  if (!(toleranceMm > 0)) {
    return Math.round(value * 1000);
  }
  return Math.floor(value / toleranceMm);
}

function buildResolutionCacheKey(instance: ParsedSchematicInstance) {
  return [
    instance.libraryId,
    `unit:${instance.unit}`,
    `body:${instance.bodyStyle}`,
    instance.reference.replace(/\d+/g, ''),
    instance.value,
    instance.footprint ?? '',
  ].join('::');
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rounded = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (rounded === 90 || rounded === 180 || rounded === 270) {
    return rounded;
  }
  return 0;
}

function toCanvasRotation(rotation: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return normalizeRotation(360 - rotation);
}

function rotatePoint(point: Point, rotation: 0 | 90 | 180 | 270): Point {
  switch (rotation) {
    case 90:
      return { x: -point.y, y: point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: point.y, y: -point.x };
    default:
      return point;
  }
}

function unrotatePoint(point: Point, rotation: 0 | 90 | 180 | 270): Point {
  switch (rotation) {
    case 90:
      return { x: point.y, y: -point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: -point.y, y: point.x };
    default:
      return point;
  }
}

function mirrorPoint(point: Point, mirrorX: boolean, mirrorY: boolean): Point {
  return {
    x: mirrorY ? -point.x : point.x,
    y: mirrorX ? -point.y : point.y,
  };
}

function mirrorRotation(
  rotation: 0 | 90 | 180 | 270,
  mirrorX: boolean,
  mirrorY: boolean
): 0 | 90 | 180 | 270 {
  let next = rotation;

  if (mirrorX) {
    next = (((360 - next) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
  }

  if (mirrorY) {
    next = (((180 - next) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
  }

  return next;
}

function mirrorTextAlignment(
  textAnchor: 'start' | 'middle' | 'end' | undefined,
  baseline: 'auto' | 'middle' | 'hanging' | 'ideographic' | undefined,
  mirrorX: boolean,
  mirrorY: boolean
) {
  let nextTextAnchor = textAnchor;
  let nextBaseline = baseline;

  if (mirrorY) {
    nextTextAnchor =
      textAnchor === 'start'
        ? 'end'
        : textAnchor === 'end'
          ? 'start'
          : textAnchor;
  }

  if (mirrorX) {
    nextBaseline =
      baseline === 'hanging'
        ? 'ideographic'
        : baseline === 'ideographic'
          ? 'hanging'
          : baseline;
  }

  return {
    textAnchor: nextTextAnchor,
    baseline: nextBaseline,
  };
}

function parseAtNode(node: SExprNode[] | undefined) {
  return {
    x: toNumber(stringAt(node, 1, '0')),
    y: toNumber(stringAt(node, 2, '0')),
    angle: toNumber(stringAt(node, 3, '0')),
  };
}

function parseTextSizeMm(node: SExprNode[] | undefined) {
  if (!node) {
    return 1.27;
  }
  const effectsNode = childForms(node, 'effects')[0];
  const fontNode = childForms(effectsNode ?? [], 'font')[0];
  const sizeNode = childForms(fontNode ?? [], 'size')[0];
  const width = toNumber(stringAt(sizeNode, 1, '1.27'), 1.27);
  const height = toNumber(stringAt(sizeNode, 2, String(width)), width);
  return Math.max(width, height, 1);
}

function parseEffectsJustify(effectsNode: SExprNode[] | undefined) {
  const justifyNode = childForms(effectsNode ?? [], 'justify')[0];
  const tokens = justifyNode
    ? justifyNode
        .slice(1)
        .filter((token): token is string => typeof token === 'string')
        .map(token => token.toLowerCase())
    : [];

  return {
    horizontal: tokens.includes('left')
      ? 'left' as const
      : tokens.includes('right')
        ? 'right' as const
        : 'center' as const,
    vertical: tokens.includes('top')
      ? 'top' as const
      : tokens.includes('bottom')
        ? 'bottom' as const
        : 'center' as const,
  };
}

function mapJustifyToTextAlignment(justify: ReturnType<typeof parseEffectsJustify>) {
  return {
    textAnchor:
      justify.horizontal === 'left'
        ? 'start' as const
        : justify.horizontal === 'right'
          ? 'end' as const
          : 'middle' as const,
    baseline:
      justify.vertical === 'top'
        ? 'hanging' as const
        : justify.vertical === 'bottom'
          ? 'ideographic' as const
          : 'middle' as const,
  };
}

function parseTextJustify(node: SExprNode[] | undefined) {
  const effectsNode = childForms(node ?? [], 'effects')[0];
  const explicit = Boolean(childForms(effectsNode ?? [], 'justify')[0]);
  const justify = parseEffectsJustify(effectsNode);
  const alignment = mapJustifyToTextAlignment(justify);

  return {
    textAnchor: alignment.textAnchor,
    baseline: alignment.baseline,
    explicit,
  } as const;
}

function parseSymbolDisplaySettings(node: SExprNode[]) {
  const pinNumbersNode = childForms(node, 'pin_numbers')[0];
  const pinNamesNode = childForms(node, 'pin_names')[0];

  const hidePinNumbers = Boolean(
    pinNumbersNode &&
      pinNumbersNode
        .slice(1)
        .some(token => typeof token === 'string' && token.toLowerCase() === 'hide')
  );

  const pinNamesHide = Boolean(
    pinNamesNode &&
      pinNamesNode
        .slice(1)
        .some(token => typeof token === 'string' && token.toLowerCase() === 'hide')
  );

  const pinNameOffsetNode = childForms(pinNamesNode ?? [], 'offset')[0];
  const pinNamesOffsetMm = pinNameOffsetNode
    ? toNumber(stringAt(pinNameOffsetNode, 1, '0.508'), 0.508)
    : undefined;

  return {
    isPowerSymbol: childForms(node, 'power').length > 0,
    hidePinNumbers,
    pinNamesHide,
    pinNamesOffsetMm,
  } as const;
}

function getPrimitivePoints(primitive: ImportedSchematicPrimitive): Point[] {
  switch (primitive.kind) {
    case 'rect':
      return [
        primitive.start,
        primitive.end,
        { x: primitive.start.x, y: primitive.end.y },
        { x: primitive.end.x, y: primitive.start.y },
      ];
    case 'polyline':
      return primitive.points;
    case 'circle':
      return [
        { x: primitive.center.x - primitive.radius, y: primitive.center.y - primitive.radius },
        { x: primitive.center.x + primitive.radius, y: primitive.center.y + primitive.radius },
      ];
    case 'arc':
      return [primitive.start, primitive.mid, primitive.end];
    case 'text': {
      const charWidthMm = Math.max(primitive.sizeMm * 0.65, 0.8);
      const widthMm = Math.max(primitive.text.length * charWidthMm, primitive.sizeMm * 2);
      const heightMm = Math.max(primitive.sizeMm * 1.4, 1.27);
      return [
        { x: primitive.at.x - widthMm / 2, y: primitive.at.y - heightMm },
        { x: primitive.at.x + widthMm / 2, y: primitive.at.y + heightMm / 2 },
      ];
    }
    default:
      return [];
  }
}

function reversePinMap(pinMap: Record<string, string>) {
  const reversed = new Map<string, string>();
  for (const [pinId, pinNumber] of Object.entries(pinMap)) {
    reversed.set(pinNumber, pinId);
  }
  return reversed;
}

function buildLibraryId(mapping: KiCadComponentMapping) {
  return `${mapping.kicadLibrary}:${mapping.kicadSymbol}`;
}

function buildTemplateResolutionIndex() {
  const byLibraryId = new Map<string, string[]>();
  for (const template of STATIC_COMPONENT_TEMPLATES) {
    const mapping = mappingDictionary.templates[template.id];
    if (!mapping) {
      continue;
    }
    const libraryId = buildLibraryId(mapping);
    const bucket = byLibraryId.get(libraryId) ?? [];
    bucket.push(template.id);
    byLibraryId.set(libraryId, bucket);
  }
  return byLibraryId;
}

const BOARD_LIBRARY_INDEX = new Map(
  Object.entries(mappingDictionary.boards).map(([boardId, mapping]) => [buildLibraryId(mapping), boardId])
);
const TEMPLATE_LIBRARY_INDEX = buildTemplateResolutionIndex();

function templatePinsMatchSymbol(template: ComponentTemplate, symbol: ParsedLibrarySymbol) {
  const templatePins = [...template.requiredPins.map(pin => pin.name)].sort();
  const symbolPins = [...symbol.pins.map(pin => pin.name)].sort();

  if (templatePins.length !== symbolPins.length) {
    return false;
  }

  return templatePins.every((pinName, index) => pinName === symbolPins[index]);
}

function buildTemplatePinNumberToId(templateId: string, symbol: ParsedLibrarySymbol) {
  const mapped = reversePinMap(mappingDictionary.templates[templateId]?.pinMap ?? {});
  const template = getStaticTemplateById(templateId);
  const byName = new Map<string, string>();
  if (template) {
    for (const symbolPin of symbol.pins) {
      const templatePin = template.requiredPins.find(
        pin => pin.name.toLowerCase() === symbolPin.name.toLowerCase()
      );
      if (templatePin) {
        byName.set(symbolPin.number, templatePin.name);
      }
    }
  }

  const relevantPins = symbol.pins.filter(pin => {
    const normalizedName = pin.name.trim().toLowerCase();
    return normalizedName !== '' && normalizedName !== 'nc' && normalizedName !== 'n/c';
  });

  if (relevantPins.length > 0 && byName.size === relevantPins.length) {
    return byName;
  }

  if (
    relevantPins.length > 0 &&
    mapped.size === relevantPins.length &&
    [...mapped.keys()].every(number => symbol.pins.some(pin => pin.number === number))
  ) {
    return mapped;
  }

  if (symbol.pins.length > 0 && mapped.size === symbol.pins.length) {
    return mapped;
  }

  if (byName.size > 0) {
    return byName;
  }

  if (mapped.size > 0 && relevantPins.length > 0) {
    return mapped;
  }

  return new Map(
    symbol.pins.map(pin => [pin.number, pin.name.trim() || pin.number])
  );
}

function collectDirectAndNestedForms(node: SExprNode[], nestedScopes: SExprNode[][], name: string) {
  return [
    ...childForms(node, name),
    ...nestedScopes.flatMap(scope => collectNestedForms(scope, name)),
  ];
}

function normalizeLibraryLocalPoint(point: Point): Point {
  return mirrorPoint(point, true, false);
}

function normalizeLibraryLocalAngle(angle: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return mirrorRotation(angle, true, false);
}

function normalizeLibraryLocalTextAlignment(
  textAnchor: 'start' | 'middle' | 'end' | undefined,
  baseline: 'auto' | 'middle' | 'hanging' | 'ideographic' | undefined,
) {
  return mirrorTextAlignment(textAnchor, baseline, true, false);
}

function withKiCadDefaultTextAlignment(
  textAnchor: 'start' | 'middle' | 'end' | undefined,
  baseline: 'auto' | 'middle' | 'hanging' | 'ideographic' | undefined,
) {
  return {
    textAnchor: textAnchor ?? 'middle',
    baseline: baseline ?? 'middle',
  } as const;
}

function parseLibraryPins(pinNodes: SExprNode[][]) {
  return pinNodes.flatMap(pinNode => {
    const nameNode = childForms(pinNode, 'name')[0];
    const numberNode = childForms(pinNode, 'number')[0];
    const name = sanitizePlainText(stringAt(nameNode, 1, ''), { maxLength: 80, fallback: '' });
    const number = stringAt(numberNode, 1);
    if (!number) {
      return [];
    }

    const nameJustify = parseEffectsJustify(childForms(nameNode ?? [], 'effects')[0]);
    const numberJustify = parseEffectsJustify(childForms(numberNode ?? [], 'effects')[0]);
    const nameMappedAlignment = mapJustifyToTextAlignment(nameJustify);
    const numberMappedAlignment = mapJustifyToTextAlignment(numberJustify);
    const nameAlignment = normalizeLibraryLocalTextAlignment(
      nameMappedAlignment.textAnchor,
      nameMappedAlignment.baseline,
    );
    const numberAlignment = normalizeLibraryLocalTextAlignment(
      numberMappedAlignment.textAnchor,
      numberMappedAlignment.baseline,
    );
    const at = parseAtNode(childForms(pinNode, 'at')[0]);

    return [{
      number,
      name,
      electricalType: stringAt(pinNode, 1, 'passive'),
      hidden: stringAt(childForms(pinNode, 'hide')[0], 1, 'no') === 'yes',
      lengthMm: toNumber(stringAt(childForms(pinNode, 'length')[0], 1, '2.54'), 2.54),
      nameSizeMm: parseTextSizeMm(nameNode),
      numberSizeMm: parseTextSizeMm(numberNode),
      nameJustify,
      numberJustify,
      nameTextAnchor: nameAlignment.textAnchor,
      nameBaseline: nameAlignment.baseline,
      numberTextAnchor: numberAlignment.textAnchor,
      numberBaseline: numberAlignment.baseline,
      at: {
        ...normalizeLibraryLocalPoint(at),
        angle: normalizeLibraryLocalAngle(normalizeRotation(at.angle)),
      },
    }];
  });
}

function dedupeImportedPolylinePoints(points: Point[]) {
  if (points.length <= 1) {
    return points;
  }

  const deduped: Point[] = [points[0]!];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]!;
    const previous = deduped[deduped.length - 1]!;
    if (current.x === previous.x && current.y === previous.y) {
      continue;
    }
    deduped.push(current);
  }

  return deduped;
}

function parseLibraryGraphics(node: SExprNode[], nestedScopes: SExprNode[][] = []) {
  const rectangleNodes = collectDirectAndNestedForms(node, nestedScopes, 'rectangle');
  const polylineNodes = collectDirectAndNestedForms(node, nestedScopes, 'polyline');
  const polygonNodes = collectDirectAndNestedForms(node, nestedScopes, 'polygon');
  const circleNodes = collectDirectAndNestedForms(node, nestedScopes, 'circle');
  const arcNodes = collectDirectAndNestedForms(node, nestedScopes, 'arc');
  const textNodes = collectDirectAndNestedForms(node, nestedScopes, 'text');

  return [
    ...rectangleNodes.flatMap(rectangleNode => {
      const start = normalizeLibraryLocalPoint(parseAtNode(childForms(rectangleNode, 'start')[0]));
      const end = normalizeLibraryLocalPoint(parseAtNode(childForms(rectangleNode, 'end')[0]));
      return [{
        kind: 'rect' as const,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        fill: parseKiCadFillType(rectangleNode),
        strokeStyle: parseKiCadStrokeStyle(rectangleNode),
        strokeWidth: parseKiCadStrokeWidth(rectangleNode),
      }];
    }),
    ...polylineNodes.flatMap(polylineNode => {
      const ptsNode = childForms(polylineNode, 'pts')[0];
      if (!ptsNode) {
        return [];
      }

      const points = dedupeImportedPolylinePoints(childForms(ptsNode, 'xy').map(xyNode => ({
        x: toNumber(stringAt(xyNode, 1, '0')),
        y: toNumber(stringAt(xyNode, 2, '0')),
      })).map(normalizeLibraryLocalPoint));
      if (points.length < 2) {
        return [];
      }

      return [{
        kind: 'polyline' as const,
        points,
        fill: parseKiCadFillType(polylineNode),
        strokeStyle: parseKiCadStrokeStyle(polylineNode),
        strokeWidth: parseKiCadStrokeWidth(polylineNode),
      }];
    }),
    ...polygonNodes.flatMap(polygonNode => {
      const ptsNode = childForms(polygonNode, 'pts')[0];
      if (!ptsNode) {
        return [];
      }

      const points = dedupeImportedPolylinePoints(childForms(ptsNode, 'xy').map(xyNode => ({
        x: toNumber(stringAt(xyNode, 1, '0')),
        y: toNumber(stringAt(xyNode, 2, '0')),
      })).map(normalizeLibraryLocalPoint));
      if (points.length < 2) {
        return [];
      }

      const closedPoints = [...points];
      const first = points[0];
      const last = points[points.length - 1];
      if (first.x !== last.x || first.y !== last.y) {
        closedPoints.push({ x: first.x, y: first.y });
      }

      return [{
        kind: 'polyline' as const,
        points: closedPoints,
        fill: parseKiCadFillType(polygonNode),
        strokeStyle: parseKiCadStrokeStyle(polygonNode),
        strokeWidth: parseKiCadStrokeWidth(polygonNode),
      }];
    }),
    ...circleNodes.flatMap(circleNode => {
      const center = normalizeLibraryLocalPoint(parseAtNode(childForms(circleNode, 'center')[0]));
      const radiusNode = childForms(circleNode, 'radius')[0];
      if (!radiusNode) {
        return [];
      }

      let radius = 0;
      const isSingleValue = radiusNode.length === 2 && !Array.isArray(radiusNode[1]);
      if (isSingleValue) {
        radius = toNumber(radiusNode[1] as string, 0);
      } else {
        const xyNode = childForms(radiusNode, 'xy')[0];
        if (xyNode) {
          const radiusPoint = {
            x: toNumber(stringAt(xyNode, 1, '0')),
            y: toNumber(stringAt(xyNode, 2, '0')),
          };
          const normalizedRadiusPoint = normalizeLibraryLocalPoint(radiusPoint);
          radius = Math.hypot(normalizedRadiusPoint.x - center.x, normalizedRadiusPoint.y - center.y);
        } else {
          const radiusPoint = normalizeLibraryLocalPoint(parseAtNode(radiusNode));
          radius = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y);
        }
      }

      if (radius <= 0) {
        return [];
      }

      return [{
        kind: 'circle' as const,
        center: { x: center.x, y: center.y },
        radius,
        fill: parseKiCadFillType(circleNode),
        strokeStyle: parseKiCadStrokeStyle(circleNode),
        strokeWidth: parseKiCadStrokeWidth(circleNode),
      }];
    }),
    ...arcNodes.flatMap(arcNode => {
      const start = normalizeLibraryLocalPoint(parseAtNode(childForms(arcNode, 'start')[0]));
      const mid = normalizeLibraryLocalPoint(parseAtNode(childForms(arcNode, 'mid')[0]));
      const end = normalizeLibraryLocalPoint(parseAtNode(childForms(arcNode, 'end')[0]));
      return [{
        kind: 'arc' as const,
        start: { x: start.x, y: start.y },
        mid: { x: mid.x, y: mid.y },
        end: { x: end.x, y: end.y },
        strokeStyle: parseKiCadStrokeStyle(arcNode),
        strokeWidth: parseKiCadStrokeWidth(arcNode),
      }];
    }),
    ...textNodes.flatMap(textNode => {
      const text = typeof textNode[1] === 'string'
        ? sanitizePlainText(textNode[1], { maxLength: 120, fallback: '' })
        : '';
      if (!text) {
        return [];
      }

      const at = parseAtNode(childForms(textNode, 'at')[0]);
      const normalizedAt = normalizeLibraryLocalPoint(at);
      const normalizedAlignment = normalizeLibraryLocalTextAlignment(
        parseTextJustify(textNode).textAnchor,
        parseTextJustify(textNode).baseline,
      );
      const alignment = withKiCadDefaultTextAlignment(
        normalizedAlignment.textAnchor,
        normalizedAlignment.baseline,
      );
      return [{
        kind: 'text' as const,
        at: { x: normalizedAt.x, y: normalizedAt.y },
        text,
        angle: normalizeLibraryLocalAngle(normalizeRotation(at.angle)),
        originalAngle: normalizeLibraryLocalAngle(normalizeRotation(at.angle)),
        preserveNativeOrientation: true,
        sizeMm: parseTextSizeMm(textNode),
        role: 'annotation' as const,
        textAnchor: alignment.textAnchor,
        baseline: alignment.baseline,
        alignmentExplicit: parseTextJustify(textNode).explicit,
      }];
    }),
  ] satisfies ImportedSchematicPrimitive[];
}

function extractRootDrawingPrimitives(root: SExprNode[]) {
  const polylineNodes = childForms(root, 'polyline');
  const rectangleNodes = childForms(root, 'rectangle');
  const circleNodes = childForms(root, 'circle');
  const arcNodes = childForms(root, 'arc');
  const textNodes = childForms(root, 'text');

  return [
    ...rectangleNodes.flatMap(rectangleNode => {
      const start = parseAtNode(childForms(rectangleNode, 'start')[0]);
      const end = parseAtNode(childForms(rectangleNode, 'end')[0]);
      return [{
        kind: 'rect' as const,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        fill: parseKiCadFillType(rectangleNode),
        strokeStyle: parseKiCadStrokeStyle(rectangleNode),
        strokeWidth: parseKiCadStrokeWidth(rectangleNode),
      }];
    }),
    ...polylineNodes.flatMap(polylineNode => {
      const ptsNode = childForms(polylineNode, 'pts')[0];
      if (!ptsNode) {
        return [];
      }

      const points = dedupeImportedPolylinePoints(
        childForms(ptsNode, 'xy').map(xyNode => ({
          x: toNumber(stringAt(xyNode, 1, '0')),
          y: toNumber(stringAt(xyNode, 2, '0')),
        }))
      );
      if (points.length < 2) {
        return [];
      }

      return [{
        kind: 'polyline' as const,
        points,
        fill: parseKiCadFillType(polylineNode),
        strokeStyle: parseKiCadStrokeStyle(polylineNode),
        strokeWidth: parseKiCadStrokeWidth(polylineNode),
      }];
    }),
    ...circleNodes.flatMap(circleNode => {
      const center = parseAtNode(childForms(circleNode, 'center')[0]);
      const radiusNode = childForms(circleNode, 'radius')[0];
      if (!radiusNode) {
        return [];
      }

      let radius = 0;
      const isSingleValue = radiusNode.length === 2 && !Array.isArray(radiusNode[1]);
      if (isSingleValue) {
        radius = toNumber(radiusNode[1] as string, 0);
      } else {
        const xyNode = childForms(radiusNode, 'xy')[0];
        if (xyNode) {
          const radiusPoint = {
            x: toNumber(stringAt(xyNode, 1, '0')),
            y: toNumber(stringAt(xyNode, 2, '0')),
          };
          radius = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y);
        } else {
          const radiusPoint = parseAtNode(radiusNode);
          radius = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y);
        }
      }

      if (radius <= 0) {
        return [];
      }

      return [{
        kind: 'circle' as const,
        center: { x: center.x, y: center.y },
        radius,
        fill: parseKiCadFillType(circleNode),
        strokeStyle: parseKiCadStrokeStyle(circleNode),
        strokeWidth: parseKiCadStrokeWidth(circleNode),
      }];
    }),
    ...arcNodes.flatMap(arcNode => {
      const start = parseAtNode(childForms(arcNode, 'start')[0]);
      const mid = parseAtNode(childForms(arcNode, 'mid')[0]);
      const end = parseAtNode(childForms(arcNode, 'end')[0]);
      return [{
        kind: 'arc' as const,
        start: { x: start.x, y: start.y },
        mid: { x: mid.x, y: mid.y },
        end: { x: end.x, y: end.y },
        strokeStyle: parseKiCadStrokeStyle(arcNode),
        strokeWidth: parseKiCadStrokeWidth(arcNode),
      }];
    }),
    ...textNodes.flatMap(textNode => {
      const text = typeof textNode[1] === 'string'
        ? sanitizeMultilineText(textNode[1], { maxLength: 240, fallback: '' })
        : '';
      if (!text) {
        return [];
      }

      const at = parseAtNode(childForms(textNode, 'at')[0]);
      const alignment = withKiCadDefaultTextAlignment(
        parseTextJustify(textNode).textAnchor,
        parseTextJustify(textNode).baseline,
      );
      return [{
        kind: 'text' as const,
        at: { x: at.x, y: at.y },
        text,
        angle: normalizeRotation(at.angle),
        originalAngle: normalizeRotation(at.angle),
        preserveNativeOrientation: true,
        sizeMm: parseTextSizeMm(textNode),
        role: 'annotation' as const,
        textAnchor: alignment.textAnchor,
        baseline: alignment.baseline,
        alignmentExplicit: parseTextJustify(textNode).explicit,
      }];
    }),
  ] satisfies ImportedSchematicPrimitive[];
}

function measureLibrarySymbolBounds(pins: ParsedLibraryPin[], graphics: ImportedSchematicPrimitive[]) {
  const bodyPoints = [
    ...graphics
      .filter(primitive => primitive.kind !== 'text')
      .flatMap(primitive => getPrimitivePoints(primitive)),
    ...pins.flatMap(pin => {
      const outerPoint = { x: pin.at.x, y: pin.at.y };
      const innerPoint = getPinInnerPointMm(pin);
      return [outerPoint, innerPoint];
    }),
  ];

  const bodyBoundsMm = bodyPoints.length > 0
    ? {
        minX: Math.min(...bodyPoints.map(point => point.x)),
        minY: Math.min(...bodyPoints.map(point => point.y)),
        maxX: Math.max(...bodyPoints.map(point => point.x)),
        maxY: Math.max(...bodyPoints.map(point => point.y)),
      }
    : {
        minX: -10.16,
        minY: -5.08,
        maxX: 10.16,
        maxY: 5.08,
      };

  return {
    bodyBoundsMm,
    bodyWidthMm: Math.max(bodyBoundsMm.maxX - bodyBoundsMm.minX, 2.54),
    bodyHeightMm: Math.max(bodyBoundsMm.maxY - bodyBoundsMm.minY, 2.54),
  };
}

function parseNestedSymbolVariant(node: SExprNode[]): ParsedLibrarySymbolVariant {
  const sourceName = stringAt(node, 1, '');
  const suffixMatch = sourceName.match(/_(\d+)_(\d+)$/);
  const unit = suffixMatch ? Number.parseInt(suffixMatch[1] ?? '', 10) : null;
  const bodyStyle = suffixMatch ? Number.parseInt(suffixMatch[2] ?? '', 10) : null;
  const displaySettings = parseSymbolDisplaySettings(node);

  return {
    sourceName,
    unit: Number.isFinite(unit) ? unit : null,
    bodyStyle: Number.isFinite(bodyStyle) ? bodyStyle : null,
    isPowerSymbol: displaySettings.isPowerSymbol,
    hidePinNumbers: displaySettings.hidePinNumbers,
    pinNamesHide: displaySettings.pinNamesHide,
    pinNamesOffsetMm: displaySettings.pinNamesOffsetMm,
    pins: parseLibraryPins(childForms(node, 'pin')),
    graphics: parseLibraryGraphics(node),
  };
}

function parseKiCadFillType(node: SExprNode[]): 'none' | 'outline' | 'background' | undefined {
  const fillNode = childForms(node, 'fill')[0];
  const fillType = stringAt(childForms(fillNode ?? [], 'type')[0], 1, '').toLowerCase();

  if (fillType === 'background' || fillType === 'outline' || fillType === 'none') {
    return fillType;
  }

  return undefined;
}

function parseKiCadStrokeWidth(node: SExprNode[]) {
  const strokeNode = childForms(node, 'stroke')[0];
  const width = toNumber(stringAt(childForms(strokeNode ?? [], 'width')[0], 1, '0'), 0);
  return width > 0 ? width : undefined;
}

function parseKiCadStrokeStyle(
  node: SExprNode[]
): 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot' | undefined {
  const strokeNode = childForms(node, 'stroke')[0];
  const strokeType = stringAt(childForms(strokeNode ?? [], 'type')[0], 1, '').toLowerCase();

  if (strokeType === 'dash') {
    return 'dash';
  }

  if (strokeType === 'dot') {
    return 'dot';
  }

  if (strokeType === 'dash_dot' || strokeType === 'dash_dot_dot') {
    return strokeType;
  }

  if (strokeType === 'default' || strokeType === 'solid') {
    return 'default';
  }

  return undefined;
}

function parseLibrarySymbol(node: SExprNode[]): ParsedLibrarySymbol | null {
  const libraryId = stringAt(node, 1);
  if (!libraryId) {
    return null;
  }

  const extendsNode = childForms(node, 'extends')[0];
  const extendsId = extendsNode ? stringAt(extendsNode, 1) : undefined;

  const referenceProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Reference');
  const valueProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Value');
  const footprintProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Footprint');
  const childSymbolForms = childForms(node, 'symbol');
  const pins = parseLibraryPins(childForms(node, 'pin'));
  const graphics = parseLibraryGraphics(node);
  const variants = childSymbolForms.map(parseNestedSymbolVariant);
  const displaySettings = parseSymbolDisplaySettings(node);
  const bounds = measureLibrarySymbolBounds(pins, graphics);
  const fallbackDisplayName = libraryId.includes(':') ? libraryId.split(':').pop() ?? libraryId : libraryId;
  const displayName = sanitizePlainText(stringAt(valueProperty, 2, fallbackDisplayName), {
    maxLength: 80,
    fallback: fallbackDisplayName,
  });

  return {
    libraryId,
    extendsId,
    displayName,
    referencePrefix: stringAt(referenceProperty, 2, 'U') || 'U',
    footprint: stringAt(footprintProperty, 2) || undefined,
    isPowerSymbol: displaySettings.isPowerSymbol,
    hidePinNumbers: displaySettings.hidePinNumbers,
    pinNamesHide: displaySettings.pinNamesHide,
    pinNamesOffsetMm: displaySettings.pinNamesOffsetMm,
    bodyBoundsMm: bounds.bodyBoundsMm,
    bodyWidthMm: bounds.bodyWidthMm,
    bodyHeightMm: bounds.bodyHeightMm,
    pins,
    graphics,
    variants,
  };
}

function extractLibrarySymbols(root: SExprNode[]) {
  const libSymbols = childForms(root, 'lib_symbols')[0];
  if (!libSymbols) {
    return new Map<string, ParsedLibrarySymbol>();
  }

  const symbols = childForms(libSymbols, 'symbol')
    .map(parseLibrarySymbol)
    .filter((symbol): symbol is ParsedLibrarySymbol => Boolean(symbol));

  const symbolMap = new Map(symbols.map(symbol => [symbol.libraryId, symbol] as const));
  const resolvedMap = new Map<string, ParsedLibrarySymbol>();

  const cloneSymbol = (symbol: ParsedLibrarySymbol): ParsedLibrarySymbol => ({
    ...symbol,
    bodyBoundsMm: { ...symbol.bodyBoundsMm },
    isPowerSymbol: symbol.isPowerSymbol,
    hidePinNumbers: symbol.hidePinNumbers,
    pinNamesHide: symbol.pinNamesHide,
    pinNamesOffsetMm: symbol.pinNamesOffsetMm,
    pins: symbol.pins.map(pin => ({
      ...pin,
      at: { ...pin.at },
    })),
    graphics: symbol.graphics.map(primitive => structuredClone(primitive)),
    variants: symbol.variants.map(variant => ({
      ...variant,
      pins: variant.pins.map(pin => ({
        ...pin,
        at: { ...pin.at },
      })),
      graphics: variant.graphics.map(primitive => structuredClone(primitive)),
    })),
  });

  const resolveBaseLibraryId = (libraryId: string, extendsId: string) => {
    if (extendsId !== libraryId && symbolMap.has(extendsId)) {
      return extendsId;
    }
    const extendsSuffix = unprefixedLibrarySymbolName(extendsId);
    if (extendsSuffix !== libraryId && symbolMap.has(extendsSuffix)) {
      return extendsSuffix;
    }
    if (!extendsId.includes(':') && libraryId.includes(':')) {
      const libraryPrefix = libraryId.split(':')[0] + ':';
      const prefixedId = libraryPrefix + extendsId;
      if (prefixedId !== libraryId && symbolMap.has(prefixedId)) {
        return prefixedId;
      }
    }
    for (const candidateId of symbolMap.keys()) {
      if (candidateId === libraryId) {
        continue;
      }
      if (unprefixedLibrarySymbolName(candidateId) === extendsSuffix) {
        return candidateId;
      }
    }
    return undefined;
  };

  const hasBodyGraphics = (symbol: ParsedLibrarySymbol) =>
    symbol.graphics.some(primitive => primitive.kind !== 'text');

  const resolveSymbol = (
    libraryId: string,
    depth = 0,
    trail = new Set<string>(),
  ): ParsedLibrarySymbol | undefined => {
    const cached = resolvedMap.get(libraryId);
    if (cached) {
      return cached;
    }

    const symbol = symbolMap.get(libraryId);
    if (!symbol) {
      return undefined;
    }

    if (!symbol.extendsId || depth >= 3 || trail.has(libraryId)) {
      const cloned = cloneSymbol(symbol);
      resolvedMap.set(libraryId, cloned);
      return cloned;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(libraryId);

    const baseLibraryId = resolveBaseLibraryId(symbol.libraryId, symbol.extendsId);
    const base = baseLibraryId ? resolveSymbol(baseLibraryId, depth + 1, nextTrail) : undefined;
    const cloned = cloneSymbol(symbol);

    if (!base) {
      resolvedMap.set(libraryId, cloned);
      return cloned;
    }

    if (cloned.pins.length === 0) {
      cloned.pins = base.pins.map(pin => ({
        ...pin,
        at: { ...pin.at },
      }));
    }

    if (cloned.variants.length === 0 && base.variants.length > 0) {
      cloned.variants = base.variants.map(variant => ({
        ...variant,
        pins: variant.pins.map(pin => ({
          ...pin,
          at: { ...pin.at },
        })),
        graphics: variant.graphics.map(primitive => structuredClone(primitive)),
      }));
    }

    if (!hasBodyGraphics(cloned)) {
      const bodyGraphics = base.graphics
        .filter(primitive => primitive.kind !== 'text')
        .map(primitive => structuredClone(primitive));
      const annotationGraphics = cloned.graphics
        .filter(primitive => primitive.kind === 'text')
        .map(primitive => structuredClone(primitive));
      cloned.graphics = [...bodyGraphics, ...annotationGraphics];
      cloned.bodyBoundsMm = { ...base.bodyBoundsMm };
      cloned.bodyWidthMm = base.bodyWidthMm;
      cloned.bodyHeightMm = base.bodyHeightMm;
    }

    if (!cloned.isPowerSymbol) {
      cloned.isPowerSymbol = base.isPowerSymbol;
    }
    if (!cloned.hidePinNumbers) {
      cloned.hidePinNumbers = base.hidePinNumbers;
    }
    if (!cloned.pinNamesHide) {
      cloned.pinNamesHide = base.pinNamesHide;
    }
    if (cloned.pinNamesOffsetMm === undefined) {
      cloned.pinNamesOffsetMm = base.pinNamesOffsetMm;
    }

    resolvedMap.set(libraryId, cloned);
    return cloned;
  };

  for (const libraryId of symbolMap.keys()) {
    resolveSymbol(libraryId);
  }

  return resolvedMap;
}

function parseInstance(node: SExprNode[]): ParsedSchematicInstance | null {
  const libraryId = stringAt(childForms(node, 'lib_id')[0], 1);
  if (!libraryId) {
    return null;
  }

  const at = parseAtNode(childForms(node, 'at')[0]);
  const referenceProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Reference');
  const valueProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Value');
  const footprintProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Footprint');
  const mirrorNode = childForms(node, 'mirror')[0];
  const mirrorToken = stringAt(mirrorNode, 1, '').toLowerCase();
  const unit = toNumber(stringAt(childForms(node, 'unit')[0], 1, '1'), 1);
  const bodyStyle = toNumber(stringAt(childForms(node, 'body_style')[0], 1, '1'), 1);
  const uuid = stringAt(childForms(node, 'uuid')[0], 1, libraryId);
  const reference = stringAt(referenceProperty, 2, libraryId);
  const value = stringAt(valueProperty, 2, reference);
  const referenceAtNode = parseAtNode(childForms(referenceProperty ?? [], 'at')[0]);
  const valueAtNode = parseAtNode(childForms(valueProperty ?? [], 'at')[0]);
  const referenceSizeMm = parseTextSizeMm(referenceProperty);
  const valueSizeMm = parseTextSizeMm(valueProperty);
  const referenceJustify = parseTextJustify(referenceProperty);
  const valueJustify = parseTextJustify(valueProperty);

  return {
    uuid,
    libraryId,
    unit: Number.isFinite(unit) && unit > 0 ? Math.round(unit) : 1,
    bodyStyle: Number.isFinite(bodyStyle) && bodyStyle >= 0 ? Math.round(bodyStyle) : 1,
    at: {
      x: at.x,
      y: at.y,
      rotation: normalizeRotation(at.angle),
      mirrorX: mirrorToken === 'x' || mirrorToken === 'xy',
      mirrorY: mirrorToken === 'y' || mirrorToken === 'xy',
    },
    reference,
    value,
    footprint: stringAt(footprintProperty, 2) || undefined,
    referenceAt: referenceProperty
      ? {
          x: referenceAtNode.x,
          y: referenceAtNode.y,
          rotation: normalizeRotation(referenceAtNode.angle),
        }
      : undefined,
    valueAt: valueProperty
      ? {
          x: valueAtNode.x,
          y: valueAtNode.y,
          rotation: normalizeRotation(valueAtNode.angle),
        }
      : undefined,
    referenceSizeMm,
    valueSizeMm,
    referenceTextAnchor: referenceJustify.textAnchor,
    referenceBaseline: referenceJustify.baseline,
    valueTextAnchor: valueJustify.textAnchor,
    valueBaseline: valueJustify.baseline,
    referenceAlignmentExplicit: referenceJustify.explicit,
    valueAlignmentExplicit: valueJustify.explicit,
  };
}

function extractInstances(root: SExprNode[]) {
  return childForms(root, 'symbol')
    .map(parseInstance)
    .filter((instance): instance is ParsedSchematicInstance => Boolean(instance));
}

function extractWireSegments(root: SExprNode[]) {
  const segments: Array<{ start: Point; end: Point }> = [];

  for (const wireNode of childForms(root, 'wire')) {
    const pts = childForms(wireNode, 'pts')[0];
    if (!pts) {
      continue;
    }
    const xyNodes = childForms(pts, 'xy');
    for (let index = 0; index < xyNodes.length - 1; index += 1) {
      const startNode = xyNodes[index];
      const endNode = xyNodes[index + 1];
      segments.push({
        start: { x: toNumber(stringAt(startNode, 1, '0')), y: toNumber(stringAt(startNode, 2, '0')) },
        end: { x: toNumber(stringAt(endNode, 1, '0')), y: toNumber(stringAt(endNode, 2, '0')) },
      });
    }
  }

  return segments;
}

function extractJunctionPoints(root: SExprNode[]) {
  return childForms(root, 'junction').map(node => {
    const at = parseAtNode(childForms(node, 'at')[0]);
    return { x: at.x, y: at.y };
  });
}

function extractLabels(root: SExprNode[]): Array<{
  kind: 'local' | 'global' | 'hierarchical';
  name: string;
  point: Point;
  angle?: 0 | 90 | 180 | 270;
  sizeMm?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  baseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
}> {
  return root.flatMap(node => {
    if (!Array.isArray(node) || typeof node[0] !== 'string') {
      return [];
    }
    if (!node[0].includes('label')) {
      return [];
    }

    const kind = node[0] === 'global_label'
      ? 'global'
      : node[0] === 'hierarchical_label'
        ? 'hierarchical'
        : 'local';

    const text =
      typeof node[1] === 'string'
        ? sanitizeMultilineText(node[1], { maxLength: 240, fallback: '' })
        : '';
    if (!text) {
      return [];
    }

    const at = parseAtNode(childForms(node, 'at')[0]);
    const justify = parseTextJustify(node);
    const sizeMm = parseTextSizeMm(node);
    return [{
      kind,
      name: text,
      point: { x: at.x, y: at.y },
      angle: normalizeRotation(at.angle),
      sizeMm,
      textAnchor: justify.textAnchor,
      baseline: justify.baseline,
    }];
  });
}

function extractSheetFrames(root: SExprNode[]) {
  return childForms(root, 'sheet').flatMap(sheetNode => {
    const atNode = childForms(sheetNode, 'at')[0];
    const sizeNode = childForms(sheetNode, 'size')[0];
    if (!atNode || !sizeNode) {
      return [];
    }

    const at = parseAtNode(atNode);
    const width = toNumber(stringAt(sizeNode, 1, '0'));
    const height = toNumber(stringAt(sizeNode, 2, '0'));
    if (!(width > 0) || !(height > 0)) {
      return [];
    }

    const sheetNameProperty = childForms(sheetNode, 'property').find(property => stringAt(property, 1) === 'Sheetname');
    const sheetFileProperty = childForms(sheetNode, 'property').find(property => stringAt(property, 1) === 'Sheetfile');

    return [{
      start: { x: at.x, y: at.y },
      end: { x: at.x + width, y: at.y + height },
      name: stringAt(sheetNameProperty, 2) || undefined,
      file: stringAt(sheetFileProperty, 2) || undefined,
      pins: childForms(sheetNode, 'pin').flatMap(pinNode => {
        const pinName = stringAt(pinNode, 1);
        if (!pinName) {
          return [];
        }

        const pinAt = parseAtNode(childForms(pinNode, 'at')[0]);
        return [{
          text: pinName,
          at: { x: pinAt.x, y: pinAt.y },
          angle: normalizeRotation(pinAt.angle),
        }];
      }),
    }];
  });
}

const PAPER_SIZES_MM: Record<string, { width: number; height: number }> = {
  A: { width: 279.4, height: 215.9 },
  A0: { width: 1189, height: 841 },
  A1: { width: 841, height: 594 },
  A2: { width: 594, height: 420 },
  A3: { width: 420, height: 297 },
  A4: { width: 297, height: 210 },
  A5: { width: 210, height: 148 },
  B: { width: 431.8, height: 279.4 },
  C: { width: 558.8, height: 431.8 },
  D: { width: 863.6, height: 558.8 },
  E: { width: 1117.6, height: 863.6 },
  USLetter: { width: 279.4, height: 215.9 },
  USLegal: { width: 355.6, height: 215.9 },
  USLedger: { width: 431.8, height: 279.4 },
};

function extractPageFrame(root: SExprNode[]): ParsedPageFrame | undefined {
  const paperNode = childForms(root, 'paper')[0];
  const rawPaper = stringAt(paperNode, 1, 'A4') || 'A4';
  const paper = sanitizePlainText(rawPaper, { maxLength: 40, fallback: 'A4' });
  const orientation = stringAt(paperNode, 2, '').toLowerCase();
  const baseSize = PAPER_SIZES_MM[paper] ?? PAPER_SIZES_MM.A4;
  const size = orientation === 'portrait'
    ? { width: Math.min(baseSize.width, baseSize.height), height: Math.max(baseSize.width, baseSize.height) }
    : { width: Math.max(baseSize.width, baseSize.height), height: Math.min(baseSize.width, baseSize.height) };
  const titleBlockNode = childForms(root, 'title_block')[0];
  const comments = titleBlockNode
    ? childForms(titleBlockNode, 'comment').flatMap(commentNode => {
        const text = stringAt(commentNode, 2);
        return text ? [sanitizePlainText(text, { maxLength: 120, fallback: '' })].filter(Boolean) : [];
      })
    : [];
  const titleBlock = titleBlockNode
    ? {
        title: sanitizePlainText(stringAt(childForms(titleBlockNode, 'title')[0], 1, ''), { maxLength: 120, fallback: '' }) || undefined,
        date: sanitizePlainText(stringAt(childForms(titleBlockNode, 'date')[0], 1, ''), { maxLength: 40, fallback: '' }) || undefined,
        rev: sanitizePlainText(stringAt(childForms(titleBlockNode, 'rev')[0], 1, ''), { maxLength: 40, fallback: '' }) || undefined,
        company: sanitizePlainText(stringAt(childForms(titleBlockNode, 'company')[0], 1, ''), { maxLength: 120, fallback: '' }) || undefined,
        comments,
      }
    : undefined;

  return {
    start: { x: 0, y: 0 },
    end: { x: size.width, y: size.height },
    paper,
    titleBlock,
  };
}

function buildCustomPackageFromLibrarySymbol(symbol: ParsedLibrarySymbol) {
  const parsedSymbol: ParsedKiCadSymbol = {
    name: symbol.displayName,
    displayName: symbol.displayName,
    referencePrefix: symbol.referencePrefix,
    footprint: symbol.footprint,
    description: `${symbol.displayName} imported from KiCad schematic`,
    pins: symbol.pins.map(pin => ({
      number: pin.number,
      name: pin.name,
      electricalType: pin.electricalType,
      side: pin.at.x <= 0 ? 'left' : 'right',
    })),
  };

  return kicadSymbolToCustomComponentPackage(parsedSymbol, {
    templateIdPrefix: 'kicad',
  });
}

function buildKnownLibraryCustomMapping(
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance,
  templateId: string,
  confidence: KiCadMappingConfidence = 'high'
): ImportedKiCadMapping {
  return {
    templateId,
    confidence,
    source: 'kicad-library',
    matchedBy: symbol.libraryId,
    reference: instance.reference,
    value: instance.value,
    footprint: instance.footprint,
    libraryId: instance.libraryId,
  };
}

function resolveKnownCustomLibraryMapping(
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance,
  generatedTemplateId: string
): ImportedKiCadMapping | null {
  const libraryId = normalizeImportedFallbackToken(symbol.libraryId);

  if (
    libraryId === 'power:gnd' ||
    libraryId === 'power:+12v' ||
    libraryId === 'power:+5v' ||
    libraryId === 'power:+3.3v' ||
    libraryId === 'power:vcc' ||
    libraryId === 'power:vdd'
  ) {
    return buildKnownLibraryCustomMapping(symbol, instance, generatedTemplateId, 'high');
  }

  if (libraryId.startsWith('connector:screw_terminal_01x')) {
    return buildKnownLibraryCustomMapping(symbol, instance, generatedTemplateId, 'high');
  }

  if (libraryId === 'mechanical:mountinghole_pad') {
    return buildKnownLibraryCustomMapping(symbol, instance, generatedTemplateId, 'high');
  }

  if (libraryId === 'driver_fet:ir2302') {
    return buildKnownLibraryCustomMapping(symbol, instance, generatedTemplateId, 'high');
  }

  return null;
}

function toImportedPolyline(points: Array<[number, number]>): ImportedSchematicPrimitive {
  return {
    kind: 'polyline',
    points: points.map(([x, y]) => ({ x, y })),
  };
}

function normalizeImportedFallbackToken(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function normalizeImportedPinTextToken(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function extractImportedPinOrdinal(value: string | undefined) {
  const normalized = normalizeImportedPinTextToken(value);
  const match = normalized.match(/^(?:pin_?)?(\d+)$/);
  return match?.[1] ?? null;
}

function inferImportedFallbackKind(
  templateId: string | undefined,
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance
) {
  const libraryId = normalizeImportedFallbackToken(symbol.libraryId);
  const reference = normalizeImportedFallbackToken(instance.reference);
  const value = normalizeImportedFallbackToken(instance.value);
  const combined = `${libraryId} ${reference} ${value}`;

  if (
    libraryId.includes('pwr_flag') ||
    value.includes('pwr_flag') ||
    reference.includes('flg')
  ) {
    return 'pwr-flag' as const;
  }

  if (
    libraryId.includes('gnd') ||
    value === 'gnd' ||
    value.includes('ground') ||
    value.includes('gndpwr') ||
    reference.includes('gnd')
  ) {
    return 'ground' as const;
  }

  if (
    libraryId.includes('battery') ||
    value.includes('battery') ||
    reference.startsWith('bt')
  ) {
    return 'battery' as const;
  }

  if (
    templateId === 'tpl_external_power' ||
    symbol.isPowerSymbol ||
    libraryId.includes('vcc') ||
    libraryId.includes('vdd') ||
    libraryId.includes('vin') ||
    libraryId.includes('3v3') ||
    libraryId.includes('5v') ||
    value === 'vcc' ||
    value === 'vdd' ||
    value === 'vin' ||
    value === '3v3' ||
    value === '5v' ||
    value === 'vusb' ||
    value === 'vbatt' ||
    value === 'vbat' ||
    reference.startsWith('#pwr')
  ) {
    return 'tpl_external_power' as const;
  }

  if (
    libraryId.startsWith('connector') ||
    combined.includes('conn_01x') ||
    reference.startsWith('j') ||
    reference.startsWith('p')
  ) {
    return 'connector' as const;
  }

  return templateId;
}

function getPinInnerPointMm(pin: ParsedLibraryPin) {
  const radians = (normalizeRotation(pin.at.angle) * Math.PI) / 180;
  return {
    x: Number((pin.at.x + Math.cos(radians) * pin.lengthMm).toFixed(3)),
    y: Number((pin.at.y + Math.sin(radians) * pin.lengthMm).toFixed(3)),
  };
}

function estimateImportedPinPitchMm(pin: ParsedLibraryPin, pins: ParsedLibraryPin[]) {
  const angle = normalizeRotation(pin.at.angle);
  const axis = angle === 0 || angle === 180 ? 'y' : 'x';
  let nearest: number | null = null;

  for (const candidate of pins) {
    if (candidate === pin) {
      continue;
    }

    if (normalizeRotation(candidate.at.angle) !== angle) {
      continue;
    }

    const delta = Math.abs(candidate.at[axis] - pin.at[axis]);
    if (!(delta > 0.01)) {
      continue;
    }

    if (nearest === null || delta < nearest) {
      nearest = delta;
    }
  }

  return nearest;
}

function transformPinForInstance(
  pin: ParsedLibraryPin,
  instance: ParsedSchematicInstance
): ParsedLibraryPin {
  const angle = mirrorRotation(
    normalizeRotation(pin.at.angle),
    instance.at.mirrorX,
    instance.at.mirrorY
  );
  const mirroredAt = mirrorPoint(pin.at, instance.at.mirrorX, instance.at.mirrorY);

  return {
    ...pin,
    at: {
      x: Number(mirroredAt.x.toFixed(3)),
      y: Number(mirroredAt.y.toFixed(3)),
      angle,
    },
  };
}

function transformPrimitiveForInstance(
  primitive: ImportedSchematicPrimitive,
  instance: ParsedSchematicInstance
): ImportedSchematicPrimitive {
  const { mirrorX, mirrorY } = instance.at;

  switch (primitive.kind) {
    case 'rect':
      return {
        ...primitive,
        start: mirrorPoint(primitive.start, mirrorX, mirrorY),
        end: mirrorPoint(primitive.end, mirrorX, mirrorY),
      };
    case 'polyline':
      return {
        ...primitive,
        points: primitive.points.map(point => mirrorPoint(point, mirrorX, mirrorY)),
      };
    case 'circle':
      return {
        ...primitive,
        center: mirrorPoint(primitive.center, mirrorX, mirrorY),
      };
    case 'arc':
      return {
        kind: 'arc',
        start: mirrorPoint(primitive.start, mirrorX, mirrorY),
        mid: mirrorPoint(primitive.mid, mirrorX, mirrorY),
        end: mirrorPoint(primitive.end, mirrorX, mirrorY),
        strokeStyle: primitive.strokeStyle,
        strokeWidth: primitive.strokeWidth,
      };
    case 'text':
      const mirroredAlignment = mirrorTextAlignment(
        primitive.textAnchor,
        primitive.baseline,
        mirrorX,
        mirrorY
      );
      return {
        ...primitive,
        at: mirrorPoint(primitive.at, mirrorX, mirrorY),
        angle: mirrorRotation(primitive.angle, mirrorX, mirrorY),
        originalAngle: primitive.originalAngle !== undefined
          ? mirrorRotation(primitive.originalAngle, mirrorX, mirrorY)
          : primitive.originalAngle,
        textAnchor: mirroredAlignment.textAnchor,
        baseline: mirroredAlignment.baseline,
      };
    default:
      return primitive;
  }
}

function rotateImportedPrimitive(
  primitive: ImportedSchematicPrimitive,
  rotation: 0 | 90 | 180 | 270
): ImportedSchematicPrimitive {
  if (rotation === 0) {
    return primitive;
  }

  switch (primitive.kind) {
    case 'rect':
      return {
        ...primitive,
        start: rotatePoint(primitive.start, rotation),
        end: rotatePoint(primitive.end, rotation),
      };
    case 'polyline':
      return {
        ...primitive,
        points: primitive.points.map(point => rotatePoint(point, rotation)),
      };
    case 'circle':
      return {
        ...primitive,
        center: rotatePoint(primitive.center, rotation),
      };
    case 'arc':
      return {
        ...primitive,
        start: rotatePoint(primitive.start, rotation),
        mid: rotatePoint(primitive.mid, rotation),
        end: rotatePoint(primitive.end, rotation),
      };
    case 'text':
      return {
        ...primitive,
        at: rotatePoint(primitive.at, rotation),
        angle: normalizeRotation(primitive.angle + rotation),
        originalAngle: primitive.originalAngle !== undefined
          ? normalizeRotation(primitive.originalAngle + rotation)
          : primitive.originalAngle,
      };
    default:
      return primitive;
  }
}

function orientImportedFallbackPrimitives(
  primitives: ImportedSchematicPrimitive[],
  symbol: ParsedLibrarySymbol,
  fallbackKind: string
) {
  const primaryPin = symbol.pins[0];
  if (!primaryPin) {
    return primitives;
  }

  const pinAngle = normalizeRotation(primaryPin.at.angle);
  const baseAngle =
    fallbackKind === 'tpl_external_power'
      ? 270
      : fallbackKind === 'ground' || fallbackKind === 'pwr-flag'
        ? 90
        : 0;
  const rotation = normalizeRotation(pinAngle - baseAngle);

  if (rotation === 0) {
    return primitives;
  }

  return primitives.map(primitive => rotateImportedPrimitive(primitive, rotation));
}

function looksLikeIcSymbol(symbol: ParsedLibrarySymbol, instance: ParsedSchematicInstance) {
  const normalizedLibraryId = normalizeImportedFallbackToken(symbol.libraryId);
  const normalizedValue = normalizeImportedFallbackToken(instance.value);
  const combined = `${normalizedLibraryId} ${normalizedValue}`;

  return (
    combined.includes('mcu') ||
    combined.includes('microchip') ||
    combined.includes('atmega') ||
    combined.includes('stm32') ||
    combined.includes('esp32') ||
    combined.includes('raspberry_pi') ||
    combined.includes('gpio') ||
    symbol.pins.length >= 8
  );
}

function measurePinInnerBounds(pins: ParsedLibraryPin[]) {
  const innerPoints = pins.map(getPinInnerPointMm);
  if (innerPoints.length === 0) {
    return null;
  }

  const xs = innerPoints.map(point => point.x);
  const ys = innerPoints.map(point => point.y);

  return {
    innerPoints,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function measureNearestPinPitchMm(pins: ParsedLibraryPin[]) {
  let nearest: number | null = null;

  for (const pin of pins) {
    const candidate = estimateImportedPinPitchMm(pin, pins);
    if (!(candidate && candidate > 0.01)) {
      continue;
    }

    if (nearest === null || candidate < nearest) {
      nearest = candidate;
    }
  }

  return nearest;
}

function looksLikeBoardHeaderSymbol(symbol: ParsedLibrarySymbol, instance: ParsedSchematicInstance) {
  const normalizedLibraryId = normalizeImportedFallbackToken(symbol.libraryId);
  const normalizedValue = normalizeImportedFallbackToken(instance.value);
  const normalizedReference = normalizeImportedFallbackToken(instance.reference);
  const combined = `${normalizedLibraryId} ${normalizedValue} ${normalizedReference}`;
  const uniqueAngles = new Set(symbol.pins.map(pin => normalizeRotation(pin.at.angle)));
  const hasMultiplePinSides = uniqueAngles.size >= 2;

  return (
    combined.includes('raspberry_pi') ||
    combined.includes('gpio') ||
    combined.includes('header') ||
    combined.includes('expansion') ||
    symbol.pins.length >= 12 ||
    (symbol.pins.length >= 8 && hasMultiplePinSides)
  );
}

function shouldSuppressImportedReferenceText(derivedKind: string | undefined, instance: ParsedSchematicInstance) {
  const normalizedReference = normalizeImportedFallbackToken(instance.reference);
  return (
    (
      ((derivedKind === 'ground' || derivedKind === 'pwr-flag') &&
        (normalizedReference.startsWith('#pwr') || normalizedReference.startsWith('#flg'))) ||
      (derivedKind === 'tpl_external_power' && normalizedReference.startsWith('#pwr'))
    )
  );
}

function shouldSuppressImportedValueText(derivedKind: string | undefined, instance: ParsedSchematicInstance) {
  const normalizedValue = normalizeImportedFallbackToken(instance.value);

  if (derivedKind === 'battery') {
    return normalizedValue.includes('battery');
  }

  return false;
}

function shouldRenderImportedPinName(pin: ParsedLibraryPin) {
  const normalizedName = normalizeImportedPinTextToken(pin.name);
  const normalizedNumber = normalizeImportedPinTextToken(pin.number);

  if (!normalizedName) {
    return false;
  }

  if (normalizedName === normalizedNumber) {
    return false;
  }

  const nameOrdinal = extractImportedPinOrdinal(pin.name);
  const numberOrdinal = extractImportedPinOrdinal(pin.number);
  if (nameOrdinal && numberOrdinal && nameOrdinal === numberOrdinal) {
    return false;
  }

  return true;
}

function normalizeImportedPinNameForLayout(value: string) {
  return value.replace(/[~{}()]/g, '').trim();
}

function isCompactImportedPinName(value: string) {
  const normalized = normalizeImportedPinNameForLayout(value);
  if (!normalized) {
    return false;
  }

  if (normalized.includes('/')) {
    return false;
  }

  return normalized.length <= 5;
}

function getImportedPinNameVisualLength(value: string) {
  const normalized = normalizeImportedPinNameForLayout(value);
  const separatorCount = (normalized.match(/[\/_]/g) ?? []).length;
  return normalized.replace(/[\/_]/g, '').length + separatorCount * 2;
}

function buildImportedPinTextLayout(
  pin: ParsedLibraryPin,
  innerPoint: Point,
  options: {
    centerX: number;
    isConnector: boolean;
    isDensePinLayout: boolean;
    pinNameOffsetMm: number;
    pinPitchMm: number | null;
    compactPinName: boolean;
  }
) {
  const angle = normalizeRotation(pin.at.angle);
  const radians = (angle * Math.PI) / 180;
  const forward = { x: Math.cos(radians), y: Math.sin(radians) };
  const outward = { x: -forward.x, y: -forward.y };
  const isVertical = angle === 90 || angle === 270;
  const pinNameOffsetMm = Math.max(options.pinNameOffsetMm, 0);
  const effectivePitchMm =
    options.pinPitchMm && options.pinPitchMm > 0.01
      ? options.pinPitchMm
      : options.isDensePinLayout
        ? 2.54
        : 3.81;
  const isTightPitch = effectivePitchMm <= 2.6;

  if (!isVertical) {
    const compactNameInsetAdjustment =
      options.isDensePinLayout && options.compactPinName
        ? isTightPitch
          ? -0.14
          : -0.1
        : 0;
    const denseHorizontalNameBoost =
      options.isDensePinLayout && !options.isConnector
        ? forward.x >= 0
          ? isTightPitch
            ? 3.08
            : 2.9
          : isTightPitch
            ? 0.48
            : 0.42
        : 0;
    const nameInset = Math.max(
      pinNameOffsetMm +
        (options.isConnector
          ? isTightPitch
            ? 0.22
            : 0.28
          : options.isDensePinLayout
            ? isTightPitch
              ? 0.62
              : 0.68
            : 0.6) +
        denseHorizontalNameBoost +
        compactNameInsetAdjustment,
      options.isConnector ? (isTightPitch ? 0.6 : 0.68) : options.isDensePinLayout ? (isTightPitch ? 1.16 : 1.24) : 1.14
    );
    const numberOutset = options.isConnector
      ? (isTightPitch ? 0.92 : 1)
      : options.isDensePinLayout
        ? (isTightPitch ? 0.9 : 0.96)
        : 1.54;
    const pinNameAnchor = forward.x >= 0 ? 'start' as const : 'end' as const;
    const pinNumberAnchor = forward.x >= 0 ? 'end' as const : 'start' as const;
    const pinNumberAt = options.isDensePinLayout && !options.isConnector
      ? forward.x >= 0
        ? {
            x: Number((innerPoint.x - forward.x * 0.52).toFixed(3)),
            y: Number((innerPoint.y - forward.y * 0.52).toFixed(3)),
          }
        : {
            x: Number((pin.at.x + outward.x * (numberOutset + 0.12)).toFixed(3)),
            y: Number((pin.at.y + outward.y * (numberOutset + 0.12)).toFixed(3)),
          }
      : {
          x: Number((pin.at.x + outward.x * numberOutset).toFixed(3)),
          y: Number((pin.at.y + outward.y * numberOutset).toFixed(3)),
        };
    return {
      pinNumberAt,
      pinNumberAnchor,
      pinNameAt: {
        x: Number((innerPoint.x + forward.x * nameInset).toFixed(3)),
        y: Number((innerPoint.y + forward.y * nameInset).toFixed(3)),
      },
      pinNameAnchor,
      pinNumberBaseline: 'middle' as const,
      pinNameBaseline: 'middle' as const,
    };
  }

  if (options.isConnector) {
    const isTopPin = angle === 90;
    const verticalBaseline = isTopPin ? 'ideographic' as const : 'hanging' as const;
    const horizontalBias = pin.at.x <= options.centerX ? -1 : 1;
    const numberHorizontalSpread = isTightPitch ? 0.56 : 0.44;
    const nameHorizontalSpread = isTightPitch ? 0.12 : 0.1;
    const connectorVerticalNameInset = Math.max(
      pinNameOffsetMm + (isTightPitch ? 0.12 : 0.16),
      isTightPitch ? 0.42 : 0.5
    );
    return {
      pinNumberAt: {
        x: Number((pin.at.x + horizontalBias * numberHorizontalSpread).toFixed(3)),
        y: Number((pin.at.y + outward.y * (isTightPitch ? 0.84 : 0.92)).toFixed(3)),
      },
      pinNumberAnchor: horizontalBias < 0 ? 'end' as const : 'start' as const,
      pinNameAt: {
        x: Number((innerPoint.x + horizontalBias * nameHorizontalSpread).toFixed(3)),
        y: Number((innerPoint.y + forward.y * connectorVerticalNameInset).toFixed(3)),
      },
      pinNameAnchor: horizontalBias < 0 ? 'end' as const : 'start' as const,
      pinNumberBaseline: verticalBaseline,
      pinNameBaseline: verticalBaseline,
    };
  }

  const numberSideOffset = options.isDensePinLayout
    ? options.compactPinName
      ? (isTightPitch ? 0.03 : 0.06)
      : (isTightPitch ? 0.08 : 0.12)
    : 0.52;
  const numberVerticalOffset = options.isDensePinLayout ? (isTightPitch ? 0.86 : 0.94) : 0.98;
  const nameSideOffset = options.isDensePinLayout
    ? options.compactPinName
      ? (isTightPitch ? 0.26 : 0.34)
      : (isTightPitch ? 0.34 : 0.44)
    : 0.52;
  const nameVerticalInset = Math.max(
    pinNameOffsetMm +
      (options.isDensePinLayout
        ? options.compactPinName
          ? (isTightPitch ? 0.38 : 0.42)
          : (isTightPitch ? 0.5 : 0.56)
        : 0.18),
    options.isDensePinLayout
      ? options.compactPinName
        ? (isTightPitch ? 0.82 : 0.9)
        : (isTightPitch ? 1 : 1.1)
      : 0.52
  );
  const isTopPin = angle === 90;
  const effectiveHorizontalBias = pin.at.x <= options.centerX ? -1 : 1;
  const verticalBaseline = isTopPin ? 'ideographic' as const : 'hanging' as const;

  return {
    pinNumberAt: {
      x: Number((pin.at.x + effectiveHorizontalBias * numberSideOffset).toFixed(3)),
      y: Number((pin.at.y + outward.y * numberVerticalOffset).toFixed(3)),
    },
    pinNumberAnchor: options.isDensePinLayout
      ? 'middle' as const
      : effectiveHorizontalBias < 0
        ? 'end' as const
        : 'start' as const,
    pinNameAt: {
      x: Number((pin.at.x + effectiveHorizontalBias * nameSideOffset).toFixed(3)),
      y: Number((innerPoint.y + forward.y * nameVerticalInset).toFixed(3)),
    },
    pinNameAnchor: options.isDensePinLayout
      ? 'middle' as const
      : effectiveHorizontalBias < 0
        ? 'end' as const
        : 'start' as const,
    pinNumberBaseline: verticalBaseline,
    pinNameBaseline: verticalBaseline,
  };
}

function hasImportedConnectorBodyPrimitive(primitives: ImportedSchematicPrimitive[]) {
  return primitives.some(primitive => {
    if (primitive.kind === 'rect' || primitive.kind === 'circle' || primitive.kind === 'arc') {
      return true;
    }

    if (primitive.kind !== 'polyline') {
      return false;
    }

    if (primitive.points.length >= 4) {
      return true;
    }

    if (primitive.points.length !== 2) {
      return false;
    }

    const [start, end] = primitive.points;
    return Math.abs(start.x - end.x) > 0.25 && Math.abs(start.y - end.y) > 0.25;
  });
}

function resolveImportedPinTextAnchor(
  role: 'pin-name' | 'pin-number',
  nativeAnchor: ParsedLibraryPin['nameTextAnchor'] | ParsedLibraryPin['numberTextAnchor'],
  fallbackAnchor: 'start' | 'middle' | 'end',
  pinAngle: 0 | 90 | 180 | 270,
) {
  void role;
  void pinAngle;
  return nativeAnchor ?? fallbackAnchor;
}

function resolveImportedPinTextBaseline(
  role: 'pin-name' | 'pin-number',
  nativeBaseline: ParsedLibraryPin['nameBaseline'] | ParsedLibraryPin['numberBaseline'],
  fallbackBaseline: 'auto' | 'middle' | 'hanging' | 'ideographic',
  pinAngle: 0 | 90 | 180 | 270,
) {
  void role;
  void pinAngle;
  return nativeBaseline ?? fallbackBaseline;
}

function resolveImportedPropertyTextAlignment(
  symbol: ParsedLibrarySymbol,
  derivedKind: string | undefined,
  explicitAnchor: 'start' | 'middle' | 'end' | undefined,
  explicitBaseline: 'auto' | 'middle' | 'hanging' | 'ideographic' | undefined,
  alignmentExplicit: boolean,
  point: Point,
  angle: 0 | 90 | 180 | 270
) {
  const isPowerLike =
    symbol.isPowerSymbol ||
    derivedKind === 'ground' ||
    derivedKind === 'pwr-flag' ||
    derivedKind === 'tpl_external_power';

  const bounds = symbol.bodyBoundsMm;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const horizontalPadding = Math.min(Math.max(width * 0.08, 0.8), 1.8);
  const verticalPadding = Math.min(Math.max(height * 0.08, 0.8), 1.8);
  const isOutsideLeft = point.x <= bounds.minX + horizontalPadding;
  const isOutsideRight = point.x >= bounds.maxX - horizontalPadding;
  const isAboveBody = point.y <= bounds.minY + verticalPadding;
  const isBelowBody = point.y >= bounds.maxY - verticalPadding;
  const sideDistanceX = Math.abs(point.x - centerX);
  const sideDistanceY = Math.abs(point.y - centerY);
  const isSideMountedProperty = sideDistanceX > sideDistanceY * 1.15;
  const prefersCenteredTopBottomProperty =
    (isPowerLike || derivedKind === 'connector') &&
    (isAboveBody || isBelowBody);
  const isVerticalSideProperty =
    isSideMountedProperty &&
    (angle === 90 || angle === 270);

  if (explicitAnchor || explicitBaseline) {
    if (isPowerLike && (isAboveBody || isBelowBody)) {
      return {
        textAnchor: 'middle',
        baseline: isAboveBody ? 'ideographic' : 'hanging',
      } as const;
    }

    const inferredBaseline =
      point.y <= bounds.minY + verticalPadding
        ? 'ideographic'
        : point.y >= bounds.maxY - verticalPadding
          ? 'hanging'
          : angle === 90
            ? 'ideographic'
            : angle === 270
              ? 'hanging'
              : 'middle';
    const inferredAnchor =
      point.x <= bounds.minX + horizontalPadding
        ? 'end'
        : point.x >= bounds.maxX - horizontalPadding
          ? 'start'
          : 'middle';

    if (!alignmentExplicit && prefersCenteredTopBottomProperty) {
      return {
        textAnchor: 'middle',
        baseline: isAboveBody ? 'ideographic' : 'hanging',
      } as const;
    }

    if (!alignmentExplicit && isVerticalSideProperty && !isPowerLike) {
      return {
        textAnchor: explicitAnchor ?? inferredAnchor,
        baseline: 'middle',
      } as const;
    }

    if (!alignmentExplicit && isPowerLike && (isOutsideLeft || isOutsideRight)) {
      return {
        textAnchor: 'middle',
        baseline:
          angle === 90 || angle === 270
            ? 'middle'
            : 'middle',
      } as const;
    }

    return {
      textAnchor: explicitAnchor ?? inferredAnchor,
      baseline: explicitBaseline ?? inferredBaseline,
    } as const;
  }

  if (prefersCenteredTopBottomProperty) {
    return {
      textAnchor: 'middle',
      baseline: isAboveBody ? 'ideographic' : 'hanging',
    } as const;
  }

  if (isPowerLike) {
    if (isOutsideLeft || isOutsideRight) {
      return {
        textAnchor: 'middle',
        baseline: 'middle',
      } as const;
    }

    const inferredAnchor =
      isOutsideLeft
        ? 'end'
        : isOutsideRight
          ? 'start'
          : 'middle';
    const inferredBaseline =
      isAboveBody
        ? 'ideographic'
        : isBelowBody
          ? 'hanging'
          : angle === 90
            ? 'ideographic'
            : angle === 270
              ? 'hanging'
              : 'middle';
    return {
      textAnchor: inferredAnchor,
      baseline: inferredBaseline,
    } as const;
  }

  if (isVerticalSideProperty) {
    const sideAnchor =
      isOutsideLeft
        ? 'end'
        : isOutsideRight
          ? 'start'
          : 'middle';
    return {
      textAnchor: sideAnchor,
      baseline: 'middle',
    } as const;
  }

  const inferredAnchor =
    isOutsideLeft
      ? 'end'
      : isOutsideRight
        ? 'start'
        : 'middle';
  const inferredBaseline =
    isAboveBody
      ? 'ideographic'
      : isBelowBody
        ? 'hanging'
        : angle === 90
          ? point.y <= centerY
            ? 'ideographic'
            : 'hanging'
          : angle === 270
            ? point.y >= centerY
              ? 'hanging'
              : 'ideographic'
            : 'middle';

  return {
    textAnchor: inferredAnchor,
    baseline: inferredBaseline,
  } as const;
}

function adjustImportedPropertyTextPoint(
  symbol: ParsedLibrarySymbol,
  derivedKind: string | undefined,
  point: Point,
  alignment: {
    textAnchor: 'start' | 'middle' | 'end';
    baseline: 'auto' | 'middle' | 'hanging' | 'ideographic';
  },
  options?: {
    alignmentExplicit?: boolean;
  }
) {
  const bounds = symbol.bodyBoundsMm;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const horizontalPadding = Math.min(Math.max(width * 0.08, 0.8), 1.8);
  const verticalPadding = Math.min(Math.max(height * 0.08, 0.8), 1.8);
  const isOutsideLeft = point.x <= bounds.minX + horizontalPadding;
  const isOutsideRight = point.x >= bounds.maxX - horizontalPadding;
  const isAboveBody = point.y <= bounds.minY + verticalPadding;
  const isBelowBody = point.y >= bounds.maxY - verticalPadding;
  const isDenseIc = derivedKind === 'mcu' || (derivedKind !== 'connector' && symbol.pins.length >= 20);
  const isConnector = derivedKind === 'connector';
  const isPowerLike = symbol.isPowerSymbol || derivedKind === 'ground' || derivedKind === 'pwr-flag';
  const isCompactDiscreteLike =
    !isDenseIc &&
    !isConnector &&
    !isPowerLike &&
    symbol.pins.length > 0 &&
    symbol.pins.length <= 3;
  const connectorPinAngles = new Set(symbol.pins.map(pin => normalizeRotation(pin.at.angle)));
  const isOneSidedConnector =
    isConnector &&
    symbol.pins.length >= 2 &&
    connectorPinAngles.size === 1;

  if (options?.alignmentExplicit && isOneSidedConnector) {
    const connectorInwardNudge = Math.min(Math.max(width * 0.074, 0.98), 1.32);
    const nudgedX =
      isOutsideRight && alignment.textAnchor === 'start'
        ? point.x - connectorInwardNudge
        : isOutsideLeft && alignment.textAnchor === 'end'
          ? point.x + connectorInwardNudge
          : point.x;

    return {
      x: Number(nudgedX.toFixed(3)),
      y: Number(point.y.toFixed(3)),
    };
  }

  if (
    options?.alignmentExplicit &&
    isConnector &&
    alignment.textAnchor === 'middle' &&
    (isAboveBody || isBelowBody || point.y < bounds.minY || point.y > bounds.maxY)
  ) {
    const centeredConnectorVerticalNudge = Math.min(Math.max(height * 0.082, 0.52), 1.18);
    const nudgedY =
      (isAboveBody || point.y < bounds.minY) && alignment.baseline === 'ideographic'
        ? point.y + centeredConnectorVerticalNudge
        : (isBelowBody || point.y > bounds.maxY) && alignment.baseline === 'hanging'
          ? point.y - centeredConnectorVerticalNudge
          : point.y;

    return {
      x: Number(point.x.toFixed(3)),
      y: Number(nudgedY.toFixed(3)),
    };
  }

  if (options?.alignmentExplicit && isCompactDiscreteLike) {
    const compactHorizontalNudge = Math.min(Math.max(width * 0.058, 0.46), 0.98);
    const compactVerticalNudge = Math.min(Math.max(height * 0.04, 0.14), 0.34);
    const compactCenteredVerticalNudge = Math.min(Math.max(height * 0.16, 0.36), 0.68);
    const nudgedX =
      isOutsideRight && alignment.textAnchor === 'start'
        ? point.x - compactHorizontalNudge
        : isOutsideLeft && alignment.textAnchor === 'end'
          ? point.x + compactHorizontalNudge
          : point.x;
    const nudgedY =
      isAboveBody && alignment.baseline === 'ideographic'
        ? point.y - compactVerticalNudge
        : isBelowBody && alignment.baseline === 'hanging'
          ? point.y + compactVerticalNudge
          : (isAboveBody || point.y < bounds.minY) && alignment.baseline === 'middle'
            ? point.y + compactCenteredVerticalNudge
            : (isBelowBody || point.y > bounds.maxY) && alignment.baseline === 'middle'
              ? point.y - compactCenteredVerticalNudge
          : point.y;

    return {
      x: Number(nudgedX.toFixed(3)),
      y: Number(nudgedY.toFixed(3)),
    };
  }

  if (options?.alignmentExplicit) {
    return {
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
    };
  }

  if (
    isConnector &&
    alignment.textAnchor === 'middle' &&
    (isAboveBody || isBelowBody || point.y < bounds.minY || point.y > bounds.maxY)
  ) {
    const centeredConnectorVerticalNudge = Math.min(Math.max(height * 0.104, 0.82), 1.84);
    const nudgedY =
      (isAboveBody || point.y < bounds.minY) && alignment.baseline === 'ideographic'
        ? point.y + centeredConnectorVerticalNudge
        : (isBelowBody || point.y > bounds.maxY) && alignment.baseline === 'hanging'
          ? point.y - centeredConnectorVerticalNudge
          : point.y;

    return {
      x: Number(point.x.toFixed(3)),
      y: Number(nudgedY.toFixed(3)),
    };
  }

  if (isCompactDiscreteLike) {
    const compactHorizontalNudge = Math.min(Math.max(width * 0.078, 0.72), 1.38);
    const compactVerticalNudge = Math.min(Math.max(height * 0.075, 0.34), 0.92);
    const nudgedX =
      isOutsideRight && alignment.textAnchor === 'start'
        ? point.x - compactHorizontalNudge
        : isOutsideLeft && alignment.textAnchor === 'end'
          ? point.x + compactHorizontalNudge
          : point.x;
    const nudgedY =
      (isAboveBody || point.y < bounds.minY) &&
      (alignment.baseline === 'ideographic' || alignment.textAnchor === 'middle')
        ? point.y + compactVerticalNudge
        : (isBelowBody || point.y > bounds.maxY) &&
            (alignment.baseline === 'hanging' || alignment.textAnchor === 'middle')
          ? point.y - compactVerticalNudge
          : point.y;

    return {
      x: Number(nudgedX.toFixed(3)),
      y: Number(nudgedY.toFixed(3)),
    };
  }

  const shouldNudge =
    isDenseIc ||
    isConnector ||
    isPowerLike;

  if (!shouldNudge) {
    return {
      x: Number(point.x.toFixed(3)),
      y: Number(point.y.toFixed(3)),
    };
  }

  const horizontalNudge = isDenseIc
    ? Math.min(Math.max(width * 0.065, 0.9), 1.9)
    : isConnector
      ? Math.min(Math.max(width * 0.024, 0.22), 0.6)
      : Math.min(Math.max(width * 0.024, 0.18), 0.52);
  const verticalNudge = isDenseIc
    ? Math.min(Math.max(height * 0.032, 0.34), 0.88)
    : isPowerLike
      ? Math.min(Math.max(height * 0.018, 0.14), 0.34)
      : Math.min(Math.max(height * 0.02, 0.18), 0.42);

  let adjustedX = point.x;
  let adjustedY = point.y;

  if (isOutsideLeft && alignment.textAnchor === 'end') {
    adjustedX += isOneSidedConnector ? horizontalNudge * 2.1 : horizontalNudge;
  } else if (isOutsideRight && alignment.textAnchor === 'start') {
    adjustedX -= isOneSidedConnector ? horizontalNudge * 2.1 : horizontalNudge;
  }

  if (isAboveBody && alignment.baseline === 'ideographic') {
    adjustedY -= isOneSidedConnector ? verticalNudge * 0.84 : verticalNudge;
  } else if (isBelowBody && alignment.baseline === 'hanging') {
    adjustedY += isOneSidedConnector ? verticalNudge * 0.84 : verticalNudge;
  }

  return {
    x: Number(adjustedX.toFixed(3)),
    y: Number(adjustedY.toFixed(3)),
  };
}

function buildImportedPinVisualPrimitives(
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance,
  derivedKind: string | undefined
): ImportedSchematicPrimitive[] {
  const includePinText = derivedKind === 'connector' || looksLikeIcSymbol(symbol, instance);
  const isDensePinLayout = derivedKind !== 'connector' && symbol.pins.length >= 20;
  const sourceTextRoles = new Set(
    symbol.graphics.flatMap(primitive =>
      primitive.kind === 'text' && primitive.role ? [primitive.role] : []
    )
  );
  const shouldGeneratePinNumbers = !symbol.hidePinNumbers && !sourceTextRoles.has('pin-number');
  const shouldGeneratePinNames = !symbol.pinNamesHide && !sourceTextRoles.has('pin-name');
  const stemPrimitives: ImportedSchematicPrimitive[] = [];
  const pinTextPrimitives: ImportedSchematicPrimitive[] = [];
  const centerX = (symbol.bodyBoundsMm.minX + symbol.bodyBoundsMm.maxX) / 2;
  const pinNameOffsetMm = symbol.pinNamesOffsetMm ?? 0.508;

  for (const pin of symbol.pins) {
    if (pin.hidden) {
      continue;
    }

    if (!(pin.lengthMm > 0.01)) {
      continue;
    }

    const outerPoint = { x: pin.at.x, y: pin.at.y };
    const innerPoint = getPinInnerPointMm(pin);

    stemPrimitives.push({
      kind: 'polyline',
      points: [outerPoint, innerPoint],
    });

    if (!includePinText) {
      continue;
    }

    const isConnector = derivedKind === 'connector';
    const compactPinName = isCompactImportedPinName(pin.name);
    const layout = buildImportedPinTextLayout(pin, innerPoint, {
      centerX,
      isConnector,
      isDensePinLayout,
      pinNameOffsetMm,
      pinPitchMm: estimateImportedPinPitchMm(pin, symbol.pins),
      compactPinName,
    });

    const pinPitchMm = estimateImportedPinPitchMm(pin, symbol.pins) ?? (isDensePinLayout ? 2.54 : 3.81);
    const isTightPitch = pinPitchMm <= 2.6;
    const pinNameVisualLength = getImportedPinNameVisualLength(pin.name);
    const longPinName = pinNameVisualLength >= 8;
    const veryLongPinName = pinNameVisualLength >= 12;
    const preferredNumberSize = isConnector
      ? (isTightPitch ? 0.66 : 0.74)
      : isDensePinLayout
        ? (isTightPitch ? 0.58 : 0.64)
        : 0.9;
    let preferredNameSize = isConnector
      ? (isTightPitch ? 0.68 : 0.76)
      : isDensePinLayout
        ? (isTightPitch ? 0.66 : 0.72)
        : 0.96;

    if (longPinName) {
      preferredNameSize -= isConnector ? 0.06 : isDensePinLayout ? 0.08 : 0.05;
    }

    if (veryLongPinName) {
      preferredNameSize -= isConnector ? 0.08 : isDensePinLayout ? 0.06 : 0.07;
    }

    preferredNameSize = Math.max(
      preferredNameSize,
      isConnector ? 0.62 : isDensePinLayout ? 0.52 : 0.76
    );

    if (shouldGeneratePinNumbers) {
      pinTextPrimitives.push({
        kind: 'text',
        at: layout.pinNumberAt,
        text: pin.number,
        angle: normalizeRotation(pin.at.angle),
        sizeMm: pin.numberSizeMm
          ? Math.min(pin.numberSizeMm, preferredNumberSize)
          : preferredNumberSize,
        role: 'pin-number',
        textAnchor: resolveImportedPinTextAnchor('pin-number', pin.numberTextAnchor, layout.pinNumberAnchor, normalizeRotation(pin.at.angle)),
        baseline: resolveImportedPinTextBaseline('pin-number', pin.numberBaseline, layout.pinNumberBaseline, normalizeRotation(pin.at.angle)),
      });
    }

    if (shouldGeneratePinNames && shouldRenderImportedPinName(pin)) {
      pinTextPrimitives.push({
        kind: 'text',
        at: layout.pinNameAt,
        text: pin.name,
        angle: normalizeRotation(pin.at.angle),
        sizeMm: pin.nameSizeMm
          ? Math.min(pin.nameSizeMm, preferredNameSize)
          : preferredNameSize,
        role: 'pin-name',
        textAnchor: resolveImportedPinTextAnchor('pin-name', pin.nameTextAnchor, layout.pinNameAnchor, normalizeRotation(pin.at.angle)),
        baseline: resolveImportedPinTextBaseline('pin-name', pin.nameBaseline, layout.pinNameBaseline, normalizeRotation(pin.at.angle)),
      });
    }
  }

  return [...stemPrimitives, ...pinTextPrimitives];
}

function shouldPreferFallbackGraphicsForImportedSymbol(
  derivedKind: string | undefined,
  symbol: ParsedLibrarySymbol
) {
  void derivedKind;
  void symbol;
  return false;
}

function buildImportedFallbackPrimitives(
  templateId: string | undefined,
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance,
  bodyWidthMm: number,
  bodyHeightMm: number
): ImportedSchematicPrimitive[] {
  const fallbackKind = inferImportedFallbackKind(templateId, symbol, instance);

  switch (fallbackKind) {
    case 'tpl_resistor': {
      const half = Math.max(bodyWidthMm / 2, 6.5);
      const step = half / 3.5;
      return [
        toImportedPolyline([
          [-half, 0],
          [-half + step, 0],
          [-half + step * 1.45, -2.2],
          [-half + step * 2.1, 2.2],
          [-half + step * 2.75, -2.2],
          [-half + step * 3.4, 2.2],
          [half - step, 0],
          [half, 0],
        ]),
      ];
    }
    case 'tpl_capacitor': {
      const half = Math.max(bodyWidthMm / 2, 5.08);
      return [
        toImportedPolyline([[-half, 0], [-1.1, 0]]),
        toImportedPolyline([[-1.1, -4], [-1.1, 4]]),
        toImportedPolyline([[1.1, -4], [1.1, 4]]),
        toImportedPolyline([[1.1, 0], [half, 0]]),
      ];
    }
    case 'tpl_inductor': {
      const half = Math.max(bodyWidthMm / 2, 6.5);
      return [
        toImportedPolyline([[-half, 0], [-4.4, 0]]),
        { kind: 'arc', start: { x: -4.4, y: 0 }, mid: { x: -3.3, y: -2.4 }, end: { x: -2.2, y: 0 } },
        { kind: 'arc', start: { x: -2.2, y: 0 }, mid: { x: -1.1, y: -2.4 }, end: { x: 0, y: 0 } },
        { kind: 'arc', start: { x: 0, y: 0 }, mid: { x: 1.1, y: -2.4 }, end: { x: 2.2, y: 0 } },
        { kind: 'arc', start: { x: 2.2, y: 0 }, mid: { x: 3.3, y: -2.4 }, end: { x: 4.4, y: 0 } },
        toImportedPolyline([[4.4, 0], [half, 0]]),
      ];
    }
    case 'tpl_diode':
    case 'tpl_led': {
      const half = Math.max(bodyWidthMm / 2, 6.5);
      const diodeBody: ImportedSchematicPrimitive[] = [
        toImportedPolyline([[-half, 0], [-3.6, 0]]),
        toImportedPolyline([[-3.6, -3.6], [2.2, 0], [-3.6, 3.6], [-3.6, -3.6]]),
        toImportedPolyline([[2.8, -4], [2.8, 4]]),
        toImportedPolyline([[2.8, 0], [half, 0]]),
      ];
      if (templateId === 'tpl_led') {
        return [
          ...diodeBody,
          toImportedPolyline([[0.6, -5.8], [3.6, -8.8]]),
          toImportedPolyline([[2.8, -8.8], [3.6, -8.8], [3.6, -8]]),
          toImportedPolyline([[-1.1, -4.2], [1.9, -7.2]]),
          toImportedPolyline([[1.1, -7.2], [1.9, -7.2], [1.9, -6.4]]),
        ];
      }
      return diodeBody;
    }
    case 'tpl_crystal':
      return [
        toImportedPolyline([[-7, 0], [-4, 0]]),
        { kind: 'rect', start: { x: -4, y: -4.5 }, end: { x: 4, y: 4.5 } },
        toImportedPolyline([[4, 0], [7, 0]]),
      ];
    case 'tpl_external_power':
      return orientImportedFallbackPrimitives([
        toImportedPolyline([[0, 0], [0, -4.2]]),
        toImportedPolyline([[0, -7.1], [-3.4, -3.8]]),
        toImportedPolyline([[0, -7.1], [3.4, -3.8]]),
      ], symbol, 'tpl_external_power');
    case 'ground':
      return orientImportedFallbackPrimitives([
        toImportedPolyline([[0, 0], [0, 3.6]]),
        toImportedPolyline([[-4.2, 3.6], [4.2, 3.6]]),
        toImportedPolyline([[-2.8, 5.8], [2.8, 5.8]]),
        toImportedPolyline([[-1.3, 7.7], [1.3, 7.7]]),
      ], symbol, 'ground');
    case 'pwr-flag':
      return orientImportedFallbackPrimitives([
        toImportedPolyline([[0, 0], [0, 5.6]]),
        toImportedPolyline([[0, 5.6], [4.9, 3.2], [0, 0.7], [0, 5.6]]),
      ], symbol, 'pwr-flag');
    case 'battery':
      return [
        toImportedPolyline([[-7.4, 0], [-3.8, 0]]),
        toImportedPolyline([[-3.8, -5.6], [-3.8, 5.6]]),
        toImportedPolyline([[0, -3.4], [0, 3.4]]),
        toImportedPolyline([[3.2, -5.6], [3.2, 5.6]]),
        toImportedPolyline([[3.2, 0], [7.4, 0]]),
      ];
    case 'connector': {
      const innerPoints = symbol.pins.map(getPinInnerPointMm);
      const xs = innerPoints.map(point => point.x);
      const ys = innerPoints.map(point => point.y);
      const pinPitchMm = measureNearestPinPitchMm(symbol.pins) ?? 2.54;
      const isTightPitch = pinPitchMm <= 2.6;
      const minX = Math.min(...xs, -2);
      const maxX = Math.max(...xs, 2);
      const minY = Math.min(...ys, -4);
      const maxY = Math.max(...ys, 4);
      const centerX = (minX + maxX) / 2;
      const width = Math.max(maxX - minX + (isTightPitch ? 0.88 : 1.05), 4);
      const height = Math.max(maxY - minY + (isTightPitch ? 1.12 : 1.32), 4.4);
      const left = centerX - width / 2;
      const right = centerX + width / 2;
      const top = minY - (isTightPitch ? 0.56 : 0.7);
      const bottom = top + height;
      return [
        {
          kind: 'rect',
          start: { x: left, y: top },
          end: { x: right, y: bottom },
        },
      ];
    }
    default:
      return [{
        kind: 'rect',
        start: { x: -bodyWidthMm / 2, y: -bodyHeightMm / 2 },
        end: { x: bodyWidthMm / 2, y: bodyHeightMm / 2 },
      }];
  }
}

function buildImportedSourceDerivedPrimitives(
  templateId: string | undefined,
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance
): ImportedSchematicPrimitive[] {
  const derivedKind = inferImportedFallbackKind(templateId, symbol, instance);

  if (derivedKind === 'connector') {
    const bounds = measurePinInnerBounds(symbol.pins);
    if (!bounds) {
      return [];
    }
    const pinPitchMm = measureNearestPinPitchMm(symbol.pins) ?? 2.54;
    const isTightPitch = pinPitchMm <= 2.6;

    if (looksLikeBoardHeaderSymbol(symbol, instance)) {
      const paddingX = isTightPitch ? 1.18 : 1.36;
      const paddingY = isTightPitch ? 1.02 : 1.18;
      return [{
        kind: 'rect',
        start: { x: bounds.minX - paddingX, y: bounds.minY - paddingY },
        end: { x: bounds.maxX + paddingX, y: bounds.maxY + paddingY },
      }];
    }

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const width = Math.max(bounds.maxX - bounds.minX + (isTightPitch ? 0.68 : 0.84), 4);
    const height = Math.max(bounds.maxY - bounds.minY + (isTightPitch ? 0.9 : 1.08), 4.1);
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const top = bounds.minY - (isTightPitch ? 0.44 : 0.58);
    const bottom = top + height;

    return [{
      kind: 'rect',
      start: { x: left, y: top },
      end: { x: right, y: bottom },
    }];
  }

  if (!looksLikeIcSymbol(symbol, instance)) {
    return [];
  }

  const bounds = measurePinInnerBounds(symbol.pins);
  if (!bounds) {
    return [];
  }
  const paddingX = 1.8;
  const paddingY = 1.8;

  return [{
    kind: 'rect',
    start: { x: bounds.minX - paddingX, y: bounds.minY - paddingY },
    end: { x: bounds.maxX + paddingX, y: bounds.maxY + paddingY },
  }];
}

function buildImportedGeometry(
  symbol: ParsedLibrarySymbol,
  pinNumberToId: Map<string, string>,
  instance: ParsedSchematicInstance,
  fallbackTemplateId?: string
): ImportedSchematicGeometry {
  const transformedSymbol: ParsedLibrarySymbol = {
    ...symbol,
    pins: symbol.pins.map(pin => transformPinForInstance(pin, instance)),
    graphics: symbol.graphics.map(primitive => transformPrimitiveForInstance(primitive, instance)),
  };
  const derivedKind = inferImportedFallbackKind(fallbackTemplateId, transformedSymbol, instance);
  const pinAnchors = transformedSymbol.pins.flatMap(pin => {
    const pinId = pinNumberToId.get(pin.number);
    if (!pinId) {
      return [];
    }

    return [{
      pinId,
      label: pin.name,
      number: pin.number,
      at: { x: pin.at.x, y: pin.at.y },
      angle: normalizeRotation(pin.at.angle),
      lengthMm: pin.lengthMm,
    }];
  });

  const fallbackPrimitives = buildImportedFallbackPrimitives(
    fallbackTemplateId,
    transformedSymbol,
    instance,
    transformedSymbol.bodyWidthMm,
    transformedSymbol.bodyHeightMm
  );
  const preferFallbackGraphics = shouldPreferFallbackGraphicsForImportedSymbol(
    derivedKind,
    transformedSymbol
  );
  const sourceShapePrimitives = preferFallbackGraphics
    ? []
    : transformedSymbol.graphics.filter(primitive => primitive.kind !== 'text');
  const sourceAnnotationPrimitives = preferFallbackGraphics
    ? []
    : transformedSymbol.graphics.filter(
        (primitive): primitive is Extract<ImportedSchematicPrimitive, { kind: 'text' }> =>
          primitive.kind === 'text' && primitive.role === 'annotation'
      );
  const sourceTextRoles = new Set(
    transformedSymbol.graphics.flatMap(primitive =>
      primitive.kind === 'text' && primitive.role ? [primitive.role] : []
    )
  );
  const hasConnectorBodyRect =
    derivedKind === 'connector' &&
    hasImportedConnectorBodyPrimitive(sourceShapePrimitives);
  const sourceDerivedPrimitives =
    sourceShapePrimitives.length === 0 || (derivedKind === 'connector' && !hasConnectorBodyRect)
      ? buildImportedSourceDerivedPrimitives(fallbackTemplateId, transformedSymbol, instance)
      : [];
  const usesFallbackGraphics = sourceShapePrimitives.length === 0 && sourceDerivedPrimitives.length === 0;
  const pinVisualPrimitives = buildImportedPinVisualPrimitives(transformedSymbol, instance, derivedKind);
  const shouldSuppressReferenceText = shouldSuppressImportedReferenceText(derivedKind, instance);
  const shouldSuppressValueText = shouldSuppressImportedValueText(derivedKind, instance);
  const toImportedLocalTextPoint = (absoluteAt: { x: number; y: number }) => {
    const canvasRotation = toCanvasRotation(instance.at.rotation);
    const delta = {
      x: Number((absoluteAt.x - instance.at.x).toFixed(3)),
      y: Number((absoluteAt.y - instance.at.y).toFixed(3)),
    };
    const local = unrotatePoint(delta, canvasRotation);

    return {
      x: Number(local.x.toFixed(3)),
      y: Number(local.y.toFixed(3)),
    };
  };
  const toImportedLocalTextAngle = (absoluteRotation: 0 | 90 | 180 | 270) =>
    normalizeRotation(absoluteRotation - toCanvasRotation(instance.at.rotation));
  const referenceLocalPoint = toImportedLocalTextPoint(
    instance.referenceAt ?? { x: instance.at.x, y: instance.at.y }
  );
  const referenceLocalAngle = toImportedLocalTextAngle(instance.referenceAt?.rotation ?? 0);
  const valueLocalPoint = toImportedLocalTextPoint(
    instance.valueAt ?? { x: instance.at.x, y: instance.at.y }
  );
  const valueLocalAngle = toImportedLocalTextAngle(instance.valueAt?.rotation ?? 0);
  const referencePropertyAlignment = resolveImportedPropertyTextAlignment(
    transformedSymbol,
    derivedKind,
    instance.referenceTextAnchor,
    instance.referenceBaseline,
    Boolean(instance.referenceAlignmentExplicit),
    referenceLocalPoint,
    referenceLocalAngle
  );
  const adjustedReferenceLocalPoint = adjustImportedPropertyTextPoint(
    transformedSymbol,
    derivedKind,
    referenceLocalPoint,
    referencePropertyAlignment,
    { alignmentExplicit: Boolean(instance.referenceAlignmentExplicit) }
  );
  const valuePropertyAlignment = resolveImportedPropertyTextAlignment(
    transformedSymbol,
    derivedKind,
    instance.valueTextAnchor,
    instance.valueBaseline,
    Boolean(instance.valueAlignmentExplicit),
    valueLocalPoint,
    valueLocalAngle
  );
  const adjustedValueLocalPoint = adjustImportedPropertyTextPoint(
    transformedSymbol,
    derivedKind,
    valueLocalPoint,
    valuePropertyAlignment,
    { alignmentExplicit: Boolean(instance.valueAlignmentExplicit) }
  );
  const mirroredReferenceAlignment = mirrorTextAlignment(
    referencePropertyAlignment.textAnchor,
    referencePropertyAlignment.baseline,
    instance.at.mirrorX,
    instance.at.mirrorY
  );
  const mirroredValueAlignment = mirrorTextAlignment(
    valuePropertyAlignment.textAnchor,
    valuePropertyAlignment.baseline,
    instance.at.mirrorX,
    instance.at.mirrorY
  );

  const propertyTextPrimitives: ImportedSchematicPrimitive[] = [
    ...(!shouldSuppressReferenceText &&
    !sourceTextRoles.has('reference') &&
    instance.referenceAt
      ? [{
          kind: 'text' as const,
          at: adjustedReferenceLocalPoint,
          text: instance.reference,
          angle: referenceLocalAngle,
          originalAngle: referenceLocalAngle,
          preserveNativeOrientation: true,
          sizeMm: instance.referenceSizeMm ?? 1.27,
          role: 'reference' as const,
          textAnchor: mirroredReferenceAlignment.textAnchor,
          baseline: mirroredReferenceAlignment.baseline,
          alignmentExplicit: instance.referenceAlignmentExplicit,
        }]
      : []),
    ...(!shouldSuppressValueText &&
    !sourceTextRoles.has('value') &&
    instance.valueAt
      ? [{
          kind: 'text' as const,
          at: adjustedValueLocalPoint,
          text: instance.value,
          angle: valueLocalAngle,
          originalAngle: valueLocalAngle,
          preserveNativeOrientation: true,
          sizeMm: instance.valueSizeMm ?? 1.27,
          role: 'value' as const,
          textAnchor: mirroredValueAlignment.textAnchor,
          baseline: mirroredValueAlignment.baseline,
          alignmentExplicit: instance.valueAlignmentExplicit,
        }]
      : []),
  ];

  const base = {
    bounds: {
      minX: transformedSymbol.bodyBoundsMm.minX,
      minY: transformedSymbol.bodyBoundsMm.minY,
      maxX: transformedSymbol.bodyBoundsMm.maxX,
      maxY: transformedSymbol.bodyBoundsMm.maxY,
    },
    renderSource: usesFallbackGraphics ? 'fallback' : 'primitive',
    pinRenderMode: 'primitive',
    primitives: [
      ...(usesFallbackGraphics
        ? fallbackPrimitives
        : sourceShapePrimitives.length > 0
          ? [...sourceShapePrimitives, ...sourceDerivedPrimitives]
          : sourceDerivedPrimitives),
      ...sourceAnnotationPrimitives,
      ...pinVisualPrimitives,
      ...propertyTextPrimitives,
    ],
    pinAnchors,
    referenceLabel: instance.reference,
    valueLabel: instance.value,
  } satisfies ImportedSchematicGeometry;

  return {
    ...base,
    bounds: measureImportedGeometry(base, 0, { includeText: false }),
  };
}

function resolveSymbol(
  instance: ParsedSchematicInstance,
  symbol: ParsedLibrarySymbol,
  generatedPackages: Map<string, CustomComponentPackage>
): SymbolResolution {
  let boardId = BOARD_LIBRARY_INDEX.get(symbol.libraryId);
  if (!boardId) {
    const suffix = unprefixedLibrarySymbolName(symbol.libraryId);
    for (const [key, id] of BOARD_LIBRARY_INDEX.entries()) {
      if (unprefixedLibrarySymbolName(key) === suffix) {
        boardId = id;
        break;
      }
    }
  }
  if (boardId) {
    const board = getBoardById(boardId);
    return {
      kind: 'board',
      boardId,
      board,
      librarySymbol: symbol,
      pinNumberToId: reversePinMap(mappingDictionary.boards[boardId]?.pinMap ?? {}),
    };
  }

  let templateCandidates = TEMPLATE_LIBRARY_INDEX.get(symbol.libraryId);
  if (!templateCandidates) {
    const suffix = unprefixedLibrarySymbolName(symbol.libraryId);
    for (const [key, candidates] of TEMPLATE_LIBRARY_INDEX.entries()) {
      if (unprefixedLibrarySymbolName(key) === suffix) {
        templateCandidates = candidates;
        break;
      }
    }
  }
  const candidatesList = templateCandidates ?? [];
  for (const templateId of candidatesList) {
    const staticTemplate = getStaticTemplateById(templateId);
    if (!staticTemplate) {
      continue;
    }
    if (!templatePinsMatchSymbol(staticTemplate, symbol)) {
      continue;
    }

    const template = enrichComponentTemplate(staticTemplate);
    return {
      kind: 'template',
      templateId,
      template,
      librarySymbol: symbol,
      pinNumberToId: reversePinMap(mappingDictionary.templates[templateId]?.pinMap ?? {}),
      importedMapping: {
        templateId,
        confidence: 'high',
        source: 'kicad-library',
        matchedBy: symbol.libraryId,
        reference: instance.reference,
        value: instance.value,
        footprint: instance.footprint,
        libraryId: instance.libraryId,
      },
    };
  }

  const heuristicMapping = resolveKiCadTemplate({
    reference: instance.reference,
    value: instance.value,
    footprint: instance.footprint ?? symbol.footprint,
    libraryId: instance.libraryId,
  });
  if (heuristicMapping?.templateId) {
    const staticTemplate = getStaticTemplateById(heuristicMapping.templateId);
    if (staticTemplate) {
      const template = enrichComponentTemplate(staticTemplate);
      return {
        kind: 'template',
        templateId: heuristicMapping.templateId,
        template,
        librarySymbol: symbol,
        pinNumberToId: buildTemplatePinNumberToId(heuristicMapping.templateId, symbol),
        importedMapping: heuristicMapping,
      };
    }
  }

  const generated = generatedPackages.get(symbol.libraryId) ?? buildCustomPackageFromLibrarySymbol(symbol);
  generatedPackages.set(symbol.libraryId, generated);
  const template = enrichComponentTemplate(customComponentPackageToTemplate(generated));
  const knownLibraryMapping = resolveKnownCustomLibraryMapping(symbol, instance, generated.templateId);
  return {
    kind: 'custom',
    templateId: generated.templateId,
    template,
    customPackage: generated,
    librarySymbol: symbol,
    pinNumberToId: new Map(symbol.pins.map(pin => [pin.number, pin.name])),
    importedMapping: knownLibraryMapping ?? {
      templateId: generated.templateId,
      confidence: 'low',
      source: 'custom-fallback',
      matchedBy: symbol.libraryId,
      reference: instance.reference,
      value: instance.value,
      footprint: instance.footprint,
      libraryId: instance.libraryId,
    },
  };
}

function buildMockLibrarySymbol(instance: ParsedSchematicInstance): ParsedLibrarySymbol {
  const fallbackDisplayName = instance.libraryId.includes(':')
    ? instance.libraryId.split(':').pop() ?? instance.libraryId
    : instance.libraryId;
  const displayName = instance.value || fallbackDisplayName;
  const referencePrefix = instance.reference ? instance.reference.replace(/[0-9]/g, '') : 'U';

  return {
    libraryId: instance.libraryId,
    displayName,
    referencePrefix,
    footprint: instance.footprint,
    isPowerSymbol: false,
    hidePinNumbers: false,
    pinNamesHide: false,
    pinNamesOffsetMm: undefined,
    bodyBoundsMm: { minX: -10.16, minY: -5.08, maxX: 10.16, maxY: 5.08 },
    bodyWidthMm: 20.32,
    bodyHeightMm: 10.16,
    pins: [],
    graphics: [],
    variants: [],
  };
}

function dedupePinsByNumber(pins: ParsedLibraryPin[]) {
  const seen = new Set<string>();
  const deduped: ParsedLibraryPin[] = [];

  for (const pin of pins) {
    const key = pin.number;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(pin);
  }

  return deduped;
}

function specializeLibrarySymbolForInstance(
  symbol: ParsedLibrarySymbol,
  instance: ParsedSchematicInstance
): ParsedLibrarySymbol {
  if (symbol.variants.length === 0) {
    return symbol;
  }

  const fallbackVariants = symbol.variants.filter(variant =>
    variant.unit === null ||
    variant.unit === 0 ||
    variant.unit === instance.unit
  );

  if (fallbackVariants.length === 0) {
    return symbol;
  }

  const pins = dedupePinsByNumber([
    ...symbol.pins.map(pin => ({ ...pin, at: { ...pin.at } })),
    ...fallbackVariants.flatMap(variant =>
      variant.pins.map(pin => ({ ...pin, at: { ...pin.at } }))
    ),
  ]);
  const graphics = [
    ...symbol.graphics.map(primitive => structuredClone(primitive)),
    ...fallbackVariants.flatMap(variant => variant.graphics.map(primitive => structuredClone(primitive))),
  ];
  const bounds = measureLibrarySymbolBounds(pins, graphics);
  const resolvedPinNamesOffset = fallbackVariants.find(
    variant => variant.pinNamesOffsetMm !== undefined
  )?.pinNamesOffsetMm;

  return {
    ...symbol,
    isPowerSymbol: symbol.isPowerSymbol || fallbackVariants.some(variant => variant.isPowerSymbol),
    hidePinNumbers: symbol.hidePinNumbers || fallbackVariants.some(variant => variant.hidePinNumbers),
    pinNamesHide: symbol.pinNamesHide || fallbackVariants.some(variant => variant.pinNamesHide),
    pinNamesOffsetMm: symbol.pinNamesOffsetMm ?? resolvedPinNamesOffset,
    bodyBoundsMm: bounds.bodyBoundsMm,
    bodyWidthMm: bounds.bodyWidthMm,
    bodyHeightMm: bounds.bodyHeightMm,
    pins,
    graphics,
  };
}

function getOrResolveSymbolResolution(params: {
  instance: ParsedSchematicInstance;
  librarySymbols: Map<string, ParsedLibrarySymbol>;
  resolutions: Map<string, SymbolResolution>;
  generatedPackages: Map<string, CustomComponentPackage>;
}) {
  const { instance, librarySymbols, resolutions, generatedPackages } = params;
  const cacheKey = buildResolutionCacheKey(instance);
  const existing = resolutions.get(cacheKey);
  if (existing) {
    resolutions.set(instance.uuid, existing);
    return existing;
  }

  let librarySymbol = librarySymbols.get(instance.libraryId);
  if (!librarySymbol) {
    const instanceSuffix = unprefixedLibrarySymbolName(instance.libraryId);
    for (const [candidateId, candidateSymbol] of librarySymbols.entries()) {
      if (unprefixedLibrarySymbolName(candidateId) === instanceSuffix) {
        librarySymbol = candidateSymbol;
        break;
      }
    }
  }
  if (!librarySymbol) {
    librarySymbol = buildMockLibrarySymbol(instance);
  }
  librarySymbol = specializeLibrarySymbolForInstance(librarySymbol, instance);

  const resolved = resolveSymbol(instance, librarySymbol, generatedPackages);
  resolutions.set(cacheKey, resolved);
  resolutions.set(instance.uuid, resolved);
  return resolved;
}

function buildInstanceEndpoints(instance: ParsedSchematicInstance, resolution: SymbolResolution) {
  const endpointMap = new Map<string, Endpoint[]>();
  const pointMap = new Map<string, Point>();

  for (const rawPin of resolution.librarySymbol.pins) {
    const pin = transformPinForInstance(rawPin, instance);
    const pinId = resolution.pinNumberToId.get(pin.number);
    if (!pinId) {
      continue;
    }

    const rotated = rotatePoint({ x: pin.at.x, y: pin.at.y }, instance.at.rotation);
    const absolute = {
      x: Number((instance.at.x + rotated.x).toFixed(3)),
      y: Number((instance.at.y + rotated.y).toFixed(3)),
    };
    const endpoint =
      resolution.kind === 'board'
        ? { ownerType: 'board' as const, ownerId: resolution.boardId, pinId }
        : { ownerType: 'component' as const, ownerId: instance.uuid, pinId };
    const key = pointKey(absolute);
    const bucket = endpointMap.get(key) ?? [];
    bucket.push(endpoint);
    endpointMap.set(key, bucket);
    pointMap.set(key, absolute);
  }

  return { endpointMap, pointMap };
}

function inferCanvasBodySize(template: ComponentTemplate | undefined) {
  const explicit = template?.pcb?.bodySize;
  if (explicit) {
    return explicit;
  }

  switch (template?.id) {
    case 'tpl_resistor':
    case 'tpl_capacitor':
    case 'tpl_inductor':
    case 'tpl_diode':
      return { width: 76, height: 24 };
    case 'tpl_transistor_npn':
      return { width: 42, height: 32 };
    case 'tpl_external_power':
      return { width: 64, height: 32 };
    case 'tpl_driver_ic':
      return { width: 74, height: 56 };
    case 'tpl_level_shifter':
      return { width: 92, height: 42 };
    case 'tpl_adc_module':
      return { width: 78, height: 40 };
    default: {
      const pinCount = Math.max(template?.requiredPins.length ?? 0, 2);
      return {
        width: template?.category === 'PASSIVE' ? 64 : 96,
        height: Math.max(42, 28 + pinCount * 14),
      };
    }
  }
}

function rotateCanvasOffset(
  offset: Point,
  rotation: 0 | 90 | 180 | 270,
  body: { width: number; height: number }
) {
  const cx = body.width / 2;
  const cy = body.height / 2;
  const dx = offset.x - cx;
  const dy = offset.y - cy;

  switch (rotation) {
    case 90:
      return { x: cx - dy, y: cy + dx };
    case 180:
      return { x: cx - dx, y: cy - dy };
    case 270:
      return { x: cx + dy, y: cy - dx };
    default:
      return offset;
  }
}

function buildComponentPadOffsets(component: PlacedComponent, template: ComponentTemplate) {
  const body = inferCanvasBodySize(template);

  if (template.requiredPins.length === 0) {
    switch (template.id) {
      case 'tpl_resistor':
      case 'tpl_capacitor':
      case 'tpl_inductor':
      case 'tpl_diode':
        return {
          body,
          pads: [
            { pinId: '1', offset: { x: 10, y: body.height / 2 } },
            { pinId: '2', offset: { x: body.width - 10, y: body.height / 2 } },
          ],
        };
      case 'tpl_transistor_npn':
        return {
          body,
          pads: ['C', 'B', 'E'].map((label, index) => ({
            pinId: label,
            offset: { x: 10 + index * 11, y: body.height - 8 },
          })),
        };
      default:
        return { body, pads: [] as Array<{ pinId: string; offset: Point }> };
    }
  }

  const { leftPins, rightPins } = getComponentPinLayout(template.requiredPins, template.category);
  const leftGap = leftPins.length <= 1 ? 0 : (body.height - 20) / (leftPins.length - 1);
  const rightGap = rightPins.length <= 1 ? 0 : (body.height - 20) / (rightPins.length - 1);

  return {
    body,
    pads: [
      ...leftPins.map((pin, index) => ({
        pinId: pin.name,
        offset: { x: 8, y: 10 + index * leftGap },
      })),
      ...rightPins.map((pin, index) => ({
        pinId: pin.name,
        offset: { x: body.width - 8, y: 10 + index * rightGap },
      })),
    ],
  };
}

function addLayoutEndpoints(params: {
  boardId: string;
  components: PlacedComponent[];
  templateLookup: Map<string, ComponentTemplate>;
  endpointByPoint: Map<string, Endpoint[]>;
  points: Map<string, Point>;
}) {
  const { boardId, components, templateLookup, endpointByPoint, points } = params;
  const board = getBoardById(boardId);
  const minX = Math.min(...components.map(component => component.position.x), 280);
  const minY = Math.min(...components.map(component => component.position.y), 160);
  const boardBody = {
    width: 180,
    height: Math.max(110, 28 + Math.max(board.leftPins.length, board.digitalPins.length) * 12),
  };
  const boardPosition = {
    x: Math.max(40, minX - 250),
    y: Math.max(40, minY - 10),
  };
  const leftGap = board.leftPins.length <= 1 ? 0 : (boardBody.height - 24) / (board.leftPins.length - 1);
  const rightGap = board.digitalPins.length <= 1 ? 0 : (boardBody.height - 24) / (board.digitalPins.length - 1);

  const registerEndpoint = (endpoint: Endpoint, absoluteCanvasPoint: Point) => {
    const absoluteMmPoint = {
      x: Number((absoluteCanvasPoint.x * 0.18).toFixed(3)),
      y: Number((absoluteCanvasPoint.y * 0.18).toFixed(3)),
    };
    const key = pointKey(absoluteMmPoint);
    const bucket = endpointByPoint.get(key) ?? [];
    bucket.push(endpoint);
    endpointByPoint.set(key, bucket);
    points.set(key, absoluteMmPoint);
  };

  board.leftPins.forEach((pinId, index) => {
    registerEndpoint(
      { ownerType: 'board', ownerId: boardId, pinId },
      { x: boardPosition.x + 10, y: boardPosition.y + 12 + index * leftGap }
    );
  });

  board.digitalPins.forEach((pinId, index) => {
    registerEndpoint(
      { ownerType: 'board', ownerId: boardId, pinId },
      { x: boardPosition.x + boardBody.width - 10, y: boardPosition.y + 12 + index * rightGap }
    );
  });

  components.forEach(component => {
    const template = templateLookup.get(component.templateId) ?? getStaticTemplateById(component.templateId);
    if (!template) {
      return;
    }

    if (component.importedGeometry) {
      const importedLayout = layoutImportedGeometry(
        component.importedGeometry,
        component.rotation,
        IMPORTED_MM_TO_CANVAS,
        { preserveStoredBounds: true }
      );

      importedLayout.pinAnchors.forEach(pin => {
        registerEndpoint(
          { ownerType: 'component', ownerId: component.instanceId, pinId: pin.pinId },
          {
            x: component.position.x + pin.at.x,
            y: component.position.y + pin.at.y,
          }
        );
      });
      return;
    }

    const { body, pads } = buildComponentPadOffsets(component, template);
    pads.forEach(pad => {
      const rotatedOffset = rotateCanvasOffset(pad.offset, component.rotation, body);
      registerEndpoint(
        { ownerType: 'component', ownerId: component.instanceId, pinId: pad.pinId },
        {
          x: component.position.x + rotatedOffset.x,
          y: component.position.y + rotatedOffset.y,
        }
      );
    });
  });
}

function pointLiesOnSegment(point: Point, start: Point, end: Point) {
  const toleranceMm = POINT_SNAP_TOLERANCE_MM;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq <= Number.EPSILON) {
    const distanceSq = (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
    return distanceSq <= toleranceMm * toleranceMm;
  }

  const len = Math.sqrt(lengthSq);
  const cross = (point.y - start.y) * dx - (point.x - start.x) * dy;
  const distance = Math.abs(cross) / len;
  if (distance > toleranceMm) {
    return false;
  }

  const dot = (point.x - start.x) * dx + (point.y - start.y) * dy;
  const proj = dot / len;
  return proj >= -toleranceMm && proj <= len + toleranceMm;
}

function toCanvasPoint(point: Point): ImportedSchematicPoint {
  return {
    x: Number((point.x * MM_TO_CANVAS).toFixed(3)),
    y: Number((point.y * MM_TO_CANVAS).toFixed(3)),
  };
}

function toAbsoluteCanvasPoint(
  localPoint: { x: number; y: number },
  rotation: 0 | 90 | 180 | 270,
  instanceAt: Point,
  scale: number
): { x: number; y: number } {
  const rotated = rotatePoint(localPoint, rotation);
  return {
    x: Number((((instanceAt.x + rotated.x) * scale)).toFixed(3)),
    y: Number((((instanceAt.y + rotated.y) * scale)).toFixed(3)),
  };
}

function transformPrimitiveToAbsolute(
  primitive: ImportedSchematicPrimitive,
  rotation: 0 | 90 | 180 | 270,
  instanceAt: Point,
  scale: number
): ImportedSchematicPrimitive {
  switch (primitive.kind) {
    case 'rect':
      return {
        kind: 'rect',
        start: toAbsoluteCanvasPoint(primitive.start, rotation, instanceAt, scale),
        end: toAbsoluteCanvasPoint(primitive.end, rotation, instanceAt, scale),
        fill: primitive.fill,
        strokeStyle: primitive.strokeStyle,
        strokeWidth: primitive.strokeWidth ? Number((primitive.strokeWidth * scale).toFixed(3)) : undefined,
      };
    case 'polyline':
      return {
        kind: 'polyline',
        points: primitive.points.map(p => toAbsoluteCanvasPoint(p, rotation, instanceAt, scale)),
        fill: primitive.fill,
        strokeStyle: primitive.strokeStyle,
        strokeWidth: primitive.strokeWidth ? Number((primitive.strokeWidth * scale).toFixed(3)) : undefined,
      };
    case 'circle':
      return {
        kind: 'circle',
        center: toAbsoluteCanvasPoint(primitive.center, rotation, instanceAt, scale),
        radius: primitive.radius * scale,
        fill: primitive.fill,
        strokeStyle: primitive.strokeStyle,
        strokeWidth: primitive.strokeWidth ? Number((primitive.strokeWidth * scale).toFixed(3)) : undefined,
      };
    case 'arc':
      return {
        kind: 'arc',
        start: toAbsoluteCanvasPoint(primitive.start, rotation, instanceAt, scale),
        mid: toAbsoluteCanvasPoint(primitive.mid, rotation, instanceAt, scale),
        end: toAbsoluteCanvasPoint(primitive.end, rotation, instanceAt, scale),
        strokeStyle: primitive.strokeStyle,
        strokeWidth: primitive.strokeWidth ? Number((primitive.strokeWidth * scale).toFixed(3)) : undefined,
      };
    case 'text': {
      const sourceAngle = (((primitive.angle + rotation) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
      const finalAngle = getImportedTextDisplayAngle(sourceAngle, primitive.role);
      const isFlipped180 = Math.abs(sourceAngle - finalAngle) === 180;

      let textAnchor = primitive.textAnchor;
      let baseline = primitive.baseline;

      const directionalPinText =
        primitive.role === 'pin-name' || primitive.role === 'pin-number';

      if (directionalPinText && (!textAnchor || (textAnchor === 'middle' && (sourceAngle === 0 || sourceAngle === 180)))) {
        textAnchor = getImportedTextDisplayAnchor(sourceAngle, primitive.role);
      }

      if (
        directionalPinText &&
        (!baseline ||
          baseline === 'auto' ||
          (baseline === 'middle' && (sourceAngle === 90 || sourceAngle === 270)))
      ) {
        baseline = getImportedTextDisplayBaseline(sourceAngle, primitive.role);
      }

      if (isFlipped180 && primitive.role !== 'pin-name' && primitive.role !== 'pin-number') {
        if (textAnchor === 'start') {
          textAnchor = 'end';
        } else if (textAnchor === 'end') {
          textAnchor = 'start';
        }

        if (baseline === 'hanging') {
          baseline = 'ideographic';
        } else if (baseline === 'ideographic') {
          baseline = 'hanging';
        }
      }

      return {
        kind: 'text',
        at: toAbsoluteCanvasPoint(primitive.at, rotation, instanceAt, scale),
        text: primitive.text,
        angle: sourceAngle,
        originalAngle: sourceAngle,
        preserveNativeOrientation: primitive.preserveNativeOrientation,
        sizeMm: primitive.sizeMm,
        role: primitive.role,
        textAnchor,
        baseline,
      };
    }
  }
}

function transformPinAnchorToAbsolute(
  pin: ImportedSchematicPinAnchor,
  rotation: 0 | 90 | 180 | 270,
  instanceAt: Point,
  scale: number
): ImportedSchematicPinAnchor {
  const rotatedAngle = (((pin.angle + rotation) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
  return {
    pinId: pin.pinId,
    label: pin.label,
    number: pin.number,
    at: toAbsoluteCanvasPoint(pin.at, rotation, instanceAt, scale),
    angle: rotatedAngle,
    lengthMm: pin.lengthMm,
  };
}

function buildImportedSchematicScene(
  wireSegments: Array<{ start: Point; end: Point }>,
  junctions: Point[],
  labels: Array<{
    name: string;
    point: Point;
    angle?: 0 | 90 | 180 | 270;
    sizeMm?: number;
    textAnchor?: 'start' | 'middle' | 'end';
    baseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
  }>,
  drawings: ImportedSchematicPrimitive[],
  pageFrame: ParsedPageFrame | undefined,
  sheetFrames: Array<{
    start: Point;
    end: Point;
    name?: string;
    file?: string;
    pins: Array<{ text: string; at: Point; angle: 0 | 90 | 180 | 270 }>;
  }>,
  instances: ParsedSchematicInstance[],
  resolutions: Map<string, SymbolResolution>
): ImportedSchematicScene | null {
  if (
    wireSegments.length === 0 &&
    junctions.length === 0 &&
    labels.length === 0 &&
    drawings.length === 0 &&
    !pageFrame &&
    sheetFrames.length === 0 &&
    instances.length === 0
  ) {
    return null;
  }

  const symbols: ImportedSchematicSceneSymbol[] = [];

  for (const instance of instances) {
    const resolution = resolutions.get(instance.uuid);
    if (!resolution) {
      continue;
    }

    let templateId: string;
    let componentName: string;
    let importedMapping: ImportedKiCadMapping | undefined;

    if (resolution.kind === 'template' || resolution.kind === 'custom') {
      templateId = resolution.templateId;
      componentName = instance.value || resolution.template.name;
      importedMapping = resolution.importedMapping;
    } else if (resolution.kind === 'board') {
      templateId = resolution.boardId;
      componentName = instance.value || resolution.board.name;
      importedMapping = undefined;
    } else {
      continue;
    }

    const importedGeometry = buildImportedGeometry(
      resolution.librarySymbol,
      resolution.pinNumberToId,
      instance,
      templateId
    );

    const renderData = {
      templateId,
      componentName,
      value: instance.value,
      importedReference: instance.reference,
      importedMapping,
      importedGeometry,
    };

    const normalizedGeometry = normalizeImportedGeometryForRender(renderData);
    if (!normalizedGeometry) {
      continue;
    }

    const scale = IMPORTED_MM_TO_CANVAS;
    const canvasRotation = toCanvasRotation(instance.at.rotation);
    const absolutePrimitives = normalizedGeometry.primitives.map(primitive =>
      transformPrimitiveToAbsolute(primitive, canvasRotation, instance.at, scale)
    );

    const absolutePinAnchors = normalizedGeometry.pinAnchors.map(pin =>
      transformPinAnchorToAbsolute(pin, canvasRotation, instance.at, scale)
    );

    symbols.push({
      instanceId: instance.uuid,
      reference: instance.reference,
      value: instance.value,
      family: classifyImportedSymbolFamily(renderData),
      primitives: absolutePrimitives,
      pinAnchors: absolutePinAnchors,
    });
  }

  return {
    wireSegments: wireSegments.map(segment => ({
      start: toCanvasPoint(segment.start),
      end: toCanvasPoint(segment.end),
    })),
    junctions: junctions.map(toCanvasPoint),
    labels: labels.map(label => ({
      text: label.name,
      at: toCanvasPoint(label.point),
      angle: label.angle,
      sizeMm: label.sizeMm,
      textAnchor: label.textAnchor,
      baseline: label.baseline,
    })),
    drawings: drawings.map(drawing => transformPrimitiveToAbsolute(drawing, 0, { x: 0, y: 0 }, IMPORTED_MM_TO_CANVAS)),
    pageFrame: pageFrame
      ? {
          start: toCanvasPoint(pageFrame.start),
          end: toCanvasPoint(pageFrame.end),
          paper: pageFrame.paper,
          titleBlock: pageFrame.titleBlock,
        }
      : undefined,
    sheetFrames: sheetFrames.map(frame => ({
      start: toCanvasPoint(frame.start),
      end: toCanvasPoint(frame.end),
      name: frame.name,
      file: frame.file,
      pins: frame.pins.map(pin => ({
        text: pin.text,
        at: toCanvasPoint(pin.at),
        angle: pin.angle,
      })),
    })),
    symbols,
  };
}

class PointUnionFind {
  private parent = new Map<string, string>();

  ensure(key: string) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  find(key: string): string {
    this.ensure(key);
    const parent = this.parent.get(key)!;
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function unionSnappedPointBuckets(unionFind: PointUnionFind, points: Map<string, Point>) {
  const toleranceMm = POINT_SNAP_TOLERANCE_MM;
  if (!(toleranceMm > 0)) {
    return;
  }

  const buckets = new Map<string, Array<{ key: string; point: Point }>>();

  for (const [key, point] of points.entries()) {
    const bucketX = snapBucketIndex(point.x, toleranceMm);
    const bucketY = snapBucketIndex(point.y, toleranceMm);

    for (let x = bucketX - 1; x <= bucketX + 1; x += 1) {
      for (let y = bucketY - 1; y <= bucketY + 1; y += 1) {
        const neighborBucket = buckets.get(`${x}:${y}`) ?? [];
        for (const candidate of neighborBucket) {
          const dx = candidate.point.x - point.x;
          const dy = candidate.point.y - point.y;
          if ((dx * dx) + (dy * dy) <= toleranceMm * toleranceMm) {
            unionFind.union(candidate.key, key);
          }
        }
      }
    }

    const ownBucketKey = `${bucketX}:${bucketY}`;
    const ownBucket = buckets.get(ownBucketKey) ?? [];
    ownBucket.push({ key, point });
    buckets.set(ownBucketKey, ownBucket);
  }
}

function buildImportedPins(boardId: string, components: PlacedComponent[]) {
  const pins = buildDefaultProjectState(boardId).pins;
  for (const component of components) {
    for (const boardPinId of Object.values(component.assignedPins)) {
      const basePin = pins[boardPinId];
      if (!basePin) {
        continue;
      }
      pins[boardPinId] = {
        ...basePin,
        isUsed: true,
        connectedTo: component.instanceId,
        assignmentMode: 'manual',
      };
    }
  }
  return pins;
}

function createPlacedComponent(
  instance: ParsedSchematicInstance,
  resolution: Extract<SymbolResolution, { kind: 'template' | 'custom' }>,
  options?: { preferTemplateCanvasLayout?: boolean }
): PlacedComponent {
  const importedGeometry = buildImportedGeometry(
    resolution.librarySymbol,
    resolution.pinNumberToId,
    instance,
    resolution.templateId
  );
  const importedLayout = layoutImportedGeometry(
    importedGeometry,
    instance.at.rotation,
    MM_TO_CANVAS,
    { preserveStoredBounds: true }
  );
  const templateBody = inferCanvasBodySize(resolution.template);
  const nameCandidate = sanitizePlainText(instance.value || resolution.template.name, {
    maxLength: 80,
    fallback: resolution.template.name,
  });
  const maybeValue = sanitizePlainText(instance.value, { maxLength: 64, fallback: '' });
  const normalizedValue = maybeValue && maybeValue !== nameCandidate ? maybeValue : undefined;
  const position = options?.preferTemplateCanvasLayout
    ? {
        x: Math.round(instance.at.x * MM_TO_CANVAS - templateBody.width / 2),
        y: Math.round(instance.at.y * MM_TO_CANVAS - templateBody.height / 2),
      }
    : {
        x: Math.round((instance.at.x + importedLayout.bounds.minX) * MM_TO_CANVAS),
        y: Math.round((instance.at.y + importedLayout.bounds.minY) * MM_TO_CANVAS),
      };

  return {
    instanceId: instance.uuid,
    templateId: resolution.templateId,
    name: nameCandidate,
    value: normalizedValue,
    position,
    rotation: instance.at.rotation,
    assignedPins: {},
    isFullyRouted: false,
    importedGeometry,
    importedReference: instance.reference,
    importedMapping: resolution.importedMapping,
  };
}

function rankBoardPin(pinId: string) {
  if (pinId === 'GND') return 0;
  if (pinId === '5V' || pinId === '3.3V') return 1;
  if (pinId.startsWith('A')) return 2;
  return 3;
}

function choosePrimaryBoardEndpoint(endpoints: Endpoint[]) {
  return [...endpoints]
    .filter(endpoint => endpoint.ownerType === 'board')
    .sort((left, right) => rankBoardPin(left.pinId) - rankBoardPin(right.pinId))[0];
}

function looksLikePowerNetName(netName: string | undefined) {
  if (!netName) {
    return false;
  }

  const normalized = netName.trim().toUpperCase();
  return (
    normalized === 'GND' ||
    normalized === 'AGND' ||
    normalized === 'DGND' ||
    normalized === 'PGND' ||
    normalized === 'VSS' ||
    normalized === 'VEE' ||
    normalized === 'VCC' ||
    normalized === 'VDD' ||
    normalized === 'VIN' ||
    normalized === 'VBAT' ||
    normalized === 'VBUS' ||
    normalized === 'VS' ||
    normalized === 'VDDA' ||
    normalized === 'VDDD' ||
    /^\+?(3V3|3\.3V|5V|12V|24V)$/.test(normalized)
  );
}

function getJoinableLabelScopeKey(label: {
  source: 'label' | 'sheet-pin' | 'implicit-power';
  kind: 'local' | 'global' | 'hierarchical';
  name: string;
}) {
  const normalizedName = canonicalizeJoinableNetLabel(label.name);
  if (!normalizedName) {
    return null;
  }

  if (label.source === 'sheet-pin') {
    return null;
  }

  if (label.source === 'implicit-power' || label.kind === 'global') {
    return `global:${normalizedName}`;
  }

  if (label.kind === 'hierarchical') {
    return `hierarchical:${normalizedName}`;
  }

  return `local:${normalizedName}`;
}

function buildConnections(params: {
  components: PlacedComponent[];
  componentById: Map<string, PlacedComponent>;
  endpointByPoint: Map<string, Endpoint[]>;
  points: Map<string, Point>;
  segments: Array<{ start: Point; end: Point }>;
  junctions: Point[];
  labels: Array<{ kind: 'local' | 'global' | 'hierarchical'; name: string; point: Point }>;
  sheetPins?: Array<{ name: string; point: Point; sheetName?: string; sheetFile?: string }>;
}) {
  const { componentById, endpointByPoint, points, segments, junctions, labels, sheetPins = [] } = params;
  const unionFind = new PointUnionFind();
  const connectivityPoints = new Map(points);
  const implicitPowerLabels = Array.from(endpointByPoint.entries()).flatMap(([key, endpoints]) => endpoints.flatMap(endpoint => {
    if (endpoint.ownerType !== 'component') {
      return [];
    }

    const component = componentById.get(endpoint.ownerId);
    const libraryId = component?.importedMapping?.libraryId?.toLowerCase() ?? '';
    const powerName = component?.name?.trim();
    if (
      !component ||
      !powerName ||
      !libraryId.startsWith('power:') ||
      powerName.toUpperCase().includes('FLAG')
    ) {
      return [];
    }

    const point = points.get(key);
    if (!point) {
      return [];
    }

    return [{
      source: 'implicit-power' as const,
      kind: 'global' as const,
      name: powerName,
      point,
    }];
  }));
  const allLabels = [
    ...labels.map(label => ({
      ...label,
      source: 'label' as const,
    })),
    ...sheetPins.map(pin => ({
      source: 'sheet-pin' as const,
      kind: 'hierarchical' as const,
      name: pin.name,
      point: pin.point,
      sheetName: pin.sheetName,
      sheetFile: pin.sheetFile,
    })),
    ...implicitPowerLabels,
  ];

  for (const key of points.keys()) {
    unionFind.ensure(key);
  }

  for (const label of allLabels) {
    connectivityPoints.set(pointKey(label.point), label.point);
    unionFind.ensure(pointKey(label.point));
  }
  for (const junction of junctions) {
    connectivityPoints.set(pointKey(junction), junction);
    unionFind.ensure(pointKey(junction));
  }

  unionSnappedPointBuckets(unionFind, connectivityPoints);

  for (const segment of segments) {
    const startKey = pointKey(segment.start);
    const endKey = pointKey(segment.end);
    unionFind.union(startKey, endKey);

    for (const [key, point] of connectivityPoints.entries()) {
      if (pointLiesOnSegment(point, segment.start, segment.end)) {
        unionFind.union(key, startKey);
      }
    }
  }

  const endpointsByNet = new Map<string, Endpoint[]>();
  for (const [key, endpointsAtPoint] of endpointByPoint.entries()) {
    const netKey = unionFind.find(key);
    const bucket = endpointsByNet.get(netKey) ?? [];
    bucket.push(...endpointsAtPoint);
    endpointsByNet.set(netKey, bucket);
  }

  const netLabels = new Map<string, string>();
  for (const label of allLabels) {
    netLabels.set(unionFind.find(pointKey(label.point)), label.name);
  }

  const joinableLabelNets = new Map<string, string[]>();
  for (const label of allLabels) {
    const scopeKey = getJoinableLabelScopeKey(label);
    if (!scopeKey) {
      continue;
    }
    const netKey = unionFind.find(pointKey(label.point));
    const members = joinableLabelNets.get(scopeKey) ?? [];
    members.push(netKey);
    joinableLabelNets.set(scopeKey, members);
  }

  for (const netKeys of joinableLabelNets.values()) {
    if (netKeys.length < 2) {
      continue;
    }

    const primaryKey = unionFind.find(netKeys[0]!);
    for (let index = 1; index < netKeys.length; index += 1) {
      unionFind.union(primaryKey, netKeys[index]!);
    }
  }

  if (joinableLabelNets.size > 0) {
    const mergedEndpointsByNet = new Map<string, Endpoint[]>();
    for (const [originalKey, endpoints] of endpointsByNet.entries()) {
      const mergedKey = unionFind.find(originalKey);
      const bucket = mergedEndpointsByNet.get(mergedKey) ?? [];
      bucket.push(...endpoints);
      mergedEndpointsByNet.set(mergedKey, bucket);
    }
    endpointsByNet.clear();
    for (const [mergedKey, endpoints] of mergedEndpointsByNet.entries()) {
      endpointsByNet.set(mergedKey, endpoints);
    }

    const mergedLabels = new Map<string, string>();
    for (const [originalKey, labelName] of netLabels.entries()) {
      const mergedKey = unionFind.find(originalKey);
      if (!mergedLabels.has(mergedKey)) {
        mergedLabels.set(mergedKey, labelName);
      }
    }
    netLabels.clear();
    for (const [mergedKey, labelName] of mergedLabels.entries()) {
      netLabels.set(mergedKey, labelName);
    }
  }

  const manualConnections: ManualNetConnection[] = [];
  let connectionIndex = 0;

  for (const [netKey, endpoints] of endpointsByNet.entries()) {
    const dedupedEndpoints = endpoints.filter((endpoint, index, all) =>
      all.findIndex(candidate =>
        candidate.ownerType === endpoint.ownerType &&
        candidate.ownerId === endpoint.ownerId &&
        candidate.pinId === endpoint.pinId
      ) === index
    );
    if (dedupedEndpoints.length < 2) {
      continue;
    }

    const netName = netLabels.get(netKey);
    const boardEndpoint = choosePrimaryBoardEndpoint(dedupedEndpoints);

    if (boardEndpoint) {
      for (const endpoint of dedupedEndpoints) {
        if (endpoint.ownerType !== 'component') {
          continue;
        }
        const component = componentById.get(endpoint.ownerId);
        if (!component || component.assignedPins[endpoint.pinId]) {
          continue;
        }
        component.assignedPins[endpoint.pinId] = boardEndpoint.pinId;
      }
    } else if (looksLikePowerNetName(netName)) {
      for (const endpoint of dedupedEndpoints) {
        if (endpoint.ownerType !== 'component') {
          continue;
        }
        const component = componentById.get(endpoint.ownerId);
        if (!component || component.assignedPins[endpoint.pinId]) {
          continue;
        }
        component.assignedPins[endpoint.pinId] = netName!;
      }
    }

    const componentEndpoints = dedupedEndpoints.filter(endpoint => endpoint.ownerType === 'component');
    if (componentEndpoints.length < 2) {
      continue;
    }

    const startEndpoint = componentEndpoints[0]!;
    for (let index = 1; index < componentEndpoints.length; index += 1) {
      const targetEndpoint = componentEndpoints[index]!;
      manualConnections.push({
        id: `kicad-import-${connectionIndex += 1}`,
        source: {
          ownerType: 'component',
          ownerId: startEndpoint.ownerId,
          pinId: startEndpoint.pinId,
        },
        target: {
          ownerType: 'component',
          ownerId: targetEndpoint.ownerId,
          pinId: targetEndpoint.pinId,
        },
        suggestedNetName: netName,
      });
    }
  }

  return manualConnections;
}

function markRoutingCompleteness(
  components: PlacedComponent[],
  templates: Map<string, ComponentTemplate>,
  manualConnections: ManualNetConnection[]
) {
  const hasManualPinConnection = (component: PlacedComponent, pinName: string) => manualConnections.some(connection =>
    (connection.source.ownerType === 'component' &&
      connection.source.ownerId === component.instanceId &&
      connection.source.pinId === pinName) ||
    (connection.target.ownerType === 'component' &&
      connection.target.ownerId === component.instanceId &&
      connection.target.pinId === pinName)
  );
  const hasObservedPinConnection = (component: PlacedComponent, pinName: string) =>
    Boolean(component.assignedPins[pinName]) || hasManualPinConnection(component, pinName);
  const importedLibraryId = (component: PlacedComponent) => component.importedMapping?.libraryId?.toLowerCase() ?? '';
  const importedReference = (component: PlacedComponent) => (component.importedReference ?? '').toUpperCase();
  const isImportedPowerHelper = (component: PlacedComponent) => {
    const libraryId = importedLibraryId(component);
    const reference = importedReference(component);
    return (
      libraryId.startsWith('power:') ||
      libraryId.startsWith('mechanical:mountinghole') ||
      reference.startsWith('#PWR') ||
      reference.startsWith('#FLG')
    );
  };
  const isImportedConnector = (component: PlacedComponent) => importedLibraryId(component).startsWith('connector:');

  for (const component of components) {
    if (isImportedPowerHelper(component)) {
      component.isFullyRouted = true;
      continue;
    }

    const template = templates.get(component.templateId) ?? getStaticTemplateById(component.templateId);
    if (!template) {
      component.isFullyRouted = false;
      continue;
    }

    if (template.requiredPins.length === 0) {
      component.isFullyRouted = true;
      continue;
    }

    const requiredPins = isImportedConnector(component)
      ? template.requiredPins.filter(pin => hasObservedPinConnection(component, pin.name))
      : template.requiredPins;

    if (requiredPins.length === 0 && isImportedConnector(component)) {
      component.isFullyRouted = true;
      continue;
    }

    component.isFullyRouted = requiredPins.every(pin => hasObservedPinConnection(component, pin.name));
  }
}

function assertSupportedKiCadSchematicSource(source: string) {
  if (!source.trimStart().startsWith('(kicad_sch')) {
    throw new Error(
      '구버전 KiCad 파일이거나 지원되지 않는 포맷입니다. KiCad v6 이상에서 파일을 열고 다시 저장한 뒤 .kicad_sch 파일로 업로드해 주세요.'
    );
  }
}

/**
 * Canvas-only importer.
 *
 * Use this when the product needs an editable/imported ModuMake project
 * document for the legacy canvas experience.
 *
 * Do not use this as the v3 circuit validation extractor.
 */
export function importKiCadSchematic(source: string, options?: { projectName?: string }): KiCadSchematicImportResult {
  assertSupportedKiCadSchematicSource(source);
  const tree = parseKiCadSExpression(source);
  const root = tree.find(node => isSExprList(node) && stringAt(node, 0) === 'kicad_sch');
  if (!root || !Array.isArray(root)) {
    throw new Error('KiCad schematic root를 찾지 못했습니다.');
  }
  const generator = stringAt(childForms(root, 'generator')[0], 1, '');

  const librarySymbols = extractLibrarySymbols(root);
  const instances = extractInstances(root);
  const wireSegments = extractWireSegments(root);
  const junctions = extractJunctionPoints(root);
  const labels: ReturnType<typeof extractLabels> = extractLabels(root);
  const drawings = extractRootDrawingPrimitives(root);
  const pageFrame = extractPageFrame(root);
  const sheetFrames = extractSheetFrames(root);
  const sheetPins = sheetFrames.flatMap(frame => frame.pins.map(pin => ({
    name: pin.text,
    point: pin.at,
    sheetName: frame.name,
    sheetFile: frame.file,
  })));

  if (librarySymbols.size === 0 && instances.length > 0) {
    throw new Error(
      '이 파일은 서브시트 또는 일부 회로도 조각으로 보입니다. 메인 .kicad_sch 파일을 업로드해 주세요.'
    );
  }

  const generatedPackages = new Map<string, CustomComponentPackage>();
  const resolutions = new Map<string, SymbolResolution>();

  const boardInstance = instances.find(instance => BOARD_LIBRARY_INDEX.has(instance.libraryId));
  const boardResolution = boardInstance
    ? getOrResolveSymbolResolution({
        instance: boardInstance,
        librarySymbols,
        resolutions,
        generatedPackages,
      })
    : undefined;
  const activeBoardId =
    boardResolution && boardResolution.kind === 'board'
      ? boardResolution.boardId
      : 'kicad_generic';

  const components: PlacedComponent[] = [];
  const componentById = new Map<string, PlacedComponent>();
  const endpointByPoint = new Map<string, Endpoint[]>();
  const points = new Map<string, Point>();
  let fallbackComponentCount = 0;
  let lowConfidenceComponentCount = 0;
  const templateCache: Record<string, ComponentTemplate> = {};
  const templateLookup = new Map<string, ComponentTemplate>();
  for (const template of STATIC_COMPONENT_TEMPLATES) {
    templateLookup.set(template.id, template);
  }

  for (const instance of instances) {
    const resolution = getOrResolveSymbolResolution({
      instance,
      librarySymbols,
      resolutions,
      generatedPackages,
    });
    if (!resolution) {
      continue;
    }

    const { endpointMap, pointMap } = buildInstanceEndpoints(instance, resolution);
    for (const [key, endpoints] of endpointMap.entries()) {
      const bucket = endpointByPoint.get(key) ?? [];
      bucket.push(...endpoints);
      endpointByPoint.set(key, bucket);
    }
    for (const [key, point] of pointMap.entries()) {
      points.set(key, point);
    }

    if (resolution.kind === 'template' || resolution.kind === 'custom') {
      const component = createPlacedComponent(instance, resolution, {
        preferTemplateCanvasLayout: generator === 'ModuMake',
      });
      if (component.importedMapping?.source === 'custom-fallback') {
        fallbackComponentCount += 1;
      }
      if (component.importedMapping && component.importedMapping.confidence !== 'high') {
        lowConfidenceComponentCount += 1;
      }
      components.push(component);
      componentById.set(component.instanceId, component);
      templateLookup.set(component.templateId, resolution.template);
    }
  }

  const importedSchematicScene = buildImportedSchematicScene(
    wireSegments,
    junctions,
    labels,
    drawings,
    pageFrame,
    sheetFrames,
    instances,
    resolutions
  );

  const customPackages = Array.from(generatedPackages.values());
  for (const pkg of customPackages) {
    const template = enrichComponentTemplate(customComponentPackageToTemplate(pkg));
    templateCache[pkg.templateId] = template;
    templateLookup.set(pkg.templateId, template);
  }

  for (const segment of wireSegments) {
    points.set(pointKey(segment.start), segment.start);
    points.set(pointKey(segment.end), segment.end);
  }
  for (const junction of junctions) {
    points.set(pointKey(junction), junction);
  }
  for (const label of labels) {
    points.set(pointKey(label.point), label.point);
  }

  if (generator === 'ModuMake') {
    addLayoutEndpoints({
      boardId: activeBoardId,
      components,
      templateLookup,
      endpointByPoint,
      points,
    });
  }

  const manualConnections = buildConnections({
    components,
    componentById,
    endpointByPoint,
    points,
    segments: wireSegments,
    junctions,
    labels,
    sheetPins,
  });
  markRoutingCompleteness(components, templateLookup, manualConnections);

  const baseState = buildDefaultProjectState(activeBoardId);
  const document = createProjectDocument({
    ...baseState,
    projectName: sanitizePlainText(
      options?.projectName ||
      stringAt(childForms(childForms(root, 'title_block')[0] ?? [], 'title')[0], 1, 'Imported KiCad project'),
      { maxLength: 80, fallback: 'Imported KiCad project' }
    ),
    activeBoardId,
    pins: buildImportedPins(activeBoardId, components),
    components,
    manualConnections,
    importedSchematicScene,
    importedSchematicSource: source,
    templateCache,
    customComponentPackages: Array.from(generatedPackages.values()),
    generatedCode: '',
    codeError: null,
    lastCodeGenerationMeta: null,
  }, { projectFileVersion: PROJECT_FILE_VERSION });

  return {
    document,
    summary: {
      boardId: activeBoardId,
      importedComponentCount: components.length,
      importedConnectionCount: manualConnections.length,
      generatedCustomComponentCount: generatedPackages.size,
      fallbackComponentCount,
      lowConfidenceComponentCount,
    },
  };
}
