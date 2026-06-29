import type { BoundingBox, MicronPoint, Segment } from '@/lib/v3-kicad-parser/geometry/primitives';
import { boxesIntersect, segmentBoundingBox } from '@/lib/v3-kicad-parser/geometry/primitives';

function dot(ax: number, ay: number, bx: number, by: number) {
  return ax * bx + ay * by;
}

function distanceSquared(left: MicronPoint, right: MicronPoint) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

export function distancePointToSegmentMicrons(point: MicronPoint, segment: Segment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.sqrt(distanceSquared(point, segment.start));
  }

  const t = Math.max(0, Math.min(1, dot(point.x - segment.start.x, point.y - segment.start.y, dx, dy) / lengthSq));
  const projection = {
    x: segment.start.x + t * dx,
    y: segment.start.y + t * dy,
  };

  return Math.sqrt(distanceSquared(point, projection));
}

function orientation(a: MicronPoint, b: MicronPoint, c: MicronPoint): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pointOnSegment(point: MicronPoint, segment: Segment, tolerance = 0): boolean {
  const minX = Math.min(segment.start.x, segment.end.x) - tolerance;
  const maxX = Math.max(segment.start.x, segment.end.x) + tolerance;
  const minY = Math.min(segment.start.y, segment.end.y) - tolerance;
  const maxY = Math.max(segment.start.y, segment.end.y) + tolerance;

  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
    return false;
  }

  return distancePointToSegmentMicrons(point, segment) <= tolerance;
}

export function pointNearSegment(point: MicronPoint, segment: Segment, toleranceMicrons: number): boolean {
  return distancePointToSegmentMicrons(point, segment) <= toleranceMicrons;
}

export function segmentsIntersect(left: Segment, right: Segment, toleranceMicrons = 0): boolean {
  if (!boxesIntersect(segmentBoundingBox(left), segmentBoundingBox(right))) {
    return false;
  }

  const o1 = orientation(left.start, left.end, right.start);
  const o2 = orientation(left.start, left.end, right.end);
  const o3 = orientation(right.start, right.end, left.start);
  const o4 = orientation(right.start, right.end, left.end);

  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
    return true;
  }

  return (
    pointOnSegment(right.start, left, toleranceMicrons) ||
    pointOnSegment(right.end, left, toleranceMicrons) ||
    pointOnSegment(left.start, right, toleranceMicrons) ||
    pointOnSegment(left.end, right, toleranceMicrons)
  );
}

export function distanceBetweenSegmentsMicrons(left: Segment, right: Segment): number {
  if (segmentsIntersect(left, right, 0)) {
    return 0;
  }

  return Math.min(
    distancePointToSegmentMicrons(left.start, right),
    distancePointToSegmentMicrons(left.end, right),
    distancePointToSegmentMicrons(right.start, left),
    distancePointToSegmentMicrons(right.end, left),
  );
}

export function boundingBoxDistanceMicrons(left: BoundingBox, right: BoundingBox): number {
  if (boxesIntersect(left, right)) {
    return 0;
  }

  const dx = Math.max(0, left.minX - right.maxX, right.minX - left.maxX);
  const dy = Math.max(0, left.minY - right.maxY, right.minY - left.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}
