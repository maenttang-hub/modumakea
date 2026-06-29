import type {
  CoarseRegion,
  FineRegionObservation,
  GeometryMatchResult,
  HierarchyResolutionResult,
  InterpretationBlock,
  InterpretationBlockType,
  InterpretationParsedSchematic,
  LlmHypothesisResult,
  PatternCandidate,
  PatternMatchResult,
  RuleResolutionResult,
} from '@/lib/kicad-interpretation/contracts';

function pickTopPattern(patternMatch: PatternMatchResult | undefined): PatternCandidate | null {
  const top = patternMatch?.pattern_candidates[0] ?? null;
  return top && top.score > 0 ? top : null;
}

function inferBlockType(params: {
  geometryMatch: GeometryMatchResult | undefined;
  topPattern: PatternCandidate | null;
}): InterpretationBlockType {
  if (params.geometryMatch?.matched_entity_type === 'sheet') {
    return 'sheet_interface';
  }

  switch (params.topPattern?.pattern_name) {
    case 'SPI_ISP_HEADER':
    case 'UART_HEADER':
    case 'I2C_BUS':
    case 'GENERIC_CONNECTOR_BLOCK':
      return 'connector_block';
    case 'POWER_BLOCK':
      return 'power_block';
    case 'MCU_CORE_CLUSTER':
      return 'mcu_core';
    case 'PASSIVE_DECOUPLING_GROUP':
      return 'passive_cluster';
    default:
      return 'unknown';
  }
}

function inferRole(topPattern: PatternCandidate | null): string {
  switch (topPattern?.pattern_name) {
    case 'SPI_ISP_HEADER':
      return 'isp_header';
    case 'UART_HEADER':
      return 'uart_header';
    case 'I2C_BUS':
      return 'i2c_bus';
    case 'POWER_BLOCK':
      return 'regulator_stage';
    case 'MCU_CORE_CLUSTER':
      return 'arduino_main_mcu';
    case 'PASSIVE_DECOUPLING_GROUP':
      return 'decoupling_group';
    case 'GENERIC_CONNECTOR_BLOCK':
      return 'generic_connector';
    default:
      return 'none';
  }
}

function regionLooksMechanical(region: CoarseRegion) {
  const texts = [...region.ocr_like_texts, ...(region.sub_candidates ?? []), region.freeform_observation ?? '']
    .join(' ')
    .toUpperCase();
  return /MOUNTINGHOLE|MOUNTING_HOLE|MECHANICAL|HOLE/.test(texts);
}

function regionLooksConnector(region: CoarseRegion) {
  const texts = [...region.ocr_like_texts, ...(region.sub_candidates ?? []), region.freeform_observation ?? '']
    .join(' ')
    .toUpperCase();
  return /CONNECTOR|HEADER|TERMINAL|CONN_|SCREW_TERMINAL|PIN_[1-9]/.test(texts);
}

function regionLooksPower(region: CoarseRegion) {
  const texts = [...region.ocr_like_texts, ...(region.sub_candidates ?? []), region.freeform_observation ?? '']
    .join(' ')
    .toUpperCase();
  return /(VIN|VBAT|VCC|GND|\+5V|\+3V3|LDO|REGULATOR|BUCK|BOOST|TVS|SRV|ESD|FUSE)/.test(texts);
}

function inferRegionAwareRole(params: {
  region: CoarseRegion;
  topPattern: PatternCandidate | null;
}) {
  if (regionLooksMechanical(params.region)) {
    return 'mechanical_support';
  }

  if (params.topPattern?.pattern_name === 'POWER_BLOCK') {
    return /(REGULATOR|LDO|BUCK|BOOST|VIN|VBAT)/.test(
      [...params.region.ocr_like_texts, ...(params.region.sub_candidates ?? [])].join(' ').toUpperCase()
    )
      ? 'regulator_stage'
      : 'power_distribution';
  }

  if (params.topPattern?.pattern_name === 'GENERIC_CONNECTOR_BLOCK') {
    return regionLooksConnector(params.region) ? 'board_connector' : 'generic_connector';
  }

  return inferRole(params.topPattern);
}

function labelSuggestsMcu(label: string | undefined) {
  return Boolean(label && /(MCU|ATMEGA|STM32|ESP32|CORE|PROCESSOR)/i.test(label));
}

function patternSuggestsConnector(topPattern: PatternCandidate | null) {
  return topPattern !== null && [
    'SPI_ISP_HEADER',
    'UART_HEADER',
    'I2C_BUS',
    'GENERIC_CONNECTOR_BLOCK',
  ].includes(topPattern.pattern_name);
}

function getHierarchySheetRoles(
  hierarchy: HierarchyResolutionResult | undefined,
  geometryMatch: GeometryMatchResult | undefined
) {
  if (!hierarchy || geometryMatch?.matched_entity_type !== 'sheet' || !geometryMatch.matched_entity_id) {
    return [];
  }

  return hierarchy.sheets.find(sheet => sheet.sheet_id === geometryMatch.matched_entity_id)?.inferred_roles ?? [];
}

function inferBBoxMm(params: {
  region: CoarseRegion;
  pageWidthMm: number;
  pageHeightMm: number;
  scalePxPerMm: number;
  originOffsetPx: readonly [number, number];
}): readonly [number, number, number, number] {
  const [x1, y1, x2, y2] = params.region.bbox_px;
  const bbox: readonly [number, number, number, number] = [
    Number(((x1 - params.originOffsetPx[0]) / params.scalePxPerMm).toFixed(3)),
    Number(((y1 - params.originOffsetPx[1]) / params.scalePxPerMm).toFixed(3)),
    Number(((x2 - params.originOffsetPx[0]) / params.scalePxPerMm).toFixed(3)),
    Number(((y2 - params.originOffsetPx[1]) / params.scalePxPerMm).toFixed(3)),
  ];

  return [
    Math.max(0, Math.min(params.pageWidthMm, bbox[0])),
    Math.max(0, Math.min(params.pageHeightMm, bbox[1])),
    Math.max(0, Math.min(params.pageWidthMm, bbox[2])),
    Math.max(0, Math.min(params.pageHeightMm, bbox[3])),
  ];
}

function inferMemberEntities(params: {
  parsed: InterpretationParsedSchematic;
  geometryMatch: GeometryMatchResult | undefined;
  topPattern: PatternCandidate | null;
}): string[] {
  if (params.geometryMatch?.matched_entity_type === 'sheet' && params.geometryMatch.matched_entity_id) {
    return [params.geometryMatch.matched_entity_id];
  }

  if (params.geometryMatch?.matched_entity_type === 'rect' && params.geometryMatch.matched_entity_id) {
    const rect = params.parsed.rects.find(candidate => candidate.id === params.geometryMatch?.matched_entity_id);
    if (rect) {
      return [...rect.contained_entities];
    }
  }

  if (params.topPattern?.pattern_name === 'MCU_CORE_CLUSTER') {
    return params.parsed.symbols
      .filter(symbol => /ATMEGA|STM32|ESP32|MCU|RASPBERRY/i.test(symbol.lib_id) || /^U\d+$/i.test(symbol.reference))
      .map(symbol => symbol.reference)
      .slice(0, 8);
  }

  return [];
}

export function resolveInterpretationRules(params: {
  parsed: InterpretationParsedSchematic;
  regions: ReadonlyArray<CoarseRegion>;
  geometryMatches: ReadonlyArray<GeometryMatchResult>;
  patternMatches: ReadonlyArray<PatternMatchResult>;
  hierarchy?: HierarchyResolutionResult;
  llmHypotheses?: ReadonlyArray<LlmHypothesisResult>;
  fineRegions?: ReadonlyArray<FineRegionObservation>;
  thresholds: {
    readonly high_confidence_score: number;
    readonly medium_confidence_low_bound: number;
  };
  coordMap: {
    readonly scale_px_per_mm: number;
    readonly origin_offset_px: readonly [number, number];
  };
}): RuleResolutionResult {
  const pageWidthMm = params.parsed.page_settings?.width_mm ?? 0;
  const pageHeightMm = params.parsed.page_settings?.height_mm ?? 0;

  const blocks: InterpretationBlock[] = [];
  const reviewNeeded: Array<RuleResolutionResult['review_needed'][number]> = [];

  for (const region of params.regions) {
    const geometryMatch = params.geometryMatches.find(candidate => candidate.region_id === region.region_id);
    const patternMatch = params.patternMatches.find(candidate => candidate.region_id === region.region_id);
    const fineRegion = params.fineRegions?.find(candidate => candidate.region_id === region.region_id);
    const llmHypothesis = params.llmHypotheses?.find(candidate => candidate.region_id === region.region_id);
    const topPattern = pickTopPattern(patternMatch);
    const explicitLabel = geometryMatch?.nearby_labels[0];
    const hierarchyRoles = getHierarchySheetRoles(params.hierarchy, geometryMatch);

    let confidence: InterpretationBlock['confidence'] = 'low';
    const evidenceSources: string[] = [];

    if (explicitLabel && (topPattern === null || topPattern.score < params.thresholds.medium_confidence_low_bound)) {
      confidence = 'high';
      evidenceSources.push('explicit_label', 'geometry_match');
    } else if (topPattern && topPattern.score >= params.thresholds.high_confidence_score) {
      confidence = 'high';
      evidenceSources.push('signal_pattern');
    } else if (topPattern && topPattern.score >= params.thresholds.medium_confidence_low_bound) {
      confidence = 'medium';
      evidenceSources.push('signal_pattern');
      if (fineRegion?.confidence_hint) {
        evidenceSources.push('vision_hint');
      }
    }

    const conflicting = Boolean(
      explicitLabel &&
      topPattern &&
      topPattern.score >= params.thresholds.medium_confidence_low_bound &&
      (
        (labelSuggestsMcu(explicitLabel) && patternSuggestsConnector(topPattern)) ||
        (/connector/i.test(explicitLabel) === false && inferBlockType({ geometryMatch, topPattern }) === 'connector_block')
      )
    );
    if (conflicting) {
      confidence = 'needs_review';
      evidenceSources.push('conflict');
    }

    const hierarchyConnectorBoost = hierarchyRoles.includes('connector') && patternSuggestsConnector(topPattern);
    if (confidence !== 'needs_review' && hierarchyConnectorBoost) {
      confidence = topPattern && topPattern.score >= params.thresholds.medium_confidence_low_bound ? 'high' : confidence;
      evidenceSources.push('cross_sheet_resolution');
    }

    const topHypothesis = llmHypothesis?.hypotheses[0];
    if (
      confidence === 'needs_review' &&
      topPattern &&
      topPattern.score >= params.thresholds.medium_confidence_low_bound &&
      topHypothesis &&
      topHypothesis.block_type === inferBlockType({ geometryMatch, topPattern })
    ) {
      confidence = 'medium';
      evidenceSources.push('llm_hypothesis');
    }

    const blockId = `block_${region.region_id}`;
    const inferredBlockType = regionLooksMechanical(region)
      ? 'unknown'
      : topPattern?.pattern_name === 'GENERIC_CONNECTOR_BLOCK' && !regionLooksConnector(region)
        ? regionLooksPower(region)
          ? 'power_block'
          : 'unknown'
      : inferBlockType({ geometryMatch, topPattern });
    const inferredRole = inferRegionAwareRole({
      region,
      topPattern,
    });
    const block: InterpretationBlock = {
      block_id: blockId,
      block_type: inferredBlockType,
      role: inferredRole,
      freeform_description: explicitLabel
        ? `Region ${region.region_id} matched near label "${explicitLabel}".`
        : topHypothesis?.freeform_description
          ? topHypothesis.freeform_description
        : topPattern
          ? `Region ${region.region_id} matched pattern ${topPattern.pattern_name}.`
          : `Region ${region.region_id} remains weakly identified.`,
      confidence,
      evidence_sources: Array.from(new Set(evidenceSources)),
      member_entities: inferMemberEntities({ parsed: params.parsed, geometryMatch, topPattern }),
      bbox_mm: inferBBoxMm({
        region,
        pageWidthMm,
        pageHeightMm,
        scalePxPerMm: params.coordMap.scale_px_per_mm,
        originOffsetPx: params.coordMap.origin_offset_px,
      }),
      needs_review: confidence === 'needs_review',
      cross_sheet_resolved: geometryMatch?.matched_entity_type === 'sheet' && hierarchyRoles.length > 0,
    };

    blocks.push(block);

    if (block.needs_review) {
      reviewNeeded.push({
        block_id: block.block_id,
        reason: 'geometry and pattern evidence conflict or remain ambiguous',
        conflicting_evidence_sources: block.evidence_sources,
      });
    }
  }

  return {
    blocks,
    review_needed: reviewNeeded,
    errors: [],
  };
}
