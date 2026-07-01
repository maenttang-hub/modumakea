import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const MANIFEST_PATH = '/Users/gimdong-il/Desktop/프로그램/modumake/tests/fixtures/kicad-beta-sample-set.json';

type BetaSample = {
  id: string;
  type: 'schematic' | 'pcb';
  path: string;
  category?: string;
};

type BetaSampleManifest = {
  sampleSetId: string;
  samples: BetaSample[];
};

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as BetaSampleManifest;
}

test('beta KiCad sample set keeps the fixed 50-file import/render baseline', () => {
  const manifest = readManifest();
  const ids = new Set<string>();
  const schematics = manifest.samples.filter(sample => sample.type === 'schematic');
  const pcbs = manifest.samples.filter(sample => sample.type === 'pcb');

  assert.equal(manifest.sampleSetId, 'beta-kicad-import-render-50');
  assert.equal(manifest.samples.length, 50);
  assert.equal(schematics.length, 25);
  assert.equal(pcbs.length, 25);

  for (const sample of manifest.samples) {
    assert.equal(ids.has(sample.id), false, `duplicate sample id: ${sample.id}`);
    ids.add(sample.id);
    assert.match(sample.id, /^(sch|pcb)-[a-z0-9-]+$/);
    assert.ok(sample.category, `${sample.id} should document a category`);
    assert.ok(existsSync(path.resolve('/Users/gimdong-il/Desktop/프로그램/modumake', sample.path)), `${sample.id} fixture is missing`);
  }
});
