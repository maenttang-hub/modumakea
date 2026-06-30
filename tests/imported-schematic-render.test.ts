import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyImportedSymbolFamily,
  classifyImportedNetLabel,
  getImportedTextDisplayAnchor,
  getImportedTextDisplayAngle,
  getImportedTextDisplayBaseline,
  getImportedNetLabelDisplay,
  getImportedPinLabelDisplay,
  getImportedReadableTextOffset,
  getImportedTextOverviewOpacity,
  hasNativeImportedText,
  isPowerLikeImportedText,
  isLowPriorityImportedPinText,
  normalizeImportedGeometryForRender,
  resolveImportedOverlayVisibility,
  shouldUseImportedBodyFill,
  shouldRenderImportedPrimitive,
  shouldPreferNativeImportedLabels,
  shouldShowImportedFallbackBadge,
  shouldUseQuietImportedOverlay,
  shouldFlattenImportedTextForReadability,
} from '@/lib/imported-schematic-render';
import { IMPORTED_MM_TO_CANVAS, layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import {
  getImportedSchematicDisplayDrawings,
  getImportedSchematicDisplayPageFrame,
  getImportedSchematicDisplaySheetFrames,
  getImportedSchematicSceneBounds,
  getImportedSchematicReviewViewportBounds,
  getImportedSchematicViewportBounds,
} from '@/lib/imported-schematic-scene-bounds';
import {
  describeImportedSheetFrame,
  getImportedHierarchicalSheetDescriptors,
} from '@/lib/imported-schematic-structure';
import { hasImportedSchematicSceneContent } from '@/lib/component-template-utils';
import type {
  ImportedSchematicPrimitive,
  ImportedSchematicScene,
  ImportedSchematicSceneSymbol,
  PlacedComponent,
} from '@/types';

function sceneSymbol(
  instanceId: string,
  reference: string,
  value: string,
  primitives: ImportedSchematicPrimitive[] = [],
): ImportedSchematicSceneSymbol {
  return {
    instanceId,
    reference,
    value,
    primitives,
    pinAnchors: [],
  };
}

function primitiveRenderData(overrides: Record<string, unknown> = {}) {
  return {
    templateId: 'tpl_resistor',
    componentName: 'R1',
    value: '220 Ohm',
    importedReference: 'R1',
    importedMapping: undefined,
    importedGeometry: {
      bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      renderSource: 'primitive' as const,
      primitives: [],
      pinAnchors: [],
    },
    ...overrides,
  };
}

test('classifyImportedSymbolFamily splits power, connector, MCU, and generic imports', () => {
  assert.equal(classifyImportedSymbolFamily(primitiveRenderData()), 'passive');

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'tpl_dht22',
        componentName: 'DHT22',
        value: 'DHT22',
        importedReference: 'U1',
      })
    ),
    'generic'
  );

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'kicad_gndpwr',
        componentName: 'GNDPWR',
        value: 'GNDPWR',
        importedReference: '#PWR0104',
      })
    ),
    'power'
  );

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'kicad_raspberry_pi_header',
        componentName: 'Raspberry_Pi_2_3',
        value: 'Raspberry_Pi_2_3',
        importedReference: 'J1',
      })
    ),
    'connector'
  );

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'tpl_button',
        componentName: 'Barrel_Jack_Switch',
        value: 'Barrel_Jack_Switch',
        importedReference: 'J7',
        importedMapping: {
          libraryId: 'Connector:Barrel_Jack_Switch',
          matchedBy: 'library-id',
          confidence: 1,
          rationale: 'fixture',
        },
      })
    ),
    'connector'
  );

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'kicad_atmega328p',
        componentName: 'ATmega328P-PU',
        value: 'ATmega328P-PU',
        importedReference: 'U1',
      })
    ),
    'mcu'
  );

  assert.equal(
    classifyImportedSymbolFamily(
      primitiveRenderData({
        templateId: 'tpl_custom_sensor',
        componentName: 'Fancy Sensor',
        value: 'Module',
      })
    ),
    'generic'
  );
});

test('body fill stays reserved for MCU and larger IC-like symbols', () => {
  assert.equal(shouldUseImportedBodyFill({ family: 'mcu', pinAnchorCount: 28 }), true);
  assert.equal(shouldUseImportedBodyFill({ family: 'generic', pinAnchorCount: 8 }), true);
  assert.equal(shouldUseImportedBodyFill({ family: 'generic', pinAnchorCount: 3 }), false);
  assert.equal(shouldUseImportedBodyFill({ family: 'connector', pinAnchorCount: 40 }), false);
  assert.equal(shouldUseImportedBodyFill({ family: 'power', pinAnchorCount: 1 }), false);
  assert.equal(shouldUseImportedBodyFill({ family: 'passive', pinAnchorCount: 2 }), false);
});

test('quiet imported overlay mode applies to primitive-backed passive symbols', () => {
  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'tpl_resistor',
      componentName: 'R1',
      value: '220 Ohm',
      importedReference: 'R1',
      importedMapping: undefined,
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [],
      },
    }),
    true
  );

});

test('layoutImportedGeometry preserves native text alignment metadata', () => {
  const layout = layoutImportedGeometry(
    {
      bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
      renderSource: 'primitive',
      primitives: [
        {
          kind: 'text',
          at: { x: 1, y: -1 },
          text: 'VCC',
          angle: 90,
          originalAngle: 90,
          sizeMm: 1.27,
          role: 'value',
          textAnchor: 'end',
          baseline: 'ideographic',
        },
      ],
      pinAnchors: [],
    },
    0
  );

  const [text] = layout.primitives;
  assert.equal(text?.kind, 'text');
  if (text?.kind !== 'text') {
    return;
  }
  assert.equal(text.originalAngle, 90);
  assert.equal(text.textAnchor, 'end');
  assert.equal(text.baseline, 'ideographic');
});

test('sensor-like imported primitives stay out of quiet passive mode so KiCad labels remain visible', () => {
  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedMapping: undefined,
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [],
      },
    }),
    false
  );
});

test('fallback badge is shown for low-confidence imported mappings', () => {
  assert.equal(
    shouldShowImportedFallbackBadge(
      primitiveRenderData({
        importedMapping: {
          confidence: 'low',
          source: 'custom-fallback',
        },
      })
    ),
    true
  );

  assert.equal(
    shouldShowImportedFallbackBadge(
      primitiveRenderData({
        importedMapping: {
          confidence: 'high',
          source: 'refdes',
        },
      })
    ),
    false
  );
});

test('fallback badge is suppressed for primitive-backed power and connector imports', () => {
  assert.equal(
    shouldShowImportedFallbackBadge({
      templateId: 'kicad_gndpwr',
      componentName: 'GNDPWR',
      value: 'GNDPWR',
      importedReference: '#PWR0104',
      importedMapping: { confidence: 'low', source: 'custom-fallback' },
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [
          {
            kind: 'polyline',
            points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
            strokeWidth: 0.18,
          },
        ],
        pinAnchors: [],
      },
    }),
    false
  );

  assert.equal(
    shouldShowImportedFallbackBadge({
      templateId: 'kicad_raspberry_pi_header',
      componentName: 'Raspberry_Pi_2_3',
      value: 'Raspberry_Pi_2_3',
      importedReference: 'J1',
      importedMapping: {
        confidence: 'low',
        source: 'custom-fallback',
        matchedBy: 'Connector_Generic:Raspberry_Pi_2_3',
      },
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [
          {
            kind: 'rect',
            start: { x: -1, y: -1 },
            end: { x: 1, y: 1 },
            strokeWidth: 0.18,
            fill: 'none',
          },
        ],
        pinAnchors: [
          { pinId: '1', label: '1', number: '1', at: { x: -1, y: 0 }, angle: 180, lengthMm: 2.54, name: '1' },
          { pinId: '2', label: '2', number: '2', at: { x: 1, y: 0 }, angle: 0, lengthMm: 2.54, name: '2' },
        ],
      },
    }),
    false
  );
});

test('quiet imported overlay mode applies to primitive-backed ground and power symbols', () => {
  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'kicad_gndpwr',
      componentName: 'GNDPWR',
      value: 'GNDPWR',
      importedReference: '#PWR0104',
      importedMapping: { confidence: 'low', source: 'custom-fallback' },
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [],
      },
    }),
    true
  );
});

test('quiet imported overlay mode applies to primitive-backed connectors and MCU-like imports', () => {
  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'kicad_raspberry_pi_header',
      componentName: 'Raspberry_Pi_2_3',
      value: 'Raspberry_Pi_2_3',
      importedReference: 'J1',
      importedMapping: {
        confidence: 'low',
        source: 'custom-fallback',
        matchedBy: 'Connector_Generic:Raspberry_Pi_2_3',
      },
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [],
      },
    }),
    true
  );

  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'kicad_atmega328p',
      componentName: 'ATmega328P-PU',
      value: 'ATmega328P-PU',
      importedReference: 'U1',
      importedMapping: {
        confidence: 'low',
        source: 'custom-fallback',
        matchedBy: 'MCU_Microchip_ATmega:ATmega328P-PU',
      },
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [],
      },
    }),
    true
  );
});

test('quiet imported overlay mode stays off for fallback graphics', () => {
  assert.equal(
    shouldUseQuietImportedOverlay({
      templateId: 'tpl_resistor',
      componentName: 'R1',
      value: '220 Ohm',
      importedReference: 'R1',
      importedMapping: undefined,
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'fallback',
        primitives: [],
        pinAnchors: [],
      },
    }),
    false
  );
});

test('native imported text is detected from original symbol primitives', () => {
  assert.equal(
    hasNativeImportedText({
      templateId: 'tpl_resistor',
      componentName: 'R1',
      value: '220 Ohm',
      importedReference: 'R1',
      importedMapping: undefined,
      importedGeometry: {
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        renderSource: 'primitive',
        primitives: [
          {
            kind: 'text',
            at: { x: 0, y: 0 },
            text: 'R1',
            angle: 0,
            sizeMm: 1.27,
            role: 'reference',
          },
        ],
        pinAnchors: [],
      },
    }),
    true
  );
});

test('shouldPreferNativeImportedLabels stays with original labels for power, connectors, and MCU text', () => {
  assert.equal(
    shouldPreferNativeImportedLabels(
      primitiveRenderData({
        templateId: 'kicad_gndpwr',
        componentName: 'GNDPWR',
        value: 'GNDPWR',
        importedReference: '#PWR0104',
      })
    ),
    true
  );

  assert.equal(
    shouldPreferNativeImportedLabels(
      primitiveRenderData({
        templateId: 'kicad_raspberry_pi_header',
        componentName: 'Raspberry_Pi_2_3',
        value: 'Raspberry_Pi_2_3',
        importedReference: 'J1',
        importedGeometry: {
          bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
          renderSource: 'primitive',
          primitives: [{ kind: 'text', at: { x: 0, y: 0 }, text: 'J1', angle: 0, sizeMm: 1.27, role: 'reference' }],
          pinAnchors: [],
        },
      })
    ),
    true
  );

  assert.equal(
    shouldPreferNativeImportedLabels(
      primitiveRenderData({
        templateId: 'tpl_custom_sensor',
        componentName: 'Fancy Sensor',
        value: 'Module',
        importedGeometry: {
          bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
          renderSource: 'primitive',
          primitives: [{ kind: 'text', at: { x: 0, y: 0 }, text: 'U1', angle: 0, sizeMm: 1.27, role: 'reference' }],
          pinAnchors: [],
        },
      })
    ),
    false
  );
});

test('scene bounds prefer original imported wire geometry over drifted component boxes when scene exists', () => {
  const bounds = getImportedSchematicSceneBounds(
    [
      {
        instanceId: 'imported-u1',
        templateId: 'tpl_custom',
        name: 'Shifted box',
        position: { x: 4000, y: 3200 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedGeometry: {
          bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
          renderSource: 'primitive',
          primitives: [],
          pinAnchors: [],
        },
      },
    ],
    {
      wireSegments: [
        {
          start: { x: 100, y: 100 },
          end: { x: 220, y: 100 },
        },
      ],
      junctions: [],
      labels: [],
      sheetFrames: [],
      pageFrame: undefined,
    }
  );

  assert.deepEqual(bounds, {
    x: 100,
    y: 100,
    width: 120,
    height: 1,
  });
});

test('scene bounds include imported symbol primitives even when there are no wires', () => {
  const bounds = getImportedSchematicSceneBounds(
    [],
    {
      wireSegments: [],
      junctions: [],
      labels: [],
      sheetFrames: [],
      pageFrame: undefined,
      symbols: [
        {
          instanceId: 'symbol-u1',
          reference: 'U1',
          value: 'ATmega328P',
          primitives: [
            {
              kind: 'rect',
              start: { x: 480, y: 320 },
              end: { x: 640, y: 720 },
              fill: 'background',
            },
          ],
          pinAnchors: [
            {
              pinId: 'pd0',
              label: 'PD0',
              number: '2',
              at: { x: 640, y: 380 },
              angle: 0,
              lengthMm: 2.54,
            },
          ],
        },
      ],
    }
  );

  assert.deepEqual(bounds, {
    x: 480,
    y: 320,
    width: 174.1111111111111,
    height: 400,
  });
});

test('scene bounds include the page frame so original KiCad view can fit the full sheet', () => {
  const bounds = getImportedSchematicSceneBounds(
    [],
    {
      wireSegments: [
        {
          start: { x: 500, y: 300 },
          end: { x: 620, y: 300 },
        },
      ],
      junctions: [],
      labels: [],
      sheetFrames: [],
      pageFrame: {
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 1400 },
        paper: 'A4',
        titleBlock: undefined,
      },
    }
  );

  assert.deepEqual(bounds, {
    x: 0,
    y: 0,
    width: 2000,
    height: 1400,
  });
});

test('symbol-only imported scenes still count as renderable scene content', () => {
  assert.equal(
    hasImportedSchematicSceneContent({
      wireSegments: [],
      junctions: [],
      labels: [],
      sheetFrames: [],
      pageFrame: undefined,
      symbols: [
        {
          instanceId: 'symbol-u1',
          reference: 'U1',
          value: 'ATmega328P',
          primitives: [
            {
              kind: 'rect',
              start: { x: 100, y: 100 },
              end: { x: 200, y: 260 },
              fill: 'background',
            },
          ],
          pinAnchors: [],
        },
      ],
    }),
    true
  );
});

test('imported text display keeps labels upright while pin text stays readable', () => {
  assert.equal(getImportedTextDisplayAngle(90, 'pin-name'), 90);
  assert.equal(getImportedTextDisplayAngle(270, 'pin-number'), 90);
  assert.equal(getImportedTextDisplayAngle(180, 'reference'), 0);
  assert.equal(getImportedTextDisplayAngle(180, 'annotation'), 0);
  assert.equal(getImportedTextDisplayAngle(0, 'annotation'), 0);
  assert.equal(getImportedTextDisplayAngle(90, 'annotation'), 90);
  assert.equal(getImportedTextDisplayAngle(270, 'annotation'), 90);
  assert.equal(
    getImportedTextDisplayAngle(180, 'pin-name', { preserveNativeOrientation: true }),
    180
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'pin-name', { preserveNativeOrientation: true }),
    90
  );
  assert.equal(
    getImportedTextDisplayAngle(270, 'reference', { preserveNativeOrientation: true }),
    270
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'value', {
      preserveNativeOrientation: true,
      text: '0.1uF',
    }),
    90
  );
});

test('imported text display flattens long vertical labels while preserving short pin context', () => {
  assert.equal(
    getImportedTextDisplayAngle(90, 'value', { text: 'Crystal 16Mhz' }),
    0
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'annotation', { text: 'ADDR1' }),
    0
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'annotation', { text: 'VCC' }),
    0
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'value', { text: 'GNDPWR' }),
    0
  );
  assert.equal(
    getImportedTextDisplayAngle(90, 'pin-name', { text: 'ADDR1' }),
    90
  );
  assert.equal(
    shouldFlattenImportedTextForReadability({
      kind: 'text',
      at: { x: 0, y: 0 },
      text: 'Crystal 16Mhz',
      angle: 90,
      sizeMm: 1.27,
      role: 'value',
    }),
    true
  );
  assert.equal(
    shouldFlattenImportedTextForReadability({
      kind: 'text',
      at: { x: 0, y: 0 },
      text: '0.1uF',
      angle: 90,
      preserveNativeOrientation: true,
      sizeMm: 1.27,
      role: 'value',
    }),
    false
  );
  const readableOffset = getImportedReadableTextOffset({
      kind: 'text',
      at: { x: 0, y: 0 },
      text: 'Crystal 16Mhz',
      angle: 90,
      sizeMm: 1.27,
      role: 'value',
  }, 6);
  assert.equal(readableOffset.x, 0);
  assert.ok(readableOffset.y < -6.8 && readableOffset.y > -7);

  const powerOffset = getImportedReadableTextOffset({
    kind: 'text',
    at: { x: 0, y: 0 },
    text: 'VCC',
    angle: 90,
    sizeMm: 1.27,
    role: 'annotation',
  }, 6);
  assert.equal(powerOffset.x, 0);
  assert.equal(powerOffset.y, 0);
  assert.equal(isPowerLikeImportedText('+3V3'), true);
  assert.equal(isPowerLikeImportedText('ADDR1'), false);
});

test('imported pin label display reduces dense pin noise but keeps highlighted context readable', () => {
  assert.equal(
    getImportedPinLabelDisplay({
      label: 'GPIO0_BOOT_MODE',
      pinAnchorCount: 8,
      sideIndex: 0,
    }),
    'GPIO0_BOOT_MO…'
  );

  assert.equal(
    getImportedPinLabelDisplay({
      label: 'GPIO0_BOOT_MODE',
      pinAnchorCount: 18,
      sideIndex: 1,
    }),
    null
  );

  assert.equal(
    getImportedPinLabelDisplay({
      label: 'GPIO0_BOOT_MODE',
      pinAnchorCount: 18,
      sideIndex: 1,
      highlighted: true,
    }),
    'GPIO0_…'
  );

  assert.equal(
    getImportedPinLabelDisplay({
      label: 'MISO',
      pinAnchorCount: 28,
      sideIndex: 4,
    }),
    'MISO'
  );
});

test('imported text overview de-emphasizes dense pin metadata while keeping signal names readable', () => {
  const pinNumber: Extract<ImportedSchematicPrimitive, { kind: 'text' }> = {
    kind: 'text',
    at: { x: 0, y: 0 },
    text: '27',
    angle: 0,
    sizeMm: 1.27,
    role: 'pin-number',
  };
  const portName: Extract<ImportedSchematicPrimitive, { kind: 'text' }> = {
    kind: 'text',
    at: { x: 0, y: 0 },
    text: 'PB0',
    angle: 0,
    sizeMm: 1.27,
    role: 'pin-name',
  };
  const muxedPortName: Extract<ImportedSchematicPrimitive, { kind: 'text' }> = {
    kind: 'text',
    at: { x: 0, y: 0 },
    text: 'XTAL1/PB6',
    angle: 0,
    sizeMm: 1.27,
    role: 'pin-name',
  };
  const signalName: Extract<ImportedSchematicPrimitive, { kind: 'text' }> = {
    kind: 'text',
    at: { x: 0, y: 0 },
    text: 'MOSI',
    angle: 0,
    sizeMm: 1.27,
    role: 'pin-name',
  };

  assert.equal(isLowPriorityImportedPinText(pinNumber), true);
  assert.equal(isLowPriorityImportedPinText(portName), true);
  assert.equal(isLowPriorityImportedPinText(muxedPortName), true);
  assert.equal(isLowPriorityImportedPinText(signalName), false);
  assert.ok(getImportedTextOverviewOpacity(pinNumber) < 0.25);
  assert.ok(getImportedTextOverviewOpacity(signalName) > 0.6);
});

test('viewport bounds keep both imported wires and imported component bodies visible after reload', () => {
  const bounds = getImportedSchematicViewportBounds(
    [
      {
        instanceId: 'imported-u1',
        templateId: 'tpl_custom',
        name: 'Shifted box',
        position: { x: 4000, y: 3200 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedGeometry: {
          bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
          renderSource: 'primitive',
          primitives: [],
          pinAnchors: [],
        },
      },
    ],
    {
      wireSegments: [
        {
          start: { x: 100, y: 100 },
          end: { x: 220, y: 100 },
        },
      ],
      junctions: [],
      labels: [],
      sheetFrames: [],
      pageFrame: undefined,
    }
  );

  assert.deepEqual(bounds, {
    x: 0,
    y: 0,
    width: 4011.1111111111113,
    height: 3211.1111111111113,
  });
});

test('viewport bounds normalize scene-only imported overlays to the canvas origin', () => {
  const bounds = getImportedSchematicViewportBounds([], {
    wireSegments: [
      {
        start: { x: 800, y: 600 },
        end: { x: 980, y: 600 },
      },
    ],
    junctions: [],
    labels: [],
    sheetFrames: [],
    pageFrame: undefined,
  });

  assert.deepEqual(bounds, {
    x: 0,
    y: 0,
    width: 180,
    height: 1,
  });
});

test('viewport bounds prioritize active content over oversized sheet frames and scene drawings', () => {
  const bounds = getImportedSchematicViewportBounds([], {
    wireSegments: [
      {
        start: { x: 500, y: 320 },
        end: { x: 620, y: 320 },
      },
    ],
    junctions: [],
    labels: [],
    drawings: [
      {
        kind: 'rect',
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 1400 },
      },
    ],
    sheetFrames: [
      {
        start: { x: 420, y: 260 },
        end: { x: 1200, y: 960 },
        pins: [],
      },
    ],
    pageFrame: undefined,
  });

  assert.deepEqual(bounds, {
    x: 500,
    y: 320,
    width: 120,
    height: 1,
  });
});

test('viewport bounds prioritize primary symbol and wire geometry over distant explanatory text', () => {
  const bounds = getImportedSchematicViewportBounds([], {
    wireSegments: [
      {
        start: { x: 300, y: 200 },
        end: { x: 480, y: 200 },
      },
    ],
    junctions: [],
    labels: [],
    drawings: [],
    sheetFrames: [],
    symbols: [
      {
        instanceId: 'u1',
        libraryId: 'Custom:Block',
        reference: 'U1',
        value: 'Block',
        family: 'generic',
        primitives: [
          {
            kind: 'rect',
            start: { x: 320, y: 170 },
            end: { x: 380, y: 230 },
          },
          {
            kind: 'text',
            at: { x: 1200, y: 900 },
            text: 'Long explanatory note',
            angle: 0,
            sizeMm: 1.27,
            role: 'annotation',
          },
        ],
        pinAnchors: [],
      },
    ],
    pageFrame: undefined,
  });

  assert.deepEqual(bounds, {
    x: 0,
    y: 0,
    width: 180,
    height: 60,
  });
});

test('viewport bounds can prefer the dominant imported component cluster on first review load', () => {
  const bounds = getImportedSchematicViewportBounds(
    [
      {
        instanceId: 'u1',
        templateId: 'tpl_custom',
        name: 'Cluster A1',
        position: { x: 100, y: 100 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedGeometry: {
          bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
          renderSource: 'primitive',
          primitives: [],
          pinAnchors: [],
        },
      },
      {
        instanceId: 'u2',
        templateId: 'tpl_custom',
        name: 'Cluster A2',
        position: { x: 220, y: 120 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedGeometry: {
          bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
          renderSource: 'primitive',
          primitives: [],
          pinAnchors: [],
        },
      },
      {
        instanceId: 'u3',
        templateId: 'tpl_custom',
        name: 'Isolated B',
        position: { x: 1200, y: 900 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedGeometry: {
          bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
          renderSource: 'primitive',
          primitives: [],
          pinAnchors: [],
        },
      },
    ],
    null
  );

  assert.deepEqual(bounds, {
    x: 4,
    y: 4,
    width: 423.1111111111111,
    height: 323.1111111111111,
  });
});

test('review viewport bounds prefer active imported content over full reloaded hitbox spread', () => {
  const components: PlacedComponent[] = [
    {
      instanceId: 'imported-u1',
      templateId: 'tpl_custom',
      name: 'Shifted box',
      position: { x: 4000, y: 3200 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedGeometry: {
        bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        renderSource: 'primitive' as const,
        primitives: [],
        pinAnchors: [],
      },
    },
  ];

  const scene: ImportedSchematicScene = {
    wireSegments: [
      {
        start: { x: 100, y: 100 },
        end: { x: 220, y: 100 },
      },
    ],
    junctions: [],
    labels: [],
    sheetFrames: [],
    pageFrame: undefined,
  };

  assert.deepEqual(getImportedSchematicReviewViewportBounds(components, scene), {
    x: 0,
    y: 0,
    width: 120,
    height: 1,
  });

  assert.deepEqual(getImportedSchematicViewportBounds(components, scene), {
    x: 0,
    y: 0,
    width: 4011.1111111111113,
    height: 3211.1111111111113,
  });
});

test('review viewport bounds can prefer the dominant native symbol cluster over sparse imported islands', () => {
  const components: PlacedComponent[] = [
    {
      instanceId: 'left-u1',
      templateId: 'tpl_custom',
      name: 'Left island',
      position: { x: 80, y: 120 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedGeometry: {
        bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        renderSource: 'primitive' as const,
        primitives: [],
        pinAnchors: [],
      },
    },
    {
      instanceId: 'right-u2',
      templateId: 'tpl_custom',
      name: 'Main island',
      position: { x: 760, y: 60 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedGeometry: {
        bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        renderSource: 'primitive' as const,
        primitives: [],
        pinAnchors: [],
      },
    },
    {
      instanceId: 'right-u3',
      templateId: 'tpl_custom',
      name: 'Main island 2',
      position: { x: 900, y: 260 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedGeometry: {
        bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        renderSource: 'primitive' as const,
        primitives: [],
        pinAnchors: [],
      },
    },
  ];

  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [],
    sheetFrames: [],
    pageFrame: undefined,
    symbols: [
      sceneSymbol('u1', 'U1', 'Left island', [
        { kind: 'rect', start: { x: 80, y: 120 }, end: { x: 140, y: 180 }, strokeWidth: 1 },
      ]),
      sceneSymbol('u2', 'U2', 'Main island', [
        { kind: 'rect', start: { x: 760, y: 60 }, end: { x: 940, y: 220 }, strokeWidth: 1 },
      ]),
      sceneSymbol('u3', 'U3', 'Main island 2', [
        { kind: 'rect', start: { x: 900, y: 260 }, end: { x: 1040, y: 380 }, strokeWidth: 1 },
      ]),
    ],
    drawings: [],
  };

  assert.deepEqual(getImportedSchematicReviewViewportBounds(components, scene), {
    x: 608,
    y: 0,
    width: 424,
    height: 464,
  });
});

test('display sheet frames preserve raw imported boxes', () => {
  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [],
    drawings: [],
    pageFrame: undefined,
    sheetFrames: [
      {
        start: { x: 0, y: 0 },
        end: { x: 600, y: 420 },
        name: 'connectors1',
        file: 'connectors1.sch',
        pins: [
          {
            text: 'MISO',
            at: { x: 600, y: 140 },
            angle: 0,
          },
        ],
      },
    ],
    symbols: [
      sceneSymbol('j1', 'J1', 'Conn_01x20', [
        { kind: 'rect', start: { x: 180, y: 120 }, end: { x: 320, y: 300 }, strokeWidth: 1 },
      ]),
    ],
  };

  const [frame] = getImportedSchematicDisplaySheetFrames(scene);
  assert.ok(frame, 'expected imported display sheet frame');
  assert.deepEqual(frame.start, { x: 0, y: 0 });
  assert.deepEqual(frame.end, { x: 600, y: 420 });
});

test('display sheet frames keep KiCad placeholder width and height', () => {
  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [],
    drawings: [],
    pageFrame: undefined,
    sheetFrames: [
      {
        start: { x: 200, y: 100 },
        end: { x: 420, y: 320 },
        name: 'connectors1',
        file: 'connectors1.sch',
        pins: [
          { text: 'SCL', at: { x: 200, y: 150 }, angle: 180 },
          { text: 'SDA', at: { x: 420, y: 170 }, angle: 0 },
          { text: 'VCC', at: { x: 200, y: 210 }, angle: 180 },
          { text: 'GND', at: { x: 200, y: 250 }, angle: 180 },
        ],
      },
    ],
    symbols: [],
  };

  const [frame] = getImportedSchematicDisplaySheetFrames(scene);
  assert.ok(frame, 'expected display sheet frame');
  assert.equal(frame.start.x, 200);
  assert.equal(frame.end.x, 420);
  assert.equal(frame.start.y, 100);
  assert.equal(frame.end.y, 320);
});

test('hierarchical sheet descriptors classify sheet frames as document structure', () => {
  const descriptor = describeImportedSheetFrame({
    start: { x: 120, y: 80 },
    end: { x: 160, y: 110 },
    name: 'connectors1',
    file: 'connectors1.sch',
    pins: [
      { text: 'SCK', at: { x: 120, y: 90 }, angle: 180 },
      { text: 'VCC', at: { x: 160, y: 95 }, angle: 0 },
    ],
  });

  assert.equal(descriptor.kind, 'hierarchical-sheet');
  assert.equal(descriptor.title, 'connectors1');
  assert.equal(descriptor.subtitle, 'connectors1.sch');
  assert.equal(descriptor.pinCount, 2);
  assert.deepEqual(descriptor.bounds, {
    x: 120,
    y: 80,
    width: 40,
    height: 30,
  });
});

test('imported scene structure helpers collect hierarchical sheet descriptors', () => {
  const descriptors = getImportedHierarchicalSheetDescriptors({
    wireSegments: [],
    junctions: [],
    labels: [],
    sheetFrames: [
      {
        start: { x: 40, y: 30 },
        end: { x: 90, y: 70 },
        name: 'power',
        file: 'power.sch',
        pins: [{ text: 'VIN', at: { x: 40, y: 50 }, angle: 180 }],
      },
    ],
  });

  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0]?.kind, 'hierarchical-sheet');
  assert.equal(descriptors[0]?.title, 'power');
  assert.equal(descriptors[0]?.subtitle, 'power.sch');
});

test('display dashed drawing frames preserve raw polyline primitives', () => {
  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [],
    pageFrame: undefined,
    sheetFrames: [],
    drawings: [
      { kind: 'polyline', points: [{ x: 100, y: 80 }, { x: 360, y: 80 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 100, y: 360 }, { x: 360, y: 360 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 100, y: 80 }, { x: 100, y: 360 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 360, y: 80 }, { x: 360, y: 360 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 280, y: 250 }, { x: 500, y: 250 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 280, y: 520 }, { x: 500, y: 520 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 280, y: 250 }, { x: 280, y: 520 }], strokeStyle: 'dash' as const },
      { kind: 'polyline', points: [{ x: 500, y: 250 }, { x: 500, y: 520 }], strokeStyle: 'dash' as const },
    ],
    symbols: [
      sceneSymbol('u1', 'U1', 'Controller', [
        { kind: 'rect' as const, start: { x: 150, y: 140 }, end: { x: 250, y: 240 }, strokeWidth: 1 },
      ]),
      sceneSymbol('j1', 'J1', 'Connector', [
        { kind: 'rect' as const, start: { x: 320, y: 300 }, end: { x: 380, y: 410 }, strokeWidth: 1 },
      ]),
    ],
  };

  const drawings = getImportedSchematicDisplayDrawings(scene);
  assert.equal(drawings.length, 8);
  assert.equal(drawings.every(primitive => primitive.kind === 'polyline'), true);
});

test('display dashed drawing frames and sheet frames preserve raw imported positions', () => {
  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [],
    pageFrame: null,
    symbols: [
      sceneSymbol('u1', 'U1', 'MCU', [
        { kind: 'rect' as const, start: { x: 180, y: 120 }, end: { x: 280, y: 260 }, strokeWidth: 1 },
      ]),
      sceneSymbol('j1', 'J1', 'Connector', [
        { kind: 'rect' as const, start: { x: 240, y: 210 }, end: { x: 330, y: 360 }, strokeWidth: 1 },
      ]),
    ],
    drawings: [
      { kind: 'polyline' as const, points: [{ x: 140, y: 90 }, { x: 320, y: 90 }], strokeStyle: 'dash' as const, strokeWidth: 1 },
      { kind: 'polyline' as const, points: [{ x: 140, y: 300 }, { x: 320, y: 300 }], strokeStyle: 'dash' as const, strokeWidth: 1 },
      { kind: 'polyline' as const, points: [{ x: 140, y: 90 }, { x: 140, y: 300 }], strokeStyle: 'dash' as const, strokeWidth: 1 },
      { kind: 'polyline' as const, points: [{ x: 320, y: 90 }, { x: 320, y: 300 }], strokeStyle: 'dash' as const, strokeWidth: 1 },
    ],
    sheetFrames: [
      {
        start: { x: 220, y: 180 },
        end: { x: 420, y: 390 },
        name: 'connectors1',
        pins: [],
      },
    ],
  };

  const [drawingTop] = getImportedSchematicDisplayDrawings(scene).filter(
    primitive => primitive.kind === 'polyline' && primitive.strokeStyle === 'dash'
  ) as Array<Extract<ImportedSchematicPrimitive, { kind: 'polyline' }>>;
  const [sheetFrame] = getImportedSchematicDisplaySheetFrames(scene);

  assert.ok(drawingTop);
  assert.ok(sheetFrame);
  assert.deepEqual(drawingTop.points, [{ x: 140, y: 90 }, { x: 320, y: 90 }]);
  assert.deepEqual(sheetFrame.start, { x: 220, y: 180 });
  assert.deepEqual(sheetFrame.end, { x: 420, y: 390 });
});

test('display page frame preserves the imported raw page size', () => {
  const scene: ImportedSchematicScene = {
    wireSegments: [],
    junctions: [],
    labels: [
      {
        text: '6 channel high / low side driver',
        at: { x: 540, y: 120 },
      },
    ],
    drawings: [],
    pageFrame: {
      start: { x: 0, y: 0 },
      end: { x: 2400, y: 1800 },
      paper: 'B',
      titleBlock: {
        title: 'microRusEFI-2L',
        date: '2026-06-24',
        rev: 'R0.5.2',
        comments: [],
      },
    },
    sheetFrames: [],
    symbols: [
      sceneSymbol('u31', 'U31', 'MIC4427', [
        { kind: 'rect', start: { x: 480, y: 260 }, end: { x: 740, y: 760 }, strokeWidth: 1 },
      ]),
    ],
  };

  const frame = getImportedSchematicDisplayPageFrame(scene);
  assert.ok(frame, 'expected imported display page frame');
  if (!frame) {
    return;
  }
  assert.deepEqual(frame.start, { x: 0, y: 0 });
  assert.deepEqual(frame.end, { x: 2400, y: 1800 });
});

test('KiCad ANSI B paper size is preserved for imported page frames', async () => {
  const { importKiCadSchematic } = await import('@/lib/kicad-sch-parser');
  const fs = await import('node:fs');
  const source = fs.readFileSync('/Users/gimdong-il/Downloads/KICAD-main/L9779WD-breakout_adc.kicad_sch', 'utf8');
  const result = importKiCadSchematic(source, { projectName: 'L9779WD-breakout_adc' });
  const rawPage = result.document.importedSchematicScene?.pageFrame;

  assert.ok(rawPage);
  assert.equal(rawPage?.paper, 'B');
  assert.equal(rawPage?.end.x, Number((431.8 * IMPORTED_MM_TO_CANVAS).toFixed(3)));
  assert.equal(rawPage?.end.y, Number((279.4 * IMPORTED_MM_TO_CANVAS).toFixed(3)));
});

test('imported text display preserves sensible anchors and baselines for source labels', () => {
  assert.equal(getImportedTextDisplayAnchor(180, 'pin-name'), 'end');
  assert.equal(getImportedTextDisplayAnchor(0, 'pin-number'), 'end');
  assert.equal(getImportedTextDisplayAnchor(90, 'reference'), 'start');
  assert.equal(getImportedTextDisplayBaseline(270, 'pin-number'), 'hanging');
  assert.equal(getImportedTextDisplayBaseline(90, 'pin-name'), 'ideographic');
  assert.equal(getImportedTextDisplayBaseline(180, 'value'), 'middle');
  assert.equal(getImportedTextDisplayBaseline(90, 'value'), 'ideographic');
});

test('imported net labels preserve KiCad VCC and GND source anchors', () => {
  assert.equal(classifyImportedNetLabel('VCC'), 'power');
  assert.equal(classifyImportedNetLabel('VDD'), 'power');
  assert.equal(classifyImportedNetLabel('PWR_FLAG'), 'power');
  assert.equal(classifyImportedNetLabel('GND'), 'ground');
  assert.equal(classifyImportedNetLabel('DATA'), 'signal');

  const verticalVcc = getImportedNetLabelDisplay({
    text: 'VCC',
    at: { x: 100, y: 200 },
    angle: 90,
    textAnchor: 'start',
    baseline: 'ideographic',
  });
  assert.equal(verticalVcc.angle, 90);
  assert.equal(verticalVcc.textAnchor, 'start');
  assert.equal(verticalVcc.baseline, 'ideographic');
  assert.equal(verticalVcc.background, true);
  assert.equal(verticalVcc.x, 100);
  assert.equal(verticalVcc.y, 200);

  const crowdedLeftVcc = getImportedNetLabelDisplay({
    text: 'VCC',
    at: { x: 100, y: 200 },
    angle: 90,
    side: 'left',
  });
  assert.equal(crowdedLeftVcc.textAnchor, 'start');
  assert.equal(crowdedLeftVcc.x, 100);

  const horizontalGnd = getImportedNetLabelDisplay({
    text: 'GND',
    at: { x: 120, y: 240 },
    angle: 0,
  });
  assert.equal(horizontalGnd.angle, 0);
  assert.equal(horizontalGnd.textAnchor, 'start');
  assert.equal(horizontalGnd.baseline, 'middle');
  assert.equal(horizontalGnd.y, 240);

  const verticalSignal = getImportedNetLabelDisplay({
    text: 'SDA',
    at: { x: 10, y: 20 },
    angle: 90,
    textAnchor: 'start',
    baseline: 'ideographic',
  });
  assert.equal(verticalSignal.angle, 90);
  assert.equal(verticalSignal.textAnchor, 'start');
  assert.equal(verticalSignal.baseline, 'ideographic');
  assert.equal(verticalSignal.background, false);
});

test('imported review suppresses noisy annotation and pin-number text for reviewed primitives', () => {
  const mcu = primitiveRenderData({
    templateId: 'kicad_atmega328p',
    componentName: 'ATmega328P-PU',
    value: 'ATmega328P-PU',
    importedReference: 'U1',
  });

  assert.equal(
    shouldRenderImportedPrimitive(mcu, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: 'internal note',
      angle: 90,
      sizeMm: 1.27,
      role: 'annotation',
    }),
    true
  );

  assert.equal(
    shouldRenderImportedPrimitive(mcu, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: '27',
      angle: 0,
      sizeMm: 1.27,
      role: 'pin-number',
    }),
    true
  );

  assert.equal(
    shouldRenderImportedPrimitive(mcu, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: 'GPIO17',
      angle: 0,
      sizeMm: 1.27,
      role: 'pin-name',
    }),
    true
  );
});

test('imported review keeps connector annotations when original KiCad primitives exist', () => {
  const connector = primitiveRenderData({
    templateId: 'kicad_raspberry_pi_header',
    componentName: 'Raspberry_Pi_2_3',
    value: 'Raspberry_Pi_2_3',
    importedReference: 'J1',
  });

  assert.equal(
    shouldRenderImportedPrimitive(connector, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: 'MOSI',
      angle: 0,
      sizeMm: 1.27,
      role: 'annotation',
    }),
    true
  );
});

test('imported review keeps connector pin numbers when original KiCad primitives exist', () => {
  const connector = primitiveRenderData({
    templateId: 'kicad_raspberry_pi_header',
    componentName: 'Raspberry_Pi_2_3',
    value: 'Raspberry_Pi_2_3',
    importedReference: 'J1',
  });

  assert.equal(
    shouldRenderImportedPrimitive(connector, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: '1',
      angle: 0,
      sizeMm: 1.27,
      role: 'pin-number',
    }),
    true
  );
});

test('imported review keeps generic fallback pin numbers when they are the only readable cue', () => {
  const generic = primitiveRenderData({
    templateId: 'tpl_custom_sensor',
    componentName: 'Custom device',
    value: 'Module',
  });

  assert.equal(
    shouldRenderImportedPrimitive(generic, {
      kind: 'text',
      at: { x: 0, y: 0 },
      text: '1',
      angle: 0,
      sizeMm: 1.27,
      role: 'pin-number',
    }),
    true
  );
});

test('normalizeImportedGeometryForRender keeps original text for sensor-like imported symbols', () => {
  const geometry = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -3, minY: -4, maxX: 3, maxY: 4 },
        renderSource: 'primitive',
        primitives: [
          { kind: 'text', at: { x: -2, y: 0 }, text: 'DATA', angle: 0, sizeMm: 1.27, role: 'pin-name' },
          { kind: 'text', at: { x: 2, y: 0 }, text: '2', angle: 0, sizeMm: 1.27, role: 'pin-number' },
          { kind: 'text', at: { x: 0, y: -5 }, text: 'VDD', angle: 0, sizeMm: 1.27, role: 'annotation' },
          { kind: 'text', at: { x: 0, y: 6 }, text: 'DHT22', angle: 0, sizeMm: 1.27, role: 'value' },
          { kind: 'rect', start: { x: -3, y: -4 }, end: { x: 3, y: 4 } },
        ],
        pinAnchors: [
          { pinId: 'p1', label: 'VDD', number: '1', at: { x: 0, y: -5 }, angle: 90, lengthMm: 2.54 },
          { pinId: 'p2', label: 'DATA', number: '2', at: { x: 5, y: 0 }, angle: 180, lengthMm: 2.54 },
        ],
      },
    })
  );

  assert.ok(geometry);
  assert.deepEqual(
    geometry.primitives
      .filter(primitive => primitive.kind === 'text')
      .map(primitive => primitive.text),
    ['DATA', '2', 'VDD', 'DHT22']
  );
});

test('normalizeImportedGeometryForRender rebuilds visible body and pin stems for legacy geometry without shape primitives', () => {
  const geometry = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -2, minY: -3, maxX: 2, maxY: 3 },
        renderSource: 'primitive',
        primitives: [
          { kind: 'text', at: { x: 0, y: 0 }, text: 'DATA', angle: 0, sizeMm: 1.27, role: 'pin-name' },
        ],
        pinAnchors: [
          { pinId: 'p1', label: 'DATA', number: '2', at: { x: 4, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: 'p2', label: 'VDD', number: '1', at: { x: 0, y: -4 }, angle: 90, lengthMm: 2.54 },
          { pinId: 'p3', label: 'GND', number: '4', at: { x: 0, y: 4 }, angle: 270, lengthMm: 2.54 },
        ],
      },
    })
  );

  assert.ok(geometry);
  assert.equal(geometry.primitives.some(primitive => primitive.kind === 'rect'), true);
  assert.equal(
    geometry.primitives.filter(primitive => primitive.kind === 'polyline').length,
    3
  );
});

test('normalizeImportedGeometryForRender falls back to stored bounds when a legacy quiet symbol lost both body primitives and pin anchors', () => {
  const geometry = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -5.08, maxX: 5.08, maxY: 5.08 },
        renderSource: 'primitive',
        primitives: [
          { kind: 'text', at: { x: 0, y: 0 }, text: 'DATA', angle: 0, sizeMm: 1.27, role: 'pin-name' },
        ],
        pinAnchors: [],
      },
    })
  );

  assert.ok(geometry);
  const rects = geometry.primitives.filter(primitive => primitive.kind === 'rect');
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], {
    kind: 'rect',
    start: { x: -5.08, y: -5.08 },
    end: { x: 5.08, y: 5.08 },
  });
});

test('layoutImportedGeometry can preserve stored imported bounds so legacy repair primitives do not shift wire anchors', () => {
  const normalized = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -5.08, minY: -5.08, maxX: 5.08, maxY: 5.08 },
        renderSource: 'primitive',
        primitives: [],
        pinAnchors: [
          { pinId: 'p1', label: 'DATA', number: '2', at: { x: 7.62, y: 0 }, angle: 180, lengthMm: 2.54 },
        ],
      },
    })
  );

  assert.ok(normalized);
  const defaultLayout = layoutImportedGeometry(normalized, 0);
  const preservedLayout = layoutImportedGeometry(normalized, 0, undefined, { preserveStoredBounds: true });
  const expectedX = (7.62 - (-5.08)) * IMPORTED_MM_TO_CANVAS;

  assert.notEqual(Math.round(defaultLayout.pinAnchors[0]!.at.x), Math.round(expectedX));
  assert.equal(Math.round(preservedLayout.pinAnchors[0]!.at.x), Math.round(expectedX));
});

test('getImportedSchematicSceneBounds keeps stored imported bounds for legacy quiet symbols', () => {
  const sceneBounds = getImportedSchematicSceneBounds(
    [{
      instanceId: 'legacy-u1',
      templateId: 'tpl_dht22',
      name: 'DHT22',
      position: { x: 120, y: 80 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
      importedGeometry: {
        bounds: { minX: -8, minY: -4, maxX: 12, maxY: 6 },
        renderSource: 'primitive',
        primitives: [
          {
            kind: 'text',
            at: { x: 120, y: 20 },
            text: 'repair label',
            angle: 0,
            sizeMm: 1.27,
          },
        ],
        pinAnchors: [],
      },
    }],
    null
  );

  assert.ok(sceneBounds);
  assert.equal(sceneBounds?.x, 120);
  assert.equal(sceneBounds?.y, 80);
  assert.ok(Math.abs((sceneBounds?.width ?? 0) - 20 * IMPORTED_MM_TO_CANVAS) < 1e-6);
  assert.ok(Math.abs((sceneBounds?.height ?? 0) - 10 * IMPORTED_MM_TO_CANVAS) < 1e-6);
});

test('normalizeImportedGeometryForRender backfills missing pin stems for quiet primitive symbols that only kept a body shape', () => {
  const geometry = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'tpl_dht22',
      componentName: 'DHT22',
      value: 'DHT22',
      importedReference: 'U1',
      importedGeometry: {
        bounds: { minX: -4, minY: -4, maxX: 4, maxY: 4 },
        renderSource: 'primitive',
        primitives: [
          { kind: 'rect', start: { x: -4, y: -4 }, end: { x: 4, y: 4 } },
        ],
        pinAnchors: [
          { pinId: 'p1', label: 'DATA', number: '2', at: { x: 6, y: 0 }, angle: 180, lengthMm: 2.54 },
          { pinId: 'p2', label: 'VDD', number: '1', at: { x: 0, y: -6 }, angle: 90, lengthMm: 2.54 },
        ],
      },
    })
  );

  assert.ok(geometry);
  assert.equal(
    geometry.primitives.filter(primitive => primitive.kind === 'polyline').length,
    2
  );
});

test('normalizeImportedGeometryForRender does not inject extra pin stems into primitive-backed connector symbols', () => {
  const geometry = normalizeImportedGeometryForRender(
    primitiveRenderData({
      templateId: 'kicad_raspberry_pi_header',
      componentName: 'Raspberry_Pi_2_3',
      value: 'Raspberry_Pi_2_3',
      importedReference: 'J1',
      importedGeometry: {
        bounds: { minX: -4, minY: -4, maxX: 4, maxY: 4 },
        renderSource: 'primitive',
        primitives: [
          { kind: 'rect', start: { x: -4, y: -4 }, end: { x: 4, y: 4 } },
        ],
        pinAnchors: [
          { pinId: 'p1', label: 'MOSI', number: '1', at: { x: 6, y: 0 }, angle: 180, lengthMm: 2.54 },
        ],
      },
    })
  );

  assert.ok(geometry);
  assert.equal(
    geometry.primitives.filter(primitive => primitive.kind === 'polyline').length,
    0
  );
});

test('resolveImportedOverlayVisibility keeps quiet primitive overlays hidden until needed', () => {
  assert.deepEqual(
    resolveImportedOverlayVisibility({
      usesFallbackGraphics: false,
      quietOverlayMode: true,
      hasNativeText: false,
      selected: false,
      hovered: true,
      isHighlighted: false,
      wiringMode: 'auto',
    }),
    {
      showPinLabels: false,
      showFallbackLabels: false,
      showInteractionOutline: false,
    }
  );

  assert.deepEqual(
    resolveImportedOverlayVisibility({
      usesFallbackGraphics: false,
      quietOverlayMode: true,
      hasNativeText: false,
      selected: false,
      hovered: false,
      isHighlighted: false,
      wiringMode: 'manual',
    }),
    {
      showPinLabels: true,
      showFallbackLabels: false,
      showInteractionOutline: false,
    }
  );

  assert.deepEqual(
    resolveImportedOverlayVisibility({
      usesFallbackGraphics: false,
      quietOverlayMode: false,
      hasNativeText: true,
      preferNativeLabels: true,
      selected: false,
      hovered: true,
      isHighlighted: false,
      wiringMode: 'auto',
    }),
    {
      showPinLabels: false,
      showFallbackLabels: false,
      showInteractionOutline: false,
    }
  );
});

test('resolveImportedOverlayVisibility only shows chrome for primitive symbols when selected or highlighted', () => {
  assert.deepEqual(
    resolveImportedOverlayVisibility({
      usesFallbackGraphics: false,
      quietOverlayMode: false,
      hasNativeText: true,
      preferNativeLabels: true,
      selected: true,
      hovered: false,
      isHighlighted: false,
      wiringMode: 'auto',
    }),
    {
      showPinLabels: true,
      showFallbackLabels: false,
      showInteractionOutline: true,
    }
  );

  assert.deepEqual(
    resolveImportedOverlayVisibility({
      usesFallbackGraphics: true,
      quietOverlayMode: false,
      hasNativeText: false,
      selected: false,
      hovered: true,
      isHighlighted: false,
      wiringMode: 'auto',
    }),
    {
      showPinLabels: true,
      showFallbackLabels: true,
      showInteractionOutline: true,
    }
  );
});
