import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildEffectiveImportedPcbValidation } from '@/lib/effective-imported-pcb-validation';
import { mapImportedPcbValidationIssuesToProjectAuditIssues } from '@/lib/imported-pcb-audit-issues';
import {
  buildImportedPcbReviewComparison,
  buildImportedPcbReviewGroups,
} from '@/lib/imported-pcb-review-groups';
import {
  mapKiCadPcbDrcReport,
  mergeImportedPcbValidationReports,
  validateImportedPcbDocument,
} from '@/lib/imported-pcb-validation';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import { createProjectDocument, normalizeProjectDocument } from '@/store/project-document';
import { buildDefaultProjectState } from '@/store/store-defaults';
import { DEFAULT_BOARD_ID, DEFAULT_PROJECT_NAME, POWER_INPUT_MODES, PROJECT_FILE_VERSION } from '@/store/store-config';
import { makeComponent } from './test-fixtures.ts';

const FAIL_PROJECT = '/Users/gimdong-il/Desktop/프로그램/modumake/pydrc/test-projects/fail-project/fail-project.kicad_pcb';
const GOOD_PROJECT = '/Users/gimdong-il/Desktop/프로그램/modumake/pydrc/test-projects/good-project/good-project.kicad_pcb';
const WIDEBAND_PCB = '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/rusefi/wideband-F103/wideband_controller.kicad_pcb';

const ADVANCED_RULE_PROJECT = `
(kicad_pcb
  (version 20240101)
  (generator modumake-test)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (36 "F.Mask" user)
    (44 "Edge.Cuts" user)
  )
  (setup
    (trace_clearance 0.2)
    (trace_min 0.15)
    (zone_clearance 0.2)
    (pad_to_mask_clearance 0.1)
    (solder_mask_min_width 0.25)
    (via_min_size 0.4)
    (via_min_drill 0.25)
  )
  (net 0 "")
  (net 1 "USB_DP")
  (net 2 "USB_DM")
  (net 3 "AUX")
  (net_class Default ""
    (clearance 0.2)
    (trace_width 0.2)
    (via_dia 0.6)
    (via_drill 0.3)
    (diff_pair_width 0.2)
    (diff_pair_gap 0.15)
    (length_match_tolerance 0.2)
    (add_net "USB_DP")
    (add_net "USB_DM")
  )
  (gr_rect (start 0 0) (end 12 8) (layer "Edge.Cuts") (width 0.15))
  (footprint "Test:R" (layer "F.Cu") (at 0.35 0.35)
    (fp_text reference "R1" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (fp_text value "R" (at 0 1) (layer "F.Fab") (effects (font (size 1 1))))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1 "USB_DP"))
    (pad "2" smd rect (at 0.75 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 3 "AUX"))
  )
  (footprint "Test:J" (layer "F.Cu") (at 7 3)
    (fp_text reference "J1" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (fp_text value "J" (at 0 1) (layer "F.Fab") (effects (font (size 1 1))))
    (pad "1" thru_hole circle (at 0 0) (size 0.7 0.7) (drill 0.6) (layers "*.Cu" "*.Mask") (net 2 "USB_DM"))
  )
  (segment (start 1 2) (end 8 2) (width 0.1) (layer "F.Cu") (net 1))
  (segment (start 1 2.6) (end 3 2.6) (width 0.2) (layer "F.Cu") (net 2))
  (via (at 9 2) (size 0.32) (drill 0.24) (layers "F.Cu" "B.Cu") (net 2))
  (zone (net 1) (net_name "USB_DP") (layer "F.Cu")
    (connect_pads (clearance 0.2))
    (min_thickness 0.15)
    (polygon (pts (xy 1 1.8) (xy 4 1.8) (xy 4 2.5) (xy 1 2.5)))
    (filled_polygon (pts (xy 1 1.8) (xy 4 1.8) (xy 4 2.5) (xy 1 2.5)))
  )
)
`;

const CROSS_LAYER_CLEARANCE_PROJECT = `
(kicad_pcb
  (version 20240101)
  (generator modumake-test)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
  )
  (setup
    (trace_clearance 0.2)
  )
  (net 1 "PAD")
  (net 2 "TRACE")
  (footprint "Test:J" (layer "F.Cu") (at 0 0)
    (fp_text reference "J1" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (fp_text value "J" (at 0 1) (layer "F.Fab") (effects (font (size 1 1))))
    (pad "1" smd circle (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1 "PAD"))
  )
  (segment (start -1 0) (end 1 0) (width 0.2) (layer "B.Cu") (net 2))
)
`;

const REPEATED_TRACK_PAD_CLEARANCE_PROJECT = `
(kicad_pcb
  (version 20240101)
  (generator modumake-test)
  (layers
    (0 "F.Cu" signal)
  )
  (setup
    (trace_clearance 0.2)
  )
  (net 1 "PAD")
  (net 2 "TRACE")
  (footprint "Test:J" (layer "F.Cu") (at 0 0)
    (fp_text reference "J1" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (fp_text value "J" (at 0 1) (layer "F.Fab") (effects (font (size 1 1))))
    (pad "1" smd circle (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1 "PAD"))
  )
  (segment (start -1 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 2))
  (segment (start -1 0.05) (end 1 0.05) (width 0.2) (layer "F.Cu") (net 2))
  (segment (start -1 -0.05) (end 1 -0.05) (width 0.2) (layer "F.Cu") (net 2))
)
`;

function buildReferenceMismatchPcb(referencePrefix: string, count: number) {
  const nets = Array.from({ length: count }, (_, index) => `  (net ${index + 1} "PCB_NET_${index + 1}")`).join('\n');
  const footprints = Array.from({ length: count }, (_, index) => {
    const ref = `${referencePrefix}${index + 1}`;
    const x = 2 + index * 1.5;
    return `
  (footprint "Test:R" (layer "F.Cu") (at ${x} 5)
    (fp_text reference "${ref}" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (fp_text value "R" (at 0 1) (layer "F.Fab") (effects (font (size 1 1))))
    (pad "1" smd rect (at -0.3 0) (size 0.5 0.5) (layers "F.Cu" "F.Mask") (net ${index + 1} "PCB_NET_${index + 1}"))
    (pad "2" smd rect (at 0.3 0) (size 0.5 0.5) (layers "F.Cu" "F.Mask") (net 0 ""))
  )`;
  }).join('\n');

  return `
(kicad_pcb
  (version 20240101)
  (generator modumake-test)
  (layers
    (0 "F.Cu" signal)
    (36 "F.Mask" user)
    (44 "Edge.Cuts" user)
  )
  (setup (trace_clearance 0.2))
${nets}
  (gr_rect (start 0 0) (end ${count * 1.5 + 4} 10) (layer "Edge.Cuts") (width 0.15))
${footprints}
)
`;
}

test('parseKiCadPcb extracts core board geometry from KiCad 5 module files', async () => {
  const source = await readFile(FAIL_PROJECT, 'utf8');
  const document = parseKiCadPcb(source, { sourceFilename: 'fail-project.kicad_pcb' });

  assert.equal(document.sourceFilename, 'fail-project.kicad_pcb');
  assert.equal(document.stats.footprintCount, 3);
  assert.equal(document.stats.segmentCount, 4);
  assert.equal(document.stats.zoneCount, 1);
  assert.ok(document.layers.some(layer => layer.name === 'F.Cu'));
  assert.ok(document.layers.some(layer => layer.name === 'Edge.Cuts'));
  assert.ok(document.nets.some(net => net.name === 'VCC'));
  assert.ok(document.footprints.some(footprint => footprint.reference === 'D1'));
  assert.ok(document.footprints.flatMap(footprint => footprint.pads).some(pad => pad.netName === 'VCC'));
  assert.ok(document.bounds);
});

test('validateImportedPcbDocument reports obvious manufacturing and continuity issues', async () => {
  const source = await readFile(FAIL_PROJECT, 'utf8');
  const document = parseKiCadPcb(source);
  const report = validateImportedPcbDocument(document);
  const codes = new Set(report.issues.map(issue => issue.code));

  assert.ok(report.errorCount > 0);
  assert.ok(codes.has('PCB_STRAY_COPPER'));
  assert.ok(codes.has('PCB_TRACK_TOO_NARROW'));
  assert.ok(codes.has('PCB_NET_DISCONNECTED') || codes.has('PCB_NET_HAS_NO_COPPER_PATH'));
});

test('parseKiCadPcb keeps enough data to render legacy good-project fixtures', async () => {
  const source = await readFile(GOOD_PROJECT, 'utf8');
  const document = parseKiCadPcb(source);

  assert.ok(document.stats.footprintCount > 0);
  assert.ok(document.drawings.some(drawing => drawing.layer === 'Edge.Cuts'));
  assert.ok(document.footprints.flatMap(footprint => footprint.graphics).length > 0);
});

test('project documents round-trip imported PCB source through canonical parser state', async () => {
  const source = await readFile(FAIL_PROJECT, 'utf8');
  const importedPcbDocument = parseKiCadPcb(source, { sourceFilename: 'fail-project.kicad_pcb' });
  const importedPcbValidation = validateImportedPcbDocument(importedPcbDocument);
  const state = {
    ...buildDefaultProjectState(),
    importedPcbDocument,
    importedPcbSource: source,
    importedPcbValidation,
    workspaceMode: 'pcb' as const,
  };
  const saved = createProjectDocument(state, { projectFileVersion: PROJECT_FILE_VERSION });
  const normalized = normalizeProjectDocument(saved, {
    defaultBoardId: DEFAULT_BOARD_ID,
    defaultProjectName: DEFAULT_PROJECT_NAME,
    projectFileVersion: PROJECT_FILE_VERSION,
    workspaceModes: ['simulation', 'schematic', 'pcb', 'manufacturing'],
    powerInputModes: POWER_INPUT_MODES,
  });

  assert.ok(normalized?.importedPcbDocument);
  assert.equal(normalized.importedPcbDocument.stats.footprintCount, importedPcbDocument.stats.footprintCount);
  assert.ok(normalized.importedPcbValidation);
  assert.equal(normalized.workspaceMode, 'pcb');
});

test('advanced PCB validation covers polygon clearance, manufacturing, diff-pair, and schematic parity', () => {
  const document = parseKiCadPcb(ADVANCED_RULE_PROJECT, { sourceFilename: 'advanced.kicad_pcb' });
  const report = validateImportedPcbDocument(document, {
    schematicParity: {
      components: [{
        instanceId: 'missing-r99',
        templateId: 'test',
        name: 'Missing R99',
        position: { x: 0, y: 0 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'R99',
      }],
      manualConnections: [{ id: 'net-missing', source: { ownerType: 'component', ownerId: 'a', pinId: '1' }, target: { ownerType: 'component', ownerId: 'b', pinId: '1' }, suggestedNetName: 'MISSING_NET' }],
      importedSchematicScene: null,
    },
  });
  const codes = new Set(report.issues.map(issue => issue.code));

  assert.equal(document.setup.padToMaskClearance, 0.1);
  assert.equal(document.setup.solderMaskMinWidth, 0.25);
  assert.equal(document.netClasses[0]?.diffPairGap, 0.15);
  assert.ok(codes.has('PCB_ANNULAR_RING_TOO_SMALL'));
  assert.ok(codes.has('PCB_VIA_TOO_SMALL'));
  assert.ok(codes.has('PCB_SOLDER_MASK_SLIVER_TOO_SMALL'));
  assert.ok(codes.has('PCB_COPPER_TO_EDGE_CLEARANCE'));
  assert.ok(codes.has('PCB_ZONE_CLEARANCE_TRACK'));
  assert.ok(codes.has('PCB_DIFF_PAIR_LENGTH_MISMATCH'));
  assert.ok(codes.has('PCB_DIFF_PAIR_WIDTH_MISMATCH'));
  assert.ok(codes.has('PCB_DIFF_PAIR_GAP_MISMATCH'));
  assert.ok(codes.has('PCB_DIFF_PAIR_IMPEDANCE_UNVERIFIED'));
  assert.ok(codes.has('PCB_SCHEMATIC_MISSING_FOOTPRINT'));
  assert.ok(codes.has('PCB_SCHEMATIC_NET_MISSING'));
});

test('effective PCB validation refreshes stale schematic parity context', () => {
  const document = parseKiCadPcb(ADVANCED_RULE_PROJECT, { sourceFilename: 'advanced.kicad_pcb' });
  const staleValidation = validateImportedPcbDocument(document, {
    schematicParity: {
      components: [{
        instanceId: 'missing-r99',
        templateId: 'test',
        name: 'Missing R99',
        position: { x: 0, y: 0 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'R99',
      }],
      manualConnections: [{ id: 'net-missing', source: { ownerType: 'component', ownerId: 'a', pinId: '1' }, target: { ownerType: 'component', ownerId: 'b', pinId: '1' }, suggestedNetName: 'MISSING_NET' }],
      importedSchematicScene: null,
    },
  });

  const effectiveValidation = buildEffectiveImportedPcbValidation({
    document,
    validation: staleValidation,
    options: {
      schematicParity: {
        components: [{
          instanceId: 'r1',
          templateId: 'test',
          name: 'R1',
          position: { x: 0, y: 0 },
          rotation: 0,
          assignedPins: { '1': 'USB_DP' },
          isFullyRouted: true,
          importedReference: 'R1',
        }],
        manualConnections: [],
        importedSchematicScene: null,
      },
    },
  });

  assert.ok(staleValidation.issues.some(issue => issue.code === 'PCB_SCHEMATIC_MISSING_FOOTPRINT' && issue.footprintRef === 'R99'));
  assert.ok(staleValidation.issues.some(issue => issue.code === 'PCB_SCHEMATIC_NET_MISSING' && issue.netName === 'MISSING_NET'));
  assert.equal(effectiveValidation?.issues.some(issue => issue.code === 'PCB_SCHEMATIC_MISSING_FOOTPRINT' && issue.footprintRef === 'R99'), false);
  assert.equal(effectiveValidation?.issues.some(issue => issue.code === 'PCB_SCHEMATIC_NET_MISSING' && issue.netName === 'MISSING_NET'), false);
  assert.equal(effectiveValidation?.checks.schematicParity, true);
  assert.ok(effectiveValidation?.checks.schematicParityContextKey);
});

test('schematic parity summarizes large reference mismatches instead of flooding missing items', () => {
  const document = parseKiCadPcb(buildReferenceMismatchPcb('U', 20), { sourceFilename: 'reference-mismatch.kicad_pcb' });
  const components = Array.from({ length: 20 }, (_, index) => ({
    ...makeComponent({
      instanceId: `schematic-r-${index + 1}`,
      templateId: 'tpl_resistor',
      name: `R${index + 1}`,
      assignedPins: {
        '1': `SCHEMATIC_NET_${index + 1}`,
        '2': 'GND',
      },
    }),
    importedReference: `R${index + 1}`,
  }));
  const report = validateImportedPcbDocument(document, {
    schematicParity: {
      components,
      manualConnections: [],
      importedSchematicScene: null,
    },
  });
  const codes = new Set(report.issues.map(issue => issue.code));

  assert.ok(codes.has('PCB_SCHEMATIC_SYNC_UNCERTAIN'));
  assert.equal(codes.has('PCB_SCHEMATIC_MISSING_FOOTPRINT'), false);
  assert.equal(codes.has('PCB_SCHEMATIC_EXTRA_FOOTPRINT'), false);
  assert.equal(codes.has('PCB_SCHEMATIC_NET_MISSING'), false);
});

test('KiCad PCB DRC mapping keeps official source mode metadata', () => {
  const report = mapKiCadPcbDrcReport({
    violations: [{ type: 'clearance', severity: 'error', description: 'official clearance finding' }],
    unconnected_items: [],
  }, { drcMode: 'board-only' });

  assert.equal(report.source, 'kicad-cli');
  assert.equal(report.checks.kicadDrc, true);
  assert.equal(report.checks.kicadDrcMode, 'board-only');
  assert.equal(report.issues[0]?.source, 'kicad-cli');
});

test('ModuMake PCB findings map as pre-check evidence instead of official DRC', () => {
  const document = parseKiCadPcb(ADVANCED_RULE_PROJECT, { sourceFilename: 'advanced.kicad_pcb' });
  const report = validateImportedPcbDocument(document);
  const clearanceIssue = report.issues.find(issue => issue.code === 'PCB_COPPER_TO_EDGE_CLEARANCE');

  assert.ok(clearanceIssue);
  const auditIssue = mapImportedPcbValidationIssuesToProjectAuditIssues(report)
    .find(issue => issue.params?.pcbIssueId === clearanceIssue.id);

  assert.equal(auditIssue?.sourceLabel, 'ModuMake PCB 사전점검');
  assert.equal(auditIssue?.severity, 'warning');
  assert.equal(auditIssue?.confidence, 'needs-review');
  assert.match(auditIssue?.evidence?.assumptions.join('\n') ?? '', /KiCad 공식 DRC/);
});

test('PCB clearance ignores tracks on copper layers that do not touch the pad', () => {
  const document = parseKiCadPcb(CROSS_LAYER_CLEARANCE_PROJECT);
  const report = validateImportedPcbDocument(document);

  assert.equal(report.issues.some(issue => issue.code === 'PCB_CLEARANCE_TRACK_PAD'), false);
});

test('PCB track-pad clearance groups repeated candidates around the same pad', () => {
  const document = parseKiCadPcb(REPEATED_TRACK_PAD_CLEARANCE_PROJECT);
  const report = validateImportedPcbDocument(document);
  const trackPadIssues = report.issues.filter(issue => issue.code === 'PCB_CLEARANCE_TRACK_PAD');

  assert.equal(trackPadIssues.length, 1);
  assert.match(trackPadIssues[0]?.message ?? '', /3건을 대표 이슈 1건/);
  assert.ok((trackPadIssues[0]?.items?.length ?? 0) >= 3);
});

test('real PCB pre-check keeps repeated ModuMake candidates representative', async () => {
  const source = await readFile(WIDEBAND_PCB, 'utf8');
  const document = parseKiCadPcb(source);
  const report = validateImportedPcbDocument(document);
  const repeatedCodes = [
    'PCB_ANNULAR_RING_TOO_SMALL',
    'PCB_CLEARANCE_PAD_PAD',
    'PCB_CLEARANCE_TRACK_PAD',
    'PCB_CLEARANCE_TRACK_TRACK',
    'PCB_NET_DISCONNECTED',
    'PCB_SOLDER_MASK_SLIVER_TOO_SMALL',
    'PCB_ZONE_CLEARANCE_PAD',
  ];

  assert.equal(report.errorCount, 0);
  assert.ok(report.issueCount < 80);
  assert.ok(report.issues.some(issue => issue.code === 'PCB_CLEARANCE_TRACK_TRACK_REPRESENTATIVE_LIMIT'));

  for (const code of repeatedCodes) {
    assert.ok(report.issues.filter(issue => issue.code === code).length <= 6, `${code} should be capped`);
  }
});

test('PCB review groups keep repeated candidates tied to one visible cause', async () => {
  const source = await readFile(WIDEBAND_PCB, 'utf8');
  const document = parseKiCadPcb(source);
  const report = validateImportedPcbDocument(document);
  const groups = buildImportedPcbReviewGroups(report);
  const trackTrackGroup = groups.find(group => group.code === 'PCB_CLEARANCE_TRACK_TRACK');

  assert.ok(groups.length < report.issueCount);
  assert.ok(trackTrackGroup);
  assert.equal(trackTrackGroup.source, 'modumake-pcb');
  assert.ok(trackTrackGroup.visibleIssueCount <= 6);
  assert.ok(trackTrackGroup.hiddenCandidateCount > 0);
  assert.ok(
    trackTrackGroup.issueIds.some(issueId =>
      report.issues.some(issue => issue.id === issueId && issue.code === 'PCB_CLEARANCE_TRACK_TRACK')
    )
  );
  assert.ok(
    trackTrackGroup.issueIds.some(issueId =>
      report.issues.some(issue => issue.id === issueId && issue.code === 'PCB_CLEARANCE_TRACK_TRACK_REPRESENTATIVE_LIMIT')
    )
  );
});

test('PCB review comparison separates official DRC from ModuMake pre-check groups', () => {
  const document = parseKiCadPcb(ADVANCED_RULE_PROJECT, { sourceFilename: 'advanced.kicad_pcb' });
  const localReport = validateImportedPcbDocument(document);
  const officialReport = mapKiCadPcbDrcReport({
    violations: [
      {
        type: 'clearance',
        severity: 'error',
        description: 'official clearance finding',
        items: [{ description: 'official marker', pos: { x: 12, y: 8 } }],
      },
      {
        type: 'courtyard_overlap',
        severity: 'warning',
        description: 'official courtyard finding',
        items: [{ description: 'official marker', pos: { x: 16, y: 9 } }],
      },
    ],
    unconnected_items: [],
  }, { drcMode: 'schematic-parity' });
  const merged = mergeImportedPcbValidationReports(localReport, officialReport);
  const comparison = buildImportedPcbReviewComparison(merged);

  assert.equal(comparison.hasOfficialDrc, true);
  assert.equal(comparison.officialIssueCount, officialReport.issueCount);
  assert.equal(comparison.precheckIssueCount, localReport.issueCount);
  assert.ok(comparison.officialGroups.length > 0);
  assert.ok(comparison.precheckGroups.length > 0);
  assert.equal(comparison.officialGroups.every(group => group.source === 'kicad-cli'), true);
  assert.equal(comparison.precheckGroups.every(group => group.source === 'modumake-pcb'), true);
});
