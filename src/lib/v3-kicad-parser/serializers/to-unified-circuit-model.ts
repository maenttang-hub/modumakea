import {
  UNIFIED_CIRCUIT_MODEL_SCHEMA_VERSION,
  type UnifiedCircuitModel,
} from '@/types';
import { buildValidationSerializationCore } from '@/lib/v3-kicad-parser/serializers/shared-core';
import type { LogicalNet } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
import type { SchematicDomainModel } from '@/types/schematic-domain';
import type { UnifiedCircuitSourceMeta } from '@/types';

export function toUnifiedCircuitModel(params: {
  source: UnifiedCircuitSourceMeta;
  model: SchematicDomainModel;
  nets: LogicalNet[];
}): UnifiedCircuitModel {
  const core = buildValidationSerializationCore(params);

  return {
    schemaVersion: UNIFIED_CIRCUIT_MODEL_SCHEMA_VERSION,
    source: core.source,
    components: core.components,
    nets: core.nets,
    unresolvedSymbols: core.unresolvedSymbols,
    ignoredNonElectricalSymbols: core.ignoredNonElectricalSymbols,
    nonComponentMarkers: core.nonComponentMarkers,
    stats: core.stats,
  };
}
