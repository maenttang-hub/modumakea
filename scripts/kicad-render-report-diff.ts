import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import { runProjectDrc } from '@/lib/drc-engine';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import {
  getImportedNetLabelDisplay,
  getImportedTextDisplayAngle,
  measureImportedTextPrimitiveBox,
} from '@/lib/imported-schematic-render';
import { collectKiCadSchematicFilesFromRoots } from '@/lib/kicad-regression-scan';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import {
  isNonElectricalValidationComponent,
  isReportableValidationComponent,
} from '@/lib/validation-reportable-component-policy';
import { parseKiCadSchematicToLightweightValidationJson } from '@/lib/v3-kicad-parser';
import type {
  ImportedSchematicPoint,
  ImportedSchematicPrimitive,
  ImportedSchematicScene,
  ImportedSchematicSceneSymbol,
  PlacedComponent,
  ProjectAuditIssue,
} from '@/types';

const datasetRoot = process.env.KICAD_DATASET_ROOT ?? '/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset';
const outputPath = process.env.KICAD_DIFF_OUTPUT ?? './tmp/clean-kicad-render-report-diff-summary.json';
const jsonlPath = process.env.KICAD_DIFF_JSONL ?? './tmp/clean-kicad-render-report-diff-results.jsonl';
const limit = Number(process.env.KICAD_DIFF_LIMIT ?? '0') || Infinity;
const concurrency = Math.max(1, Number(process.env.KICAD_DIFF_CONCURRENCY ?? '10') || 10);
const reset = process.env.KICAD_DIFF_RESET === '1';
const includeDrc = process.env.KICAD_DIFF_INCLUDE_DRC === '1';
const maxStoredAnomaliesPerFile = Math.max(5, Number(process.env.KICAD_DIFF_MAX_ANOMALIES_PER_FILE ?? '40') || 40);
const writeFullResults = process.env.KICAD_DIFF_WRITE_FULL_RESULTS === '1';

type DiffCategory = 'parser' | 'render' | 'report' | 'netlist' | 'mapping';
type DiffSeverity = 'error' | 'warning' | 'info';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiffAnomaly {
  reason: string;
  category: DiffCategory;
  severity: DiffSeverity;
  message: string;
  componentId?: string;
  reference?: string;
  detail?: Record<string, unknown>;
}

interface DiffStage {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

interface FileDiffResult {
  file: string;
  durationMs: number;
  stats: {
    components: number;
    reportableComponents: number;
    sceneSymbols: number;
    sceneLabels: number;
    sceneWires: number;
    manualConnections: number;
    integratedComponents?: number;
    lightweightComponents?: number;
    lightweightUnresolved?: number;
    netlistNets?: number;
    netlistIssues?: number;
    drcIssues?: number;
    drcErrors?: number;
    drcWarnings?: number;
  };
  stages: {
    import: DiffStage;
    integrated: DiffStage;
    lightweight: DiffStage;
    netlist: DiffStage;
    drc: DiffStage & { skipped?: boolean };
  };
  anomalyCount: number;
  anomalyReasonCounts: Record<string, number>;
  anomalySeverityCounts: Record<string, number>;
  anomalyCategoryCounts: Record<string, number>;
  anomalies: DiffAnomaly[];
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isFragmentInputError(message: string) {
  return message.includes('서브시트') || message.includes('일부 회로도 조각');
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function compactAnomalies(anomalies: DiffAnomaly[]) {
  const reasonCounts = countBy(anomalies.map(anomaly => anomaly.reason));
  const severityCounts = countBy(anomalies.map(anomaly => anomaly.severity));
  const categoryCounts = countBy(anomalies.map(anomaly => anomaly.category));

  return {
    anomalyCount: anomalies.length,
    anomalyReasonCounts: reasonCounts,
    anomalySeverityCounts: severityCounts,
    anomalyCategoryCounts: categoryCounts,
    anomalies: anomalies.slice(0, maxStoredAnomaliesPerFile),
  };
}

function isReportableComponent(component: Pick<PlacedComponent, 'importedReference' | 'name' | 'templateId' | 'importedMapping'>) {
  return isReportableValidationComponent({
    importedReference: component.importedReference,
    name: component.name,
    templateId: component.templateId,
    libraryId: component.importedMapping?.libraryId,
  });
}

function isNonElectricalComponent(component: Pick<PlacedComponent, 'importedReference' | 'name' | 'templateId' | 'importedMapping'>) {
  return isNonElectricalValidationComponent({
    importedReference: component.importedReference,
    name: component.name,
    templateId: component.templateId,
    libraryId: component.importedMapping?.libraryId,
  });
}

function isPowerComponent(component: Pick<PlacedComponent, 'importedReference' | 'name' | 'templateId' | 'value'>) {
  const text = [
    component.templateId,
    component.importedReference,
    component.name,
    component.value,
  ].join(' ').toUpperCase();
  return (
    component.templateId.startsWith('kicad_gnd') ||
    component.templateId.startsWith('kicad_pwr') ||
    /(?:^|\s)#PWR/.test(text) ||
    /\b(?:GND|GNDPWR|VCC|VDD|VIN|VBUS|VBAT|3V3|3\.3V|5V|12V|24V|PWR_FLAG)\b/.test(text)
  );
}

function isPassiveSymbol(symbol: ImportedSchematicSceneSymbol) {
  return (
    symbol.family === 'passive' ||
    /^[RCLDYC]\d+/i.test(symbol.reference.trim()) ||
    /(?:resistor|capacitor|inductor|crystal|diode|led)/i.test(`${symbol.value} ${symbol.libraryId ?? ''}`)
  );
}

function includePoint(bounds: Rect | null, point: ImportedSchematicPoint): Rect {
  if (!bounds) {
    return { x: point.x, y: point.y, width: 0, height: 0 };
  }
  const minX = Math.min(bounds.x, point.x);
  const minY = Math.min(bounds.y, point.y);
  const maxX = Math.max(bounds.x + bounds.width, point.x);
  const maxY = Math.max(bounds.y + bounds.height, point.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function includeRect(bounds: Rect | null, rect: Rect): Rect {
  let next = includePoint(bounds, { x: rect.x, y: rect.y });
  next = includePoint(next, { x: rect.x + rect.width, y: rect.y + rect.height });
  return next;
}

function primitiveBounds(primitive: ImportedSchematicPrimitive): Rect | null {
  switch (primitive.kind) {
    case 'rect': {
      const x = Math.min(primitive.start.x, primitive.end.x);
      const y = Math.min(primitive.start.y, primitive.end.y);
      return {
        x,
        y,
        width: Math.abs(primitive.end.x - primitive.start.x),
        height: Math.abs(primitive.end.y - primitive.start.y),
      };
    }
    case 'polyline': {
      return primitive.points.reduce<Rect | null>((bounds, point) => includePoint(bounds, point), null);
    }
    case 'circle':
      return {
        x: primitive.center.x - primitive.radius,
        y: primitive.center.y - primitive.radius,
        width: primitive.radius * 2,
        height: primitive.radius * 2,
      };
    case 'arc': {
      let bounds: Rect | null = null;
      bounds = includePoint(bounds, primitive.start);
      bounds = includePoint(bounds, primitive.mid);
      bounds = includePoint(bounds, primitive.end);
      return bounds;
    }
    case 'text':
      return measureImportedTextPrimitiveBox(primitive);
  }
}

function symbolShapeBounds(symbol: ImportedSchematicSceneSymbol): Rect | null {
  let bounds: Rect | null = null;
  for (const primitive of symbol.primitives) {
    if (primitive.kind === 'text') {
      continue;
    }
    const rect = primitiveBounds(primitive);
    if (rect) {
      bounds = includeRect(bounds, rect);
    }
  }
  for (const anchor of symbol.pinAnchors) {
    bounds = includePoint(bounds, anchor.at);
  }
  return bounds;
}

function rectCenter(rect: Rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function rectDistance(a: Rect, b: Rect) {
  const ac = rectCenter(a);
  const bc = rectCenter(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function segmentDistance(point: ImportedSchematicPoint, start: ImportedSchematicPoint, end: ImportedSchematicPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function nearestConnectionDistance(scene: ImportedSchematicScene, point: ImportedSchematicPoint) {
  let best = Infinity;
  for (const wire of scene.wireSegments) {
    best = Math.min(best, segmentDistance(point, wire.start, wire.end));
  }
  for (const junction of scene.junctions) {
    best = Math.min(best, Math.hypot(point.x - junction.x, point.y - junction.y));
  }
  for (const symbol of scene.symbols ?? []) {
    for (const anchor of symbol.pinAnchors) {
      best = Math.min(best, Math.hypot(point.x - anchor.at.x, point.y - anchor.at.y));
    }
  }
  return best;
}

function getTextDisplayAngle(primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>) {
  return getImportedTextDisplayAngle(
    primitive.originalAngle ?? primitive.angle,
    primitive.role,
    {
      preserveNativeOrientation: primitive.preserveNativeOrientation,
      text: primitive.text,
    }
  );
}

function getDisplayedTextBox(primitive: Extract<ImportedSchematicPrimitive, { kind: 'text' }>): Rect {
  return measureImportedTextPrimitiveBox(primitive);
}

function analyzeRender(scene: ImportedSchematicScene | null, anomalies: DiffAnomaly[]) {
  if (!scene) {
    anomalies.push({
      reason: 'render.scene-missing',
      category: 'render',
      severity: 'error',
      message: 'Imported schematic scene is missing.',
    });
    return;
  }

  for (const symbol of scene.symbols ?? []) {
    const shapeBounds = symbolShapeBounds(symbol);
    const propertyTexts = symbol.primitives.filter(
      (primitive): primitive is Extract<ImportedSchematicPrimitive, { kind: 'text' }> =>
        primitive.kind === 'text' && (primitive.role === 'reference' || primitive.role === 'value')
    );

    for (const primitive of propertyTexts) {
      const displayAngle = getTextDisplayAngle(primitive);
      if (displayAngle !== 0 && !primitive.preserveNativeOrientation) {
        anomalies.push({
          reason: 'render.property-text-sideways',
          category: 'render',
          severity: isPassiveSymbol(symbol) ? 'warning' : 'info',
          message: `${symbol.reference} ${primitive.role ?? 'property'} text is rendered sideways.`,
          componentId: symbol.instanceId,
          reference: symbol.reference,
          detail: {
            text: primitive.text,
            sourceAngle: primitive.originalAngle ?? primitive.angle,
            displayAngle,
          },
        });
      }

      if (!shapeBounds) {
        continue;
      }

      const textBox = getDisplayedTextBox(primitive);
      const distance = rectDistance(textBox, shapeBounds);
      const shapeDiagonal = Math.hypot(shapeBounds.width, shapeBounds.height);
      if (distance > Math.max(70, shapeDiagonal * 2.25)) {
        anomalies.push({
          reason: 'render.property-text-far-from-symbol',
          category: 'render',
          severity: 'warning',
          message: `${symbol.reference} ${primitive.role ?? 'property'} text is far from the symbol body.`,
          componentId: symbol.instanceId,
          reference: symbol.reference,
          detail: {
            text: primitive.text,
            distance: Number(distance.toFixed(1)),
            shapeDiagonal: Number(shapeDiagonal.toFixed(1)),
          },
        });
      }

      // Passive value text commonly overlaps the KiCad symbol body by design.
      // Since text is rendered above symbol strokes, this is no longer a useful
      // anomaly signal for visual correctness.
    }
  }

  for (const label of scene.labels) {
    const display = getImportedNetLabelDisplay(label);
    if (display.kind !== 'power' && display.kind !== 'ground') {
      continue;
    }
    const distance = nearestConnectionDistance(scene, label.at);
    if (distance > 14) {
      anomalies.push({
        reason: 'render.power-label-off-connection',
        category: 'render',
        severity: 'warning',
        message: `${label.text} label anchor is not close to any wire, junction, or pin.`,
        detail: {
          text: label.text,
          distance: Number(distance.toFixed(1)),
          at: label.at,
        },
      });
    }
  }
}

function analyzeReportTargets(issues: ProjectAuditIssue[], components: PlacedComponent[], anomalies: DiffAnomaly[]) {
  const componentIds = new Set(components.map(component => component.instanceId));
  const reportableIds = new Set(components.filter(isReportableComponent).map(component => component.instanceId));

  for (const issue of issues) {
    const targetIds = issue.visualTargets?.componentIds ?? [];
    if (issue.severity === 'error' && issue.confidence === 'confirmed' && targetIds.length === 0) {
      anomalies.push({
        reason: 'report.confirmed-error-without-component-target',
        category: 'report',
        severity: 'warning',
        message: `${issue.ruleId ?? issue.code ?? issue.title} is confirmed but has no component visual target.`,
        detail: {
          ruleId: issue.ruleId ?? issue.code,
          title: issue.title,
        },
      });
    }

    for (const componentId of targetIds) {
      if (!componentIds.has(componentId)) {
        anomalies.push({
          reason: 'report.visual-target-missing-component',
          category: 'report',
          severity: 'error',
          message: `${issue.ruleId ?? issue.code ?? issue.title} targets a component that is not in the imported document.`,
          componentId,
          detail: {
            ruleId: issue.ruleId ?? issue.code,
            title: issue.title,
          },
        });
      } else if (!reportableIds.has(componentId)) {
        anomalies.push({
          reason: 'report.visual-target-non-reportable-component',
          category: 'report',
          severity: 'info',
          message: `${issue.ruleId ?? issue.code ?? issue.title} targets a non-reportable helper/power component.`,
          componentId,
          detail: {
            ruleId: issue.ruleId ?? issue.code,
            title: issue.title,
          },
        });
      }
    }
  }
}

function analyzeComponentCoverage(params: {
  components: PlacedComponent[];
  scene: ImportedSchematicScene | null;
  integratedComponents?: number;
  lightweightComponents?: number;
  anomalies: DiffAnomaly[];
}) {
  const { components, scene, integratedComponents, lightweightComponents, anomalies } = params;
  const reportableComponents = components.filter(isReportableComponent);
  const sceneSymbolIds = new Set((scene?.symbols ?? []).map(symbol => symbol.instanceId));
  const lowConfidence = components.filter(component => component.importedMapping?.confidence === 'low').length;
  const generic = components.filter(component => component.importedMapping?.matchedBy === 'generic').length;

  for (const component of reportableComponents) {
    if (!sceneSymbolIds.has(component.instanceId) && !component.importedGeometry) {
      anomalies.push({
        reason: 'render.reportable-component-without-geometry',
        category: 'render',
        severity: 'error',
        message: `${component.importedReference ?? component.name} has no scene symbol or imported geometry.`,
        componentId: component.instanceId,
        reference: component.importedReference ?? component.name,
      });
    }

    const reference = component.importedReference ?? component.name;
    if (/^[RCL]\d+/i.test(reference) && !component.value?.trim()) {
      anomalies.push({
        reason: 'netlist.passive-value-missing',
        category: 'netlist',
        severity: 'warning',
        message: `${reference} has no parsed value, so netlist electrical estimates may fall back.`,
        componentId: component.instanceId,
        reference,
      });
    }
  }

  if (integratedComponents !== undefined) {
    const delta = Math.abs(integratedComponents - reportableComponents.length);
    if (delta > Math.max(3, reportableComponents.length * 0.25)) {
      anomalies.push({
        reason: 'report.integrated-component-count-divergence',
        category: 'report',
        severity: 'warning',
        message: 'Integrated report component count diverges from reportable imported components.',
        detail: {
          integratedComponents,
          reportableComponents: reportableComponents.length,
          delta,
        },
      });
    }
  }

  if (lightweightComponents !== undefined) {
    const nonPowerComponents = components.filter(component => !isPowerComponent(component)).length;
    const nonElectricalExcludedComponents = components.filter(component => !isNonElectricalComponent(component)).length;
    const comparisonTargets = [
      { label: 'all-imported-components', count: components.length },
      { label: 'non-electrical-excluded-components', count: nonElectricalExcludedComponents },
      { label: 'reportable-components', count: reportableComponents.length },
      { label: 'non-power-components', count: nonPowerComponents },
    ].sort((left, right) =>
      Math.abs(lightweightComponents - left.count) - Math.abs(lightweightComponents - right.count)
    );
    const closest = comparisonTargets[0]!;
    const delta = Math.abs(lightweightComponents - closest.count);
    if (delta > Math.max(4, closest.count * 0.35)) {
      anomalies.push({
        reason: 'report.lightweight-component-count-divergence',
        category: 'report',
        severity: 'info',
        message: 'Lightweight report component count diverges from every comparable imported component count.',
        detail: {
          lightweightComponents,
          closestImportedCountKind: closest.label,
          closestImportedCount: closest.count,
          allImportedComponents: components.length,
          nonElectricalExcludedComponents,
          reportableComponents: reportableComponents.length,
          nonPowerComponents,
          delta,
        },
      });
    }
  }

  if (components.length > 0 && lowConfidence / components.length > 0.65) {
    anomalies.push({
      reason: 'mapping.low-confidence-heavy',
      category: 'mapping',
      severity: 'info',
      message: 'Most imported components are low-confidence mappings.',
      detail: {
        lowConfidence,
        components: components.length,
      },
    });
  }

  if (components.length > 0 && generic / components.length > 0.35) {
    anomalies.push({
      reason: 'mapping.generic-heavy',
      category: 'mapping',
      severity: 'info',
      message: 'Many imported components are generic mappings.',
      detail: {
        generic,
        components: components.length,
      },
    });
  }
}

async function readCompletedResults(filePath: string) {
  const text = await readFile(filePath, 'utf8').catch(() => '');
  const results: FileDiffResult[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      results.push(JSON.parse(trimmed) as FileDiffResult);
    } catch {
      // Keep resume robust if the previous run was interrupted mid-write.
    }
  }

  return results;
}

async function analyzeFile(file: string): Promise<FileDiffResult> {
  const startedAt = Date.now();
  const anomalies: DiffAnomaly[] = [];
  const stages: FileDiffResult['stages'] = {
    import: { ok: false },
    integrated: { ok: false },
    lightweight: { ok: false },
    netlist: { ok: false },
    drc: includeDrc ? { ok: false } : { ok: true, skipped: true },
  };
  const stats: FileDiffResult['stats'] = {
    components: 0,
    reportableComponents: 0,
    sceneSymbols: 0,
    sceneLabels: 0,
    sceneWires: 0,
    manualConnections: 0,
  };

  try {
    const source = await readFile(file, 'utf8');
    const imported = importKiCadSchematic(source);
    const document = imported.document;
    const scene = document.importedSchematicScene ?? null;
    const components = document.components;
    const customTemplates = new Map(
      (document.customComponentPackages ?? []).map(pkg => [
        pkg.templateId,
        customComponentPackageToTemplate(pkg),
      ])
    );
    const resolveTemplate = (templateId: string) => getStaticTemplateById(templateId) ?? customTemplates.get(templateId);

    stages.import = { ok: true };
    stats.components = components.length;
    stats.reportableComponents = components.filter(isReportableComponent).length;
    stats.sceneSymbols = scene?.symbols?.length ?? 0;
    stats.sceneLabels = scene?.labels.length ?? 0;
    stats.sceneWires = scene?.wireSegments.length ?? 0;
    stats.manualConnections = document.manualConnections?.length ?? 0;

    analyzeRender(scene, anomalies);

    try {
      const payload = buildImportedSchematicIntegratedValidationJson({
        document,
        importedSource: source,
        importSummary: imported.summary,
      });
      if (!payload) {
        stages.integrated = { ok: false, error: 'integrated-json-null' };
        anomalies.push({
          reason: 'report.integrated-json-null',
          category: 'report',
          severity: 'error',
          message: 'Integrated validation JSON returned null.',
        });
      } else {
        stages.integrated = { ok: true };
        stats.integratedComponents = payload.components.length;
      }
    } catch (error) {
      stages.integrated = { ok: false, error: summarizeError(error) };
      anomalies.push({
        reason: 'report.integrated-json-failed',
        category: 'report',
        severity: 'error',
        message: 'Integrated validation JSON generation failed.',
        detail: { error: summarizeError(error) },
      });
    }

    try {
      const payload = parseKiCadSchematicToLightweightValidationJson(source, {
        projectName: path.basename(file, '.kicad_sch'),
        allowFragmentInput: true,
      });
      stages.lightweight = { ok: true };
      stats.lightweightComponents = payload.components.length;
      stats.lightweightUnresolved = payload.unresolved.symbols.length;
    } catch (error) {
      stages.lightweight = { ok: false, error: summarizeError(error) };
      anomalies.push({
        reason: 'report.lightweight-json-failed',
        category: 'report',
        severity: 'error',
        message: 'Lightweight validation JSON generation failed.',
        detail: { error: summarizeError(error) },
      });
    }

    try {
      const report = analyzeCircuitNetlist(
        components,
        document.activeBoardId,
        resolveTemplate,
        document.manualConnections ?? []
      );
      stages.netlist = { ok: true };
      stats.netlistNets = report.nets.length;
      stats.netlistIssues = report.issues.length;
    } catch (error) {
      stages.netlist = { ok: false, error: summarizeError(error) };
      anomalies.push({
        reason: 'netlist.analysis-failed',
        category: 'netlist',
        severity: 'error',
        message: 'Circuit netlist analysis failed.',
        detail: { error: summarizeError(error) },
      });
    }

    let drcIssues: ProjectAuditIssue[] = [];
    if (includeDrc) {
      try {
        const report = runProjectDrc({
          components,
          manualConnections: document.manualConnections ?? [],
          boardId: document.activeBoardId,
          resolveTemplate,
          importedSchematicScene: scene,
          powerInputMode: document.powerInputMode,
          componentPowerModes: document.componentPowerModes ?? {},
          componentUnusedPinModes: document.componentUnusedPinModes ?? {},
          generatedCode: document.generatedCode,
          footprintPinPadOverrideCache: {},
        });
        drcIssues = report.issues;
        stages.drc = { ok: true };
        stats.drcIssues = report.issues.length;
        stats.drcErrors = report.issues.filter(issue => issue.severity === 'error').length;
        stats.drcWarnings = report.issues.filter(issue => issue.severity === 'warning').length;
        analyzeReportTargets(report.issues, components, anomalies);
      } catch (error) {
        stages.drc = { ok: false, error: summarizeError(error) };
        anomalies.push({
          reason: 'report.drc-failed',
          category: 'report',
          severity: 'error',
          message: 'Project DRC failed.',
          detail: { error: summarizeError(error) },
        });
      }
    }

    analyzeComponentCoverage({
      components,
      scene,
      integratedComponents: stats.integratedComponents,
      lightweightComponents: stats.lightweightComponents,
      anomalies,
    });

    if (includeDrc && drcIssues.some(issue => issue.ruleId === 'engine.runtime-error')) {
      anomalies.push({
        reason: 'report.runtime-issue',
        category: 'report',
        severity: 'error',
        message: 'DRC emitted an engine runtime issue.',
      });
    }
  } catch (error) {
    const message = summarizeError(error);
    if (isFragmentInputError(message)) {
      stages.import = { ok: false, skipped: true, error: message };
      stages.integrated = { ok: false, skipped: true, error: 'fragment-input' };
      stages.lightweight = { ok: false, skipped: true, error: 'fragment-input' };
      stages.netlist = { ok: false, skipped: true, error: 'fragment-input' };
      stages.drc = { ok: false, skipped: true, error: 'fragment-input' };
      anomalies.push({
        reason: 'parser.fragment-input',
        category: 'parser',
        severity: 'info',
        message: 'This schematic appears to be a subsheet or schematic fragment; upload the main .kicad_sch for full validation.',
        detail: { error: message },
      });
    } else {
      stages.import = { ok: false, error: message };
      stages.integrated = { ok: false, skipped: true, error: 'import-failed' };
      stages.lightweight = { ok: false, skipped: true, error: 'import-failed' };
      stages.netlist = { ok: false, skipped: true, error: 'import-failed' };
      stages.drc = { ok: false, skipped: true, error: 'import-failed' };
      anomalies.push({
        reason: 'parser.import-failed',
        category: 'parser',
        severity: 'error',
        message: 'KiCad import failed.',
        detail: { error: message },
      });
    }
  }

  const compacted = compactAnomalies(anomalies);

  return {
    file,
    durationMs: Date.now() - startedAt,
    stats,
    stages,
    ...compacted,
  };
}

function buildSummary(results: FileDiffResult[], totalFiles: number, elapsedMs: number) {
  const reasonCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};

  for (const result of results) {
    for (const [reason, count] of Object.entries(result.anomalyReasonCounts ?? countBy(result.anomalies.map(anomaly => anomaly.reason)))) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + count;
    }
    for (const [category, count] of Object.entries(result.anomalyCategoryCounts ?? countBy(result.anomalies.map(anomaly => anomaly.category)))) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + count;
    }
    for (const [severity, count] of Object.entries(result.anomalySeverityCounts ?? countBy(result.anomalies.map(anomaly => anomaly.severity)))) {
      severityCounts[severity] = (severityCounts[severity] ?? 0) + count;
    }
  }

  const errorFiles = results.filter(result => (result.anomalySeverityCounts?.error ?? 0) > 0);
  const warningFiles = results.filter(result => (result.anomalySeverityCounts?.warning ?? 0) > 0);

  return {
    datasetRoot,
    includeDrc,
    totalFiles,
    completedFiles: results.length,
    elapsedMs,
    filesWithAnomalies: results.filter(result => result.anomalies.length > 0).length,
    filesWithErrors: errorFiles.length,
    filesWithWarnings: warningFiles.length,
    anomalyCount: results.reduce((sum, result) => sum + (result.anomalyCount ?? result.anomalies.length), 0),
    reasonCounts,
    categoryCounts,
    severityCounts,
    failures: {
      import: results.filter(result => !result.stages.import.ok && !result.stages.import.skipped).length,
      integrated: results.filter(result => !result.stages.integrated.ok && !result.stages.integrated.skipped).length,
      lightweight: results.filter(result => !result.stages.lightweight.ok && !result.stages.lightweight.skipped).length,
      netlist: results.filter(result => !result.stages.netlist.ok && !result.stages.netlist.skipped).length,
      drc: includeDrc ? results.filter(result => !result.stages.drc.ok && !result.stages.drc.skipped).length : 0,
    },
    aggregate: {
      components: results.reduce((sum, result) => sum + result.stats.components, 0),
      reportableComponents: results.reduce((sum, result) => sum + result.stats.reportableComponents, 0),
      sceneSymbols: results.reduce((sum, result) => sum + result.stats.sceneSymbols, 0),
      sceneLabels: results.reduce((sum, result) => sum + result.stats.sceneLabels, 0),
      sceneWires: results.reduce((sum, result) => sum + result.stats.sceneWires, 0),
      manualConnections: results.reduce((sum, result) => sum + result.stats.manualConnections, 0),
      drcErrors: results.reduce((sum, result) => sum + (result.stats.drcErrors ?? 0), 0),
      drcWarnings: results.reduce((sum, result) => sum + (result.stats.drcWarnings ?? 0), 0),
    },
    topExamples: [...results]
      .filter(result => result.anomalies.length > 0)
      .sort((a, b) => {
        const score = (result: FileDiffResult) =>
          (result.anomalySeverityCounts?.error ?? 0) * 1000 +
          (result.anomalySeverityCounts?.warning ?? 0) * 100 +
          (result.anomalyCount ?? result.anomalies.length);
        return score(b) - score(a);
      })
      .slice(0, 50)
      .map(result => ({
        file: result.file,
        durationMs: result.durationMs,
        stats: result.stats,
        anomalyCount: result.anomalyCount ?? result.anomalies.length,
        reasons: result.anomalyReasonCounts ?? countBy(result.anomalies.map(anomaly => anomaly.reason)),
        sampleAnomalies: result.anomalies.slice(0, 12),
      })),
  };
}

async function main() {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(jsonlPath), { recursive: true });
  if (reset) {
    await rm(outputPath, { force: true });
    await rm(jsonlPath, { force: true });
  }

  const files = (await collectKiCadSchematicFilesFromRoots([datasetRoot])).slice(0, limit);
  const completed = await readCompletedResults(jsonlPath);
  const completedFiles = new Set(completed.map(result => result.file));
  const pendingFiles = files.filter(file => !completedFiles.has(file));
  const results = [...completed];
  const startedAt = Date.now();
  let nextIndex = 0;

  console.error(`[kicad-diff] total=${files.length} completed=${completed.length} pending=${pendingFiles.length} concurrency=${concurrency} includeDrc=${includeDrc}`);

  async function worker() {
    while (nextIndex < pendingFiles.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = pendingFiles[index]!;
      const result = await analyzeFile(file);
      results.push(result);
      await appendFile(jsonlPath, `${JSON.stringify(result)}\n`);

      const completedCount = completed.length + index + 1;
      if (completedCount % 100 === 0 || (result.anomalySeverityCounts.error ?? 0) > 0) {
        console.error(`[kicad-diff] ${completedCount}/${files.length} ${path.basename(file)} anomalies=${result.anomalyCount} errors=${result.anomalySeverityCounts.error ?? 0} durationMs=${result.durationMs}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pendingFiles.length) }, () => worker()));

  const summary = buildSummary(results, files.length, Date.now() - startedAt);
  await writeFile(outputPath, JSON.stringify(writeFullResults ? { summary, results } : { summary }, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

await main();
