import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasLegacyImportedSchematicState,
  isImportedSchematicBoard,
  isImportedSchematicProject,
} from '@/lib/component-template-utils';
import type { PlacedComponent } from '@/types';

test('isImportedSchematicBoard only marks the generic KiCad review board', () => {
  assert.equal(isImportedSchematicBoard('kicad_generic'), true);
  assert.equal(isImportedSchematicBoard('uno'), false);
});

test('hasLegacyImportedSchematicState detects imported symbol-only snapshots', () => {
  const components: PlacedComponent[] = [{
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
  }];

  assert.equal(hasLegacyImportedSchematicState('kicad_generic', components, null), true);
  assert.equal(
    hasLegacyImportedSchematicState('kicad_generic', components, {
      wireSegments: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      junctions: [],
      labels: [],
    }),
    false
  );
  assert.equal(hasLegacyImportedSchematicState('uno', components, null), true);
});

test('isImportedSchematicProject keeps real-board KiCad imports in imported mode when geometry or scene exists', () => {
  const components: PlacedComponent[] = [{
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
  }];

  assert.equal(isImportedSchematicProject('kicad_generic', [], null), true);
  assert.equal(isImportedSchematicProject('uno', components, null), true);
  assert.equal(
    isImportedSchematicProject('uno', [], {
      wireSegments: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      junctions: [],
      labels: [],
    }),
    true
  );
  assert.equal(isImportedSchematicProject('uno', [], null), false);
});
