import type { UnifiedCircuitNetKind, UnifiedCircuitNetMember } from '@/types';
import { pointNearSegment } from '@/lib/v3-kicad-parser/geometry/collision';
import type { Segment } from '@/lib/v3-kicad-parser/geometry/primitives';
import type { SchematicDomainModel, SchematicPoint } from '@/types/schematic-domain';

export interface ConnectedPinRef extends UnifiedCircuitNetMember {
  readonly symbolUuid: string;
}

export interface LogicalNet {
  readonly netId: string;
  readonly primaryLabel?: string;
  readonly aliases: string[];
  readonly kind: UnifiedCircuitNetKind;
  readonly members: ConnectedPinRef[];
}

class UnionFind {
  private readonly parent = new Map<string, string>();

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

function distanceSquared(left: SchematicPoint, right: SchematicPoint) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function snapBucketIndex(value: number, toleranceMicrons: number) {
  return Math.floor(value / toleranceMicrons);
}

function normalizeSupplyLabel(label: string) {
  return label.trim().toUpperCase().replace(/^\+/, '');
}

function isGroundLikeName(label: string) {
  const normalized = normalizeSupplyLabel(label);
  return (
    ['GND', 'AGND', 'DGND', 'PGND', 'GNDPWR', 'GNDREF', 'VSS', 'VSSA'].includes(normalized) ||
    normalized.includes('GNDPWR')
  );
}

function isPowerLikeName(label: string) {
  const normalized = normalizeSupplyLabel(label);
  return (
    [
      'VCC',
      'VDD',
      'VDDA',
      'AVCC',
      'AVDD',
      'VIN',
      'VAA',
      'VPP',
      'VBUS',
      'VDC',
      'VBAT',
      'VUSB',
      'VDRIVE',
      'BATT',
      'VREF',
      'VREF+',
      'VREF-',
      'VREFH',
      'VREFL',
      '3V3',
      '3.3V',
      '5V',
      '12V',
      '24V',
    ].includes(normalized) ||
    /^[+-]?\d+(?:\.\d+)?V$/.test(label.trim().toUpperCase())
  );
}

function expandPowerAliases(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return [];
  }

  const aliases = [trimmed];
  const canonical = normalizeSupplyLabel(trimmed);
  if (canonical && canonical !== trimmed.toUpperCase()) {
    aliases.push(canonical);
  }
  return aliases;
}

function inferNetKind(labels: string[], members: ConnectedPinRef[]): UnifiedCircuitNetKind {
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

function inferPowerAliasesFromMembers(
  members: ConnectedPinRef[],
  symbolValueByUuid: ReadonlyMap<string, string>
) {
  const aliases: string[] = [];

  for (const member of members) {
    if (!member.reference.startsWith('#PWR')) {
      continue;
    }

    const aliasCandidates = [member.pinName.trim(), symbolValueByUuid.get(member.symbolUuid)?.trim() ?? ''];
    for (const candidate of aliasCandidates) {
      if (!candidate) {
        continue;
      }
      if (!isGroundLikeName(candidate) && !isPowerLikeName(candidate)) {
        continue;
      }
      for (const alias of expandPowerAliases(candidate)) {
        if (!aliases.includes(alias)) {
          aliases.push(alias);
        }
      }
    }
  }

  return aliases;
}

export class SchematicConnectivitySolver {
  public static resolveNets(
    model: SchematicDomainModel,
    options?: { toleranceMicrons?: number }
  ): LogicalNet[] {
    const toleranceMicrons = options?.toleranceMicrons ?? 50;
    const unionFind = new UnionFind();
    const canonicalPoints = new Map<string, SchematicPoint>();
    const bucketMap = new Map<string, string[]>();
    const symbolValueByUuid = new Map(model.symbols.map(symbol => [symbol.uuid, symbol.value]));
    let pointIdCounter = 0;

    const registerPoint = (point: SchematicPoint) => {
      const ix = snapBucketIndex(point.x, toleranceMicrons);
      const iy = snapBucketIndex(point.y, toleranceMicrons);

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucketKey = `${ix + dx}:${iy + dy}`;
          const candidateIds = bucketMap.get(bucketKey) ?? [];
          for (const candidateId of candidateIds) {
            const candidatePoint = canonicalPoints.get(candidateId);
            if (candidatePoint && distanceSquared(candidatePoint, point) <= toleranceMicrons * toleranceMicrons) {
              return candidateId;
            }
          }
        }
      }

      const pointId = `pt-${++pointIdCounter}`;
      canonicalPoints.set(pointId, point);
      unionFind.ensure(pointId);
      const ownBucketKey = `${ix}:${iy}`;
      const ownBucket = bucketMap.get(ownBucketKey) ?? [];
      ownBucket.push(pointId);
      bucketMap.set(ownBucketKey, ownBucket);
      return pointId;
    };

    const wireEndpointIds = model.wires.map(wire => ({
      startId: registerPoint(wire.start),
      endId: registerPoint(wire.end),
      segment: {
        kind: 'segment',
        start: wire.start,
        end: wire.end,
      } satisfies Segment,
    }));
    const junctionIds = model.junctions.map(point => registerPoint(point));
    const labelIds = model.labels.map(label => ({ ...label, pointId: registerPoint(label.position) }));
    const pinIds = model.symbols.flatMap(symbol =>
      symbol.pins.map(pin => ({
        symbolUuid: symbol.uuid,
        instanceId: symbol.uuid,
        reference: symbol.reference,
        libId: symbol.libId,
        pinNumber: pin.number,
        pinName: pin.name,
        electricalType: pin.electricalType,
        pointId: registerPoint(pin.absoluteAnchor),
        point: pin.absoluteAnchor,
      }))
    );

    for (const wire of wireEndpointIds) {
      unionFind.union(wire.startId, wire.endId);
    }

    for (const junctionId of junctionIds) {
      for (const wire of wireEndpointIds) {
        if (pointNearSegment(canonicalPoints.get(junctionId)!, wire.segment, toleranceMicrons)) {
          unionFind.union(junctionId, wire.startId);
          unionFind.union(junctionId, wire.endId);
        }
      }
    }

    for (const label of labelIds) {
      for (const wire of wireEndpointIds) {
        if (pointNearSegment(label.position, wire.segment, toleranceMicrons)) {
          unionFind.union(label.pointId, wire.startId);
        }
      }
    }

    const firstPointIdByLabel = new Map<string, string>();
    for (const label of labelIds) {
      const normalized = label.text.trim();
      if (!normalized) {
        continue;
      }
      const existing = firstPointIdByLabel.get(normalized);
      if (existing) {
        unionFind.union(existing, label.pointId);
      } else {
        firstPointIdByLabel.set(normalized, label.pointId);
      }
    }

    for (const pin of pinIds) {
      for (const wire of wireEndpointIds) {
        if (pointNearSegment(pin.point, wire.segment, toleranceMicrons)) {
          unionFind.union(pin.pointId, wire.startId);
        }
      }
    }

    const groupedLabels = new Map<string, string[]>();
    const groupedPins = new Map<string, ConnectedPinRef[]>();

    for (const label of labelIds) {
      const root = unionFind.find(label.pointId);
      const bucket = groupedLabels.get(root) ?? [];
      if (!bucket.includes(label.text)) {
        bucket.push(label.text);
      }
      groupedLabels.set(root, bucket);
    }

    for (const pin of pinIds) {
      const root = unionFind.find(pin.pointId);
      const bucket = groupedPins.get(root) ?? [];
      bucket.push({
        memberType: 'component_pin',
        symbolUuid: pin.symbolUuid,
        instanceId: pin.instanceId,
        reference: pin.reference,
        libId: pin.libId,
        pinNumber: pin.pinNumber,
        pinName: pin.pinName,
        electricalType: pin.electricalType,
      });
      groupedPins.set(root, bucket);
    }

    return Array.from(groupedPins.entries()).map(([root, members], index) => {
      const explicitAliases = groupedLabels.get(root) ?? [];
      const aliases = explicitAliases.length > 0 ? explicitAliases : inferPowerAliasesFromMembers(members, symbolValueByUuid);
      return {
        netId: `net-${index + 1}`,
        primaryLabel: aliases[0],
        aliases,
        kind: inferNetKind(aliases, members),
        members,
      };
    });
  }

  public static findPinsOnNet(nets: LogicalNet[], netId: string): ConnectedPinRef[] {
    return nets.find(net => net.netId === netId)?.members ?? [];
  }

  public static findNetByLabel(nets: LogicalNet[], label: string): LogicalNet | null {
    return nets.find(net => net.aliases.includes(label) || net.primaryLabel === label) ?? null;
  }
}
