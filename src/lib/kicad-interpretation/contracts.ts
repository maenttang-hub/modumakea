import type { SchematicDomainModel } from '@/types/schematic-domain';

export type InterpretationStage =
  | 'parser'
  | 'renderer'
  | 'calibration'
  | 'vision_coarse'
  | 'vision_fine'
  | 'matcher_geometry'
  | 'matcher_pattern'
  | 'matcher_llm'
  | 'matcher_rules';

export type InterpretationConfidence = 'high' | 'medium' | 'low' | 'needs_review';

export type InterpretationBlockType =
  | 'mcu_core'
  | 'connector_block'
  | 'power_block'
  | 'passive_cluster'
  | 'repeated_channel'
  | 'sheet_interface'
  | 'unknown';

export interface InterpretationEntityBase {
  readonly id: string;
  readonly type: 'symbol' | 'pin' | 'net' | 'wire' | 'label' | 'junction' | 'text' | 'rect' | 'sheet' | 'sheet_pin';
  readonly bbox_mm: readonly [number, number, number, number];
  readonly raw_ref?: string;
}

export interface InterpretationSheetPin {
  readonly name: string;
  readonly position_mm: readonly [number, number];
  readonly direction?: string;
}

export interface InterpretationParsedSymbol {
  readonly id: string;
  readonly reference: string;
  readonly value?: string;
  readonly footprint?: string;
  readonly lib_id: string;
  readonly lib_name?: string;
  readonly position_mm: readonly [number, number];
  readonly rotation_deg: 0 | 90 | 180 | 270;
  readonly mirror: boolean | 'x' | 'y' | 'xy';
  readonly bbox_mm?: readonly [number, number, number, number];
  readonly pins: ReadonlyArray<{
    readonly number: string;
    readonly name: string;
    readonly electrical_type?: string;
    readonly position_mm: readonly [number, number];
  }>;
}

export interface InterpretationParsedRect {
  readonly id: string;
  readonly bbox_mm: readonly [number, number, number, number];
  readonly contained_entities: ReadonlyArray<string>;
  readonly nearby_labels: ReadonlyArray<{
    readonly text: string;
    readonly distance_mm?: number;
  }>;
}

export interface InterpretationParsedSheet {
  readonly id: string;
  readonly sheet_name?: string;
  readonly sheet_file: string;
  readonly bbox_mm: readonly [number, number, number, number];
  readonly sheet_pins: ReadonlyArray<InterpretationSheetPin>;
  readonly nearby_labels?: ReadonlyArray<{
    readonly text: string;
    readonly distance_mm?: number;
  }>;
}

export interface InterpretationParsedSchematic {
  readonly schematic_file: string;
  readonly kicad_version?: string;
  readonly page_settings?: {
    readonly paper: string;
    readonly width_mm: number;
    readonly height_mm: number;
    readonly orientation?: 'portrait' | 'landscape';
  };
  readonly source_model: SchematicDomainModel;
  readonly symbols: ReadonlyArray<InterpretationParsedSymbol>;
  readonly nets: ReadonlyArray<{
    readonly name: string;
    readonly connected_pins: ReadonlyArray<readonly [string, string]>;
  }>;
  readonly wires: ReadonlyArray<unknown>;
  readonly labels: ReadonlyArray<{
    readonly label_type: 'local' | 'global' | 'hierarchical';
    readonly text: string;
    readonly position_mm: readonly [number, number];
  }>;
  readonly rects: ReadonlyArray<InterpretationParsedRect>;
  readonly sheets: ReadonlyArray<InterpretationParsedSheet>;
  readonly cross_sheet_links: ReadonlyArray<{
    readonly signal: string;
    readonly from: string;
    readonly to: string;
  }>;
  readonly warnings?: ReadonlyArray<string>;
  readonly errors?: ReadonlyArray<string>;
}

export interface InterpretationThresholds {
  readonly version: string;
  readonly calibration: {
    readonly max_error_mm_warn: number;
    readonly max_error_mm_block: number;
  };
  readonly crop_expansion: {
    readonly default_margin_mm: number;
    readonly margin_increment_mm: number;
    readonly max_margin_attempts: number;
  };
  readonly geometry_match: {
    readonly min_iou_for_match: number;
  };
  readonly pattern_match: {
    readonly high_confidence_score: number;
    readonly medium_confidence_low_bound: number;
  };
  readonly region_dedup: {
    readonly merge_iou_threshold: number;
    readonly containment_ratio_for_suppress: number;
  };
  readonly llm_hypothesis: {
    readonly trigger_if_pattern_score_below: number;
    readonly max_calls_per_schematic: number;
    readonly timeout_seconds: number;
  };
  readonly vision_pass: {
    readonly max_fine_pass_calls_per_schematic: number;
    readonly coarse_timeout_seconds: number;
    readonly fine_timeout_seconds: number;
  };
  readonly api_policy: {
    readonly max_retries: number;
    readonly backoff_seconds: ReadonlyArray<number>;
    readonly max_concurrency: number;
  };
}

export interface InterpretationBlock {
  readonly block_id: string;
  readonly block_type: InterpretationBlockType;
  readonly role: string;
  readonly freeform_description: string;
  readonly confidence: InterpretationConfidence;
  readonly evidence_sources: ReadonlyArray<string>;
  readonly member_entities: ReadonlyArray<string>;
  readonly bbox_mm: readonly [number, number, number, number];
  readonly needs_review: boolean;
  readonly cross_sheet_resolved?: boolean;
}

export interface InterpretationReport {
  readonly source_file: string;
  readonly generated_at: string;
  readonly thresholds_version: string;
  readonly environment_check?: string;
  readonly blocks: ReadonlyArray<InterpretationBlock>;
  readonly review_needed: ReadonlyArray<{
    readonly block_id: string;
    readonly reason: string;
    readonly conflicting_evidence_sources?: ReadonlyArray<string>;
  }>;
  readonly errors?: ReadonlyArray<string>;
}

export interface InterpretationStageContext {
  readonly sourceFile: string;
  readonly thresholds: InterpretationThresholds;
  readonly workingDirectory?: string;
}

export interface CoarseRegion {
  readonly region_id: string;
  readonly bbox_px: readonly [number, number, number, number];
  readonly observed_shape_tags: ReadonlyArray<string>;
  readonly ocr_like_texts: ReadonlyArray<string>;
  readonly visual_density: 'low' | 'medium' | 'high';
  readonly sub_candidates?: ReadonlyArray<string>;
  readonly freeform_observation?: string;
}

export interface GeometryMatchResult {
  readonly region_id: string;
  readonly matched_entity_id: string | null;
  readonly matched_entity_type: 'rect' | 'sheet' | null;
  readonly iou_score: number;
  readonly nearby_labels: ReadonlyArray<string>;
}

export interface PatternCandidate {
  readonly pattern_name:
    | 'SPI_ISP_HEADER'
    | 'UART_HEADER'
    | 'I2C_BUS'
    | 'POWER_BLOCK'
    | 'MCU_CORE_CLUSTER'
    | 'PASSIVE_DECOUPLING_GROUP'
    | 'GENERIC_CONNECTOR_BLOCK';
  readonly score: number;
}

export interface PatternMatchResult {
  readonly region_id: string;
  readonly pattern_candidates: ReadonlyArray<PatternCandidate>;
}

export interface FineRegionObservation {
  readonly region_id: string;
  readonly visible_texts: ReadonlyArray<string>;
  readonly observed_shape_tags: ReadonlyArray<string>;
  readonly structural_observation?: string;
  readonly confidence_hint?: 'low' | 'medium' | 'high';
}

export interface VisionAdapterInput {
  readonly stage: 'coarse' | 'fine';
  readonly imagePath: string;
  readonly cropImagePath?: string;
  readonly entityIds?: ReadonlyArray<string>;
  readonly regionId?: string;
  readonly focusBBoxPx?: readonly [number, number, number, number];
}

export interface VisionAdapter {
  analyzeCoarse(input: VisionAdapterInput): Promise<ReadonlyArray<CoarseRegion>>;
  analyzeFine(input: VisionAdapterInput): Promise<FineRegionObservation>;
}

export interface InterpretationApiCallLogEntry {
  readonly region_id: string | null;
  readonly stage: string;
  readonly attempts: number;
  readonly success: boolean;
  readonly duration_ms: number;
  readonly error_code?: string | number | null;
  readonly error_message?: string | null;
}

export interface RuleResolutionResult {
  readonly blocks: ReadonlyArray<InterpretationBlock>;
  readonly review_needed: ReadonlyArray<{
    readonly block_id: string;
    readonly reason: string;
    readonly conflicting_evidence_sources?: ReadonlyArray<string>;
  }>;
  readonly errors?: ReadonlyArray<string>;
}

export interface HierarchySheetResolution {
  readonly sheet_id: string;
  readonly sheet_file: string;
  readonly resolved_path: string | null;
  readonly parsed: boolean;
  readonly child_symbol_refs: ReadonlyArray<string>;
  readonly child_symbol_lib_ids: ReadonlyArray<string>;
  readonly inferred_roles: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

export interface HierarchyResolutionResult {
  readonly sheets: ReadonlyArray<HierarchySheetResolution>;
  readonly warnings: ReadonlyArray<string>;
}

export interface LlmHypothesis {
  readonly block_type: InterpretationBlockType;
  readonly role: string;
  readonly freeform_description: string;
  readonly evidence: ReadonlyArray<string>;
  readonly self_estimated_likelihood: 'low' | 'medium' | 'high';
}

export interface LlmHypothesisResult {
  readonly region_id: string;
  readonly hypotheses: ReadonlyArray<LlmHypothesis>;
}

export interface LlmHypothesisInput {
  readonly region: CoarseRegion;
  readonly fine_region?: FineRegionObservation;
  readonly geometry_match?: GeometryMatchResult;
  readonly pattern_match?: PatternMatchResult;
  readonly hierarchy_sheet?: HierarchySheetResolution;
  readonly parsed: InterpretationParsedSchematic;
}

export interface LlmHypothesisProvider {
  generate(input: LlmHypothesisInput): Promise<LlmHypothesisResult>;
}
