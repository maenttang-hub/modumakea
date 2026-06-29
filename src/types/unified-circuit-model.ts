export const UNIFIED_CIRCUIT_MODEL_SCHEMA_VERSION = '2026-06-19';

export type UnifiedCircuitNetKind =
  | 'power'
  | 'ground'
  | 'signal'
  | 'clock'
  | 'bus'
  | 'analog'
  | 'unknown';

export type UnifiedCircuitPinDirection =
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'power_in'
  | 'power_out'
  | 'ground'
  | 'passive'
  | 'unknown';

export interface UnifiedCircuitSourceMeta {
  sourceFileKind: 'kicad_sch';
  projectName: string;
  generator?: string;
  version?: string;
}

export interface UnifiedCircuitComponentPin {
  pinNumber: string;
  pinName: string;
  electricalType: string;
  direction: UnifiedCircuitPinDirection;
  netId: string | null;
  netLabel?: string;
  netAliases: string[];
}

export interface UnifiedCircuitComponent {
  instanceId: string;
  reference: string;
  libId: string;
  symbolName: string;
  value?: string;
  footprint?: string;
  mpnCandidates: string[];
  pins: UnifiedCircuitComponentPin[];
  pinNetMap: Record<string, UnifiedCircuitComponentPin>;
}

export interface UnifiedCircuitNetMember {
  memberType: 'component_pin';
  instanceId: string;
  reference: string;
  libId: string;
  pinNumber: string;
  pinName: string;
  electricalType: string;
}

export interface UnifiedCircuitNet {
  netId: string;
  primaryLabel?: string;
  aliases: string[];
  kind: UnifiedCircuitNetKind;
  members: UnifiedCircuitNetMember[];
}

export interface UnifiedCircuitUnresolvedSymbol {
  instanceId: string;
  reference: string;
  libId: string;
  value?: string;
  reason: 'missing_library_symbol' | 'symbol_without_pins';
}

export interface UnifiedCircuitIgnoredSymbol {
  instanceId: string;
  reference: string;
  libId: string;
  value?: string;
  classification: 'non_electrical' | 'non_component_marker';
  reason: 'mounting_hole' | 'logo' | 'pwr_flag';
}

export interface UnifiedCircuitModelStats {
  componentCount: number;
  netCount: number;
  unresolvedSymbolCount: number;
  ignoredNonElectricalSymbolCount: number;
  nonComponentMarkerCount: number;
  wireSegmentCount: number;
  junctionCount: number;
  labelCount: number;
}

export interface UnifiedCircuitModel {
  schemaVersion: typeof UNIFIED_CIRCUIT_MODEL_SCHEMA_VERSION;
  source: UnifiedCircuitSourceMeta;
  components: UnifiedCircuitComponent[];
  nets: UnifiedCircuitNet[];
  unresolvedSymbols: UnifiedCircuitUnresolvedSymbol[];
  ignoredNonElectricalSymbols: UnifiedCircuitIgnoredSymbol[];
  nonComponentMarkers: UnifiedCircuitIgnoredSymbol[];
  stats: UnifiedCircuitModelStats;
}
