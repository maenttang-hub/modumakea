import type { MicronPoint } from '@/lib/v3-kicad-parser/geometry/primitives';

export interface Transform2D {
  readonly tx: number;
  readonly ty: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mirrorX: boolean;
  readonly mirrorY: boolean;
}

export interface AffineTransform2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

function rotatePoint(point: MicronPoint, rotation: Transform2D['rotation']): MicronPoint {
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

function mirrorPoint(point: MicronPoint, mirrorX: boolean, mirrorY: boolean): MicronPoint {
  return {
    x: mirrorY ? -point.x : point.x,
    y: mirrorX ? -point.y : point.y,
  };
}

export function applyTransform(point: MicronPoint, transform: Transform2D): MicronPoint {
  const mirrored = mirrorPoint(point, transform.mirrorX, transform.mirrorY);
  const rotated = rotatePoint(mirrored, transform.rotation);
  return {
    x: rotated.x + transform.tx,
    y: rotated.y + transform.ty,
  };
}

export function toAffineTransform(transform: Transform2D): AffineTransform2D {
  const origin = applyTransform({ x: 0, y: 0 }, transform);
  const basisX = applyTransform({ x: 1, y: 0 }, transform);
  const basisY = applyTransform({ x: 0, y: 1 }, transform);

  return {
    a: basisX.x - origin.x,
    b: basisX.y - origin.y,
    c: basisY.x - origin.x,
    d: basisY.y - origin.y,
    tx: origin.x,
    ty: origin.y,
  };
}

export function applyAffineTransform(point: MicronPoint, transform: AffineTransform2D): MicronPoint {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.tx,
    y: transform.b * point.x + transform.d * point.y + transform.ty,
  };
}

export function composeAffineTransforms(
  left: AffineTransform2D,
  right: AffineTransform2D
): AffineTransform2D {
  return {
    a: right.a * left.a + right.c * left.b,
    b: right.b * left.a + right.d * left.b,
    c: right.a * left.c + right.c * left.d,
    d: right.b * left.c + right.d * left.d,
    tx: right.a * left.tx + right.c * left.ty + right.tx,
    ty: right.b * left.tx + right.d * left.ty + right.ty,
  };
}

export function invertAffineTransform(transform: AffineTransform2D): AffineTransform2D {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (determinant === 0) {
    throw new Error('Cannot invert a singular affine transform.');
  }

  const invA = transform.d / determinant;
  const invB = -transform.b / determinant;
  const invC = -transform.c / determinant;
  const invD = transform.a / determinant;

  return {
    a: invA,
    b: invB,
    c: invC,
    d: invD,
    tx: -(invA * transform.tx + invC * transform.ty),
    ty: -(invB * transform.tx + invD * transform.ty),
  };
}
