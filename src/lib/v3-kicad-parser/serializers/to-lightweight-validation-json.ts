import {
  LIGHTWEIGHT_VALIDATION_JSON_SCHEMA_VERSION,
  type LightweightValidationJson,
} from '@/types';
import { buildValidationSerializationCore } from '@/lib/v3-kicad-parser/serializers/shared-core';
import type { LogicalNet } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
import type { SchematicDomainModel } from '@/types/schematic-domain';
import type { UnifiedCircuitSourceMeta } from '@/types';

export function toLightweightValidationJson(params: {
  source: UnifiedCircuitSourceMeta;
  model: SchematicDomainModel;
  nets: LogicalNet[];
}): LightweightValidationJson {
  const core = buildValidationSerializationCore(params);

  return {
    schema_version: LIGHTWEIGHT_VALIDATION_JSON_SCHEMA_VERSION,
    source: {
      source_file_kind: core.source.sourceFileKind,
      project_name: core.source.projectName,
      generator: core.source.generator,
      version: core.source.version,
    },
    components: core.components.map(component => ({
      instance_id: component.instanceId,
      ref: component.reference,
      lib_id: component.libId,
      symbol_name: component.symbolName,
      value: component.value,
      footprint: component.footprint,
      mpn_candidates: component.mpnCandidates,
      pins: component.pins.map(pin => ({
        pin_number: pin.pinNumber,
        pin_name: pin.pinName,
        electrical_type: pin.electricalType,
        direction: pin.direction,
        net_id: pin.netId,
        net_label: pin.netLabel,
        net_aliases: pin.netAliases,
      })),
    })),
    nets: core.nets.map(net => ({
      net_id: net.netId,
      label: net.primaryLabel,
      aliases: net.aliases,
      kind: net.kind,
      connected_pins: net.members.map(member => ({
        ref: member.reference,
        lib_id: member.libId,
        pin_number: member.pinNumber,
        pin_name: member.pinName,
        electrical_type: member.electricalType,
      })),
    })),
    unresolved: {
      symbols: core.unresolvedSymbols,
      ignored_non_electrical_symbols: core.ignoredNonElectricalSymbols,
      non_component_markers: core.nonComponentMarkers,
    },
    stats: {
      component_count: core.stats.componentCount,
      net_count: core.stats.netCount,
      unresolved_symbol_count: core.stats.unresolvedSymbolCount,
      ignored_non_electrical_symbol_count: core.stats.ignoredNonElectricalSymbolCount,
      non_component_marker_count: core.stats.nonComponentMarkerCount,
      wire_segment_count: core.stats.wireSegmentCount,
      junction_count: core.stats.junctionCount,
      label_count: core.stats.labelCount,
    },
  };
}
