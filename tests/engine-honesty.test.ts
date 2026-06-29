import test from 'node:test';
import assert from 'node:assert/strict';

import { describeReviewEngineMeta, describeSimulationEngine } from '@/lib/engine-honesty';

test('engine honesty describes structured review parsers without overselling them as formal proof', () => {
  const summary = describeReviewEngineMeta({
    language: 'python',
    parserBackend: 'generated',
    parserTier: 'structured-review',
  }, 'ko');

  assert.match(summary.title, /Python/);
  assert.match(summary.body, /완전한 형식 증명 단계는 아닙니다/);
});

test('engine honesty marks transient simulation as preview-grade output', () => {
  const summary = describeSimulationEngine({
    backend: 'fallback-solver',
    analysis: 'tran',
    nodeVoltages: { N_OUT: 3.3 },
    traces: [],
    warnings: [],
    fidelity: 'preview-grade',
    model: 'transient-companion-preview',
  }, 'ko');

  assert.match(summary.title, /파형 미리보기 경로/);
  assert.match(summary.body, /preview-grade/);
});
