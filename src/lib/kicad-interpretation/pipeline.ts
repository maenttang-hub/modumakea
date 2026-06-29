import type {
  CoarseRegion,
  FineRegionObservation,
  GeometryMatchResult,
  LlmHypothesisProvider,
  InterpretationApiCallLogEntry,
  InterpretationParsedSchematic,
  InterpretationReport,
  InterpretationStageContext,
  PatternMatchResult,
} from '@/lib/kicad-interpretation/contracts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { adaptKiCadSourceToInterpretationParsed } from '@/lib/kicad-interpretation/parser/adapter';
import { getInterpretationThresholds } from '@/lib/kicad-interpretation/thresholds';
import { buildCoordValidationReport, mmToPx, pxToMm } from '@/lib/kicad-interpretation/calibration';
import { matchRegionsByGeometry } from '@/lib/kicad-interpretation/matcher/geometry';
import { matchRegionsByPattern } from '@/lib/kicad-interpretation/matcher/pattern';
import { resolveInterpretationRules } from '@/lib/kicad-interpretation/matcher/rules';
import { resolveHierarchyForParsedSchematic } from '@/lib/kicad-interpretation/hierarchy';
import {
  createLlmHypothesisProviderFromEnv,
  createStubLlmHypothesisProvider,
  generateGatedLlmHypotheses,
} from '@/lib/kicad-interpretation/llm/hypothesis';
import { createVisionAdapterFromEnv } from '@/lib/kicad-interpretation/vision/adapter';
import { renderCroppedSvgArtifacts, renderFullSchematicArtifacts } from '@/lib/kicad-interpretation/renderer';
import type { CoordMap } from '@/lib/kicad-interpretation/renderer';

export function createInterpretationStageContext(sourceFile: string, workingDirectory?: string): InterpretationStageContext {
  return {
    sourceFile,
    workingDirectory,
    thresholds: getInterpretationThresholds(),
  };
}

export function parseSchematicForInterpretation(source: string, sourceFile: string): InterpretationParsedSchematic {
  return adaptKiCadSourceToInterpretationParsed(source, sourceFile);
}

export function createEmptyInterpretationReport(params: {
  sourceFile: string;
  thresholdsVersion: string;
  environmentCheck?: string;
}): InterpretationReport {
  return {
    source_file: params.sourceFile,
    generated_at: new Date().toISOString(),
    thresholds_version: params.thresholdsVersion,
    environment_check: params.environmentCheck,
    blocks: [],
    review_needed: [],
    errors: [],
  };
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function uniqueStrings(values: ReadonlyArray<string>) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function isPowerSymbol(symbol: InterpretationParsedSchematic['symbols'][number]) {
  return symbol.reference.startsWith('#PWR') || /^power:/i.test(symbol.lib_id);
}

function isConnectorLikeSymbol(symbol: InterpretationParsedSchematic['symbols'][number]) {
  return /^J\d+/i.test(symbol.reference) || /connector|header|conn_/i.test(symbol.lib_id);
}

function isPassiveLikeSymbol(symbol: InterpretationParsedSchematic['symbols'][number]) {
  return /^(R|C|L)\d+/i.test(symbol.reference) || /^(device:(r|c|l)|device:cp)/i.test(symbol.lib_id);
}

function getSymbolBBoxMm(symbol: InterpretationParsedSchematic['symbols'][number]) {
  if (symbol.bbox_mm) {
    return symbol.bbox_mm;
  }
  const [x, y] = symbol.position_mm;
  return [x, y, x, y] as const;
}

function getSymbolCenterMm(symbol: InterpretationParsedSchematic['symbols'][number]) {
  const bbox = getSymbolBBoxMm(symbol);
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] as const;
}

function mmDistance(left: readonly [number, number], right: readonly [number, number]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function clampBBoxMm(
  bbox: readonly [number, number, number, number],
  pageSettings: InterpretationParsedSchematic['page_settings']
) {
  const width = pageSettings?.width_mm ?? 297;
  const height = pageSettings?.height_mm ?? 210;
  return [
    Math.max(0, Number(bbox[0].toFixed(3))),
    Math.max(0, Number(bbox[1].toFixed(3))),
    Math.min(width, Number(bbox[2].toFixed(3))),
    Math.min(height, Number(bbox[3].toFixed(3))),
  ] as const;
}

function inferPowerSignalName(symbol: InterpretationParsedSchematic['symbols'][number]) {
  const fromLibId = symbol.lib_id.split(':').pop()?.trim();
  if (fromLibId) {
    return fromLibId.replace(/^power:/i, '');
  }
  return symbol.value?.trim() || symbol.reference;
}

function collectSymbolClusterRegions(parsed: InterpretationParsedSchematic, coordMap: CoordMap): CoarseRegion[] {
  const candidateSymbols = parsed.symbols.filter(symbol => !isPowerSymbol(symbol));
  if (candidateSymbols.length === 0) {
    return [];
  }

  const byReference = new Map(parsed.symbols.map(symbol => [symbol.reference, symbol] as const));
  const adjacency = new Map(candidateSymbols.map(symbol => [symbol.reference, new Set<string>()]));
  const proximityThresholdMm = 32;

  for (let index = 0; index < candidateSymbols.length; index += 1) {
    for (let inner = index + 1; inner < candidateSymbols.length; inner += 1) {
      const left = candidateSymbols[index]!;
      const right = candidateSymbols[inner]!;
      if (mmDistance(getSymbolCenterMm(left), getSymbolCenterMm(right)) <= proximityThresholdMm) {
        adjacency.get(left.reference)?.add(right.reference);
        adjacency.get(right.reference)?.add(left.reference);
      }
    }
  }

  for (const net of parsed.nets) {
    const refs = uniqueStrings(
      net.connected_pins
        .map(([reference]) => reference)
        .filter(reference => {
          const symbol = byReference.get(reference);
          return Boolean(symbol && !isPowerSymbol(symbol));
        })
    );

    if (refs.length < 2 || refs.length > 8) {
      continue;
    }

    for (let index = 0; index < refs.length; index += 1) {
      for (let inner = index + 1; inner < refs.length; inner += 1) {
        adjacency.get(refs[index]!)?.add(refs[inner]!);
        adjacency.get(refs[inner]!)?.add(refs[index]!);
      }
    }
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const symbol of candidateSymbols) {
    if (visited.has(symbol.reference)) {
      continue;
    }

    const stack = [symbol.reference];
    const component: string[] = [];
    visited.add(symbol.reference);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) {
          continue;
        }
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  return components
    .flatMap((refs, index): CoarseRegion[] => {
      const memberSymbols = refs
        .map(reference => byReference.get(reference))
        .filter((symbol): symbol is InterpretationParsedSchematic['symbols'][number] => Boolean(symbol));

      if (memberSymbols.length === 0) {
        return [];
      }

      if (
        memberSymbols.length === 1 &&
        !isConnectorLikeSymbol(memberSymbols[0]!) &&
        !memberSymbols[0]!.lib_id.toLowerCase().includes('mcu')
      ) {
        return [];
      }

      const bboxes = memberSymbols.map(getSymbolBBoxMm);
      const rawBBox: readonly [number, number, number, number] = [
        Math.min(...bboxes.map(bbox => bbox[0])) - 8,
        Math.min(...bboxes.map(bbox => bbox[1])) - 8,
        Math.max(...bboxes.map(bbox => bbox[2])) + 8,
        Math.max(...bboxes.map(bbox => bbox[3])) + 8,
      ] as const;
      const bboxMm = clampBBoxMm(rawBBox, parsed.page_settings);
      const topLeft = mmToPx(bboxMm[0], bboxMm[1], coordMap);
      const bottomRight = mmToPx(bboxMm[2], bboxMm[3], coordMap);

      const connectedPowerSignals = uniqueStrings(
        parsed.nets.flatMap(net => {
          const touchesCluster = net.connected_pins.some(([reference]) => refs.includes(reference));
          if (!touchesCluster) {
            return [];
          }
          return net.connected_pins.flatMap(([reference]) => {
            const symbol = byReference.get(reference);
            return symbol && isPowerSymbol(symbol) ? [inferPowerSignalName(symbol)] : [];
          });
        })
      );

      const connectorPinHints = memberSymbols.flatMap(symbol => {
        if (!isConnectorLikeSymbol(symbol) && memberSymbols.length > 3) {
          return [];
        }
        return symbol.pins.slice(0, 8).map(pin => pin.name).filter(name => /[A-Za-z]/.test(name));
      });

      const observedShapeTags = uniqueStrings([
        'symbol_cluster',
        memberSymbols.some(isConnectorLikeSymbol) ? 'connector_cluster' : '',
        memberSymbols.every(isPassiveLikeSymbol) ? 'passive_group' : '',
      ]);

      return [{
        region_id: `cluster:${String(index + 1).padStart(4, '0')}`,
        bbox_px: [
          Math.round(topLeft[0]),
          Math.round(topLeft[1]),
          Math.round(bottomRight[0]),
          Math.round(bottomRight[1]),
        ] as const,
        observed_shape_tags: observedShapeTags,
        ocr_like_texts: uniqueStrings([
          ...memberSymbols.map(symbol => symbol.reference),
          ...memberSymbols.flatMap(symbol => (symbol.value && symbol.value.length <= 32 ? [symbol.value] : [])),
          ...connectedPowerSignals,
          ...connectorPinHints,
        ]),
        visual_density:
          memberSymbols.length >= 8 ? 'high' as const : memberSymbols.length >= 4 ? 'medium' as const : 'low' as const,
        sub_candidates: uniqueStrings(memberSymbols.map(symbol => symbol.lib_id.split(':').pop() ?? symbol.lib_id)).slice(0, 8),
        freeform_observation: `Fallback symbol cluster with ${memberSymbols.length} symbols.`,
      } satisfies CoarseRegion];
    });
}

export function defaultCoarseRegionsFromParsed(parsed: InterpretationParsedSchematic, coordMap: CoordMap): CoarseRegion[] {
  const rectRegions = parsed.rects.map(rect => {
    const topLeft = mmToPx(rect.bbox_mm[0], rect.bbox_mm[1], coordMap);
    const bottomRight = mmToPx(rect.bbox_mm[2], rect.bbox_mm[3], coordMap);
    return {
      region_id: `rect:${rect.id}`,
      bbox_px: [
        Math.round(topLeft[0]),
        Math.round(topLeft[1]),
        Math.round(bottomRight[0]),
        Math.round(bottomRight[1]),
      ] as const,
      observed_shape_tags: ['boxed_region'],
      ocr_like_texts: rect.nearby_labels.map(label => label.text),
      visual_density: 'medium' as const,
    };
  });

  const sheetRegions = parsed.sheets.map(sheet => {
    const topLeft = mmToPx(sheet.bbox_mm[0], sheet.bbox_mm[1], coordMap);
    const bottomRight = mmToPx(sheet.bbox_mm[2], sheet.bbox_mm[3], coordMap);
    return {
      region_id: `sheet:${sheet.id}`,
      bbox_px: [
        Math.round(topLeft[0]),
        Math.round(topLeft[1]),
        Math.round(bottomRight[0]),
        Math.round(bottomRight[1]),
      ] as const,
      observed_shape_tags: ['sheet_box'],
      ocr_like_texts: (sheet.nearby_labels ?? []).map(label => label.text),
      visual_density: 'medium' as const,
    };
  });

  const explicitRegions = [...rectRegions, ...sheetRegions];
  if (explicitRegions.length > 0) {
    return explicitRegions;
  }

  return collectSymbolClusterRegions(parsed, coordMap);
}

function defaultFineRegions(regions: ReadonlyArray<CoarseRegion>): FineRegionObservation[] {
  return regions.map(region => ({
    region_id: region.region_id,
    visible_texts: [...region.ocr_like_texts],
    observed_shape_tags: [...region.observed_shape_tags],
    confidence_hint: 'medium',
  }));
}

function buildCalibrationAnchors(parsed: InterpretationParsedSchematic, coordMap: CoordMap) {
  const anchors: Array<{ parser_mm: readonly [number, number]; observed_px: readonly [number, number] }> = [];
  for (const symbol of parsed.symbols.slice(0, 6)) {
    anchors.push({
      parser_mm: symbol.position_mm,
      observed_px: mmToPx(symbol.position_mm[0], symbol.position_mm[1], coordMap),
    });
  }
  for (const sheet of parsed.sheets.slice(0, 4)) {
    anchors.push({
      parser_mm: [sheet.bbox_mm[0], sheet.bbox_mm[1]],
      observed_px: mmToPx(sheet.bbox_mm[0], sheet.bbox_mm[1], coordMap),
    });
  }
  return anchors;
}

function bboxPxToMm(
  bboxPx: readonly [number, number, number, number],
  coordMap: CoordMap
): readonly [number, number, number, number] {
  const topLeft = pxToMm(bboxPx[0], bboxPx[1], coordMap);
  const bottomRight = pxToMm(bboxPx[2], bboxPx[3], coordMap);
  return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]] as const;
}

function expandBBoxMm(
  bboxMm: readonly [number, number, number, number],
  sheetSizeMm: readonly [number, number],
  marginMm: number
): readonly [number, number, number, number] {
  return [
    Math.max(0, bboxMm[0] - marginMm),
    Math.max(0, bboxMm[1] - marginMm),
    Math.min(sheetSizeMm[0], bboxMm[2] + marginMm),
    Math.min(sheetSizeMm[1], bboxMm[3] + marginMm),
  ] as const;
}

async function captureApiCall<T>(params: {
  stage: string;
  regionId?: string;
  apiCallLog: InterpretationApiCallLogEntry[];
  runner: () => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await params.runner();
    params.apiCallLog.push({
      region_id: params.regionId ?? null,
      stage: params.stage,
      attempts: 1,
      success: true,
      duration_ms: Date.now() - startedAt,
      error_code: null,
      error_message: null,
    });
    return result;
  } catch (error) {
    params.apiCallLog.push({
      region_id: params.regionId ?? null,
      stage: params.stage,
      attempts: 1,
      success: false,
      duration_ms: Date.now() - startedAt,
      error_code: error instanceof Error ? error.name : 'unknown_error',
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function withLoggedLlmProvider(
  provider: LlmHypothesisProvider,
  apiCallLog: InterpretationApiCallLogEntry[]
): LlmHypothesisProvider {
  return {
    async generate(input) {
      return captureApiCall({
        stage: 'matcher_llm',
        regionId: input.region.region_id,
        apiCallLog,
        runner: () => provider.generate(input),
      });
    },
  };
}

export async function runInterpretationDeterministicPipeline(params: {
  schematicPath: string;
  outputDirectory: string;
}): Promise<{
  parsed: InterpretationParsedSchematic;
  coordMap: CoordMap;
  coarseRegions: ReadonlyArray<CoarseRegion>;
  fineRegions: ReadonlyArray<FineRegionObservation>;
  geometryMatches: ReadonlyArray<GeometryMatchResult>;
  patternMatches: ReadonlyArray<PatternMatchResult>;
  hierarchy: Awaited<ReturnType<typeof resolveHierarchyForParsedSchematic>>;
  llmHypotheses: Awaited<ReturnType<typeof generateGatedLlmHypotheses>>;
  report: InterpretationReport;
}> {
  await mkdir(params.outputDirectory, { recursive: true });
  const source = await readFile(params.schematicPath, 'utf8');
  const parsed = parseSchematicForInterpretation(source, basename(params.schematicPath));
  await writeJsonFile(join(params.outputDirectory, 'parsed.json'), parsed);

  const hierarchy = await resolveHierarchyForParsedSchematic({
    parsed,
    schematicPath: params.schematicPath,
  });
  await writeJsonFile(join(params.outputDirectory, 'hierarchy_resolution.json'), hierarchy);

  const sheetSizeMm = [
    parsed.page_settings?.width_mm ?? 297,
    parsed.page_settings?.height_mm ?? 210,
  ] as const;

  const renderArtifacts = await renderFullSchematicArtifacts({
    schematicPath: params.schematicPath,
    outputDirectory: params.outputDirectory,
    sheetSizeMm,
  });

  const coordMap = JSON.parse(await readFile(renderArtifacts.coordMapPath, 'utf8')) as CoordMap;
  const apiCallLog: InterpretationApiCallLogEntry[] = [];
  const calibration = buildCoordValidationReport({
    anchors: buildCalibrationAnchors(parsed, coordMap),
    coordMap,
    thresholds: parsed.page_settings
      ? {
          max_error_mm_warn: getInterpretationThresholds().calibration.max_error_mm_warn,
          max_error_mm_block: getInterpretationThresholds().calibration.max_error_mm_block,
        }
      : {
          max_error_mm_warn: getInterpretationThresholds().calibration.max_error_mm_warn,
          max_error_mm_block: getInterpretationThresholds().calibration.max_error_mm_block,
        },
    thresholdsVersion: getInterpretationThresholds().version,
  });
  await writeJsonFile(join(params.outputDirectory, 'coord_validation.json'), calibration);

  const visionAdapter = createVisionAdapterFromEnv();
  let coarseRegions = defaultCoarseRegionsFromParsed(parsed, coordMap);
  if (visionAdapter && renderArtifacts.renderFullPngPath) {
    try {
      const analyzedRegions = await captureApiCall({
        stage: 'vision_coarse',
        apiCallLog,
        runner: () => visionAdapter.analyzeCoarse({
          stage: 'coarse',
          imagePath: renderArtifacts.renderFullPngPath!,
        }),
      });
      if (analyzedRegions.length > 0) {
        coarseRegions = [...analyzedRegions];
      }
    } catch {
      coarseRegions = defaultCoarseRegionsFromParsed(parsed, coordMap);
      await writeJsonFile(join(params.outputDirectory, 'api_call_log.json'), apiCallLog);
    }
  }

  let fineRegions = defaultFineRegions(coarseRegions);
  if (visionAdapter && renderArtifacts.renderFullPngPath && coarseRegions.length > 0) {
    const visionFineRegions: FineRegionObservation[] = [];
    const fineLimit = Math.min(
      coarseRegions.length,
      getInterpretationThresholds().vision_pass.max_fine_pass_calls_per_schematic
    );

    for (const region of coarseRegions.slice(0, fineLimit)) {
      const cropBBoxMm = expandBBoxMm(
        bboxPxToMm(region.bbox_px, coordMap),
        coordMap.sheet_size_mm,
        getInterpretationThresholds().crop_expansion.default_margin_mm
      );
      const cropArtifacts = await renderCroppedSvgArtifacts({
        regionId: region.region_id,
        fullSvgPath: renderArtifacts.renderFullSvgPath,
        coordMap,
        cropBBoxMm,
        outputDirectory: params.outputDirectory,
      });

      try {
        visionFineRegions.push(
          await captureApiCall({
            stage: 'vision_fine',
            regionId: region.region_id,
            apiCallLog,
            runner: () => visionAdapter.analyzeFine({
              stage: 'fine',
              imagePath: renderArtifacts.renderFullPngPath!,
              cropImagePath: cropArtifacts.cropPngPath ?? undefined,
              regionId: region.region_id,
              focusBBoxPx: region.bbox_px,
            }),
          })
        );
      } catch {
        visionFineRegions.push({
          region_id: region.region_id,
          visible_texts: [...region.ocr_like_texts],
          observed_shape_tags: [...region.observed_shape_tags],
          confidence_hint: 'low',
        });
        await writeJsonFile(join(params.outputDirectory, 'api_call_log.json'), apiCallLog);
      }
    }

    if (fineLimit < coarseRegions.length) {
      visionFineRegions.push(...defaultFineRegions(coarseRegions.slice(fineLimit)));
    }
    fineRegions = visionFineRegions;
  }

  await writeJsonFile(join(params.outputDirectory, 'coarse_regions.json'), { regions: coarseRegions });
  await writeJsonFile(join(params.outputDirectory, 'fine_regions.json'), fineRegions);

  const geometryMatches = matchRegionsByGeometry({
    parsed,
    regions: coarseRegions,
    coordMap,
    minIouForMatch: getInterpretationThresholds().geometry_match.min_iou_for_match,
  });
  await writeJsonFile(join(params.outputDirectory, 'geometry_matches.json'), geometryMatches);

  const patternMatches = matchRegionsByPattern({
    parsed,
    regions: coarseRegions,
    geometryMatches,
  });
  await writeJsonFile(join(params.outputDirectory, 'pattern_matches.json'), patternMatches);

  const firstPassResolved = resolveInterpretationRules({
    parsed,
    regions: coarseRegions,
    geometryMatches,
    patternMatches,
    hierarchy,
    fineRegions,
    thresholds: getInterpretationThresholds().pattern_match,
    coordMap,
  });

  const llmProvider = withLoggedLlmProvider(
    createLlmHypothesisProviderFromEnv() ?? createStubLlmHypothesisProvider(),
    apiCallLog
  );
  const llmHypotheses = await generateGatedLlmHypotheses({
    provider: llmProvider,
    parsed,
    regions: coarseRegions,
    blocks: firstPassResolved.blocks,
    geometryMatches,
    patternMatches,
    hierarchy,
    fineRegions,
    thresholds: {
      high_confidence_score: getInterpretationThresholds().pattern_match.high_confidence_score,
      trigger_if_pattern_score_below: getInterpretationThresholds().llm_hypothesis.trigger_if_pattern_score_below,
    },
  });
  await writeJsonFile(join(params.outputDirectory, 'llm_hypotheses.json'), llmHypotheses);
  await writeJsonFile(join(params.outputDirectory, 'api_call_log.json'), apiCallLog);

  const resolved = resolveInterpretationRules({
    parsed,
    regions: coarseRegions,
    geometryMatches,
    patternMatches,
    hierarchy,
    llmHypotheses,
    fineRegions,
    thresholds: getInterpretationThresholds().pattern_match,
    coordMap,
  });

  const report: InterpretationReport = {
    ...createEmptyInterpretationReport({
      sourceFile: basename(params.schematicPath),
      thresholdsVersion: getInterpretationThresholds().version,
      environmentCheck: renderArtifacts.environmentCheckPath,
    }),
    blocks: resolved.blocks,
    review_needed: resolved.review_needed,
    errors: resolved.errors,
  };

  await writeJsonFile(join(params.outputDirectory, 'interpretation_report.json'), report);
  await writeFile(
    join(params.outputDirectory, 'interpretation_report.md'),
    [
      `# Interpretation Report`,
      ``,
      `- Source: ${report.source_file}`,
      `- Blocks: ${report.blocks.length}`,
      `- Review Needed: ${report.review_needed.length}`,
      ``,
      ...report.blocks.map(block => `- ${block.block_id}: ${block.block_type} / ${block.role} / ${block.confidence}`),
    ].join('\n'),
    'utf8'
  );

  return {
    parsed,
    coordMap,
    coarseRegions,
    fineRegions,
    geometryMatches,
    patternMatches,
    hierarchy,
    llmHypotheses,
    report,
  };
}
