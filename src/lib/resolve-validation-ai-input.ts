import {
  buildLightweightValidationJson,
  convertDatasheetReviewPayloadToLightweightValidationJson,
  mergeLightweightValidationJsonReviewContext,
} from '@/lib/build-lightweight-validation-json';
import { parseKiCadSchematicToLightweightValidationJson } from '@/lib/parse-kicad-for-validation';
import type {
  FormalVerificationReport,
  LightweightValidationJson,
  ModuMakeProjectData,
  ProjectAuditIssue,
} from '@/types';

interface ResolveValidationAiInputParams {
  document: ModuMakeProjectData;
  auditIssues?: ProjectAuditIssue[];
  sourceCode?: string;
  formalReport?: FormalVerificationReport;
}

function applyLiveReviewContext(
  base: LightweightValidationJson,
  reviewFacts: Pick<LightweightValidationJson, 'code_pin_usage' | 'validation_flags' | 'rule_findings'>
) {
  return mergeLightweightValidationJsonReviewContext(base, reviewFacts);
}

export function resolveValidationAiInput(
  params: ResolveValidationAiInputParams
): LightweightValidationJson {
  const { document, auditIssues, sourceCode, formalReport } = params;

  const sharedPayload = buildLightweightValidationJson({
    document,
    auditIssues,
    sourceCode,
    formalReport,
  });

  const liveReviewFacts = {
    code_pin_usage: sharedPayload.code_pin_usage,
    validation_flags: sharedPayload.validation_flags,
    rule_findings: sharedPayload.rule_findings,
  } satisfies Pick<
    LightweightValidationJson,
    'code_pin_usage' | 'validation_flags' | 'rule_findings'
  >;

  try {
    // Imported schematic resolution order:
    // 1) Fresh v3 reparse from stored .kicad_sch source (canonical runtime input)
    // 2) Persisted integrated snapshot only for legacy/source-less imported loads
    // 3) Shared runtime fallback payload
    if (document.importedSchematicSource?.trim()) {
      const canonicalPayload = parseKiCadSchematicToLightweightValidationJson(
        document.importedSchematicSource,
        {
          projectName: document.projectName,
        }
      );
      return applyLiveReviewContext(canonicalPayload, liveReviewFacts);
    }

    if (document.integratedValidationJson) {
      const legacySnapshotFallback =
        convertDatasheetReviewPayloadToLightweightValidationJson(document.integratedValidationJson);
      return applyLiveReviewContext(legacySnapshotFallback, liveReviewFacts);
    }
  } catch {
    // If imported parsing fails, keep the shared fallback payload so the panel and AI
    // path still have a stable request body.
  }

  return sharedPayload;
}
