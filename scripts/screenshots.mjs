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
 *
 * Every capture is verified before the run is called a success: the screen has
 * to mount, raise no uncaught page error, and produce an image too large to be
 * a flat blank. A run with any failure exits non-zero and names the screens.
 * This is not belt-and-braces — an earlier version reported ten green ticks
 * while writing fourteen blank files, which then got committed.
 */

import { chromium } from "playwright";
import { mkdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const THEME = process.env.FLOWSTOCK_THEME === "dark" ? "dark" : "light";
const OUT_DIR =
  THEME === "dark"
    ? resolve(ROOT, "docs", "screenshots", "dark")
    : resolve(ROOT, "docs", "screenshots");
const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
const VIEWPORT = { width: 1440, height: 900 };

// A 1440×900 PNG of one flat background colour compresses to about 7 KB; a real
// screen is 90–200 KB. Anything under this floor rendered nothing, whatever the
// DOM claimed.
const MIN_BYTES = 20_000;
// A rendered screen carries the nav chrome plus its own content. The shell
// alone is ~1.3 K characters, so this only catches a page that failed to mount.
const MIN_TEXT = 400;

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
    console.log("  dev server already running — reusing it");
    return () => {};
  }
  console.log("  starting vite dev server (demo mode)...");
  const proc = spawn("npx", ["vite", "--port", "5173", "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", (d) => process.stderr.write(`  [vite] ${d}`));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(400);
    if (await reachable()) return () => proc.kill("SIGTERM");
  }
  proc.kill("SIGTERM");
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
    localStorage.setItem("flowstock-theme", theme);
  }, THEME);
  const page = await ctx.newPage();

  // Every uncaught React/runtime error on the page, collected per shot. Without
  // this a crashed screen is captured as a blank image and reported as a tick.
  let pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message || String(e)));

  const failures = [];

  async function shot(hash, name, prepare) {
    pageErrors = [];

    // Navigate, then force a real reload. `goto` between two URLs that differ
    // only in their hash is a same-document navigation: the app is not
    // re-executed. That is how a single crashed screen used to poison every
    // shot after it — the dead app stayed mounted and each subsequent capture
    // was the same blank page. Reloading boots the app fresh at this route, so
    // a failure is contained to the screen that caused it.
    await page.goto(`${BASE_URL}/#${hash}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });

    let mounted = true;
    try {
      await page.waitForFunction(
        (min) => document.body.innerText.length > min,
        MIN_TEXT,
        { timeout: 15000 },
      );
    } catch {
      // Deliberately not swallowed — this used to be `.catch(() => {})`, which
      // turned "the page never rendered" into "carry on and screenshot it".
      mounted = false;
    }

    await sleep(1100); // charts/animations settle
    if (prepare) await prepare();
    await page.screenshot({
      path: resolve(OUT_DIR, `${name}.png`),
      fullPage: false,
    });

    const bytes = statSync(resolve(OUT_DIR, `${name}.png`)).size;
    const why = [];
    if (!mounted) why.push(`never rendered (<${MIN_TEXT} chars of text)`);
    if (bytes < MIN_BYTES) why.push(`blank image (${bytes} bytes)`);
    if (pageErrors.length) why.push(`page error: ${pageErrors[0]}`);

    if (why.length) {
      failures.push({ name, hash, why });
      console.log(`  ✗  ${name}.png — ${why.join("; ")}`);
    } else {
      console.log(`  ✓  ${name}.png`);
    }
  }

  await shot("/", "hero");
  await shot("/products", "products");
  await shot("/stock", "stock");
  await shot("/orders", "orders");
  await shot("/purchase-orders", "purchase_orders");
  await shot("/partners", "partners");
  await shot("/creditors-debtors", "creditors_debtors");
  await shot("/reports/sales", "report_sales");
  await shot("/reports/inventory-valuation", "report_valuation");
  await shot("/settings", "settings", async () => {
    // Bring the Sync section into view — decentralized branch sync is the
    // headline feature, so the settings shot should show it.
    await page
      .getByText("This device", { exact: true })
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await sleep(400);
  });

  await browser.close();
  stopVite();

  if (failures.length) {
    console.error(
      `\n${failures.length} of 10 screenshots failed — docs/screenshots is NOT updated correctly:\n`,
    );
    for (const f of failures) {
      console.error(`  ${f.name}.png  (#${f.hash})`);
      for (const w of f.why) console.error(`      ${w}`);
    }
    console.error(
      "\nThese files are on disk but wrong. Fix the pages, then re-run.\n",
    );
    process.exit(1);
  }

  console.log(`\nDone! ${OUT_DIR} — all screens verified non-blank.\n`);
}

run().catch((err) => {
  console.error("\nScreenshotter error:", err.message);
  process.exit(1);
});
