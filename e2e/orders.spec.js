import { test, expect, chooseOption } from "./helpers/fixtures.js";
import {
  seedWorkspace,
  seedProduct,
  seedCustomer,
  seedSupplier,
  onHand,
} from "./helpers/seed.js";

test.describe("orders", () => {
  test("confirming a sales order deducts stock through the ledger", async ({
    app,
    node,
  }) => {
    const { branches, branch } = await seedWorkspace(node, {
      extraBranches: [],
    });
    const item = await seedProduct(node);
    await seedCustomer(node);
    await node.adjustStock({
      variantId: item.variantId,
      branchId: branches[branch],
      qtyDelta: 12,
      note: "opening stock",
    });

    const page = await app.goto("/orders");
    await page.getByRole("button", { name: "Create Order" }).click();
    const dialog = page.getByRole("dialog");

    await chooseOption(
      page,
      dialog.getByRole("combobox").first(),
      /Acme Builders/,
    );
    await dialog.getByRole("button", { name: "Add Product" }).click();

    // The line's product picker is the combobox added by "Add Product".
    await chooseOption(
      page,
      dialog.getByRole("combobox").nth(1),
      /Claw Hammer/,
    );
    const lineQty = dialog.getByRole("spinbutton").first();
    await lineQty.fill("3");

    await dialog.getByRole("button", { name: "Create Order" }).click();
    await expect(dialog).toBeHidden();

    // Draft orders have not touched stock yet.
    const orderRow = page.getByRole("row").filter({ hasText: "draft" });
    await expect(orderRow).toBeVisible();
    expect(
      (await node.rows("stock_movements")).filter((m) => m.kind === "sale"),
    ).toHaveLength(0);

    // Confirming is what moves stock.
    await orderRow
      .getByRole("button", { name: "Confirm (deducts stock)" })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "confirmed" }),
    ).toBeVisible();

    const sales = (await node.rows("stock_movements")).filter(
      (m) => m.kind === "sale",
    );
    expect(sales).toHaveLength(1);
    expect(sales[0].qty_delta).toBe(-3);
    expect(sales[0].ref_kind).toBe("order");
    expect(
      onHand(await node.stockLevels(), item.variantId, branches[branch]),
    ).toBe(9);

    // And the ledger page shows the deduction as an ordinary append-only fact.
    await app.goto("/stock");
    const ledgerRow = page
      .getByRole("table")
      .nth(1)
      .getByRole("row")
      .filter({ hasText: "Sale" });
    await expect(ledgerRow).toContainText("-3");
    await expect(
      page
        .getByRole("table")
        .first()
        .getByRole("row")
        .filter({ hasText: "HAM-16" }),
    ).toContainText("9");
  });

  test("receiving a purchase order appends receipts instead of mutating a counter", async ({
    app,
    node,
  }) => {
    const { branches, branch } = await seedWorkspace(node, {
      extraBranches: [],
    });
    const item = await seedProduct(node);
    await seedSupplier(node);

    const page = await app.goto("/purchase-orders");
    await page.getByRole("button", { name: "Create Order" }).click();
    const dialog = page.getByRole("dialog");

    await chooseOption(
      page,
      dialog.getByRole("combobox").first(),
      /Bolt Depot/,
    );
    await dialog.getByRole("button", { name: "Add Product" }).click();
    await chooseOption(
      page,
      dialog.getByRole("combobox").nth(1),
      /Claw Hammer/,
    );
    // The PO dialog's line labels are not wired to their inputs, so go by role.
    await dialog.getByRole("spinbutton").first().fill("10");
    await dialog.getByRole("spinbutton").nth(1).fill("120");
    await dialog.getByRole("button", { name: "Create Order" }).click();
    await expect(dialog).toBeHidden();

    // draft → sent, then goods start arriving.
    const poRow = () =>
      page
        .getByRole("table")
        .first()
        .getByRole("row")
        .filter({ hasText: "PO-" });
    await poRow().getByRole("button", { name: "Send" }).click();
    await expect(poRow()).toContainText("sent");

    // ── first delivery: 3 of 10 ───────────────────────────────────────────
    await poRow().getByRole("button", { name: "Receive goods" }).click();
    const receive = page.getByRole("dialog");
    await expect(receive.getByText(/Receive goods —/)).toBeVisible();
    // The field pre-fills with the full outstanding quantity; this is a part load.
    await receive.getByRole("spinbutton").first().fill("3");
    await receive.getByRole("button", { name: "Receive into stock" }).click();
    await expect(receive).toBeHidden();
    await expect(poRow()).toContainText("partially received");

    // ── second delivery: 4 more ───────────────────────────────────────────
    await poRow().getByRole("button", { name: "Receive goods" }).click();
    await page.getByRole("dialog").getByRole("spinbutton").first().fill("4");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Receive into stock" })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(poRow()).toContainText("partially received");

    // The UI shows the running total as the SUM of receipts.
    await poRow().getByRole("button").first().click(); // expand
    await expect(page.getByText("7 / 10")).toBeVisible();

    // ── the actual claim: two immutable receipt rows, not one mutated field ──
    const receipts = await node.rows("po_receipts");
    expect(receipts).toHaveLength(2);
    expect(receipts.map((r) => r.qty).sort((x, y) => x - y)).toEqual([3, 4]);
    expect(receipts.reduce((sum, r) => sum + r.qty, 0)).toBe(7);

    // received_quantity is derived at read time — it is not a stored column.
    const items = await node.rows("purchase_order_items");
    expect(items).toHaveLength(1);
    expect(items[0].received_quantity).toBe(7);

    // Each receipt also appended its own stock movement.
    const received = (await node.rows("stock_movements")).filter(
      (m) => m.kind === "receive" && m.ref_kind === "purchase_order",
    );
    expect(received).toHaveLength(2);
    expect(
      onHand(await node.stockLevels(), item.variantId, branches[branch]),
    ).toBe(7);

    // Over-receipt is refused, and refusing it must not drop the ledger rows.
    const poId = (await node.rows("purchase_orders"))[0].id;
    await expect(
      node.req("POST", "/api/purchase-orders/receive", {
        po_id: poId,
        receipts: [{ item_id: items[0].id, qty: 4 }],
      }),
    ).rejects.toThrow(/exceed ordered quantity/);
    expect(await node.rows("po_receipts")).toHaveLength(2);
  });
});
