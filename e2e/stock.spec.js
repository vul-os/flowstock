import { test, expect, chooseOption } from "./helpers/fixtures.js";
import { seedWorkspace, seedProduct, onHand } from "./helpers/seed.js";

/** Open the /stock variant picker and choose the seeded variant. */
async function pickVariant(page, dialog, label) {
  await dialog.getByPlaceholder("Search product, variant or SKU").fill(label);
  await dialog
    .getByRole("button", { name: new RegExp(label) })
    .first()
    .click();
}

// /stock renders two tables — "Stock on hand" first, then "Movement ledger".
// Both mention the SKU, so every row assertion is scoped to one of them.
const onHandTable = (page) => page.getByRole("table").first();
const ledgerTable = (page) => page.getByRole("table").nth(1);

test.describe("stock", () => {
  test("recording a movement updates stock on hand and the ledger", async ({
    app,
    node,
  }) => {
    const { branches, branch } = await seedWorkspace(node, {
      extraBranches: [],
    });
    const item = await seedProduct(node);
    const page = await app.goto("/stock");

    await expect(
      page.getByRole("heading", { name: "Stock", level: 1 }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Adjust stock" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Adjust stock")).toBeVisible();

    await pickVariant(page, dialog, "Claw Hammer");
    // Branch defaults to this device's branch and Type defaults to "Goods
    // received" — the common case, left as-is on purpose.
    await dialog.locator("#adj_qty").fill("12");
    await dialog.locator("#adj_note").fill("opening stock");
    await dialog.getByRole("button", { name: "Record" }).click();
    await expect(dialog).toBeHidden();

    // Stock on hand reflects the movement without a reload (SSE-driven refetch).
    const onHandRow = onHandTable(page)
      .getByRole("row")
      .filter({ hasText: "HAM-16" });
    await expect(onHandRow).toContainText("12");

    // The ledger shows it as an append-only fact.
    const ledgerRow = ledgerTable(page)
      .getByRole("row")
      .filter({ hasText: "opening stock" });
    await expect(ledgerRow).toContainText("Goods received");
    await expect(ledgerRow).toContainText("+12");

    // Backed by real rows, and stock-on-hand is derived from them.
    const movements = (await node.rows("stock_movements")).filter(
      (m) => !m.deleted,
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      variant_id: item.variantId,
      branch_id: branches[branch],
      qty_delta: 12,
      kind: "receive",
      note: "opening stock",
    });
    expect(
      onHand(await node.stockLevels(), item.variantId, branches[branch]),
    ).toBe(12);
  });

  test("a transfer between branches produces paired out/in movements", async ({
    app,
    node,
  }) => {
    const { branches, branch } = await seedWorkspace(node, {
      extraBranches: ["Cape Town"],
    });
    const item = await seedProduct(node);
    await node.adjustStock({
      variantId: item.variantId,
      branchId: branches[branch],
      qtyDelta: 12,
      note: "opening stock",
    });

    const page = await app.goto("/stock");
    await page
      .getByRole("button", { name: "Transfer between branches" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Transfer between branches")).toBeVisible();

    await pickVariant(page, dialog, "Claw Hammer");
    // "From" defaults to this device's branch; the "To" list excludes it.
    await chooseOption(page, dialog.locator("#tr_to"), "Cape Town");
    await dialog.locator("#tr_qty").fill("4");
    await dialog.locator("#tr_note").fill("van run");
    await dialog.getByRole("button", { name: "Transfer" }).click();
    await expect(dialog).toBeHidden();

    // Two ledger rows, not one: stock left one branch and arrived at another.
    const outRow = ledgerTable(page)
      .getByRole("row")
      .filter({ hasText: "Transfer out" });
    const inRow = ledgerTable(page)
      .getByRole("row")
      .filter({ hasText: "Transfer in" });
    await expect(outRow).toContainText("-4");
    await expect(outRow).toContainText(branch);
    await expect(inRow).toContainText("+4");
    await expect(inRow).toContainText("Cape Town");

    // On hand: 12 became 8 here and 4 there — total conserved.
    const levels = await node.stockLevels();
    expect(onHand(levels, item.variantId, branches[branch])).toBe(8);
    expect(onHand(levels, item.variantId, branches["Cape Town"])).toBe(4);

    // The pair is one logical event: same ref_id, opposite deltas.
    const transfers = (await node.rows("stock_movements")).filter((m) =>
      ["transfer_in", "transfer_out"].includes(m.kind),
    );
    expect(transfers).toHaveLength(2);
    expect(new Set(transfers.map((m) => m.ref_id)).size).toBe(1);
    expect(transfers.map((m) => m.qty_delta).sort((a, b) => a - b)).toEqual([
      -4, 4,
    ]);
  });
});
