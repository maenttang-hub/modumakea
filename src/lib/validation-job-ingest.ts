import { randomUUID } from 'node:crypto';

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { buildValidationSnapshot } from '@/lib/validation-snapshot';
import type {
  DatasheetReviewRuleFinding,
  DatasheetReviewValidationFlag,
  LightweightValidationJson,
} from '@/types';
import { VALIDATION_SNAPSHOT_SCHEMA_VERSION } from '@/types';

type ValidationJobStatus = 'pending' | 'parsing' | 'analyzing' | 'completed' | 'failed';
type ValidationJobSourceKind = 'kicad_import' | 'modumake_canvas';

export interface ValidationJobIngestMetadata {
  projectId: string;
  requestId?: string | null;
  codeArtifactId?: string | null;
  sourceKind: ValidationJobSourceKind;
  status?: ValidationJobStatus;
  boardId?: string | null;
  boardName?: string | null;
  logicVoltage?: string | null;
  boardPinNames?: string[];
  boardNetLabels?: string[];
  integratedModelJson?: unknown;
  extractionPlanJson?: unknown;
  failureReason?: string | null;
  completedAt?: string | null;
}

export interface ValidationJobRowInsert {
  id: string;
  project_id: string;
  request_id: string | null;
  code_artifact_id: string | null;
  status: ValidationJobStatus;
  source_kind: ValidationJobSourceKind;
  validation_snapshot_id: string | null;
  validation_snapshot_version: number | null;
  schema_version: string;
  project_name: string;
  board_id: string | null;
  board_name: string | null;
  logic_voltage: string | null;
  imported_component_count: number;
  imported_connection_count: number;
  generated_custom_component_count: number;
  component_count: number;
  net_count: number;
  issue_count: number;
  unresolved_symbol_count: number;
  board_net_labels: string[];
  board_pin_names: string[];
  validation_input_json: LightweightValidationJson;
  integrated_model_json: unknown;
  validation_flags_json: DatasheetReviewValidationFlag[];
  rule_findings_json: DatasheetReviewRuleFinding[];
  extraction_plan_json: unknown;
  failure_reason: string | null;
  completed_at: string | null;
}

export interface ValidationSnapshotRowInsert {
  id: string;
  project_id: string;
  version: number;
  schema_version: string;
  validation_input_schema_version: string;
  source_kind: ValidationJobSourceKind;
  project_name: string;
  board_id: string | null;
  board_name: string | null;
  logic_voltage: string | null;
  issue_count: number;
  error_count: number;
  warning_count: number;
  info_count: number;
  snapshot_json: ReturnType<typeof buildValidationSnapshot>;
}

export interface ValidationNetRowInsert {
  id: string;
  validation_job_id: string;
  net_id: string;
  label: string | null;
  kind: LightweightValidationJson['nets'][number]['kind'];
  aliases: string[];
}

export interface ValidationNetMemberRowInsert {
  id: string;
  validation_net_id: string;
  owner_type: 'component';
  owner_id: string;
  owner_reference: string;
  pin_id: string;
  pin_name: string;
}

export interface ComponentInstanceRowInsert {
  id: string;
  validation_job_id: string;
  matched_part_id: string | null;
  instance_id: string;
  refdes: string;
  display_name: string | null;
  category: string | null;
  source_kind: string | null;
  template_id: string | null;
  lib_id: string;
  symbol_name: string;
  reference_prefix: string | null;
  value: string | null;
  footprint: string | null;
  mpn_candidates: string[];
  manufacturer_candidates: string[];
  tags: string[];
  pin_names: string[];
  net_labels: string[];
  connected_net_ids: string[];
  pin_net_map: LightweightValidationJson['components'][number]['pins'];
  metadata_json: Record<string, unknown>;
}

export interface CodePinUsageRowInsert {
  id: string;
  validation_job_id: string;
  operation_type: string;
  pin_argument: string;
  matched_mcu_pin_label: string | null;
  line_number: number | null;
  scope: string;
  mode: string | null;
  value: string | null;
  conditional: boolean;
  conditions_json: string[];
  call_path_json: string[];
  connected_net_labels: string[];
  connected_component_references: string[];
}

export interface ErrorFindingRowInsert {
  id: string;
  validation_job_id: string;
  component_instance_id: string | null;
  validation_net_id: string | null;
  source_engine: 'rule_based' | 'formal_verifier' | 'datasheet_ai';
  severity: 'info' | 'warning' | 'error';
  finding_code: string;
  rule_id: string | null;
  title: string;
  message: string;
  board_pin: string | null;
  net_label: string | null;
  line_number: number | null;
  operation: string | null;
  recommendation: string | null;
  evidence_json: Record<string, unknown>;
}

export interface ValidationJobIngestPlan {
  validationJob: ValidationJobRowInsert;
  validationSnapshot: ValidationSnapshotRowInsert;
  validationNets: ValidationNetRowInsert[];
  validationNetMembers: ValidationNetMemberRowInsert[];
  componentInstances: ComponentInstanceRowInsert[];
  codePinUsages: CodePinUsageRowInsert[];
  errorFindings: ErrorFindingRowInsert[];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0)))];
}

function deriveReferencePrefix(reference: string) {
  const match = reference.match(/^[A-Za-z]+/);
  return match?.[0] ?? null;
}

function buildFindingDedupKey(input: {
  ruleId?: string | null;
  title: string;
  message: string;
  componentReference?: string | null;
  boardPin?: string | null;
  netLabel?: string | null;
  lineNumber?: number | null;
  operation?: string | null;
}) {
  return [
    input.ruleId ?? '',
    input.title,
    input.message,
    input.componentReference ?? '',
    input.boardPin ?? '',
    input.netLabel ?? '',
    String(input.lineNumber ?? ''),
    input.operation ?? '',
  ].join('::');
}

export function buildValidationJobIngestPlan(
  validationInput: LightweightValidationJson,
  metadata: ValidationJobIngestMetadata,
  snapshotVersion = 1
): ValidationJobIngestPlan {
  const validationJobId = randomUUID();
  const validationSnapshotId = randomUUID();
  const componentRowIdByRef = new Map<string, string>();
  const componentRowIdByInstance = new Map<string, string>();

  const componentInstances: ComponentInstanceRowInsert[] = validationInput.components.map(component => {
    const rowId = randomUUID();
    componentRowIdByRef.set(component.ref, rowId);
    componentRowIdByInstance.set(component.instance_id, rowId);

    return {
      id: rowId,
      validation_job_id: validationJobId,
      matched_part_id: null,
      instance_id: component.instance_id,
      refdes: component.ref,
      display_name: component.symbol_name ?? null,
      category: null,
      source_kind: validationInput.source.source_file_kind,
      template_id: null,
      lib_id: component.lib_id,
      symbol_name: component.symbol_name,
      reference_prefix: deriveReferencePrefix(component.ref),
      value: component.value ?? null,
      footprint: component.footprint ?? null,
      mpn_candidates: component.mpn_candidates,
      manufacturer_candidates: [],
      tags: [],
      pin_names: uniqueStrings(component.pins.map(pin => pin.pin_name)),
      net_labels: uniqueStrings(component.pins.map(pin => pin.net_label)),
      connected_net_ids: uniqueStrings(component.pins.map(pin => pin.net_id)),
      pin_net_map: component.pins,
      metadata_json: {
        source_file_kind: validationInput.source.source_file_kind,
      },
    };
  });

  const validationNetIdByLogicalNetId = new Map<string, string>();
  const validationNetIdByLabel = new Map<string, string>();

  const validationNets: ValidationNetRowInsert[] = validationInput.nets.map(net => {
    const rowId = randomUUID();
    validationNetIdByLogicalNetId.set(net.net_id, rowId);
    if (net.label) {
      validationNetIdByLabel.set(net.label, rowId);
    }
    return {
      id: rowId,
      validation_job_id: validationJobId,
      net_id: net.net_id,
      label: net.label ?? null,
      kind: net.kind,
      aliases: net.aliases,
    };
  });

  const refToComponent = new Map(validationInput.components.map(component => [component.ref, component]));

  const validationNetMembers: ValidationNetMemberRowInsert[] = validationInput.nets.flatMap(net => {
    const validationNetId = validationNetIdByLogicalNetId.get(net.net_id);
    if (!validationNetId) {
      return [];
    }

    return net.connected_pins.flatMap(member => {
      const owner = refToComponent.get(member.ref);
      if (!owner) {
        return [];
      }

      return [{
        id: randomUUID(),
        validation_net_id: validationNetId,
        owner_type: 'component' as const,
        owner_id: owner.instance_id,
        owner_reference: owner.ref,
        pin_id: member.pin_number,
        pin_name: member.pin_name,
      }];
    });
  });

  const codePinUsages: CodePinUsageRowInsert[] = (validationInput.code_pin_usage ?? []).map(usage => ({
    id: randomUUID(),
    validation_job_id: validationJobId,
    operation_type: usage.operationType,
    pin_argument: usage.pinArgument,
    matched_mcu_pin_label: usage.matchedMcuPinLabel,
    line_number: usage.lineNumber ?? null,
    scope: usage.scope,
    mode: usage.mode ?? null,
    value: usage.value ?? null,
    conditional: usage.conditional,
    conditions_json: usage.conditions,
    call_path_json: usage.callPath,
    connected_net_labels: usage.connectedNetLabels,
    connected_component_references: usage.connectedComponentReferences,
  }));

  const dedupedFindings = new Map<string, {
    sourceEngine: 'rule_based' | 'formal_verifier' | 'datasheet_ai';
    severity: 'info' | 'warning' | 'error';
    findingCode: string;
    ruleId: string | null;
    confidence: DatasheetReviewValidationFlag['confidence'] | DatasheetReviewRuleFinding['confidence'] | null;
    title: string;
    message: string;
    componentReference: string | null;
    boardPin: string | null;
    netLabel: string | null;
    lineNumber: number | null;
    operation: string | null;
    recommendation: string | null;
    evidenceJson: Record<string, unknown>;
  }>();

  for (const flag of validationInput.validation_flags ?? []) {
    const key = buildFindingDedupKey({
      ruleId: flag.ruleId,
      title: flag.title,
      message: flag.message,
      componentReference: flag.componentReference,
      boardPin: flag.boardPin,
      lineNumber: flag.lineNumber,
      operation: flag.operation,
    });

    dedupedFindings.set(key, {
      sourceEngine: flag.source,
      severity: flag.severity,
      findingCode: flag.code,
      ruleId: flag.ruleId,
      confidence: flag.confidence ?? null,
      title: flag.title,
      message: flag.message,
      componentReference: flag.componentReference ?? null,
      boardPin: flag.boardPin ?? null,
      netLabel: null,
      lineNumber: flag.lineNumber ?? null,
      operation: flag.operation ?? null,
      recommendation: flag.recommendation ?? null,
      evidenceJson: flag as unknown as Record<string, unknown>,
    });
  }

  for (const finding of validationInput.rule_findings ?? []) {
    const key = buildFindingDedupKey({
      ruleId: finding.ruleId,
      title: finding.title,
      message: finding.message,
      componentReference: finding.componentReference,
      boardPin: finding.boardPin,
      netLabel: finding.netLabel,
    });

    if (dedupedFindings.has(key)) {
      continue;
    }

    dedupedFindings.set(key, {
      sourceEngine: 'rule_based',
      severity: finding.severity,
      findingCode: finding.ruleId,
      ruleId: finding.ruleId,
      confidence: finding.confidence ?? null,
      title: finding.title,
      message: finding.message,
      componentReference: finding.componentReference ?? null,
      boardPin: finding.boardPin ?? null,
      netLabel: finding.netLabel ?? null,
      lineNumber: null,
      operation: null,
      recommendation: finding.recommendation ?? null,
      evidenceJson: finding as unknown as Record<string, unknown>,
    });
  }

  const errorFindings: ErrorFindingRowInsert[] = [...dedupedFindings.values()].map(finding => ({
    id: randomUUID(),
    validation_job_id: validationJobId,
    component_instance_id: finding.componentReference ? (componentRowIdByRef.get(finding.componentReference) ?? null) : null,
    validation_net_id: finding.netLabel ? (validationNetIdByLabel.get(finding.netLabel) ?? null) : null,
    source_engine: finding.sourceEngine,
    severity: finding.severity,
    finding_code: finding.findingCode,
    rule_id: finding.ruleId,
    title: finding.title,
    message: finding.message,
    board_pin: finding.boardPin,
    net_label: finding.netLabel,
    line_number: finding.lineNumber,
    operation: finding.operation,
    recommendation: finding.recommendation,
    evidence_json: {
      ...finding.evidenceJson,
      confidence: finding.confidence,
      componentReference: finding.componentReference,
    },
  }));

  const boardNetLabels = uniqueStrings([
    ...(metadata.boardNetLabels ?? []),
    ...validationInput.nets.map(net => net.label),
  ]);
  const boardPinNames = uniqueStrings([
    ...(metadata.boardPinNames ?? []),
    ...(validationInput.code_pin_usage ?? []).flatMap(usage =>
      usage.matchedMcuPinLabel ? [usage.matchedMcuPinLabel] : []
    ),
  ]);

  const validationJob: ValidationJobRowInsert = {
    id: validationJobId,
    project_id: metadata.projectId,
    request_id: metadata.requestId ?? null,
    code_artifact_id: metadata.codeArtifactId ?? null,
    status: metadata.status ?? 'completed',
    source_kind: metadata.sourceKind,
    validation_snapshot_id: validationSnapshotId,
    validation_snapshot_version: snapshotVersion,
    schema_version: validationInput.schema_version,
    project_name: validationInput.source.project_name,
    board_id: metadata.boardId ?? null,
    board_name: metadata.boardName ?? null,
    logic_voltage: metadata.logicVoltage ?? null,
    imported_component_count: validationInput.stats.component_count,
    imported_connection_count: validationInput.stats.wire_segment_count,
    generated_custom_component_count: 0,
    component_count: validationInput.stats.component_count,
    net_count: validationInput.stats.net_count,
    issue_count: errorFindings.length,
    unresolved_symbol_count: validationInput.stats.unresolved_symbol_count,
    board_net_labels: boardNetLabels,
    board_pin_names: boardPinNames,
    validation_input_json: validationInput,
    integrated_model_json: metadata.integratedModelJson ?? validationInput,
    validation_flags_json: validationInput.validation_flags ?? [],
    rule_findings_json: validationInput.rule_findings ?? [],
    extraction_plan_json: metadata.extractionPlanJson ?? {},
    failure_reason: metadata.failureReason ?? null,
    completed_at: metadata.completedAt ?? null,
  };

  const validationSnapshotJson = buildValidationSnapshot({
    validationJob,
    validationNets,
    validationNetMembers,
    componentInstances,
    codePinUsages,
    errorFindings,
  }, metadata, snapshotVersion);

  const validationSnapshot: ValidationSnapshotRowInsert = {
    id: validationSnapshotId,
    project_id: metadata.projectId,
    version: snapshotVersion,
    schema_version: VALIDATION_SNAPSHOT_SCHEMA_VERSION,
    validation_input_schema_version: validationInput.schema_version,
    source_kind: metadata.sourceKind,
    project_name: validationJob.project_name,
    board_id: validationJob.board_id,
    board_name: validationJob.board_name,
    logic_voltage: validationJob.logic_voltage,
    issue_count: validationSnapshotJson.stats.issueCount,
    error_count: validationSnapshotJson.stats.errorCount,
    warning_count: validationSnapshotJson.stats.warningCount,
    info_count: validationSnapshotJson.stats.infoCount,
    snapshot_json: validationSnapshotJson,
  };

  return {
    validationJob,
    validationSnapshot,
    validationNets,
    validationNetMembers,
    componentInstances,
    codePinUsages,
    errorFindings,
  };
}

export async function ingestLightweightValidationJson(
  validationInput: LightweightValidationJson,
  metadata: ValidationJobIngestMetadata
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.');
  }

  const { data: latestSnapshot } = await supabase
    .from('validation_snapshots')
    .select('version')
    .eq('project_id', metadata.projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const nextSnapshotVersion = (latestSnapshot?.version ?? 0) + 1;
  const plan = buildValidationJobIngestPlan(validationInput, metadata, nextSnapshotVersion);

  const { error: snapshotError } = await supabase.from('validation_snapshots').insert(plan.validationSnapshot);
  if (snapshotError) {
    throw new Error(snapshotError.message);
  }

  const { error: jobError } = await supabase.from('validation_jobs').insert(plan.validationJob);
  if (jobError) {
    throw new Error(jobError.message);
  }

  if (plan.validationNets.length > 0) {
    const { error } = await supabase.from('validation_nets').insert(plan.validationNets);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (plan.validationNetMembers.length > 0) {
    const { error } = await supabase.from('validation_net_members').insert(plan.validationNetMembers);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (plan.componentInstances.length > 0) {
    const { error } = await supabase.from('component_instances').insert(plan.componentInstances);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (plan.codePinUsages.length > 0) {
    const { error } = await supabase.from('code_pin_usages').insert(plan.codePinUsages);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (plan.errorFindings.length > 0) {
    const { error } = await supabase.from('error_findings').insert(plan.errorFindings);
    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: summaryRow } = await supabase
    .from('project_validation_summaries')
    .select('main_validation_job_id, main_validation_snapshot_id')
    .eq('project_id', metadata.projectId)
    .maybeSingle<{
      main_validation_job_id: string | null;
      main_validation_snapshot_id: string | null;
    }>();

  const { error: summaryError } = await supabase
    .from('project_validation_summaries')
    .upsert({
      project_id: metadata.projectId,
      latest_validation_job_id: plan.validationJob.id,
      latest_validation_snapshot_id: plan.validationSnapshot.id,
      main_validation_job_id: summaryRow?.main_validation_job_id ?? plan.validationJob.id,
      main_validation_snapshot_id: summaryRow?.main_validation_snapshot_id ?? plan.validationSnapshot.id,
      latest_issue_count: plan.validationSnapshot.issue_count,
      updated_at: new Date().toISOString(),
    });

  if (summaryError) {
    throw new Error(summaryError.message);
  }

  return plan;
}
