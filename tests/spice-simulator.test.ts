import test from 'node:test';
import assert from 'node:assert/strict';

import { runSpice } from '@/lib/spice-simulator';

test('spice simulator fallback solves a simple divider netlist', async () => {
  const result = await runSpice(`
* Divider
V1 N_VCC 0 DC 5
R1 N_VCC N_MID 1k
R2 N_MID 0 1k
.op
.end
  `);

  assert.equal(result.backend, 'fallback-solver');
  assert.equal(result.analysis, 'op');
  assert.equal(result.fidelity, 'solver-grade');
  assert.equal(result.model, 'linear-dc-with-pwl-preview');
  assert.ok(Math.abs((result.nodeVoltages.N_MID ?? 0) - 2.5) < 0.01);
});

test('spice simulator fallback returns preview traces for transient analysis', async () => {
  const result = await runSpice(`
* RC preview
V1 N_VCC 0 DC 3.3
R1 N_VCC N_OUT 1k
C1 N_OUT 0 10u
.tran 0.1 1
.end
  `, {
    analysis: 'tran',
    start: 0,
    stop: 1,
    pointCount: 5,
  });

  assert.equal(result.analysis, 'tran');
  assert.equal(result.fidelity, 'preview-grade');
  assert.equal(result.model, 'transient-companion-preview');
  const outTrace = result.traces.find(trace => trace.label === 'N_OUT');
  assert.equal(outTrace?.points.length, 5);
  assert.ok((outTrace?.points[0]?.y ?? 0) <= 0.001, 'expected capacitor to start near 0V');
  assert.ok((outTrace?.points.at(-1)?.y ?? 0) > 3, 'expected capacitor charge trace to approach source voltage');
  assert.ok(
    result.warnings.some(warning => warning.includes('piecewise-linear companion model')),
    'expected companion-model warning for transient traces'
  );
});
