import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import { runProjectDrc } from '@/lib/drc-engine';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import { collectKiCadSchematicFilesFromRoots } from '@/lib/kicad-regression-scan';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import {
  isNonElectricalValidationComponent,
  isReportableValidationComponent,
} from '@/lib/validation-reportable-component-policy';
import { parseKiCadSchematicToLightweightValidationJson } from '@/lib/v3-kicad-parser';
import type { PlacedComponent } from '@/types';

const datasetRoot = process.env.KICAD_DATASET_ROOT ?? '/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset';
const outputPath = process.env.KICAD_AUDIT_OUTPUT ?? './tmp/clean-kicad-deep-drc-summary.json';
const jsonlPath = process.env.KICAD_AUDIT_JSONL ?? './tmp/clean-kicad-deep-drc-results.jsonl';
const limit = Number(process.env.KICAD_AUDIT_LIMIT ?? '0') || Infinity;
const concurrency = Math.max(1, Number(process.env.KICAD_AUDIT_CONCURRENCY ?? '6') || 6);
const reset = process.env.KICAD_AUDIT_RESET === '1';

type AuditStageSummary = {
  ok: boolean;
  error?: string;
};

type DeepDrcAuditResult = {
  file: string;
  durationMs: number;
  componentCount: number;
  reportableComponentCount: number;
  nonReportableComponentCount: number;
  valueCoverage: number;
  customFallbackComponents: number;
  lowConfidenceComponents: number;
  genericComponents: number;
  scene: {
    symbols: number;
    wires: number;
    labels: number;
    noConnects: number;
    drawings: number;
  } | null;
  manualConnections: number;
  integrated: AuditStageSummary & {
    components?: number;
    nets?: number;
    flags?: number;
  };
  lightweight: AuditStageSummary & {
    components?: number;
    nets?: number;
    unresolved?: number;
  };
  netlist: AuditStageSummary & {
    nets?: number;
    issues?: number;
    capacitors?: number;
    resistors?: number;
  };
  drc: AuditStageSummary & {
    issues?: number;
    errors?: number;
    warnings?: number;
    infos?: number;
    runtime?: number;
    importedHardErrors?: number;
    topRules?: Record<string, number>;
  };
  suspiciousReasons: string[];
};

function countBy<T extends string>(items: T[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAuditReportableComponent(component: Pick<PlacedComponent, 'importedReference' | 'name' | 'templateId' | 'importedMapping'>) {
  return isReportableValidationComponent({
    importedReference: component.importedReference,
    name: component.name,
    templateId: component.templateId,
    libraryId: component.importedMapping?.libraryId,
  });
}

function isAuditNonElectricalComponent(component: Pick<PlacedComponent, 'importedReference' | 'name' | 'templateId' | 'importedMapping'>) {
  return isNonElectricalValidationComponent({
    importedReference: component.importedReference,
    name: component.name,
    templateId: component.templateId,
    libraryId: component.importedMapping?.libraryId,
  });
}

async function readCompletedResults(filePath: string) {
  const text = await readFile(filePath, 'utf8').catch(() => '');
  const results: DeepDrcAuditResult[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      results.push(JSON.parse(trimmed) as DeepDrcAuditResult);
    } catch {
      // Keep the audit resumable even if the last line was interrupted.
    }
  }

  return results;
}

async function auditFile(file: string): Promise<DeepDrcAuditResult> {
  const startedAt = Date.now();
  const source = await readFile(file, 'utf8');
  const imported = importKiCadSchematic(source);
  const document = imported.document;
  const scene = document.importedSchematicScene;
  const customTemplates = new Map(
    (document.customComponentPackages ?? []).map(pkg => [
      pkg.templateId,
      customComponentPackageToTemplate(pkg),
    ])
  );
  const resolveTemplate = (templateId: string) => getStaticTemplateById(templateId) ?? customTemplates.get(templateId);
  const components = document.components;
  const reportableComponents = components.filter(isAuditReportableComponent);
  const nonElectricalExcludedComponentCount = components.filter(component => !isAuditNonElectricalComponent(component)).length;
  const importedValues = components.filter(component => component.value?.trim()).length;
  const customFallbackComponents = components.filter(component => component.importedMapping?.matchedBy === 'custom-fallback').length;
  const lowConfidenceComponents = components.filter(component => component.importedMapping?.confidence === 'low').length;
  const genericComponents = components.filter(component => component.importedMapping?.matchedBy === 'generic').length;

  let integrated: DeepDrcAuditResult['integrated'] = { ok: false };
  try {
    const payload = buildImportedSchematicIntegratedValidationJson({
      document,
      importedSource: source,
      importSummary: imported.summary,
    });
    integrated = payload
      ? {
          ok: true,
          components: payload.components.length,
          nets: payload.nets.length,
          flags: payload.validationFlags.length,
        }
      : { ok: false, error: 'integrated-json-null' };
  } catch (error) {
    integrated = { ok: false, error: summarizeError(error) };
  }

  let lightweight: DeepDrcAuditResult['lightweight'] = { ok: false };
  try {
    const payload = parseKiCadSchematicToLightweightValidationJson(source, {
      projectName: path.basename(file, '.kicad_sch'),
      allowFragmentInput: true,
    });
    lightweight = {
      ok: true,
      components: payload.components.length,
      nets: payload.nets.length,
      unresolved: payload.unresolved.symbols.length,
    };
  } catch (error) {
    lightweight = { ok: false, error: summarizeError(error) };
  }

  let netlist: DeepDrcAuditResult['netlist'] = { ok: false };
  try {
    const report = analyzeCircuitNetlist(
      components,
      document.activeBoardId,
      resolveTemplate,
      document.manualConnections ?? []
    );
    netlist = {
      ok: true,
      nets: report.nets.length,
      issues: report.issues.length,
      capacitors: report.capacitors?.length ?? 0,
      resistors: report.resistors.length,
    };
  } catch (error) {
    netlist = { ok: false, error: summarizeError(error) };
  }

  let drc: DeepDrcAuditResult['drc'] = { ok: false };
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
    const severities = countBy(report.issues.map(issue => issue.severity));
    const topRules = Object.fromEntries(
      Object.entries(countBy(report.issues.map(issue => issue.ruleId ?? issue.code ?? 'unknown')))
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
    );
    drc = {
      ok: true,
      issues: report.issues.length,
      errors: severities.error ?? 0,
      warnings: severities.warning ?? 0,
      infos: severities.info ?? 0,
      runtime: report.issues.filter(issue => issue.ruleId === 'engine.runtime-error').length,
      importedHardErrors: report.issues.filter(issue =>
        issue.severity === 'error' &&
        (issue.ruleId ?? issue.code ?? '').startsWith('imported.')
      ).length,
      topRules,
    };
  } catch (error) {
    drc = { ok: false, error: summarizeError(error) };
  }

  const suspiciousReasons: string[] = [];
  if (!integrated.ok) suspiciousReasons.push('integrated-json-failed');
  if (!lightweight.ok) suspiciousReasons.push('lightweight-json-failed');
  if (!netlist.ok) suspiciousReasons.push('netlist-failed');
  if (!drc.ok) suspiciousReasons.push('drc-failed');
  if ((drc.runtime ?? 0) > 0) suspiciousReasons.push('drc-runtime-issue');
  if (scene && components.length > 0 && (scene.symbols?.length ?? 0) === 0) suspiciousReasons.push('scene-symbols-empty');
  if (scene && scene.wireSegments.length > 0 && (document.manualConnections?.length ?? 0) === 0) suspiciousReasons.push('wires-without-manual-connections');
  if (integrated.ok && Math.abs((integrated.components ?? 0) - reportableComponents.length) > Math.max(3, reportableComponents.length * 0.25)) {
    suspiciousReasons.push('integrated-component-count-divergence');
  }
  if (
    lightweight.ok &&
    Math.abs((lightweight.components ?? 0) - nonElectricalExcludedComponentCount) >
      Math.max(3, nonElectricalExcludedComponentCount * 0.35)
  ) {
    suspiciousReasons.push('lightweight-component-count-divergence');
  }
  if (components.length > 0 && importedValues / components.length < 0.35) suspiciousReasons.push('low-value-coverage');
  if (lowConfidenceComponents / Math.max(1, components.length) > 0.6) suspiciousReasons.push('low-confidence-heavy');
  if ((drc.importedHardErrors ?? 0) > Math.max(8, components.length * 0.2)) suspiciousReasons.push('imported-hard-error-heavy');

  return {
    file,
    durationMs: Date.now() - startedAt,
    componentCount: components.length,
    reportableComponentCount: reportableComponents.length,
    nonReportableComponentCount: components.length - reportableComponents.length,
    valueCoverage: Number((importedValues / Math.max(1, components.length)).toFixed(3)),
    customFallbackComponents,
    lowConfidenceComponents,
    genericComponents,
    scene: scene
      ? {
          symbols: scene.symbols?.length ?? 0,
          wires: scene.wireSegments.length,
          labels: scene.labels.length,
          noConnects: scene.noConnects?.length ?? 0,
          drawings: scene.drawings?.length ?? 0,
        }
      : null,
    manualConnections: document.manualConnections?.length ?? 0,
    integrated,
    lightweight,
    netlist,
    drc,
    suspiciousReasons,
  };
}

function buildSummary(results: DeepDrcAuditResult[], totalFiles: number, elapsedMs: number) {
  const suspicious = results.filter(result => result.suspiciousReasons.length > 0);
  return {
    datasetRoot,
    totalFiles,
    completedFiles: results.length,
    elapsedMs,
    suspiciousFiles: suspicious.length,
    reasonCounts: countBy(suspicious.flatMap(result => result.suspiciousReasons)),
    failures: {
      integrated: results.filter(result => !result.integrated.ok).length,
      lightweight: results.filter(result => !result.lightweight.ok).length,
      netlist: results.filter(result => !result.netlist.ok).length,
      drc: results.filter(result => !result.drc.ok).length,
      runtime: results.filter(result => (result.drc.runtime ?? 0) > 0).length,
    },
    aggregate: {
      components: results.reduce((sum, result) => sum + result.componentCount, 0),
      reportableComponents: results.reduce((sum, result) => sum + result.reportableComponentCount, 0),
      manualConnections: results.reduce((sum, result) => sum + result.manualConnections, 0),
      drcErrors: results.reduce((sum, result) => sum + (result.drc.errors ?? 0), 0),
      drcWarnings: results.reduce((sum, result) => sum + (result.drc.warnings ?? 0), 0),
      importedHardErrors: results.reduce((sum, result) => sum + (result.drc.importedHardErrors ?? 0), 0),
    },
    slowestFiles: [...results]
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 25)
      .map(result => ({
        file: result.file,
        durationMs: result.durationMs,
        componentCount: result.componentCount,
        drcIssues: result.drc.issues ?? 0,
      })),
    topSuspicious: suspicious
      .sort((left, right) => {
        const leftScore = left.suspiciousReasons.length * 100 + (left.drc.runtime ?? 0) * 50 + (left.drc.importedHardErrors ?? 0);
        const rightScore = right.suspiciousReasons.length * 100 + (right.drc.runtime ?? 0) * 50 + (right.drc.importedHardErrors ?? 0);
        return rightScore - leftScore;
      })
      .slice(0, 100),
  };
}

async function main() {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(jsonlPath), { recursive: true });
  if (reset) {
    await rm(jsonlPath, { force: true });
    await rm(outputPath, { force: true });
  }

  const files = (await collectKiCadSchematicFilesFromRoots([datasetRoot])).slice(0, limit);
  const startedAt = Date.now();
  const completed = await readCompletedResults(jsonlPath);
  const completedFiles = new Set(completed.map(result => result.file));
  const results = [...completed];
  const pendingFiles = files.filter(file => !completedFiles.has(file));
  let nextIndex = 0;

  console.error(`[deep-drc] total=${files.length} completed=${completed.length} pending=${pendingFiles.length} concurrency=${concurrency}`);

  async function worker() {
    while (nextIndex < pendingFiles.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = pendingFiles[index]!;
      let result: DeepDrcAuditResult;
      try {
        result = await auditFile(file);
      } catch (error) {
        result = {
          file,
          durationMs: 0,
          componentCount: 0,
          reportableComponentCount: 0,
          nonReportableComponentCount: 0,
          valueCoverage: 0,
          customFallbackComponents: 0,
          lowConfidenceComponents: 0,
          genericComponents: 0,
          scene: null,
          manualConnections: 0,
          integrated: { ok: false, error: 'not-run' },
          lightweight: { ok: false, error: 'not-run' },
          netlist: { ok: false, error: 'not-run' },
          drc: { ok: false, error: summarizeError(error) },
          suspiciousReasons: ['top-level-failed'],
        };
      }

      results.push(result);
      await appendFile(jsonlPath, `${JSON.stringify(result)}\n`);

      const completedCount = completed.length + index + 1;
      if (completedCount % 50 === 0 || result.suspiciousReasons.length > 0) {
        console.error(`[deep-drc] ${completedCount}/${files.length} ${path.basename(file)} suspicious=${result.suspiciousReasons.join(',') || '-'} durationMs=${result.durationMs}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pendingFiles.length) }, () => worker()));

  const summary = buildSummary(results, files.length, Date.now() - startedAt);
  await writeFile(outputPath, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

await main();
