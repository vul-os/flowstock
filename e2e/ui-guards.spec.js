/**
 * Lightweight guards for the class of bug a restyle introduces.
 *
 * The Kraft & Signal redesign touched every page, and the failure mode of a
 * token change is not a crash — it is text the same colour as what is behind
 * it, or a page that only works in one theme. So: walk every route in BOTH
 * themes and assert that headings are actually readable (computed contrast
 * against their real backdrop), that the page rendered content, and that the
 * console stayed clean.
 */

import { test, expect } from "./helpers/fixtures.js";
import {
  seedWorkspace,
  seedProduct,
  seedCustomer,
  seedSupplier,
} from "./helpers/seed.js";

const ROUTES = [
  "/",
  "/products",
  "/stock",
  "/services",
  "/orders",
  "/purchase-orders",
  "/partners",
  "/creditors-debtors",
  "/reports",
  "/reports/sales",
  "/reports/inventory-valuation",
  "/settings",
];

/**
 * Runs in the browser: for every heading, resolve the colour actually painted
 * behind it and return the WCAG contrast ratio.
 */
const CONTRAST_PROBE = () => {
  const parse = (c) => {
    const m = c.match(
      /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
    );
    return m
      ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
      : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  // The colour painted behind an element: first opaque ancestor background,
  // compositing any translucent ones on top of it.
  const backdrop = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      stack.push(c);
      if (c.a === 1) break;
    }
    let base = stack.pop() || { r: 255, g: 255, b: 255, a: 1 };
    while (stack.length) base = over(stack.pop(), base);
    return base;
  };

  const out = [];
  for (const el of document.querySelectorAll("h1, h2, h3")) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const text = (el.textContent || "").trim();
    if (!text || rect.width === 0 || rect.height === 0) continue;
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      +style.opacity === 0
    )
      continue;
    const bg = backdrop(el);
    const fg = parse(style.color);
    if (!fg) continue;
    const composited = over(fg, bg);
    const [l1, l2] = [lum(composited), lum(bg)].sort((a, b) => b - a);
    out.push({
      text: text.slice(0, 60),
      tag: el.tagName,
      color: style.color,
      background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      ratio: +((l1 + 0.05) / (l2 + 0.05)).toFixed(2),
    });
  }
  return out;
};

/** Enough data that every page has something to render. */
async function seedEverything(node) {
  const ws = await seedWorkspace(node, { extraBranches: ["Cape Town"] });
  const item = await seedProduct(node);
  await seedCustomer(node);
  await seedSupplier(node);
  await node.putRow("services", {
    name: "Delivery",
    description: "Local delivery",
    hourly_rate: 350,
    created_at: new Date().toISOString(),
  });
  await node.adjustStock({
    variantId: item.variantId,
    branchId: ws.branches[ws.branch],
    qtyDelta: 12,
    note: "opening stock",
  });
  return ws;
}

for (const theme of ["light", "dark"]) {
  test.describe(`${theme} theme`, () => {
    test.slow();

    test(`every route renders readable headings with a clean console`, async ({
      app,
      node,
    }) => {
      await seedEverything(node);
      const { page, consoleErrors, pageErrors } = app;

      await page.addInitScript((t) => {
        window.localStorage.setItem("flowstock-theme", t);
      }, theme);

      const problems = [];

      for (const route of ROUTES) {
        await app.goto(route);
        // Wait for the shell rather than a fixed delay.
        await page.waitForSelector("h1", { timeout: 15000 });
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${theme}\\b`),
        );

        // The page actually painted something.
        const textLength = await page.evaluate(
          () => document.body.innerText.trim().length,
        );
        if (textLength < 100) {
          problems.push(`${route}: rendered only ${textLength} chars of text`);
        }

        // No invisible text: headings must clear the WCAG large-text bar.
        const headings = await page.evaluate(CONTRAST_PROBE);
        if (headings.length === 0)
          problems.push(`${route}: no visible headings`);
        for (const h of headings) {
          if (h.ratio < 3) {
            problems.push(
              `${route}: ${h.tag} "${h.text}" contrast ${h.ratio}:1 (${h.color} on ${h.background})`,
            );
          }
        }
      }

      expect(
        problems,
        `readability problems in ${theme} theme:\n${problems.join("\n")}`,
      ).toEqual([]);

      // Console errors are reported with their route context by the loop above
      // only implicitly, so surface them plainly here.
      expect(pageErrors).toEqual([]);
      expect(consoleErrors.filter((e) => !/favicon/i.test(e))).toEqual([]);
    });
  });
}

test.describe("theme switching", () => {
  test("the toggle flips the document theme and persists it", async ({
    app,
    node,
  }) => {
    await seedWorkspace(node, { extraBranches: [] });
    const page = await app.goto("/");

    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(
      await page.evaluate(() => localStorage.getItem("flowstock-theme")),
    ).toBe("dark");

    // It survives a reload — the setting is stored, not just applied.
    await app.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});

test.describe("navigation", () => {
  test("every sidebar link reaches its page", async ({ app, node }) => {
    await seedWorkspace(node, { extraBranches: [] });
    const page = await app.goto("/");

    const links = [
      ["Dashboard", "/"],
      ["Products", "/products"],
      ["Stock", "/stock"],
      ["Orders", "/orders"],
      ["Purchase Orders", "/purchase-orders"],
      ["Services", "/services"],
      ["Partners", "/partners"],
      ["Creditors & Debtors", "/creditors-debtors"],
      ["Reports", "/reports"],
      ["Settings", "/settings"],
    ];

    for (const [name, path] of links) {
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`#${path.replace(/[/&]/g, "\\$&")}$`),
      );
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("an unknown route shows the not-found page rather than a blank screen", async ({
    app,
    node,
  }) => {
    await seedWorkspace(node, { extraBranches: [] });
    const page = await app.goto("/does-not-exist");
    await expect(page.locator("body")).toContainText(/not found/i);
  });
});
