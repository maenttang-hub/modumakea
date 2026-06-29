import test from 'node:test';
import assert from 'node:assert/strict';

import { solveDcNetwork, solveLinearSystem } from '@/lib/engine-kernel';
import {
  clearModuMakeWasmKernelBindings,
  registerModuMakeWasmKernelBindings,
} from '@/lib/modumake-wasm-kernel';

test.afterEach(() => {
  clearModuMakeWasmKernelBindings();
});

test('engine kernel solves a simple linear divider', () => {
  const result = solveDcNetwork({
    nets: [
      { id: 'VCC', knownVoltage: 5 },
      { id: 'MID', knownVoltage: null },
      { id: 'GND', knownVoltage: 0 },
    ],
    resistors: [
      { netA: 'VCC', netB: 'MID', resistanceOhms: 1000 },
      { netA: 'MID', netB: 'GND', resistanceOhms: 1000 },
    ],
  });

  assert.ok(result);
  assert.equal(result?.converged, true);
  assert.equal(result?.mode, 'linear');
  assert.ok(Math.abs((result?.voltages.get('MID') ?? 0) - 2.5) < 0.01);
});

test('engine kernel converges a diode clamp with Newton-Raphson', () => {
  const result = solveDcNetwork({
    nets: [
      { id: 'VCC', knownVoltage: 5 },
      { id: 'MID', knownVoltage: null },
      { id: 'GND', knownVoltage: 0 },
    ],
    resistors: [
      { netA: 'VCC', netB: 'MID', resistanceOhms: 1000 },
    ],
    diodes: [
      { netA: 'MID', netK: 'GND' },
    ],
  });

  assert.ok(result);
  assert.equal(result?.converged, true);
  assert.equal(result?.mode, 'nonlinear');
  const midVoltage = result?.voltages.get('MID') ?? 0;
  assert.ok(midVoltage > 0.45 && midVoltage < 0.95, `expected diode clamp voltage, got ${midVoltage}`);
});

test('engine kernel Gaussian elimination handles a regular 2x2 system', () => {
  const solution = solveLinearSystem(
    [
      [3, 1],
      [1, 2],
    ],
    [9, 8]
  );

  assert.ok(solution);
  assert.ok(Math.abs((solution?.[0] ?? 0) - 2) < 1e-9);
  assert.ok(Math.abs((solution?.[1] ?? 0) - 3) < 1e-9);
});

test('engine kernel prefers registered wasm bindings when available', () => {
  registerModuMakeWasmKernelBindings({
    solveDcNetworkJson: () =>
      JSON.stringify({
        voltages: [['MID', 3.3]],
        converged: true,
        iterations: 2,
        mode: 'linear',
      }),
  });

  const result = solveDcNetwork({
    nets: [
      { id: 'VCC', knownVoltage: 5 },
      { id: 'MID', knownVoltage: null },
      { id: 'GND', knownVoltage: 0 },
    ],
    resistors: [
      { netA: 'VCC', netB: 'MID', resistanceOhms: 1000 },
      { netA: 'MID', netB: 'GND', resistanceOhms: 1000 },
    ],
  });

  assert.ok(result);
  assert.equal(result?.voltages.get('MID'), 3.3);
  assert.equal(result?.iterations, 2);
});
