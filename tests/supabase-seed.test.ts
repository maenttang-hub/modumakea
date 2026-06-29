import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSupabaseBootstrapSql,
  buildArduinoLibrariesUpsertSql,
  buildArduinoLibrarySeedRow,
  buildComponentsUpsertSql,
  buildComponentSeedRow,
  buildPartMasterSeedRow,
  buildPartMasterUpsertSql,
} from '@/lib/supabase-seed';
import { STATIC_COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { STATIC_ARDUINO_LIBRARY_CATALOG } from '@/lib/arduino-library-registry';
import { PART_MASTER_RECORDS } from '@/lib/part-master-catalog';

test('buildComponentsUpsertSql targets the new components table shape', () => {
  const rows = STATIC_COMPONENT_TEMPLATES.slice(0, 1).map(buildComponentSeedRow);
  const sql = buildComponentsUpsertSql(rows);

  assert.match(sql, /insert into public\.components/i);
  assert.match(sql, /simulation_model jsonb/i);
  assert.match(sql, /schematic_model jsonb/i);
  assert.match(sql, /on conflict \(id\) do update/i);
});

test('buildArduinoLibrariesUpsertSql emits an arduino_libraries upsert script', () => {
  const rows = STATIC_ARDUINO_LIBRARY_CATALOG.slice(0, 1).map(buildArduinoLibrarySeedRow);
  const sql = buildArduinoLibrariesUpsertSql(rows);

  assert.match(sql, /insert into public\.arduino_libraries/i);
  assert.match(sql, /latest_version varchar\(50\)/i);
  assert.match(sql, /on conflict \(name\) do update/i);
});

test('buildPartMasterUpsertSql emits a part_master upsert script', () => {
  const rows = PART_MASTER_RECORDS.slice(0, 1).map(buildPartMasterSeedRow);
  const sql = buildPartMasterUpsertSql(rows);

  assert.match(sql, /insert into public\.part_master/i);
  assert.match(sql, /canonical_mpn text/i);
  assert.match(sql, /pin_schema_json jsonb/i);
  assert.match(sql, /on conflict \(canonical_mpn\) do update/i);
});

test('buildSupabaseBootstrapSql combines schema and component seed into one SQL bundle', () => {
  const componentRows = STATIC_COMPONENT_TEMPLATES.slice(0, 1).map(buildComponentSeedRow);
  const partMasterRows = PART_MASTER_RECORDS.slice(0, 1).map(buildPartMasterSeedRow);
  const sql = buildSupabaseBootstrapSql({
    schemaSql: 'create table demo(id int);',
    componentRows,
    partMasterRows,
  });

  assert.match(sql, /create table demo\(id int\);/i);
  assert.match(sql, /-- Seed bundled ModuMake component catalog/i);
  assert.match(sql, /insert into public\.components/i);
  assert.match(sql, /-- Seed bundled Part Master catalog/i);
  assert.match(sql, /insert into public\.part_master/i);
});
