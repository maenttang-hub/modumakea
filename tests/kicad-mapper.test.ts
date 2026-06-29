import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_REGISTRY } from '@/constants/boards';
import { getComponentTemplates } from '@/constants/component-templates';

const mapper = JSON.parse(
  readFileSync(join(process.cwd(), 'src/constants/kicad-mapper.json'), 'utf8')
) as {
  boards: Record<string, { kicadLibrary: string; kicadSymbol: string; pinMap: Record<string, string> }>;
  templates: Record<string, { kicadLibrary: string; kicadSymbol: string; pinMap: Record<string, string> }>;
};

const EXPECTED_TEMPLATE_IDS = [
  'tpl_ultrasonic',
  'tpl_pir',
  'tpl_dht11',
  'tpl_dht22',
  'tpl_photoresistor',
  'tpl_soil_moisture',
  'tpl_gas_mq2',
  'tpl_sound',
  'tpl_ir_receiver',
  'tpl_button',
  'tpl_led',
  'tpl_rgb_led',
  'tpl_servo',
  'tpl_dc_motor',
  'tpl_buzzer',
  'tpl_relay',
  'tpl_oled',
  'tpl_lcd1602',
  'tpl_7segment',
  'tpl_bluetooth_hc05',
  'tpl_rfid_rc522',
  'tpl_resistor',
  'tpl_capacitor',
  'tpl_inductor',
  'tpl_diode',
  'tpl_transistor_npn',
  'tpl_level_shifter',
  'tpl_driver_ic',
  'tpl_adc_module',
  'tpl_op_amp_buffer',
  'tpl_external_power',
];

test('kicad mapper covers every shipped board and all 31 core component templates', () => {
  assert.deepEqual(Object.keys(mapper.boards).sort(), [
    'esp32',
    'nano',
    'rpi4',
    'rpi_pico',
    'stm32_bluepill',
    'uno',
  ]);

  const mappedTemplateIds = Object.keys(mapper.templates).sort();
  assert.equal(mappedTemplateIds.length, EXPECTED_TEMPLATE_IDS.length);
  assert.deepEqual(mappedTemplateIds, [...EXPECTED_TEMPLATE_IDS].sort());
});

test('kicad mapper keeps critical board and sensor pin translations stable', () => {
  assert.equal(mapper.boards.uno.pinMap['5V'], '5');
  assert.equal(mapper.boards.uno.pinMap['A0'], '19');
  assert.equal(mapper.boards.rpi4.pinMap['GPIO14'], '8');
  assert.equal(mapper.boards.esp32.pinMap['G27'], '15');

  assert.equal(mapper.templates.tpl_dht11.kicadSymbol, 'DHT11');
  assert.equal(mapper.templates.tpl_dht11.pinMap['Data'], '2');
  assert.equal(mapper.templates.tpl_ultrasonic.pinMap['Echo'], '3');
  assert.equal(mapper.templates.tpl_led.pinMap['Signal'], '2');
  assert.equal(mapper.templates.tpl_diode.pinMap['K'], '1');
  assert.equal(mapper.templates.tpl_external_power.pinMap['V+'], '1');
});

test('kicad mapper covers every visible board pin used by the schematic canvas', () => {
  for (const [boardId, board] of Object.entries(BOARD_REGISTRY)) {
    const mappedPins = mapper.boards[boardId]?.pinMap ?? {};
    const expectedPins = [...new Set([...board.leftPins, ...board.digitalPins])];

    for (const pinId of expectedPins) {
      assert.ok(
        mappedPins[pinId],
        `board ${boardId} is missing KiCad pin mapping for visible pin ${pinId}`
      );
    }
  }
});

test('kicad mapper covers every shipped component pin required for export', () => {
  const templates = getComponentTemplates().filter(template =>
    EXPECTED_TEMPLATE_IDS.includes(template.id)
  );

  for (const template of templates) {
    const mappedPins = mapper.templates[template.id]?.pinMap ?? {};
    for (const requiredPin of template.requiredPins) {
      assert.ok(
        mappedPins[requiredPin.name],
        `template ${template.id} is missing KiCad pin mapping for ${requiredPin.name}`
      );
    }
  }
});

test('kicad mapper does not reuse board pin numbers inside the same board symbol', () => {
  for (const [boardId, boardMapping] of Object.entries(mapper.boards)) {
    const values = Object.values(boardMapping.pinMap);
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    assert.deepEqual(
      [...new Set(duplicates)],
      [],
      `board ${boardId} should not reuse KiCad physical pin numbers`
    );
  }
});
