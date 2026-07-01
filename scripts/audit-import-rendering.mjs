import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

const DEFAULT_BASE_URL = 'http://localhost:3000/editor';
const DEFAULT_OUTPUT_DIR = 'tmp/chrome-render-audit/expanded';
const DEFAULT_SAMPLE_MANIFEST = 'tests/fixtures/kicad-beta-sample-set.json';
const VIEWPORT = { width: 1440, height: 900 };
const FILE_INPUT_SELECTOR = 'input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]';

const SCHEMATIC_SAMPLES = [
  ['sch-a4988', 'tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_sch'],
  ['sch-cdi', 'tests/kicad_samples/rusefi/CDI-test/CDI-test.kicad_sch'],
  ['sch-gdi-4ch', 'tests/kicad_samples/rusefi/GDI-4ch/GDI-4ch.kicad_sch'],
  ['sch-gdi-6ch', 'tests/kicad_samples/rusefi/GDI-6ch/GDI-6ch.kicad_sch'],
  ['sch-gdi-stm', 'tests/kicad_samples/rusefi/GDI-STM/GDI-STM.kicad_sch'],
  ['sch-ir2302', 'tests/kicad_samples/rusefi/IR2302-testboard/IR2302-testboard.kicad_sch'],
  ['sch-l9779-flash', 'tests/kicad_samples/rusefi/L9779WD-breakout/FlashMemory.kicad_sch'],
  ['sch-l9779-tle8888', 'tests/kicad_samples/rusefi/L9779WD-breakout/TLE8888-1QK.kicad_sch'],
  ['sch-l9779-tle9201', 'tests/kicad_samples/rusefi/L9779WD-breakout/TLE9201SG.kicad_sch'],
  ['sch-l9779-adc', 'tests/kicad_samples/rusefi/L9779WD-breakout/adc.kicad_sch'],
  ['sch-l9779-hi-lo', 'tests/kicad_samples/rusefi/L9779WD-breakout/hi-lo.kicad_sch'],
  ['sch-l9779-micro', 'tests/kicad_samples/rusefi/L9779WD-breakout/micro_rusEFI.kicad_sch'],
  ['sch-l9779-pair', 'tests/kicad_samples/rusefi/L9779WD-breakout/pair.kicad_sch'],
  ['sch-l9779-stm32', 'tests/kicad_samples/rusefi/L9779WD-breakout/stm32.kicad_sch'],
  ['sch-lm1949', 'tests/kicad_samples/rusefi/Low-Z_LM1949/LM1949_Driver.kicad_sch'],
  ['sch-mc33810', 'tests/kicad_samples/rusefi/MC33810-breakout/MC33810-breakout.kicad_sch'],
  ['sch-vr-hall', 'tests/kicad_samples/rusefi/VR-Hall/VR-Hall.kicad_sch'],
  ['sch-zf8hp', 'tests/kicad_samples/rusefi/ZF8HP Transmission/8HPTCUAdapter.kicad_sch'],
  ['sch-frequency-divider', 'tests/kicad_samples/rusefi/frequency-divider/frequency-divider.kicad_sch'],
  ['sch-lambda-egt', 'tests/kicad_samples/rusefi/lambda-x2/egt.kicad_sch'],
  ['sch-lambda-main', 'tests/kicad_samples/rusefi/lambda-x2/lambda-x2.kicad_sch'],
  ['sch-lambda-lsu', 'tests/kicad_samples/rusefi/lambda-x2/lsu.kicad_sch'],
  ['sch-mini48', 'tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_sch'],
  ['sch-quad-igbt', 'tests/kicad_samples/rusefi/quad-igbt/quad-igbt.kicad_sch'],
  ['sch-wideband', 'tests/kicad_samples/rusefi/wideband-F103/wideband_controller.kicad_sch'],
];

const PCB_SAMPLES = [
  ['pcb-a4988', 'tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_pcb'],
  ['pcb-cdi', 'tests/kicad_samples/rusefi/CDI-test/CDI-test.kicad_pcb'],
  ['pcb-gdi-4ch', 'tests/kicad_samples/rusefi/GDI-4ch/GDI-4ch.kicad_pcb'],
  ['pcb-gdi-6ch', 'tests/kicad_samples/rusefi/GDI-6ch/GDI-6ch.kicad_pcb'],
  ['pcb-gdi-stm', 'tests/kicad_samples/rusefi/GDI-STM/GDI-STM.kicad_pcb'],
  ['pcb-ir2302', 'tests/kicad_samples/rusefi/IR2302-testboard/IR2302-testboard.kicad_pcb'],
  ['pcb-l9779-micro', 'tests/kicad_samples/rusefi/L9779WD-breakout/micro_rusEFI.kicad_pcb'],
  ['pcb-lm1949', 'tests/kicad_samples/rusefi/Low-Z_LM1949/LM1949_Driver.kicad_pcb'],
  ['pcb-mc33810', 'tests/kicad_samples/rusefi/MC33810-breakout/MC33810-breakout.kicad_pcb'],
  ['pcb-vr-hall', 'tests/kicad_samples/rusefi/VR-Hall/VR-Hall.kicad_pcb'],
  ['pcb-vr-ncv1124', 'tests/kicad_samples/rusefi/VR_ncv1124_test_module/ncv1124.kicad_pcb'],
  ['pcb-zf8hp', 'tests/kicad_samples/rusefi/ZF8HP Transmission/8HPTCUAdapter.kicad_pcb'],
  ['pcb-frequency-divider', 'tests/kicad_samples/rusefi/frequency-divider/frequency-divider.kicad_pcb'],
  ['pcb-lambda-main', 'tests/kicad_samples/rusefi/lambda-x2/lambda-x2.kicad_pcb'],
  ['pcb-mini48', 'tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_pcb'],
  ['pcb-quad-igbt', 'tests/kicad_samples/rusefi/quad-igbt/quad-igbt.kicad_pcb'],
  ['pcb-superseal-igbt', 'tests/kicad_samples/rusefi/superseal-igbt/superseal-igbt.kicad_pcb'],
  ['pcb-tle9104', 'tests/kicad_samples/rusefi/tle9104-breakout/tle9104-breakout.kicad_pcb'],
  ['pcb-wideband', 'tests/kicad_samples/rusefi/wideband-F103/wideband_controller.kicad_pcb'],
  ['pcb-classic-inj-12ch', 'tests/kicad_samples/rusefi/classic-designs/1A_injector_12-channels/inj_12ch.kicad_pcb'],
  ['pcb-classic-inj-6ch', 'tests/kicad_samples/rusefi/classic-designs/1A_injector_6-channels/inj_6ch.kicad_pcb'],
  ['pcb-classic-5v-regulator', 'tests/kicad_samples/rusefi/classic-designs/5V-regulator/PWR_5V_linear.kicad_pcb'],
  ['pcb-classic-a4988', 'tests/kicad_samples/rusefi/classic-designs/A4988_stepper_motor_driver/stepper_motor_driver.kicad_pcb'],
  ['pcb-classic-vn750', 'tests/kicad_samples/rusefi/classic-designs/HighSideSwitch/VN750PS_E.kicad_pcb'],
  ['pcb-classic-adc-divider', 'tests/kicad_samples/rusefi/classic-designs/adc_amp_divider/adc_amp_divider.kicad_pcb'],
];

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function numberArg(name, fallback) {
  const parsed = Number(readArg(name, String(fallback)));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function inlineSampleManifest() {
  return {
    manifestPath: null,
    sampleSetId: 'legacy-inline-import-render-50',
    samples: [
      ...SCHEMATIC_SAMPLES.map(([id, relativePath]) => ({ id, path: relativePath, type: 'schematic' })),
      ...PCB_SAMPLES.map(([id, relativePath]) => ({ id, path: relativePath, type: 'pcb' })),
    ],
  };
}

function normalizeSampleManifest(raw, manifestPath) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.samples)) {
    throw new Error(`Invalid sample manifest: ${manifestPath}`);
  }

  return {
    manifestPath,
    sampleSetId: typeof raw.sampleSetId === 'string' ? raw.sampleSetId : path.basename(manifestPath),
    samples: raw.samples.map((sample, index) => {
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
        path: sample.path,
        type: sample.type,
      };
    }),
  };
}

async function loadSampleManifest(rootDir, manifestArg) {
  const manifestPath = path.resolve(rootDir, manifestArg);
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    return normalizeSampleManifest(raw, manifestPath);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? error.code
      : undefined;
    if (manifestArg === DEFAULT_SAMPLE_MANIFEST && code === 'ENOENT') {
      return inlineSampleManifest();
    }
    throw error;
  }
}

function roundNumber(value) {
  return typeof value === 'number' ? Number(value.toFixed(4)) : value;
}

function compactNumbers(value) {
  return JSON.parse(JSON.stringify(value, (key, current) => roundNumber(current)));
}

async function launchBrowser() {
  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    return { browser, engine: 'Google Chrome' };
  } catch (error) {
    const browser = await chromium.launch({ headless: true });
    return {
      browser,
      engine: 'Playwright Chromium fallback',
      launchError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resetEditor(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function collectCommonMetrics(page) {
  return page.evaluate(() => {
    const unnamedButtons = Array.from(document.querySelectorAll('button'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        const hidden =
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Boolean(button.closest('[aria-hidden="true"]'));
        if (hidden) {
          return false;
        }

        const name =
          button.getAttribute('aria-label')?.trim() ||
          button.textContent?.trim() ||
          button.getAttribute('title')?.trim();
        return !name;
      })
      .map(button => button.outerHTML.slice(0, 180));

    return {
      bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      unnamedButtonCount: unnamedButtons.length,
      unnamedButtons,
      windowWidth: window.innerWidth,
    };
  });
}

async function collectSchematicMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-mm-export="schematic-canvas"]');
    const overlay = document.querySelector('[data-mm-imported-schematic-overlay="true"]');
    const zoomLabel = document.querySelector('[data-testid="schematic-zoom-label"]')?.textContent?.trim() ?? '';
    if (!canvas || !overlay) {
      return { present: false, zoomLabel };
    }

    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const intersectionWidth = Math.max(
      0,
      Math.min(overlayRect.right, canvasRect.right) - Math.max(overlayRect.left, canvasRect.left)
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(overlayRect.bottom, canvasRect.bottom) - Math.max(overlayRect.top, canvasRect.top)
    );
    const primitiveCount = overlay.querySelectorAll('path,line,rect,circle,polyline,text').length;

    return {
      present: true,
      canvasRect: {
        height: canvasRect.height,
        width: canvasRect.width,
        x: canvasRect.x,
        y: canvasRect.y,
      },
      heightVisibleRatio: intersectionHeight / Math.max(overlayRect.height, 1),
      overlayRect: {
        height: overlayRect.height,
        width: overlayRect.width,
        x: overlayRect.x,
        y: overlayRect.y,
      },
      primitiveCount,
      visibleAreaRatio: (intersectionWidth * intersectionHeight) / Math.max(overlayRect.width * overlayRect.height, 1),
      widthVisibleRatio: intersectionWidth / Math.max(overlayRect.width, 1),
      zoomLabel,
    };
  });
}

async function collectPcbMetrics(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="imported-pcb-svg"]');
    const layerControls = document.querySelector('[data-testid="imported-pcb-layer-controls"]');
    const layers = {};
    layerControls?.querySelectorAll('button').forEach((button) => {
      const layer = button.textContent?.trim();
      if (layer) {
        layers[layer] = button.getAttribute('aria-pressed');
      }
    });

    const toRect = rect => ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    });
    const unionRects = rects => {
      if (rects.length === 0) {
        return null;
      }
      return rects.reduce((acc, rect) => ({
        bottom: Math.max(acc.bottom, rect.bottom),
        height: Math.max(acc.bottom, rect.bottom) - Math.min(acc.top, rect.top),
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
        top: Math.min(acc.top, rect.top),
        width: Math.max(acc.right, rect.right) - Math.min(acc.left, rect.left),
        x: Math.min(acc.left, rect.left),
        y: Math.min(acc.top, rect.top),
      }));
    };
    const intersectionArea = (a, b) => {
      if (!a || !b) {
        return 0;
      }
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };

    const svgRect = svg?.getBoundingClientRect();
    const graphicRects = svg
      ? Array.from(svg.querySelectorAll('path,line,rect,circle,polygon,polyline,text'))
          .filter((element) => !(element.tagName.toLowerCase() === 'rect' && element.getAttribute('fill') === '#fffdf9'))
          .map(element => element.getBoundingClientRect())
          .filter(rect => rect.width > 0.5 && rect.height > 0.5)
          .map(toRect)
      : [];
    const graphicRect = unionRects(graphicRects);
    const layerControlsRect = layerControls ? toRect(layerControls.getBoundingClientRect()) : null;
    const layerControlOverlapArea = intersectionArea(graphicRect, layerControlsRect);
    return {
      present: Boolean(svg),
      graphicCount: svg?.querySelectorAll('path,line,rect,circle,polygon,polyline,text').length ?? 0,
      graphicRect,
      layerControlOverlapArea,
      layerControlsRect,
      layers,
      svgRect: svgRect
        ? toRect(svgRect)
        : null,
    };
  });
}

function flagCommonIssues(common) {
  const issues = [];
  if (common.bodyOverflowX > 1) {
    issues.push(`horizontal document overflow ${common.bodyOverflowX}px`);
  }
  if (common.unnamedButtonCount > 0) {
    issues.push(`${common.unnamedButtonCount} visible unnamed buttons`);
  }
  return issues;
}

function flagSchematicIssues(metrics, common) {
  const issues = flagCommonIssues(common);
  if (!metrics.present) {
    issues.push('schematic overlay missing');
    return issues;
  }
  if (metrics.primitiveCount < 20) {
    issues.push(`low schematic primitive count ${metrics.primitiveCount}`);
  }
  if (metrics.widthVisibleRatio < 0.92) {
    issues.push(`schematic width clipped ${(metrics.widthVisibleRatio * 100).toFixed(1)}% visible`);
  }
  if (metrics.heightVisibleRatio < 0.92) {
    issues.push(`schematic height clipped ${(metrics.heightVisibleRatio * 100).toFixed(1)}% visible`);
  }
  return issues;
}

function flagPcbIssues(metrics, common) {
  const issues = flagCommonIssues(common);
  if (!metrics.present) {
    issues.push('PCB SVG missing');
    return issues;
  }
  if (metrics.graphicCount < 10) {
    issues.push(`low PCB graphic count ${metrics.graphicCount}`);
  }
  for (const layer of ['F.Fab', 'B.Fab', 'Dwgs.User']) {
    if (metrics.layers[layer] === 'true') {
      issues.push(`${layer} visible by default`);
    }
  }
  if (metrics.layerControlOverlapArea > 24) {
    issues.push(`PCB layer controls overlap board graphics ${metrics.layerControlOverlapArea.toFixed(1)}px2`);
  }
  return issues;
}

async function auditSample({ page, outputDir, rootDir, sample, type, baseUrl, settleMs }) {
  const [name, relativePath] = sample;
  const absolutePath = path.join(rootDir, relativePath);
  try {
    await fs.access(absolutePath);
  } catch {
    return {
      name,
      type,
      relativePath,
      issues: [`missing fixture ${relativePath}`],
    };
  }

  const pageErrors = [];
  const onPageError = error => pageErrors.push(error instanceof Error ? error.message : String(error));
  page.on('pageerror', onPageError);

  try {
    await resetEditor(page, baseUrl);
    await page.locator(FILE_INPUT_SELECTOR).setInputFiles(absolutePath);
    if (type === 'schematic') {
      await page.locator('[data-mm-imported-schematic-overlay="true"]').waitFor({ state: 'visible', timeout: 45_000 });
    } else {
      await page.getByTestId('imported-pcb-svg').waitFor({ state: 'visible', timeout: 45_000 });
    }
    await page.waitForTimeout(settleMs);

    const screenshotPath = path.join(outputDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const common = await collectCommonMetrics(page);
    const metrics = type === 'schematic'
      ? await collectSchematicMetrics(page)
      : await collectPcbMetrics(page);
    const issues = type === 'schematic'
      ? flagSchematicIssues(metrics, common)
      : flagPcbIssues(metrics, common);
    if (pageErrors.length > 0) {
      issues.push(...pageErrors.map(error => `page error: ${error}`));
    }

    return {
      name,
      type,
      relativePath,
      screenshotPath,
      issues,
      common: compactNumbers(common),
      metrics: compactNumbers(metrics),
    };
  } catch (error) {
    const screenshotPath = path.join(outputDir, `${name}-failure.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    return {
      name,
      type,
      relativePath,
      screenshotPath,
      issues: [`audit failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  } finally {
    page.off('pageerror', onPageError);
  }
}

async function main() {
  const rootDir = process.cwd();
  const baseUrl = readArg('base-url', DEFAULT_BASE_URL);
  const sampleManifest = await loadSampleManifest(rootDir, readArg('manifest', DEFAULT_SAMPLE_MANIFEST));
  const outputDir = path.resolve(rootDir, readArg('output', DEFAULT_OUTPUT_DIR));
  const schematicSamples = sampleManifest.samples.filter(sample => sample.type === 'schematic');
  const pcbSamples = sampleManifest.samples.filter(sample => sample.type === 'pcb');
  const schematicLimit = Math.min(numberArg('schematics', schematicSamples.length), schematicSamples.length);
  const pcbLimit = Math.min(numberArg('pcbs', pcbSamples.length), pcbSamples.length);
  const settleMs = numberArg('settle-ms', 1_200);
  const samples = [
    ...schematicSamples.slice(0, schematicLimit).map(sample => ({ sample: [sample.id, sample.path], type: 'schematic' })),
    ...pcbSamples.slice(0, pcbLimit).map(sample => ({ sample: [sample.id, sample.path], type: 'pcb' })),
  ];

  await fs.mkdir(outputDir, { recursive: true });
  const { browser, engine, launchError } = await launchBrowser();
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  const results = [];
  for (const item of samples) {
    const result = await auditSample({
      page,
      outputDir,
      rootDir,
      sample: item.sample,
      type: item.type,
      baseUrl,
      settleMs,
    });
    results.push(result);
    console.log(`${result.issues.length > 0 ? 'ISSUE' : 'OK'} ${result.name} ${result.issues.join('; ')}`);
  }

  await browser.close();

  const report = {
    baseUrl,
    engine,
    generatedAt: new Date().toISOString(),
    launchError,
    manifestPath: sampleManifest.manifestPath,
    outputDir,
    sampleSetId: sampleManifest.sampleSetId,
    totalSamples: results.length,
    issueCount: results.reduce((sum, result) => sum + result.issues.length, 0),
    viewport: VIEWPORT,
    results,
  };
  const reportPath = path.join(outputDir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`REPORT ${reportPath}`);
  console.log(`ISSUES ${report.issueCount}`);

  if (report.issueCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
