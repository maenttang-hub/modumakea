import { expect, type Page, test } from '@playwright/test';
import { directLedWorkspace, importedSchematicWorkspace } from './fixtures/workspaces';

const workspaceStorageKey = 'modumake-workspace-v1';
const reportSnapshotKey = 'modumake-report-workspace-snapshot-v1';

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

test('editor loads without browser console errors', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/editor');

  await expect(page.getByText('회로 구조', { exact: true })).toBeVisible();
  await expect(page.getByText('검토 패널', { exact: true })).toBeVisible();
  await expect(titleBarFileButton(page, '파일을 열어주세요')).toBeVisible();
  await expect(page.getByText('KiCad 회로도를 올려서 바로 리뷰 시작')).toBeVisible();
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
  await expect(page.getByText('KiCad 회로도를 올려서 바로 리뷰 시작')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editor shows imported schematic state without the empty file prompt', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkspace(page, importedSchematicWorkspace);

  await page.goto('/editor');

  await expect(page.getByText(importedSchematicWorkspace.projectName).first()).toBeVisible();
  await expect(titleBarFileButton(page, `${importedSchematicWorkspace.projectName}.kicad_sch`)).toBeVisible();
  await expect(page.getByText('파일을 열어주세요')).toHaveCount(0);
  await expect(page.getByText('KiCad 회로도를 올려서 바로 리뷰 시작')).toHaveCount(0);
  expect(errors).toEqual([]);
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
