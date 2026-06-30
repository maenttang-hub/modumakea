import type { UnifiedCircuitNet, UnifiedCircuitNetKind } from '@/types';
import type { V3LabelAnchor } from '@/lib/v3-kicad-parser/extractors/label-extractor';
import type { V3LibraryPin, V3LibrarySymbol, V3Point, V3SymbolInstance } from '@/lib/v3-kicad-parser/extractors/symbol-extractor';
import type { V3WireSegment } from '@/lib/v3-kicad-parser/extractors/wire-extractor';

export const V3_POINT_SNAP_TOLERANCE_MM = 0.05;

type PinAnchor = {
  instanceId: string;
  reference: string;
  libId: string;
  pin: V3LibraryPin;
  point: V3Point;
};

type NetAnchor = {
  pointId: string;
  point: V3Point;
};

class UnionFind {
  private parent = new Map<string, string>();

  ensure(key: string) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  find(key: string): string {
    this.ensure(key);
    const parent = this.parent.get(key)!;
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rounded = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (rounded === 90 || rounded === 180 || rounded === 270) {
    return rounded;
  }
  return 0;
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

function roundPoint(point: V3Point): V3Point {
  return {
    x: Number(point.x.toFixed(6)),
    y: Number(point.y.toFixed(6)),
  };
}

function absolutePinConnectionPoint(pin: V3LibraryPin, instance: V3SymbolInstance): V3Point {
  const mirrored = mirrorPoint({ x: pin.at.x, y: pin.at.y }, instance.at.mirrorX, instance.at.mirrorY);
  const rotated = rotatePoint(mirrored, normalizeRotation(instance.at.rotation));
  return roundPoint({
    x: instance.at.x + rotated.x,
    y: instance.at.y + rotated.y,
  });
}

function distanceSquared(left: V3Point, right: V3Point) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function pointLiesOnSegment(point: V3Point, start: V3Point, end: V3Point, toleranceMm = V3_POINT_SNAP_TOLERANCE_MM) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return distanceSquared(point, start) <= toleranceMm * toleranceMm;
  }

  const len = Math.sqrt(lengthSq);
  const cross = (point.y - start.y) * dx - (point.x - start.x) * dy;
  const distance = Math.abs(cross) / len;
  if (distance > toleranceMm) {
    return false;
  }

  const dot = (point.x - start.x) * dx + (point.y - start.y) * dy;
  const proj = dot / len;
  return proj >= -toleranceMm && proj <= len + toleranceMm;
}

function snapBucketIndex(value: number, toleranceMm = V3_POINT_SNAP_TOLERANCE_MM) {
  return Math.floor(value / toleranceMm);
}

function normalizeSupplyLabel(label: string) {
  return label.trim().toUpperCase().replace(/^\+/, '');
}

function isGroundLikeName(label: string) {
  const normalized = normalizeSupplyLabel(label);
  return ['GND', 'AGND', 'DGND', 'PGND', 'GNDPWR', 'GNDREF', 'VSS', 'VSSA'].includes(normalized) || normalized.includes('GNDPWR');
}

function isPowerLikeName(label: string) {
  const normalized = normalizeSupplyLabel(label);
  return (
    ['VCC', 'VDD', 'VDDA', 'AVCC', 'AVDD', 'VIN', 'VBUS', 'VBAT', 'VUSB', '3V3', '3.3V', '5V', '12V', '24V'].includes(normalized) ||
    /^[+-]?\d+(?:\.\d+)?V$/.test(label.trim().toUpperCase())
  );
}

function inferNetKind(labels: string[], members: UnifiedCircuitNet['members']): UnifiedCircuitNetKind {
  const normalizedLabels = labels.map(normalizeSupplyLabel);
  const hasGroundLabel = normalizedLabels.some(isGroundLikeName);
  const hasPowerLabel = normalizedLabels.some(isPowerLikeName);

  if (hasGroundLabel && hasPowerLabel) {
    return 'unknown';
  }
  if (hasGroundLabel) {
    return 'ground';
  }
  if (hasPowerLabel) {
    return 'power';
  }
  if (normalizedLabels.some(label => label.includes('SDA') || label.includes('SCL') || label.includes('MISO') || label.includes('MOSI') || label.includes('SCK'))) {
    return 'bus';
  }
  if (normalizedLabels.some(label => label.includes('CLK') || label.includes('XTAL'))) {
    return 'clock';
  }
  if (normalizedLabels.some(label => /^A\d+$/.test(label))) {
    return 'analog';
  }

  const pinNames = members.map(member => normalizeSupplyLabel(member.pinName));
  const hasPowerPin = pinNames.some(isPowerLikeName);
  const hasGroundPin = pinNames.some(isGroundLikeName);
  if (hasPowerPin && hasGroundPin) {
    return 'unknown';
  }
  if (hasPowerPin) {
    return 'power';
  }
  if (hasGroundPin) {
    return 'ground';
  }

  return 'signal';
}

function inferPinDirection(electricalType: string): 'input' | 'output' | 'bidirectional' | 'power_in' | 'power_out' | 'ground' | 'passive' | 'unknown' {
  const normalized = electricalType.trim().toLowerCase();
  if (normalized === 'input') return 'input';
  if (normalized === 'output') return 'output';
  if (normalized === 'bidirectional') return 'bidirectional';
  if (normalized === 'power_in') return 'power_in';
  if (normalized === 'power_out') return 'power_out';
  if (normalized === 'passive') return 'passive';
  return 'unknown';
}

export function buildPinAnchors(instances: V3SymbolInstance[], symbols: Map<string, V3LibrarySymbol>) {
  const anchors: PinAnchor[] = [];

  for (const instance of instances) {
    const symbol = symbols.get(instance.libId);
    if (!symbol) {
      continue;
    }

    for (const pin of symbol.pins) {
      anchors.push({
        instanceId: instance.instanceId,
        reference: instance.reference,
        libId: instance.libId,
        pin,
        point: absolutePinConnectionPoint(pin, instance),
      });
    }
  }

  return anchors;
}

export function resolveSchematicNets(params: {
  instances: V3SymbolInstance[];
  symbols: Map<string, V3LibrarySymbol>;
  wireSegments: V3WireSegment[];
  junctionPoints: V3Point[];
  labels: V3LabelAnchor[];
}) {
  const pinAnchors = buildPinAnchors(params.instances, params.symbols);
  const unionFind = new UnionFind();
  const canonicalPoints = new Map<string, V3Point>();
  const bucketMap = new Map<string, string[]>();
  let pointIdCounter = 0;

  const registerPoint = (point: V3Point) => {
    const ix = snapBucketIndex(point.x);
    const iy = snapBucketIndex(point.y);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucketKey = `${ix + dx}:${iy + dy}`;
        const candidateIds = bucketMap.get(bucketKey) ?? [];
        for (const candidateId of candidateIds) {
          const candidatePoint = canonicalPoints.get(candidateId);
          if (candidatePoint && distanceSquared(candidatePoint, point) <= V3_POINT_SNAP_TOLERANCE_MM * V3_POINT_SNAP_TOLERANCE_MM) {
            return candidateId;
          }
        }
      }
    }

    const pointId = `pt-${++pointIdCounter}`;
    canonicalPoints.set(pointId, roundPoint(point));
    unionFind.ensure(pointId);
    const ownBucketKey = `${ix}:${iy}`;
    const ownBucket = bucketMap.get(ownBucketKey) ?? [];
    ownBucket.push(pointId);
    bucketMap.set(ownBucketKey, ownBucket);
    return pointId;
  };

  const wireEndpointIds = params.wireSegments.map(segment => ({
    startId: registerPoint(segment.start),
    endId: registerPoint(segment.end),
    start: segment.start,
    end: segment.end,
  }));
  const junctionIds = params.junctionPoints.map(point => registerPoint(point));
  const labelIds = params.labels.map(label => ({ ...label, pointId: registerPoint(label.point) }));
  const pinIds = pinAnchors.map(anchor => ({ ...anchor, pointId: registerPoint(anchor.point) }));

  for (const wire of wireEndpointIds) {
    unionFind.union(wire.startId, wire.endId);
  }

  for (const pointId of junctionIds) {
    unionFind.ensure(pointId);
  }

  const canonicalEntries: NetAnchor[] = [...canonicalPoints.entries()].map(([pointId, point]) => ({ pointId, point }));
  for (const wire of wireEndpointIds) {
    for (const candidate of canonicalEntries) {
      if (pointLiesOnSegment(candidate.point, wire.start, wire.end)) {
        unionFind.union(candidate.pointId, wire.startId);
      }
    }
  }

  const pointGroupMembers = new Map<string, UnifiedCircuitNet['members']>();
  const pointGroupLabels = new Map<string, string[]>();

  for (const pin of pinIds) {
    const root = unionFind.find(pin.pointId);
    const members = pointGroupMembers.get(root) ?? [];
    members.push({
      memberType: 'component_pin',
      instanceId: pin.instanceId,
      reference: pin.reference,
      libId: pin.libId,
      pinNumber: pin.pin.number,
      pinName: pin.pin.name,
      electricalType: pin.pin.electricalType,
    });
    pointGroupMembers.set(root, members);
  }

  for (const label of labelIds) {
    const root = unionFind.find(label.pointId);
    const labels = pointGroupLabels.get(root) ?? [];
    if (!labels.includes(label.name)) {
      labels.push(label.name);
    }
    pointGroupLabels.set(root, labels);
  }

  const rootToNetId = new Map<string, string>();
  const nets: UnifiedCircuitNet[] = [];
  let netCounter = 0;

  for (const [root, members] of pointGroupMembers.entries()) {
    const aliases = pointGroupLabels.get(root) ?? [];
    const primaryLabel = aliases[0];
    const netId = `net-${++netCounter}`;
    rootToNetId.set(root, netId);
    nets.push({
      netId,
      primaryLabel,
      aliases,
      kind: inferNetKind(aliases, members),
      members,
    });
  }

  return {
    pinAnchors: pinIds.map(pin => ({
      instanceId: pin.instanceId,
      pinNumber: pin.pin.number,
      pinName: pin.pin.name,
      electricalType: pin.pin.electricalType,
      direction: inferPinDirection(pin.pin.electricalType),
      root: unionFind.find(pin.pointId),
    })),
    nets,
    rootToNetId,
  };
}
