import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import type { ModuMakeProjectData } from '@/types';

export function ensureImportedValidationSnapshot(
  document: ModuMakeProjectData
): ModuMakeProjectData {
  if (document.integratedValidationJson || !document.importedSchematicSource?.trim()) {
    return document;
  }

  const integratedValidationJson = buildImportedSchematicIntegratedValidationJson({
    document,
    importedSource: document.importedSchematicSource,
  });

  if (!integratedValidationJson) {
    return document;
  }

  return {
    ...document,
    integratedValidationJson,
  };
}
