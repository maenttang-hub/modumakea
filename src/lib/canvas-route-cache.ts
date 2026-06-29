type RouteObstacleRect = { x: number; y: number; width: number; height: number };

const MAX_CACHE_ENTRIES = 8;
const routeObstacleCache = new Map<string, RouteObstacleRect[]>();

function areObstacleRectsEqual(previous: RouteObstacleRect[] | undefined, next: RouteObstacleRect[]) {
  if (!previous || previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousRect = previous[index]!;
    const nextRect = next[index]!;
    if (
      previousRect.x !== nextRect.x ||
      previousRect.y !== nextRect.y ||
      previousRect.width !== nextRect.width ||
      previousRect.height !== nextRect.height
    ) {
      return false;
    }
  }

  return true;
}

export function setWireRouteObstacles(routeContextKey: string, obstacleRects: RouteObstacleRect[]) {
  const existingRects = routeObstacleCache.get(routeContextKey);
  if (areObstacleRectsEqual(existingRects, obstacleRects)) {
    return existingRects;
  }

  routeObstacleCache.set(routeContextKey, obstacleRects);

  while (routeObstacleCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = routeObstacleCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    routeObstacleCache.delete(oldestKey);
  }
  return obstacleRects;
}

export function getWireRouteObstacles(routeContextKey: string | undefined) {
  if (!routeContextKey) {
    return [];
  }

  return routeObstacleCache.get(routeContextKey) ?? [];
}

export function clearWireRouteObstacles(routeContextKey: string) {
  routeObstacleCache.delete(routeContextKey);
}
