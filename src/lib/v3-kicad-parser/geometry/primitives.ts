export interface MicronPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Segment {
  readonly kind: 'segment';
  readonly start: MicronPoint;
  readonly end: MicronPoint;
}

export interface Circle {
  readonly kind: 'circle';
  readonly center: MicronPoint;
  readonly radius: number;
}

export interface Rect {
  readonly kind: 'rect';
  readonly origin: MicronPoint;
  readonly width: number;
  readonly height: number;
}

export interface Polyline {
  readonly kind: 'polyline';
  readonly points: readonly MicronPoint[];
}

export type GeometryPrimitive = Segment | Circle | Rect | Polyline;

export function createBoundingBox(point: MicronPoint): BoundingBox {
  return {
    minX: point.x,
    minY: point.y,
    maxX: point.x,
    maxY: point.y,
  };
}

export function expandBoundingBox(box: BoundingBox, point: MicronPoint): BoundingBox {
  return {
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y),
  };
}

export function boundingBoxFromPoints(points: readonly MicronPoint[]): BoundingBox | null {
  if (points.length === 0) {
    return null;
  }

  let box = createBoundingBox(points[0]!);
  for (const point of points.slice(1)) {
    box = expandBoundingBox(box, point);
  }
  return box;
}

export function segmentBoundingBox(segment: Segment): BoundingBox {
  return boundingBoxFromPoints([segment.start, segment.end])!;
}

export function rectBoundingBox(rect: Rect): BoundingBox {
  return {
    minX: rect.origin.x,
    minY: rect.origin.y,
    maxX: rect.origin.x + rect.width,
    maxY: rect.origin.y + rect.height,
  };
}

export function circleBoundingBox(circle: Circle): BoundingBox {
  return {
    minX: circle.center.x - circle.radius,
    minY: circle.center.y - circle.radius,
    maxX: circle.center.x + circle.radius,
    maxY: circle.center.y + circle.radius,
  };
}

export function primitiveBoundingBox(primitive: GeometryPrimitive): BoundingBox | null {
  switch (primitive.kind) {
    case 'segment':
      return segmentBoundingBox(primitive);
    case 'rect':
      return rectBoundingBox(primitive);
    case 'circle':
      return circleBoundingBox(primitive);
    case 'polyline':
      return boundingBoxFromPoints(primitive.points);
    default:
      return null;
  }
}

export function mergeBoundingBoxes(boxes: readonly (BoundingBox | null | undefined)[]): BoundingBox | null {
  const existing = boxes.filter((box): box is BoundingBox => Boolean(box));
  if (existing.length === 0) {
    return null;
  }

  let merged = existing[0]!;
  for (const box of existing.slice(1)) {
    merged = {
      minX: Math.min(merged.minX, box.minX),
      minY: Math.min(merged.minY, box.minY),
      maxX: Math.max(merged.maxX, box.maxX),
      maxY: Math.max(merged.maxY, box.maxY),
    };
  }
  return merged;
}

export function boxesIntersect(left: BoundingBox, right: BoundingBox): boolean {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}
