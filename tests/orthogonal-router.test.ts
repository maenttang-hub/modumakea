import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrthogonalRoute } from '@/lib/orthogonal-router';

const GRID = 15;
const OBSTACLE_PADDING = 18;

function expandRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x - OBSTACLE_PADDING,
    y: rect.y - OBSTACLE_PADDING,
    width: rect.width + OBSTACLE_PADDING * 2,
    height: rect.height + OBSTACLE_PADDING * 2,
  };
}

function pointInRect(point: { x: number; y: number }, rect: ReturnType<typeof expandRect>) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function assertOrthogonal(route: Array<{ x: number; y: number }>) {
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    assert.ok(
      previous.x === current.x || previous.y === current.y,
      `segment ${index - 1} -> ${index} must stay orthogonal`
    );
  }
}

function sampleRoute(route: Array<{ x: number; y: number }>) {
  const samples: Array<{ x: number; y: number }> = [];

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];

    if (previous.x === current.x) {
      const step = previous.y <= current.y ? GRID : -GRID;
      for (let y = previous.y; y !== current.y; y += step) {
        samples.push({ x: previous.x, y });
      }
    } else {
      const step = previous.x <= current.x ? GRID : -GRID;
      for (let x = previous.x; x !== current.x; x += step) {
        samples.push({ x, y: previous.y });
      }
    }
  }

  samples.push(route[route.length - 1]);
  return samples;
}

test('orthogonal router keeps direct horizontal runs simplified', () => {
  const source = { x: 60, y: 60 };
  const target = { x: 180, y: 60 };

  const route = buildOrthogonalRoute(source, target, []);

  assert.deepEqual(route, [source, target]);
  assertOrthogonal(route);
});

test('orthogonal router detours around a blocking obstacle without entering padded bounds', () => {
  const source = { x: 60, y: 135 };
  const target = { x: 330, y: 135 };
  const obstacle = { x: 150, y: 90, width: 90, height: 90 };
  const expanded = expandRect(obstacle);

  const route = buildOrthogonalRoute(source, target, [obstacle]);

  assert.equal(route[0]?.x, source.x);
  assert.equal(route[0]?.y, source.y);
  assert.equal(route[route.length - 1]?.x, target.x);
  assert.equal(route[route.length - 1]?.y, target.y);
  assert.ok(route.length > 2, 'route should bend around the obstacle');
  assertOrthogonal(route);

  for (const point of sampleRoute(route).slice(1, -1)) {
    assert.equal(pointInRect(point, expanded), false, `sample ${point.x},${point.y} must avoid expanded obstacle`);
  }
});

test('orthogonal router stays clean across multiple obstacle islands', () => {
  const source = { x: 60, y: 60 };
  const target = { x: 300, y: 210 };
  const obstacles = [
    { x: 135, y: 45, width: 90, height: 90 },
    { x: 195, y: 150, width: 90, height: 75 },
  ];
  const expanded = obstacles.map(expandRect);

  const route = buildOrthogonalRoute(source, target, obstacles, 1);

  assert.equal(route[0]?.x, source.x);
  assert.equal(route[0]?.y, source.y);
  assert.equal(route[route.length - 1]?.x, target.x);
  assert.equal(route[route.length - 1]?.y, target.y);
  assertOrthogonal(route);

  const intermediatePoints = sampleRoute(route).slice(1, -1);
  assert.ok(intermediatePoints.length > 0, 'route should contain traversed samples');

  for (const point of intermediatePoints) {
    assert.equal(
      expanded.some(rect => pointInRect(point, rect)),
      false,
      `sample ${point.x},${point.y} must avoid every expanded obstacle`
    );
  }
});
