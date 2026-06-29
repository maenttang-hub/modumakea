import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import type { ImportedSchematicPoint, ManualNetConnection, PlacedComponent } from '@/types';

type StructuredPoint = { x: number; y: number };

export type StructuredNetKind = 'signal' | 'power' | 'ground';
export type StructuredSectionKey = 'power' | 'microcontroller' | 'sensor' | 'control' | 'support';
export type StructuredSectionLayoutKind = 'vertical' | 'microcontroller' | 'grid';

export type StructuredConnectionPath = {
  id: string;
  label?: string;
  points: StructuredPoint[];
  labelPoint?: StructuredPoint;
  sourceComponentId: string;
  targetComponentId: string;
  netKind: StructuredNetKind;
};

export type StructuredGuideRail = {
  id: string;
  kind: 'power-rail' | 'ground-rail' | 'signal-rail';
  label: string;
  points: StructuredPoint[];
  netKind: StructuredNetKind;
};

export type StructuredSectionPlacement = {
  id: StructuredSectionKey;
  title: string;
  layoutKind: StructuredSectionLayoutKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StructuredLayout = {
  connections: StructuredConnectionPath[];
  rails: StructuredGuideRail[];
  sections: StructuredSectionPlacement[];
  componentOffsets: Record<string, StructuredPoint>;
};

export type StructuredViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StructuredAnchor = {
  point: StructuredPoint;
  angle: 0 | 90 | 180 | 270;
};

type EndpointAnchor = {
  point: StructuredPoint;
  angle: 0 | 90 | 180 | 270;
  ownerType: 'component' | 'board';
  ownerId: string;
  pinId: string;
};

type ComponentRect = {
  instanceId: string;
  section: StructuredSectionKey;
  x: number;
  y: number;
  width: number;
  height: number;
};

function isGroundName(value?: string) {
  if (!value) {
    return false;
  }
  return ['GND', 'GNDPWR', 'PGND', 'DGND', 'AGND', 'VSS'].includes(value.trim().toUpperCase());
}

export function isPowerName(value?: string) {
  if (!value) {
    return false;
  }
  return /^\+?(3V3|3\.3V|5V|12V|24V|VBUS|VBAT|VIN|VCC|VSYS)$/.test(value.trim().toUpperCase());
}

function classifyNetKind(connection: ManualNetConnection) {
  const pins = [connection.suggestedNetName, connection.source.pinId, connection.target.pinId];
  if (pins.some(isGroundName)) {
    return 'ground' as const;
  }
  if (pins.some(isPowerName)) {
    return 'power' as const;
  }
  return 'signal' as const;
}

export function offsetPoint(
  point: StructuredPoint,
  angle: 0 | 90 | 180 | 270,
  distance: number
): StructuredPoint {
  switch (angle) {
    case 90:
      return { x: point.x, y: point.y - distance };
    case 180:
      return { x: point.x + distance, y: point.y };
    case 270:
      return { x: point.x, y: point.y + distance };
    default:
      return { x: point.x - distance, y: point.y };
  }
}

function collapsePath(points: StructuredPoint[]) {
  return points.filter((point, index, all) => {
    if (index === 0) {
      return true;
    }
    const previous = all[index - 1];
    return previous.x !== point.x || previous.y !== point.y;
  });
}

function sectionTitle(key: StructuredSectionKey) {
  switch (key) {
    case 'power':
      return 'POWER';
    case 'microcontroller':
      return 'MICROCONTROLLER';
    case 'sensor':
      return 'SENSOR';
    case 'control':
      return 'BOOT / RESET';
    default:
      return 'SUPPORT';
  }
}

function classifyComponentSection(component: PlacedComponent): StructuredSectionKey {
  const text = `${component.name} ${component.value ?? ''} ${component.importedReference ?? ''}`.toUpperCase();
  if (/(GND|GNDPWR|PWR|VCC|VDD|3V3|3\.3V|5V|USB|VBUS|VIN|BAT|BOOST|BUCK|LDO|CHARG|REG)/.test(text)) {
    return 'power';
  }
  if (/(ESP|STM|ATMEGA|RP2040|MCU|CPU|WROOM)/.test(text)) {
    return 'microcontroller';
  }
  if (/(SHT|BME|BMP|MPU|SENSOR|HUMID|TEMP)/.test(text)) {
    return 'sensor';
  }
  if (/(BOOT|RESET|SW|BUTTON|PUSH)/.test(text)) {
    return 'control';
  }
  return 'support';
}

function buildComponentRects(components: PlacedComponent[], sceneOrigin: StructuredPoint) {
  const rects: ComponentRect[] = [];

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }
    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });
    rects.push({
      instanceId: component.instanceId,
      section: classifyComponentSection(component),
      x: sceneOrigin.x + component.position.x,
      y: sceneOrigin.y + component.position.y,
      width: layout.width,
      height: layout.height,
    });
  }

  return rects;
}

function sortRectsTopLeft(rects: ComponentRect[]) {
  return [...rects].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function layoutVerticalStack(
  rects: ComponentRect[],
  target: StructuredPoint,
  padX: number,
  padTop: number,
  gapY: number
) {
  const offsets: Record<string, StructuredPoint> = {};
  let cursorY = target.y + padTop;
  let maxWidth = 0;

  for (const rect of sortRectsTopLeft(rects)) {
    offsets[rect.instanceId] = {
      x: target.x + padX - rect.x,
      y: cursorY - rect.y,
    };
    cursorY += rect.height + gapY;
    maxWidth = Math.max(maxWidth, rect.width);
  }

  return {
    offsets,
    width: maxWidth + padX * 2,
    height: cursorY - target.y - gapY + 18,
  };
}

function layoutGridBlock(
  rects: ComponentRect[],
  target: StructuredPoint,
  contentWidth: number,
  padX: number,
  padTop: number,
  gapX: number,
  gapY: number
) {
  const offsets: Record<string, StructuredPoint> = {};
  let cursorX = target.x + padX;
  let cursorY = target.y + padTop;
  let rowHeight = 0;
  let usedWidth = 0;

  for (const rect of sortRectsTopLeft(rects)) {
    if (cursorX > target.x + padX && cursorX + rect.width > target.x + contentWidth) {
      cursorX = target.x + padX;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    }
    offsets[rect.instanceId] = {
      x: cursorX - rect.x,
      y: cursorY - rect.y,
    };
    usedWidth = Math.max(usedWidth, cursorX - target.x + rect.width);
    cursorX += rect.width + gapX;
    rowHeight = Math.max(rowHeight, rect.height);
  }

  return {
    offsets,
    width: Math.max(usedWidth + padX, 120),
    height: cursorY - target.y + rowHeight + 18,
  };
}

function layoutMicrocontrollerBlock(
  rects: ComponentRect[],
  target: StructuredPoint
) {
  const offsets: Record<string, StructuredPoint> = {};
  const sorted = [...rects].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const core = sorted[0];
  const peripherals = sorted.slice(1);
  const coreX = target.x + 132;
  const coreY = target.y + 48;

  offsets[core.instanceId] = {
    x: coreX - core.x,
    y: coreY - core.y,
  };

  const leftSide = peripherals
    .filter(rect => rect.x + rect.width / 2 < core.x + core.width / 2)
    .sort((a, b) => a.y - b.y);
  const rightSide = peripherals
    .filter(rect => rect.x + rect.width / 2 >= core.x + core.width / 2)
    .sort((a, b) => a.y - b.y);

  let leftY = target.y + 24;
  for (const rect of leftSide) {
    offsets[rect.instanceId] = {
      x: target.x + 18 - rect.x,
      y: leftY - rect.y,
    };
    leftY += rect.height + 22;
  }

  let rightY = target.y + 24;
  for (const rect of rightSide) {
    offsets[rect.instanceId] = {
      x: target.x + 312 - rect.x,
      y: rightY - rect.y,
    };
    rightY += rect.height + 22;
  }

  const blockHeight = Math.max(core.height + 80, leftY - target.y + 12, rightY - target.y + 12);
  return {
    offsets,
    width: 448,
    height: blockHeight,
  };
}

function computeSectionPlacements(rects: ComponentRect[], sceneOrigin: StructuredPoint) {
  const groups = new Map<StructuredSectionKey, ComponentRect[]>();
  for (const rect of rects) {
    const list = groups.get(rect.section) ?? [];
    list.push(rect);
    groups.set(rect.section, list);
  }

  const minY = rects.length > 0 ? Math.min(...rects.map(rect => rect.y)) : sceneOrigin.y + 40;
  const verticalBias = 34;
  const leftX = sceneOrigin.x + 42;
  const centerX = sceneOrigin.x + 294;
  const rightX = sceneOrigin.x + 800;

  const sectionTargets: Record<StructuredSectionKey, { x: number; y: number }> = {
    power: { x: leftX, y: minY + 40 + verticalBias },
    microcontroller: { x: centerX, y: minY + 34 + verticalBias },
    sensor: { x: rightX, y: minY + 34 + verticalBias },
    control: { x: rightX, y: minY + 210 + verticalBias },
    support: { x: rightX, y: minY + 250 + verticalBias },
  };

  const componentOffsets: Record<string, StructuredPoint> = {};
  const sections: StructuredSectionPlacement[] = [];
  const sectionWidths: Record<StructuredSectionKey, number> = {
    power: 212,
    microcontroller: 428,
    sensor: 186,
    control: 186,
    support: 328,
  };

  for (const key of ['power', 'microcontroller', 'sensor', 'control', 'support'] as const) {
    const list = groups.get(key) ?? [];
    if (list.length === 0) {
      continue;
    }

    const target = sectionTargets[key];
    const layoutResult =
      key === 'power'
        ? layoutGridBlock(list, target, sectionWidths[key], 18, 28, 18, 18)
        : key === 'microcontroller'
          ? layoutMicrocontrollerBlock(list, target)
          : key === 'sensor'
            ? layoutVerticalStack(list, target, 18, 28, 22)
            : key === 'control'
              ? layoutGridBlock(list, target, sectionWidths[key], 18, 28, 20, 20)
              : layoutGridBlock(list, target, sectionWidths[key], 18, 28, 22, 20);

    Object.assign(componentOffsets, layoutResult.offsets);

    sections.push({
      id: key,
      title: sectionTitle(key),
      layoutKind:
        key === 'power' || key === 'sensor'
          ? 'vertical'
          : key === 'microcontroller'
            ? 'microcontroller'
            : 'grid',
      x: target.x - 18,
      y: target.y - 24,
      width:
        key === 'microcontroller'
          ? Math.max(layoutResult.width + 44, sectionWidths[key])
          : Math.max(layoutResult.width + 30, sectionWidths[key]),
      height: Math.max(layoutResult.height + 18, 104),
    });
  }

  return { componentOffsets, sections };
}

function buildAnchorMap(components: PlacedComponent[], sceneOrigin: StructuredPoint, offsets: Record<string, StructuredPoint>) {
  const anchors = new Map<string, StructuredAnchor>();

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }

    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });
    const offset = offsets[component.instanceId] ?? { x: 0, y: 0 };

    for (const anchor of layout.pinAnchors) {
      anchors.set(`${component.instanceId}:${anchor.pinId}`, {
        point: {
          x: sceneOrigin.x + component.position.x + anchor.at.x + offset.x,
          y: sceneOrigin.y + component.position.y + anchor.at.y + offset.y,
        },
        angle: anchor.angle,
      });
    }
  }

  return anchors;
}

function buildStructuredSignalPath(start: EndpointAnchor, end: EndpointAnchor) {
  const stemDistance = 14;
  const startOuter = offsetPoint(start.point, start.angle, stemDistance);
  const endOuter = offsetPoint(end.point, end.angle, stemDistance);
  const horizontalGap = Math.abs(startOuter.x - endOuter.x);
  const verticalGap = Math.abs(startOuter.y - endOuter.y);

  if (horizontalGap < 8 || verticalGap < 8) {
    return collapsePath([start.point, startOuter, endOuter, end.point]);
  }

  const midX = startOuter.x + (endOuter.x - startOuter.x) / 2;
  return collapsePath([
    start.point,
    startOuter,
    { x: midX, y: startOuter.y },
    { x: midX, y: endOuter.y },
    endOuter,
    end.point,
  ]);
}

function buildStructuredBusPath(start: EndpointAnchor, end: EndpointAnchor, busX: number) {
  const stemDistance = 14;
  const startOuter = offsetPoint(start.point, start.angle, stemDistance);
  const endOuter = offsetPoint(end.point, end.angle, stemDistance);
  return collapsePath([
    start.point,
    startOuter,
    { x: busX, y: startOuter.y },
    { x: busX, y: endOuter.y },
    endOuter,
    end.point,
  ]);
}

function buildStructuredSignalLabelPoint(points: StructuredPoint[]) {
  if (points.length === 0) {
    return undefined;
  }

  const longestSegment = points.slice(1).reduce<{
    length: number;
    start: StructuredPoint;
    end: StructuredPoint;
    axis: 'horizontal' | 'vertical';
  } | null>((best, point, index) => {
    const previous = points[index];
    if (!previous) {
      return best;
    }

    const horizontal = previous.y === point.y;
    const vertical = previous.x === point.x;
    if (!horizontal && !vertical) {
      return best;
    }

    const length = horizontal
      ? Math.abs(point.x - previous.x)
      : Math.abs(point.y - previous.y);

    if (!best || length > best.length) {
      return {
        length,
        start: previous,
        end: point,
        axis: horizontal ? 'horizontal' : 'vertical',
      };
    }

    return best;
  }, null);

  if (!longestSegment) {
    return points[Math.floor(points.length / 2)];
  }

  if (longestSegment.axis === 'horizontal') {
    return {
      x: (longestSegment.start.x + longestSegment.end.x) / 2,
      y: longestSegment.start.y - 14,
    };
  }

  return {
    x: longestSegment.start.x + 22,
    y: (longestSegment.start.y + longestSegment.end.y) / 2,
  };
}

function buildStructuredBusLabelPoint(
  start: EndpointAnchor,
  end: EndpointAnchor,
  busX: number,
  laneIndex: number
) {
  const upperY = Math.min(start.point.y, end.point.y);
  const lowerY = Math.max(start.point.y, end.point.y);
  const baseY = upperY + (lowerY - upperY) / 2;
  const sideOffset = laneIndex % 2 === 0 ? 24 : -24;
  return {
    x: busX + sideOffset,
    y: baseY - 14 - Math.floor(laneIndex / 2) * 10,
  };
}

function buildStructuredRailPath(anchor: EndpointAnchor, railPoint: StructuredPoint, railOrientation: 'horizontal' | 'vertical') {
  const outer = offsetPoint(anchor.point, anchor.angle, 12);
  if (railOrientation === 'vertical') {
    return collapsePath([anchor.point, outer, { x: railPoint.x, y: outer.y }, railPoint]);
  }
  return collapsePath([anchor.point, outer, { x: outer.x, y: railPoint.y }, railPoint]);
}

function railLabelFor(kind: StructuredNetKind, netName?: string) {
  if (netName?.trim()) {
    return netName.trim();
  }
  return kind === 'ground' ? 'GND' : kind === 'power' ? '+V' : 'NET';
}

function findSectionForComponent(componentId: string, rects: ComponentRect[]) {
  return rects.find(rect => rect.instanceId === componentId)?.section ?? 'support';
}

function buildLegacyAnchorMap(components: PlacedComponent[], sceneOrigin: StructuredPoint) {
  const anchors = new Map<string, StructuredAnchor>();
  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }
    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });
    for (const anchor of layout.pinAnchors) {
      anchors.set(`${component.instanceId}:${anchor.pinId}`, {
        point: {
          x: sceneOrigin.x + component.position.x + anchor.at.x,
          y: sceneOrigin.y + component.position.y + anchor.at.y,
        },
        angle: anchor.angle,
      });
    }
  }
  return anchors;
}

export function buildImportedStructuredLayout(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[],
  sceneOrigin: ImportedSchematicPoint = { x: 0, y: 0 }
): StructuredLayout {
  const rects = buildComponentRects(components, sceneOrigin);
  const { componentOffsets, sections } = computeSectionPlacements(rects, sceneOrigin);
  const anchors = buildAnchorMap(components, sceneOrigin, componentOffsets);
  const rails: StructuredGuideRail[] = [];
  const connections: StructuredConnectionPath[] = [];

  const allSectionRight = Math.max(...sections.map(section => section.x + section.width), sceneOrigin.x + 760);
  const allSectionBottom = Math.max(...sections.map(section => section.y + section.height), sceneOrigin.y + 520);
  const powerRailX = sceneOrigin.x + 28;
  const signalRailX = allSectionRight + 36;
  const groundRailY = allSectionBottom + 24;
  const sectionMap = new Map(sections.map(section => [section.id, section]));
  const signalLaneCountByPair = new Map<string, number>();

  rails.push({
    id: 'rail-power',
    kind: 'power-rail',
    label: '+V',
    netKind: 'power',
    points: [
      { x: powerRailX, y: sceneOrigin.y + 40 },
      { x: powerRailX, y: allSectionBottom - 20 },
    ],
  });
  rails.push({
    id: 'rail-ground',
    kind: 'ground-rail',
    label: 'GND',
    netKind: 'ground',
    points: [
      { x: sceneOrigin.x + 42, y: groundRailY },
      { x: allSectionRight - 20, y: groundRailY },
    ],
  });
  rails.push({
    id: 'rail-signal',
    kind: 'signal-rail',
    label: 'NET',
    netKind: 'signal',
    points: [
      { x: signalRailX, y: sceneOrigin.y + 46 },
      { x: signalRailX, y: allSectionBottom - 16 },
    ],
  });

  for (const connection of manualConnections) {
    const netKind = classifyNetKind(connection);
    const source = connection.source.ownerType === 'component' ? anchors.get(`${connection.source.ownerId}:${connection.source.pinId}`) : null;
    const target = connection.target.ownerType === 'component' ? anchors.get(`${connection.target.ownerId}:${connection.target.pinId}`) : null;

    const sourceAnchor: EndpointAnchor | null = source
      ? { point: source.point, angle: source.angle, ownerType: 'component', ownerId: connection.source.ownerId, pinId: connection.source.pinId }
      : connection.source.ownerType === 'board'
        ? {
            point: netKind === 'ground'
              ? { x: sceneOrigin.x + 80, y: groundRailY }
              : netKind === 'power'
                ? { x: powerRailX, y: sceneOrigin.y + 96 }
                : { x: signalRailX, y: sceneOrigin.y + 82 },
            angle: netKind === 'ground' ? 270 : netKind === 'power' ? 180 : 0,
            ownerType: 'board',
            ownerId: connection.source.ownerId,
            pinId: connection.source.pinId,
          }
        : null;

    const targetAnchor: EndpointAnchor | null = target
      ? { point: target.point, angle: target.angle, ownerType: 'component', ownerId: connection.target.ownerId, pinId: connection.target.pinId }
      : connection.target.ownerType === 'board'
        ? {
            point: netKind === 'ground'
              ? { x: allSectionRight - 80, y: groundRailY }
              : netKind === 'power'
                ? { x: powerRailX, y: sceneOrigin.y + 156 }
                : { x: signalRailX, y: sceneOrigin.y + 142 },
            angle: netKind === 'ground' ? 270 : netKind === 'power' ? 180 : 0,
            ownerType: 'board',
            ownerId: connection.target.ownerId,
            pinId: connection.target.pinId,
          }
        : null;

    if (!sourceAnchor || !targetAnchor) {
      continue;
    }

    if (netKind === 'power') {
      const componentAnchor = sourceAnchor.ownerType === 'component' ? sourceAnchor : targetAnchor;
      connections.push({
        id: connection.id,
        label: railLabelFor(netKind, connection.suggestedNetName ?? connection.source.pinId),
        points: buildStructuredRailPath(componentAnchor, { x: powerRailX, y: componentAnchor.point.y }, 'vertical'),
        sourceComponentId: sourceAnchor.ownerId,
        targetComponentId: targetAnchor.ownerId,
        netKind,
      });
      continue;
    }

    if (netKind === 'ground') {
      const componentAnchor = sourceAnchor.ownerType === 'component' ? sourceAnchor : targetAnchor;
      connections.push({
        id: connection.id,
        label: railLabelFor(netKind, connection.suggestedNetName ?? connection.source.pinId),
        points: buildStructuredRailPath(componentAnchor, { x: componentAnchor.point.x, y: groundRailY }, 'horizontal'),
        sourceComponentId: sourceAnchor.ownerId,
        targetComponentId: targetAnchor.ownerId,
        netKind,
      });
      continue;
    }

    const sourceSection = findSectionForComponent(connection.source.ownerId, rects);
    const targetSection = findSectionForComponent(connection.target.ownerId, rects);
    const crossingSections = sourceSection !== targetSection;
    const laneKey = [sourceSection, targetSection].sort().join(':');
    const laneIndex = signalLaneCountByPair.get(laneKey) ?? 0;
    signalLaneCountByPair.set(laneKey, laneIndex + 1);
    const baseBusX = crossingSections
      ? (((sectionMap.get(sourceSection)?.x ?? signalRailX) + (sectionMap.get(sourceSection)?.width ?? 0) + (sectionMap.get(targetSection)?.x ?? signalRailX)) / 2)
      : signalRailX;
    const busX = crossingSections
      ? baseBusX + (laneIndex % 2 === 0 ? 1 : -1) * (14 + Math.floor(laneIndex / 2) * 16)
      : signalRailX;
    const points = crossingSections
      ? buildStructuredBusPath(sourceAnchor, targetAnchor, busX)
      : buildStructuredSignalPath(sourceAnchor, targetAnchor);

    connections.push({
      id: connection.id,
      label: connection.suggestedNetName,
      points,
      labelPoint: connection.suggestedNetName
        ? crossingSections
          ? buildStructuredBusLabelPoint(sourceAnchor, targetAnchor, busX, laneIndex)
          : buildStructuredSignalLabelPoint(points)
        : undefined,
      sourceComponentId: connection.source.ownerId,
      targetComponentId: connection.target.ownerId,
      netKind,
    });
  }

  return { connections, rails, sections, componentOffsets };
}

export function getImportedStructuredViewportBounds(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[],
  sceneOrigin: ImportedSchematicPoint = { x: 0, y: 0 }
): StructuredViewportBounds | null {
  const layout = buildImportedStructuredLayout(components, manualConnections, sceneOrigin);
  const points: StructuredPoint[] = [];

  layout.sections.forEach(section => {
    points.push({ x: section.x, y: section.y });
    points.push({ x: section.x + section.width, y: section.y + section.height });
  });
  layout.rails.forEach(rail => {
    points.push(...rail.points);
  });
  layout.connections.forEach(connection => {
    points.push(...connection.points);
    if (connection.labelPoint) {
      points.push(connection.labelPoint);
    }
  });
  components.forEach(component => {
    if (!component.importedGeometry) {
      return;
    }

    const geometryLayout = layoutImportedGeometry(
      component.importedGeometry,
      component.rotation,
      undefined,
      { preserveStoredBounds: true }
    );
    const offset = layout.componentOffsets[component.instanceId] ?? { x: 0, y: 0 };
    const x = sceneOrigin.x + component.position.x + offset.x;
    const y = sceneOrigin.y + component.position.y + offset.y;
    points.push({ x, y });
    points.push({ x: x + geometryLayout.width, y: y + geometryLayout.height });
  });

  if (points.length === 0) {
    return null;
  }

  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const paddingX = 44;
  const paddingY = 36;

  return {
    x: minX - paddingX,
    y: minY - paddingY,
    width: Math.max(maxX - minX + paddingX * 2, 120),
    height: Math.max(maxY - minY + paddingY * 2, 120),
  };
}

function buildImportedConnectionPathList(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[],
  sceneOrigin: ImportedSchematicPoint = { x: 0, y: 0 }
): StructuredConnectionPath[] {
  const anchors = buildLegacyAnchorMap(components, sceneOrigin);
  return manualConnections.flatMap(connection => {
    if (connection.source.ownerType !== 'component' || connection.target.ownerType !== 'component') {
      return [];
    }
    const source = anchors.get(`${connection.source.ownerId}:${connection.source.pinId}`);
    const target = anchors.get(`${connection.target.ownerId}:${connection.target.pinId}`);
    if (!source || !target) {
      return [];
    }
    return [{
      id: connection.id,
      label: connection.suggestedNetName,
      points: buildStructuredSignalPath(
        { point: source.point, angle: source.angle, ownerType: 'component', ownerId: connection.source.ownerId, pinId: connection.source.pinId },
        { point: target.point, angle: target.angle, ownerType: 'component', ownerId: connection.target.ownerId, pinId: connection.target.pinId }
      ),
      sourceComponentId: connection.source.ownerId,
      targetComponentId: connection.target.ownerId,
      netKind: classifyNetKind(connection),
    }] satisfies StructuredConnectionPath[];
  });
}

export { buildImportedConnectionPathList as buildImportedStructuredConnectionPaths };
