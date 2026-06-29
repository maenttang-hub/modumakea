import { buildDatasheetReviewPayload } from '@/lib/build-datasheet-review-payload';
import type {
  DatasheetReviewInputPayload,
  FormalVerificationReport,
  LightweightValidationJson,
  ModuMakeProjectData,
  ProjectAuditIssue,
} from '@/types';
import type { KiCadImportSummary } from '@/lib/kicad-sch-parser';

function mapSourceKind(): LightweightValidationJson['source']['source_file_kind'] {
  return 'kicad_sch';
}

function fromDatasheetReviewPayload(payload: DatasheetReviewInputPayload): LightweightValidationJson {
  return {
    schema_version: '2026-06-19',
    source: {
      source_file_kind: mapSourceKind(),
      project_name: payload.project.projectName,
    },
    components: payload.components.map(component => ({
      instance_id: component.instanceId,
      ref: component.reference,
      lib_id: component.libraryId ?? component.templateId ?? component.displayName,
      symbol_name: component.symbolName ?? component.displayName,
      value: component.value,
      footprint: component.footprint,
      mpn_candidates: component.mpnCandidates,
      pins: component.pins.map(pin => ({
        pin_number: pin.pinNumber ?? pin.pinId,
        pin_name: pin.pinName,
        electrical_type: pin.electricalType ?? 'unknown',
        direction: pin.direction,
        net_id: pin.connectedNetIds[0] ?? null,
        net_label: pin.netLabels[0],
        net_aliases: pin.netLabels.slice(1),
      })),
    })),
    nets: payload.nets.map(net => ({
      net_id: net.netId,
      label: net.label,
      aliases: [],
      kind: net.kind,
      connected_pins: net.memberRefs
        .filter(member => member.ownerType === 'component')
        .map(member => ({
          ref: member.ownerReference ?? member.ownerId,
          lib_id:
            payload.components.find(component => component.instanceId === member.ownerId)?.libraryId ??
            payload.components.find(component => component.instanceId === member.ownerId)?.templateId ??
            'unknown',
          pin_number: member.pinId,
          pin_name: member.pinName ?? member.pinId,
          electrical_type:
            payload.components
              .find(component => component.instanceId === member.ownerId)
              ?.pins.find(pin => pin.pinId === member.pinId)?.electricalType ?? 'unknown',
        })),
    })),
    unresolved: {
      symbols: [],
      ignored_non_electrical_symbols: [],
      non_component_markers: [],
    },
    code_pin_usage: payload.codePinUsage,
    validation_flags: payload.validationFlags,
    rule_findings: payload.ruleFindings,
    stats: {
      component_count: payload.components.length,
      net_count: payload.nets.length,
      unresolved_symbol_count: 0,
      ignored_non_electrical_symbol_count: 0,
      non_component_marker_count: 0,
      wire_segment_count: payload.project.importedConnectionCount,
      junction_count: 0,
      label_count: payload.nets.filter(net => Boolean(net.label)).length,
    },
  };
}

export function mergeLightweightValidationJsonReviewContext(
  base: LightweightValidationJson,
  reviewFacts: Pick<LightweightValidationJson, 'code_pin_usage' | 'validation_flags' | 'rule_findings'>
): LightweightValidationJson {
  return {
    ...base,
    code_pin_usage: reviewFacts.code_pin_usage,
    validation_flags: reviewFacts.validation_flags,
    rule_findings: reviewFacts.rule_findings,
  };
}

export function buildLightweightValidationJson(params: {
  document: ModuMakeProjectData;
  importSummary?: KiCadImportSummary;
  auditIssues?: ProjectAuditIssue[];
  sourceCode?: string;
  formalReport?: FormalVerificationReport;
}): LightweightValidationJson {
  const reviewPayload = buildDatasheetReviewPayload(params);
  return fromDatasheetReviewPayload(reviewPayload);
}

export function convertDatasheetReviewPayloadToLightweightValidationJson(
  payload: DatasheetReviewInputPayload
): LightweightValidationJson {
  return fromDatasheetReviewPayload(payload);
}
