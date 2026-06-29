import type {
  UnifiedCircuitComponentPin,
  UnifiedCircuitSourceMeta,
} from '@/types';
import type { LogicalNet } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
import type { SchematicDomainModel } from '@/types/schematic-domain';

export type ValidationSerializationCorePin = UnifiedCircuitComponentPin;

export interface ValidationSerializationCoreComponent {
  instanceId: string;
  reference: string;
  libId: string;
  symbolName: string;
  value?: string;
  footprint?: string;
  mpnCandidates: string[];
  pins: ValidationSerializationCorePin[];
  pinNetMap: Record<string, ValidationSerializationCorePin>;
}

export interface ValidationSerializationCore {
  source: UnifiedCircuitSourceMeta;
  components: ValidationSerializationCoreComponent[];
  nets: LogicalNet[];
  unresolvedSymbols: SchematicDomainModel['unresolvedSymbols'];
  ignoredNonElectricalSymbols: SchematicDomainModel['ignoredNonElectricalSymbols'];
  nonComponentMarkers: SchematicDomainModel['nonComponentMarkers'];
  stats: {
    componentCount: number;
    netCount: number;
    unresolvedSymbolCount: number;
    ignoredNonElectricalSymbolCount: number;
    nonComponentMarkerCount: number;
    wireSegmentCount: number;
    junctionCount: number;
    labelCount: number;
  };
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function buildMpnCandidates(component: SchematicDomainModel['symbols'][number]) {
  const libTail = component.libId.includes(':') ? component.libId.split(':').at(-1) : component.libId;
  return uniqueStrings([
    component.value,
    libTail ?? undefined,
  ]);
}

export function buildValidationSerializationCore(params: {
  source: UnifiedCircuitSourceMeta;
  model: SchematicDomainModel;
  nets: LogicalNet[];
}): ValidationSerializationCore {
  const pinNetLookup = new Map<string, LogicalNet>();

  for (const net of params.nets) {
    for (const member of net.members) {
      pinNetLookup.set(`${member.symbolUuid}:${member.pinNumber}`, net);
    }
  }

  const components = params.model.symbols.map((component): ValidationSerializationCoreComponent => {
    const pins: ValidationSerializationCorePin[] = component.pins.map(pin => {
      const net = pinNetLookup.get(`${component.uuid}:${pin.number}`);
      const netId = net?.netId ?? null;

      return {
        pinNumber: pin.number,
        pinName: pin.name,
        electricalType: pin.electricalType,
        direction: 'unknown',
        netId,
        netLabel: net?.primaryLabel ?? undefined,
        netAliases: net?.aliases ?? [],
      };
    });

    return {
      instanceId: component.uuid,
      reference: component.reference,
      libId: component.libId,
      symbolName: component.libId.includes(':') ? component.libId.split(':').at(-1) ?? component.libId : component.libId,
      value: component.value,
      footprint: component.footprint,
      mpnCandidates: buildMpnCandidates(component),
      pins,
      pinNetMap: Object.fromEntries(pins.map(pin => [pin.pinNumber, pin])),
    };
  });

  return {
    source: params.source,
    components,
    nets: params.nets,
    unresolvedSymbols: params.model.unresolvedSymbols,
    ignoredNonElectricalSymbols: params.model.ignoredNonElectricalSymbols,
    nonComponentMarkers: params.model.nonComponentMarkers,
    stats: {
      componentCount: components.length,
      netCount: params.nets.length,
      unresolvedSymbolCount: params.model.unresolvedSymbols.length,
      ignoredNonElectricalSymbolCount: params.model.ignoredNonElectricalSymbols.length,
      nonComponentMarkerCount: params.model.nonComponentMarkers.length,
      wireSegmentCount: params.model.wires.length,
      junctionCount: params.model.junctions.length,
      labelCount: params.model.labels.length,
    },
  };
}
