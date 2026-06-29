import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidationJobIngestPlan } from '@/lib/validation-job-ingest';
import type { LightweightValidationJson } from '@/types';

const validationInput: LightweightValidationJson = {
  schema_version: '2026-06-19',
  source: {
    source_file_kind: 'kicad_sch',
    project_name: 'Smart_IoT_Sensor_Hub',
    generator: 'eeschema',
    version: '20211123',
  },
  components: [
    {
      instance_id: 'mcu-1',
      ref: 'U1',
      lib_id: 'MCU_Espressif:ESP32-WROOM-32',
      symbol_name: 'ESP32-WROOM-32E',
      value: 'ESP32-WROOM-32E',
      footprint: 'RF_Module:ESP32-WROOM-32',
      mpn_candidates: ['ESP32-WROOM-32E'],
      pins: [
        {
          pin_number: '11',
          pin_name: 'GPIO21',
          electrical_type: 'bidirectional',
          direction: 'bidirectional',
          net_id: 'net-3',
          net_label: 'SDA',
          net_aliases: [],
        },
      ],
    },
  ],
  nets: [
    {
      net_id: 'net-3',
      label: 'SDA',
      aliases: [],
      kind: 'bus',
      connected_pins: [
        {
          ref: 'U1',
          lib_id: 'MCU_Espressif:ESP32-WROOM-32',
          pin_number: '11',
          pin_name: 'GPIO21',
          electrical_type: 'bidirectional',
        },
      ],
    },
  ],
  unresolved: {
    symbols: [
      {
        instanceId: 'u-9',
        reference: 'U9',
        libId: 'Custom:VendorModule',
        value: 'VendorModule',
        reason: 'missing_library_symbol',
      },
    ],
  },
  code_pin_usage: [
    {
      operationType: 'pinMode',
      pinArgument: 'GPIO21',
      matchedMcuPinLabel: 'GPIO21',
      lineNumber: 12,
      scope: 'setup',
      mode: 'INPUT',
      conditional: false,
      conditions: [],
      callPath: [],
      connectedNetLabels: ['SDA'],
      connectedComponentReferences: ['U1'],
    },
  ],
  validation_flags: [
    {
      source: 'formal_verifier',
      severity: 'error',
      code: 'formal.unwired-pin-reference',
      ruleId: 'formal.unwired-pin-reference',
      title: 'HW/SW Pin Mismatch',
      message: 'Code uses GPIO21 but the imported schematic does not match it cleanly.',
      componentReference: 'U1',
      boardPin: 'GPIO21',
      lineNumber: 12,
      operation: 'pinMode',
      recommendation: 'Reconnect the signal or update the code pin.',
    },
  ],
  rule_findings: [
    {
      severity: 'warning',
      ruleId: 'audit.i2c-pullup-missing',
      title: 'I2C Pull-up Missing',
      message: 'SCL/SDA pull-up resistor is missing.',
      componentReference: 'U1',
      netLabel: 'SDA',
      recommendation: 'Add 4.7k pull-up resistors to SDA and SCL.',
    },
  ],
  stats: {
    component_count: 1,
    net_count: 1,
    unresolved_symbol_count: 1,
    wire_segment_count: 7,
    junction_count: 1,
    label_count: 1,
  },
};

test('buildValidationJobIngestPlan maps lightweight validation JSON into normalized validation rows', () => {
  const plan = buildValidationJobIngestPlan(validationInput, {
    projectId: 'project-1',
    sourceKind: 'kicad_import',
    boardId: 'esp32_wroom_32e',
    boardName: 'ESP32-WROOM-32E DevKit',
    logicVoltage: '3.3V',
    extractionPlanJson: {
      strategy: 'focused-sections',
    },
  });

  assert.equal(plan.validationJob.project_id, 'project-1');
  assert.equal(plan.validationJob.schema_version, '2026-06-19');
  assert.equal(plan.validationJob.validation_input_json.source.project_name, 'Smart_IoT_Sensor_Hub');
  assert.equal(plan.validationJob.component_count, 1);
  assert.equal(plan.validationJob.net_count, 1);
  assert.equal(plan.validationJob.unresolved_symbol_count, 1);
  assert.equal(plan.validationJob.validation_snapshot_version, 1);
  assert.deepEqual(plan.validationJob.board_net_labels, ['SDA']);
  assert.deepEqual(plan.validationJob.board_pin_names, ['GPIO21']);
  assert.equal(plan.validationSnapshot.version, 1);
  assert.equal(plan.validationSnapshot.snapshot_json.projectId, 'project-1');
  assert.equal(plan.validationSnapshot.snapshot_json.stats.issueCount, 2);

  assert.equal(plan.componentInstances.length, 1);
  assert.equal(plan.componentInstances[0]?.refdes, 'U1');
  assert.deepEqual(plan.componentInstances[0]?.connected_net_ids, ['net-3']);

  assert.equal(plan.validationNets.length, 1);
  assert.equal(plan.validationNetMembers.length, 1);
  assert.equal(plan.validationNetMembers[0]?.owner_reference, 'U1');

  assert.equal(plan.codePinUsages.length, 1);
  assert.equal(plan.codePinUsages[0]?.pin_argument, 'GPIO21');

  assert.equal(plan.errorFindings.length, 2);
  assert.ok(plan.errorFindings.some(finding => finding.finding_code === 'formal.unwired-pin-reference'));
  assert.ok(plan.errorFindings.some(finding => finding.finding_code === 'audit.i2c-pullup-missing'));
  assert.ok(plan.errorFindings.some(finding => finding.validation_net_id !== null));
});
