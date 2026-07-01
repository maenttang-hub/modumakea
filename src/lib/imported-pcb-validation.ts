import type {
  ComponentTemplate,
  ImportedPcbDocument,
  ImportedPcbGraphic,
  ImportedPcbPad,
  ImportedPcbPoint,
  ImportedPcbTrackSegment,
  ImportedPcbValidationIssue,
  ImportedPcbValidationReport,
  ImportedPcbValidationSource,
  ImportedPcbVia,
  ImportedPcbZone,
  ImportedSchematicScene,
  ManualNetConnection,
  PlacedComponent,
} from '@/types';

const ENGINE_VERSION = 'pcb-validation-v1';
const DEFAULT_CLEARANCE_MM = 0.2;
const DEFAULT_TRACE_MIN_MM = 0.15;
const CONNECT_TOLERANCE_MM = 0.16;
const DEFAULT_MIN_ANNULAR_RING_MM = 0.13;
const DEFAULT_SOLDER_MASK_SLIVER_MM = 0.1;
const DEFAULT_COPPER_TO_EDGE_MM = 0.25;
const DEFAULT_LENGTH_MATCH_TOLERANCE_MM = 1;
const DEFAULT_DIFF_PAIR_GAP_TOLERANCE_MM = 0.08;
const DEFAULT_DIFF_PAIR_WIDTH_TOLERANCE_MM = 0.03;
const MAX_TRACK_PAD_CLEARANCE_GROUPS = 120;
const MAX_TRACK_PAD_CLEARANCE_ITEMS = 6;
const MAX_VISIBLE_MODUMAKE_PRECHECKS_PER_CODE = 6;

const MODUMAKE_PRECHECK_ERROR_CODES = new Set([
  'PCB_EMPTY_GEOMETRY',
  'PCB_NO_EDGE_CUTS',
  'PCB_DUPLICATE_REFERENCE',
  'PCB_STRAY_COPPER',
  'PCB_TRACK_TOO_NARROW',
  'PCB_ZONE_WITHOUT_POLYGON',
]);

const REPRESENTATIVE_LIMITED_PRECHECK_CODES = new Set([
  'PCB_ANNULAR_RING_TOO_SMALL',
  'PCB_CLEARANCE_PAD_PAD',
  'PCB_CLEARANCE_TRACK_PAD',
  'PCB_CLEARANCE_TRACK_TRACK',
  'PCB_COPPER_TO_EDGE_CLEARANCE',
  'PCB_FOOTPRINT_WITHOUT_PADS',
  'PCB_NET_DISCONNECTED',
  'PCB_NET_HAS_NO_COPPER_PATH',
  'PCB_SOLDER_MASK_SLIVER_TOO_SMALL',
  'PCB_VIA_ANNULAR_RING_TOO_SMALL',
  'PCB_VIA_DRILL_TOO_SMALL',
  'PCB_VIA_TOO_SMALL',
  'PCB_ZONE_CLEARANCE_PAD',
  'PCB_ZONE_CLEARANCE_TRACK',
  'PCB_ZONE_CLEARANCE_VIA',
  'PCB_ZONE_CLEARANCE_ZONE',
]);

const REDUNDANT_PRECHECK_SUMMARY_CODES = new Set([
  'PCB_CLEARANCE_TRACK_PAD_GROUP_LIMIT',
]);

export type ImportedPcbManufacturingProfile = {
  name: string;
  minAnnularRingMm: number;
  minSolderMaskSliverMm: number;
  copperToEdgeClearanceMm: number;
  lengthMatchToleranceMm: number;
  diffPairGapToleranceMm: number;
  diffPairWidthToleranceMm: number;
};

export type ImportedPcbSchematicParityContext = {
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  importedSchematicScene?: ImportedSchematicScene | null;
  resolveTemplate?: (templateId: string) => ComponentTemplate | undefined;
};

export type ValidateImportedPcbOptions = {
  manufacturingProfile?: Partial<ImportedPcbManufacturingProfile>;
  schematicParity?: ImportedPcbSchematicParityContext | null;
};

const DEFAULT_MANUFACTURING_PROFILE: ImportedPcbManufacturingProfile = {
  name: 'Generic 2-layer prototype PCB',
  minAnnularRingMm: DEFAULT_MIN_ANNULAR_RING_MM,
  minSolderMaskSliverMm: DEFAULT_SOLDER_MASK_SLIVER_MM,
  copperToEdgeClearanceMm: DEFAULT_COPPER_TO_EDGE_MM,
  lengthMatchToleranceMm: DEFAULT_LENGTH_MATCH_TOLERANCE_MM,
  diffPairGapToleranceMm: DEFAULT_DIFF_PAIR_GAP_TOLERANCE_MM,
  diffPairWidthToleranceMm: DEFAULT_DIFF_PAIR_WIDTH_TOLERANCE_MM,
};

type DrcJsonItem = {
  description?: unknown;
  pos?: {
    x?: unknown;
    y?: unknown;
  };
};

type DrcJsonViolation = {
  description?: unknown;
  severity?: unknown;
  type?: unknown;
  items?: unknown;
};

type KiCadDrcJsonReport = {
  violations?: unknown;
  unconnected_items?: unknown;
  schematic_parity?: unknown;
  kicad_version?: unknown;
};

function issueCounts(issues: ImportedPcbValidationIssue[]) {
  return {
    issueCount: issues.length,
    errorCount: issues.filter(issue => issue.severity === 'error').length,
    warningCount: issues.filter(issue => issue.severity === 'warning').length,
    infoCount: issues.filter(issue => issue.severity === 'info').length,
  };
}

function buildReport(
  source: ImportedPcbValidationReport['source'],
  issues: ImportedPcbValidationIssue[],
  checks: ImportedPcbValidationReport['checks'],
  generatedAt = new Date().toISOString()
): ImportedPcbValidationReport {
  return {
    engineVersion: ENGINE_VERSION,
    generatedAt,
    source,
    ...issueCounts(issues),
    checks,
    issues,
  };
}

function normalizeModuMakePrecheckSeverity(issue: ImportedPcbValidationIssue): ImportedPcbValidationIssue {
  if (issue.source === 'kicad-cli' || issue.severity !== 'error' || MODUMAKE_PRECHECK_ERROR_CODES.has(issue.code)) {
    return issue;
  }

  return {
    ...issue,
    severity: 'warning',
  };
}

function buildRepresentativeLimitIssue(
  issue: ImportedPcbValidationIssue,
  totalCount: number,
  visibleCount: number,
  index: number
) {
  return makeIssue({
    severity: 'info',
    code: `${issue.code}_REPRESENTATIVE_LIMIT`,
    title: `${issue.title} 대표 항목만 표시`,
    message: `${issue.title} 후보 ${totalCount}건 중 대표 ${visibleCount}건만 표시했습니다. 반복 후보는 KiCad 공식 DRC와 제조사 DFM에서 일괄 확인해 주세요.`,
    recommendation: 'ModuMake PCB 사전점검은 반복 후보를 압축해 보여줍니다. 전체 판정은 KiCad DRC 리포트와 제조사 규칙으로 확인해 주세요.',
    layer: issue.layer,
    netName: issue.netName,
    footprintRef: issue.footprintRef,
    padNumber: issue.padNumber,
    at: issue.at,
    items: [{ description: `숨긴 반복 후보 ${Math.max(0, totalCount - visibleCount)}건` }],
  }, index);
}

function normalizeModuMakePrecheckIssues(issues: ImportedPcbValidationIssue[]) {
  const normalizedIssues = issues
    .filter(issue => !REDUNDANT_PRECHECK_SUMMARY_CODES.has(issue.code))
    .map(normalizeModuMakePrecheckSeverity);
  const countsByCode = new Map<string, number>();
  normalizedIssues.forEach(issue => {
    countsByCode.set(issue.code, (countsByCode.get(issue.code) ?? 0) + 1);
  });

  const visibleByCode = new Map<string, number>();
  const output: ImportedPcbValidationIssue[] = [];
  const representativeLimitIssues: ImportedPcbValidationIssue[] = [];
  for (const issue of normalizedIssues) {
    if (!REPRESENTATIVE_LIMITED_PRECHECK_CODES.has(issue.code)) {
      output.push(issue);
      continue;
    }

    const visibleCount = visibleByCode.get(issue.code) ?? 0;
    if (visibleCount < MAX_VISIBLE_MODUMAKE_PRECHECKS_PER_CODE) {
      output.push(issue);
      visibleByCode.set(issue.code, visibleCount + 1);
      continue;
    }

    if (visibleCount === MAX_VISIBLE_MODUMAKE_PRECHECKS_PER_CODE) {
      const totalCount = countsByCode.get(issue.code) ?? visibleCount + 1;
      representativeLimitIssues.push(buildRepresentativeLimitIssue(
        issue,
        totalCount,
        MAX_VISIBLE_MODUMAKE_PRECHECKS_PER_CODE,
        issues.length + representativeLimitIssues.length
      ));
      visibleByCode.set(issue.code, visibleCount + 1);
    }
  }

  return [...output, ...representativeLimitIssues];
}

function makeIssue(
  partial: Omit<ImportedPcbValidationIssue, 'id' | 'source'> & {
    source?: ImportedPcbValidationSource;
  },
  index: number
): ImportedPcbValidationIssue {
  const idParts = [
    partial.source ?? 'modumake-pcb',
    partial.code,
    partial.layer,
    partial.netName,
    partial.footprintRef,
    partial.padNumber,
    partial.at?.x.toFixed(3),
    partial.at?.y.toFixed(3),
    index,
  ];

  return {
    ...partial,
    source: partial.source ?? 'modumake-pcb',
    id: idParts.filter(Boolean).join(':').replace(/[^A-Za-z0-9_.:-]+/g, '_'),
  };
}

function distance(a: ImportedPcbPoint, b: ImportedPcbPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: ImportedPcbPoint, segment: ImportedPcbTrackSegment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return {
      distance: distance(point, segment.start),
      closest: segment.start,
    };
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared)
  );
  const closest = {
    x: segment.start.x + t * dx,
    y: segment.start.y + t * dy,
  };

  return {
    distance: distance(point, closest),
    closest,
  };
}

function segmentSegmentDistance(a: ImportedPcbTrackSegment, b: ImportedPcbTrackSegment) {
  const candidates = [
    pointSegmentDistance(a.start, b),
    pointSegmentDistance(a.end, b),
    pointSegmentDistance(b.start, a),
    pointSegmentDistance(b.end, a),
  ];
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function getPadCopperRadius(pad: ImportedPcbPad) {
  return Math.max(pad.size.width, pad.size.height) / 2;
}

function getMinimumTraceWidth(document: ImportedPcbDocument) {
  const classMinimum = document.netClasses
    .map(netClass => netClass.traceWidth)
    .filter((value): value is number => Number.isFinite(value));
  const candidates = [
    document.setup.traceMin,
    ...classMinimum,
    DEFAULT_TRACE_MIN_MM,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  return Math.min(...candidates);
}

function getClearance(document: ImportedPcbDocument) {
  const classMinimum = document.netClasses
    .map(netClass => netClass.clearance)
    .filter((value): value is number => Number.isFinite(value));
  const candidates = [
    document.setup.traceClearance,
    ...classMinimum,
    DEFAULT_CLEARANCE_MM,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  return Math.min(...candidates);
}

function resolveManufacturingProfile(
  document: ImportedPcbDocument,
  options: ValidateImportedPcbOptions | undefined
): ImportedPcbManufacturingProfile {
  const overrides = options?.manufacturingProfile ?? {};
  return {
    ...DEFAULT_MANUFACTURING_PROFILE,
    ...overrides,
    minSolderMaskSliverMm:
      overrides.minSolderMaskSliverMm ??
      document.setup.solderMaskMinWidth ??
      DEFAULT_MANUFACTURING_PROFILE.minSolderMaskSliverMm,
    copperToEdgeClearanceMm:
      overrides.copperToEdgeClearanceMm ??
      document.setup.copperToEdgeClearance ??
      DEFAULT_MANUFACTURING_PROFILE.copperToEdgeClearanceMm,
  };
}

function getNetClass(document: ImportedPcbDocument, netName: string) {
  const explicit = document.netClasses.find(netClass => netClass.nets.includes(netName));
  return explicit ?? document.netClasses.find(netClass => netClass.name.toLowerCase() === 'default');
}

function getZoneClearance(document: ImportedPcbDocument, zone: ImportedPcbZone) {
  return zone.clearance ?? document.setup.zoneClearance ?? getClearance(document);
}

function formatMm(value: number) {
  return `${value.toFixed(3)} mm`;
}

function allPads(document: ImportedPcbDocument) {
  return document.footprints.flatMap(footprint => footprint.pads);
}

function isCopperLayer(layer: string) {
  return layer.endsWith('.Cu') || layer === '*.Cu';
}

function isMaskLayer(layer: string) {
  return layer.endsWith('.Mask') || layer === '*.Mask';
}

function expandedPadLayers(layers: string[]) {
  const expanded = new Set<string>();
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

function padCopperLayers(pad: ImportedPcbPad) {
  return Array.from(expandedPadLayers(pad.layers)).filter(isCopperLayer);
}

function padMaskLayers(pad: ImportedPcbPad) {
  return Array.from(expandedPadLayers(pad.layers)).filter(isMaskLayer);
}

function layersOverlap(first: string[], second: string[]) {
  const secondSet = new Set(second);
  return first.some(layer => secondSet.has(layer));
}

function padTouchesCopperLayer(pad: ImportedPcbPad, layer: string) {
  return padCopperLayers(pad).includes(layer);
}

function pointLineSegmentDistance(
  point: ImportedPcbPoint,
  start: ImportedPcbPoint,
  end: ImportedPcbPoint
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return {
      distance: distance(point, start),
      closest: start,
    };
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  const closest = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return {
    distance: distance(point, closest),
    closest,
  };
}

function signedArea(a: ImportedPcbPoint, b: ImportedPcbPoint, c: ImportedPcbPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: ImportedPcbPoint, start: ImportedPcbPoint, end: ImportedPcbPoint) {
  return (
    Math.abs(signedArea(start, end, point)) < 1e-7 &&
    point.x >= Math.min(start.x, end.x) - 1e-7 &&
    point.x <= Math.max(start.x, end.x) + 1e-7 &&
    point.y >= Math.min(start.y, end.y) - 1e-7 &&
    point.y <= Math.max(start.y, end.y) + 1e-7
  );
}

function segmentsIntersect(
  aStart: ImportedPcbPoint,
  aEnd: ImportedPcbPoint,
  bStart: ImportedPcbPoint,
  bEnd: ImportedPcbPoint
) {
  const d1 = signedArea(aStart, aEnd, bStart);
  const d2 = signedArea(aStart, aEnd, bEnd);
  const d3 = signedArea(bStart, bEnd, aStart);
  const d4 = signedArea(bStart, bEnd, aEnd);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  return (
    pointOnSegment(bStart, aStart, aEnd) ||
    pointOnSegment(bEnd, aStart, aEnd) ||
    pointOnSegment(aStart, bStart, bEnd) ||
    pointOnSegment(aEnd, bStart, bEnd)
  );
}

function segmentDistance(
  aStart: ImportedPcbPoint,
  aEnd: ImportedPcbPoint,
  bStart: ImportedPcbPoint,
  bEnd: ImportedPcbPoint
) {
  if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) {
    return {
      distance: 0,
      closest: aStart,
    };
  }

  const candidates = [
    pointLineSegmentDistance(aStart, bStart, bEnd),
    pointLineSegmentDistance(aEnd, bStart, bEnd),
    pointLineSegmentDistance(bStart, aStart, aEnd),
    pointLineSegmentDistance(bEnd, aStart, aEnd),
  ];
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function polygonEdges(points: ImportedPcbPoint[]) {
  const edges: Array<{ start: ImportedPcbPoint; end: ImportedPcbPoint }> = [];
  if (points.length < 2) {
    return edges;
  }
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    edges.push({ start, end });
  }
  return edges;
}

function pointInPolygon(point: ImportedPcbPoint, polygon: ImportedPcbPoint[]) {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (pointOnSegment(point, a, b)) {
      return true;
    }
    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointPolygonDistance(point: ImportedPcbPoint, polygon: ImportedPcbPoint[]) {
  if (polygon.length === 0) {
    return {
      distance: Number.POSITIVE_INFINITY,
      closest: point,
    };
  }
  if (pointInPolygon(point, polygon)) {
    return { distance: 0, closest: point };
  }

  return polygonEdges(polygon)
    .map(edge => pointLineSegmentDistance(point, edge.start, edge.end))
    .reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function segmentPolygonDistance(
  start: ImportedPcbPoint,
  end: ImportedPcbPoint,
  polygon: ImportedPcbPoint[]
) {
  if (polygon.length === 0) {
    return {
      distance: Number.POSITIVE_INFINITY,
      closest: start,
    };
  }
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) {
    return { distance: 0, closest: start };
  }

  const candidates = polygonEdges(polygon).map(edge => segmentDistance(start, end, edge.start, edge.end));
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function polygonPolygonDistance(first: ImportedPcbPoint[], second: ImportedPcbPoint[]) {
  if (first.length === 0 || second.length === 0) {
    return {
      distance: Number.POSITIVE_INFINITY,
      closest: first[0] ?? second[0] ?? { x: 0, y: 0 },
    };
  }
  if (
    first.some(point => pointInPolygon(point, second)) ||
    second.some(point => pointInPolygon(point, first))
  ) {
    return { distance: 0, closest: first[0]! };
  }

  const candidates = polygonEdges(first).flatMap(firstEdge =>
    polygonEdges(second).map(secondEdge =>
      segmentDistance(firstEdge.start, firstEdge.end, secondEdge.start, secondEdge.end)
    )
  );

  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function graphicToSegments(graphic: ImportedPcbGraphic) {
  switch (graphic.kind) {
    case 'line':
      return [{ start: graphic.start, end: graphic.end }];
    case 'polyline':
      return graphic.points.slice(1).map((point, index) => ({
        start: graphic.points[index]!,
        end: point,
      }));
    case 'arc':
      return [
        { start: graphic.start, end: graphic.mid },
        { start: graphic.mid, end: graphic.end },
      ];
    case 'circle': {
      const segments: Array<{ start: ImportedPcbPoint; end: ImportedPcbPoint }> = [];
      const steps = 32;
      for (let index = 0; index < steps; index += 1) {
        const startAngle = (index / steps) * Math.PI * 2;
        const endAngle = ((index + 1) / steps) * Math.PI * 2;
        segments.push({
          start: {
            x: graphic.center.x + Math.cos(startAngle) * graphic.radius,
            y: graphic.center.y + Math.sin(startAngle) * graphic.radius,
          },
          end: {
            x: graphic.center.x + Math.cos(endAngle) * graphic.radius,
            y: graphic.center.y + Math.sin(endAngle) * graphic.radius,
          },
        });
      }
      return segments;
    }
    case 'text':
      return [];
  }
}

function getEdgeSegments(document: ImportedPcbDocument) {
  return document.drawings
    .filter(graphic => graphic.layer === 'Edge.Cuts')
    .flatMap(graphicToSegments);
}

function hasLayer(document: ImportedPcbDocument, layer: string) {
  return document.layers.some(candidate => candidate.name === layer);
}

function hasZoneForNet(document: ImportedPcbDocument, netCode: number) {
  return document.zones.some(zone => zone.netCode === netCode && (zone.polygon.length >= 3 || zone.filledPolygons.length > 0));
}

function validateStructure(document: ImportedPcbDocument, issues: ImportedPcbValidationIssue[]) {
  let index = issues.length;
  if (!document.bounds) {
    issues.push(makeIssue({
      severity: 'error',
      code: 'PCB_EMPTY_GEOMETRY',
      title: 'PCB 형상을 찾을 수 없습니다',
      message: '렌더링할 footprint, 배선, 외곽선, zone 데이터가 없습니다.',
      recommendation: 'KiCad에서 보드 파일이 비어 있지 않은지 확인해 주세요.',
    }, index++));
  }

  if (document.footprints.length === 0) {
    issues.push(makeIssue({
      severity: 'warning',
      code: 'PCB_NO_FOOTPRINTS',
      title: '풋프린트가 없습니다',
      message: '보드에 배치된 footprint가 없어 실장 검증을 할 수 없습니다.',
      recommendation: '회로도에서 footprint를 지정한 뒤 PCB를 업데이트해 주세요.',
    }, index++));
  }

  if (!hasLayer(document, 'Edge.Cuts') || !document.drawings.some(drawing => drawing.layer === 'Edge.Cuts')) {
    issues.push(makeIssue({
      severity: 'error',
      code: 'PCB_NO_EDGE_CUTS',
      title: '보드 외곽선이 없습니다',
      message: 'Edge.Cuts 레이어의 외곽선이 없으면 제조사가 보드 크기를 확정할 수 없습니다.',
      recommendation: 'Edge.Cuts 레이어에 닫힌 보드 외곽선을 추가해 주세요.',
      layer: 'Edge.Cuts',
    }, index++));
  }

  const references = new Map<string, number>();
  for (const footprint of document.footprints) {
    references.set(footprint.reference, (references.get(footprint.reference) ?? 0) + 1);
    if (footprint.pads.length === 0) {
      issues.push(makeIssue({
        severity: 'warning',
        code: 'PCB_FOOTPRINT_WITHOUT_PADS',
        title: '패드가 없는 풋프린트',
        message: `${footprint.reference}에는 pad가 없어 전기적 연결 검증 대상에서 제외됩니다.`,
        recommendation: '실장 부품이라면 올바른 footprint 라이브러리 항목인지 확인해 주세요.',
        footprintRef: footprint.reference,
        at: footprint.at,
      }, index++));
    }
  }

  for (const [reference, count] of references) {
    if (reference && count > 1) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_DUPLICATE_REFERENCE',
        title: '중복된 참조명이 있습니다',
        message: `${reference} 참조명이 ${count}번 사용되었습니다.`,
        recommendation: 'KiCad annotation을 다시 실행해 refdes를 유일하게 만들어 주세요.',
        footprintRef: reference,
      }, index++));
    }
  }
}

function validateManufacturingRules(document: ImportedPcbDocument, issues: ImportedPcbValidationIssue[]) {
  let index = issues.length;
  const minTraceWidth = getMinimumTraceWidth(document);
  const minViaSize = document.setup.viaMinSize ?? 0.4;
  const minViaDrill = document.setup.viaMinDrill ?? 0.25;

  for (const segment of document.segments) {
    if (segment.netCode === 0) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_STRAY_COPPER',
        title: '넷이 없는 구리 배선',
        message: `${segment.layer}에 net 0 배선이 있습니다. 의도하지 않은 쇼트나 DRC 오류로 이어질 수 있습니다.`,
        recommendation: '불필요한 선이면 삭제하고, 필요한 연결이면 올바른 net에 할당해 주세요.',
        layer: segment.layer,
        at: segment.start,
      }, index++));
    }

    if (segment.width + 1e-6 < minTraceWidth) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_TRACK_TOO_NARROW',
        title: '배선 폭이 최소값보다 작습니다',
        message: `${segment.layer} 배선 폭 ${formatMm(segment.width)}가 최소 ${formatMm(minTraceWidth)}보다 작습니다.`,
        recommendation: '보드 규칙에 맞게 track width를 키우거나 net class 규칙을 조정해 주세요.',
        layer: segment.layer,
        netName: segment.netName,
        at: segment.start,
      }, index++));
    }
  }

  for (const via of document.vias) {
    if (via.size + 1e-6 < minViaSize) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_VIA_TOO_SMALL',
        title: '비아 지름이 최소값보다 작습니다',
        message: `비아 지름 ${formatMm(via.size)}가 최소 ${formatMm(minViaSize)}보다 작습니다.`,
        recommendation: '제조사 capability에 맞게 via diameter를 키워 주세요.',
        netName: via.netName,
        at: via.at,
      }, index++));
    }
    if (via.drill + 1e-6 < minViaDrill) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_VIA_DRILL_TOO_SMALL',
        title: '비아 드릴이 최소값보다 작습니다',
        message: `비아 드릴 ${formatMm(via.drill)}가 최소 ${formatMm(minViaDrill)}보다 작습니다.`,
        recommendation: '제조사 capability에 맞게 drill size를 키워 주세요.',
        netName: via.netName,
        at: via.at,
      }, index++));
    }
  }

  for (const zone of document.zones) {
    if (zone.polygon.length < 3 && zone.filledPolygons.length === 0) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_ZONE_WITHOUT_POLYGON',
        title: '비어 있는 copper zone',
        message: `${zone.layer}의 ${zone.netName || `net ${zone.netCode}`} zone에 유효한 polygon이 없습니다.`,
        recommendation: 'zone 외곽을 다시 그리거나 KiCad에서 zone refill을 실행해 주세요.',
        layer: zone.layer,
        netName: zone.netName,
      }, index++));
    }
  }
}

function validateAnnularRings(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  profile: ImportedPcbManufacturingProfile
) {
  let index = issues.length;
  for (const pad of allPads(document)) {
    if (!pad.drill || pad.type === 'np_thru_hole' || padCopperLayers(pad).length === 0) {
      continue;
    }
    const annularRing = (Math.min(pad.size.width, pad.size.height) - pad.drill) / 2;
    if (annularRing + 1e-6 < profile.minAnnularRingMm) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_ANNULAR_RING_TOO_SMALL',
        title: '패드 annular ring 부족',
        message: `${pad.footprintRef}.${pad.number} annular ring ${formatMm(Math.max(0, annularRing))}가 ${profile.name} 최소 ${formatMm(profile.minAnnularRingMm)}보다 작습니다.`,
        recommendation: '드릴을 줄이거나 패드 외경을 키워 제조사 최소 annular ring을 만족시켜 주세요.',
        footprintRef: pad.footprintRef,
        padNumber: pad.number,
        at: pad.absoluteAt,
      }, index++));
    }
  }

  for (const via of document.vias) {
    const annularRing = (via.size - via.drill) / 2;
    if (annularRing + 1e-6 < profile.minAnnularRingMm) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_VIA_ANNULAR_RING_TOO_SMALL',
        title: '비아 annular ring 부족',
        message: `비아 annular ring ${formatMm(Math.max(0, annularRing))}가 ${profile.name} 최소 ${formatMm(profile.minAnnularRingMm)}보다 작습니다.`,
        recommendation: '비아 외경을 키우거나 drill size를 줄여 제조사 공정 여유를 확보해 주세요.',
        netName: via.netName,
        at: via.at,
      }, index++));
    }
  }
}

function validateSolderMaskSlivers(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  profile: ImportedPcbManufacturingProfile
) {
  let index = issues.length;
  let emitted = 0;
  const pads = allPads(document).filter(pad => padMaskLayers(pad).length > 0);
  const setupMaskExpansion = document.setup.padToMaskClearance ?? 0;

  for (let aIndex = 0; aIndex < pads.length && emitted < 30; aIndex += 1) {
    const first = pads[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < pads.length && emitted < 30; bIndex += 1) {
      const second = pads[bIndex]!;
      if (!layersOverlap(padMaskLayers(first), padMaskLayers(second))) {
        continue;
      }
      const firstExpansion = first.solderMaskMargin ?? setupMaskExpansion;
      const secondExpansion = second.solderMaskMargin ?? setupMaskExpansion;
      const maskWeb =
        distance(first.absoluteAt, second.absoluteAt) -
        getPadCopperRadius(first) -
        getPadCopperRadius(second) -
        firstExpansion -
        secondExpansion;

      if (maskWeb + 1e-6 < profile.minSolderMaskSliverMm) {
        issues.push(makeIssue({
          severity: 'warning',
          code: 'PCB_SOLDER_MASK_SLIVER_TOO_SMALL',
          title: '솔더마스크 sliver가 좁습니다',
          message: `${first.footprintRef}.${first.number}와 ${second.footprintRef}.${second.number} 사이 mask web ${formatMm(Math.max(0, maskWeb))}가 최소 ${formatMm(profile.minSolderMaskSliverMm)}보다 작습니다.`,
          recommendation: '패드 간격, solder mask expansion, 제조사 solder mask 최소 폭을 확인해 주세요.',
          footprintRef: first.footprintRef,
          padNumber: first.number,
          at: {
            x: (first.absoluteAt.x + second.absoluteAt.x) / 2,
            y: (first.absoluteAt.y + second.absoluteAt.y) / 2,
          },
        }, index++));
        emitted += 1;
      }
    }
  }
}

function distanceToNearestEdge(point: ImportedPcbPoint, edgeSegments: ReturnType<typeof getEdgeSegments>) {
  return edgeSegments
    .map(edge => pointLineSegmentDistance(point, edge.start, edge.end))
    .reduce((best, candidate) => candidate.distance < best.distance ? candidate : best, {
      distance: Number.POSITIVE_INFINITY,
      closest: point,
    });
}

function validateCopperToEdgeClearance(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  profile: ImportedPcbManufacturingProfile
) {
  const edgeSegments = getEdgeSegments(document);
  if (edgeSegments.length === 0) {
    return;
  }

  let index = issues.length;
  let emitted = 0;
  const limit = 35;
  const pushCopperEdgeIssue = (params: {
    layer?: string;
    netName?: string;
    at: ImportedPcbPoint;
    actualClearance: number;
    label: string;
  }) => {
    if (emitted >= limit || params.actualClearance + 1e-6 >= profile.copperToEdgeClearanceMm) {
      return;
    }
    issues.push(makeIssue({
      severity: 'error',
      code: 'PCB_COPPER_TO_EDGE_CLEARANCE',
      title: '구리와 보드 외곽 간격 부족',
      message: `${params.label}와 Edge.Cuts 간격 ${formatMm(Math.max(0, params.actualClearance))}가 ${profile.name} 최소 ${formatMm(profile.copperToEdgeClearanceMm)}보다 작습니다.`,
      recommendation: '트랙, 패드, zone을 보드 외곽에서 더 안쪽으로 이동하거나 제조사 copper-to-edge 규칙을 조정해 주세요.',
      layer: params.layer,
      netName: params.netName,
      at: params.at,
    }, index++));
    emitted += 1;
  };

  for (const segment of document.segments) {
    const start = distanceToNearestEdge(segment.start, edgeSegments);
    const end = distanceToNearestEdge(segment.end, edgeSegments);
    const nearest = start.distance <= end.distance ? start : end;
    pushCopperEdgeIssue({
      layer: segment.layer,
      netName: segment.netName,
      at: nearest.closest,
      actualClearance: nearest.distance - segment.width / 2,
      label: `${segment.layer} 배선`,
    });
  }

  for (const pad of allPads(document)) {
    if (padCopperLayers(pad).length === 0) {
      continue;
    }
    const nearest = distanceToNearestEdge(pad.absoluteAt, edgeSegments);
    pushCopperEdgeIssue({
      layer: padCopperLayers(pad)[0],
      netName: pad.netName,
      at: nearest.closest,
      actualClearance: nearest.distance - getPadCopperRadius(pad),
      label: `${pad.footprintRef}.${pad.number} 패드`,
    });
  }

  for (const via of document.vias) {
    const nearest = distanceToNearestEdge(via.at, edgeSegments);
    pushCopperEdgeIssue({
      layer: via.layers[0],
      netName: via.netName,
      at: nearest.closest,
      actualClearance: nearest.distance - via.size / 2,
      label: '비아',
    });
  }

  for (const zone of document.zones) {
    const polygons = zone.filledPolygons.length > 0 ? zone.filledPolygons : zone.polygon.length >= 3 ? [zone.polygon] : [];
    for (const polygon of polygons) {
      const nearest = edgeSegments
        .map(edge => segmentPolygonDistance(edge.start, edge.end, polygon))
        .reduce((best, candidate) => candidate.distance < best.distance ? candidate : best, {
          distance: Number.POSITIVE_INFINITY,
          closest: polygon[0] ?? { x: 0, y: 0 },
        });
      pushCopperEdgeIssue({
        layer: zone.layer,
        netName: zone.netName,
        at: nearest.closest,
        actualClearance: nearest.distance,
        label: `${zone.layer} zone`,
      });
    }
  }
}

function validateAdvancedManufacturingRules(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  profile: ImportedPcbManufacturingProfile
) {
  validateAnnularRings(document, issues, profile);
  validateSolderMaskSlivers(document, issues, profile);
  validateCopperToEdgeClearance(document, issues, profile);
}

function endpointKey(point: ImportedPcbPoint) {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function validateNetContinuity(document: ImportedPcbDocument, issues: ImportedPcbValidationIssue[]) {
  let index = issues.length;
  const padsByNet = new Map<number, ImportedPcbPad[]>();
  for (const pad of allPads(document)) {
    if (pad.netCode > 0) {
      const pads = padsByNet.get(pad.netCode) ?? [];
      pads.push(pad);
      padsByNet.set(pad.netCode, pads);
    }
  }

  for (const [netCode, pads] of padsByNet) {
    if (pads.length < 2 || hasZoneForNet(document, netCode)) {
      continue;
    }

    const segments = document.segments.filter(segment => segment.netCode === netCode);
    const vias = document.vias.filter(via => via.netCode === netCode);
    if (segments.length === 0 && vias.length === 0) {
      issues.push(makeIssue({
        severity: 'warning',
        code: 'PCB_NET_HAS_NO_COPPER_PATH',
        title: '연결 경로가 없는 net',
        message: `${pads[0].netName || `net ${netCode}`}에 패드 ${pads.length}개가 있지만 track/via 경로가 없습니다.`,
        recommendation: '의도한 연결이라면 배선을 추가하고, zone 연결이라면 KiCad DRC로 최종 확인해 주세요.',
        netName: pads[0].netName,
        footprintRef: pads[0].footprintRef,
        at: pads[0].absoluteAt,
      }, index++));
      continue;
    }

    const nodeParent = new Map<string, string>();
    const padNodeKeys = new Map<string, string>();

    const addNode = (key: string) => {
      if (!nodeParent.has(key)) {
        nodeParent.set(key, key);
      }
      return key;
    };
    const find = (key: string): string => {
      const parent = nodeParent.get(key) ?? key;
      if (parent === key) {
        return parent;
      }
      const root = find(parent);
      nodeParent.set(key, root);
      return root;
    };
    const union = (a: string, b: string) => {
      const rootA = find(addNode(a));
      const rootB = find(addNode(b));
      if (rootA !== rootB) {
        nodeParent.set(rootA, rootB);
      }
    };

    for (const segment of segments) {
      const startKey = endpointKey(segment.start);
      const endKey = endpointKey(segment.end);
      union(startKey, endKey);
    }

    for (const via of vias) {
      addNode(endpointKey(via.at));
    }

    for (const segment of segments) {
      for (const via of vias) {
        const viaToSegment = pointSegmentDistance(via.at, segment);
        if (viaToSegment.distance <= via.size / 2 + segment.width / 2 + CONNECT_TOLERANCE_MM) {
          union(endpointKey(via.at), endpointKey(viaToSegment.closest));
          union(endpointKey(viaToSegment.closest), endpointKey(segment.start));
        }
      }
    }

    for (const pad of pads) {
      const padKey = `pad:${pad.id}`;
      addNode(padKey);
      padNodeKeys.set(pad.id, padKey);

      for (const segment of segments) {
        const padToSegment = pointSegmentDistance(pad.absoluteAt, segment);
        if (padToSegment.distance <= getPadCopperRadius(pad) + segment.width / 2 + CONNECT_TOLERANCE_MM) {
          union(padKey, endpointKey(segment.start));
          union(padKey, endpointKey(segment.end));
        }
      }

      for (const via of vias) {
        if (distance(pad.absoluteAt, via.at) <= getPadCopperRadius(pad) + via.size / 2 + CONNECT_TOLERANCE_MM) {
          union(padKey, endpointKey(via.at));
        }
      }
    }

    const padRoots = new Map<string, ImportedPcbPad[]>();
    for (const pad of pads) {
      const root = find(padNodeKeys.get(pad.id) ?? `pad:${pad.id}`);
      const group = padRoots.get(root) ?? [];
      group.push(pad);
      padRoots.set(root, group);
    }

    if (padRoots.size > 1) {
      const groups = Array.from(padRoots.values()).sort((a, b) => b.length - a.length);
      const disconnected = groups.slice(1).flat();
      const sample = disconnected[0];
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_NET_DISCONNECTED',
        title: '물리적으로 끊긴 net',
        message: `${sample.netName || `net ${netCode}`}의 패드들이 ${padRoots.size}개 구리 섬으로 나뉘어 있습니다.`,
        recommendation: '끊긴 패드 사이에 track/via를 추가하거나 KiCad DRC의 unconnected 항목을 확인해 주세요.',
        netName: sample.netName,
        footprintRef: sample.footprintRef,
        padNumber: sample.number,
        at: sample.absoluteAt,
      }, index++));
    }
  }
}

function validateClearance(document: ImportedPcbDocument, issues: ImportedPcbValidationIssue[]) {
  let index = issues.length;
  const clearance = getClearance(document);
  const pads = allPads(document);
  const trackPadGroups = new Map<string, {
    segment: ImportedPcbTrackSegment;
    pad: ImportedPcbPad;
    actualClearance: number;
    requiredClearance: number;
    at: ImportedPcbPoint;
    count: number;
    items: NonNullable<ImportedPcbValidationIssue['items']>;
  }>();

  for (const segment of document.segments) {
    for (const pad of pads) {
      if (pad.netCode === segment.netCode && pad.netCode !== 0) {
        continue;
      }
      if (!padTouchesCopperLayer(pad, segment.layer)) {
        continue;
      }
      const result = pointSegmentDistance(pad.absoluteAt, segment);
      const actualClearance = result.distance - getPadCopperRadius(pad) - segment.width / 2;
      const requiredClearance = Math.max(pad.clearance ?? clearance, clearance);
      if (actualClearance + 1e-6 < requiredClearance) {
        const groupKey = [
          segment.layer,
          segment.netName || `net-${segment.netCode}`,
          pad.footprintRef,
          pad.number,
          pad.netName || `net-${pad.netCode}`,
        ].join(':');
        const description = `${segment.netName || `net ${segment.netCode}`} 배선 간격 ${formatMm(Math.max(0, actualClearance))}`;
        const existing = trackPadGroups.get(groupKey);
        if (!existing) {
          trackPadGroups.set(groupKey, {
            segment,
            pad,
            actualClearance,
            requiredClearance,
            at: result.closest,
            count: 1,
            items: [{ description, at: result.closest }],
          });
          continue;
        }

        existing.count += 1;
        if (existing.items.length < MAX_TRACK_PAD_CLEARANCE_ITEMS) {
          existing.items.push({ description, at: result.closest });
        }
        if (actualClearance < existing.actualClearance) {
          existing.segment = segment;
          existing.pad = pad;
          existing.actualClearance = actualClearance;
          existing.requiredClearance = requiredClearance;
          existing.at = result.closest;
        }
      }
    }
  }

  const sortedTrackPadGroups = Array.from(trackPadGroups.values())
    .sort((a, b) => a.actualClearance - b.actualClearance);
  const emittedTrackPadGroups = sortedTrackPadGroups.slice(0, MAX_TRACK_PAD_CLEARANCE_GROUPS);
  for (const group of emittedTrackPadGroups) {
    const hiddenCount = Math.max(0, group.count - group.items.length);
    const items = group.count > 1
      ? [
          ...group.items,
          ...(hiddenCount > 0 ? [{ description: `같은 패드 주변 추가 ${hiddenCount}건은 대표 이슈에 묶었습니다.` }] : []),
        ]
      : undefined;
    issues.push(makeIssue({
      severity: 'warning',
      code: 'PCB_CLEARANCE_TRACK_PAD',
      title: '배선과 패드 간격 확인 필요',
      message: group.count > 1
        ? `${group.segment.layer} 배선과 ${group.pad.footprintRef}.${group.pad.number} 패드 간격 대표값 ${formatMm(Math.max(0, group.actualClearance))}가 최소 ${formatMm(group.requiredClearance)}보다 작습니다. 같은 패드 주변 ${group.count}건을 대표 이슈 1건으로 묶었습니다.`
        : `${group.segment.layer} 배선과 ${group.pad.footprintRef}.${group.pad.number} 패드 간격 ${formatMm(Math.max(0, group.actualClearance))}가 최소 ${formatMm(group.requiredClearance)}보다 작습니다.`,
      recommendation: '배선을 패드에서 더 멀리 이동하거나 보드 clearance 규칙을 확인해 주세요. 최종 판정은 KiCad DRC와 제조사 규칙으로 확인해 주세요.',
      layer: group.segment.layer,
      netName: group.segment.netName || group.pad.netName,
      footprintRef: group.pad.footprintRef,
      padNumber: group.pad.number,
      at: group.at,
      items,
    }, index++));
  }
  const omittedTrackPadGroups = sortedTrackPadGroups.length - emittedTrackPadGroups.length;
  if (omittedTrackPadGroups > 0) {
    issues.push(makeIssue({
      severity: 'warning',
      code: 'PCB_CLEARANCE_TRACK_PAD_GROUP_LIMIT',
      title: '배선-패드 간격 후보가 많아 대표 항목만 표시했습니다',
      message: `배선-패드 간격 후보 ${sortedTrackPadGroups.length}개 그룹 중 가장 가까운 ${MAX_TRACK_PAD_CLEARANCE_GROUPS}개만 표시했습니다. 나머지 ${omittedTrackPadGroups}개 그룹은 KiCad DRC에서 일괄 확인해 주세요.`,
      recommendation: 'ModuMake 목록은 대표 위치 선별용으로 보고, 전체 clearance 목록은 KiCad DRC 리포트로 확인해 주세요.',
    }, index++));
  }

  for (let aIndex = 0; aIndex < document.segments.length; aIndex += 1) {
    const first = document.segments[aIndex];
    for (let bIndex = aIndex + 1; bIndex < document.segments.length; bIndex += 1) {
      const second = document.segments[bIndex];
      if (first.layer !== second.layer || (first.netCode === second.netCode && first.netCode !== 0)) {
        continue;
      }
      const result = segmentSegmentDistance(first, second);
      const actualClearance = result.distance - first.width / 2 - second.width / 2;
      if (actualClearance + 1e-6 < clearance) {
        issues.push(makeIssue({
          severity: 'error',
          code: 'PCB_CLEARANCE_TRACK_TRACK',
          title: '배선 간격 부족',
          message: `${first.layer}의 서로 다른 net 배선 간격 ${formatMm(Math.max(0, actualClearance))}가 최소 ${formatMm(clearance)}보다 작습니다.`,
          recommendation: '두 배선 사이 간격을 넓히거나 net 할당을 확인해 주세요.',
          layer: first.layer,
          netName: first.netName || second.netName,
          at: result.closest,
        }, index++));
      }
    }
  }

  let padPadIssues = 0;
  for (let aIndex = 0; aIndex < pads.length && padPadIssues < 30; aIndex += 1) {
    const first = pads[aIndex]!;
    const firstLayers = padCopperLayers(first);
    if (firstLayers.length === 0) {
      continue;
    }
    for (let bIndex = aIndex + 1; bIndex < pads.length && padPadIssues < 30; bIndex += 1) {
      const second = pads[bIndex]!;
      if (
        (first.netCode === second.netCode && first.netCode !== 0) ||
        !layersOverlap(firstLayers, padCopperLayers(second))
      ) {
        continue;
      }
      const requiredClearance = Math.max(first.clearance ?? clearance, second.clearance ?? clearance, clearance);
      const actualClearance = distance(first.absoluteAt, second.absoluteAt) -
        getPadCopperRadius(first) -
        getPadCopperRadius(second);
      if (actualClearance + 1e-6 < requiredClearance) {
        issues.push(makeIssue({
          severity: 'error',
          code: 'PCB_CLEARANCE_PAD_PAD',
          title: '패드 간격 부족',
          message: `${first.footprintRef}.${first.number}와 ${second.footprintRef}.${second.number} 패드 간격 ${formatMm(Math.max(0, actualClearance))}가 최소 ${formatMm(requiredClearance)}보다 작습니다.`,
          recommendation: '풋프린트, 패드 간격, net 할당을 확인해 주세요.',
          netName: first.netName || second.netName,
          footprintRef: first.footprintRef,
          padNumber: first.number,
          at: {
            x: (first.absoluteAt.x + second.absoluteAt.x) / 2,
            y: (first.absoluteAt.y + second.absoluteAt.y) / 2,
          },
        }, index++));
        padPadIssues += 1;
      }
    }
  }
}

function getZonePolygons(zone: ImportedPcbZone) {
  return zone.filledPolygons.length > 0
    ? zone.filledPolygons
    : zone.polygon.length >= 3
      ? [zone.polygon]
      : [];
}

function viaTouchesLayer(via: ImportedPcbVia, layer: string) {
  return (
    via.layers.includes(layer) ||
    via.layers.includes('*.Cu') ||
    (via.layers.includes('F.Cu') && via.layers.includes('B.Cu'))
  );
}

function validateZonePolygonClearance(document: ImportedPcbDocument, issues: ImportedPcbValidationIssue[]) {
  let index = issues.length;
  let emitted = 0;
  const limit = 40;
  const pads = allPads(document);

  for (const zone of document.zones) {
    const polygons = getZonePolygons(zone);
    if (polygons.length === 0) {
      continue;
    }
    const requiredClearance = getZoneClearance(document, zone);

    for (const polygon of polygons) {
      for (const segment of document.segments) {
        if (emitted >= limit) {
          return;
        }
        if (segment.layer !== zone.layer || (segment.netCode === zone.netCode && zone.netCode !== 0)) {
          continue;
        }
        const result = segmentPolygonDistance(segment.start, segment.end, polygon);
        const actualClearance = result.distance - segment.width / 2;
        if (actualClearance + 1e-6 < requiredClearance) {
          issues.push(makeIssue({
            severity: 'error',
            code: 'PCB_ZONE_CLEARANCE_TRACK',
            title: 'zone fill과 배선 간격 부족',
            message: `${zone.layer} zone과 ${segment.netName || `net ${segment.netCode}`} 배선 간격 ${formatMm(Math.max(0, actualClearance))}가 최소 ${formatMm(requiredClearance)}보다 작습니다.`,
            recommendation: 'KiCad에서 zone refill을 실행하고, zone clearance 또는 배선 위치를 조정해 주세요.',
            layer: zone.layer,
            netName: zone.netName || segment.netName,
            at: result.closest,
          }, index++));
          emitted += 1;
        }
      }

      for (const pad of pads) {
        if (emitted >= limit) {
          return;
        }
        if (
          (pad.netCode === zone.netCode && zone.netCode !== 0) ||
          !padCopperLayers(pad).includes(zone.layer)
        ) {
          continue;
        }
        const result = pointPolygonDistance(pad.absoluteAt, polygon);
        const actualClearance = result.distance - getPadCopperRadius(pad);
        const requiredPadClearance = Math.max(requiredClearance, pad.clearance ?? 0);
        if (actualClearance + 1e-6 < requiredPadClearance) {
          issues.push(makeIssue({
            severity: 'error',
            code: 'PCB_ZONE_CLEARANCE_PAD',
            title: 'zone fill과 패드 간격 부족',
            message: `${zone.layer} zone과 ${pad.footprintRef}.${pad.number} 패드 간격 ${formatMm(Math.max(0, actualClearance))}가 최소 ${formatMm(requiredPadClearance)}보다 작습니다.`,
            recommendation: 'zone clearance, pad clearance 또는 footprint 배치를 확인해 주세요.',
            layer: zone.layer,
            netName: zone.netName || pad.netName,
            footprintRef: pad.footprintRef,
            padNumber: pad.number,
            at: result.closest,
          }, index++));
          emitted += 1;
        }
      }

      for (const via of document.vias) {
        if (emitted >= limit) {
          return;
        }
        if (
          (via.netCode === zone.netCode && zone.netCode !== 0) ||
          !viaTouchesLayer(via, zone.layer)
        ) {
          continue;
        }
        const result = pointPolygonDistance(via.at, polygon);
        const actualClearance = result.distance - via.size / 2;
        if (actualClearance + 1e-6 < requiredClearance) {
          issues.push(makeIssue({
            severity: 'error',
            code: 'PCB_ZONE_CLEARANCE_VIA',
            title: 'zone fill과 비아 간격 부족',
            message: `${zone.layer} zone과 비아 간격 ${formatMm(Math.max(0, actualClearance))}가 최소 ${formatMm(requiredClearance)}보다 작습니다.`,
            recommendation: '비아 위치, zone clearance, thermal/solid 연결 설정을 확인해 주세요.',
            layer: zone.layer,
            netName: zone.netName || via.netName,
            at: result.closest,
          }, index++));
          emitted += 1;
        }
      }
    }
  }

  for (let aIndex = 0; aIndex < document.zones.length && emitted < limit; aIndex += 1) {
    const first = document.zones[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < document.zones.length && emitted < limit; bIndex += 1) {
      const second = document.zones[bIndex]!;
      if (first.layer !== second.layer || (first.netCode === second.netCode && first.netCode !== 0)) {
        continue;
      }
      const firstPolygons = getZonePolygons(first);
      const secondPolygons = getZonePolygons(second);
      const requiredClearance = Math.max(getZoneClearance(document, first), getZoneClearance(document, second));
      for (const firstPolygon of firstPolygons) {
        for (const secondPolygon of secondPolygons) {
          const result = polygonPolygonDistance(firstPolygon, secondPolygon);
          if (result.distance + 1e-6 < requiredClearance) {
            issues.push(makeIssue({
              severity: 'error',
              code: 'PCB_ZONE_CLEARANCE_ZONE',
              title: '서로 다른 zone 간격 부족',
              message: `${first.layer}의 서로 다른 net zone 간격 ${formatMm(Math.max(0, result.distance))}가 최소 ${formatMm(requiredClearance)}보다 작습니다.`,
              recommendation: 'zone priority, clearance, refill 결과를 KiCad에서 확인해 주세요.',
              layer: first.layer,
              netName: first.netName || second.netName,
              at: result.closest,
            }, index++));
            emitted += 1;
          }
        }
      }
    }
  }
}

function segmentLength(segment: ImportedPcbTrackSegment) {
  return distance(segment.start, segment.end);
}

function routeLengthForNet(document: ImportedPcbDocument, netName: string) {
  return document.segments
    .filter(segment => segment.netName === netName)
    .reduce((sum, segment) => sum + segmentLength(segment), 0);
}

function diffPairCandidate(netName: string) {
  const upper = netName.trim().toUpperCase();
  const suffixes = [
    { suffix: '_DP', polarity: 'p' as const },
    { suffix: '_DM', polarity: 'n' as const },
    { suffix: '.DP', polarity: 'p' as const },
    { suffix: '.DM', polarity: 'n' as const },
    { suffix: '/DP', polarity: 'p' as const },
    { suffix: '/DM', polarity: 'n' as const },
    { suffix: 'D+', polarity: 'p' as const },
    { suffix: 'D-', polarity: 'n' as const },
    { suffix: '_P', polarity: 'p' as const },
    { suffix: '_N', polarity: 'n' as const },
    { suffix: '+', polarity: 'p' as const },
    { suffix: '-', polarity: 'n' as const },
  ];

  for (const candidate of suffixes) {
    if (!upper.endsWith(candidate.suffix)) {
      continue;
    }
    const base = upper.slice(0, -candidate.suffix.length);
    if (base.length < 2 || ['GND', 'VCC', 'VDD'].includes(base)) {
      continue;
    }
    return {
      base,
      polarity: candidate.polarity,
      name: netName,
    };
  }

  return null;
}

function discoverDifferentialPairs(document: ImportedPcbDocument) {
  const grouped = new Map<string, { p?: string; n?: string }>();
  for (const net of document.nets) {
    const candidate = diffPairCandidate(net.name);
    if (!candidate) {
      continue;
    }
    const group = grouped.get(candidate.base) ?? {};
    group[candidate.polarity] = candidate.name;
    grouped.set(candidate.base, group);
  }

  return Array.from(grouped.entries()).flatMap(([base, pair]) =>
    pair.p && pair.n
      ? [{ base, positive: pair.p, negative: pair.n }]
      : []
  );
}

function segmentAngle(segment: ImportedPcbTrackSegment) {
  return Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
}

function angleDifference(a: number, b: number) {
  const diff = Math.abs(a - b) % Math.PI;
  return Math.min(diff, Math.PI - diff);
}

function getDiffPairGapSamples(
  positiveSegments: ImportedPcbTrackSegment[],
  negativeSegments: ImportedPcbTrackSegment[]
) {
  const samples: Array<{ gap: number; at: ImportedPcbPoint }> = [];
  for (const positive of positiveSegments) {
    for (const negative of negativeSegments) {
      if (positive.layer !== negative.layer) {
        continue;
      }
      if (angleDifference(segmentAngle(positive), segmentAngle(negative)) > (10 * Math.PI) / 180) {
        continue;
      }
      const result = segmentSegmentDistance(positive, negative);
      const gap = result.distance - positive.width / 2 - negative.width / 2;
      if (gap >= -0.05 && gap <= 5) {
        samples.push({
          gap,
          at: result.closest,
        });
      }
    }
  }
  return samples;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function validateDifferentialPairs(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  profile: ImportedPcbManufacturingProfile
) {
  const pairs = discoverDifferentialPairs(document);
  if (pairs.length === 0) {
    return;
  }

  let index = issues.length;
  for (const pair of pairs) {
    const positiveSegments = document.segments.filter(segment => segment.netName === pair.positive);
    const negativeSegments = document.segments.filter(segment => segment.netName === pair.negative);
    const positiveLength = routeLengthForNet(document, pair.positive);
    const negativeLength = routeLengthForNet(document, pair.negative);
    const lengthTolerance =
      getNetClass(document, pair.positive)?.lengthMatchTolerance ??
      getNetClass(document, pair.negative)?.lengthMatchTolerance ??
      profile.lengthMatchToleranceMm;
    const lengthDelta = Math.abs(positiveLength - negativeLength);

    if (positiveLength > 0 && negativeLength > 0 && lengthDelta > lengthTolerance) {
      issues.push(makeIssue({
        severity: 'warning',
        code: 'PCB_DIFF_PAIR_LENGTH_MISMATCH',
        title: 'differential pair 길이 차이',
        message: `${pair.positive}/${pair.negative} 길이 차이 ${formatMm(lengthDelta)}가 허용 ${formatMm(lengthTolerance)}보다 큽니다.`,
        recommendation: 'meander 또는 routing 조정으로 P/N 길이를 맞추고, 최종 값은 KiCad length tuning/DRC로 확인해 주세요.',
        netName: `${pair.positive}/${pair.negative}`,
        at: positiveSegments[0]?.start ?? negativeSegments[0]?.start,
      }, index++));
    }

    const netClass = getNetClass(document, pair.positive) ?? getNetClass(document, pair.negative);
    const expectedWidth = netClass?.diffPairWidth;
    if (expectedWidth != null) {
      for (const segment of [...positiveSegments, ...negativeSegments]) {
        if (Math.abs(segment.width - expectedWidth) > profile.diffPairWidthToleranceMm) {
          issues.push(makeIssue({
            severity: 'warning',
            code: 'PCB_DIFF_PAIR_WIDTH_MISMATCH',
            title: 'differential pair 폭 불일치',
            message: `${segment.netName} 배선 폭 ${formatMm(segment.width)}가 net class diff pair 폭 ${formatMm(expectedWidth)}와 다릅니다.`,
            recommendation: 'net class의 differential pair width와 실제 track width를 맞춰 주세요.',
            layer: segment.layer,
            netName: segment.netName,
            at: segment.start,
          }, index++));
          break;
        }
      }
    }

    const expectedGap = netClass?.diffPairGap;
    const gapSamples = getDiffPairGapSamples(positiveSegments, negativeSegments);
    if (expectedGap != null) {
      const representativeGap = median(gapSamples.map(sample => sample.gap));
      if (representativeGap == null && positiveSegments.length > 0 && negativeSegments.length > 0) {
        issues.push(makeIssue({
          severity: 'warning',
          code: 'PCB_DIFF_PAIR_NO_COUPLED_ROUTE',
          title: 'differential pair가 나란히 라우팅되지 않았습니다',
          message: `${pair.positive}/${pair.negative}에서 같은 레이어의 평행 구간을 찾지 못했습니다.`,
          recommendation: '차동쌍 라우팅 도구로 P/N을 같이 배선하고 KiCad DRC로 pair gap을 확인해 주세요.',
          netName: `${pair.positive}/${pair.negative}`,
          at: positiveSegments[0]?.start ?? negativeSegments[0]?.start,
        }, index++));
      } else if (representativeGap != null && Math.abs(representativeGap - expectedGap) > profile.diffPairGapToleranceMm) {
        const sample = gapSamples.find(candidate => Math.abs(candidate.gap - representativeGap) < 1e-6);
        issues.push(makeIssue({
          severity: 'warning',
          code: 'PCB_DIFF_PAIR_GAP_MISMATCH',
          title: 'differential pair gap 불일치',
          message: `${pair.positive}/${pair.negative} 대표 gap ${formatMm(representativeGap)}가 net class gap ${formatMm(expectedGap)}와 다릅니다.`,
          recommendation: '차동쌍 간격을 조정하고 제조사 stackup 기준 impedance를 다시 확인해 주세요.',
          netName: `${pair.positive}/${pair.negative}`,
          at: sample?.at ?? positiveSegments[0]?.start ?? negativeSegments[0]?.start,
        }, index++));
      }
    } else {
      issues.push(makeIssue({
        severity: 'info',
        code: 'PCB_DIFF_PAIR_RULES_MISSING',
        title: 'differential pair 규칙이 없습니다',
        message: `${pair.positive}/${pair.negative}로 보이는 net pair가 있지만 net class에 diff pair width/gap 규칙이 없습니다.`,
        recommendation: '고속 신호라면 KiCad net class에 differential pair width/gap과 길이 허용치를 지정해 주세요.',
        netName: `${pair.positive}/${pair.negative}`,
        at: positiveSegments[0]?.start ?? negativeSegments[0]?.start,
      }, index++));
    }

    if (positiveSegments.length > 0 || negativeSegments.length > 0) {
      issues.push(makeIssue({
        severity: 'info',
        code: 'PCB_DIFF_PAIR_IMPEDANCE_UNVERIFIED',
        title: '임피던스는 stackup 기준 확인이 필요합니다',
        message: `${pair.positive}/${pair.negative}의 실제 임피던스는 동박 두께, 유전체 두께, Er, solder mask 조건 없이는 확정할 수 없습니다.`,
        recommendation: '제조사 stackup을 기준으로 KiCad calculator/DRC 또는 제조사 impedance rule로 최종 확인해 주세요.',
        netName: `${pair.positive}/${pair.negative}`,
        at: positiveSegments[0]?.start ?? negativeSegments[0]?.start,
      }, index++));
    }
  }
}

function normalizeReference(value: string) {
  return value.trim().toUpperCase();
}

function isNonElectricalReference(reference: string) {
  const normalized = normalizeReference(reference);
  return (
    normalized.startsWith('#PWR') ||
    normalized.startsWith('#FLG') ||
    normalized.startsWith('MH') ||
    normalized.startsWith('FID') ||
    normalized.startsWith('TP')
  );
}

function expectedSchematicReferences(context: ImportedPcbSchematicParityContext) {
  const fromComponents = context.components
    .map(component => component.importedReference ?? component.importedMapping?.reference ?? '')
    .filter(Boolean);
  const fromScene = context.importedSchematicScene?.symbols?.map(symbol => symbol.reference).filter(Boolean) ?? [];

  return new Set(
    [...fromComponents, ...fromScene]
      .map(normalizeReference)
      .filter(reference => reference && !isNonElectricalReference(reference))
  );
}

function expectedSchematicNetNames(context: ImportedPcbSchematicParityContext) {
  const names = [
    ...context.manualConnections.map(connection => connection.suggestedNetName ?? ''),
    ...context.components.flatMap(component => Object.values(component.assignedPins)),
  ];

  return new Set(names.map(name => name.trim()).filter(name => name.length > 0));
}

export function buildImportedPcbSchematicParityKey(context: ImportedPcbSchematicParityContext) {
  return JSON.stringify({
    nets: Array.from(expectedSchematicNetNames(context)).sort(),
    references: Array.from(expectedSchematicReferences(context)).sort(),
  });
}

function validateSchematicParity(
  document: ImportedPcbDocument,
  issues: ImportedPcbValidationIssue[],
  context: ImportedPcbSchematicParityContext | null | undefined
) {
  if (!context || (context.components.length === 0 && !context.importedSchematicScene)) {
    return;
  }

  let index = issues.length;
  const expectedRefs = expectedSchematicReferences(context);
  const pcbRefs = new Set(
    document.footprints
      .map(footprint => normalizeReference(footprint.reference))
      .filter(reference => reference && !isNonElectricalReference(reference))
  );

  for (const reference of expectedRefs) {
    if (!pcbRefs.has(reference)) {
      issues.push(makeIssue({
        severity: 'error',
        code: 'PCB_SCHEMATIC_MISSING_FOOTPRINT',
        title: '회로도 부품이 PCB에 없습니다',
        message: `${reference}가 회로도에는 있지만 PCB footprint로는 보이지 않습니다.`,
        recommendation: 'KiCad에서 Update PCB from Schematic을 실행하고 footprint assignment를 확인해 주세요.',
        footprintRef: reference,
      }, index++));
    }
  }

  for (const footprint of document.footprints) {
    const reference = normalizeReference(footprint.reference);
    if (!reference || isNonElectricalReference(reference) || expectedRefs.size === 0 || expectedRefs.has(reference)) {
      continue;
    }
    issues.push(makeIssue({
      severity: 'warning',
      code: 'PCB_SCHEMATIC_EXTRA_FOOTPRINT',
      title: 'PCB에만 있는 footprint',
      message: `${footprint.reference}가 PCB에는 있지만 현재 회로도 import 상태에서는 찾지 못했습니다.`,
      recommendation: '의도한 기구/테스트 footprint인지 확인하고, 전기 부품이면 schematic/PCB sync를 다시 수행해 주세요.',
      footprintRef: footprint.reference,
      at: footprint.at,
    }, index++));
  }

  const expectedNets = expectedSchematicNetNames(context);
  const pcbNetNames = new Set(document.nets.map(net => net.name).filter(Boolean));
  for (const netName of expectedNets) {
    if (!pcbNetNames.has(netName)) {
      issues.push(makeIssue({
        severity: 'warning',
        code: 'PCB_SCHEMATIC_NET_MISSING',
        title: '회로도 net이 PCB에 없습니다',
        message: `${netName} net이 회로도 연결 정보에는 있지만 PCB net table에는 없습니다.`,
        recommendation: 'net label 변경, footprint pin mapping, Update PCB from Schematic 결과를 확인해 주세요.',
        netName,
      }, index++));
    }
  }
}

export function validateImportedPcbDocument(
  document: ImportedPcbDocument,
  options: ValidateImportedPcbOptions = {}
): ImportedPcbValidationReport {
  const issues: ImportedPcbValidationIssue[] = [];
  const profile = resolveManufacturingProfile(document, options);
  validateStructure(document, issues);
  validateManufacturingRules(document, issues);
  validateAdvancedManufacturingRules(document, issues, profile);
  validateNetContinuity(document, issues);
  validateClearance(document, issues);
  validateZonePolygonClearance(document, issues);
  validateDifferentialPairs(document, issues, profile);
  validateSchematicParity(document, issues, options.schematicParity);

  const normalizedIssues = normalizeModuMakePrecheckIssues(issues);

  return buildReport('modumake-pcb', normalizedIssues, {
    geometry: true,
    netContinuity: true,
    manufacturability: true,
    polygonClearance: true,
    differentialPairs: true,
    schematicParity: Boolean(options.schematicParity),
    schematicParityContextKey: options.schematicParity
      ? buildImportedPcbSchematicParityKey(options.schematicParity)
      : undefined,
    renderFidelity: false,
    kicadDrc: false,
  });
}

function normalizeDrcSeverity(value: unknown) {
  if (value === 'error') {
    return 'error' as const;
  }
  if (value === 'warning') {
    return 'warning' as const;
  }
  return 'info' as const;
}

function normalizeDrcPoint(pos: DrcJsonItem['pos']): ImportedPcbPoint | undefined {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return undefined;
  }
  return { x: pos.x, y: pos.y };
}

function normalizeDrcItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const candidate = item as DrcJsonItem;
    return [{
      description: typeof candidate.description === 'string' ? candidate.description : 'KiCad DRC item',
      at: normalizeDrcPoint(candidate.pos),
    }];
  });
}

function mapDrcViolation(
  violation: DrcJsonViolation,
  source: 'violations' | 'unconnected_items' | 'schematic_parity',
  index: number
) {
  const type = typeof violation.type === 'string' ? violation.type : source;
  const description = typeof violation.description === 'string'
    ? violation.description
    : 'KiCad DRC finding';
  const items = normalizeDrcItems(violation.items);
  const firstPoint = items.find(item => item.at)?.at;

  return makeIssue({
    source: 'kicad-cli',
    severity: normalizeDrcSeverity(violation.severity),
    code: `KICAD_${type.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
    title: source === 'unconnected_items' ? 'KiCad DRC: 미연결 항목' : `KiCad DRC: ${type}`,
    message: description,
    recommendation: 'KiCad DRC 리포트의 좌표와 항목 설명을 기준으로 보드 파일을 수정해 주세요.',
    at: firstPoint,
    items,
  }, index);
}

function normalizeViolationArray(value: unknown): DrcJsonViolation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is DrcJsonViolation => Boolean(item) && typeof item === 'object');
}

export function mapKiCadPcbDrcReport(
  report: unknown,
  options: { drcMode?: ImportedPcbValidationReport['checks']['kicadDrcMode'] } = {}
): ImportedPcbValidationReport {
  const raw = report && typeof report === 'object' ? report as KiCadDrcJsonReport : {};
  const violations = normalizeViolationArray(raw.violations);
  const unconnected = normalizeViolationArray(raw.unconnected_items);
  const parity = normalizeViolationArray(raw.schematic_parity);
  const issues = [
    ...violations.map((violation, index) => mapDrcViolation(violation, 'violations', index)),
    ...unconnected.map((violation, index) => mapDrcViolation(violation, 'unconnected_items', violations.length + index)),
    ...parity.map((violation, index) => mapDrcViolation(violation, 'schematic_parity', violations.length + unconnected.length + index)),
  ];

  return buildReport('kicad-cli', issues, {
    geometry: false,
    netContinuity: false,
    manufacturability: false,
    kicadDrc: true,
    kicadDrcMode: options.drcMode,
  });
}

export function mergeImportedPcbValidationReports(
  base: ImportedPcbValidationReport,
  extra: ImportedPcbValidationReport
): ImportedPcbValidationReport {
  const seen = new Set<string>();
  const issues = [...base.issues, ...extra.issues].filter(issue => {
    const key = [
      issue.source,
      issue.code,
      issue.message,
      issue.layer,
      issue.netName,
      issue.footprintRef,
      issue.padNumber,
      issue.at?.x.toFixed(3),
      issue.at?.y.toFixed(3),
    ].filter(Boolean).join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return buildReport('mixed', issues, {
    geometry: base.checks.geometry || extra.checks.geometry,
    netContinuity: base.checks.netContinuity || extra.checks.netContinuity,
    manufacturability: base.checks.manufacturability || extra.checks.manufacturability,
    polygonClearance: Boolean(base.checks.polygonClearance || extra.checks.polygonClearance),
    differentialPairs: Boolean(base.checks.differentialPairs || extra.checks.differentialPairs),
    schematicParity: Boolean(base.checks.schematicParity || extra.checks.schematicParity),
    schematicParityContextKey: extra.checks.schematicParityContextKey ?? base.checks.schematicParityContextKey,
    renderFidelity: Boolean(base.checks.renderFidelity || extra.checks.renderFidelity),
    kicadDrc: base.checks.kicadDrc || extra.checks.kicadDrc,
    kicadDrcMode: extra.checks.kicadDrcMode ?? base.checks.kicadDrcMode,
  });
}
