import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { buildOrthogonalRoute } from '@/lib/orthogonal-router';
import type {
  ComponentTemplate,
  ManualNetConnection,
  PcbDocument,
  PcbKeepoutHint,
  PcbKeepoutRegion,
  PcbLayerId,
  PcbModel,
  PcbNet,
  PcbOutlineSegment,
  PcbPadInstance,
  PcbPadModel,
  PcbPlacement,
  PcbPoint,
  PcbRect,
  PcbTrace,
  PcbZone,
  PlacedComponent,
} from '@/types';

const BOARD_PLACEMENT_ID = '__board_interface__';
const BOARD_MARGIN = 120;
const POWER_LAYERS: PcbLayerId[] = ['F.Cu', 'B.Cu'];
const TOP_ONLY_LAYERS: PcbLayerId[] = ['F.Cu'];

function sanitizeId(value: string) {
  return value.replace(/[^A-Za-z0-9_]+/g, '_');
}

function getSignalClass(netName: string): PcbNet['className'] {
  if (netName === 'GND') {
    return 'ground';
  }
  if (netName === '5V' || netName === '3.3V' || netName === 'VIN') {
    return 'power';
  }
  return 'signal';
}

function inferBodySize(template: ComponentTemplate | undefined): { width: number; height: number } {
  const explicit = template?.pcb?.bodySize;
  if (explicit) {
    return explicit;
  }

  switch (template?.id) {
    case 'tpl_resistor':
    case 'tpl_capacitor':
    case 'tpl_inductor':
    case 'tpl_diode':
      return { width: 76, height: 24 };
    case 'tpl_transistor_npn':
      return { width: 42, height: 32 };
    case 'tpl_external_power':
      return { width: 64, height: 32 };
    case 'tpl_driver_ic':
      return { width: 74, height: 56 };
    case 'tpl_level_shifter':
      return { width: 92, height: 42 };
    case 'tpl_adc_module':
      return { width: 78, height: 40 };
    default: {
      const pinCount = Math.max(template?.requiredPins.length ?? 0, 2);
      return {
        width: template?.category === 'PASSIVE' ? 64 : 96,
        height: Math.max(42, 28 + pinCount * 14),
      };
    }
  }
}

function buildPassivePads(template: ComponentTemplate, body: { width: number; height: number }): PcbPadModel[] {
  const throughHoleLayers = template.pcb?.packageType === 'THT' ? POWER_LAYERS : TOP_ONLY_LAYERS;

  switch (template.id) {
    case 'tpl_resistor':
    case 'tpl_capacitor':
    case 'tpl_inductor':
    case 'tpl_diode':
      return [
        {
          id: '1',
          label: '1',
          offset: { x: 10, y: body.height / 2 },
          size: { width: 3.2, height: 3.2 },
          shape: 'circle',
          layers: throughHoleLayers,
        },
        {
          id: '2',
          label: '2',
          offset: { x: body.width - 10, y: body.height / 2 },
          size: { width: 3.2, height: 3.2 },
          shape: 'circle',
          layers: throughHoleLayers,
        },
      ];
    case 'tpl_transistor_npn':
      return ['C', 'B', 'E'].map((label, index) => ({
        id: label,
        label,
        offset: { x: 10 + index * 11, y: body.height - 8 },
        size: { width: 2.8, height: 2.8 },
        shape: 'circle',
        layers: throughHoleLayers,
      }));
    case 'tpl_external_power':
      return [
        {
          id: 'VIN+',
          label: 'VIN+',
          offset: { x: 14, y: body.height / 2 },
          size: { width: 3.6, height: 3.6 },
          shape: 'rect',
          layers: POWER_LAYERS,
        },
        {
          id: 'GND',
          label: 'GND',
          offset: { x: body.width - 14, y: body.height / 2 },
          size: { width: 3.6, height: 3.6 },
          shape: 'circle',
          layers: POWER_LAYERS,
        },
      ];
    case 'tpl_level_shifter': {
      const left = ['HV', 'LV', 'GND', 'A1', 'A2'];
      const right = ['B1', 'B2', 'B3', 'B4', '5V'];
      return [
        ...left.map((label, index) => ({
          id: label,
          label,
          offset: { x: 10, y: 10 + index * 6.5 },
          size: { width: 2.5, height: 1.6 },
          shape: 'oval' as const,
          layers: TOP_ONLY_LAYERS,
        })),
        ...right.map((label, index) => ({
          id: label,
          label,
          offset: { x: body.width - 10, y: 10 + index * 6.5 },
          size: { width: 2.5, height: 1.6 },
          shape: 'oval' as const,
          layers: TOP_ONLY_LAYERS,
        })),
      ];
    }
    case 'tpl_driver_ic': {
      const pins = Array.from({ length: 16 }, (_, index) => `${index + 1}`);
      return pins.map((label, index) => ({
        id: label,
        label,
        offset: index < 8
          ? { x: 8, y: 8 + index * 5.7 }
          : { x: body.width - 8, y: 8 + (15 - index) * 5.7 },
        size: { width: 2.4, height: 1.3 },
        shape: 'oval',
        layers: POWER_LAYERS,
      }));
    }
    case 'tpl_adc_module': {
      const pins = ['VCC', 'GND', 'SCL', 'SDA', 'ADDR', 'ALERT'];
      return pins.map((label, index) => ({
        id: label,
        label,
        offset: { x: 10 + index * 11.5, y: body.height - 8 },
        size: { width: 2.4, height: 1.4 },
        shape: 'oval',
        layers: TOP_ONLY_LAYERS,
      }));
    }
    default:
      return [];
  }
}

function getTemplatePads(template: ComponentTemplate | undefined): PcbPadModel[] {
  if (!template) {
    return [];
  }

  if (template.pcb?.pads?.length) {
    return template.pcb.pads;
  }

  const body = inferBodySize(template);
  if (template.requiredPins.length === 0) {
    return buildPassivePads(template, body);
  }

  const { leftPins, rightPins } = getComponentPinLayout(template.requiredPins, template.category);
  const leftGap = leftPins.length <= 1 ? 0 : (body.height - 20) / (leftPins.length - 1);
  const rightGap = rightPins.length <= 1 ? 0 : (body.height - 20) / (rightPins.length - 1);
  const layers = template.pcb?.packageType === 'THT' ? POWER_LAYERS : TOP_ONLY_LAYERS;

  return [
    ...leftPins.map((pin, index) => ({
      id: pin.name,
      label: pin.name,
      offset: { x: 8, y: 10 + index * leftGap },
      size: { width: 2.8, height: 1.8 },
      shape: 'oval' as const,
      layers,
    })),
    ...rightPins.map((pin, index) => ({
      id: pin.name,
      label: pin.name,
      offset: { x: body.width - 8, y: 10 + index * rightGap },
      size: { width: 2.8, height: 1.8 },
      shape: 'oval' as const,
      layers,
    })),
  ];
}

function rotatePoint(offset: PcbPoint, rotation: 0 | 90 | 180 | 270, body: { width: number; height: number }) {
  const cx = body.width / 2;
  const cy = body.height / 2;
  const dx = offset.x - cx;
  const dy = offset.y - cy;

  switch (rotation) {
    case 90:
      return { x: cx - dy, y: cy + dx };
    case 180:
      return { x: cx - dx, y: cy - dy };
    case 270:
      return { x: cx + dy, y: cy - dx };
    default:
      return offset;
  }
}

function buildPlacementPads(
  ownerId: string,
  padModels: PcbPadModel[],
  position: PcbPoint,
  rotation: 0 | 90 | 180 | 270,
  body: { width: number; height: number },
  netLookup: Record<string, string>
): PcbPadInstance[] {
  return padModels.map(pad => {
    const rotatedOffset = rotatePoint(pad.offset, rotation, body);
    return {
      id: `${ownerId}:${pad.id}`,
      label: pad.label,
      netId: netLookup[pad.label] ?? netLookup[pad.id] ?? null,
      center: {
        x: position.x + rotatedOffset.x,
        y: position.y + rotatedOffset.y,
      },
      size: pad.size,
      shape: pad.shape,
      layers: pad.layers,
    };
  });
}

function getPlacementRect(position: PcbPoint, body: { width: number; height: number }, rotation: 0 | 90 | 180 | 270): PcbRect {
  const width = rotation === 90 || rotation === 270 ? body.height : body.width;
  const height = rotation === 90 || rotation === 270 ? body.width : body.height;
  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}

function getBoardPlacement(boardId: string, referenceX: number, referenceY: number): PcbPlacement {
  const board = getBoardById(boardId);
  const rows = Math.max(board.leftPins.length, board.digitalPins.length);
  const body = { width: 180, height: Math.max(110, 28 + rows * 12) };
  const leftGap = board.leftPins.length <= 1 ? 0 : (body.height - 24) / (board.leftPins.length - 1);
  const rightGap = board.digitalPins.length <= 1 ? 0 : (body.height - 24) / (board.digitalPins.length - 1);
  const pads: PcbPadInstance[] = [
    ...board.leftPins.map((pinId, index) => ({
      id: `${BOARD_PLACEMENT_ID}:${pinId}`,
      label: pinId,
      netId: null,
      center: { x: referenceX + 10, y: referenceY + 12 + index * leftGap },
      size: { width: 3.2, height: 1.7 },
      shape: 'oval' as const,
      layers: POWER_LAYERS,
    })),
    ...board.digitalPins.map((pinId, index) => ({
      id: `${BOARD_PLACEMENT_ID}:${pinId}`,
      label: pinId,
      netId: null,
      center: { x: referenceX + body.width - 10, y: referenceY + 12 + index * rightGap },
      size: { width: 3.2, height: 1.7 },
      shape: 'oval' as const,
      layers: POWER_LAYERS,
    })),
  ];

  return {
    id: BOARD_PLACEMENT_ID,
    ref: board.id.toUpperCase(),
    ownerId: board.id,
    ownerType: 'board',
    templateId: board.id,
    name: `${board.name} Header`,
    footprint: `Board:${board.id}_interface`,
    packageType: 'MODULE',
    layer: 'top',
    position: { x: referenceX, y: referenceY },
    rotation: 0,
    body: { x: referenceX, y: referenceY, width: body.width, height: body.height },
    pads,
  };
}

function getPadCenter(placement: PcbPlacement, label: string) {
  return placement.pads.find(pad => pad.label === label);
}

function getOutlineSegments(bounds: PcbRect): PcbOutlineSegment[] {
  const topLeft = { x: bounds.x, y: bounds.y };
  const topRight = { x: bounds.x + bounds.width, y: bounds.y };
  const bottomRight = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  const bottomLeft = { x: bounds.x, y: bounds.y + bounds.height };

  return [
    { id: 'outline-top', layer: 'Edge.Cuts', kind: 'line', start: topLeft, end: topRight },
    { id: 'outline-right', layer: 'Edge.Cuts', kind: 'line', start: topRight, end: bottomRight },
    { id: 'outline-bottom', layer: 'Edge.Cuts', kind: 'line', start: bottomRight, end: bottomLeft },
    { id: 'outline-left', layer: 'Edge.Cuts', kind: 'line', start: bottomLeft, end: topLeft },
  ];
}

function polygonFromRect(rect: PcbRect): PcbPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function buildKeepouts(
  placement: PcbPlacement,
  template: ComponentTemplate | undefined
): PcbKeepoutRegion[] {
  const keepouts: PcbKeepoutRegion[] = [];
  const hints = template?.pcb?.keepoutHints ?? [];

  hints.forEach((hint: PcbKeepoutHint) => {
    const rect = {
      x: placement.position.x + hint.rect.x,
      y: placement.position.y + hint.rect.y,
      width: hint.rect.width,
      height: hint.rect.height,
    };
    keepouts.push({
      id: `${placement.id}:${hint.id}`,
      ownerId: placement.ownerId,
      reason: hint.reason,
      layers: hint.layers,
      polygon: polygonFromRect(rect),
    });
  });

  if (/hc-05|esp32|nrf|wifi|ble|zigbee/i.test(template?.pcb?.footprint ?? '')) {
    keepouts.push({
      id: `${placement.id}:rf-keepout`,
      ownerId: placement.ownerId,
      reason: 'RF antenna keepout',
      layers: ['F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS'],
      polygon: polygonFromRect({
        x: placement.position.x + placement.body.width * 0.62,
        y: placement.position.y - 6,
        width: placement.body.width * 0.38,
        height: 22,
      }),
    });
  }

  return keepouts;
}

function buildZones(bounds: PcbRect, nets: PcbNet[]): PcbZone[] {
  const zones: PcbZone[] = [];
  const inset = 12;
  const inner = {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: Math.max(60, bounds.width - inset * 2),
    height: Math.max(60, bounds.height - inset * 2),
  };

  const groundNet = nets.find(net => net.name === 'GND');
  if (groundNet) {
    zones.push({
      id: 'zone-gnd',
      netId: groundNet.id,
      layer: 'B.Cu',
      purpose: 'ground-pour',
      polygon: polygonFromRect(inner),
      clearance: 0.35,
    });
  }

  const powerNets = nets.filter(net => net.name === '5V' || net.name === '3.3V');
  powerNets.forEach((net, index) => {
    zones.push({
      id: `zone-${sanitizeId(net.name)}`,
      netId: net.id,
      layer: 'F.Cu',
      purpose: 'power-rail',
      polygon: polygonFromRect({
        x: inner.x + 18,
        y: inner.y + 10 + index * 14,
        width: Math.max(50, inner.width - 36),
        height: 8,
      }),
      clearance: 0.4,
    });
  });

  return zones;
}

type RouteEndpoint = {
  ownerType: 'board' | 'component';
  ownerId: string;
  pinId: string;
};

type RouteEdge = {
  id: string;
  source: RouteEndpoint;
  target: RouteEndpoint;
  suggestedNetName?: string;
};

function routeEndpointKey(endpoint: RouteEndpoint) {
  return `${endpoint.ownerType}:${endpoint.ownerId}:${endpoint.pinId}`;
}

function chooseNetName(index: number, endpoints: RouteEndpoint[], suggestions: string[]) {
  const cleanedSuggestions = suggestions.filter(Boolean);
  if (cleanedSuggestions.length > 0) {
    return cleanedSuggestions[0];
  }

  const boardPins = Array.from(
    new Set(
      endpoints
        .filter(endpoint => endpoint.ownerType === 'board')
        .map(endpoint => endpoint.pinId)
    )
  );

  if (boardPins.length === 1) {
    return boardPins[0];
  }

  if (boardPins.length > 1) {
    return `MERGED_${boardPins.map(sanitizeId).join('_')}`;
  }

  return `NET_${index + 1}`;
}

export function buildPcbDocument(
  components: PlacedComponent[],
  boardId: string,
  manualConnections: ManualNetConnection[] = [],
  generatedAt = new Date().toISOString()
): PcbDocument {
  const board = getBoardById(boardId);
  const componentPositions = components.map(component => component.position);
  const minX = Math.min(...componentPositions.map(position => position.x), 280);
  const minY = Math.min(...componentPositions.map(position => position.y), 160);
  const boardPlacement = getBoardPlacement(boardId, Math.max(40, minX - 250), Math.max(40, minY - 10));

  const routeEdges: RouteEdge[] = [
    ...components.flatMap(component =>
      Object.entries(component.assignedPins).map(([componentPin, boardPin]) => ({
        id: `assigned:${component.instanceId}:${componentPin}:${boardPin}`,
        source: {
          ownerType: 'board' as const,
          ownerId: board.id,
          pinId: boardPin,
        },
        target: {
          ownerType: 'component' as const,
          ownerId: component.instanceId,
          pinId: componentPin,
        },
      }))
    ),
    ...manualConnections.map(connection => ({
      id: connection.id,
      source: {
        ownerType: connection.source.ownerType,
        ownerId: connection.source.ownerType === 'board' ? board.id : connection.source.ownerId,
        pinId: connection.source.pinId,
      },
      target: {
        ownerType: connection.target.ownerType,
        ownerId: connection.target.ownerType === 'board' ? board.id : connection.target.ownerId,
        pinId: connection.target.pinId,
      },
      suggestedNetName: connection.suggestedNetName,
    })),
  ];

  const adjacency = new Map<string, Set<string>>();
  const endpointMap = new Map<string, RouteEndpoint>();

  const registerEndpoint = (endpoint: RouteEndpoint) => {
    const key = routeEndpointKey(endpoint);
    endpointMap.set(key, endpoint);
    if (!adjacency.has(key)) {
      adjacency.set(key, new Set());
    }
    return key;
  };

  routeEdges.forEach(edge => {
    const sourceKey = registerEndpoint(edge.source);
    const targetKey = registerEndpoint(edge.target);
    adjacency.get(sourceKey)?.add(targetKey);
    adjacency.get(targetKey)?.add(sourceKey);
  });

  const nets: PcbNet[] = [];
  const netIdByEndpoint = new Map<string, string>();
  const componentNetLookup = new Map<string, Record<string, string>>();
  const boardNetLookup: Record<string, string> = {};
  const visited = new Set<string>();

  let floatingIndex = 0;
  for (const key of adjacency.keys()) {
    if (visited.has(key)) {
      continue;
    }

    const queue = [key];
    const groupKeys: string[] = [];
    const suggestions: string[] = [];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      groupKeys.push(current);
      const neighbors = adjacency.get(current);
      neighbors?.forEach(next => {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }

    routeEdges.forEach(edge => {
      const sourceKey = routeEndpointKey(edge.source);
      const targetKey = routeEndpointKey(edge.target);
      if (
        groupKeys.includes(sourceKey) &&
        groupKeys.includes(targetKey) &&
        typeof edge.suggestedNetName === 'string' &&
        edge.suggestedNetName.length > 0
      ) {
        suggestions.push(edge.suggestedNetName);
      }
    });

    const endpoints = groupKeys
      .map(groupKey => endpointMap.get(groupKey))
      .filter((endpoint): endpoint is RouteEndpoint => Boolean(endpoint));
    const netName = chooseNetName(floatingIndex, endpoints, suggestions);
    const netId = `net_${sanitizeId(netName)}_${floatingIndex + 1}`;
    floatingIndex += 1;

    const net: PcbNet = {
      id: netId,
      name: netName,
      className: getSignalClass(netName),
      nodes: endpoints.map(endpoint => ({
        id: routeEndpointKey(endpoint),
        ownerId: endpoint.ownerId,
        ownerType: endpoint.ownerType,
        pinId: endpoint.pinId,
        label: endpoint.pinId,
      })),
    };
    nets.push(net);

    endpoints.forEach(endpoint => {
      const endpointKey = routeEndpointKey(endpoint);
      netIdByEndpoint.set(endpointKey, netId);
      if (endpoint.ownerType === 'board') {
        boardNetLookup[endpoint.pinId] = netId;
      } else {
        const lookup = componentNetLookup.get(endpoint.ownerId) ?? {};
        lookup[endpoint.pinId] = netId;
        componentNetLookup.set(endpoint.ownerId, lookup);
      }
    });
  }

  boardPlacement.pads = boardPlacement.pads.map(pad => ({
    ...pad,
    netId: boardNetLookup[pad.label] ?? null,
  }));

  const componentPlacements: PcbPlacement[] = components.map((component, index) => {
      const template = getTemplateById(component.templateId);
      const pcb = template?.pcb as PcbModel | undefined;
      const bodySize = inferBodySize(template);
      const pads = buildPlacementPads(
        component.instanceId,
        getTemplatePads(template),
        component.position,
        component.rotation,
        bodySize,
        componentNetLookup.get(component.instanceId) ?? {}
      );
      const rect = getPlacementRect(component.position, bodySize, component.rotation);

      return {
        id: component.instanceId,
        ref: `${template?.schematic?.referencePrefix ?? 'U'}${index + 1}`,
        ownerId: component.instanceId,
        ownerType: 'component',
        templateId: component.templateId,
        name: component.name,
        footprint: pcb?.footprint ?? `Module:${component.templateId}`,
        packageType: pcb?.packageType ?? 'MODULE',
        layer: 'top',
        position: component.position,
        rotation: component.rotation,
        body: rect,
        pads,
      };
    });

  const placements: PcbPlacement[] = [boardPlacement, ...componentPlacements];

  const placementById = new Map(placements.map(placement => [placement.ownerId, placement]));
  const obstacleRects = placements.map(placement => placement.body);
  const traces: PcbTrace[] = routeEdges.flatMap((edge, index) => {
    const sourcePlacement = placementById.get(edge.source.ownerId);
    const targetPlacement = placementById.get(edge.target.ownerId);
    if (!sourcePlacement || !targetPlacement) {
      return [];
    }

    const sourcePad = getPadCenter(sourcePlacement, edge.source.pinId);
    const targetPad = getPadCenter(targetPlacement, edge.target.pinId);
    const netId = netIdByEndpoint.get(routeEndpointKey(edge.source));
    const net = nets.find(item => item.id === netId);
    if (!sourcePad || !targetPad || !netId || !net) {
      return [];
    }

    const points = buildOrthogonalRoute(
      sourcePad.center,
      targetPad.center,
      obstacleRects.filter(rect =>
        !(rect.x === sourcePlacement.body.x && rect.y === sourcePlacement.body.y) &&
        !(rect.x === targetPlacement.body.x && rect.y === targetPlacement.body.y)
      ),
      index
    );

    return [{
      id: `trace_${sanitizeId(edge.id)}`,
      netId,
      layer: net.className === 'ground' ? 'B.Cu' : 'F.Cu',
      width: net.className === 'signal' ? 0.32 : 0.7,
      points,
      source: {
        id: routeEndpointKey(edge.source),
        ownerId: edge.source.ownerId,
        ownerType: edge.source.ownerType,
        pinId: edge.source.pinId,
        label: edge.source.pinId,
      },
      target: {
        id: routeEndpointKey(edge.target),
        ownerId: edge.target.ownerId,
        ownerType: edge.target.ownerType,
        pinId: edge.target.pinId,
        label: edge.target.pinId,
      },
    }];
  });

  const contentRects = placements.map(placement => placement.body);
  const bounds = {
    x: Math.min(...contentRects.map(rect => rect.x)) - BOARD_MARGIN,
    y: Math.min(...contentRects.map(rect => rect.y)) - BOARD_MARGIN / 2,
    width:
      Math.max(...contentRects.map(rect => rect.x + rect.width)) -
      Math.min(...contentRects.map(rect => rect.x)) +
      BOARD_MARGIN * 2,
    height:
      Math.max(...contentRects.map(rect => rect.y + rect.height)) -
      Math.min(...contentRects.map(rect => rect.y)) +
      BOARD_MARGIN,
  };

  const keepouts = placements.flatMap(placement =>
    placement.ownerType === 'component'
      ? buildKeepouts(placement, getTemplateById(placement.templateId))
      : []
  );

  return {
    version: 1,
    generatedAt,
    boardId,
    boardName: board.name,
    layers: ['F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS', 'F.Mask', 'B.Mask', 'Edge.Cuts', 'Dwgs.User'],
    outline: getOutlineSegments(bounds),
    placements,
    nets: nets.sort((a, b) => a.name.localeCompare(b.name)),
    traces,
    vias: [],
    zones: buildZones(bounds, nets),
    keepouts,
  };
}
