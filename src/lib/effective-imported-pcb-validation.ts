import {
  mergeImportedPcbValidationReports,
  validateImportedPcbDocument,
  type ValidateImportedPcbOptions,
} from '@/lib/imported-pcb-validation';
import type { ImportedPcbDocument, ImportedPcbValidationReport } from '@/types';

export function buildEffectiveImportedPcbValidation({
  document,
  validation,
  options,
}: {
  document: ImportedPcbDocument | null | undefined;
  validation: ImportedPcbValidationReport | null | undefined;
  options: ValidateImportedPcbOptions;
}) {
  if (!document) {
    return validation ?? null;
  }

  const needsSchematicParity = Boolean(options.schematicParity && !validation?.checks.schematicParity);
  if (validation && !needsSchematicParity) {
    return validation;
  }

  const localValidation = validateImportedPcbDocument(document, options);
  return validation
    ? mergeImportedPcbValidationReports(validation, localValidation)
    : localValidation;
}
