import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCT_SURFACE,
  SURFACE_FLAGS,
  getAllowedWorkspaceModes,
  getDefaultWorkspaceMode,
  getProductSurface,
  getSurfaceFlags,
  isAdvancedWorkspaceMode,
} from '@/constants/product-surface';

test('review-mvp is the default product surface with advanced UI hidden', () => {
  assert.equal(PRODUCT_SURFACE, 'review-mvp');
  assert.equal(SURFACE_FLAGS.showPartsLibrary, false);
  assert.equal(SURFACE_FLAGS.showPcbWorkspace, false);
  assert.equal(SURFACE_FLAGS.showManufacturingGate, false);
  assert.equal(SURFACE_FLAGS.showCompileActions, false);
  assert.equal(SURFACE_FLAGS.showKiCadExport, false);
  assert.equal(SURFACE_FLAGS.showTerminalPanel, true);
  assert.equal(SURFACE_FLAGS.showSimulationPanel, true);
});

test('review-mvp surface keeps only schematic and simulation workspaces with schematic as default', () => {
  assert.deepEqual(getAllowedWorkspaceModes('review-mvp'), ['schematic', 'simulation']);
  assert.equal(getDefaultWorkspaceMode('review-mvp'), 'schematic');
});

test('surface query override can unlock the full surface for local verification', () => {
  assert.equal(getProductSurface('?surface=full'), 'full');
  assert.equal(getSurfaceFlags('full').showPartsLibrary, true);
  assert.equal(getSurfaceFlags('full').showKiCadExport, true);
  assert.equal(getSurfaceFlags('full').showCompileActions, true);
  assert.deepEqual(getAllowedWorkspaceModes('full'), ['simulation', 'schematic', 'pcb', 'manufacturing']);
});

test('advanced workspace detection only matches pcb and manufacturing', () => {
  assert.equal(isAdvancedWorkspaceMode('pcb'), true);
  assert.equal(isAdvancedWorkspaceMode('manufacturing'), true);
  assert.equal(isAdvancedWorkspaceMode('simulation'), false);
  assert.equal(isAdvancedWorkspaceMode('schematic'), false);
  assert.equal(isAdvancedWorkspaceMode('mystery'), false);
});
