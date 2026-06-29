import path from 'node:path';

import { scanKiCadRegression } from '@/lib/kicad-regression-scan';

const DEFAULT_ROOTS = ['tests/kicad_samples/100_samples'];

function formatRelative(filePath: string) {
  return path.relative(process.cwd(), filePath) || filePath;
}

function printUsage() {
  console.log('Usage: npm run kicad:scan:regression -- [dir ...] [--json] [--limit N] [--strict]');
}

async function main() {
  const args = process.argv.slice(2);
  const roots: string[] = [];
  let json = false;
  let strict = false;
  let maxSuspicious = 50;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--strict') {
      strict = true;
      continue;
    }
    if (token === '--limit') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('Missing value for --limit');
      }
      maxSuspicious = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printUsage();
      return;
    }
    roots.push(token);
  }

  const summary = await scanKiCadRegression({
    roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
    allowFragmentInput: true,
    maxSuspicious,
  });

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('KiCad regression scan');
    console.log(`- Roots: ${summary.roots.map(formatRelative).join(', ')}`);
    console.log(`- Total files: ${summary.totalFiles}`);
    console.log(`- Parsed files: ${summary.parsedFiles}`);
    console.log(`- Failed files: ${summary.failedFiles}`);
    console.log(`- Zero-net fragments: ${summary.stats.zeroNetFragments}`);
    console.log(`- Files with unresolved symbols: ${summary.stats.unresolvedFiles}`);
    console.log(`- Files with ignored non-electrical symbols: ${summary.stats.ignoredNonElectricalFiles}`);
    console.log(`- Files with non-component markers: ${summary.stats.nonComponentMarkerFiles}`);
    console.log(`- Files with unnamed power nets: ${summary.stats.unnamedPowerFiles}`);
    console.log(`- Files with flipped rail kinds: ${summary.stats.flippedRailFiles}`);

    if (summary.failures.length > 0) {
      console.log('\nFailures');
      for (const failure of summary.failures) {
        console.log(`- ${formatRelative(failure.file)}`);
        console.log(`  ${failure.message}`);
      }
    }

    if (summary.suspicious.length > 0) {
      console.log(`\nSuspicious files (${summary.suspicious.length})`);
      for (const entry of summary.suspicious) {
        console.log(`- ${formatRelative(entry.file)}`);
        console.log(
          `  components=${entry.components}, nets=${entry.nets}, unresolved=${entry.unresolvedSymbols}, ignored=${entry.ignoredNonElectricalSymbols}, markers=${entry.nonComponentMarkers}, wires=${entry.wires}, labels=${entry.labels}, unnamedPower=${entry.unnamedPower}, zeroNetFragment=${entry.zeroNetFragment}`
        );
        if (entry.flipped.length > 0) {
          console.log(`  flipped=${entry.flipped.map(item => `${item.label}:${item.kind}->${item.expected}`).join(', ')}`);
        }
      }
    }
  }

  if (summary.failedFiles > 0 || (strict && summary.suspicious.length > 0)) {
    process.exitCode = 1;
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
