import type {
  CoarseRegion,
  GeometryMatchResult,
  InterpretationParsedRect,
  InterpretationParsedSchematic,
  InterpretationParsedSheet,
} from '@/lib/kicad-interpretation/contracts';
import type { CoordMap } from '@/lib/kicad-interpretation/renderer';

function bboxPxToMm(
  bboxPx: readonly [number, number, number, number],
  coordMap: CoordMap
): readonly [number, number, number, number] {
  return [
    Number(((bboxPx[0] - coordMap.origin_offset_px[0]) / coordMap.scale_px_per_mm).toFixed(3)),
    Number(((bboxPx[1] - coordMap.origin_offset_px[1]) / coordMap.scale_px_per_mm).toFixed(3)),
    Number(((bboxPx[2] - coordMap.origin_offset_px[0]) / coordMap.scale_px_per_mm).toFixed(3)),
    Number(((bboxPx[3] - coordMap.origin_offset_px[1]) / coordMap.scale_px_per_mm).toFixed(3)),
  ];
}

function intersectionArea(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number]
) {
  const width = Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0]));
  const height = Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
  return width * height;
}

function bboxArea(bbox: readonly [number, number, number, number]) {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function iou(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number]
) {
  const intersection = intersectionArea(left, right);
  const union = bboxArea(left) + bboxArea(right) - intersection;
  return union > 0 ? intersection / union : 0;
}

type GeometryCandidate =
  | { readonly entityType: 'rect'; readonly entity: InterpretationParsedRect }
  | { readonly entityType: 'sheet'; readonly entity: InterpretationParsedSheet };

export function matchRegionsByGeometry(params: {
  parsed: InterpretationParsedSchematic;
  regions: ReadonlyArray<CoarseRegion>;
  coordMap: CoordMap;
  minIouForMatch: number;
}): GeometryMatchResult[] {
  const candidates: GeometryCandidate[] = [
    ...params.parsed.rects.map(entity => ({ entityType: 'rect' as const, entity })),
    ...params.parsed.sheets.map(entity => ({ entityType: 'sheet' as const, entity })),
  ];

  return params.regions.map(region => {
    const regionMm = bboxPxToMm(region.bbox_px, params.coordMap);
    const best = candidates
      .map(candidate => ({
        candidate,
        score: iou(regionMm, candidate.entity.bbox_mm),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (!best || best.score < params.minIouForMatch) {
      return {
        region_id: region.region_id,
        matched_entity_id: null,
        matched_entity_type: null,
        iou_score: Number((best?.score ?? 0).toFixed(6)),
        nearby_labels: [],
      };
    }

    const nearbyLabels = 'nearby_labels' in best.candidate.entity && Array.isArray(best.candidate.entity.nearby_labels)
      ? best.candidate.entity.nearby_labels.map(label => label.text)
      : [];

    return {
      region_id: region.region_id,
      matched_entity_id: best.candidate.entity.id,
      matched_entity_type: best.candidate.entityType,
      iou_score: Number(best.score.toFixed(6)),
      nearby_labels: nearbyLabels,
    };
  });
}
