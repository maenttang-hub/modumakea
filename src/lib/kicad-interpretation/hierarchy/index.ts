import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type {
  HierarchyResolutionResult,
  HierarchySheetResolution,
  InterpretationParsedSchematic,
} from '@/lib/kicad-interpretation/contracts';
import { adaptKiCadSourceToInterpretationParsed } from '@/lib/kicad-interpretation/parser/adapter';

function inferRolesFromChild(parsed: InterpretationParsedSchematic): string[] {
  const roles = new Set<string>();

  for (const symbol of parsed.symbols) {
    const libId = symbol.lib_id.toUpperCase();
    const reference = symbol.reference.toUpperCase();

    if (/CONN|HEADER|USB|JACK|SOCKET|TERMINAL/.test(libId) || /^J\d+$/.test(reference)) {
      roles.add('connector');
    }
    if (/MCU|ATMEGA|STM32|ESP32|RASPBERRY/.test(libId) || /^U\d+$/.test(reference)) {
      roles.add('mcu');
    }
    if (/REGULATOR|LDO|BUCK|BOOST/.test(libId)) {
      roles.add('power');
    }
  }

  return Array.from(roles);
}

async function resolveOneSheet(params: {
  parentFilePath: string;
  sheet: InterpretationParsedSchematic['sheets'][number];
  visited: Set<string>;
}): Promise<HierarchySheetResolution> {
  const resolvedPath = isAbsolute(params.sheet.sheet_file)
    ? params.sheet.sheet_file
    : resolve(dirname(params.parentFilePath), params.sheet.sheet_file);

  if (params.visited.has(resolvedPath)) {
    return {
      sheet_id: params.sheet.id,
      sheet_file: params.sheet.sheet_file,
      resolved_path: resolvedPath,
      parsed: false,
      child_symbol_refs: [],
      child_symbol_lib_ids: [],
      inferred_roles: [],
      warnings: ['circular_sheet_reference'],
    };
  }

  params.visited.add(resolvedPath);

  try {
    const source = await readFile(resolvedPath, 'utf8');
    const parsed = adaptKiCadSourceToInterpretationParsed(source, params.sheet.sheet_file);

    return {
      sheet_id: params.sheet.id,
      sheet_file: params.sheet.sheet_file,
      resolved_path: resolvedPath,
      parsed: true,
      child_symbol_refs: parsed.symbols.map(symbol => symbol.reference),
      child_symbol_lib_ids: parsed.symbols.map(symbol => symbol.lib_id),
      inferred_roles: inferRolesFromChild(parsed),
      warnings: [],
    };
  } catch (error) {
    return {
      sheet_id: params.sheet.id,
      sheet_file: params.sheet.sheet_file,
      resolved_path: resolvedPath,
      parsed: false,
      child_symbol_refs: [],
      child_symbol_lib_ids: [],
      inferred_roles: [],
      warnings: [String(error)],
    };
  }
}

export async function resolveHierarchyForParsedSchematic(params: {
  parsed: InterpretationParsedSchematic;
  schematicPath: string;
}): Promise<HierarchyResolutionResult> {
  const visited = new Set<string>([params.schematicPath]);
  const sheets: HierarchySheetResolution[] = [];
  const warnings: string[] = [];

  for (const sheet of params.parsed.sheets) {
    const resolved = await resolveOneSheet({
      parentFilePath: params.schematicPath,
      sheet,
      visited,
    });
    sheets.push(resolved);
    warnings.push(...resolved.warnings.map(warning => `${sheet.id}: ${warning}`));
  }

  return {
    sheets,
    warnings,
  };
}
