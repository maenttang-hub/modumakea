import { childForms, collectNestedForms, stringAt, type SExprNode } from '@/lib/s-expr-parser';
import { sanitizePlainText } from '@/lib/security-input';
import { extractLibrarySymbols, extractSymbolInstances, type V3LibraryPin, type V3LibrarySymbol, type V3Point } from '@/lib/v3-kicad-parser/extractors/symbol-extractor';
import { extractWireSegments } from '@/lib/v3-kicad-parser/extractors/wire-extractor';
import { extractJunctionPoints } from '@/lib/v3-kicad-parser/extractors/label-extractor';
import { collectUnresolvedSymbols } from '@/lib/v3-kicad-parser/unresolved-tracker';
import type {
  LabelKind,
  NoConnectMarker,
  SchematicDomainModel,
  SchematicLabel,
  SchematicPin,
  SchematicPoint,
  SchematicSheet,
  SchematicSheetPin,
  SchematicSymbol,
} from '@/types/schematic-domain';

export function mmToMicron(value: number): number {
  return Math.round(value * 1000);
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rounded = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (rounded === 90 || rounded === 180 || rounded === 270) {
    return rounded;
  }
  return 0;
}

function parseAtNode(node: SExprNode[] | undefined) {
  return {
    x: toNumber(stringAt(node, 1, '0')),
    y: toNumber(stringAt(node, 2, '0')),
    angle: normalizeRotation(toNumber(stringAt(node, 3, '0'))),
  };
}

function pointMmToMicron(point: V3Point): SchematicPoint {
  return {
    x: mmToMicron(point.x),
    y: mmToMicron(point.y),
  };
}

function rotatePoint(point: V3Point, rotation: 0 | 90 | 180 | 270): V3Point {
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

function mirrorPoint(point: V3Point, mirrorX: boolean, mirrorY: boolean): V3Point {
  return {
    x: mirrorY ? -point.x : point.x,
    y: mirrorX ? -point.y : point.y,
  };
}

function buildAbsolutePinAnchor(pin: V3LibraryPin, symbol: Pick<SchematicSymbol, 'position' | 'rotation' | 'mirrorX' | 'mirrorY'>): SchematicPoint {
  const localMm = { x: pin.at.x, y: pin.at.y };
  const mirrored = mirrorPoint(localMm, symbol.mirrorX, symbol.mirrorY);
  const rotated = rotatePoint(mirrored, symbol.rotation);

  return {
    x: symbol.position.x + mmToMicron(rotated.x),
    y: symbol.position.y + mmToMicron(rotated.y),
  };
}

function buildPin(pin: V3LibraryPin, symbol: Pick<SchematicSymbol, 'position' | 'rotation' | 'mirrorX' | 'mirrorY'>): SchematicPin {
  return {
    number: pin.number,
    name: pin.name,
    electricalType: pin.electricalType,
    localPosition: pointMmToMicron({ x: pin.at.x, y: pin.at.y }),
    absoluteAnchor: buildAbsolutePinAnchor(pin, symbol),
    angle: normalizeRotation(pin.at.angle + symbol.rotation),
  };
}

function inferLabelKind(node: SExprNode[]): LabelKind {
  const head = typeof node[0] === 'string' ? node[0] : '';
  if (head === 'global_label') {
    return 'global';
  }
  if (head === 'hierarchical_label') {
    return 'hierarchical';
  }
  return 'local';
}

function extractLabels(root: SExprNode[]): SchematicLabel[] {
  const labelNodes = [
    ...collectNestedForms(root, 'label'),
    ...collectNestedForms(root, 'global_label'),
    ...collectNestedForms(root, 'hierarchical_label'),
  ];

  return labelNodes.flatMap(node => {
    const text = sanitizePlainText(stringAt(node, 1), { maxLength: 120, fallback: '' });
    if (!text) {
      return [];
    }
    const at = parseAtNode(childForms(node, 'at')[0]);
    return [{
      text,
      kind: inferLabelKind(node),
      position: pointMmToMicron({ x: at.x, y: at.y }),
      angle: at.angle,
    }] satisfies SchematicLabel[];
  });
}

function extractNoConnects(root: SExprNode[]): NoConnectMarker[] {
  return childForms(root, 'no_connect').map(node => {
    const at = parseAtNode(childForms(node, 'at')[0]);
    return {
      position: pointMmToMicron({ x: at.x, y: at.y }),
    };
  });
}

function extractSheets(root: SExprNode[]): SchematicSheet[] {
  return childForms(root, 'sheet').map(node => {
    const pins: SchematicSheetPin[] = childForms(node, 'pin').flatMap(pinNode => {
      const name = sanitizePlainText(stringAt(pinNode, 1), { maxLength: 120, fallback: '' });
      if (!name) {
        return [];
      }
      const at = parseAtNode(childForms(pinNode, 'at')[0]);
      return [{
        name,
        position: pointMmToMicron({ x: at.x, y: at.y }),
      }] satisfies SchematicSheetPin[];
    });

    const propertyName = childForms(node, 'property').find(property => stringAt(property, 1) === 'Sheet name');
    const propertyFile = childForms(node, 'property').find(property => stringAt(property, 1) === 'Sheet file');
    const name = sanitizePlainText(stringAt(propertyName, 2), { maxLength: 160, fallback: '' });
    const file = sanitizePlainText(stringAt(propertyFile, 2), { maxLength: 240, fallback: '' });
    const at = parseAtNode(childForms(node, 'at')[0]);
    const sizeNode = childForms(node, 'size')[0];
    const width = toNumber(stringAt(sizeNode, 1, '0'));
    const height = toNumber(stringAt(sizeNode, 2, '0'));

    return {
      name,
      file,
      start: pointMmToMicron({ x: at.x, y: at.y }),
      end: pointMmToMicron({ x: at.x + width, y: at.y + height }),
      pins,
    };
  });
}

function buildSymbolInstances(root: SExprNode[], symbols: Map<string, V3LibrarySymbol>): SchematicSymbol[] {
  const instances = extractSymbolInstances(root);
  const { resolved, unresolved } = collectUnresolvedSymbols(instances, symbols);
  const preservedIds = new Set([
    ...resolved.map(instance => instance.instanceId),
    ...unresolved.map(instance => instance.instanceId),
  ]);

  return instances.flatMap(instance => {
    if (!preservedIds.has(instance.instanceId)) {
      return [];
    }
    const symbol = symbols.get(instance.libId);

    const schematicSymbol: SchematicSymbol = {
      uuid: instance.instanceId,
      libId: instance.libId,
      reference: instance.reference,
      value: instance.value ?? symbol?.symbolName ?? (instance.libId.includes(':') ? instance.libId.split(':').at(-1) ?? instance.libId : instance.libId),
      footprint: instance.footprint,
      position: pointMmToMicron({ x: instance.at.x, y: instance.at.y }),
      rotation: instance.at.rotation,
      mirrorX: instance.at.mirrorX,
      mirrorY: instance.at.mirrorY,
      pins: [],
    };

    return [{
      ...schematicSymbol,
      pins: symbol?.pins.map(pin => buildPin(pin, schematicSymbol)) ?? [],
    }];
  });
}

export function buildSchematicDomainModel(root: SExprNode[]): SchematicDomainModel {
  const symbols = extractLibrarySymbols(root);
  const instances = extractSymbolInstances(root);
  const { unresolved, ignoredNonElectricalSymbols, nonComponentMarkers } = collectUnresolvedSymbols(instances, symbols);

  return {
    symbols: buildSymbolInstances(root, symbols),
    wires: extractWireSegments(root).map(segment => ({
      start: pointMmToMicron(segment.start),
      end: pointMmToMicron(segment.end),
    })),
    junctions: extractJunctionPoints(root).map(pointMmToMicron),
    labels: extractLabels(root),
    noConnects: extractNoConnects(root),
    sheets: extractSheets(root),
    unresolvedSymbols: unresolved,
    ignoredNonElectricalSymbols,
    nonComponentMarkers,
  };
}
