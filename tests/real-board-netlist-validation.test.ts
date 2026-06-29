import testRunner from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { runProjectDrc } from '@/lib/drc-engine';
import { getTemplateById } from '@/constants/component-templates';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';

const test = process.env.MODUMAKE_REAL_FIXTURES === '1' ? testRunner : testRunner.skip;

const REAL_BOARD_FIXTURE =
  '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/rusefi/IR2302-testboard/IR2302-testboard.kicad_sch';
const TLE9104_FIXTURE =
  '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/rusefi/tle9104-breakout/tle9104-breakout.kicad_sch';
const MINI48_FIXTURE =
  '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_sch';

async function loadFixtureReport(fixturePath: string) {
  const source = await readFile(fixturePath, 'utf8');
  const imported = importKiCadSchematic(source);
  const { document, summary } = imported;

  const circuitReport = analyzeCircuitNetlist(
    document.components,
    document.activeBoardId,
    getTemplateById,
    document.manualConnections ?? []
  );
  const drcReport = runProjectDrc({
    components: document.components,
    manualConnections: document.manualConnections ?? [],
    boardId: document.activeBoardId,
    resolveTemplate: getTemplateById,
    importedSchematicScene: document.importedSchematicScene,
    powerInputMode: document.powerInputMode,
    componentPowerModes: document.componentPowerModes ?? {},
    componentUnusedPinModes: document.componentUnusedPinModes ?? {},
    generatedCode: document.generatedCode,
    footprintPinPadOverrideCache: {},
  });
  const integratedValidationJson = buildImportedSchematicIntegratedValidationJson({
    document,
    importedSource: source,
    importSummary: summary,
  });

  return {
    source,
    document,
    summary,
    circuitReport,
    drcReport,
    integratedValidationJson,
  };
}

test('real KiCad board fixture stays analyzable from import through netlist validation', async () => {
  const {
    document,
    summary,
    circuitReport,
    drcReport,
    integratedValidationJson,
  } = await loadFixtureReport(REAL_BOARD_FIXTURE);
  const unroutedIssues = drcReport.issues.filter(issue => issue.ruleId === 'routing.unrouted-component');
  const unroutedComponents = document.components.filter(component => !component.isFullyRouted);

  assert.equal(document.projectName, 'IR2302-testboard');
  assert.equal(document.activeBoardId, 'kicad_generic');
  assert.ok(document.components.length >= 80);
  assert.ok((document.manualConnections?.length ?? 0) >= 100);
  assert.equal(unroutedComponents.length, 0);
  assert.equal(summary.fallbackComponentCount, 0);
  assert.equal(summary.lowConfidenceComponentCount, 0);

  assert.ok(circuitReport.nets.length >= 20);
  assert.ok((circuitReport.resistors?.length ?? 0) >= 8);
  assert.ok((circuitReport.capacitors?.length ?? 0) >= 8);
  assert.ok((circuitReport.diodes?.length ?? 0) >= 2);
  assert.ok(circuitReport.issues.length >= 2);
  assert.ok(circuitReport.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'));

  assert.ok(drcReport.issues.length >= 10);
  assert.equal(unroutedIssues.length, 0);
  assert.ok(drcReport.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'));

  assert.ok(integratedValidationJson);
  assert.equal(integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.equal(integratedValidationJson?.project.projectName, 'IR2302-testboard');
  assert.ok((integratedValidationJson?.components.length ?? 0) >= 80);
  assert.ok((integratedValidationJson?.nets.length ?? 0) >= 20);
  assert.ok((integratedValidationJson?.extractionPlan.targets.length ?? 0) >= 80);
});

test('tle9104 breakout fixture stays end-to-end analyzable with zero unrouted components', async () => {
  const {
    document,
    summary,
    circuitReport,
    drcReport,
    integratedValidationJson,
  } = await loadFixtureReport(TLE9104_FIXTURE);

  assert.equal(document.activeBoardId, 'kicad_generic');
  assert.ok(document.components.length >= 45);
  assert.ok((document.manualConnections?.length ?? 0) >= 80);
  assert.equal(document.components.filter(component => !component.isFullyRouted).length, 0);
  assert.ok(summary.fallbackComponentCount >= 15);
  assert.ok(summary.lowConfidenceComponentCount >= 15);

  assert.ok(circuitReport.nets.length >= 8);
  assert.ok(circuitReport.issues.length >= 1);
  assert.ok(circuitReport.issues.some(issue => issue.ruleId === 'netlist.solver-convergence'));
  assert.ok(drcReport.issues.length >= 10);
  assert.equal(drcReport.issues.some(issue => issue.ruleId === 'routing.unrouted-component'), false);

  assert.ok(integratedValidationJson);
  assert.equal(integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.ok((integratedValidationJson?.components.length ?? 0) >= 45);
});

test('mini48 stm32 fixture remains analyzable even with known fallback and partial-routing limits', async () => {
  const {
    document,
    summary,
    circuitReport,
    drcReport,
    integratedValidationJson,
  } = await loadFixtureReport(MINI48_FIXTURE);

  assert.equal(document.projectName, 'Maplemini fork');
  assert.equal(document.activeBoardId, 'kicad_generic');
  assert.ok(document.components.length >= 60);
  assert.ok((document.manualConnections?.length ?? 0) >= 130);
  assert.ok(document.components.filter(component => !component.isFullyRouted).length >= 1);
  assert.ok(summary.fallbackComponentCount >= 10);
  assert.ok(summary.lowConfidenceComponentCount >= 10);

  assert.ok(circuitReport.nets.length >= 12);
  assert.ok(circuitReport.issues.length >= 3);
  assert.ok(circuitReport.issues.some(issue => issue.ruleId === 'electrical.pinout-mismatch'));
  assert.ok(drcReport.issues.length >= 15);
  assert.ok(document.components.filter(component => !component.isFullyRouted).length >= 1);

  assert.ok(integratedValidationJson);
  assert.equal(integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.equal(integratedValidationJson?.project.projectName, 'Maplemini fork');
});
