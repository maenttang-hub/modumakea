import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  extractKiCadSymbols,
  kicadSymbolToCustomComponentPackage,
  renderCustomComponentPackagesModule,
} from '../src/lib/kicad-sym-parser.ts';

function parseArgs(argv) {
  const args = {
    input: '',
    out: '',
    prefix: 'kicad',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!args.input && !token.startsWith('--')) {
      args.input = token;
      continue;
    }
    if (token === '--out') {
      args.out = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (token === '--prefix') {
      args.prefix = argv[index + 1] ?? args.prefix;
      index += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/kicad-sym-parser.mjs <input.kicad_sym> [--out output.ts] [--prefix kicad]');
    process.exitCode = 1;
    return;
  }

  const inputPath = resolve(process.cwd(), args.input);
  const raw = await readFile(inputPath, 'utf8');
  const symbols = extractKiCadSymbols(raw);
  const packages = symbols.map(symbol =>
    kicadSymbolToCustomComponentPackage(symbol, { templateIdPrefix: args.prefix })
  );

  if (!args.out) {
    process.stdout.write(`${JSON.stringify(packages, null, 2)}\n`);
    return;
  }

  const outputPath = resolve(process.cwd(), args.out);
  await writeFile(outputPath, renderCustomComponentPackagesModule(packages), 'utf8');
  process.stdout.write(`Generated ${packages.length} package(s) -> ${outputPath}\n`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
