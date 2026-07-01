import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { directLedWorkspace, importedSchematicWorkspace } from './fixtures/workspaces';

const workspaceStorageKey = 'modumake-workspace-v1';
const reportSnapshotKey = 'modumake-report-workspace-snapshot-v1';
const importedPcbFixturePath = path.join(
  process.cwd(),
  'tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_pcb',
);
const importedSchematicFixturePath = path.join(
  process.cwd(),
  'tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_sch',
);

const fakeKiCadDrcResponse = {
  drcMode: 'schematic-parity',
  warnings: [],
  report: {
    violations: [
      {
        type: 'clearance',
        severity: 'error',
        description: 'Mock official clearance finding',
        items: [{ description: 'track-to-pad clearance', pos: { x: 71.25, y: 43.5 } }],
      },
      {
        type: 'courtyard_overlap',
        severity: 'warning',
        description: 'Mock official courtyard overlap',
        items: [{ description: 'footprint courtyard overlap', pos: { x: 66.1, y: 39.2 } }],
      },
    ],
    unconnected_items: [
      {
        type: 'unconnected_items',
        severity: 'warning',
        description: 'Mock official unconnected item',
        items: [{ description: 'unconnected pad', pos: { x: 80.3, y: 54.6 } }],
      },
    ],
  },
};

type PageErrorLog = {
  message: string;
};

function collectPageErrors(page: Page) {
  const errors: PageErrorLog[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push({ message: message.text() });
    }
  });

  page.on('pageerror', (error) => {
    errors.push({ message: error.message });
  });

  return errors;
}

async function readCount(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await expect(locator).toHaveText(/\d+/);
  const value = Number((await locator.innerText()).trim());
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

function titleBarFileButton(page: Page, label: string) {
  return page.locator('header button').filter({ hasText: label }).first();
}

type E2eWorkspace = typeof directLedWorkspace | typeof importedSchematicWorkspace;

async function seedWorkspace(page: Page, state: E2eWorkspace) {
  await page.addInitScript(
    ({ reportKey, workspaceKey, workspaceState }) => {
      window.localStorage.setItem(workspaceKey, JSON.stringify({ version: 0, state: workspaceState }));
      window.localStorage.removeItem(reportKey);
    },
    {
      reportKey: reportSnapshotKey,
      workspaceKey: workspaceStorageKey,
      workspaceState: state,
    },
  );
}

async function expectNoVisibleUnnamedButtons(page: Page) {
  const unnamedButtons = await page.locator('button').evaluateAll(buttons =>
    buttons
      .filter(button => {
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
      .map(button => button.outerHTML.slice(0, 180))
  );

  expect(unnamedButtons).toEqual([]);
}

async function readImportedSchematicVisibility(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-mm-export="schematic-canvas"]');
    const overlay = document.querySelector('[data-mm-imported-schematic-overlay="true"]');
    if (!canvas || !overlay) {
      return null;
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

    return {
      heightVisibleRatio: intersectionHeight / Math.max(overlayRect.height, 1),
      widthVisibleRatio: intersectionWidth / Math.max(overlayRect.width, 1),
    };
  });
}

async function readImportedPcbLayerStates(page: Page) {
  return page.getByTestId('imported-pcb-layer-controls').evaluate((container) => {
    const states: Record<string, string | null> = {};
    container.querySelectorAll('button').forEach((button) => {
      const layer = button.textContent?.trim();
      if (layer) {
        states[layer] = button.getAttribute('aria-pressed');
      }
    });
    return states;
  });
}

test('editor loads without browser console errors', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/editor');

  await expect(page.getByText('회로 구조', { exact: true })).toBeVisible();
  await expect(page.getByText('검토 패널', { exact: true })).toBeVisible();
  await expect(titleBarFileButton(page, '파일을 열어주세요')).toBeVisible();
  await expect(page.getByText('KiCad 파일을 올려서 바로 리뷰 시작')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the desktop workspace notice', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/editor');

    await expect(page.getByText('데스크톱 화면에서 사용해 주세요')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('editor shows restored project state without the empty file prompt', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkspace(page, directLedWorkspace);

  await page.goto('/editor');

  await expect(page.getByText(directLedWorkspace.projectName).first()).toBeVisible();
  await expect(titleBarFileButton(page, `${directLedWorkspace.projectName}.modumake.json`)).toBeVisible();
  await expect(page.getByText('파일을 열어주세요')).toHaveCount(0);
  await expect(page.getByText('KiCad 파일을 올려서 바로 리뷰 시작')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editor shows imported schematic state without the empty file prompt', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkspace(page, importedSchematicWorkspace);

  await page.goto('/editor');

  await expect(page.getByText(importedSchematicWorkspace.projectName).first()).toBeVisible();
  await expect(titleBarFileButton(page, `${importedSchematicWorkspace.projectName}.kicad_sch`)).toBeVisible();
  await expect(page.getByText('파일을 열어주세요')).toHaveCount(0);
  await expect(page.getByText('KiCad 파일을 올려서 바로 리뷰 시작')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editor imports a real KiCad schematic file through the file input', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/editor');
  await page
    .locator('input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]')
    .setInputFiles(importedSchematicFixturePath);

  await expect(titleBarFileButton(page, 'Motor_driver_A4988.kicad_sch')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-mm-imported-schematic-overlay="true"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('KiCad 파일을 올려서 바로 리뷰 시작')).toHaveCount(0);

  const readStoredImport = () => page.evaluate((workspaceKey) => {
    const raw = window.localStorage.getItem(workspaceKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      state?: {
        components?: unknown[];
        importedSchematicSource?: string | null;
      };
    };

    return {
      componentCount: parsed.state?.components?.length ?? 0,
      sourceLength: parsed.state?.importedSchematicSource?.length ?? 0,
    };
  }, workspaceStorageKey);

  await expect.poll(async () => (await readStoredImport())?.componentCount ?? 0).toBeGreaterThan(0);
  await expect.poll(async () => (await readStoredImport())?.sourceLength ?? 0).toBeGreaterThan(10000);
  await expect.poll(async () => {
    const visibility = await readImportedSchematicVisibility(page);
    return Math.min(visibility?.widthVisibleRatio ?? 0, visibility?.heightVisibleRatio ?? 0);
  }).toBeGreaterThanOrEqual(0.92);
  await expectNoVisibleUnnamedButtons(page);
  expect(errors).toEqual([]);
});

test('editor shows imported PCB zoom controls and changes the board view', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/editor');
  await page
    .locator('input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]')
    .setInputFiles(importedPcbFixturePath);

  const pcbSvg = page.getByTestId('imported-pcb-svg');
  const zoomLabel = page.getByTestId('imported-pcb-zoom-label');
  await expect(pcbSvg).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('pcb-workspace-top-controls')).toContainText('사전점검');
  await expect(page.getByTestId('imported-pcb-issue-summary')).toContainText('KiCad 공식 DRC는 아직 실행되지 않았습니다.');
  await expect(page.getByTestId('imported-pcb-zoom-controls')).toBeVisible();
  await expect(zoomLabel).toHaveText('100%');
  await expect.poll(() => readImportedPcbLayerStates(page)).toMatchObject({
    'F.Fab': 'false',
    'B.Fab': 'false',
  });

  const initialViewBox = await pcbSvg.getAttribute('viewBox');
  await page.getByTitle('축소').click();
  await expect(zoomLabel).toHaveText('80%');
  expect(await pcbSvg.getAttribute('viewBox')).not.toBe(initialViewBox);

  await page.getByTitle('화면 맞춤').click();
  await expect(zoomLabel).toHaveText('100%');
  await expect.poll(() => pcbSvg.getAttribute('viewBox')).toBe(initialViewBox);

  await page.getByTitle('확대').click();
  await expect(zoomLabel).toHaveText('125%');
  expect(await pcbSvg.getAttribute('viewBox')).not.toBe(initialViewBox);

  await page.getByTitle('화면 맞춤').click();
  await expect(zoomLabel).toHaveText('100%');
  await expect.poll(() => pcbSvg.getAttribute('viewBox')).toBe(initialViewBox);
  await expectNoVisibleUnnamedButtons(page);
  expect(errors).toEqual([]);
});

test('editor and report show matching imported PCB validation counts', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/editor');
  await page
    .locator('input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]')
    .setInputFiles(importedPcbFixturePath);
  await expect(page.getByTestId('imported-pcb-svg')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('imported-pcb-review-groups')).toBeVisible();
  await expect(page.getByTestId('imported-pcb-review-group').first()).toBeVisible();

  const editorCounts = {
    error: await readCount(page, 'editor-error-count'),
    warning: await readCount(page, 'editor-warning-count'),
  };
  expect(editorCounts.error + editorCounts.warning).toBeGreaterThan(0);

  await page.getByRole('button', { name: '분석 보고서 보기' }).click();
  await page.waitForURL('**/report');
  await expect(page.getByText('Motor_driver_A4988.kicad_pcb').first()).toBeVisible();
  await expect(page.getByText('PCB 형상 / Net 연속성 / 제조성 DRC')).toBeVisible();
  await expect(page.getByTestId('report-pcb-drc-source')).toContainText('KiCad 공식 DRC 미실행');
  await expect(page.getByTestId('report-pcb-drc-source')).toContainText('ModuMake 자체 PCB 검사');
  await expect(page.getByTestId('report-pcb-review-groups')).toBeVisible();
  await expect(page.getByText('가져온 PCB의 형상', { exact: false })).toBeVisible();

  const reportCounts = {
    error: await readCount(page, 'report-error-count'),
    warning: await readCount(page, 'report-warning-count'),
  };
  expect(reportCounts.error).toBe(editorCounts.error);
  expect(reportCounts.warning).toBe(editorCounts.warning);
  expect(errors).toEqual([]);
});

test('editor and report separate official KiCad DRC from ModuMake PCB review groups', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.route('**/api/kicad/pcb-drc', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeKiCadDrcResponse),
    });
  });

  await page.goto('/editor');
  await page
    .locator('input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]')
    .setInputFiles(importedPcbFixturePath);
  await expect(page.getByTestId('imported-pcb-svg')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'KiCad DRC' }).click();
  await expect(page.getByTestId('imported-pcb-drc-comparison')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('imported-pcb-drc-comparison')).toContainText('공식 DRC');
  await expect(page.getByTestId('imported-pcb-drc-comparison')).toContainText('ModuMake 검토');

  await page.getByRole('button', { name: '분석 보고서 보기' }).click();
  await page.waitForURL('**/report');
  await expect(page.getByTestId('report-pcb-drc-source')).toContainText('공식 결과 우선');
  await expect(page.getByTestId('report-pcb-drc-comparison')).toBeVisible();
  await expect(page.getByTestId('report-pcb-drc-comparison')).toContainText('공식 KiCad DRC 상위 항목');
  await expect(page.getByTestId('report-pcb-drc-comparison')).toContainText('ModuMake 검토 그룹');
  expect(errors).toEqual([]);
});

test.describe('compact desktop PCB rendering', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('keeps PCB controls single-line and avoids overlay collisions', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/editor');
    await page
      .locator('input[type="file"][accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"]')
      .setInputFiles(importedPcbFixturePath);

    const pcbSvg = page.getByTestId('imported-pcb-svg');
    const modeBar = page.getByTestId('workspace-mode-bar');
    const topControls = page.getByTestId('pcb-workspace-top-controls');
    const layerControls = page.getByTestId('imported-pcb-layer-controls');
    const zoomControls = page.getByTestId('imported-pcb-zoom-controls');
    const issueSummary = page.getByTestId('imported-pcb-issue-summary');
    const issueLocationButtons = page.getByText('항목 위치 보기');

    await expect(pcbSvg).toBeVisible({ timeout: 15000 });
    await expect(modeBar).toBeVisible();
    await expect(topControls).toBeVisible();
    await expect(layerControls).toBeVisible();
    await expect(zoomControls).toBeVisible();
    await expect(issueSummary).toBeVisible();
    await expect(issueLocationButtons.first()).toBeVisible();
    await issueLocationButtons.first().click();
    await expect(page.getByTestId('imported-pcb-selected-issue')).toBeVisible();

    const boxes = await page.evaluate(() => {
      const box = (testId: string) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!element) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      };
      return {
        bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
        issueSummary: box('imported-pcb-issue-summary'),
        layerControls: box('imported-pcb-layer-controls'),
        modeBar: box('workspace-mode-bar'),
        selectedIssue: box('imported-pcb-selected-issue'),
        topControls: box('pcb-workspace-top-controls'),
        zoomControls: box('imported-pcb-zoom-controls'),
      };
    });

    expect(boxes.modeBar?.height).toBeLessThanOrEqual(44);
    expect(boxes.topControls?.height).toBeLessThanOrEqual(44);
    expect(boxes.layerControls?.height).toBeLessThanOrEqual(40);
    expect(boxes.bodyOverflowX).toBeLessThanOrEqual(0);
    expect(boxes.topControls && boxes.layerControls ? boxes.topControls.bottom <= boxes.layerControls.top : false).toBe(true);
    expect(boxes.zoomControls && boxes.issueSummary ? boxes.zoomControls.right <= boxes.issueSummary.left : false).toBe(true);
    expect(boxes.selectedIssue && boxes.zoomControls ? boxes.selectedIssue.bottom <= boxes.zoomControls.top : false).toBe(true);
    expect(boxes.selectedIssue && boxes.issueSummary ? boxes.selectedIssue.right <= boxes.issueSummary.left : false).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('editor and report show matching validation counts from the report button flow', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkspace(page, directLedWorkspace);

  await page.goto('/editor');

  await expect(page.getByText(directLedWorkspace.projectName).first()).toBeVisible();
  const editorCounts = {
    error: await readCount(page, 'editor-error-count'),
    warning: await readCount(page, 'editor-warning-count'),
    info: await readCount(page, 'editor-info-count'),
  };
  expect(editorCounts.error + editorCounts.warning + editorCounts.info).toBeGreaterThan(0);

  await page.getByRole('button', { name: '분석 보고서 보기' }).click();
  await page.waitForURL('**/report');
  await expect(page.getByText(directLedWorkspace.projectName).first()).toBeVisible();
  await expect.poll(
    () => page.evaluate((key) => Boolean(window.localStorage.getItem(key)), reportSnapshotKey)
  ).toBe(true);

  const reportCounts = {
    error: await readCount(page, 'report-error-count'),
    warning: await readCount(page, 'report-warning-count'),
  };

  expect(reportCounts.error).toBe(editorCounts.error);
  expect(reportCounts.warning).toBe(editorCounts.warning);
  expect(errors).toEqual([]);
});
