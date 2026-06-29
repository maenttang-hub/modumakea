import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMON_MODULE_ALIAS_BY_NORMALIZED,
  GY_MODULE_ALIAS_BY_NORMALIZED,
  GY_MODULE_ALIAS_RECORDS,
  normalizeModuleAlias,
  resolveCommonModuleAlias,
  resolveGyModuleAlias,
} from '@/lib/module-alias-catalog';

test('GY module alias catalog includes common clone module names', () => {
  assert.ok(GY_MODULE_ALIAS_RECORDS.length >= 5);
  assert.ok(GY_MODULE_ALIAS_BY_NORMALIZED.has('GY-521'));
  assert.ok(GY_MODULE_ALIAS_BY_NORMALIZED.has('GY-BME280'));
  assert.ok(GY_MODULE_ALIAS_BY_NORMALIZED.has('GY-MAX4466'));
});

test('module alias normalization collapses common spacing and separator variants', () => {
  assert.equal(normalizeModuleAlias('gy 521'), 'GY-521');
  assert.equal(normalizeModuleAlias('gy_bme280'), 'GY-BME280');
  assert.equal(normalizeModuleAlias(' GY---MAX4466 '), 'GY-MAX4466');
});

test('GY alias resolution returns canonical chip mappings', () => {
  assert.equal(resolveGyModuleAlias('gy-521')?.canonicalChip, 'MPU-6050');
  assert.equal(resolveGyModuleAlias('GY_BME280')?.canonicalChip, 'BME280');
  assert.equal(resolveGyModuleAlias('gy max4466')?.canonicalChip, 'MAX4466');
  assert.equal(resolveGyModuleAlias('GY-UNKNOWN'), null);
});

test('common module alias catalog resolves non-GY popular module names too', () => {
  assert.ok(COMMON_MODULE_ALIAS_BY_NORMALIZED.has('HC-06'));
  assert.ok(COMMON_MODULE_ALIAS_BY_NORMALIZED.has('CJMCU-811'));
  assert.equal(resolveCommonModuleAlias('hc06')?.canonicalChip, 'HC-06 Bluetooth SPP module');
  assert.equal(resolveCommonModuleAlias('dht22 module')?.canonicalChip, 'DHT22/AM2302');
  assert.equal(resolveCommonModuleAlias('cj_mcu_811')?.canonicalChip, 'CCS811');
});
