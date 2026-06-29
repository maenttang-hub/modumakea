import type {
  ImportedSchematicGeometry,
  ImportedSchematicPinAnchor,
  ImportedSchematicPoint,
  ImportedSchematicPrimitive,
} from '@/types';

export const IMPORTED_MM_TO_CANVAS = 1 / 0.18;

function rotatePoint(
  point: ImportedSchematicPoint,
  rotation: 0 | 90 | 180 | 270
): ImportedSchematicPoint {
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

function rotateBounds(
  bounds: ImportedSchematicGeometry['bounds'],
  rotation: 0 | 90 | 180 | 270
) {
  const corners = [
    rotatePoint({ x: bounds.minX, y: bounds.minY }, rotation),
    rotatePoint({ x: bounds.minX, y: bounds.maxY }, rotation),
    rotatePoint({ x: bounds.maxX, y: bounds.minY }, rotation),
    rotatePoint({ x: bounds.maxX, y: bounds.maxY }, rotation),
  ];

  return {
    minX: Math.min(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)),
    maxX: Math.max(...corners.map(point => point.x)),
    maxY: Math.max(...corners.map(point => point.y)),
  };
}

function getPrimitivePoints(
  primitive: ImportedSchematicPrimitive,
  options?: { includeText?: boolean }
): ImportedSchematicPoint[] {
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
      if (options?.includeText === false) {
        return [];
      }
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

function rotatePrimitive(
  primitive: ImportedSchematicPrimitive,
  rotation: 0 | 90 | 180 | 270
): ImportedSchematicPrimitive {
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
        kind: 'arc',
        start: rotatePoint(primitive.start, rotation),
        mid: rotatePoint(primitive.mid, rotation),
        end: rotatePoint(primitive.end, rotation),
      };
    case 'text':
      return {
        kind: 'text',
        at: rotatePoint(primitive.at, rotation),
        text: primitive.text,
        angle: (((primitive.angle + rotation) % 360) + 360) % 360 as 0 | 90 | 180 | 270,
        originalAngle: primitive.originalAngle,
        preserveNativeOrientation: primitive.preserveNativeOrientation,
        sizeMm: primitive.sizeMm,
        role: primitive.role,
        textAnchor: primitive.textAnchor,
        baseline: primitive.baseline,
      };
    default:
      return primitive;
  }
}

export function measureImportedGeometry(
  geometry: ImportedSchematicGeometry,
  rotation: 0 | 90 | 180 | 270,
  options?: { includeText?: boolean }
) {
  const points = [
    ...geometry.primitives.flatMap(primitive =>
      getPrimitivePoints(rotatePrimitive(primitive, rotation), options)
    ),
    ...geometry.pinAnchors.map(pin => rotatePoint(pin.at, rotation)),
  ];

  if (points.length === 0) {
    return {
      minX: -5.08,
      minY: -5.08,
      maxX: 5.08,
      maxY: 5.08,
    };
  }

  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
  };
}

function normalizePoint(
  point: ImportedSchematicPoint,
  origin: ImportedSchematicPoint,
  scale: number
) {
  return {
    x: (point.x - origin.x) * scale,
    y: (point.y - origin.y) * scale,
  };
}

function getPinFacingPosition(pin: ImportedSchematicPinAnchor) {
  switch (pin.angle) {
    case 90:
      return 'top' as const;
    case 180:
      return 'right' as const;
    case 270:
      return 'bottom' as const;
    default:
      return 'left' as const;
  }
}

export function layoutImportedGeometry(
  geometry: ImportedSchematicGeometry,
  rotation: 0 | 90 | 180 | 270,
  scale = IMPORTED_MM_TO_CANVAS,
  options?: { preserveStoredBounds?: boolean }
) {
  const bounds = options?.preserveStoredBounds
    ? rotateBounds(geometry.bounds, rotation)
    : measureImportedGeometry(geometry, rotation, { includeText: false });
  const origin = { x: bounds.minX, y: bounds.minY };
  const width = Math.max((bounds.maxX - bounds.minX) * scale, 24);
  const height = Math.max((bounds.maxY - bounds.minY) * scale, 24);

  return {
    bounds,
    width,
    height,
    primitives: geometry.primitives.map(primitive => {
      const rotated = rotatePrimitive(primitive, rotation);
      switch (rotated.kind) {
        case 'rect':
          return {
            kind: 'rect' as const,
            start: normalizePoint(rotated.start, origin, scale),
            end: normalizePoint(rotated.end, origin, scale),
            fill: rotated.fill,
          };
        case 'polyline':
          return {
            kind: 'polyline' as const,
            points: rotated.points.map(point => normalizePoint(point, origin, scale)),
            fill: rotated.fill,
          };
        case 'circle':
          return {
            kind: 'circle' as const,
            center: normalizePoint(rotated.center, origin, scale),
            radius: rotated.radius * scale,
            fill: rotated.fill,
          };
        case 'arc':
          return {
            kind: 'arc' as const,
            start: normalizePoint(rotated.start, origin, scale),
            mid: normalizePoint(rotated.mid, origin, scale),
            end: normalizePoint(rotated.end, origin, scale),
          };
        case 'text':
          return {
            kind: 'text' as const,
            at: normalizePoint(rotated.at, origin, scale),
            text: rotated.text,
            angle: rotated.angle,
            originalAngle: rotated.originalAngle,
            preserveNativeOrientation: rotated.preserveNativeOrientation,
            sizeMm: rotated.sizeMm,
            role: rotated.role,
            textAnchor: rotated.textAnchor,
            baseline: rotated.baseline,
          };
      }
    }),
    pinAnchors: geometry.pinAnchors.map(pin => {
      const rotatedPoint = rotatePoint(pin.at, rotation);
      const rotatedAngle = (((pin.angle + rotation) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
      return {
        ...pin,
        at: normalizePoint(rotatedPoint, origin, scale),
        lengthPx: pin.lengthMm * scale,
        handlePosition: getPinFacingPosition({ ...pin, angle: rotatedAngle }),
        angle: rotatedAngle,
      };
    }),
  };
}
