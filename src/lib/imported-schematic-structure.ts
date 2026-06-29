import type {
  ImportedSchematicScene,
  ImportedSchematicSceneSymbol,
  ImportedSchematicSheetFrame,
} from '@/types';

export type ImportedStructureKind =
  | 'hierarchical-sheet'
  | 'page-frame'
  | 'symbol'
  | 'drawing'
  | 'annotation';

export type ImportedSheetFrameDescriptor = {
  kind: 'hierarchical-sheet';
  title: string;
  subtitle?: string;
  pinCount: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export function describeImportedSheetFrame(
  frame: ImportedSchematicSheetFrame
): ImportedSheetFrameDescriptor {
  const x = Math.min(frame.start.x, frame.end.x);
  const y = Math.min(frame.start.y, frame.end.y);
  const width = Math.abs(frame.end.x - frame.start.x);
  const height = Math.abs(frame.end.y - frame.start.y);
  const title = frame.name?.trim() || frame.file?.trim() || 'Hierarchical sheet';
  const subtitle =
    frame.name?.trim() && frame.file?.trim() && frame.name.trim() !== frame.file.trim()
      ? frame.file.trim()
      : undefined;

  return {
    kind: 'hierarchical-sheet',
    title,
    subtitle,
    pinCount: frame.pins.length,
    bounds: {
      x,
      y,
      width,
      height,
    },
  };
}

export function getImportedHierarchicalSheetDescriptors(
  scene: ImportedSchematicScene | null | undefined
): ImportedSheetFrameDescriptor[] {
  return (scene?.sheetFrames ?? []).map(describeImportedSheetFrame);
}

export type ImportedRectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getImportedSymbolBounds(
  symbol: ImportedSchematicSceneSymbol
): ImportedRectBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visitPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const primitive of symbol.primitives) {
    switch (primitive.kind) {
      case 'rect':
        visitPoint(primitive.start.x, primitive.start.y);
        visitPoint(primitive.end.x, primitive.end.y);
        break;
      case 'polyline':
        for (const point of primitive.points) {
          visitPoint(point.x, point.y);
        }
        break;
      case 'circle':
        visitPoint(primitive.center.x - primitive.radius, primitive.center.y - primitive.radius);
        visitPoint(primitive.center.x + primitive.radius, primitive.center.y + primitive.radius);
        break;
      case 'arc':
        visitPoint(primitive.start.x, primitive.start.y);
        visitPoint(primitive.mid.x, primitive.mid.y);
        visitPoint(primitive.end.x, primitive.end.y);
        break;
      case 'text':
        visitPoint(primitive.at.x, primitive.at.y);
        break;
      default:
        assertNeverImportedPrimitive(primitive);
    }
  }

  for (const anchor of symbol.pinAnchors) {
    visitPoint(anchor.at.x, anchor.at.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function getImportedSheetFrameBounds(
  frame: ImportedSchematicSheetFrame
): ImportedRectBounds {
  const descriptor = describeImportedSheetFrame(frame);
  return descriptor.bounds;
}

export function getImportedBoundsOverlapArea(
  a: ImportedRectBounds,
  b: ImportedRectBounds
): number {
  const overlapWidth =
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight =
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
}

function assertNeverImportedPrimitive(_primitive: never) {
  return _primitive;
}
