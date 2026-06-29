import type {
  DatasheetReviewCodePinUsage,
  DatasheetReviewRuleFinding,
  DatasheetReviewValidationFlag,
} from './datasheet-review';
import type {
  UnifiedCircuitIgnoredSymbol,
  UnifiedCircuitNetKind,
  UnifiedCircuitPinDirection,
  UnifiedCircuitUnresolvedSymbol,
} from './unified-circuit-model';

export const LIGHTWEIGHT_VALIDATION_JSON_SCHEMA_VERSION = '2026-06-19';

export interface LightweightValidationJsonPin {
  pin_number: string;
  pin_name: string;
  electrical_type: string;
  direction: UnifiedCircuitPinDirection;
  net_id: string | null;
  net_label?: string;
  net_aliases: string[];
}

export interface LightweightValidationJsonComponent {
  instance_id: string;
  ref: string;
  lib_id: string;
  symbol_name: string;
  value?: string;
  footprint?: string;
  mpn_candidates: string[];
  pins: LightweightValidationJsonPin[];
}

export interface LightweightValidationJsonNetMember {
  ref: string;
  lib_id: string;
  pin_number: string;
  pin_name: string;
  electrical_type: string;
}

export interface LightweightValidationJsonNet {
  net_id: string;
  label?: string;
  aliases: string[];
  kind: UnifiedCircuitNetKind;
  connected_pins: LightweightValidationJsonNetMember[];
}

export interface LightweightValidationJson {
  schema_version: typeof LIGHTWEIGHT_VALIDATION_JSON_SCHEMA_VERSION;
  source: {
    source_file_kind: 'kicad_sch';
    project_name: string;
    generator?: string;
    version?: string;
  };
  components: LightweightValidationJsonComponent[];
  nets: LightweightValidationJsonNet[];
  unresolved: {
    symbols: UnifiedCircuitUnresolvedSymbol[];
    ignored_non_electrical_symbols?: UnifiedCircuitIgnoredSymbol[];
    non_component_markers?: UnifiedCircuitIgnoredSymbol[];
  };
  code_pin_usage?: DatasheetReviewCodePinUsage[];
  validation_flags?: DatasheetReviewValidationFlag[];
  rule_findings?: DatasheetReviewRuleFinding[];
  stats: {
    component_count: number;
    net_count: number;
    unresolved_symbol_count: number;
    ignored_non_electrical_symbol_count?: number;
    non_component_marker_count?: number;
    wire_segment_count: number;
    junction_count: number;
    label_count: number;
  };
}
