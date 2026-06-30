import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import { measureImportedTextPrimitiveBox } from '@/lib/imported-schematic-render';
import type {
  ImportedSchematicPageFrame,
  ImportedSchematicPrimitive,
  ImportedSchematicScene,
  ImportedSchematicSheetFrame,
  ImportedSchematicSceneSymbol,
  PlacedComponent,
} from '@/types';

type SceneBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MutableBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type BoundsRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function toSceneBounds(bounds: MutableBounds | null): SceneBounds | null {
  if (!bounds) {
    return null;
  }

  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(bounds.maxX - bounds.minX, 1),
    height: Math.max(bounds.maxY - bounds.minY, 1),
  };
}

function expandRect(rect: BoundsRect, padding: number): BoundsRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectsIntersect(a: BoundsRect, b: BoundsRect) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function getDominantImportedComponentClusterBounds(
  rects: BoundsRect[]
): SceneBounds | null {
  if (rects.length < 2) {
    return rects[0]
      ? {
          x: rects[0].x,
          y: rects[0].y,
          width: rects[0].width,
          height: rects[0].height,
        }
      : null;
  }

  const expandedRects = rects.map(rect => expandRect(rect, 80));
  const visited = new Array(rects.length).fill(false);
  const clusters: Array<{ indices: number[]; bounds: BoundsRect; count: number; area: number }> = [];

  for (let index = 0; index < rects.length; index += 1) {
    if (visited[index]) {
      continue;
    }

    const queue = [index];
    visited[index] = true;
    const indices: number[] = [];
    let bounds: MutableBounds | null = null;
    let area = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      indices.push(current);

      const rect = rects[current];
      bounds = includeRect(bounds, rect.x, rect.y, rect.width, rect.height);
      area += rect.width * rect.height;

      for (let candidate = 0; candidate < expandedRects.length; candidate += 1) {
        if (visited[candidate]) {
          continue;
        }

        if (rectsIntersect(expandedRects[current], expandedRects[candidate])) {
          visited[candidate] = true;
          queue.push(candidate);
        }
      }
    }

    const sceneBounds = toSceneBounds(bounds);
    if (!sceneBounds) {
      continue;
    }

    clusters.push({
      indices,
      bounds: sceneBounds,
      count: indices.length,
      area,
    });
  }

  if (clusters.length <= 1) {
    const unionBounds = rects.reduce<MutableBounds | null>((acc, rect) =>
      includeRect(acc, rect.x, rect.y, rect.width, rect.height), null);
    return toSceneBounds(unionBounds);
  }

  const dominant = [...clusters].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.area - a.area;
  })[0];

  return {
    x: dominant.bounds.x,
    y: dominant.bounds.y,
    width: dominant.bounds.width,
    height: dominant.bounds.height,
  };
}

function getPrimarySceneSymbolRect(
  symbol: ImportedSchematicSceneSymbol
): BoundsRect | null {
  const bounds = includeSceneSymbolPrimaryGeometry(null, symbol);
  const sceneBounds = toSceneBounds(bounds);
  if (!sceneBounds) {
    return null;
  }

  return {
    x: sceneBounds.x,
    y: sceneBounds.y,
    width: sceneBounds.width,
    height: sceneBounds.height,
  };
}

function getDominantImportedPrimarySceneClusterBounds(
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  if (!scene?.symbols?.length) {
    return null;
  }

  const rects = scene.symbols
    .map(symbol => getPrimarySceneSymbolRect(symbol))
    .filter((rect): rect is BoundsRect => Boolean(rect));

  return getDominantImportedComponentClusterBounds(rects);
}

function includePoint(bounds: MutableBounds | null, x: number, y: number): MutableBounds {
  if (!bounds) {
    return {
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    };
  }

  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

function includeRect(
  bounds: MutableBounds | null,
  x: number,
  y: number,
  width: number,
  height: number
): MutableBounds {
  let nextBounds = includePoint(bounds, x, y);
  nextBounds = includePoint(nextBounds, x + width, y + height);
  return nextBounds;
}

function includePrimitive(
  bounds: MutableBounds | null,
  primitive: ImportedSchematicPrimitive
): MutableBounds | null {
  switch (primitive.kind) {
    case 'rect': {
      const x = Math.min(primitive.start.x, primitive.end.x);
      const y = Math.min(primitive.start.y, primitive.end.y);
      const width = Math.abs(primitive.end.x - primitive.start.x);
      const height = Math.abs(primitive.end.y - primitive.start.y);
      return includeRect(bounds, x, y, width, height);
    }
    case 'polyline': {
      let nextBounds = bounds;
      for (const point of primitive.points) {
        nextBounds = includePoint(nextBounds, point.x, point.y);
      }
      return nextBounds;
    }
    case 'circle': {
      return includeRect(
        bounds,
        primitive.center.x - primitive.radius,
        primitive.center.y - primitive.radius,
        primitive.radius * 2,
        primitive.radius * 2
      );
    }
    case 'arc': {
      let nextBounds = includePoint(bounds, primitive.start.x, primitive.start.y);
      nextBounds = includePoint(nextBounds, primitive.mid.x, primitive.mid.y);
      nextBounds = includePoint(nextBounds, primitive.end.x, primitive.end.y);
      return nextBounds;
    }
    case 'text': {
      const box = measureImportedTextPrimitiveBox(primitive);
      return includeRect(bounds, box.x, box.y, box.width, box.height);
    }
  }
}

function includeSceneSymbol(
  bounds: MutableBounds | null,
  symbol: ImportedSchematicSceneSymbol
): MutableBounds | null {
  let nextBounds = bounds;

  for (const primitive of symbol.primitives) {
    nextBounds = includePrimitive(nextBounds, primitive);
  }

  for (const anchor of symbol.pinAnchors) {
    nextBounds = includePoint(nextBounds, anchor.at.x, anchor.at.y);
    const radians = (anchor.angle * Math.PI) / 180;
    nextBounds = includePoint(
      nextBounds,
      anchor.at.x + Math.cos(radians) * anchor.lengthMm * (1 / 0.18),
      anchor.at.y + Math.sin(radians) * anchor.lengthMm * (1 / 0.18)
    );
  }

  return nextBounds;
}

function includeSceneSymbolPrimaryGeometry(
  bounds: MutableBounds | null,
  symbol: ImportedSchematicSceneSymbol
): MutableBounds | null {
  let nextBounds = bounds;

  for (const primitive of symbol.primitives) {
    if (primitive.kind === 'text') {
      continue;
    }
    nextBounds = includePrimitive(nextBounds, primitive);
  }

  for (const anchor of symbol.pinAnchors) {
    nextBounds = includePoint(nextBounds, anchor.at.x, anchor.at.y);
    const radians = (anchor.angle * Math.PI) / 180;
    nextBounds = includePoint(
      nextBounds,
      anchor.at.x + Math.cos(radians) * anchor.lengthMm * (1 / 0.18),
      anchor.at.y + Math.sin(radians) * anchor.lengthMm * (1 / 0.18)
    );
  }

  return nextBounds;
}

export function getImportedSchematicDisplaySheetFrames(
  scene: ImportedSchematicScene | null
): ImportedSchematicSheetFrame[] {
  return scene?.sheetFrames ?? [];
}

export function getImportedSchematicDisplaySymbols(
  scene: ImportedSchematicScene | null
): ImportedSchematicSceneSymbol[] {
  return scene?.symbols ?? [];
}

export function getImportedSchematicDisplayWireSegments(
  scene: ImportedSchematicScene | null
): ImportedSchematicScene['wireSegments'] {
  return scene?.wireSegments ?? [];
}

export function getImportedSchematicDisplayJunctions(
  scene: ImportedSchematicScene | null
): ImportedSchematicScene['junctions'] {
  return scene?.junctions ?? [];
}

export function getImportedSchematicDisplayNoConnects(
  scene: ImportedSchematicScene | null
): NonNullable<ImportedSchematicScene['noConnects']> {
  return scene?.noConnects ?? [];
}

export function getImportedSchematicDisplayLabels(
  scene: ImportedSchematicScene | null
): ImportedSchematicScene['labels'] {
  return scene?.labels ?? [];
}

export function getImportedSchematicDisplayDrawings(
  scene: ImportedSchematicScene | null
): ImportedSchematicPrimitive[] {
  return scene?.drawings ?? [];
}

export function getImportedSchematicDisplayPageFrame(
  scene: ImportedSchematicScene | null
): ImportedSchematicPageFrame | null {
  return scene?.pageFrame ?? null;
}

function includePageFrame(
  bounds: MutableBounds | null,
  pageFrame: ImportedSchematicPageFrame | null
): MutableBounds | null {
  if (!pageFrame) {
    return bounds;
  }

  const x = Math.min(pageFrame.start.x, pageFrame.end.x);
  const y = Math.min(pageFrame.start.y, pageFrame.end.y);
  const width = Math.abs(pageFrame.end.x - pageFrame.start.x);
  const height = Math.abs(pageFrame.end.y - pageFrame.start.y);
  return includeRect(bounds, x, y, width, height);
}

function getImportedSchematicActiveContentBounds(
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  if (!scene) {
    return null;
  }

  let bounds: MutableBounds | null = null;

  for (const segment of scene.wireSegments) {
    bounds = includePoint(bounds, segment.start.x, segment.start.y);
    bounds = includePoint(bounds, segment.end.x, segment.end.y);
  }

  for (const junction of scene.junctions) {
    bounds = includePoint(bounds, junction.x, junction.y);
  }

  for (const label of scene.labels) {
    bounds = includePoint(bounds, label.at.x, label.at.y);
  }

  for (const symbol of scene.symbols ?? []) {
    bounds = includeSceneSymbol(bounds, symbol);
  }

  return toSceneBounds(bounds);
}

function getImportedSchematicPrimaryViewportContentBounds(
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  if (!scene) {
    return null;
  }

  let bounds: MutableBounds | null = null;

  for (const segment of scene.wireSegments) {
    bounds = includePoint(bounds, segment.start.x, segment.start.y);
    bounds = includePoint(bounds, segment.end.x, segment.end.y);
  }

  for (const junction of scene.junctions) {
    bounds = includePoint(bounds, junction.x, junction.y);
  }

  for (const symbol of scene.symbols ?? []) {
    bounds = includeSceneSymbolPrimaryGeometry(bounds, symbol);
  }

  return toSceneBounds(bounds);
}

export function getImportedSchematicSceneBounds(
  components: PlacedComponent[],
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  let sceneBounds: MutableBounds | null = null;

  if (scene) {
    const wireSegments = getImportedSchematicDisplayWireSegments(scene);
    const junctions = getImportedSchematicDisplayJunctions(scene);
    const noConnects = getImportedSchematicDisplayNoConnects(scene);
    const labels = getImportedSchematicDisplayLabels(scene);
    const drawings = getImportedSchematicDisplayDrawings(scene);
    const pageFrame = getImportedSchematicDisplayPageFrame(scene);
    const sheetFrames = getImportedSchematicDisplaySheetFrames(scene);
    const symbols = getImportedSchematicDisplaySymbols(scene);

    sceneBounds = includePageFrame(sceneBounds, pageFrame);

    for (const segment of wireSegments) {
      sceneBounds = includePoint(sceneBounds, segment.start.x, segment.start.y);
      sceneBounds = includePoint(sceneBounds, segment.end.x, segment.end.y);
    }

    for (const junction of junctions) {
      sceneBounds = includePoint(sceneBounds, junction.x, junction.y);
    }

    for (const noConnect of noConnects) {
      sceneBounds = includePoint(sceneBounds, noConnect.x, noConnect.y);
    }

    for (const label of labels) {
      sceneBounds = includePoint(sceneBounds, label.at.x, label.at.y);
    }

    for (const drawing of drawings) {
      sceneBounds = includePrimitive(sceneBounds, drawing);
    }

    for (const frame of sheetFrames) {
      const x = Math.min(frame.start.x, frame.end.x);
      const y = Math.min(frame.start.y, frame.end.y);
      const width = Math.abs(frame.end.x - frame.start.x);
      const height = Math.abs(frame.end.y - frame.start.y);
      sceneBounds = includeRect(sceneBounds, x, y, width, height);

      for (const pin of frame.pins) {
        sceneBounds = includePoint(sceneBounds, pin.at.x, pin.at.y);
      }
    }

    for (const symbol of symbols) {
      sceneBounds = includeSceneSymbol(sceneBounds, symbol);
    }
  }

  if (sceneBounds) {
    return toSceneBounds(sceneBounds);
  }

  let componentBounds: MutableBounds | null = null;

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }

    const layout = layoutImportedGeometry(
      component.importedGeometry,
      component.rotation,
      undefined,
      { preserveStoredBounds: true }
    );
    componentBounds = includeRect(componentBounds, component.position.x, component.position.y, layout.width, layout.height);
  }

  if (!componentBounds) {
    return null;
  }

  return toSceneBounds(componentBounds);
}

export function getImportedSchematicReviewViewportBounds(
  components: PlacedComponent[],
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  const sceneBounds = getImportedSchematicSceneBounds([], scene);
  const activeSceneBounds = getImportedSchematicActiveContentBounds(scene);
  const primarySceneBounds = getImportedSchematicPrimaryViewportContentBounds(scene);
  const sceneOrigin = sceneBounds
    ? { x: sceneBounds.x, y: sceneBounds.y }
    : { x: 0, y: 0 };
  const componentRects: BoundsRect[] = [];

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }

    const layout = layoutImportedGeometry(
      component.importedGeometry,
      component.rotation,
      undefined,
      { preserveStoredBounds: true }
    );

    componentRects.push({
      x: component.position.x - sceneOrigin.x,
      y: component.position.y - sceneOrigin.y,
      width: layout.width,
      height: layout.height,
    });
  }

  const dominantComponentClusterBounds = getDominantImportedComponentClusterBounds(componentRects);
  const dominantPrimarySceneClusterBounds = getDominantImportedPrimarySceneClusterBounds(scene);
  const paddedDominantPrimarySceneClusterBounds = dominantPrimarySceneClusterBounds
    ? {
        x: Math.max(dominantPrimarySceneClusterBounds.x - sceneOrigin.x - 72, 0),
        y: Math.max(dominantPrimarySceneClusterBounds.y - sceneOrigin.y - 72, 0),
        width: dominantPrimarySceneClusterBounds.width + 144,
        height: dominantPrimarySceneClusterBounds.height + 144,
      }
    : null;
  const paddedDominantClusterBounds = dominantComponentClusterBounds
    ? {
        x: Math.max(dominantComponentClusterBounds.x - 96, 0),
        y: Math.max(dominantComponentClusterBounds.y - 96, 0),
        width: dominantComponentClusterBounds.width + 192,
        height: dominantComponentClusterBounds.height + 192,
      }
    : null;

  const preferredClusterBounds = paddedDominantPrimarySceneClusterBounds ?? paddedDominantClusterBounds;

  const prioritizedSceneBounds = primarySceneBounds ?? activeSceneBounds;
  if (prioritizedSceneBounds && preferredClusterBounds) {
    const prioritizedArea = prioritizedSceneBounds.width * prioritizedSceneBounds.height;
    const clusterArea = preferredClusterBounds.width * preferredClusterBounds.height;

    if (clusterArea < prioritizedArea * 0.94) {
      return preferredClusterBounds;
    }
  }

  if (prioritizedSceneBounds) {
    return {
      x: prioritizedSceneBounds.x - sceneOrigin.x,
      y: prioritizedSceneBounds.y - sceneOrigin.y,
      width: prioritizedSceneBounds.width,
      height: prioritizedSceneBounds.height,
    };
  }

  if (sceneBounds) {
    return {
      x: 0,
      y: 0,
      width: sceneBounds.width,
      height: sceneBounds.height,
    };
  }

  return getImportedSchematicViewportBounds(components, scene);
}

export function getImportedSchematicViewportBounds(
  components: PlacedComponent[],
  scene: ImportedSchematicScene | null
): SceneBounds | null {
  const sceneBounds = getImportedSchematicSceneBounds([], scene);
  const activeSceneBounds = getImportedSchematicActiveContentBounds(scene);
  const primarySceneBounds = getImportedSchematicPrimaryViewportContentBounds(scene);
  const sceneOrigin = sceneBounds
    ? { x: sceneBounds.x, y: sceneBounds.y }
    : { x: 0, y: 0 };

  let componentBounds: MutableBounds | null = null;
  const componentRects: BoundsRect[] = [];

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }

    const layout = layoutImportedGeometry(
      component.importedGeometry,
      component.rotation,
      undefined,
      { preserveStoredBounds: true }
    );
    componentBounds = includeRect(
      componentBounds,
      component.position.x - sceneOrigin.x,
      component.position.y - sceneOrigin.y,
      layout.width,
      layout.height
    );
    componentRects.push({
      x: component.position.x - sceneOrigin.x,
      y: component.position.y - sceneOrigin.y,
      width: layout.width,
      height: layout.height,
    });
  }

  if (!sceneBounds && !componentBounds) {
    return null;
  }

  const dominantComponentClusterBounds = getDominantImportedComponentClusterBounds(componentRects);

  if (!sceneBounds && componentBounds) {
    if (dominantComponentClusterBounds) {
      return {
        x: Math.max(dominantComponentClusterBounds.x - 96, 0),
        y: Math.max(dominantComponentClusterBounds.y - 96, 0),
        width: dominantComponentClusterBounds.width + 192,
        height: dominantComponentClusterBounds.height + 192,
      };
    }

    return {
      x: componentBounds.minX,
      y: componentBounds.minY,
      width: Math.max(componentBounds.maxX - componentBounds.minX, 1),
      height: Math.max(componentBounds.maxY - componentBounds.minY, 1),
    };
  }

  if (sceneBounds && !componentBounds) {
    const prioritizedBounds = primarySceneBounds ?? activeSceneBounds;
    if (prioritizedBounds) {
      return {
        x: prioritizedBounds.x - sceneOrigin.x,
        y: prioritizedBounds.y - sceneOrigin.y,
        width: prioritizedBounds.width,
        height: prioritizedBounds.height,
      };
    }

    if (activeSceneBounds) {
      return {
        x: activeSceneBounds.x - sceneOrigin.x,
        y: activeSceneBounds.y - sceneOrigin.y,
        width: activeSceneBounds.width,
        height: activeSceneBounds.height,
      };
    }

    return {
      x: 0,
      y: 0,
      width: sceneBounds.width,
      height: sceneBounds.height,
    };
  }

  const prioritizedSceneBounds = primarySceneBounds ?? activeSceneBounds;
  const normalizedSceneBounds = prioritizedSceneBounds
    ? {
        x: prioritizedSceneBounds.x - sceneOrigin.x,
        y: prioritizedSceneBounds.y - sceneOrigin.y,
        width: prioritizedSceneBounds.width,
        height: prioritizedSceneBounds.height,
      }
    : {
        x: 0,
        y: 0,
        width: sceneBounds!.width,
        height: sceneBounds!.height,
      };

  const merged = includeRect(
    includeRect(
      null,
      normalizedSceneBounds.x,
      normalizedSceneBounds.y,
      normalizedSceneBounds.width,
      normalizedSceneBounds.height
    ),
    componentBounds!.minX,
    componentBounds!.minY,
    Math.max(componentBounds!.maxX - componentBounds!.minX, 1),
    Math.max(componentBounds!.maxY - componentBounds!.minY, 1)
  );

  return {
    x: merged.minX,
    y: merged.minY,
    width: Math.max(merged.maxX - merged.minX, 1),
    height: Math.max(merged.maxY - merged.minY, 1),
  };
}
