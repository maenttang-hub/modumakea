import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportedStructuredConnectionPaths,
  buildImportedStructuredLayout,
  getImportedStructuredViewportBounds,
} from '@/lib/imported-schematic-structured-view';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import type { ManualNetConnection, PlacedComponent } from '@/types';

function makeImportedComponent(params: {
  instanceId: string;
  position: { x: number; y: number };
  pinId: string;
  pinAt: { x: number; y: number };
  pinAngle: 0 | 90 | 180 | 270;
}): PlacedComponent {
  return {
    instanceId: params.instanceId,
    templateId: 'tpl_resistor',
    name: params.instanceId,
    position: params.position,
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
    importedGeometry: {
      bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
      renderSource: 'primitive',
      primitives: [],
      pinAnchors: [
        {
          pinId: params.pinId,
          label: params.pinId,
          number: '1',
          at: params.pinAt,
          angle: params.pinAngle,
          lengthMm: 2.54,
        },
      ],
    },
    onDelete: () => {},
    onRotate: () => {},
  } as PlacedComponent;
}

test('structured imported schematic view builds routed paths from component anchors', () => {
  const components = [
    makeImportedComponent({
      instanceId: 'left',
      position: { x: 120, y: 80 },
      pinId: 'OUT',
      pinAt: { x: 20, y: 10 },
      pinAngle: 180,
    }),
    makeImportedComponent({
      instanceId: 'right',
      position: { x: 260, y: 140 },
      pinId: 'IN',
      pinAt: { x: 0, y: 10 },
      pinAngle: 0,
    }),
  ];

  const manualConnections: ManualNetConnection[] = [
    {
      id: 'net-1',
      source: { ownerType: 'component', ownerId: 'left', pinId: 'OUT' },
      target: { ownerType: 'component', ownerId: 'right', pinId: 'IN' },
      suggestedNetName: 'DATA',
    },
  ];

  const paths = buildImportedStructuredConnectionPaths(components, manualConnections, { x: 40, y: 30 });
  const leftLayout = layoutImportedGeometry(components[0]!.importedGeometry!, 0, undefined, { preserveStoredBounds: true });
  const rightLayout = layoutImportedGeometry(components[1]!.importedGeometry!, 0, undefined, { preserveStoredBounds: true });
  const expectedStart = {
    x: 40 + components[0]!.position.x + leftLayout.pinAnchors[0]!.at.x,
    y: 30 + components[0]!.position.y + leftLayout.pinAnchors[0]!.at.y,
  };
  const expectedEnd = {
    x: 40 + components[1]!.position.x + rightLayout.pinAnchors[0]!.at.x,
    y: 30 + components[1]!.position.y + rightLayout.pinAnchors[0]!.at.y,
  };

  assert.equal(paths.length, 1);
  assert.equal(paths[0]?.label, 'DATA');
  assert.deepEqual(paths[0]?.points[0], expectedStart);
  assert.deepEqual(paths[0]?.points.at(-1), expectedEnd);
  assert.ok((paths[0]?.points.length ?? 0) >= 4);
});

test('structured imported schematic view keeps dense power and support groups compact', () => {
  const powerComponents = Array.from({ length: 8 }, (_, index) =>
    makeImportedComponent({
      instanceId: `gnd-${index}`,
      position: { x: 20, y: index * 80 },
      pinId: 'GND',
      pinAt: { x: 2, y: 2 },
      pinAngle: 270,
    })
  ).map(component => ({
    ...component,
    name: 'GNDPWR',
    importedReference: `#PWR${component.instanceId}`,
  }));
  const supportComponents = Array.from({ length: 7 }, (_, index) =>
    makeImportedComponent({
      instanceId: `support-${index}`,
      position: { x: 120, y: index * 70 },
      pinId: index % 2 === 0 ? 'SDA' : 'SCL',
      pinAt: { x: 2, y: 2 },
      pinAngle: 0,
    })
  );
  const mcu = {
    ...makeImportedComponent({
      instanceId: 'mcu',
      position: { x: 300, y: 120 },
      pinId: 'D2',
      pinAt: { x: 2, y: 2 },
      pinAngle: 0,
    }),
    name: 'ATmega328P',
  };

  const components = [mcu, ...powerComponents, ...supportComponents];
  const layout = buildImportedStructuredLayout(components, [], { x: 0, y: 0 });
  const bounds = getImportedStructuredViewportBounds(components, [], { x: 0, y: 0 });
  const support = layout.sections.find(section => section.id === 'support');
  const power = layout.sections.find(section => section.id === 'power');

  assert.ok(power, 'expected power section');
  assert.ok(support, 'expected support section');
  assert.equal(support?.x, 782);
  assert.ok((power?.height ?? 0) < 210, 'power section should use a compact grid');
  assert.ok((support?.height ?? 0) < 180, 'support section should use a compact grid');
  assert.ok((bounds?.height ?? Infinity) < 620, 'viewport should not be dominated by a long vertical stack');
});
