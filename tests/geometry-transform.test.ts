import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAffineTransform,
  applyTransform,
  composeAffineTransforms,
  invertAffineTransform,
  toAffineTransform,
} from '@/lib/v3-kicad-parser/geometry/transform';

test('applyTransform keeps KiCad-style mirror -> rotate -> translate ordering stable', () => {
  const point = { x: 1000, y: 2000 };
  const transformed = applyTransform(point, {
    tx: 5000,
    ty: -3000,
    rotation: 90,
    mirrorX: false,
    mirrorY: true,
  });

  assert.deepEqual(transformed, {
    x: 3000,
    y: -4000,
  });
});

test('affine inversion recovers the original point', () => {
  const transform = toAffineTransform({
    tx: 4200,
    ty: -1800,
    rotation: 270,
    mirrorX: true,
    mirrorY: false,
  });
  const inverse = invertAffineTransform(transform);
  const original = { x: 1300, y: -2700 };
  const transformed = applyAffineTransform(original, transform);
  const recovered = applyAffineTransform(transformed, inverse);

  assert.deepEqual(recovered, original);
});

test('composed affine transforms match stepwise application', () => {
  const first = toAffineTransform({
    tx: 1000,
    ty: 2000,
    rotation: 180,
    mirrorX: false,
    mirrorY: false,
  });
  const second = toAffineTransform({
    tx: -500,
    ty: 250,
    rotation: 90,
    mirrorX: false,
    mirrorY: true,
  });
  const composed = composeAffineTransforms(first, second);
  const point = { x: 700, y: 900 };

  const stepwise = applyAffineTransform(applyAffineTransform(point, first), second);
  const direct = applyAffineTransform(point, composed);

  assert.deepEqual(direct, stepwise);
});
