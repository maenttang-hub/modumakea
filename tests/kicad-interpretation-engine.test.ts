import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createLlmHypothesisProviderFromEnv,
  adaptKiCadSourceToInterpretationParsed,
  createStubLlmHypothesisProvider,
  createStubVisionAdapter,
  createVisionAdapterFromEnv,
  defaultCoarseRegionsFromParsed,
  generateGatedLlmHypotheses,
  matchRegionsByGeometry,
  matchRegionsByPattern,
  normalizeCoarseRegions,
  normalizeFineRegion,
  resolveHierarchyForParsedSchematic,
  resolveInterpretationRules,
  runInterpretationDeterministicPipeline,
  shouldCallLlmHypothesis,
} from '@/lib/kicad-interpretation';
import { buildCoordMap, renderCroppedSvgArtifacts } from '@/lib/kicad-interpretation/renderer';
import { buildCoordValidationReport, mmToPx, pxToMm } from '@/lib/kicad-interpretation/calibration';

test('interpretation parser adapter keeps page settings and sheet metadata', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper A4 portrait)
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (sheet
    (at 100 40)
    (size 40 20)
    (property "Sheet name" "connectors1" (id 0) (at 100 38 0))
    (property "Sheet file" "connectors1.sch" (id 1) (at 100 62 0))
    (pin "MOSI" input (at 100 45 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 40 30 0)
    (uuid "res-1")
    (property "Reference" "R1" (id 0) (at 40 26 0))
    (property "Value" "10k" (id 1) (at 40 34 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const parsed = adaptKiCadSourceToInterpretationParsed(schematic, 'sample.kicad_sch');

  assert.equal(parsed.page_settings?.paper, 'A4');
  assert.equal(parsed.page_settings?.orientation, 'portrait');
  assert.equal(parsed.sheets.length, 1);
  assert.equal(parsed.sheets[0]?.sheet_file, 'connectors1.sch');
  assert.equal(parsed.sheets[0]?.sheet_pins[0]?.name, 'MOSI');
  assert.equal(parsed.rects.length, 0);
});

test('coord map conversion round-trips between mm and px', () => {
  const coordMap = buildCoordMap({
    imageSizePx: [2339, 1654],
    sheetSizeMm: [297, 210],
  });

  const px = mmToPx(42, 35, coordMap);
  const mm = pxToMm(px[0], px[1], coordMap);

  assert.ok(Math.abs(mm[0] - 42) < 0.001);
  assert.ok(Math.abs(mm[1] - 35) < 0.001);
});

test('coord validation report classifies pass and warn correctly', () => {
  const coordMap = buildCoordMap({
    imageSizePx: [2970, 2100],
    sheetSizeMm: [297, 210],
  });

  const passReport = buildCoordValidationReport({
    anchors: [
      {
        parser_mm: [10, 10],
        observed_px: mmToPx(10.4, 10.2, coordMap),
      },
    ],
    coordMap,
    thresholds: {
      max_error_mm_warn: 1.0,
      max_error_mm_block: 2.5,
    },
    thresholdsVersion: 'test',
  });

  assert.equal(passReport.status, 'pass');

  const warnReport = buildCoordValidationReport({
    anchors: [
      {
        parser_mm: [10, 10],
        observed_px: mmToPx(11.4, 10, coordMap),
      },
    ],
    coordMap,
    thresholds: {
      max_error_mm_warn: 1.0,
      max_error_mm_block: 2.5,
    },
    thresholdsVersion: 'test',
  });

  assert.equal(warnReport.status, 'warn');
});

test('renderCroppedSvgArtifacts writes cropped svg with viewBox narrowed to region', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'modumake-interpret-crop-'));
  const fullSvgPath = join(tempDir, 'full.svg');
  const fullSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800"><rect x="0" y="0" width="1000" height="800" fill="white"/></svg>';
  await writeFile(fullSvgPath, fullSvg, 'utf8');

  const artifacts = await renderCroppedSvgArtifacts({
    regionId: 'r1',
    fullSvgPath,
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
      image_size_px: [1000, 800],
      sheet_size_mm: [100, 80],
    },
    cropBBoxMm: [10, 10, 30, 25],
    outputDirectory: tempDir,
  });

  const cropped = await readFile(artifacts.cropSvgPath, 'utf8');
  assert.match(cropped, /viewBox="100 100 200 150"/);
});

test('deterministic matcher finds sheet geometry and SPI-like pattern', () => {
  const parsed = {
    schematic_file: 'sample.kicad_sch',
    source_model: {} as never,
    symbols: [],
    nets: [],
    wires: [],
    labels: [],
    rects: [],
    sheets: [
      {
        id: 'sheet_1',
        sheet_name: 'connectors1',
        sheet_file: 'connectors1.sch',
        bbox_mm: [100, 40, 140, 60] as const,
        sheet_pins: [
          { name: 'MISO', position_mm: [100, 42] as const },
          { name: 'MOSI', position_mm: [100, 45] as const },
          { name: 'SCK', position_mm: [100, 48] as const },
          { name: 'RESET', position_mm: [100, 51] as const },
          { name: 'GND', position_mm: [100, 54] as const },
        ],
        nearby_labels: [{ text: 'connectors1', distance_mm: 1.2 }],
      },
    ],
    cross_sheet_links: [],
  };

  const coordMap = {
    scale_px_per_mm: 10,
    origin_offset_px: [0, 0] as const,
    image_size_px: [2000, 1200] as const,
    sheet_size_mm: [200, 120] as const,
  };

  const regions = [
    {
      region_id: 'r1',
      bbox_px: [1000, 400, 1400, 600] as const,
      observed_shape_tags: ['sheet_box'],
      ocr_like_texts: [],
      visual_density: 'medium' as const,
    },
  ];

  const geometryMatches = matchRegionsByGeometry({
    parsed,
    regions,
    coordMap,
    minIouForMatch: 0.5,
  });

  assert.equal(geometryMatches[0]?.matched_entity_type, 'sheet');
  assert.equal(geometryMatches[0]?.matched_entity_id, 'sheet_1');

  const patternMatches = matchRegionsByPattern({
    parsed,
    regions,
    geometryMatches,
  });

  assert.equal(patternMatches[0]?.pattern_candidates[0]?.pattern_name, 'SPI_ISP_HEADER');
  assert.ok((patternMatches[0]?.pattern_candidates[0]?.score ?? 0) >= 0.8);
});

test('vision adapter normalizers keep contract shape stable', async () => {
  const coarse = normalizeCoarseRegions([
    {
      region_id: 'r1',
      bbox_px: [1.2, 2.7, 99.3, 100.8] as unknown as [number, number, number, number],
      observed_shape_tags: [' boxed_region ', 'boxed_region'],
      ocr_like_texts: [' U2 ', 'U2'],
      visual_density: 'high',
    },
  ]);
  const fine = normalizeFineRegion({
    region_id: 'r1',
    visible_texts: [' MISO ', 'MISO'],
    observed_shape_tags: ['sheet_box'],
    confidence_hint: 'medium',
  });
  const stub = createStubVisionAdapter();
  const stubFine = await stub.analyzeFine({
    stage: 'fine',
    imagePath: '/tmp/none.png',
    regionId: 'r-fallback',
  });

  assert.deepEqual(coarse[0]?.bbox_px, [1, 3, 99, 101]);
  assert.deepEqual(coarse[0]?.ocr_like_texts, ['U2']);
  assert.deepEqual(fine.visible_texts, ['MISO']);
  assert.equal(stubFine.region_id, 'r-fallback');
});

test('symbol clustering fallback creates coarse regions without sheets or rectangles', () => {
  const parsed = {
    schematic_file: 'cluster-sample.kicad_sch',
    source_model: {} as never,
    page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
    symbols: [
      {
        id: 'u1',
        reference: 'U1',
        value: 'NE555',
        lib_id: 'Timer:NE555',
        position_mm: [60, 60] as const,
        rotation_deg: 0 as const,
        mirror: false as const,
        bbox_mm: [52, 52, 68, 68] as const,
        pins: [{ number: '1', name: 'GND', position_mm: [52, 60] as const }],
      },
      {
        id: 'r1',
        reference: 'R1',
        value: '10k',
        lib_id: 'Device:R',
        position_mm: [82, 60] as const,
        rotation_deg: 0 as const,
        mirror: false as const,
        bbox_mm: [80, 58, 84, 62] as const,
        pins: [{ number: '1', name: '1', position_mm: [80, 60] as const }],
      },
      {
        id: 'pwr1',
        reference: '#PWR01',
        value: 'GND',
        lib_id: 'power:GND',
        position_mm: [60, 80] as const,
        rotation_deg: 0 as const,
        mirror: false as const,
        bbox_mm: [60, 80, 60, 80] as const,
        pins: [{ number: '1', name: 'GND', position_mm: [60, 80] as const }],
      },
    ],
    nets: [
      {
        name: 'net-1',
        connected_pins: [
          ['U1', '1'],
          ['R1', '1'],
          ['#PWR01', '1'],
        ] as const,
      },
    ],
    wires: [],
    labels: [],
    rects: [],
    sheets: [],
    cross_sheet_links: [],
  };

  const regions = defaultCoarseRegionsFromParsed(parsed, {
    scale_px_per_mm: 10,
    origin_offset_px: [0, 0] as const,
    image_size_px: [2970, 2100] as const,
    sheet_size_mm: [297, 210] as const,
  });

  assert.equal(regions.length, 1);
  assert.match(regions[0]!.region_id, /^cluster:/);
  assert.ok(regions[0]!.ocr_like_texts.includes('U1'));
  assert.ok(regions[0]!.ocr_like_texts.includes('GND'));
});

test('vision provider factory stays disabled without a configured API key', () => {
  const previousProvider = process.env.KICAD_VISION_PROVIDER;
  const previousGeminiKey = process.env.GEMINI_API_KEY;

  process.env.KICAD_VISION_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = '';

  try {
    assert.equal(createVisionAdapterFromEnv(), null);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.KICAD_VISION_PROVIDER;
    } else {
      process.env.KICAD_VISION_PROVIDER = previousProvider;
    }

    if (previousGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousGeminiKey;
    }
  }
});

test('vision provider factory stays disabled without a configured OpenAI API key', () => {
  const previousProvider = process.env.KICAD_VISION_PROVIDER;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  process.env.KICAD_VISION_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = '';

  try {
    assert.equal(createVisionAdapterFromEnv(), null);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.KICAD_VISION_PROVIDER;
    } else {
      process.env.KICAD_VISION_PROVIDER = previousProvider;
    }

    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }
  }
});

test('llm hypothesis provider factory stays disabled without a configured API key', () => {
  const previousProvider = process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
  const previousGeminiKey = process.env.GEMINI_API_KEY;

  process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = '';

  try {
    assert.equal(createLlmHypothesisProviderFromEnv(), null);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
    } else {
      process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = previousProvider;
    }

    if (previousGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousGeminiKey;
    }
  }
});

test('llm hypothesis provider factory stays disabled without a configured OpenAI API key', () => {
  const previousProvider = process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = '';

  try {
    assert.equal(createLlmHypothesisProviderFromEnv(), null);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
    } else {
      process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = previousProvider;
    }

    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }
  }
});

test('rule resolution marks conflicts as needs_review', () => {
  const parsed = {
    schematic_file: 'sample.kicad_sch',
    source_model: {} as never,
    page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
    symbols: [],
    nets: [],
    wires: [],
    labels: [],
    rects: [],
    sheets: [
      {
        id: 'sheet_1',
        sheet_name: 'connectors1',
        sheet_file: 'connectors1.sch',
        bbox_mm: [100, 40, 140, 60] as const,
        sheet_pins: [
          { name: 'MISO', position_mm: [100, 42] as const },
          { name: 'MOSI', position_mm: [100, 45] as const },
          { name: 'SCK', position_mm: [100, 48] as const },
        ],
        nearby_labels: [{ text: 'Main MCU', distance_mm: 1.2 }],
      },
    ],
    cross_sheet_links: [],
  };

  const regions = [
    {
      region_id: 'r1',
      bbox_px: [1000, 400, 1400, 600] as const,
      observed_shape_tags: ['sheet_box'],
      ocr_like_texts: [],
      visual_density: 'medium' as const,
    },
  ];

  const geometryMatches = [
    {
      region_id: 'r1',
      matched_entity_id: 'sheet_1',
      matched_entity_type: 'sheet' as const,
      iou_score: 0.92,
      nearby_labels: ['Main MCU'],
    },
  ];

  const patternMatches = [
    {
      region_id: 'r1',
      pattern_candidates: [
        { pattern_name: 'SPI_ISP_HEADER' as const, score: 0.91 },
      ],
    },
  ];

  const resolved = resolveInterpretationRules({
    parsed,
    regions,
    geometryMatches,
    patternMatches,
    thresholds: {
      high_confidence_score: 0.8,
      medium_confidence_low_bound: 0.4,
    },
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
    },
  });

  assert.equal(resolved.blocks[0]?.confidence, 'needs_review');
  assert.equal(resolved.review_needed.length, 1);
});

test('zero-score pattern does not collapse to a connector guess', () => {
  const resolved = resolveInterpretationRules({
    parsed: {
      schematic_file: 'sample.kicad_sch',
      source_model: {} as never,
      page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
      symbols: [],
      nets: [],
      wires: [],
      labels: [],
      rects: [],
      sheets: [],
      cross_sheet_links: [],
    },
    regions: [
      {
        region_id: 'r0',
        bbox_px: [10, 10, 40, 40] as const,
        observed_shape_tags: ['symbol_cluster'],
        ocr_like_texts: ['H1', 'H2', 'MountingHole_Pad'],
        visual_density: 'low' as const,
        sub_candidates: ['MountingHole_Pad'],
      },
    ],
    geometryMatches: [
      {
        region_id: 'r0',
        matched_entity_id: null,
        matched_entity_type: null,
        iou_score: 0,
        nearby_labels: [],
      },
    ],
    patternMatches: [
      {
        region_id: 'r0',
        pattern_candidates: [
          { pattern_name: 'SPI_ISP_HEADER', score: 0 },
          { pattern_name: 'GENERIC_CONNECTOR_BLOCK', score: 0 },
        ],
      },
    ],
    thresholds: {
      high_confidence_score: 0.8,
      medium_confidence_low_bound: 0.4,
    },
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
    },
  });

  assert.equal(resolved.blocks[0]?.block_type, 'unknown');
  assert.equal(resolved.blocks[0]?.role, 'mechanical_support');
});

test('power-like cluster without regulator markers resolves to power_distribution', () => {
  const resolved = resolveInterpretationRules({
    parsed: {
      schematic_file: 'sample.kicad_sch',
      source_model: {} as never,
      page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
      symbols: [],
      nets: [],
      wires: [],
      labels: [],
      rects: [],
      sheets: [],
      cross_sheet_links: [],
    },
    regions: [
      {
        region_id: 'p1',
        bbox_px: [10, 10, 40, 40] as const,
        observed_shape_tags: ['symbol_cluster'],
        ocr_like_texts: ['+5V', 'GND', 'TVS', 'J1'],
        visual_density: 'medium' as const,
        sub_candidates: ['SRV05-4', 'Screw_Terminal_01x03'],
      },
    ],
    geometryMatches: [
      {
        region_id: 'p1',
        matched_entity_id: null,
        matched_entity_type: null,
        iou_score: 0,
        nearby_labels: [],
      },
    ],
    patternMatches: [
      {
        region_id: 'p1',
        pattern_candidates: [
          { pattern_name: 'POWER_BLOCK', score: 0.62 },
          { pattern_name: 'GENERIC_CONNECTOR_BLOCK', score: 0.28 },
        ],
      },
    ],
    thresholds: {
      high_confidence_score: 0.8,
      medium_confidence_low_bound: 0.4,
    },
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
    },
  });

  assert.equal(resolved.blocks[0]?.block_type, 'power_block');
  assert.equal(resolved.blocks[0]?.role, 'power_distribution');
});

test('generic connector pattern with connector hints resolves to board_connector', () => {
  const resolved = resolveInterpretationRules({
    parsed: {
      schematic_file: 'sample.kicad_sch',
      source_model: {} as never,
      page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
      symbols: [],
      nets: [],
      wires: [],
      labels: [],
      rects: [],
      sheets: [],
      cross_sheet_links: [],
    },
    regions: [
      {
        region_id: 'j1',
        bbox_px: [10, 10, 40, 40] as const,
        observed_shape_tags: ['symbol_cluster', 'connector_cluster'],
        ocr_like_texts: ['J1', 'Screw_Terminal_01x03', 'Pin_1', 'Pin_2'],
        visual_density: 'medium' as const,
      },
    ],
    geometryMatches: [
      {
        region_id: 'j1',
        matched_entity_id: null,
        matched_entity_type: null,
        iou_score: 0,
        nearby_labels: [],
      },
    ],
    patternMatches: [
      {
        region_id: 'j1',
        pattern_candidates: [
          { pattern_name: 'GENERIC_CONNECTOR_BLOCK', score: 0.58 },
          { pattern_name: 'POWER_BLOCK', score: 0.2 },
        ],
      },
    ],
    thresholds: {
      high_confidence_score: 0.8,
      medium_confidence_low_bound: 0.4,
    },
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
    },
  });

  assert.equal(resolved.blocks[0]?.block_type, 'connector_block');
  assert.equal(resolved.blocks[0]?.role, 'board_connector');
});

test('hierarchy resolver reads child sheet and exposes inferred connector role', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'modumake-interpret-hierarchy-'));
  const rootPath = join(tempDir, 'root.kicad_sch');
  const childPath = join(tempDir, 'connectors1.sch');

  const child = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper A4 portrait)
  (lib_symbols
    (symbol "Connector_Generic:Conn_01x03"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "Conn_01x03" (id 1) (at 0 -2.54 0))
      (symbol "Conn_01x03_0_1"
        (pin passive line (at 0 0 0) (length 2.54)
          (name "Pin_1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Connector_Generic:Conn_01x03")
    (at 20 20 0)
    (uuid "conn-1")
    (property "Reference" "J1" (id 0) (at 20 18 0))
    (property "Value" "Prog Header" (id 1) (at 20 22 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const root = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper A4 portrait)
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (sheet
    (at 100 40)
    (size 40 20)
    (property "Sheet name" "connectors1" (id 0) (at 100 38 0))
    (property "Sheet file" "connectors1.sch" (id 1) (at 100 62 0))
    (pin "MISO" input (at 100 42 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  await writeFile(childPath, child, 'utf8');
  await writeFile(rootPath, root, 'utf8');

  const parsed = adaptKiCadSourceToInterpretationParsed(root, 'root.kicad_sch');
  const hierarchy = await resolveHierarchyForParsedSchematic({
    parsed,
    schematicPath: rootPath,
  });

  assert.equal(hierarchy.sheets.length, 1);
  assert.equal(hierarchy.sheets[0]?.parsed, true);
  assert.ok(hierarchy.sheets[0]?.inferred_roles.includes('connector'));
});

test('rule resolution boosts connector confidence when hierarchy confirms child connector', () => {
  const parsed = {
    schematic_file: 'sample.kicad_sch',
    source_model: {} as never,
    page_settings: { paper: 'A4', width_mm: 297, height_mm: 210, orientation: 'landscape' as const },
    symbols: [],
    nets: [],
    wires: [],
    labels: [],
    rects: [],
    sheets: [
      {
        id: 'sheet_1',
        sheet_name: 'connectors1',
        sheet_file: 'connectors1.sch',
        bbox_mm: [100, 40, 140, 60] as const,
        sheet_pins: [
          { name: 'MISO', position_mm: [100, 42] as const },
          { name: 'MOSI', position_mm: [100, 45] as const },
          { name: 'SCK', position_mm: [100, 48] as const },
        ],
        nearby_labels: [{ text: 'connectors1', distance_mm: 1.2 }],
      },
    ],
    cross_sheet_links: [],
  };

  const regions = [
    {
      region_id: 'r1',
      bbox_px: [1000, 400, 1400, 600] as const,
      observed_shape_tags: ['sheet_box'],
      ocr_like_texts: [],
      visual_density: 'medium' as const,
    },
  ];

  const resolved = resolveInterpretationRules({
    parsed,
    regions,
    geometryMatches: [
      {
        region_id: 'r1',
        matched_entity_id: 'sheet_1',
        matched_entity_type: 'sheet' as const,
        iou_score: 0.92,
        nearby_labels: ['connectors1'],
      },
    ],
    patternMatches: [
      {
        region_id: 'r1',
        pattern_candidates: [
          { pattern_name: 'SPI_ISP_HEADER' as const, score: 0.61 },
        ],
      },
    ],
    hierarchy: {
      sheets: [
        {
          sheet_id: 'sheet_1',
          sheet_file: 'connectors1.sch',
          resolved_path: '/tmp/connectors1.sch',
          parsed: true,
          child_symbol_refs: ['J1'],
          child_symbol_lib_ids: ['Connector_Generic:Conn_01x03'],
          inferred_roles: ['connector'],
          warnings: [],
        },
      ],
      warnings: [],
    },
    thresholds: {
      high_confidence_score: 0.8,
      medium_confidence_low_bound: 0.4,
    },
    coordMap: {
      scale_px_per_mm: 10,
      origin_offset_px: [0, 0],
    },
  });

  assert.equal(resolved.blocks[0]?.confidence, 'high');
  assert.ok(resolved.blocks[0]?.evidence_sources.includes('cross_sheet_resolution'));
  assert.equal(resolved.blocks[0]?.cross_sheet_resolved, true);
});

test('llm hypothesis gate only opens for unresolved needs_review regions', async () => {
  const block = {
    block_id: 'block_r1',
    block_type: 'connector_block' as const,
    role: 'generic_connector',
    freeform_description: 'ambiguous region',
    confidence: 'needs_review' as const,
    evidence_sources: ['conflict'],
    member_entities: [],
    bbox_mm: [0, 0, 1, 1] as const,
    needs_review: true,
  };

  const shouldCall = shouldCallLlmHypothesis({
    block,
    geometryMatch: {
      region_id: 'r1',
      matched_entity_id: 'sheet_1',
      matched_entity_type: 'sheet',
      iou_score: 0.91,
      nearby_labels: ['Main MCU'],
    },
    patternMatch: {
      region_id: 'r1',
      pattern_candidates: [{ pattern_name: 'SPI_ISP_HEADER', score: 0.61 }],
    },
    thresholds: {
      high_confidence_score: 0.8,
      trigger_if_pattern_score_below: 0.8,
    },
  });

  assert.equal(shouldCall, true);

  const blockedByHierarchy = shouldCallLlmHypothesis({
    block,
    geometryMatch: {
      region_id: 'r1',
      matched_entity_id: 'sheet_1',
      matched_entity_type: 'sheet',
      iou_score: 0.91,
      nearby_labels: ['connectors1'],
    },
    patternMatch: {
      region_id: 'r1',
      pattern_candidates: [{ pattern_name: 'SPI_ISP_HEADER', score: 0.61 }],
    },
    hierarchy: {
      sheets: [
        {
          sheet_id: 'sheet_1',
          sheet_file: 'connectors1.sch',
          resolved_path: '/tmp/connectors1.sch',
          parsed: true,
          child_symbol_refs: ['J1'],
          child_symbol_lib_ids: ['Connector_Generic:Conn_01x03'],
          inferred_roles: ['connector'],
          warnings: [],
        },
      ],
      warnings: [],
    },
    thresholds: {
      high_confidence_score: 0.8,
      trigger_if_pattern_score_below: 0.8,
    },
  });

  assert.equal(blockedByHierarchy, false);

  const hypotheses = await generateGatedLlmHypotheses({
    provider: createStubLlmHypothesisProvider(),
    parsed: {
      schematic_file: 'sample.kicad_sch',
      source_model: {} as never,
      symbols: [],
      nets: [],
      wires: [],
      labels: [],
      rects: [],
      sheets: [],
      cross_sheet_links: [],
    },
    regions: [
      {
        region_id: 'r1',
        bbox_px: [0, 0, 10, 10] as const,
        observed_shape_tags: ['sheet_box'],
        ocr_like_texts: [],
        visual_density: 'medium' as const,
      },
    ],
    blocks: [block],
    geometryMatches: [
      {
        region_id: 'r1',
        matched_entity_id: 'sheet_1',
        matched_entity_type: 'sheet',
        iou_score: 0.91,
        nearby_labels: ['Main MCU'],
      },
    ],
    patternMatches: [
      {
        region_id: 'r1',
        pattern_candidates: [{ pattern_name: 'SPI_ISP_HEADER', score: 0.61 }],
      },
    ],
    thresholds: {
      high_confidence_score: 0.8,
      trigger_if_pattern_score_below: 0.8,
    },
  });

  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0]?.region_id, 'r1');
});

test('deterministic pipeline writes stage artifacts and final report', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'modumake-interpret-pipeline-'));
  const schematicPath = join(tempDir, 'sample.kicad_sch');
  const outputDirectory = join(tempDir, 'out');

  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper A4 portrait)
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (sheet
    (at 100 40)
    (size 40 20)
    (property "Sheet name" "connectors1" (id 0) (at 100 38 0))
    (property "Sheet file" "connectors1.sch" (id 1) (at 100 62 0))
    (pin "MISO" input (at 100 42 0))
    (pin "MOSI" input (at 100 45 0))
    (pin "SCK" input (at 100 48 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 40 30 0)
    (uuid "res-1")
    (property "Reference" "R1" (id 0) (at 40 26 0))
    (property "Value" "10k" (id 1) (at 40 34 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  await writeFile(schematicPath, schematic, 'utf8');

  const originalPath = process.env.KICAD_CLI_PATH;
  process.env.KICAD_CLI_PATH = 'python3';
  try {
    await runInterpretationDeterministicPipeline({
      schematicPath,
      outputDirectory,
    });
  } catch (error) {
    assert.match(String(error), /kicad-cli/i);
  } finally {
    if (originalPath === undefined) {
      delete process.env.KICAD_CLI_PATH;
    } else {
      process.env.KICAD_CLI_PATH = originalPath;
    }
  }

  const files: string[] = await readdir(outputDirectory).catch(() => []);
  assert.ok(files.includes('parsed.json'));
  assert.ok(files.includes('environment_check.json') || files.some(file => file.endsWith('.environment-check.json')));
  assert.ok(files.includes('hierarchy_resolution.json'));
});
