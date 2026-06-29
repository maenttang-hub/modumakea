import test from 'node:test';
import assert from 'node:assert/strict';

import type { LightweightValidationJson } from '@/types';

function createValidationInput(overrides: Partial<LightweightValidationJson> = {}): LightweightValidationJson {
  return {
    schema_version: '2026-06-19',
    source: {
      source_file_kind: 'kicad_sch',
      project_name: 'Validation Route Test',
      generator: 'unit-test',
      version: '20211123',
    },
    components: [
      {
        instance_id: 'u1',
        ref: 'U1',
        lib_id: 'MCU_Microchip_ATmega:ATmega328P-PU',
        symbol_name: 'ATmega328P-PU',
        value: 'ATmega328P-PU',
        footprint: 'DIP-28_W7.62mm',
        mpn_candidates: ['ATmega328P-PU'],
        pins: [
          {
            pin_number: '4',
            pin_name: 'VCC',
            electrical_type: 'power_in',
            direction: 'input',
            net_id: 'net-vcc',
            net_label: 'VCC',
            net_aliases: [],
          },
        ],
      },
    ],
    nets: [
      {
        net_id: 'net-vcc',
        label: 'VCC',
        aliases: [],
        kind: 'power',
        connected_pins: [
          {
            ref: 'U1',
            lib_id: 'MCU_Microchip_ATmega:ATmega328P-PU',
            pin_number: '4',
            pin_name: 'VCC',
            electrical_type: 'power_in',
          },
        ],
      },
    ],
    unresolved: {
      symbols: [],
    },
    stats: {
      component_count: 1,
      net_count: 1,
      unresolved_symbol_count: 0,
      wire_segment_count: 1,
      junction_count: 0,
      label_count: 1,
    },
    ...overrides,
  };
}

test('validation jobs route rejects malformed validation input', async () => {
  const { handleValidationJobsPost } = await import('@/app/api/validation-jobs/route-handler');

  const response = await handleValidationJobsPost(
    new Request('http://localhost/api/validation-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationInput: { broken: true },
        metadata: {
          projectId: 'project-1',
          sourceKind: 'kicad_import',
        },
      }),
    })
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(String(payload.error), /validationInput/i);
});

test('validation jobs route rejects missing metadata requirements', async () => {
  const { handleValidationJobsPost } = await import('@/app/api/validation-jobs/route-handler');

  const response = await handleValidationJobsPost(
    new Request('http://localhost/api/validation-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationInput: createValidationInput(),
        metadata: {
          projectId: '',
          sourceKind: 'unknown',
        },
      }),
    })
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(String(payload.error), /projectId|sourceKind/i);
});

test('validation jobs route returns normalized counts after ingest succeeds', async () => {
  const { handleValidationJobsPost } = await import('@/app/api/validation-jobs/route-handler');

  const calls: Array<{
    validationInput: LightweightValidationJson;
    metadata: { projectId: string; sourceKind: string };
  }> = [];

  const response = await handleValidationJobsPost(
    new Request('http://localhost/api/validation-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationInput: createValidationInput(),
        metadata: {
          projectId: 'project-1',
          sourceKind: 'kicad_import',
        },
      }),
    }),
    {
      ingest: async (validationInput, metadata) => {
        calls.push({
          validationInput,
          metadata: {
            projectId: metadata.projectId,
            sourceKind: metadata.sourceKind,
          },
        });

        return {
          validationJob: {
            id: 'job-1',
            project_id: metadata.projectId,
            request_id: 'request-1',
            code_artifact_id: null,
            status: 'completed',
            source_kind: metadata.sourceKind,
            validation_snapshot_id: 'snapshot-1',
            validation_snapshot_version: 3,
            schema_version: validationInput.schema_version,
            project_name: validationInput.source.project_name,
            board_id: null,
            board_name: null,
            logic_voltage: null,
            imported_component_count: 1,
            imported_connection_count: 1,
            generated_custom_component_count: 0,
            component_count: 1,
            net_count: 1,
            issue_count: 2,
            unresolved_symbol_count: 0,
            board_net_labels: ['VCC'],
            board_pin_names: [],
            validation_input_json: validationInput,
            integrated_model_json: validationInput,
            validation_flags_json: [],
            rule_findings_json: [],
            extraction_plan_json: {},
            failure_reason: null,
            completed_at: null,
          },
          validationSnapshot: {
            id: 'snapshot-1',
            project_id: metadata.projectId,
            version: 3,
            schema_version: '2026-06-28',
            validation_input_schema_version: validationInput.schema_version,
            source_kind: metadata.sourceKind,
            project_name: validationInput.source.project_name,
            board_id: null,
            board_name: null,
            logic_voltage: null,
            issue_count: 2,
            error_count: 1,
            warning_count: 1,
            info_count: 0,
            snapshot_json: {
              schemaVersion: '2026-06-28',
              validationInputSchemaVersion: validationInput.schema_version,
              projectId: metadata.projectId,
              projectName: validationInput.source.project_name,
              sourceKind: metadata.sourceKind,
              boardId: null,
              boardName: null,
              logicVoltage: null,
              version: 3,
            stats: {
              componentCount: 1,
              netCount: 1,
              issueCount: 2,
              unresolvedSymbolCount: 0,
              errorCount: 1,
              warningCount: 1,
              infoCount: 0,
              sourceBucketCounts: {
                official: 0,
                partial: 0,
                generic: 1,
                fallback: 1,
                other: 0,
              },
            },
              validationInput,
              issues: [],
            },
          },
          validationNets: [
            {
              id: 'net-row-1',
              validation_job_id: 'job-1',
              net_id: 'net-vcc',
              label: 'VCC',
              kind: 'power',
              aliases: [],
            },
          ],
          validationNetMembers: [
            {
              id: 'member-1',
              validation_net_id: 'net-row-1',
              owner_type: 'component',
              owner_id: 'u1',
              owner_reference: 'U1',
              pin_id: '4',
              pin_name: 'VCC',
            },
          ],
          componentInstances: [
            {
              id: 'component-row-1',
              validation_job_id: 'job-1',
              matched_part_id: null,
              instance_id: 'u1',
              refdes: 'U1',
              display_name: 'ATmega328P-PU',
              category: null,
              source_kind: 'kicad_sch',
              template_id: null,
              lib_id: 'MCU_Microchip_ATmega:ATmega328P-PU',
              symbol_name: 'ATmega328P-PU',
              reference_prefix: 'U',
              value: 'ATmega328P-PU',
              footprint: 'DIP-28_W7.62mm',
              mpn_candidates: ['ATmega328P-PU'],
              manufacturer_candidates: [],
              tags: [],
              pin_names: ['VCC'],
              net_labels: ['VCC'],
              connected_net_ids: ['net-vcc'],
              pin_net_map: validationInput.components[0]!.pins,
              metadata_json: {},
            },
          ],
          codePinUsages: [],
          errorFindings: [
            {
              id: 'finding-1',
              validation_job_id: 'job-1',
              component_instance_id: null,
              validation_net_id: 'net-row-1',
              source_engine: 'rule_based',
              severity: 'warning',
              finding_code: 'demo.warning',
              rule_id: 'demo.warning',
              title: 'Demo warning',
              message: 'warning message',
              board_pin: null,
              net_label: 'VCC',
              line_number: null,
              operation: null,
              recommendation: null,
              evidence_json: {},
            },
            {
              id: 'finding-2',
              validation_job_id: 'job-1',
              component_instance_id: null,
              validation_net_id: null,
              source_engine: 'formal_verifier',
              severity: 'error',
              finding_code: 'demo.error',
              rule_id: 'demo.error',
              title: 'Demo error',
              message: 'error message',
              board_pin: 'D2',
              net_label: null,
              line_number: 12,
              operation: 'digitalWrite',
              recommendation: 'Reconnect pin',
              evidence_json: {},
            },
          ],
        };
      },
    }
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.metadata.projectId, 'project-1');
  assert.equal(calls[0]?.metadata.sourceKind, 'kicad_import');

  const payload = await response.json();
  assert.equal(payload.validationJobId, 'job-1');
  assert.equal(payload.validationSnapshotId, 'snapshot-1');
  assert.equal(payload.validationSnapshotVersion, 3);
  assert.equal(payload.projectId, 'project-1');
  assert.equal(payload.status, 'completed');
  assert.deepEqual(payload.counts, {
    components: 1,
    nets: 1,
    netMembers: 1,
    codePinUsages: 0,
    findings: 2,
  });
  assert.equal(typeof payload.requestId, 'string');
});

test('validation jobs route returns 503 when ingest reports missing admin client', async () => {
  const { handleValidationJobsPost } = await import('@/app/api/validation-jobs/route-handler');

  const response = await handleValidationJobsPost(
    new Request('http://localhost/api/validation-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationInput: createValidationInput(),
        metadata: {
          projectId: 'project-1',
          sourceKind: 'kicad_import',
        },
      }),
    }),
    {
      ingest: async () => {
        throw new Error('Supabase admin client is not configured.');
      },
    }
  );

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.match(String(payload.error), /Supabase admin client/i);
});
