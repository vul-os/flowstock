/**
 * FlowStock screenshot generator
 *
 * Captures docs/screenshots/*.png at 1440×900 using Playwright (Chromium).
 * Runs against the built-in DEMO MODE (`npm run dev` outside Tauri boots the
 * app with seeded data), so it needs no backend and no setup.
 *
 * Usage:
 *   npx playwright install chromium   # one-time
 *   npm run screenshots               # light theme  -> docs/screenshots/
 *   FLOWSTOCK_THEME=dark npm run screenshots   # -> docs/screenshots/dark/
 *
 * If a dev server is already running at BASE_URL it is reused; otherwise one
 * is started and stopped automatically.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const THEME = process.env.FLOWSTOCK_THEME === 'dark' ? 'dark' : 'light';
const OUT_DIR =
  THEME === 'dark'
    ? resolve(ROOT, 'docs', 'screenshots', 'dark')
    : resolve(ROOT, 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const VIEWPORT = { width: 1440, height: 900 };

mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable() {
  try {
    const res = await fetch(BASE_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function maybeStartVite() {
  if (await reachable()) {
    console.log('  dev server already running — reusing it');
    return () => {};
  }
  console.log('  starting vite dev server (demo mode)...');
  const proc = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => process.stderr.write(`  [vite] ${d}`));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(400);
    if (await reachable()) return () => proc.kill('SIGTERM');
  }
  proc.kill('SIGTERM');
  throw new Error(`vite did not become reachable at ${BASE_URL}`);
}

async function run() {
  console.log(`\nFlowStock screenshotter (${THEME})`);
  console.log(`  BASE_URL : ${BASE_URL}`);
  console.log(`  output   : ${OUT_DIR}\n`);

  const stopVite = await maybeStartVite();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript((theme) => {
    localStorage.setItem('flowstock-theme', theme);
  }, THEME);
  const page = await ctx.newPage();

  async function shot(hash, name, prepare) {
    await page.goto(`${BASE_URL}/#${hash}`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(() => document.body.innerText.length > 300, { timeout: 15000 })
      .catch(() => {});
    await sleep(1100); // charts/animations settle
    if (prepare) await prepare();
    await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage: false });
    console.log(`  ✓  ${name}.png`);
  }

  await shot('/', 'hero');
  await shot('/products', 'products');
  await shot('/stock', 'stock');
  await shot('/orders', 'orders');
  await shot('/purchase-orders', 'purchase_orders');
  await shot('/partners', 'partners');
  await shot('/creditors-debtors', 'creditors_debtors');
  await shot('/reports/sales', 'report_sales');
  await shot('/reports/inventory-valuation', 'report_valuation');
  await shot('/settings', 'settings', async () => {
    // Bring the Sync section into view — decentralized branch sync is the
    // headline feature, so the settings shot should show it.
    await page
      .getByText('This device', { exact: true })
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await sleep(400);
  });

  await browser.close();
  stopVite();
  console.log(`\nDone! Screenshots written to ${OUT_DIR}\n`);
}

run().catch((err) => {
  console.error('\nScreenshotter error:', err.message);
  process.exit(1);
});
