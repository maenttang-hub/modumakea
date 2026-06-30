import {
  childForms,
  parseKiCadSExpression,
  stringAt,
  type SExprNode,
} from '@/lib/s-expr-parser';
import type {
  ImportedPcbBounds,
  ImportedPcbDocument,
  ImportedPcbFootprint,
  ImportedPcbGraphic,
  ImportedPcbLayer,
  ImportedPcbLayerId,
  ImportedPcbNet,
  ImportedPcbNetClass,
  ImportedPcbPad,
  ImportedPcbPoint,
  ImportedPcbSetup,
  ImportedPcbTrackSegment,
  ImportedPcbVia,
  ImportedPcbZone,
} from '@/types';

type ParserContext = {
  netNameByCode: Map<number, string>;
};

type Transform = {
  origin: ImportedPcbPoint;
  angle: number;
};

function isList(value: SExprNode | undefined): value is SExprNode[] {
  return Array.isArray(value);
}

function firstChild(node: SExprNode[], name: string) {
  return childForms(node, name)[0];
}

function numberAt(node: SExprNode[] | undefined, index: number, fallback = 0) {
  if (!node) {
    return fallback;
  }
  const raw = node[index];
  if (typeof raw !== 'string') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumberAt(node: SExprNode[] | undefined, index: number) {
  if (!node) {
    return undefined;
  }
  const raw = node[index];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parsePoint(node: SExprNode[] | undefined): ImportedPcbPoint | null {
  if (!node) {
    return null;
  }

  return {
    x: numberAt(node, 1),
    y: numberAt(node, 2),
  };
}

function parseAt(node: SExprNode[] | undefined) {
  return {
    point: parsePoint(node) ?? { x: 0, y: 0 },
    angle: optionalNumberAt(node, 3) ?? 0,
  };
}

function parseLayer(node: SExprNode[] | undefined, fallback: ImportedPcbLayerId = 'Dwgs.User') {
  return stringAt(node, 1, fallback);
}

function parseWidth(node: SExprNode[] | undefined, fallback = 0.15) {
  return optionalNumberAt(node, 1) ?? fallback;
}

function parseGraphicWidth(node: SExprNode[], fallback = 0.15) {
  const legacyWidth = optionalNumberAt(firstChild(node, 'width'), 1);
  if (legacyWidth != null) {
    return legacyWidth;
  }

  const stroke = firstChild(node, 'stroke');
  const strokeWidth = optionalNumberAt(firstChild(stroke ?? [], 'width'), 1);
  return strokeWidth ?? fallback;
}

function parseLayers(node: SExprNode[] | undefined) {
  if (!node) {
    return [];
  }
  return node.slice(1).filter((item): item is string => typeof item === 'string');
}

function parseEffectsTextSize(parent: SExprNode[]) {
  const effects = firstChild(parent, 'effects');
  const font = effects ? firstChild(effects, 'font') : undefined;
  const size = font ? firstChild(font, 'size') : undefined;

  return {
    width: optionalNumberAt(size, 1) ?? 1,
    height: optionalNumberAt(size, 2) ?? optionalNumberAt(size, 1) ?? 1,
  };
}

function rotatePoint(point: ImportedPcbPoint, angleDeg: number): ImportedPcbPoint {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function transformPoint(point: ImportedPcbPoint, transform: Transform): ImportedPcbPoint {
  const rotated = rotatePoint(point, transform.angle);
  return {
    x: Number((transform.origin.x + rotated.x).toFixed(6)),
    y: Number((transform.origin.y + rotated.y).toFixed(6)),
  };
}

function stableId(parts: Array<string | number | undefined>) {
  return parts
    .map(part => String(part ?? 'x').replace(/[^A-Za-z0-9_.:-]+/g, '_'))
    .join(':');
}

function includePoint(bounds: ImportedPcbBounds | null, point: ImportedPcbPoint): ImportedPcbBounds {
  if (!bounds) {
    return {
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    };
  }
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

function includeSizedPoint(
  bounds: ImportedPcbBounds | null,
  point: ImportedPcbPoint,
  width = 0,
  height = width
) {
  const halfWidth = Math.max(width / 2, 0);
  const halfHeight = Math.max(height / 2, 0);
  let next = includePoint(bounds, { x: point.x - halfWidth, y: point.y - halfHeight });
  next = includePoint(next, { x: point.x + halfWidth, y: point.y + halfHeight });
  return next;
}

function parseLayerTable(root: SExprNode[]) {
  const layersNode = firstChild(root, 'layers');
  if (!layersNode) {
    return [];
  }

  return layersNode.slice(1).flatMap<ImportedPcbLayer>(entry => {
    if (!isList(entry)) {
      return [];
    }

    const id = optionalNumberAt(entry, 0);
    const name = stringAt(entry, 1);
    if (!name) {
      return [];
    }
    const type = stringAt(entry, 2);

    return [{
      id,
      name,
      type: type || undefined,
    }];
  });
}

function parseNets(root: SExprNode[]) {
  return childForms(root, 'net').flatMap<ImportedPcbNet>(netNode => {
    const code = numberAt(netNode, 1, -1);
    if (code < 0) {
      return [];
    }
    return [{
      code,
      name: stringAt(netNode, 2),
    }];
  });
}

function parseSetup(root: SExprNode[]): ImportedPcbSetup {
  const setup = firstChild(root, 'setup');
  if (!setup) {
    return {};
  }

  return {
    traceClearance: optionalNumberAt(firstChild(setup, 'trace_clearance'), 1),
    traceMin: optionalNumberAt(firstChild(setup, 'trace_min'), 1),
    zoneClearance: optionalNumberAt(firstChild(setup, 'zone_clearance'), 1),
    edgeWidth: optionalNumberAt(firstChild(setup, 'edge_width'), 1),
    padToMaskClearance: optionalNumberAt(firstChild(setup, 'pad_to_mask_clearance'), 1),
    solderMaskMinWidth: optionalNumberAt(firstChild(setup, 'solder_mask_min_width'), 1),
    copperToEdgeClearance:
      optionalNumberAt(firstChild(setup, 'copper_to_edge_clearance'), 1) ??
      optionalNumberAt(firstChild(setup, 'copper_edge_clearance'), 1),
    viaSize: optionalNumberAt(firstChild(setup, 'via_size'), 1),
    viaDrill: optionalNumberAt(firstChild(setup, 'via_drill'), 1),
    viaMinSize: optionalNumberAt(firstChild(setup, 'via_min_size'), 1),
    viaMinDrill: optionalNumberAt(firstChild(setup, 'via_min_drill'), 1),
  };
}

function parseNetClasses(root: SExprNode[]) {
  return childForms(root, 'net_class').map<ImportedPcbNetClass>(netClass => {
    const nets = childForms(netClass, 'add_net')
      .map(addNet => stringAt(addNet, 1))
      .filter(Boolean);

    return {
      name: stringAt(netClass, 1, 'Default'),
      description: stringAt(netClass, 2),
      clearance: optionalNumberAt(firstChild(netClass, 'clearance'), 1),
      traceWidth:
        optionalNumberAt(firstChild(netClass, 'trace_width'), 1) ??
        optionalNumberAt(firstChild(netClass, 'track_width'), 1),
      viaDiameter:
        optionalNumberAt(firstChild(netClass, 'via_dia'), 1) ??
        optionalNumberAt(firstChild(netClass, 'via_diameter'), 1),
      viaDrill: optionalNumberAt(firstChild(netClass, 'via_drill'), 1),
      diffPairWidth: optionalNumberAt(firstChild(netClass, 'diff_pair_width'), 1),
      diffPairGap: optionalNumberAt(firstChild(netClass, 'diff_pair_gap'), 1),
      diffPairViaGap: optionalNumberAt(firstChild(netClass, 'diff_pair_via_gap'), 1),
      lengthMatchTolerance:
        optionalNumberAt(firstChild(netClass, 'length_match_tolerance'), 1) ??
        optionalNumberAt(firstChild(netClass, 'diff_pair_length_tolerance'), 1),
      nets,
    };
  });
}

function parsePts(node: SExprNode[] | undefined) {
  if (!node) {
    return [];
  }

  return childForms(node, 'xy').flatMap<ImportedPcbPoint>(xy => {
    const point = parsePoint(xy);
    return point ? [point] : [];
  });
}

function parseGraphic(
  node: SExprNode[],
  id: string,
  source: 'board' | 'footprint',
  transform?: Transform,
  footprintId?: string
): ImportedPcbGraphic | null {
  const kind = stringAt(node, 0);
  const apply = (point: ImportedPcbPoint) => transform ? transformPoint(point, transform) : point;
  const layer = parseLayer(firstChild(node, 'layer'));
  const width = parseGraphicWidth(node, 0.15);
  const base = {
    id,
    layer,
    width,
    source,
    footprintId,
  };

  if (kind === 'fp_line' || kind === 'gr_line') {
    const start = parsePoint(firstChild(node, 'start'));
    const end = parsePoint(firstChild(node, 'end'));
    if (!start || !end) {
      return null;
    }
    return {
      ...base,
      kind: 'line',
      start: apply(start),
      end: apply(end),
    };
  }

  if (kind === 'fp_rect' || kind === 'gr_rect') {
    const start = parsePoint(firstChild(node, 'start'));
    const end = parsePoint(firstChild(node, 'end'));
    if (!start || !end) {
      return null;
    }
    const points = [
      start,
      { x: end.x, y: start.y },
      end,
      { x: start.x, y: end.y },
      start,
    ].map(apply);
    return {
      ...base,
      kind: 'polyline',
      points,
      fill: false,
    };
  }

  if (kind === 'fp_poly' || kind === 'gr_poly') {
    const points = parsePts(firstChild(node, 'pts')).map(apply);
    if (points.length < 2) {
      return null;
    }
    return {
      ...base,
      kind: 'polyline',
      points,
      fill: true,
    };
  }

  if (kind === 'fp_circle' || kind === 'gr_circle') {
    const center = parsePoint(firstChild(node, 'center'));
    const end = parsePoint(firstChild(node, 'end'));
    if (!center || !end) {
      return null;
    }
    const radius = Math.hypot(end.x - center.x, end.y - center.y);
    return {
      ...base,
      kind: 'circle',
      center: apply(center),
      radius,
      fill: false,
    };
  }

  if (kind === 'fp_arc' || kind === 'gr_arc') {
    const start = parsePoint(firstChild(node, 'start'));
    const mid = parsePoint(firstChild(node, 'mid')) ?? parsePoint(firstChild(node, 'end'));
    const end = parsePoint(firstChild(node, 'end'));
    if (!start || !mid || !end) {
      return null;
    }
    return {
      ...base,
      kind: 'arc',
      start: apply(start),
      mid: apply(mid),
      end: apply(end),
    };
  }

  if (kind === 'fp_text' || kind === 'gr_text') {
    const text = kind === 'fp_text'
      ? stringAt(node, 2, stringAt(node, 1))
      : stringAt(node, 1);
    const at = parseAt(firstChild(node, 'at'));
    return {
      id,
      kind: 'text',
      layer,
      text,
      at: apply(at.point),
      angle: (transform?.angle ?? 0) + at.angle,
      size: parseEffectsTextSize(node),
      source,
      footprintId,
    };
  }

  return null;
}

function parseNetRef(node: SExprNode[] | undefined, context: ParserContext) {
  const netCode = Math.max(0, numberAt(node, 1, 0));
  const explicitName = stringAt(node, 2);
  return {
    netCode,
    netName: explicitName || context.netNameByCode.get(netCode) || '',
  };
}

function parsePad(
  node: SExprNode[],
  footprint: Pick<ImportedPcbFootprint, 'id' | 'reference' | 'at' | 'angle'>,
  context: ParserContext,
  index: number
): ImportedPcbPad | null {
  const number = stringAt(node, 1);
  if (!number) {
    return null;
  }

  const at = parseAt(firstChild(node, 'at'));
  const sizeNode = firstChild(node, 'size');
  const size = {
    width: optionalNumberAt(sizeNode, 1) ?? 1,
    height: optionalNumberAt(sizeNode, 2) ?? optionalNumberAt(sizeNode, 1) ?? 1,
  };
  const drillNode = firstChild(node, 'drill');
  const drill = optionalNumberAt(drillNode, 1);
  const net = parseNetRef(firstChild(node, 'net'), context);

  return {
    id: stableId(['pad', footprint.id, number, index]),
    number,
    type: stringAt(node, 2, 'unknown'),
    shape: stringAt(node, 3, 'rect'),
    at: at.point,
    absoluteAt: transformPoint(at.point, { origin: footprint.at, angle: footprint.angle }),
    angle: footprint.angle + at.angle,
    size,
    drill,
    clearance: optionalNumberAt(firstChild(node, 'clearance'), 1),
    solderMaskMargin: optionalNumberAt(firstChild(node, 'solder_mask_margin'), 1),
    layers: parseLayers(firstChild(node, 'layers')),
    netCode: net.netCode,
    netName: net.netName,
    footprintId: footprint.id,
    footprintRef: footprint.reference,
  };
}

function parseFootprint(node: SExprNode[], context: ParserContext, index: number): ImportedPcbFootprint | null {
  const libraryId = stringAt(node, 1);
  if (!libraryId) {
    return null;
  }

  const at = parseAt(firstChild(node, 'at'));
  const layer = parseLayer(firstChild(node, 'layer'), 'F.Cu');
  const refText = childForms(node, 'fp_text').find(textNode => stringAt(textNode, 1) === 'reference');
  const valueText = childForms(node, 'fp_text').find(textNode => stringAt(textNode, 1) === 'value');
  const reference = stringAt(refText, 2, `U${index + 1}`);
  const value = stringAt(valueText, 2, libraryId.split(':').at(-1) ?? libraryId);
  const id = stableId(['fp', reference, index]);
  const transform = { origin: at.point, angle: at.angle };

  const shell = {
    id,
    reference,
    at: at.point,
    angle: at.angle,
  };
  const pads = childForms(node, 'pad').flatMap<ImportedPcbPad>((padNode, padIndex) => {
    const pad = parsePad(padNode, shell, context, padIndex);
    return pad ? [pad] : [];
  });
  const graphics = node.flatMap<ImportedPcbGraphic>((child, childIndex) => {
    if (!isList(child)) {
      return [];
    }
    const childKind = stringAt(child, 0);
    if (!childKind.startsWith('fp_')) {
      return [];
    }
    const graphic = parseGraphic(child, stableId(['fp-graphic', id, childIndex]), 'footprint', transform, id);
    return graphic ? [graphic] : [];
  });

  let bounds: ImportedPcbBounds | null = null;
  for (const pad of pads) {
    bounds = includeSizedPoint(bounds, pad.absoluteAt, pad.size.width, pad.size.height);
  }
  for (const graphic of graphics) {
    bounds = includeGraphic(bounds, graphic);
  }

  return {
    id,
    libraryId,
    reference,
    value,
    layer,
    at: at.point,
    angle: at.angle,
    description: stringAt(firstChild(node, 'descr'), 1) || undefined,
    tags: stringAt(firstChild(node, 'tags'), 1) || undefined,
    pads,
    graphics,
    bounds,
  };
}

function includeGraphic(bounds: ImportedPcbBounds | null, graphic: ImportedPcbGraphic): ImportedPcbBounds {
  switch (graphic.kind) {
    case 'line':
      return includeSizedPoint(includeSizedPoint(bounds, graphic.start, graphic.width), graphic.end, graphic.width);
    case 'polyline':
      return graphic.points.reduce<ImportedPcbBounds | null>(
        (next, point) => includeSizedPoint(next, point, graphic.width),
        bounds
      ) ?? bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'circle':
      return includeSizedPoint(bounds, graphic.center, graphic.radius * 2 + graphic.width, graphic.radius * 2 + graphic.width);
    case 'arc':
      return [graphic.start, graphic.mid, graphic.end].reduce<ImportedPcbBounds | null>(
        (next, point) => includeSizedPoint(next, point, graphic.width),
        bounds
      ) ?? bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'text':
      return includeSizedPoint(bounds, graphic.at, graphic.size.width * Math.max(1, graphic.text.length * 0.55), graphic.size.height);
  }
}

function parseSegments(root: SExprNode[], context: ParserContext) {
  return childForms(root, 'segment').flatMap<ImportedPcbTrackSegment>((segment, index) => {
    const start = parsePoint(firstChild(segment, 'start'));
    const end = parsePoint(firstChild(segment, 'end'));
    if (!start || !end) {
      return [];
    }
    const netCode = Math.max(0, numberAt(firstChild(segment, 'net'), 1, 0));
    return [{
      id: stableId(['segment', index, netCode]),
      start,
      end,
      width: parseWidth(firstChild(segment, 'width'), 0.25),
      layer: parseLayer(firstChild(segment, 'layer'), 'F.Cu'),
      netCode,
      netName: context.netNameByCode.get(netCode) ?? '',
    }];
  });
}

function parseVias(root: SExprNode[], context: ParserContext) {
  return childForms(root, 'via').flatMap<ImportedPcbVia>((via, index) => {
    const at = parsePoint(firstChild(via, 'at'));
    if (!at) {
      return [];
    }
    const netCode = Math.max(0, numberAt(firstChild(via, 'net'), 1, 0));
    return [{
      id: stableId(['via', index, netCode]),
      at,
      size: optionalNumberAt(firstChild(via, 'size'), 1) ?? 0.6,
      drill: optionalNumberAt(firstChild(via, 'drill'), 1) ?? 0.3,
      layers: parseLayers(firstChild(via, 'layers')),
      netCode,
      netName: context.netNameByCode.get(netCode) ?? '',
    }];
  });
}

function parseZones(root: SExprNode[], context: ParserContext) {
  return childForms(root, 'zone').flatMap<ImportedPcbZone>((zone, index) => {
    const netCode = Math.max(0, numberAt(firstChild(zone, 'net'), 1, 0));
    const netName = stringAt(firstChild(zone, 'net_name'), 1, context.netNameByCode.get(netCode) ?? '');
    const polygon = parsePts(firstChild(firstChild(zone, 'polygon') ?? [], 'pts'));
    const filledPolygons = childForms(zone, 'filled_polygon')
      .map(filledPolygon => parsePts(firstChild(filledPolygon, 'pts')))
      .filter(points => points.length > 0);
    const connectPads = firstChild(zone, 'connect_pads');

    return [{
      id: stableId(['zone', index, netCode]),
      netCode,
      netName,
      layer: parseLayer(firstChild(zone, 'layer'), 'F.Cu'),
      polygon,
      filledPolygons,
      clearance: optionalNumberAt(firstChild(connectPads ?? [], 'clearance'), 1),
      minThickness: optionalNumberAt(firstChild(zone, 'min_thickness'), 1),
    }];
  });
}

function parseBoardDrawings(root: SExprNode[]) {
  return root.flatMap<ImportedPcbGraphic>((child, index) => {
    if (!isList(child)) {
      return [];
    }
    const kind = stringAt(child, 0);
    if (!kind.startsWith('gr_')) {
      return [];
    }
    const graphic = parseGraphic(child, stableId(['board-graphic', index]), 'board');
    return graphic ? [graphic] : [];
  });
}

function getRoot(source: string) {
  const nodes = parseKiCadSExpression(source);
  const root = nodes.find(node => isList(node) && node[0] === 'kicad_pcb');
  if (!root || !isList(root)) {
    throw new Error('KiCad PCB 파일 형식이 아닙니다. .kicad_pcb 파일을 선택해 주세요.');
  }
  return root;
}

function computeBounds(documentParts: {
  footprints: ImportedPcbFootprint[];
  segments: ImportedPcbTrackSegment[];
  vias: ImportedPcbVia[];
  zones: ImportedPcbZone[];
  drawings: ImportedPcbGraphic[];
}) {
  let bounds: ImportedPcbBounds | null = null;

  for (const footprint of documentParts.footprints) {
    if (footprint.bounds) {
      bounds = includePoint(bounds, { x: footprint.bounds.minX, y: footprint.bounds.minY });
      bounds = includePoint(bounds, { x: footprint.bounds.maxX, y: footprint.bounds.maxY });
    } else {
      bounds = includePoint(bounds, footprint.at);
    }
  }

  for (const segment of documentParts.segments) {
    bounds = includeSizedPoint(bounds, segment.start, segment.width);
    bounds = includeSizedPoint(bounds, segment.end, segment.width);
  }

  for (const via of documentParts.vias) {
    bounds = includeSizedPoint(bounds, via.at, via.size);
  }

  for (const zone of documentParts.zones) {
    for (const point of zone.polygon) {
      bounds = includePoint(bounds, point);
    }
    for (const polygon of zone.filledPolygons) {
      for (const point of polygon) {
        bounds = includePoint(bounds, point);
      }
    }
  }

  for (const drawing of documentParts.drawings) {
    bounds = includeGraphic(bounds, drawing);
  }

  return bounds;
}

export function parseKiCadPcb(
  source: string,
  options: { sourceFilename?: string; importedAt?: string } = {}
): ImportedPcbDocument {
  const root = getRoot(source);
  const layers = parseLayerTable(root);
  const nets = parseNets(root);
  const netNameByCode = new Map(nets.map(net => [net.code, net.name]));
  const context = { netNameByCode };
  const setup = parseSetup(root);
  const netClasses = parseNetClasses(root);
  const footprints = root.flatMap<ImportedPcbFootprint>((child, index) => {
    if (!isList(child) || (child[0] !== 'footprint' && child[0] !== 'module')) {
      return [];
    }
    const footprint = parseFootprint(child, context, index);
    return footprint ? [footprint] : [];
  });
  const segments = parseSegments(root, context);
  const vias = parseVias(root, context);
  const zones = parseZones(root, context);
  const drawings = parseBoardDrawings(root);
  const bounds = computeBounds({ footprints, segments, vias, zones, drawings });
  const padCount = footprints.reduce((count, footprint) => count + footprint.pads.length, 0);

  return {
    schemaVersion: 1,
    sourceFilename: options.sourceFilename,
    importedAt: options.importedAt ?? new Date().toISOString(),
    kicadVersion: stringAt(firstChild(root, 'version'), 1) || stringAt(firstChild(root, 'host'), 1) || undefined,
    generator: stringAt(firstChild(root, 'generator'), 1) || undefined,
    layers,
    nets,
    setup,
    netClasses,
    footprints,
    segments,
    vias,
    zones,
    drawings,
    bounds,
    stats: {
      layerCount: layers.length,
      netCount: nets.length,
      footprintCount: footprints.length,
      padCount,
      segmentCount: segments.length,
      viaCount: vias.length,
      zoneCount: zones.length,
      drawingCount: drawings.length,
    },
  };
}
