import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';

type ParseStatus = 'parsed' | 'skipped-legacy' | 'skipped-subsheet' | 'failed';

type ParseResult = {
  file: string;
  status: ParseStatus;
  detail?: string;
  components?: number;
  connections?: number;
};

const DEFAULT_SAMPLE_DIR = path.resolve(process.cwd(), 'tests/kicad_samples/100_samples');
const SUPPORTED_EXTENSIONS = new Set(['.kicad_sch', '.sch']);

async function collectFiles(rootDir: string) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function classifyError(filePath: string, error: unknown): ParseResult {
  const detail = error instanceof Error ? error.message : String(error);

  if (detail.includes('구버전 KiCad 파일이거나 지원되지 않는 포맷')) {
    return {
      file: filePath,
      status: 'skipped-legacy',
      detail,
    };
  }

  if (detail.includes('메인 .kicad_sch 파일을 업로드해 주세요')) {
    return {
      file: filePath,
      status: 'skipped-subsheet',
      detail,
    };
  }

  return {
    file: filePath,
    status: 'failed',
    detail,
  };
}

function formatRelative(filePath: string) {
  return path.relative(process.cwd(), filePath) || filePath;
}

async function parseFile(filePath: string): Promise<ParseResult> {
  const source = await readFile(filePath, 'utf8');

  try {
    const imported = importKiCadSchematic(source, {
      projectName: path.basename(filePath, path.extname(filePath)),
    });
    return {
      file: filePath,
      status: 'parsed',
      components: imported.summary.importedComponentCount,
      connections: imported.summary.importedConnectionCount,
    };
  } catch (error) {
    return classifyError(filePath, error);
  }
}

function printSection(title: string, results: ParseResult[]) {
  if (results.length === 0) {
    return;
  }

  console.log(`\n${title} (${results.length})`);
  for (const result of results) {
    const prefix = `- ${formatRelative(result.file)}`;
    if (result.status === 'parsed') {
      console.log(`${prefix} -> components=${result.components ?? 0}, connections=${result.connections ?? 0}`);
      continue;
    }
    console.log(`${prefix}`);
    if (result.detail) {
      console.log(`  ${result.detail}`);
    }
  }
}

async function main() {
  const targetDir = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_SAMPLE_DIR);
  const dirStat = await stat(targetDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(`KiCad sample directory not found: ${targetDir}`);
  }

  const files = await collectFiles(targetDir);
  if (files.length === 0) {
    throw new Error(`No .kicad_sch or .sch files found under ${targetDir}`);
  }

  console.log(`KiCad parser stress test`);
  console.log(`Target directory: ${formatRelative(targetDir)}`);
  console.log(`Discovered files: ${files.length}`);

  const results: ParseResult[] = [];
  for (const file of files) {
    console.log(`Parsing: ${formatRelative(file)}...`);
    results.push(await parseFile(file));
  }

  const parsed = results.filter(result => result.status === 'parsed');
  const skippedLegacy = results.filter(result => result.status === 'skipped-legacy');
  const skippedSubsheet = results.filter(result => result.status === 'skipped-subsheet');
  const failed = results.filter(result => result.status === 'failed');

  console.log(`\nSummary`);
  console.log(`- Parsed: ${parsed.length}`);
  console.log(`- Skipped legacy/unsupported: ${skippedLegacy.length}`);
  console.log(`- Skipped partial sub-sheet: ${skippedSubsheet.length}`);
  console.log(`- Failed unexpectedly: ${failed.length}`);

  printSection('Unexpected failures', failed);
  printSection('Skipped partial sub-sheets', skippedSubsheet);
  printSection('Skipped legacy/unsupported files', skippedLegacy);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch(error => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`KiCad parser stress test failed to run: ${detail}`);
  process.exitCode = 1;
});
