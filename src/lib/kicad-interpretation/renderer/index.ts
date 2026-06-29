import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getKicadCliCandidates() {
  return [
    process.env.KICAD_CLI_PATH,
    '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
    'kicad-cli',
  ].filter((value): value is string => Boolean(value));
}

export interface DependencyCheckResult {
  readonly status: 'pass' | 'fail';
  readonly kicad_cli_found: boolean;
  readonly kicad_cli_version: string | null;
  readonly svg_export_supported: boolean;
  readonly min_required_version: string;
  readonly resolved_cli_path: string | null;
  readonly exit_code: number;
  readonly message: string;
}

export interface RenderArtifacts {
  readonly environmentCheck: DependencyCheckResult;
  readonly environmentCheckPath: string;
  readonly renderFullSvgPath: string;
  readonly renderFullPngPath: string | null;
  readonly coordMapPath: string;
}

export interface CropRenderArtifacts {
  readonly regionId: string;
  readonly cropSvgPath: string;
  readonly cropPngPath: string | null;
  readonly cropBBoxMm: readonly [number, number, number, number];
  readonly cropBBoxPx: readonly [number, number, number, number];
}

export interface CoordMap {
  readonly scale_px_per_mm: number;
  readonly origin_offset_px: readonly [number, number];
  readonly image_size_px: readonly [number, number];
  readonly sheet_size_mm: readonly [number, number];
}

function compareSemverLike(left: string, right: string): number {
  const leftParts = left.split('.').map(part => Number(part.replace(/[^\d].*$/, '')) || 0);
  const rightParts = right.split('.').map(part => Number(part.replace(/[^\d].*$/, '')) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function extractVersion(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;
  const match = combined.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

async function commandWorks(command: string, args: string[]) {
  try {
    const result = await execFileAsync(command, args, { encoding: 'utf8' });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error === 'object' && error && 'stdout' in error ? String((error as { stdout?: unknown }).stdout ?? '') : '',
      stderr: typeof error === 'object' && error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '',
    };
  }
}

async function statSafe(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export async function verifyKicadCli(minVersion = '9.0.0'): Promise<DependencyCheckResult> {
  for (const candidate of getKicadCliCandidates()) {
    const versionResult = await commandWorks(candidate, ['--version']);
    if (!versionResult.ok) {
      continue;
    }

    const version = extractVersion(versionResult.stdout, versionResult.stderr);
    if (!version) {
      return {
        status: 'fail',
        kicad_cli_found: true,
        kicad_cli_version: null,
        svg_export_supported: false,
        min_required_version: minVersion,
        resolved_cli_path: candidate,
        exit_code: 3,
        message: 'kicad-cli version could not be parsed.',
      };
    }

    if (compareSemverLike(version, minVersion) < 0) {
      return {
        status: 'fail',
        kicad_cli_found: true,
        kicad_cli_version: version,
        svg_export_supported: false,
        min_required_version: minVersion,
        resolved_cli_path: candidate,
        exit_code: 3,
        message: `kicad-cli ${version} is older than required ${minVersion}.`,
      };
    }

    const helpResult = await commandWorks(candidate, ['sch', 'export', 'svg', '--help']);
    if (!helpResult.ok) {
      return {
        status: 'fail',
        kicad_cli_found: true,
        kicad_cli_version: version,
        svg_export_supported: false,
        min_required_version: minVersion,
        resolved_cli_path: candidate,
        exit_code: 3,
        message: 'kicad-cli is installed but `sch export svg` is unavailable.',
      };
    }

    return {
      status: 'pass',
      kicad_cli_found: true,
      kicad_cli_version: version,
      svg_export_supported: true,
      min_required_version: minVersion,
      resolved_cli_path: candidate,
      exit_code: 0,
      message: `kicad-cli ${version} is available.`,
    };
  }

  return {
    status: 'fail',
    kicad_cli_found: false,
    kicad_cli_version: null,
    svg_export_supported: false,
    min_required_version: minVersion,
    resolved_cli_path: null,
    exit_code: 2,
    message: 'kicad-cli not found. Install KiCad >= 9.0 and ensure it is on PATH.',
  };
}

function parseSvgSize(svgSource: string): readonly [number, number] {
  const viewBoxMatch = svgSource.match(/viewBox="([\d.\s-]+)"/i);
  if (viewBoxMatch) {
    const values = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (values.length === 4 && values.every(Number.isFinite)) {
      return [Math.round(values[2]), Math.round(values[3])];
    }
  }

  const widthMatch = svgSource.match(/width="([\d.]+)(?:px)?"/i);
  const heightMatch = svgSource.match(/height="([\d.]+)(?:px)?"/i);
  if (widthMatch && heightMatch) {
    return [Math.round(Number(widthMatch[1])), Math.round(Number(heightMatch[1]))];
  }

  throw new Error('Could not infer SVG dimensions from KiCad export.');
}

export function buildCoordMap(params: {
  imageSizePx: readonly [number, number];
  sheetSizeMm: readonly [number, number];
}): CoordMap {
  const [imageWidthPx, imageHeightPx] = params.imageSizePx;
  const [sheetWidthMm, sheetHeightMm] = params.sheetSizeMm;
  const scalePxPerMm = Math.min(imageWidthPx / sheetWidthMm, imageHeightPx / sheetHeightMm);
  const renderedWidthPx = sheetWidthMm * scalePxPerMm;
  const renderedHeightPx = sheetHeightMm * scalePxPerMm;
  const originOffsetPx: readonly [number, number] = [
    Number(((imageWidthPx - renderedWidthPx) / 2).toFixed(3)),
    Number(((imageHeightPx - renderedHeightPx) / 2).toFixed(3)),
  ];

  return {
    scale_px_per_mm: Number(scalePxPerMm.toFixed(6)),
    origin_offset_px: originOffsetPx,
    image_size_px: [imageWidthPx, imageHeightPx],
    sheet_size_mm: [sheetWidthMm, sheetHeightMm],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bboxMmToPx(
  bboxMm: readonly [number, number, number, number],
  coordMap: CoordMap
): readonly [number, number, number, number] {
  const topLeft = [
    coordMap.origin_offset_px[0] + bboxMm[0] * coordMap.scale_px_per_mm,
    coordMap.origin_offset_px[1] + bboxMm[1] * coordMap.scale_px_per_mm,
  ] as const;
  const bottomRight = [
    coordMap.origin_offset_px[0] + bboxMm[2] * coordMap.scale_px_per_mm,
    coordMap.origin_offset_px[1] + bboxMm[3] * coordMap.scale_px_per_mm,
  ] as const;

  return [
    Number(topLeft[0].toFixed(3)),
    Number(topLeft[1].toFixed(3)),
    Number(bottomRight[0].toFixed(3)),
    Number(bottomRight[1].toFixed(3)),
  ];
}

function replaceSvgRootDimensions(svgSource: string, widthPx: number, heightPx: number, viewBox: string) {
  const next = svgSource
    .replace(/width="[^"]*"/i, `width="${widthPx}"`)
    .replace(/height="[^"]*"/i, `height="${heightPx}"`);

  if (/viewBox="[^"]*"/i.test(next)) {
    return next.replace(/viewBox="[^"]*"/i, `viewBox="${viewBox}"`);
  }

  return next.replace(/<svg\b/i, `<svg viewBox="${viewBox}"`);
}

async function normalizeExportedSvgPath(params: {
  requestedPath: string;
  baseName: string;
}): Promise<string> {
  const requestedStat = await statSafe(params.requestedPath);
  if (requestedStat?.isFile()) {
    return params.requestedPath;
  }

  const nestedSvgPath = join(params.requestedPath, `${params.baseName}.svg`);
  const nestedStat = await statSafe(nestedSvgPath);
  if (nestedStat?.isFile()) {
    const normalizedPath = `${params.requestedPath}.normalized.svg`;
    await rename(nestedSvgPath, normalizedPath);
    return normalizedPath;
  }

  throw new Error(`KiCad SVG export output could not be located for ${params.baseName}.`);
}

async function tryRasterizeSvgToPng(svgPath: string, outputPath: string): Promise<string | null> {
  const rasterizeWithSips = await commandWorks('sips', ['-s', 'format', 'png', svgPath, '--out', outputPath]);
  if (!rasterizeWithSips.ok) {
    return null;
  }

  const normalizedOutputPath = outputPath.startsWith('/tmp/') ? outputPath.replace(/^\/tmp\//, '/private/tmp/') : outputPath;
  return (await statSafe(normalizedOutputPath))?.isFile()
    ? normalizedOutputPath
    : (await statSafe(outputPath))?.isFile()
      ? outputPath
      : null;
}

export async function renderFullSchematicArtifacts(params: {
  schematicPath: string;
  outputDirectory: string;
  sheetSizeMm: readonly [number, number];
  minVersion?: string;
}): Promise<RenderArtifacts> {
  const environmentCheck = await verifyKicadCli(params.minVersion);
  await mkdir(params.outputDirectory, { recursive: true });
  const baseName = basename(params.schematicPath).replace(/\.kicad_sch$/i, '');
  const environmentCheckPath = join(params.outputDirectory, `${baseName}.environment-check.json`);
  await writeFile(environmentCheckPath, `${JSON.stringify(environmentCheck, null, 2)}\n`, 'utf8');
  if (environmentCheck.status !== 'pass' || !environmentCheck.resolved_cli_path) {
    throw new Error(environmentCheck.message);
  }

  const renderFullSvgOutputPath = join(params.outputDirectory, `${baseName}.full.svg`);
  const renderFullPngPath = join(params.outputDirectory, `${baseName}.full.png`);
  const coordMapPath = join(params.outputDirectory, `${baseName}.coord-map.json`);

  await execFileAsync(environmentCheck.resolved_cli_path, ['sch', 'export', 'svg', params.schematicPath, '-o', renderFullSvgOutputPath], {
    encoding: 'utf8',
  });

  const renderFullSvgPath = await normalizeExportedSvgPath({
    requestedPath: renderFullSvgOutputPath,
    baseName,
  });
  const pngPath = await tryRasterizeSvgToPng(renderFullSvgPath, renderFullPngPath);
  const svgSource = await readFile(renderFullSvgPath, 'utf8');
  const imageSizePx = parseSvgSize(svgSource);
  const coordMap = buildCoordMap({
    imageSizePx,
    sheetSizeMm: params.sheetSizeMm,
  });

  await writeFile(coordMapPath, `${JSON.stringify(coordMap, null, 2)}\n`, 'utf8');
  return {
    environmentCheck,
    environmentCheckPath,
    renderFullSvgPath,
    renderFullPngPath: pngPath,
    coordMapPath,
  };
}

export async function renderCroppedSvgArtifacts(params: {
  regionId: string;
  fullSvgPath: string;
  coordMap: CoordMap;
  cropBBoxMm: readonly [number, number, number, number];
  outputDirectory: string;
}): Promise<CropRenderArtifacts> {
  await mkdir(params.outputDirectory, { recursive: true });
  const svgSource = await readFile(params.fullSvgPath, 'utf8');
  const imageWidthPx = params.coordMap.image_size_px[0];
  const imageHeightPx = params.coordMap.image_size_px[1];

  const rawCropPx = bboxMmToPx(params.cropBBoxMm, params.coordMap);
  const cropBBoxPx: readonly [number, number, number, number] = [
    clamp(rawCropPx[0], 0, imageWidthPx),
    clamp(rawCropPx[1], 0, imageHeightPx),
    clamp(rawCropPx[2], 0, imageWidthPx),
    clamp(rawCropPx[3], 0, imageHeightPx),
  ];

  const widthPx = Math.max(1, Math.round(cropBBoxPx[2] - cropBBoxPx[0]));
  const heightPx = Math.max(1, Math.round(cropBBoxPx[3] - cropBBoxPx[1]));
  const viewBox = `${cropBBoxPx[0]} ${cropBBoxPx[1]} ${widthPx} ${heightPx}`;
  const croppedSvg = replaceSvgRootDimensions(svgSource, widthPx, heightPx, viewBox);
  const cropSvgPath = join(params.outputDirectory, `${params.regionId}.crop.svg`);

  await writeFile(cropSvgPath, croppedSvg, 'utf8');

  return {
    regionId: params.regionId,
    cropSvgPath,
    cropPngPath: null,
    cropBBoxMm: params.cropBBoxMm,
    cropBBoxPx,
  };
}
