import type { CoordMap } from '@/lib/kicad-interpretation/renderer';

export interface CalibrationAnchor {
  readonly parser_mm: readonly [number, number];
  readonly observed_px: readonly [number, number];
}

export interface CoordValidationReport {
  readonly status: 'pass' | 'warn' | 'block';
  readonly mean_error_mm: number;
  readonly max_error_mm: number;
  readonly anchors_checked: number;
  readonly thresholds_version: string;
}

export function mmToPx(xMm: number, yMm: number, coordMap: CoordMap): readonly [number, number] {
  return [
    Number((coordMap.origin_offset_px[0] + xMm * coordMap.scale_px_per_mm).toFixed(3)),
    Number((coordMap.origin_offset_px[1] + yMm * coordMap.scale_px_per_mm).toFixed(3)),
  ];
}

export function pxToMm(xPx: number, yPx: number, coordMap: CoordMap): readonly [number, number] {
  return [
    Number(((xPx - coordMap.origin_offset_px[0]) / coordMap.scale_px_per_mm).toFixed(6)),
    Number(((yPx - coordMap.origin_offset_px[1]) / coordMap.scale_px_per_mm).toFixed(6)),
  ];
}

function distanceMm(left: readonly [number, number], right: readonly [number, number]) {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildCoordValidationReport(params: {
  anchors: ReadonlyArray<CalibrationAnchor>;
  coordMap: CoordMap;
  thresholds: {
    readonly max_error_mm_warn: number;
    readonly max_error_mm_block: number;
  };
  thresholdsVersion: string;
}): CoordValidationReport {
  if (params.anchors.length === 0) {
    return {
      status: 'block',
      mean_error_mm: 0,
      max_error_mm: 0,
      anchors_checked: 0,
      thresholds_version: params.thresholdsVersion,
    };
  }

  const errors = params.anchors.map(anchor => {
    const observedMm = pxToMm(anchor.observed_px[0], anchor.observed_px[1], params.coordMap);
    return distanceMm(anchor.parser_mm, observedMm);
  });

  const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const maxError = Math.max(...errors);
  const status = maxError > params.thresholds.max_error_mm_block
    ? 'block'
    : maxError > params.thresholds.max_error_mm_warn
      ? 'warn'
      : 'pass';

  return {
    status,
    mean_error_mm: Number(meanError.toFixed(6)),
    max_error_mm: Number(maxError.toFixed(6)),
    anchors_checked: errors.length,
    thresholds_version: params.thresholdsVersion,
  };
}
