import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildImportedPcbReviewGroups } from '@/lib/imported-pcb-review-groups';
import {
  mapKiCadPcbDrcReport,
  validateImportedPcbDocument,
} from '@/lib/imported-pcb-validation';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import type { ImportedPcbValidationReport } from '@/types';

const execFileAsync = promisify(execFile);
const DEFAULT_SAMPLE_MANIFEST = 'tests/fixtures/kicad-beta-sample-set.json';
const DEFAULT_OUTPUT = 'tmp/kicad-drc-comparison/beta-pcb-review-report.json';
const DEFAULT_MAC_KICAD_CLI = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli';

type ManifestSample = {
  id: string;
  type: 'schematic' | 'pcb';
  path: string;
  category?: string;
};

type SampleManifest = {
  sampleSetId: string;
  samples: ManifestSample[];
};

function readArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function numberArg(name: string, fallback: number) {
  const parsed = Number(readArg(name, String(fallback)));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function topCodes(report: ImportedPcbValidationReport) {
  const counts = new Map<string, number>();
  for (const issue of report.issues) {
    counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 8);
}

function summarizeReport(report: ImportedPcbValidationReport) {
  return {
    issueCount: report.issueCount,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    topCodes: topCodes(report),
    topReviewGroups: buildImportedPcbReviewGroups(report).slice(0, 6).map(group => ({
      code: group.code,
      title: group.title,
      severity: group.severity,
      visibleIssueCount: group.visibleIssueCount,
      hiddenCandidateCount: group.hiddenCandidateCount,
      affectedFootprints: group.affectedFootprints,
      affectedNets: group.affectedNets,
      affectedLayers: group.affectedLayers,
    })),
  };
}

async function readSampleManifest(rootDir: string, manifestArg: string): Promise<SampleManifest> {
  const manifestPath = path.resolve(rootDir, manifestArg);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<SampleManifest>;
  if (!Array.isArray(raw.samples)) {
    throw new Error(`Invalid sample manifest: ${manifestPath}`);
  }

  const samples = raw.samples.map((sample, index) => {
    if (!sample || typeof sample !== 'object') {
      throw new Error(`Invalid sample at index ${index} in ${manifestPath}`);
    }
    if (sample.type !== 'schematic' && sample.type !== 'pcb') {
      throw new Error(`Invalid sample type at index ${index} in ${manifestPath}`);
    }
    if (typeof sample.id !== 'string' || typeof sample.path !== 'string') {
      throw new Error(`Invalid sample id/path at index ${index} in ${manifestPath}`);
    }

    return {
      id: sample.id,
      type: sample.type,
      path: sample.path,
      category: typeof sample.category === 'string' ? sample.category : undefined,
    };
  });

  return {
    sampleSetId: typeof raw.sampleSetId === 'string' ? raw.sampleSetId : path.basename(manifestPath),
    samples,
  };
}

async function resolveKiCadCli() {
  const candidates = [
    process.env.KICAD_CLI_PATH,
    DEFAULT_MAC_KICAD_CLI,
    'kicad-cli',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate, ['--version'], {
        timeout: 10_000,
        maxBuffer: 512_000,
      });
      return {
        command: candidate,
        version: result.stdout.trim() || result.stderr.trim() || 'unknown',
      };
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 'ENOENT') {
        return {
          command: candidate,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return null;
}

function getExecErrorText(error: unknown) {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : String(error);
  }

  const candidate = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
  return [
    typeof candidate.message === 'string' ? candidate.message : null,
    typeof candidate.stdout === 'string' ? candidate.stdout : null,
    typeof candidate.stderr === 'string' ? candidate.stderr : null,
  ].filter(Boolean).join('\n');
}

function isSchematicParityFailure(error: unknown) {
  return /schematic parity|schematic netlist|회로도 네트리스트|회로도 동일성|패리티 테스트/i.test(getExecErrorText(error));
}

function buildDrcArgs({
  pcbPath,
  reportPath,
  schematicParity,
}: {
  pcbPath: string;
  reportPath: string;
  schematicParity: boolean;
}) {
  return [
    'pcb',
    'drc',
    '--format',
    'json',
    '--severity-all',
    ...(schematicParity ? ['--schematic-parity'] : []),
    '--refill-zones',
    '--output',
    reportPath,
    pcbPath,
  ];
}

async function runKiCadDrc(command: string, source: string, filename: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'modumake-kicad-drc-audit-'));
  try {
    const pcbPath = path.join(tempDir, filename.endsWith('.kicad_pcb') ? filename : `${filename}.kicad_pcb`);
    const schematicParityReportPath = path.join(tempDir, 'drc-schematic-parity.json');
    const boardOnlyReportPath = path.join(tempDir, 'drc-board-only.json');
    await writeFile(pcbPath, source, 'utf8');

    try {
      await execFileAsync(command, buildDrcArgs({
        pcbPath,
        reportPath: schematicParityReportPath,
        schematicParity: true,
      }), {
        cwd: tempDir,
        timeout: 90_000,
        maxBuffer: 6_000_000,
      });
      return {
        status: 'ok' as const,
        mode: 'schematic-parity' as const,
        report: JSON.parse(await readFile(schematicParityReportPath, 'utf8')),
        warnings: [],
      };
    } catch (error) {
      if (!isSchematicParityFailure(error)) {
        throw error;
      }

      await execFileAsync(command, buildDrcArgs({
        pcbPath,
        reportPath: boardOnlyReportPath,
        schematicParity: false,
      }), {
        cwd: tempDir,
        timeout: 90_000,
        maxBuffer: 6_000_000,
      });
      return {
        status: 'ok' as const,
        mode: 'board-only' as const,
        report: JSON.parse(await readFile(boardOnlyReportPath, 'utf8')),
        warnings: ['schematic parity failed; retried as board-only DRC'],
      };
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function auditPcbSample({
  rootDir,
  sample,
  kicadCli,
}: {
  rootDir: string;
  sample: ManifestSample;
  kicadCli: Awaited<ReturnType<typeof resolveKiCadCli>>;
}) {
  const absolutePath = path.resolve(rootDir, sample.path);
  await access(absolutePath, fsConstants.R_OK);
  const source = await readFile(absolutePath, 'utf8');
  const document = parseKiCadPcb(source);
  const modumakeReport = validateImportedPcbDocument(document);

  const result = {
    id: sample.id,
    category: sample.category,
    path: sample.path,
    modumake: summarizeReport(modumakeReport),
    officialKiCad: {
      status: 'skipped' as 'skipped' | 'ok' | 'failed',
      reason: kicadCli ? undefined : 'kicad-cli unavailable',
      mode: undefined as 'schematic-parity' | 'board-only' | undefined,
      warnings: [] as string[],
      summary: undefined as ReturnType<typeof summarizeReport> | undefined,
      error: undefined as string | undefined,
    },
  };

  if (!kicadCli || 'error' in kicadCli) {
    result.officialKiCad.reason = kicadCli && 'error' in kicadCli
      ? kicadCli.error
      : 'kicad-cli unavailable';
    return result;
  }

  try {
    const official = await runKiCadDrc(kicadCli.command, source, path.basename(sample.path));
    const officialReport = mapKiCadPcbDrcReport(official.report, { drcMode: official.mode });
    result.officialKiCad = {
      status: 'ok',
      reason: undefined,
      mode: official.mode,
      warnings: official.warnings,
      summary: summarizeReport(officialReport),
      error: undefined,
    };
  } catch (error) {
    result.officialKiCad = {
      status: 'failed',
      reason: undefined,
      mode: undefined,
      warnings: [],
      summary: undefined,
      error: getExecErrorText(error),
    };
  }

  return result;
}

async function main() {
  const rootDir = process.cwd();
  const manifestArg = readArg('manifest', DEFAULT_SAMPLE_MANIFEST);
  const outputPath = path.resolve(rootDir, readArg('output', DEFAULT_OUTPUT));
  const requireKiCad = hasFlag('require-kicad');
  const manifest = await readSampleManifest(rootDir, manifestArg);
  const pcbSamples = manifest.samples.filter(sample => sample.type === 'pcb');
  const pcbLimit = Math.min(numberArg('pcbs', pcbSamples.length), pcbSamples.length);
  const kicadCli = await resolveKiCadCli();

  if (requireKiCad && (!kicadCli || 'error' in kicadCli)) {
    throw new Error(kicadCli && 'error' in kicadCli ? kicadCli.error : 'kicad-cli unavailable');
  }

  const results = [];
  for (const sample of pcbSamples.slice(0, pcbLimit)) {
    const result = await auditPcbSample({ rootDir, sample, kicadCli });
    results.push(result);
    const officialLabel = result.officialKiCad.status === 'ok'
      ? `${result.officialKiCad.summary?.issueCount ?? 0} official`
      : result.officialKiCad.status;
    console.log(`OK ${sample.id} ${result.modumake.issueCount} precheck · ${result.modumake.topReviewGroups.length} groups · ${officialLabel}`);
  }

  const officialStatusCounts = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.officialKiCad.status] = (counts[result.officialKiCad.status] ?? 0) + 1;
    return counts;
  }, {});
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: manifestArg,
    sampleSetId: manifest.sampleSetId,
    kicadCli,
    totalPcbSamples: results.length,
    officialStatusCounts,
    results,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT ${outputPath}`);

  if (requireKiCad && officialStatusCounts.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
