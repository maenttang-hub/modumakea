import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const manifestPath =
  process.env.KICAD_GOLDEN_CORPUS_JSON ?? './config/golden-corpus/clean-kicad-golden-corpus-v1.json';
const outputDir =
  process.env.KICAD_GOLDEN_CORPUS_SVG_DIR ?? './tmp/clean-kicad-golden-corpus-v1-svg';
const kicadCli =
  process.env.KICAD_CLI_PATH ?? '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli';
const reset = process.env.KICAD_GOLDEN_CORPUS_SVG_RESET === '1';

interface GoldenCorpusEntry {
  id: string;
  bucket: string;
  file: string;
  sourceReason: string;
  sourceCount: number;
  autoProposedLabel: string;
  humanLabel: string | null;
  reviewQuestion: string;
}

interface GoldenCorpusManifest {
  entries: GoldenCorpusEntry[];
}

function run(command: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function markdownEscape(value: string) {
  return value.replace(/\|/g, '/');
}

async function exportEntry(entry: GoldenCorpusEntry) {
  const entryDir = path.join(outputDir, entry.id);
  await mkdir(entryDir, { recursive: true });

  const result = await run(kicadCli, [
    'sch',
    'export',
    'svg',
    '--output',
    entryDir,
    '--no-background-color',
    entry.file,
  ]);

  return {
    ...entry,
    outputDir: entryDir,
    ok: result.code === 0,
    stderr: result.stderr.trim(),
  };
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as GoldenCorpusManifest;

if (reset) {
  await rm(outputDir, { recursive: true, force: true });
}
await mkdir(outputDir, { recursive: true });

const results = [];
for (const entry of manifest.entries) {
  results.push(await exportEntry(entry));
}

const indexLines = [
  '# Clean KiCad Golden Corpus SVG Index',
  '',
  `Manifest: \`${manifestPath}\``,
  `Output directory: \`${outputDir}\``,
  '',
  '| ID | Bucket | Export | Count | Auto Label | Review Question |',
  '| --- | --- | --- | ---: | --- | --- |',
];

for (const result of results) {
  indexLines.push(`| ${result.id} | ${result.bucket} | ${result.ok ? 'ok' : 'failed'} | ${result.sourceCount} | ${result.autoProposedLabel} | ${markdownEscape(result.reviewQuestion)} |`);
}

await writeFile(path.join(outputDir, 'index.md'), `${indexLines.join('\n')}\n`, 'utf8');
await writeFile(path.join(outputDir, 'export-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  entries: results.length,
  ok: results.filter(result => result.ok).length,
  failed: results.filter(result => !result.ok).length,
  outputDir,
}, null, 2));
