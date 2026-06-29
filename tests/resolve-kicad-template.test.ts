import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveKiCadTemplate } from '@/lib/resolve-kicad-template';

test('resolveKiCadTemplate prefers RefDes rules for passive parts', () => {
  const result = resolveKiCadTemplate({
    reference: 'R14',
    value: '10k',
    footprint: 'Resistor_THT:R_Axial',
    libraryId: 'Device:R',
  });

  assert.ok(result);
  assert.equal(result?.templateId, 'tpl_resistor');
  assert.equal(result?.source, 'refdes');
  assert.equal(result?.confidence, 'high');
});

test('resolveKiCadTemplate falls through to value regex for unmapped ICs', () => {
  const result = resolveKiCadTemplate({
    reference: 'U2',
    value: 'MFRC522',
    footprint: 'Module:MFRC522',
    libraryId: 'Vendor:UnknownReader',
  });

  assert.ok(result);
  assert.equal(result?.templateId, 'tpl_rfid_rc522');
  assert.equal(result?.source, 'value-regex');
  assert.equal(result?.confidence, 'high');
});

test('resolveKiCadTemplate can still infer LEDs from diode-style references', () => {
  const result = resolveKiCadTemplate({
    reference: 'D3',
    value: 'LED',
    libraryId: 'Device:LED',
  });

  assert.ok(result);
  assert.equal(result?.templateId, 'tpl_led');
  assert.equal(result?.source, 'kicad-library');
});

test('resolveKiCadTemplate prefers exact KiCad library families for LEDs and diodes', () => {
  const ledResult = resolveKiCadTemplate({
    reference: 'D1',
    value: 'Green',
    libraryId: 'Device:LED',
  });
  const diodeResult = resolveKiCadTemplate({
    reference: 'D3',
    value: '1N5819WS',
    libraryId: 'Diode:1N5819WS',
  });

  assert.equal(ledResult?.templateId, 'tpl_led');
  assert.equal(ledResult?.source, 'kicad-library');
  assert.equal(ledResult?.confidence, 'high');
  assert.equal(diodeResult?.templateId, 'tpl_diode');
  assert.equal(diodeResult?.source, 'kicad-library');
  assert.equal(diodeResult?.confidence, 'high');
});

test('resolveKiCadTemplate upgrades KiCad MOSFET families out of refdes-only matching', () => {
  const result = resolveKiCadTemplate({
    reference: 'Q2',
    value: 'IRFR7440',
    footprint: 'Package_TO_SOT_SMD:TO-252-2',
    libraryId: 'Transistor_FET:QM6006D',
  });

  assert.ok(result);
  assert.equal(result?.templateId, 'tpl_transistor_npn');
  assert.equal(result?.source, 'kicad-library');
  assert.equal(result?.confidence, 'high');
});
