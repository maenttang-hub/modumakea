import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { buildSchematicDomainModel } from '@/lib/v3-kicad-parser/build-schematic-domain-model';
import { parseKiCadSchAst } from '@/lib/v3-kicad-parser/parse-kicad-sch-ast';
import { SchematicConnectivitySolver } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
import { parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';

const SUPPORTED_EXTENSIONS = new Set(['.kicad_sch', '.sch']);
const GROUND_RE = /^(?:A|D|P)?GND(?:PWR|REF)?$|^VSSA?$|^GNDPWR$/i;
const POWER_RE = /^(?:A?V(?:CC|DD)|VIN|VBAT|VUSB|VBUS|VAA|VPP|VDC|VDRIVE|VREF\+?|VREFH|VREFL|3V3|3\.3V|5V|12V|24V|BATT|\+?\d+(?:\.\d+)?V)$/i;

export interface KiCadRegressionFailure {
  file: string;
  message: string;
}

export interface KiCadRegressionSuspiciousFile {
  file: string;
  components: number;
  unresolvedSymbols: number;
  ignoredNonElectricalSymbols: number;
  nonComponentMarkers: number;
  nets: number;
  wires: number;
  labels: number;
  unnamedPower: number;
  flipped: Array<{
    label: string;
    kind: string;
    expected: 'ground' | 'power';
  }>;
  ambiguousRails: Array<{
    label: string;
    expected: 'ground' | 'power';
  }>;
  mixedRails: Array<{
    labels: string[];
    kind: string;
  }>;
  zeroNetFragment: boolean;
}

export interface KiCadRegressionScanSummary {
  roots: string[];
  totalFiles: number;
  parsedFiles: number;
  failedFiles: number;
  failures: KiCadRegressionFailure[];
  suspicious: KiCadRegressionSuspiciousFile[];
  stats: {
    zeroNetFragments: number;
    unresolvedFiles: number;
    unnamedPowerFiles: number;
    flippedRailFiles: number;
    ambiguousRailFiles: number;
    mixedRailFiles: number;
    ignoredNonElectricalFiles: number;
    nonComponentMarkerFiles: number;
  };
}

export async function collectKiCadSchematicFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectKiCadSchematicFiles(absolutePath));
      continue;
    }

    if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export async function collectKiCadSchematicFilesFromRoots(rootDirs: string[]) {
  const files = await Promise.all(rootDirs.map(rootDir => collectKiCadSchematicFiles(rootDir)));
  return files.flat().sort((left, right) => left.localeCompare(right));
}

export async function scanKiCadRegression(options: {
  roots: string[];
  allowFragmentInput?: boolean;
  maxSuspicious?: number;
}): Promise<KiCadRegressionScanSummary> {
  const allowFragmentInput = options.allowFragmentInput ?? true;
  const maxSuspicious = options.maxSuspicious ?? 50;
  const resolvedRoots: string[] = [];

  for (const root of options.roots) {
    const resolved = path.resolve(process.cwd(), root);
    const rootStat = await stat(resolved).catch(() => null);
    if (!rootStat?.isDirectory()) {
      throw new Error(`KiCad regression scan root not found: ${resolved}`);
    }
    resolvedRoots.push(resolved);
  }

  const files = await collectKiCadSchematicFilesFromRoots(resolvedRoots);
  const failures: KiCadRegressionFailure[] = [];
  const suspicious: KiCadRegressionSuspiciousFile[] = [];
  const stats = {
    zeroNetFragments: 0,
    unresolvedFiles: 0,
    unnamedPowerFiles: 0,
    flippedRailFiles: 0,
    ambiguousRailFiles: 0,
    mixedRailFiles: 0,
    ignoredNonElectricalFiles: 0,
    nonComponentMarkerFiles: 0,
  };

  for (const file of files) {
    try {
      const source = await readFile(file, 'utf8');
      const { root } = parseKiCadSchAst(source);
      const model = buildSchematicDomainModel(root);
      const nets = SchematicConnectivitySolver.resolveNets(model);
      const unified = parseKiCadSchematicToUnifiedCircuitModel(source, {
        allowFragmentInput,
        projectName: path.basename(file, path.extname(file)),
      });

      const unnamedPower = nets.filter(net => net.aliases.length === 0 && net.members.some(member => member.reference.startsWith('#PWR'))).length;
      const flipped: KiCadRegressionSuspiciousFile['flipped'] = [];
      const ambiguousRails: KiCadRegressionSuspiciousFile['ambiguousRails'] = [];
      const mixedRails: KiCadRegressionSuspiciousFile['mixedRails'] = [];

      for (const net of nets) {
        const labels = [...new Set([...(net.aliases ?? []), net.primaryLabel].filter((label): label is string => Boolean(label)))];
        const hasGroundLabel = labels.some(label => GROUND_RE.test(label));
        const hasPowerLabel = labels.some(label => POWER_RE.test(label));
        if (hasGroundLabel && hasPowerLabel) {
          mixedRails.push({ labels, kind: net.kind });
          continue;
        }
        for (const label of labels) {
          const expected = GROUND_RE.test(label) ? 'ground' : POWER_RE.test(label) ? 'power' : null;
          if (expected && net.kind === 'unknown') {
            ambiguousRails.push({ label, expected });
          } else if (expected && net.kind !== expected) {
            flipped.push({ label, kind: net.kind, expected });
          }
        }
      }

      const zeroNetFragment = unified.nets.length === 0 && (unified.stats.wireSegmentCount > 0 || unified.unresolvedSymbols.length > 0);
      if (zeroNetFragment) {
        stats.zeroNetFragments += 1;
      }
      if (unified.unresolvedSymbols.length > 0) {
        stats.unresolvedFiles += 1;
      }
      if (unified.ignoredNonElectricalSymbols.length > 0) {
        stats.ignoredNonElectricalFiles += 1;
      }
      if (unified.nonComponentMarkers.length > 0) {
        stats.nonComponentMarkerFiles += 1;
      }
      if (unnamedPower > 0) {
        stats.unnamedPowerFiles += 1;
      }
      if (flipped.length > 0) {
        stats.flippedRailFiles += 1;
      }
      if (ambiguousRails.length > 0) {
        stats.ambiguousRailFiles += 1;
      }
      if (mixedRails.length > 0) {
        stats.mixedRailFiles += 1;
      }

      if (
        suspicious.length < maxSuspicious &&
        (zeroNetFragment || unnamedPower > 0 || flipped.length > 0 || ambiguousRails.length > 0 || mixedRails.length > 0 || unified.unresolvedSymbols.length > 0 || unified.ignoredNonElectricalSymbols.length > 0 || unified.nonComponentMarkers.length > 0)
      ) {
        suspicious.push({
          file,
          components: unified.components.length,
          unresolvedSymbols: unified.unresolvedSymbols.length,
          ignoredNonElectricalSymbols: unified.ignoredNonElectricalSymbols.length,
          nonComponentMarkers: unified.nonComponentMarkers.length,
          nets: unified.nets.length,
          wires: unified.stats.wireSegmentCount,
          labels: unified.stats.labelCount,
          unnamedPower,
          flipped: flipped.slice(0, 10),
          ambiguousRails: ambiguousRails.slice(0, 10),
          mixedRails: mixedRails.slice(0, 10),
          zeroNetFragment,
        });
      }
    } catch (error) {
      failures.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    roots: resolvedRoots,
    totalFiles: files.length,
    parsedFiles: files.length - failures.length,
    failedFiles: failures.length,
    failures,
    suspicious,
    stats,
  };
}
