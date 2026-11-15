import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const demoUrl = process.argv[2] ?? 'http://localhost:4173/';
const outDir = new URL('../public/screenshots/', import.meta.url);

const activeFilters = {
  state: { include: [], exclude: [] },
  activity: 'active',
  completion: null,
  category: { include: [], exclude: [] },
  tag: { include: [], exclude: [] },
  tracker: { include: [], exclude: [] },
  location: { include: [], exclude: [] },
  conditions: [],
};
const downloadingFirstSorting = [{ id: 'dlspeed', desc: true }];
const graphFluctuationWaitMs = 12000;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

async function capture(file, contextOptions, prepare, colorScheme = 'dark') {
  const context = await browser.newContext({ colorScheme, ...contextOptions });
  await context.addInitScript(
    ({ filters, sorting }) => {
      localStorage.setItem('slake:filters.v2', JSON.stringify(filters));
      localStorage.setItem('slake:sorting', JSON.stringify(sorting));
    },
    { filters: activeFilters, sorting: downloadingFirstSorting },
  );
  const page = await context.newPage();
  await page.goto(demoUrl);
  await page.locator('[data-hash]').first().waitFor();
  await prepare(page);
  await page.waitForTimeout(graphFluctuationWaitMs);
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.screenshot({ path: new URL(file, outDir).pathname });
  await context.close();
}

async function captureVariant(baseName, contextOptions, prepare) {
  await capture(`${baseName}.png`, contextOptions, prepare, 'dark');
  await capture(`${baseName}-light.png`, contextOptions, prepare, 'light');
}

await captureVariant('wide', { viewport: { width: 1440, height: 900 } }, (page) =>
  page.locator('[data-hash]').first().click(),
);
await captureVariant(
  'narrow',
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  async () => {},
);

await browser.close();
