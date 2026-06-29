import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSupabaseToArduinoLibrary, mapSupabaseToTemplate } from '@/lib/supabase-mapper';

test('mapSupabaseToTemplate maps the new components table shape into a ComponentTemplate', () => {
  const mapped = mapSupabaseToTemplate({
    id: 'tpl_dht11',
    name: '온습도 센서',
    name_key: 'component.tpl_dht11.name',
    category: 'SENSOR',
    description: 'DHT11 sensor',
    description_key: 'component.tpl_dht11.description',
    icon: 'Thermometer',
    compatible_voltage: 'BOTH',
    required_pins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'Data', allowedTypes: ['DIGITAL'] },
    ],
    library_includes: ['DHT.h'],
    simulation_model: { type: 'digital_input', controllable: true },
    schematic_model: { symbol: 'dht11', referencePrefix: 'U' },
    pcb_model: { footprint: 'Sensor:DHT11', packageType: 'THT', manufacturable: true },
    library_source: 'core',
    default_value: 'DHT11',
  });

  assert.ok(mapped);
  assert.equal(mapped?.id, 'tpl_dht11');
  assert.equal(mapped?.compatibleVoltage, 'BOTH');
  assert.deepEqual(mapped?.libraryIncludes, ['DHT.h']);
  assert.equal(mapped?.nameKey, 'component.tpl_dht11.name');
  assert.equal(mapped?.descriptionKey, 'component.tpl_dht11.description');
  assert.equal(mapped?.simulation?.type, 'digital_input');
  assert.equal(mapped?.schematic?.symbol, 'dht11');
  assert.equal(mapped?.pcb?.footprint, 'Sensor:DHT11');
});

test('mapSupabaseToTemplate still accepts legacy components_master-style rows', () => {
  const mapped = mapSupabaseToTemplate({
    id: 'tpl_led',
    name: 'LED',
    category: 'ACTUATOR',
    required_pins: [
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL', 'PWM'] },
    ],
    schematic: { symbol: 'led', referencePrefix: 'D' },
    pcb: { footprint: 'Device:LED', packageType: 'THT', manufacturable: true },
    library_source: 'community',
  });

  assert.ok(mapped);
  assert.equal(mapped?.librarySource, 'custom');
  assert.equal(mapped?.schematic?.symbol, 'led');
  assert.equal(mapped?.pcb?.footprint, 'Device:LED');
});

test('mapSupabaseToArduinoLibrary accepts latest_version from the new schema', () => {
  const mapped = mapSupabaseToArduinoLibrary({
    name: 'DHT sensor library',
    author: 'Adafruit',
    sentence: 'DHT sensor support',
    includes: ['DHT.h'],
    category: 'Sensors',
    latest_version: '1.4.6',
    repository_url: 'https://github.com/adafruit/DHT-sensor-library',
  });

  assert.ok(mapped);
  assert.equal(mapped?.name, 'DHT sensor library');
  assert.equal(mapped?.version, '1.4.6');
  assert.deepEqual(mapped?.includes, ['DHT.h']);
});
