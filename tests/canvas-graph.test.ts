import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCanvasEdges, buildCanvasNodes } from '@/components/canvas/canvas-graph';
import { getInitialPins } from '@/constants/board-pins';
import { getBoardById } from '@/constants/boards';
import type { PlacedComponent, ProjectCommentThread } from '@/types';

const noop = () => {};

function nodeArgsDefaults() {
  return {
    manualConnections: [],
    ghostComponentIds: new Set<string>(),
    importedSchematicScene: null,
    importedSchematicViewMode: 'original' as const,
  };
}

function edgeArgsDefaults() {
  return {
    ghostComponentIds: new Set<string>(),
    ghostConnectionIds: new Set<string>(),
  };
}

test('buildCanvasNodes marks freshly saved comment pins for temporary highlight', () => {
  const board = getBoardById('uno');
  const components: PlacedComponent[] = [
    {
      instanceId: 'sensor-1',
      templateId: 'tpl_dht11',
      name: '온습도 센서 1',
      value: '',
      position: { x: 420, y: 240 },
      rotation: 0,
      assignedPins: { Data: 'D2' },
      isFullyRouted: true,
    },
  ];
  const commentThreads: ProjectCommentThread[] = [
    {
      root: {
        id: 'thread-1',
        projectId: 'project-1',
        authorId: null,
        content: '이 위치가 조금 답답해요.',
        targetType: 'node',
        targetMeta: { nodeId: 'sensor-1' },
        status: 'open',
        parentId: null,
        createdAt: '2026-06-18T00:00:00.000Z',
      },
      replies: [
        {
          id: 'reply-1',
          projectId: 'project-1',
          authorId: null,
          content: '바로 조정해둘게요.',
          targetType: 'node',
          targetMeta: { nodeId: 'sensor-1' },
          status: 'open',
          parentId: 'thread-1',
          createdAt: '2026-06-18T00:01:00.000Z',
        },
      ],
    },
  ];

  const nodes = buildCanvasNodes({
    ...nodeArgsDefaults(),
    activeBoardId: 'uno',
    board,
    pins: getInitialPins('uno'),
    components,
    positionedComponents: components,
    componentRuntimeStates: {},
    reviewFocus: null,
    collaborators: [],
    commentThreads,
    selectedCommentId: 'thread-1',
    highlightedThreadId: 'thread-1',
    openCommentThread: noop,
    removeComponent: noop,
    rotateComponent: noop,
  });

  const commentNode = nodes.find(node => node.id === 'comment-thread-1');
  assert.ok(commentNode, 'comment pin node should be created');
  assert.equal(commentNode?.type, 'commentPin');
  assert.equal(commentNode?.data.isSelected, true);
  assert.equal(commentNode?.data.isRecentlyHighlighted, true);
  assert.equal(commentNode?.data.replyCount, 1);
});

test('buildCanvasNodes hides the pseudo board and uses imported symbol nodes for KiCad generic projects', () => {
  const board = getBoardById('kicad_generic');
  const components: PlacedComponent[] = [
    {
      instanceId: 'imported-u1',
      templateId: 'kicad_mcu',
      name: 'ATmega328P-PU',
      position: { x: 420, y: 240 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -5.08, maxX: 5.08, maxY: 5.08 },
        primitives: [
          {
            kind: 'rect',
            start: { x: -5.08, y: -5.08 },
            end: { x: 5.08, y: 5.08 },
          },
        ],
        pinAnchors: [
          { pinId: 'PB0', label: 'PB0', number: '14', at: { x: -5.08, y: 0 }, angle: 0, lengthMm: 2.54 },
          { pinId: 'VCC', label: 'VCC', number: '7', at: { x: -5.08, y: 2.54 }, angle: 0, lengthMm: 2.54 },
        ],
        referenceLabel: 'U1',
        valueLabel: 'ATmega328P-PU',
      },
    },
  ];

  const nodes = buildCanvasNodes({
    ...nodeArgsDefaults(),
    activeBoardId: 'kicad_generic',
    board,
    pins: getInitialPins('kicad_generic'),
    components,
    positionedComponents: components,
    componentRuntimeStates: {},
    reviewFocus: null,
    collaborators: [],
    commentThreads: [],
    selectedCommentId: null,
    highlightedThreadId: null,
    openCommentThread: noop,
    removeComponent: noop,
    rotateComponent: noop,
  });

  assert.equal(nodes.some(node => node.id === 'board-node'), false);
  const importedNode = nodes.find(node => node.id === 'imported-u1');
  assert.ok(importedNode);
  assert.equal(importedNode?.type, 'importedSchematicComponent');
  assert.equal(importedNode?.data.isOverlayOnly, false);
  assert.equal(importedNode?.draggable, false);
});

test('buildCanvasNodes normalizes imported component positions against the active scene origin', () => {
  const board = getBoardById('kicad_generic');
  const components: PlacedComponent[] = [
    {
      instanceId: 'imported-u1',
      templateId: 'kicad_mcu',
      name: 'ATmega328P-PU',
      position: { x: 420, y: 240 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -5.08, maxX: 5.08, maxY: 5.08 },
        primitives: [],
        pinAnchors: [],
      },
    },
  ];

  const nodes = buildCanvasNodes({
    ...nodeArgsDefaults(),
    activeBoardId: 'kicad_generic',
    board,
    pins: getInitialPins('kicad_generic'),
    components,
    importedSchematicScene: {
      wireSegments: [{ start: { x: 400, y: 200 }, end: { x: 500, y: 200 } }],
      junctions: [],
      labels: [],
      pageFrame: undefined,
      sheetFrames: [],
    },
    positionedComponents: components,
    componentRuntimeStates: {},
    reviewFocus: null,
    collaborators: [],
    commentThreads: [],
    selectedCommentId: null,
    highlightedThreadId: null,
    openCommentThread: noop,
    removeComponent: noop,
    rotateComponent: noop,
  });

  const importedNode = nodes.find(node => node.id === 'imported-u1');
  assert.ok(importedNode);
  assert.equal(importedNode?.position.x, 20);
  assert.equal(importedNode?.position.y, 40);
});

test('buildCanvasNodes injects a non-interactive imported overlay node when scene geometry exists', () => {
  const board = getBoardById('kicad_generic');
  const nodes = buildCanvasNodes({
    ...nodeArgsDefaults(),
    activeBoardId: 'kicad_generic',
    board,
    pins: getInitialPins('kicad_generic'),
    components: [],
    importedSchematicScene: {
      wireSegments: [{ start: { x: 100, y: 120 }, end: { x: 220, y: 120 } }],
      junctions: [{ x: 220, y: 120 }],
      labels: [{ text: 'VCC', at: { x: 160, y: 110 } }],
      pageFrame: undefined,
      sheetFrames: [],
    },
    positionedComponents: [],
    componentRuntimeStates: {},
    reviewFocus: null,
    collaborators: [],
    commentThreads: [],
    selectedCommentId: null,
    highlightedThreadId: null,
    openCommentThread: noop,
    removeComponent: noop,
    rotateComponent: noop,
  });

  const overlayNode = nodes.find(node => node.type === 'importedSchematicOverlayNode');
  assert.ok(overlayNode);
  assert.equal(overlayNode?.position.x, 0);
  assert.equal(overlayNode?.position.y, 0);
  assert.equal(overlayNode?.draggable, false);
  assert.equal(overlayNode?.selectable, false);
  assert.equal(overlayNode?.deletable, false);
  assert.equal(overlayNode?.style?.width, 120);
  assert.equal(overlayNode?.style?.height, 10);
  assert.equal(overlayNode?.data.scene?.wireSegments.length, 1);
});

test('buildCanvasEdges keeps imported schematic wiring in KiCad review style and skips pseudo-board signal edges', () => {
  const components: PlacedComponent[] = [
    {
      instanceId: 'imported-r1',
      templateId: 'tpl_resistor',
      name: 'R1',
      value: '330R',
      position: { x: 180, y: 120 },
      rotation: 0,
      assignedPins: { '1': 'D2', '2': 'D3' },
      isFullyRouted: false,
      importedReference: 'R1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -2.54, maxX: 5.08, maxY: 2.54 },
        primitives: [
          {
            kind: 'rect',
            start: { x: -3.81, y: -1.27 },
            end: { x: 3.81, y: 1.27 },
          },
        ],
        pinAnchors: [
          { pinId: '1', label: '1', number: '1', at: { x: -5.08, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: '2', label: '2', number: '2', at: { x: 5.08, y: 0 }, angle: 0, lengthMm: 2.54 },
        ],
      },
    },
    {
      instanceId: 'imported-c1',
      templateId: 'tpl_capacitor',
      name: 'C1',
      value: '10uF',
      position: { x: 300, y: 120 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedReference: 'C1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -2.54, maxX: 5.08, maxY: 2.54 },
        primitives: [],
        pinAnchors: [
          { pinId: '1', label: '1', number: '1', at: { x: -5.08, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: '2', label: '2', number: '2', at: { x: 5.08, y: 0 }, angle: 0, lengthMm: 2.54 },
        ],
      },
    },
  ];

  const edges = buildCanvasEdges({
    ...edgeArgsDefaults(),
    components,
    importedSchematicMode: true,
    hasImportedSchematicScene: true,
    manualConnections: [
      {
        id: 'kicad-import-1',
        source: { ownerType: 'component', ownerId: 'imported-r1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'imported-c1', pinId: '1' },
        suggestedNetName: 'VCC',
      },
    ],
    reviewFocus: null,
    isPreviewRouting: false,
    routeContextKey: 'test',
  });

  assert.equal(edges.length, 1);
  assert.equal(edges[0]?.data?.renderStyle, 'kicad-import');
  assert.equal(edges[0]?.data?.isOverlayOnly, true);
  assert.equal(edges[0]?.source, 'imported-r1');
  assert.equal(edges[0]?.target, 'imported-c1');
});

test('buildCanvasEdges keeps reconstructed imported connections visible when original wire layer is missing', () => {
  const components: PlacedComponent[] = [
    {
      instanceId: 'imported-r1',
      templateId: 'tpl_resistor',
      name: 'R1',
      value: '330 Ohm',
      position: { x: 120, y: 120 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedReference: 'R1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -2.54, maxX: 5.08, maxY: 2.54 },
        primitives: [],
        pinAnchors: [
          { pinId: '1', label: '1', number: '1', at: { x: -5.08, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: '2', label: '2', number: '2', at: { x: 5.08, y: 0 }, angle: 0, lengthMm: 2.54 },
        ],
      },
    },
    {
      instanceId: 'imported-led1',
      templateId: 'tpl_led',
      name: 'D1',
      value: 'LED',
      position: { x: 220, y: 120 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedReference: 'D1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -2.54, maxX: 5.08, maxY: 2.54 },
        primitives: [],
        pinAnchors: [
          { pinId: 'A', label: 'A', number: '1', at: { x: -5.08, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: 'K', label: 'K', number: '2', at: { x: 5.08, y: 0 }, angle: 0, lengthMm: 2.54 },
        ],
      },
    },
  ];

  const edges = buildCanvasEdges({
    ...edgeArgsDefaults(),
    components,
    importedSchematicMode: true,
    hasImportedSchematicScene: false,
    manualConnections: [
      {
        id: 'kicad-import-1',
        source: { ownerType: 'component', ownerId: 'imported-r1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'imported-led1', pinId: 'A' },
        suggestedNetName: 'LED',
      },
    ],
    reviewFocus: null,
    isPreviewRouting: false,
    routeContextKey: 'test',
  });

  assert.equal(edges.length, 1);
  assert.equal(edges[0]?.data?.renderStyle, 'kicad-import');
  assert.equal(edges[0]?.data?.isOverlayOnly, false);
});
