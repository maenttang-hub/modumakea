export interface RoutePoint {
  x: number;
  y: number;
}

export interface RouteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridNode {
  x: number;
  y: number;
  dir: number;
  g: number;
  f: number;
  parent?: string;
}

class MinPriorityQueue<T> {
  private items: T[] = [];
  private readonly compare: (left: T, right: T) => number;

  constructor(compare: (left: T, right: T) => number) {
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    const first = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(index: number) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.compare(this.items[currentIndex], this.items[parentIndex]) >= 0) {
        break;
      }

      [this.items[currentIndex], this.items[parentIndex]] = [this.items[parentIndex], this.items[currentIndex]];
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = leftIndex + 1;
      let nextIndex = currentIndex;

      if (
        leftIndex < this.items.length &&
        this.compare(this.items[leftIndex], this.items[nextIndex]) < 0
      ) {
        nextIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length &&
        this.compare(this.items[rightIndex], this.items[nextIndex]) < 0
      ) {
        nextIndex = rightIndex;
      }

      if (nextIndex === currentIndex) {
        break;
      }

      [this.items[currentIndex], this.items[nextIndex]] = [this.items[nextIndex], this.items[currentIndex]];
      currentIndex = nextIndex;
    }
  }
}

const GRID = 15;
const OBSTACLE_PADDING = 18;
const TURN_PENALTY = 0.45;
const PROXIMITY_PENALTY = 0.2;
const MARGIN = 90;

const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

function keyOf(x: number, y: number, dir: number) {
  return `${x}:${y}:${dir}`;
}

function snap(value: number) {
  return Math.round(value / GRID) * GRID;
}

function manhattan(a: RoutePoint, b: RoutePoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function expandRect(rect: RouteRect): RouteRect {
  return {
    x: rect.x - OBSTACLE_PADDING,
    y: rect.y - OBSTACLE_PADDING,
    width: rect.width + OBSTACLE_PADDING * 2,
    height: rect.height + OBSTACLE_PADDING * 2,
  };
}

function pointInRect(point: RoutePoint, rect: RouteRect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function simplify(points: RoutePoint[]) {
  if (points.length <= 2) {
    return points;
  }

  const result: RoutePoint[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = points[index];
    const next = points[index + 1];

    const sameX = previous.x === current.x && current.x === next.x;
    const sameY = previous.y === current.y && current.y === next.y;

    if (!sameX && !sameY) {
      result.push(current);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

function fallbackRoute(source: RoutePoint, target: RoutePoint, laneOffset: number) {
  const middleX = snap(source.x + (target.x - source.x) / 2 + laneOffset * 8);
  return simplify([
    source,
    { x: middleX, y: source.y },
    { x: middleX, y: target.y },
    target,
  ]);
}

export function buildOrthogonalRoute(
  source: RoutePoint,
  target: RoutePoint,
  obstacleRects: RouteRect[],
  laneOffset = 0
) {
  const expandedObstacles = obstacleRects.map(expandRect);

  const minX = Math.min(source.x, target.x, ...expandedObstacles.map(rect => rect.x)) - MARGIN;
  const minY = Math.min(source.y, target.y, ...expandedObstacles.map(rect => rect.y)) - MARGIN;
  const maxX = Math.max(
    source.x,
    target.x,
    ...expandedObstacles.map(rect => rect.x + rect.width)
  ) + MARGIN;
  const maxY = Math.max(
    source.y,
    target.y,
    ...expandedObstacles.map(rect => rect.y + rect.height)
  ) + MARGIN;

  const snappedSource = { x: snap(source.x), y: snap(source.y) };
  const snappedTarget = { x: snap(target.x), y: snap(target.y) };

  const isBlocked = (point: RoutePoint) => {
    if (manhattan(point, snappedSource) <= GRID || manhattan(point, snappedTarget) <= GRID) {
      return false;
    }

    return expandedObstacles.some(rect => pointInRect(point, rect));
  };

  const proximityPenalty = (point: RoutePoint) => {
    return expandedObstacles.some(rect => pointInRect(point, expandRect(rect)))
      ? PROXIMITY_PENALTY
      : 0;
  };

  const open = new MinPriorityQueue<GridNode>((a, b) => a.f - b.f || a.g - b.g);
  const visited = new Map<string, GridNode>();
  const bestCost = new Map<string, number>();

  open.push({
    x: snappedSource.x,
    y: snappedSource.y,
    dir: -1,
    g: 0,
    f: manhattan(snappedSource, snappedTarget),
  });

  let finalKey: string | undefined;

  while (open.size > 0) {
    const current = open.pop();
    if (!current) {
      break;
    }

    const currentKey = keyOf(current.x, current.y, current.dir);
    if (visited.has(currentKey)) {
      continue;
    }

    visited.set(currentKey, current);

    if (current.x === snappedTarget.x && current.y === snappedTarget.y) {
      finalKey = currentKey;
      break;
    }

    for (let dir = 0; dir < DIRECTIONS.length; dir += 1) {
      const step = DIRECTIONS[dir];
      const nextPoint = {
        x: current.x + step.dx * GRID,
        y: current.y + step.dy * GRID,
      };

      if (
        nextPoint.x < minX ||
        nextPoint.x > maxX ||
        nextPoint.y < minY ||
        nextPoint.y > maxY ||
        isBlocked(nextPoint)
      ) {
        continue;
      }

      const turnCost = current.dir === -1 || current.dir === dir ? 0 : TURN_PENALTY;
      const nextG = current.g + 1 + turnCost + proximityPenalty(nextPoint);
      const positionKey = `${nextPoint.x}:${nextPoint.y}`;

      if (bestCost.has(positionKey) && (bestCost.get(positionKey) ?? Infinity) <= nextG) {
        continue;
      }

      bestCost.set(positionKey, nextG);

      open.push({
        x: nextPoint.x,
        y: nextPoint.y,
        dir,
        g: nextG,
        f: nextG + manhattan(nextPoint, snappedTarget) / GRID,
        parent: currentKey,
      });
    }
  }

  if (!finalKey) {
    return fallbackRoute(source, target, laneOffset);
  }

  const reversed: RoutePoint[] = [];
  let cursor = visited.get(finalKey);

  while (cursor) {
    reversed.push({ x: cursor.x, y: cursor.y });
    cursor = cursor.parent ? visited.get(cursor.parent) : undefined;
  }

  const route = reversed.reverse();
  const points = simplify([
    source,
    ...route.slice(1, -1),
    target,
  ]);

  return points.length >= 2 ? points : fallbackRoute(source, target, laneOffset);
}
