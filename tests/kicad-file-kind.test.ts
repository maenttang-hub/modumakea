import assert from 'node:assert/strict';
import test from 'node:test';
import { detectKiCadFileKind } from '@/lib/kicad-file-kind';

test('detectKiCadFileKind accepts KiCad PCB filenames and text content', () => {
  assert.equal(detectKiCadFileKind('board.kicad_pcb'), 'pcb');
  assert.equal(detectKiCadFileKind('board.pcb'), 'pcb');
  assert.equal(detectKiCadFileKind('download.txt', '  (kicad_pcb (version 20240101))'), 'pcb');
});

test('detectKiCadFileKind keeps schematic detection separate from PCB detection', () => {
  assert.equal(detectKiCadFileKind('main.kicad_sch'), 'schematic');
  assert.equal(detectKiCadFileKind('download.txt', '\n(kicad_sch (version 20240101))'), 'schematic');
  assert.equal(detectKiCadFileKind('notes.txt', 'plain text'), null);
});
