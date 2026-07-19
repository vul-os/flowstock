/**
 * The product's core claim, proven from the browser.
 *
 * Two independent FlowStock instances — separate processes, separate SQLite
 * databases, separate ports, exactly like two shops — are paired over the sync
 * mesh, edited *while apart*, then synced. Afterwards both UIs must show the
 * same world, and no edit may have been lost.
 *
 * Sync is triggered explicitly rather than waiting for the 60s background
 * timer, so these tests are deterministic and fast.
 */

import { test, expect } from "@playwright/test";
import { FlowStockNode, pairNodes, until } from "./helpers/node.js";
import { seedProduct, onHand } from "./helpers/seed.js";

/** A page pointed at a node, with console errors collected. */
async function openApp(browser, node, route = "/") {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() =>
    window.localStorage.setItem("flowstock-theme", "light"),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${node.baseURL}/#${route}`, {
    waitUntil: "domcontentloaded",
  });
  return { ctx, page, errors };
}

/** Create a product straight from the /products UI of whichever node. */
async function addProductViaUI(page, name) {
  await page.getByRole("button", { name: "Add Product" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#product-name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
}

test.describe("two-node sync", () => {
  test.slow(); // two processes, two browser contexts

  let a, b;

  test.beforeEach(async () => {
    [a, b] = await Promise.all([FlowStockNode.start(), FlowStockNode.start()]);
  });

  test.afterEach(async () => {
    await Promise.all([a?.stop(), b?.stop()]);
  });

  test("a second branch pairs into an existing workspace and adopts its data", async ({
    browser,
  }) => {
    await a.setup("Khumalo Hardware", "Head Office");
    const item = await seedProduct(a);
    await a.adjustStock({
      variantId: item.variantId,
      branchId: await a.branchId("Head Office"),
      qtyDelta: 12,
      note: "opening stock",
    });

    // Shared-secret bootstrap → Ed25519 enrolment, exactly what the Setup
    // screen's "Join a branch" tab does.
    await pairNodes(a, b, "Cape Town");

    // The new device adopted the org, not started its own.
    const bootA = await a.bootstrap();
    const bootB = await b.bootstrap();
    expect(bootB.org_id).toBe(bootA.org_id);
    expect(bootB.node_id).not.toBe(bootA.node_id);
    expect(bootB.branch_name).toBe("Cape Town");

    // Both sides enrolled a key for the other — the mesh is mutually authenticated.
    expect((await a.peers())[0]).toMatchObject({
      has_key: true,
      node_id: bootB.node_id,
    });
    expect((await b.peers())[0]).toMatchObject({
      has_key: true,
      node_id: bootA.node_id,
    });

    // And the joining device's UI shows the catalog it pulled down.
    const { ctx, page } = await openApp(browser, b, "/products");
    await expect(
      page.getByRole("row").filter({ hasText: "Claw Hammer" }),
    ).toBeVisible();
    await page.goto(`${b.baseURL}/#/stock`, { waitUntil: "domcontentloaded" });
    await expect(
      page
        .getByRole("table")
        .first()
        .getByRole("row")
        .filter({ hasText: "HAM-16" }),
    ).toContainText("12");
    await ctx.close();
  });

  test("divergent offline edits on both branches converge in the UI", async ({
    browser,
  }) => {
    await a.setup("Khumalo Hardware", "Head Office");
    const item = await seedProduct(a);
    await pairNodes(a, b, "Cape Town");
    await b.syncNow(); // baseline: both know the catalog

    const branchA = await a.branchId("Head Office");
    const branchB = await b.branchId("Cape Town");

    const appA = await openApp(browser, a, "/products");
    const appB = await openApp(browser, b, "/products");

    // ── both devices are edited while apart ───────────────────────────────
    await addProductViaUI(appA.page, "Tape Measure"); // only on A
    await addProductViaUI(appB.page, "Spirit Level"); // only on B

    // Concurrent stock movements at *different* branches …
    await a.adjustStock({
      variantId: item.variantId,
      branchId: branchA,
      qtyDelta: 10,
      note: "A receipt",
    });
    await b.adjustStock({
      variantId: item.variantId,
      branchId: branchB,
      qtyDelta: 7,
      note: "B receipt",
    });
    // … and, the harder case, concurrent movements at the SAME branch. A
    // last-write-wins store would drop one of these.
    await a.adjustStock({
      variantId: item.variantId,
      branchId: branchA,
      qtyDelta: 5,
      note: "A count fix",
    });
    await b.adjustStock({
      variantId: item.variantId,
      branchId: branchA,
      qtyDelta: 3,
      note: "B count fix",
    });

    // Before syncing, each device only knows its own edits.
    expect(
      (await a.rows("products"))
        .filter((p) => !p.deleted)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Claw Hammer", "Tape Measure"]);
    expect(
      (await b.rows("products"))
        .filter((p) => !p.deleted)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Claw Hammer", "Spirit Level"]);

    // ── they meet ─────────────────────────────────────────────────────────
    const results = await b.syncNow();
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[0].pushed).toBeGreaterThan(0);
    expect(results[0].pulled).toBeGreaterThan(0);

    // ── convergence, asserted in both browsers ────────────────────────────
    for (const app of [appA, appB]) {
      await app.page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        app.page.getByRole("row").filter({ hasText: "Claw Hammer" }),
      ).toBeVisible();
      await expect(
        app.page.getByRole("row").filter({ hasText: "Tape Measure" }),
      ).toBeVisible();
      await expect(
        app.page.getByRole("row").filter({ hasText: "Spirit Level" }),
      ).toBeVisible();
    }

    // Every movement survived — union merge, nothing clobbered.
    for (const app of [appA, appB]) {
      await app.page.goto(`${app === appA ? a.baseURL : b.baseURL}/#/stock`, {
        waitUntil: "domcontentloaded",
      });
      const ledger = app.page.getByRole("table").nth(1);
      for (const note of [
        "A receipt",
        "B receipt",
        "A count fix",
        "B count fix",
      ]) {
        await expect(
          ledger.getByRole("row").filter({ hasText: note }),
        ).toBeVisible();
      }
      // Head Office = 10 + 5 + 3 = 18, Cape Town = 7, total 25.
      await expect(
        app.page
          .getByRole("table")
          .first()
          .getByRole("row")
          .filter({ hasText: "HAM-16" }),
      ).toContainText("18");
    }

    // Same numbers on both nodes, derived from the same union of facts.
    const [levelsA, levelsB] = await Promise.all([
      a.stockLevels(),
      b.stockLevels(),
    ]);
    expect(onHand(levelsA, item.variantId, branchA)).toBe(18);
    expect(onHand(levelsA, item.variantId, branchB)).toBe(7);
    expect(onHand(levelsB, item.variantId, branchA)).toBe(18);
    expect(onHand(levelsB, item.variantId, branchB)).toBe(7);

    const movesA = (await a.rows("stock_movements")).map((m) => m.note).sort();
    const movesB = (await b.rows("stock_movements")).map((m) => m.note).sort();
    expect(movesA).toEqual(movesB);
    expect(movesA).toEqual([
      "A count fix",
      "A receipt",
      "B count fix",
      "B receipt",
    ]);

    expect(appA.errors).toEqual([]);
    expect(appB.errors).toEqual([]);
    await Promise.all([appA.ctx.close(), appB.ctx.close()]);
  });

  test("an edit made while a branch is unreachable arrives once it is back", async ({
    browser,
  }) => {
    await a.setup("Khumalo Hardware", "Head Office");
    const item = await seedProduct(a);
    await pairNodes(a, b, "Cape Town");
    await b.syncNow();

    // A goes down — the shop's internet is out.
    await a.proc.kill("SIGTERM");
    await until(async () => a.exited !== undefined, {
      message: "node A to exit",
    });

    // B keeps trading offline. This is the whole point of the product.
    const branchB = await b.branchId("Cape Town");
    await b.adjustStock({
      variantId: item.variantId,
      branchId: branchB,
      qtyDelta: 4,
      note: "sold while offline",
    });
    const failed = await b.syncNow();
    expect(failed[0].ok).toBe(false);

    // Local work is unaffected and still visible.
    const { ctx, page } = await openApp(browser, b, "/stock");
    await expect(
      page
        .getByRole("table")
        .nth(1)
        .getByRole("row")
        .filter({ hasText: "sold while offline" }),
    ).toBeVisible();

    // A comes back on the same data dir and port.
    const revived = await FlowStockNode.start({
      port: a.port,
      dataDir: a.dataDir,
    });
    try {
      const ok = await b.syncNow();
      expect(ok[0]).toMatchObject({ ok: true });
      expect(onHand(await revived.stockLevels(), item.variantId, branchB)).toBe(
        4,
      );
    } finally {
      revived.dataDir = null; // `a.stop()` owns the temp dir
      await revived.stop();
      a.exited = 0;
    }
    await ctx.close();
  });
});
