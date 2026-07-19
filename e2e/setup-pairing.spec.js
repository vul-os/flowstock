/**
 * First run, and pairing a second branch — done entirely through the browser,
 * with no API calls at all. This is the path a shop owner actually walks:
 * create a workspace on the first machine, reveal the shared secret in
 * Settings, then type it into the second machine's "Join a branch" tab.
 */

import { test, expect } from "@playwright/test";
import { FlowStockNode } from "./helpers/node.js";

async function open(browser, node, route = "/") {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${node.baseURL}/#${route}`, {
    waitUntil: "domcontentloaded",
  });
  return { ctx, page };
}

test.describe("first run and pairing", () => {
  test.slow();

  let a, b;

  test.beforeEach(async () => {
    [a, b] = await Promise.all([FlowStockNode.start(), FlowStockNode.start()]);
  });

  test.afterEach(async () => {
    await Promise.all([a?.stop(), b?.stop()]);
  });

  test("a fresh install offers setup and creates a workspace", async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser, a);

    await expect(page.getByText("First run")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Welcome to FlowStock/ }),
    ).toBeVisible();

    await page.locator("#business").fill("Khumalo Hardware");
    await page.locator("#branch").fill("Head Office");
    await page.getByRole("button", { name: "Create workspace" }).click();

    // The setup screen gives way to the app itself.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Khumalo Hardware").first()).toBeVisible();

    const boot = await a.bootstrap();
    expect(boot).toMatchObject({
      initialized: true,
      business_name: "Khumalo Hardware",
      branch_name: "Head Office",
    });

    // Setup does not come back on reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("First run")).toBeHidden();
    await ctx.close();
  });

  test("a second branch joins using the secret shown in the first branch's settings", async ({
    browser,
  }) => {
    // ── device one: create the workspace and publish a secret ─────────────
    const first = await open(browser, a);
    await first.page.locator("#business").fill("Khumalo Hardware");
    await first.page.locator("#branch").fill("Head Office");
    await first.page.getByRole("button", { name: "Create workspace" }).click();
    await expect(first.page.getByRole("heading", { level: 1 })).toBeVisible();

    await first.page.goto(`${a.baseURL}/#/settings`, {
      waitUntil: "domcontentloaded",
    });
    await first.page
      .getByLabel("Accept sync connections from other devices")
      .check();
    await first.page.getByRole("button", { name: "Generate" }).click();
    await first.page
      .getByRole("button", { name: "Save sync settings" })
      .click();

    // The banner confirms this device is now reachable by other branches.
    await expect(
      first.page.getByText("Accepting sync connections"),
    ).toBeVisible();
    const secret = await first.page.locator("#sync_secret").inputValue();
    expect(secret).not.toBe("");

    // ── device two: join with it ──────────────────────────────────────────
    const second = await open(browser, b);
    await second.page.getByRole("tab", { name: "Join a branch" }).click();
    await second.page.locator("#join-branch").fill("Cape Town");
    await second.page.locator("#join-url").fill(a.baseURL);
    await second.page.locator("#join-secret").fill(secret);
    await second.page.getByRole("button", { name: "Join workspace" }).click();

    // It lands in the shared workspace, not a new one.
    await expect(second.page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(second.page.getByText("Cape Town").first()).toBeVisible();

    const [bootA, bootB] = await Promise.all([a.bootstrap(), b.bootstrap()]);
    expect(bootB.org_id).toBe(bootA.org_id);
    expect(bootB.branch_name).toBe("Cape Town");

    // Both branches now appear in the second device's Settings.
    await second.page.goto(`${b.baseURL}/#/settings`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      second.page.getByRole("row").filter({ hasText: "Head Office" }),
    ).toBeVisible();
    await expect(
      second.page.getByRole("row").filter({ hasText: "Cape Town" }),
    ).toBeVisible();

    // And each side holds the other's enrolled key.
    expect((await a.peers())[0].has_key).toBe(true);
    expect((await b.peers())[0].has_key).toBe(true);

    await Promise.all([first.ctx.close(), second.ctx.close()]);
  });
});
