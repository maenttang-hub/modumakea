import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PART_MASTER_BY_MPN,
  PART_MASTER_RECORDS,
  STARTER_PART_MASTER_BY_MPN,
  STARTER_PART_MASTER_RECORDS,
} from '@/lib/part-master-catalog';

test('starter part master catalog includes official datasheet-backed core parts', () => {
  assert.ok(STARTER_PART_MASTER_RECORDS.length >= 10);
  assert.ok(STARTER_PART_MASTER_BY_MPN.has('ATMEGA328P-PU'));
  assert.ok(STARTER_PART_MASTER_BY_MPN.has('ESP32-WROOM-32E'));
  assert.ok(STARTER_PART_MASTER_BY_MPN.has('BME280'));
});

test('starter part master records keep official datasheet URLs and normalized names', () => {
  for (const record of STARTER_PART_MASTER_RECORDS) {
    assert.match(record.datasheetUrl, /^https:\/\//);
    assert.ok(record.normalizedPartName.trim().length > 0);
    assert.ok(record.manufacturerName.trim().length > 0);
    assert.ok(record.specsJson.summary.trim().length > 0);
  }
});

test('merged part master catalog includes curated datasheet-normalized parts', () => {
  assert.ok(PART_MASTER_RECORDS.length > STARTER_PART_MASTER_RECORDS.length);
  assert.ok(PART_MASTER_BY_MPN.has('INA226AIDGST'));
  assert.ok(PART_MASTER_BY_MPN.has('DS3231SN#'));
  assert.ok(PART_MASTER_BY_MPN.has('HC-06'));
  assert.ok(PART_MASTER_BY_MPN.has('SSD1306'));
});

test('curated power-aware records expose current consumption hints for rail budgeting', () => {
  const bme680 = PART_MASTER_BY_MPN.get('BME680');
  const max30102 = PART_MASTER_BY_MPN.get('MAX30102');
  const hc06 = PART_MASTER_BY_MPN.get('HC-06');

  assert.equal(bme680?.specsJson.currentConsumption?.peakMa, 12);
  assert.equal(max30102?.specsJson.currentConsumption?.peakMa, 50);
  assert.equal(hc06?.specsJson.currentConsumption?.measureUa, 25000);
  assert.ok((bme680?.specsJson.currentConsumption?.moduleOverheadMa ?? 0) > 0);
  assert.ok((max30102?.specsJson.currentConsumption?.modes?.length ?? 0) >= 3);
  assert.equal(bme680?.specsJson.currentConsumption?.defaultMode, 'ambient-measure');
  assert.equal(hc06?.specsJson.currentConsumption?.defaultMode, 'connected');
  assert.ok(
    (bme680?.specsJson.currentConsumption?.notes?.length ?? 0) > 0,
    'expected power profile notes for high-variance parts'
  );
});

test('curated records expose netlist-friendly validation hints for common modules', () => {
  const ds18b20 = PART_MASTER_BY_MPN.get('DS18B20');
  const hc06 = PART_MASTER_BY_MPN.get('HC-06');
  const bme280 = PART_MASTER_BY_MPN.get('BME280');
  const esp32 = STARTER_PART_MASTER_BY_MPN.get('ESP32-WROOM-32E');

  assert.deepEqual(
    ds18b20?.specsJson.validationHints?.biasResistors?.[0]?.pinNames,
    ['DQ', 'DATA']
  );
  assert.equal(
    ds18b20?.specsJson.validationHints?.biasResistors?.[0]?.kind,
    'pull-up'
  );
  assert.deepEqual(
    hc06?.specsJson.validationHints?.decoupling?.recommendedValues,
    ['10uF', '0.1uF']
  );
  assert.equal(
    hc06?.specsJson.validationHints?.signalLevelLimits?.[0]?.maxVoltage,
    3.6
  );
  assert.deepEqual(
    bme280?.specsJson.validationHints?.decoupling?.recommendedValues,
    ['0.1uF']
  );
  assert.deepEqual(
    bme280?.specsJson.validationHints?.strapPins?.[0]?.allowedReferences,
    ['power', 'ground']
  );
  assert.deepEqual(
    esp32?.specsJson.validationHints?.biasResistors?.map(entry => entry.pinNames[0]),
    ['EN', 'GPIO0']
  );
});

test('starter analog and ADC-aware records expose profiles for realistic analog validation', () => {
  const atmega328p = STARTER_PART_MASTER_BY_MPN.get('ATMEGA328P-PU');
  const esp32 = STARTER_PART_MASTER_BY_MPN.get('ESP32-WROOM-32E');
  const lm358 = STARTER_PART_MASTER_BY_MPN.get('LM358');
  const tl072 = STARTER_PART_MASTER_BY_MPN.get('TL072');
  const sen0161 = STARTER_PART_MASTER_BY_MPN.get('SEN0161');
  const mcp6002 = STARTER_PART_MASTER_BY_MPN.get('MCP6002T-I/SN');
  const tlv2372 = STARTER_PART_MASTER_BY_MPN.get('TLV2372IDR');
  const opa2333 = STARTER_PART_MASTER_BY_MPN.get('OPA2333AIDR');
  const stm32f103 = STARTER_PART_MASTER_BY_MPN.get('STM32F103C8T6');
  const ads1115 = STARTER_PART_MASTER_BY_MPN.get('ADS1115');
  const ads1015 = STARTER_PART_MASTER_BY_MPN.get('ADS1015');
  const mcp3208 = STARTER_PART_MASTER_BY_MPN.get('MCP3208');
  const sen0244 = STARTER_PART_MASTER_BY_MPN.get('SEN0244');
  const dfr0300 = STARTER_PART_MASTER_BY_MPN.get('DFR0300');
  const hx711 = STARTER_PART_MASTER_BY_MPN.get('HX711');

  assert.equal(atmega328p?.specsJson.adcProfile?.effectiveBits, 10);
  assert.equal(esp32?.specsJson.adcProfile?.acquisitionTimeUs, 2);
  assert.equal(lm358?.specsJson.analogCharacteristics?.gbwHz, 1_000_000);
  assert.equal(lm358?.specsJson.analogCharacteristics?.railToRailOutput, false);
  assert.equal(tl072?.specsJson.analogCharacteristics?.outputSwingLowHeadroomV, 1.5);
  assert.equal(sen0161?.specsJson.analogCharacteristics?.needsBufferForAdc, true);
  assert.equal(sen0161?.specsJson.analogCharacteristics?.recommendedAdcSourceImpedanceOhms, 10_000);
  assert.equal(mcp6002?.specsJson.analogCharacteristics?.railToRailOutput, true);
  assert.equal(tlv2372?.specsJson.analogCharacteristics?.railToRailInput, true);
  assert.equal(opa2333?.specsJson.analogCharacteristics?.gbwHz, 350_000);
  assert.equal(stm32f103?.specsJson.adcProfile?.effectiveBits, 12);
  assert.equal(ads1115?.specsJson.adcProfile?.effectiveBits, 16);
  assert.equal(ads1015?.specsJson.adcProfile?.effectiveBits, 12);
  assert.equal(mcp3208?.specsJson.adcProfile?.sampleCapacitancePf, 20);
  assert.equal(sen0244?.specsJson.analogCharacteristics?.needsBufferForAdc, true);
  assert.equal(dfr0300?.specsJson.analogCharacteristics?.needsBufferForAdc, true);
  assert.equal(hx711?.specsJson.analogCharacteristics?.needsBufferForAdc, false);
});

test('starter catalog includes common regulator max-input limits in part_master', () => {
  const ams1117 = STARTER_PART_MASTER_BY_MPN.get('AMS1117');
  const lm7805 = STARTER_PART_MASTER_BY_MPN.get('LM7805');
  const lm317 = STARTER_PART_MASTER_BY_MPN.get('LM317');

  assert.equal(ams1117?.specsJson.absoluteMax?.supplyVoltageMax, 15);
  assert.equal(lm7805?.specsJson.absoluteMax?.supplyVoltageMax, 35);
  assert.equal(lm317?.specsJson.absoluteMax?.supplyVoltageMax, 40);
  assert.ok(ams1117?.aliasNames?.includes('AMS1117-3.3'));
  assert.ok(lm7805?.aliasNames?.includes('7805'));
});

test('starter catalog includes reset supervisor parts for POR-aware validation', () => {
  const tps3839 = STARTER_PART_MASTER_BY_MPN.get('TPS3839K33DBZR');
  const mcp100 = STARTER_PART_MASTER_BY_MPN.get('MCP100-315DI/TO');
  const supervisorCount = STARTER_PART_MASTER_RECORDS.filter(
    record => record.specsJson.tags?.includes('reset-supervisor')
  ).length;

  assert.ok(tps3839);
  assert.ok(mcp100);
  assert.ok(supervisorCount >= 10);
  assert.ok(tps3839?.specsJson.tags?.includes('reset-supervisor'));
  assert.ok(mcp100?.specsJson.tags?.includes('reset-supervisor'));
});
