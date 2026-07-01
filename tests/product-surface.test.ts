import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_PRODUCT_SURFACE_ENABLED,
  FULL_SURFACE_QUERY_OVERRIDE_ALLOWED,
  PRODUCT_SURFACE,
  SURFACE_FLAGS,
  getAllowedWorkspaceModes,
  getDefaultWorkspaceMode,
  getProductSurface,
  getSurfaceFlags,
  isAdvancedWorkspaceMode,
} from '@/constants/product-surface';

test('review-mvp is the default product surface with advanced UI hidden', () => {
  assert.equal(FULL_PRODUCT_SURFACE_ENABLED, false);
  assert.equal(FULL_SURFACE_QUERY_OVERRIDE_ALLOWED, false);
  assert.equal(PRODUCT_SURFACE, 'review-mvp');
  assert.equal(SURFACE_FLAGS.showPartsLibrary, false);
  assert.equal(SURFACE_FLAGS.showPcbWorkspace, false);
  assert.equal(SURFACE_FLAGS.showManufacturingGate, false);
  assert.equal(SURFACE_FLAGS.showCompileActions, false);
  assert.equal(SURFACE_FLAGS.showKiCadExport, false);
  assert.equal(SURFACE_FLAGS.showSerialActions, false);
  assert.equal(SURFACE_FLAGS.showTerminalPanel, true);
  assert.equal(SURFACE_FLAGS.showSimulationPanel, true);
});

test('review-mvp surface keeps only schematic and simulation workspaces with schematic as default', () => {
  assert.deepEqual(getAllowedWorkspaceModes('review-mvp'), ['schematic', 'simulation']);
  assert.equal(getDefaultWorkspaceMode('review-mvp'), 'schematic');
});

test('surface query override is locked by default for beta safety', () => {
  assert.equal(getProductSurface('?surface=full'), 'review-mvp');
});

test('full surface flags remain available only for explicit internal callers', () => {
  assert.equal(getSurfaceFlags('full').showPartsLibrary, true);
  assert.equal(getSurfaceFlags('full').showKiCadExport, true);
  assert.equal(getSurfaceFlags('full').showCompileActions, true);
  assert.equal(getSurfaceFlags('full').showSerialActions, false);
  assert.deepEqual(getAllowedWorkspaceModes('full'), ['simulation', 'schematic', 'pcb', 'manufacturing']);
});

test('advanced workspace detection only matches pcb and manufacturing', () => {
  assert.equal(isAdvancedWorkspaceMode('pcb'), true);
  assert.equal(isAdvancedWorkspaceMode('manufacturing'), true);
  assert.equal(isAdvancedWorkspaceMode('simulation'), false);
  assert.equal(isAdvancedWorkspaceMode('schematic'), false);
  assert.equal(isAdvancedWorkspaceMode('mystery'), false);
});
