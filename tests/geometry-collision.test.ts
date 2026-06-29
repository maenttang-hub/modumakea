import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundingBoxDistanceMicrons,
  distanceBetweenSegmentsMicrons,
  distancePointToSegmentMicrons,
  pointNearSegment,
  segmentsIntersect,
} from '@/lib/v3-kicad-parser/geometry/collision';
import {
  boundingBoxFromPoints,
  primitiveBoundingBox,
} from '@/lib/v3-kicad-parser/geometry/primitives';

test('distancePointToSegmentMicrons handles long horizontal wires with tiny drift', () => {
  const distance = distancePointToSegmentMicrons(
    { x: 97_460, y: 50_040 },
    {
      kind: 'segment',
      start: { x: 0, y: 50_000 },
      end: { x: 100_000, y: 50_000 },
    }
  );

  assert.equal(distance, 40);
  assert.equal(
    pointNearSegment(
      { x: 97_460, y: 50_040 },
      {
        kind: 'segment',
        start: { x: 0, y: 50_000 },
        end: { x: 100_000, y: 50_000 },
      },
      50,
    ),
    true
  );
});

test('segmentsIntersect catches crossing and touching schematic wires', () => {
  const horizontal = {
    kind: 'segment' as const,
    start: { x: 0, y: 0 },
    end: { x: 10_000, y: 0 },
  };
  const vertical = {
    kind: 'segment' as const,
    start: { x: 5_000, y: -5_000 },
    end: { x: 5_000, y: 5_000 },
  };
  const touching = {
    kind: 'segment' as const,
    start: { x: 10_000, y: 0 },
    end: { x: 20_000, y: 0 },
  };

  assert.equal(segmentsIntersect(horizontal, vertical), true);
  assert.equal(segmentsIntersect(horizontal, touching), true);
});

test('distanceBetweenSegmentsMicrons stays non-zero for separated nets', () => {
  const left = {
    kind: 'segment' as const,
    start: { x: 0, y: 0 },
    end: { x: 10_000, y: 0 },
  };
  const right = {
    kind: 'segment' as const,
    start: { x: 0, y: 2_000 },
    end: { x: 10_000, y: 2_000 },
  };

  assert.equal(distanceBetweenSegmentsMicrons(left, right), 2_000);
});

test('primitiveBoundingBox and boundingBoxDistanceMicrons keep schematic-space bounds predictable', () => {
  const boxA = primitiveBoundingBox({
    kind: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 4_000, y: 2_000 },
      { x: 7_000, y: -1_000 },
    ],
  });
  const boxB = boundingBoxFromPoints([
    { x: 10_000, y: 0 },
    { x: 12_000, y: 2_000 },
  ]);

  assert.deepEqual(boxA, {
    minX: 0,
    minY: -1_000,
    maxX: 7_000,
    maxY: 2_000,
  });
  assert.deepEqual(boxB, {
    minX: 10_000,
    minY: 0,
    maxX: 12_000,
    maxY: 2_000,
  });
  assert.equal(boundingBoxDistanceMicrons(boxA!, boxB!), 3_000);
});
