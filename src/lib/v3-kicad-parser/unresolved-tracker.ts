import type { UnifiedCircuitIgnoredSymbol, UnifiedCircuitUnresolvedSymbol } from '@/types';
import type { V3LibrarySymbol, V3SymbolInstance } from '@/lib/v3-kicad-parser/extractors/symbol-extractor';

function classifyIgnoredSymbol(instance: V3SymbolInstance): UnifiedCircuitIgnoredSymbol | null {
  if (instance.libId === 'power:PWR_FLAG') {
    return {
      instanceId: instance.instanceId,
      reference: instance.reference,
      libId: instance.libId,
      value: instance.value,
      classification: 'non_component_marker',
      reason: 'pwr_flag',
    };
  }

  if (instance.libId === 'Mechanical:MountingHole') {
    return {
      instanceId: instance.instanceId,
      reference: instance.reference,
      libId: instance.libId,
      value: instance.value,
      classification: 'non_electrical',
      reason: 'mounting_hole',
    };
  }

  if (instance.libId.toLowerCase().includes('logo')) {
    return {
      instanceId: instance.instanceId,
      reference: instance.reference,
      libId: instance.libId,
      value: instance.value,
      classification: 'non_electrical',
      reason: 'logo',
    };
  }

  return null;
}

export function collectUnresolvedSymbols(
  instances: V3SymbolInstance[],
  symbols: Map<string, V3LibrarySymbol>
) {
  const unresolved: UnifiedCircuitUnresolvedSymbol[] = [];
  const ignoredNonElectricalSymbols: UnifiedCircuitIgnoredSymbol[] = [];
  const nonComponentMarkers: UnifiedCircuitIgnoredSymbol[] = [];
  const resolved: V3SymbolInstance[] = [];

  for (const instance of instances) {
    const symbol = symbols.get(instance.libId);
    if (!symbol) {
      unresolved.push({
        instanceId: instance.instanceId,
        reference: instance.reference,
        libId: instance.libId,
        value: instance.value,
        reason: 'missing_library_symbol',
      });
      continue;
    }

    if (symbol.pins.length === 0) {
      const ignored = classifyIgnoredSymbol(instance);
      if (ignored) {
        if (ignored.classification === 'non_component_marker') {
          nonComponentMarkers.push(ignored);
        } else {
          ignoredNonElectricalSymbols.push(ignored);
        }
        continue;
      }

      unresolved.push({
        instanceId: instance.instanceId,
        reference: instance.reference,
        libId: instance.libId,
        value: instance.value,
        reason: 'symbol_without_pins',
      });
      resolved.push(instance);
      continue;
    }

    resolved.push(instance);
  }

  return {
    resolved,
    unresolved,
    ignoredNonElectricalSymbols,
    nonComponentMarkers,
  };
}
