/**
 * Playwright fixtures: a freshly booted FlowStock node per test, and a page
 * already pointed at it.
 *
 * The app uses HashRouter, so routes are `/#/products`, `/#/stock`, …
 */

import { test as base, expect } from "@playwright/test";
import { FlowStockNode } from "./node.js";

export const test = base.extend({
  /** A running node with an empty database. */
  node: async ({}, use) => {
    const node = await FlowStockNode.start();
    try {
      await use(node);
    } finally {
      await node.stop();
    }
  },

  /**
   * Page bound to `node`, with the theme pre-seeded (defaults to light) and
   * console errors collected so specs can assert a clean console.
   */
  app: async ({ page, node }, use) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    // Seed the theme only when nothing is stored yet: this script re-runs on
    // every navigation, and forcing it would clobber a theme the test itself
    // set through the UI.
    await page.addInitScript(
      (theme) => {
        if (!window.localStorage.getItem("flowstock-theme")) {
          window.localStorage.setItem("flowstock-theme", theme);
        }
      },
      process.env.FLOWSTOCK_THEME === "dark" ? "dark" : "light",
    );

    const app = {
      page,
      node,
      consoleErrors,
      pageErrors,
      goto: async (route = "/") => {
        await page.goto(`${node.baseURL}/#${route}`, {
          waitUntil: "domcontentloaded",
        });
        // The shell renders once bootstrap resolves.
        await page.waitForSelector("body");
        return page;
      },
      /** Reload the current route so freshly synced rows are re-read. */
      reload: async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
      },
    };
    await use(app);
  },
});

export { expect };

/** Pick an option from a Radix select trigger (options are portalled to body). */
export async function chooseOption(page, trigger, optionName) {
  await trigger.click();
  await page.getByRole("option", { name: optionName }).first().click();
}
