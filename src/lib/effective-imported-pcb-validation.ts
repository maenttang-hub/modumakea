import {
  buildImportedPcbSchematicParityKey,
  mergeImportedPcbValidationReports,
  validateImportedPcbDocument,
  type ValidateImportedPcbOptions,
} from '@/lib/imported-pcb-validation';
import type { ImportedPcbDocument, ImportedPcbValidationIssue, ImportedPcbValidationReport } from '@/types';

function isModuMakeSchematicParityIssue(issue: ImportedPcbValidationIssue) {
  return issue.source !== 'kicad-cli' && issue.code.startsWith('PCB_SCHEMATIC_');
}

function withoutStaleSchematicParity(report: ImportedPcbValidationReport): ImportedPcbValidationReport {
  const issues = report.issues.filter(issue => !isModuMakeSchematicParityIssue(issue));
  return {
    ...report,
    issueCount: issues.length,
    errorCount: issues.filter(issue => issue.severity === 'error').length,
    warningCount: issues.filter(issue => issue.severity === 'warning').length,
    infoCount: issues.filter(issue => issue.severity === 'info').length,
    checks: {
      ...report.checks,
      schematicParity: false,
      schematicParityContextKey: undefined,
    },
    issues,
  };
}

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

  const schematicParityContextKey = options.schematicParity
    ? buildImportedPcbSchematicParityKey(options.schematicParity)
    : undefined;
  const hasCurrentSchematicParity = Boolean(
    options.schematicParity &&
    validation?.checks.schematicParity &&
    validation.checks.schematicParityContextKey === schematicParityContextKey
  );
  const needsSchematicParity = Boolean(options.schematicParity && !hasCurrentSchematicParity);
  if (validation && !needsSchematicParity) {
    return validation;
  }

  const localValidation = validateImportedPcbDocument(document, options);
  const reusableValidation = validation && needsSchematicParity
    ? withoutStaleSchematicParity(validation)
    : validation;
  return reusableValidation
    ? mergeImportedPcbValidationReports(reusableValidation, localValidation)
    : localValidation;
}
