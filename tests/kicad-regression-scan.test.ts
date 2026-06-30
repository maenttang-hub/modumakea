import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { scanKiCadRegression } from '@/lib/kicad-regression-scan';

test('kicad regression scan summarizes fragments, ignored symbols, and hard failures', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'modumake-kicad-regression-'));

  try {
    await mkdir(path.join(tempDir, 'samples'));

    const routedSchematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "Mechanical:MountingHole"
      (property "Reference" "H" (id 0) (at 0 0 0))
      (property "Value" "MountingHole" (id 1) (at 0 -2.54 0))
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "10k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Mechanical:MountingHole")
    (at 40 20 0)
    (uuid "mh-1")
    (property "Reference" "H1" (id 0) (at 40 18 0))
    (property "Value" "MountingHole" (id 1) (at 40 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (global_label "12V" (shape input) (at 0 20 0))
  (sheet_instances (path "/" (page "1")))
)`;

    const fragmentSchematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (wire (pts (xy 0 10) (xy 20 10)))
  (wire (pts (xy 20 10) (xy 20 30)))
  (sheet_instances (path "/" (page "2")))
)`;

    const mixedRailSchematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 10 10 0)
    (uuid "r-mixed")
    (property "Reference" "R1" (id 0) (at 10 8 0))
    (property "Value" "0R" (id 1) (at 10 12 0))
  )
  (wire (pts (xy 7.46 10) (xy 20 10)))
  (global_label "GND" (shape input) (at 7.46 10 0))
  (global_label "+12V" (shape input) (at 20 10 0))
  (sheet_instances (path "/" (page "3")))
)`;

    const invalidSchematic = `not-a-kicad-file`;

    await writeFile(path.join(tempDir, 'samples', 'ok.kicad_sch'), routedSchematic, 'utf8');
    await writeFile(path.join(tempDir, 'samples', 'fragment.kicad_sch'), fragmentSchematic, 'utf8');
    await writeFile(path.join(tempDir, 'samples', 'mixed-rail.kicad_sch'), mixedRailSchematic, 'utf8');
    await writeFile(path.join(tempDir, 'samples', 'broken.kicad_sch'), invalidSchematic, 'utf8');

    const summary = await scanKiCadRegression({
      roots: [path.join(tempDir, 'samples')],
      allowFragmentInput: true,
      maxSuspicious: 20,
    });

    assert.equal(summary.totalFiles, 4);
    assert.equal(summary.parsedFiles, 3);
    assert.equal(summary.failedFiles, 1);
    assert.equal(summary.stats.zeroNetFragments, 1);
    assert.equal(summary.stats.unresolvedFiles, 0);
    assert.equal(summary.stats.ignoredNonElectricalFiles, 1);
    assert.equal(summary.stats.unnamedPowerFiles, 0);
    assert.equal(summary.stats.flippedRailFiles, 0);
    assert.equal(summary.stats.ambiguousRailFiles, 0);
    assert.equal(summary.stats.mixedRailFiles, 1);
    assert.equal(summary.failures.length, 1);
    assert.match(summary.failures[0]?.message ?? '', /지원되지 않는 포맷|kicad/i);

    const fragmentEntry = summary.suspicious.find(entry => entry.file.endsWith('fragment.kicad_sch'));
    assert.ok(fragmentEntry);
    assert.equal(fragmentEntry?.zeroNetFragment, true);

    const ignoredEntry = summary.suspicious.find(entry => entry.file.endsWith('ok.kicad_sch'));
    assert.ok(ignoredEntry);
    assert.equal(ignoredEntry?.ignoredNonElectricalSymbols, 1);
    assert.equal(ignoredEntry?.unresolvedSymbols, 0);

    const mixedEntry = summary.suspicious.find(entry => entry.file.endsWith('mixed-rail.kicad_sch'));
    assert.ok(mixedEntry);
    assert.equal(mixedEntry?.flipped.length, 0);
    assert.equal(mixedEntry?.ambiguousRails.length, 0);
    assert.equal(mixedEntry?.mixedRails.length, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
