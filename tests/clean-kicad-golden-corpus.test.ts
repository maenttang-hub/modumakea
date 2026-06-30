import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const manifestPath = new URL('../config/golden-corpus/clean-kicad-golden-corpus-v1.json', import.meta.url);
const agentReviewPath = new URL(
  '../config/golden-corpus/clean-kicad-golden-corpus-v1-agent-review.json',
  import.meta.url
);

test('clean KiCad golden corpus keeps the review baseline shape stable', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    entries: Array<{
      id: string;
      bucket: string;
      file: string;
      autoProposedLabel: string;
      humanLabel: string | null;
      reviewStatus: string;
      sampleAnomalies: unknown[];
    }>;
  };

  assert.equal(manifest.entries.length, 50);
  assert.deepEqual(
    manifest.entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.bucket] = (acc[entry.bucket] ?? 0) + 1;
      return acc;
    }, {}),
    {
      'text-placement': 15,
      'power-label-anchor': 10,
      'passive-value': 10,
      'low-confidence-mapping': 10,
      'report-count-divergence': 5,
    }
  );

  const labels = new Set(['true-bug', 'source-as-authored', 'conservative-warning', 'mapping-improvement']);
  const ids = new Set<string>();
  for (const entry of manifest.entries) {
    assert.equal(ids.has(entry.id), false, `duplicate golden corpus id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.file.endsWith('.kicad_sch'), `entry file should point to a KiCad schematic: ${entry.file}`);
    assert.ok(labels.has(entry.autoProposedLabel), `unexpected auto label: ${entry.autoProposedLabel}`);
    assert.equal(entry.humanLabel, null, 'human labels must stay explicit instead of pretending review happened');
    assert.equal(entry.reviewStatus, 'pending-human-review');
    assert.ok(entry.sampleAnomalies.length > 0, `entry should preserve sample anomalies: ${entry.id}`);
  }
});

test('clean KiCad golden corpus keeps agent review separate from human labels', () => {
  const agentReview = JSON.parse(readFileSync(agentReviewPath, 'utf8')) as {
    scope: string;
    humanLabelsModified: boolean;
    summary: {
      entries: number;
      svgExport: { ok: number; failed: number };
      safeToFixImmediately: string[];
      fixedCodeBuckets?: string[];
      requiresHumanVisualReview: string[];
      notParserBugsFromAutomaticReview: string[];
    };
    bucketReviews: Array<{
      bucket: string;
      agentConclusion: string;
      confidence: string;
    }>;
    nextFixBacklog: Array<{ bucket: string; priority: string }>;
  };

  assert.equal(agentReview.scope, 'agent-review-only');
  assert.equal(agentReview.humanLabelsModified, false);
  assert.equal(agentReview.summary.entries, 50);
  assert.equal(agentReview.summary.svgExport.ok, 49);
  assert.equal(agentReview.summary.svgExport.failed, 1);
  assert.deepEqual(agentReview.summary.safeToFixImmediately, []);
  assert.ok(agentReview.summary.fixedCodeBuckets?.includes('report-count-divergence'));
  assert.ok(agentReview.summary.requiresHumanVisualReview.includes('text-placement'));
  assert.ok(agentReview.summary.requiresHumanVisualReview.includes('power-label-anchor'));
  assert.ok(agentReview.summary.notParserBugsFromAutomaticReview.includes('passive-value'));
  assert.ok(agentReview.summary.notParserBugsFromAutomaticReview.includes('low-confidence-mapping'));

  const bucketConclusions = Object.fromEntries(
    agentReview.bucketReviews.map(review => [review.bucket, review.agentConclusion])
  );
  assert.equal(bucketConclusions['passive-value'], 'source-data-missing');
  assert.equal(bucketConclusions['low-confidence-mapping'], 'mapping-backlog');
  assert.equal(bucketConclusions['report-count-divergence'], 'fixed-regression-coverage');
  assert.equal(agentReview.nextFixBacklog.every(item => item.bucket !== 'report-count-divergence'), true);
});
