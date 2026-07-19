package api

import (
	"net/http"
	"testing"
)

// workspace is a set-up node with one branch, one variant and a known opening
// stock position, which most domain assertions start from.
type workspace struct {
	*harness
	branch  string
	variant string
}

func newWorkspace(t *testing.T, opening float64) *workspace {
	t.Helper()
	h := newHarness(t)
	h.setup()
	branch := h.rows("branches")[0]["id"].(string)
	variant := h.putRow("product_variants", `{"data":{"name":"Anvil / L"}}`)
	w := &workspace{harness: h, branch: branch, variant: variant}
	if opening != 0 {
		w.adjust(opening, "receive")
	}
	return w
}

func (w *workspace) adjust(delta float64, kind string) *harness {
	w.t.Helper()
	var out map[string]any
	w.mustJSON(w.do("POST", "/api/stock/adjust", jsonf(map[string]any{
		"variant_id": w.variant, "branch_id": w.branch, "qty_delta": delta, "kind": kind,
	})), &out)
	return w.harness
}

func (w *workspace) onHand() float64 { return stockOnHand(w.t, w.harness, w.variant) }

// ── stock ────────────────────────────────────────────────────────────────────

func TestAdjustStockValidation(t *testing.T) {
	w := newWorkspace(t, 0)
	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"unknown kind", map[string]any{"variant_id": w.variant, "qty_delta": 5, "kind": "sale"}, http.StatusBadRequest},
		{"empty kind", map[string]any{"variant_id": w.variant, "qty_delta": 5}, http.StatusBadRequest},
		{"transfer kind", map[string]any{"variant_id": w.variant, "qty_delta": 5, "kind": "transfer_in"}, http.StatusBadRequest},
		{"zero delta", map[string]any{"variant_id": w.variant, "qty_delta": 0, "kind": "count"}, http.StatusBadRequest},
		{"valid adjustment", map[string]any{"variant_id": w.variant, "qty_delta": 3, "kind": "adjustment"}, http.StatusOK},
		{"valid negative", map[string]any{"variant_id": w.variant, "qty_delta": -1, "kind": "count"}, http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := w.do("POST", "/api/stock/adjust", jsonf(c.body)).Code; got != c.want {
				t.Fatalf("expected %d, got %d", c.want, got)
			}
		})
	}
	// Only the two valid adjustments moved stock, and an omitted branch falls
	// back to this device's own branch.
	if got := w.onHand(); got != 2 {
		t.Fatalf("expected the two valid adjustments to net +2, got %v", got)
	}
	movements := w.rows("stock_movements")
	if len(movements) != 2 {
		t.Fatalf("rejected adjustments must not reach the ledger, got %d rows", len(movements))
	}
	for _, m := range movements {
		if m["branch_id"] != w.branch {
			t.Fatalf("an adjustment with no branch should default to this branch, got %v", m["branch_id"])
		}
	}
}

func TestTransferStock(t *testing.T) {
	w := newWorkspace(t, 10)
	other := w.putRow("branches", `{"data":{"name":"Depot","is_active":1}}`)

	t.Run("rejects invalid transfers", func(t *testing.T) {
		for name, body := range map[string]map[string]any{
			"zero qty":     {"variant_id": w.variant, "from_branch_id": w.branch, "to_branch_id": other, "qty": 0},
			"negative qty": {"variant_id": w.variant, "from_branch_id": w.branch, "to_branch_id": other, "qty": -5},
			"same branch":  {"variant_id": w.variant, "from_branch_id": w.branch, "to_branch_id": w.branch, "qty": 1},
			"both empty":   {"variant_id": w.variant, "qty": 1},
		} {
			if got := w.do("POST", "/api/stock/transfer", jsonf(body)).Code; got != http.StatusBadRequest {
				t.Fatalf("%s: expected 400, got %d", name, got)
			}
		}
		if len(w.rows("stock_movements")) != 1 {
			t.Fatal("rejected transfers must not write ledger rows")
		}
	})

	t.Run("moves stock between branches without creating or destroying it", func(t *testing.T) {
		var out map[string]any
		w.mustJSON(w.do("POST", "/api/stock/transfer", jsonf(map[string]any{
			"variant_id": w.variant, "from_branch_id": w.branch, "to_branch_id": other, "qty": 4,
		})), &out)

		if total := w.onHand(); total != 10 {
			t.Fatalf("a transfer must conserve total stock, got %v", total)
		}
		byBranch := map[string]float64{}
		for _, m := range w.rows("stock_movements") {
			byBranch[m["branch_id"].(string)] += asFloat(m["qty_delta"])
		}
		if byBranch[w.branch] != 6 || byBranch[other] != 4 {
			t.Fatalf("expected 6 here and 4 there, got %v", byBranch)
		}
		// Both legs share one transfer reference, so the pair stays auditable.
		refs := map[string]int{}
		for _, m := range w.rows("stock_movements") {
			if m["ref_kind"] == "transfer" {
				refs[asString(m["ref_id"])]++
			}
		}
		if len(refs) != 1 {
			t.Fatalf("the two legs should share one transfer id, got %v", refs)
		}
		for _, n := range refs {
			if n != 2 {
				t.Fatalf("expected exactly two legs, got %d", n)
			}
		}
	})
}

// ── sales orders ─────────────────────────────────────────────────────────────

// order creates a draft order for qty of the workspace variant and returns its id.
func (w *workspace) order(qty float64) string {
	w.t.Helper()
	var out map[string]any
	w.mustJSON(w.do("POST", "/api/orders/save", jsonf(map[string]any{
		"order": map[string]any{"customer_name": "Wile E."},
		"items": []map[string]any{{"product_variant_id": w.variant, "quantity": qty, "unit_price": 100}},
	})), &out)
	id, _ := out["id"].(string)
	if id == "" {
		w.t.Fatalf("order save returned no id: %v", out)
	}
	return id
}

func (w *workspace) setOrderStatus(id, status string) int {
	w.t.Helper()
	return w.do("POST", "/api/orders/status", jsonf(map[string]any{"order_id": id, "status": status})).Code
}

func TestOrderSaveDefaults(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(2)
	row, _ := w.st.GetRow("orders", id)

	if asString(row["status"]) != "draft" {
		t.Fatalf("a new order should start as a draft, got %v", row["status"])
	}
	if asString(row["order_number"]) == "" {
		t.Fatal("a new order should be given an order number")
	}
	if asString(row["branch_id"]) != w.branch {
		t.Fatalf("a new order should belong to this branch, got %v", row["branch_id"])
	}
	if asString(row["created_at"]) == "" {
		t.Fatal("a new order should be timestamped")
	}
}

func TestOrderStatusTransitions(t *testing.T) {
	cases := []struct {
		from, to string
		want     int
	}{
		{"draft", "confirmed", http.StatusOK},
		{"draft", "cancelled", http.StatusOK},
		{"draft", "paid", http.StatusBadRequest},
		{"draft", "draft", http.StatusBadRequest},
		{"confirmed", "paid", http.StatusOK},
		{"confirmed", "cancelled", http.StatusOK},
		{"confirmed", "draft", http.StatusBadRequest},
		{"confirmed", "confirmed", http.StatusBadRequest},
		{"paid", "cancelled", http.StatusOK},
		{"paid", "confirmed", http.StatusBadRequest},
		{"paid", "draft", http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.from+"->"+c.to, func(t *testing.T) {
			w := newWorkspace(t, 100)
			id := w.order(1)
			// Walk the order up to its starting state.
			for _, step := range map[string][]string{
				"draft":     nil,
				"confirmed": {"confirmed"},
				"paid":      {"confirmed", "paid"},
			}[c.from] {
				if code := w.setOrderStatus(id, step); code != http.StatusOK {
					t.Fatalf("setup transition to %s failed with %d", step, code)
				}
			}
			if got := w.setOrderStatus(id, c.to); got != c.want {
				t.Fatalf("expected %d, got %d", c.want, got)
			}
		})
	}
}

func TestOrderStatusRejectsUnknownStatusAndMissingOrder(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(1)
	for name, status := range map[string]string{
		"invented": "shipped", "empty": "", "capitalised": "Confirmed", "sql-ish": "draft' OR '1'='1",
	} {
		if got := w.setOrderStatus(id, status); got != http.StatusBadRequest {
			t.Fatalf("%s status must be refused, got %d", name, got)
		}
	}
	if got := w.setOrderStatus("no-such-order", "confirmed"); got != http.StatusBadRequest {
		t.Fatalf("a missing order must be refused, got %d", got)
	}
}

func TestConfirmingAnOrderDeductsStockExactlyOnce(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(3)

	if code := w.setOrderStatus(id, "confirmed"); code != http.StatusOK {
		t.Fatalf("confirm failed with %d", code)
	}
	if got := w.onHand(); got != 7 {
		t.Fatalf("confirming should deduct the ordered quantity, got %v", got)
	}
	// Paying must not deduct a second time.
	if code := w.setOrderStatus(id, "paid"); code != http.StatusOK {
		t.Fatalf("paid failed with %d", code)
	}
	if got := w.onHand(); got != 7 {
		t.Fatalf("marking an order paid must not move stock again, got %v", got)
	}
}

func TestCancellingReversesStockExactlyOnce(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(3)
	_ = w.setOrderStatus(id, "confirmed")
	if got := w.onHand(); got != 7 {
		t.Fatalf("precondition: expected 7, got %v", got)
	}

	if code := w.setOrderStatus(id, "cancelled"); code != http.StatusOK {
		t.Fatalf("cancel failed with %d", code)
	}
	if got := w.onHand(); got != 10 {
		t.Fatalf("cancelling a confirmed order should return its stock, got %v", got)
	}
	// A second cancel is refused outright, so no double reversal is possible.
	if code := w.setOrderStatus(id, "cancelled"); code != http.StatusBadRequest {
		t.Fatalf("re-cancelling should be refused, got %d", code)
	}
	if got := w.onHand(); got != 10 {
		t.Fatalf("stock must not move again, got %v", got)
	}
}

// Cancelling a draft never moved stock, so it must not invent a reversal.
func TestCancellingADraftDoesNotTouchStock(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(3)
	if code := w.setOrderStatus(id, "cancelled"); code != http.StatusOK {
		t.Fatalf("cancel failed with %d", code)
	}
	if got := w.onHand(); got != 10 {
		t.Fatalf("cancelling a draft must leave stock alone, got %v", got)
	}
	if len(w.rows("stock_movements")) != 1 {
		t.Fatal("cancelling a draft must not write a reversal")
	}
}

// Status is owned by the status endpoint; a save must never move it.
func TestOrderSaveCannotChangeStatusOrEditConfirmedLines(t *testing.T) {
	w := newWorkspace(t, 10)
	id := w.order(3)
	_ = w.setOrderStatus(id, "confirmed")

	var out map[string]any
	w.mustJSON(w.do("POST", "/api/orders/save", jsonf(map[string]any{
		"order": map[string]any{"id": id, "customer_name": "Wile E.", "status": "paid"},
		"items": []map[string]any{{"product_variant_id": w.variant, "quantity": 999, "unit_price": 100}},
	})), &out)

	if asString(out["status"]) != "confirmed" {
		t.Fatalf("a save must not move the order's status, got %v", out["status"])
	}
	// The line items are frozen, so the confirmed deduction cannot be rewritten
	// after the fact.
	for _, it := range w.rows("order_items") {
		if asString(it["order_id"]) == id && asFloat(it["quantity"]) != 3 {
			t.Fatalf("confirmed order lines must be frozen, got quantity %v", it["quantity"])
		}
	}
	if got := w.onHand(); got != 7 {
		t.Fatalf("stock must be unaffected by the rejected edit, got %v", got)
	}
}

// ── purchase orders ──────────────────────────────────────────────────────────

// purchaseOrder creates a draft PO for qty and returns (poID, itemID).
func (w *workspace) purchaseOrder(qty float64) (string, string) {
	w.t.Helper()
	var out map[string]any
	w.mustJSON(w.do("POST", "/api/purchase-orders/save", jsonf(map[string]any{
		"purchase_order": map[string]any{"supplier_name": "Acme Supply"},
		"items": []map[string]any{
			{"product_variant_id": w.variant, "quantity": qty, "unit_cost": 40, "item_type": "product"},
		},
	})), &out)
	poID := asString(out["id"])
	var itemID string
	for _, it := range w.rows("purchase_order_items") {
		if asString(it["purchase_order_id"]) == poID {
			itemID = asString(it["id"])
		}
	}
	if poID == "" || itemID == "" {
		w.t.Fatalf("purchase order save did not produce a po + line item: %v", out)
	}
	return poID, itemID
}

func (w *workspace) receive(poID, itemID string, qty float64) (int, map[string]any) {
	w.t.Helper()
	rec := w.do("POST", "/api/purchase-orders/receive", jsonf(map[string]any{
		"po_id": poID, "receipts": []map[string]any{{"item_id": itemID, "qty": qty}},
	}))
	out := map[string]any{}
	if rec.Code == http.StatusOK {
		w.mustJSON(rec, &out)
	}
	return rec.Code, out
}

func TestPurchaseOrderStatusTransitions(t *testing.T) {
	cases := []struct {
		from, to string
		want     int
	}{
		{"draft", "sent", http.StatusOK},
		{"draft", "cancelled", http.StatusOK},
		{"draft", "received", http.StatusBadRequest},
		{"draft", "partially_received", http.StatusBadRequest},
		{"sent", "cancelled", http.StatusOK},
		{"sent", "draft", http.StatusBadRequest},
		{"sent", "received", http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.from+"->"+c.to, func(t *testing.T) {
			w := newWorkspace(t, 0)
			poID, _ := w.purchaseOrder(5)
			if c.from == "sent" {
				if code := w.setPOStatus(poID, "sent"); code != http.StatusOK {
					t.Fatalf("setup to sent failed with %d", code)
				}
			}
			if got := w.setPOStatus(poID, c.to); got != c.want {
				t.Fatalf("expected %d, got %d", c.want, got)
			}
		})
	}

	w := newWorkspace(t, 0)
	if got := w.setPOStatus("no-such-po", "sent"); got != http.StatusBadRequest {
		t.Fatalf("a missing purchase order must be refused, got %d", got)
	}
}

func (w *workspace) setPOStatus(id, status string) int {
	w.t.Helper()
	return w.do("POST", "/api/purchase-orders/status", jsonf(map[string]any{"po_id": id, "status": status})).Code
}

func TestReceivingRequiresASentPurchaseOrder(t *testing.T) {
	w := newWorkspace(t, 0)
	poID, itemID := w.purchaseOrder(5)

	if code, _ := w.receive(poID, itemID, 2); code != http.StatusBadRequest {
		t.Fatalf("receiving against a draft must be refused, got %d", code)
	}
	if got := w.onHand(); got != 0 {
		t.Fatalf("a refused receipt must not move stock, got %v", got)
	}

	_ = w.setPOStatus(poID, "cancelled")
	if code, _ := w.receive(poID, itemID, 2); code != http.StatusBadRequest {
		t.Fatalf("receiving against a cancelled purchase order must be refused, got %d", code)
	}
	if code, _ := w.receive("no-such-po", itemID, 2); code != http.StatusBadRequest {
		t.Fatalf("receiving against a missing purchase order must be refused, got %d", code)
	}
}

func TestReceivingMovesStockAndDrivesStatus(t *testing.T) {
	w := newWorkspace(t, 0)
	poID, itemID := w.purchaseOrder(5)
	_ = w.setPOStatus(poID, "sent")

	code, out := w.receive(poID, itemID, 2)
	if code != http.StatusOK {
		t.Fatalf("partial receipt failed with %d", code)
	}
	if out["status"] != "partially_received" {
		t.Fatalf("a partial receipt should mark the po partially received, got %v", out["status"])
	}
	if got := w.onHand(); got != 2 {
		t.Fatalf("receiving should add stock, got %v", got)
	}
	// received_quantity is derived from the ledger, not stored on the line.
	for _, it := range w.rows("purchase_order_items") {
		if asString(it["id"]) == itemID && asFloat(it["received_quantity"]) != 2 {
			t.Fatalf("expected a derived received_quantity of 2, got %v", it["received_quantity"])
		}
	}

	code, out = w.receive(poID, itemID, 3)
	if code != http.StatusOK {
		t.Fatalf("closing receipt failed with %d", code)
	}
	if out["status"] != "received" {
		t.Fatalf("receiving the balance should close the po, got %v", out["status"])
	}
	if got := w.onHand(); got != 5 {
		t.Fatalf("expected the full ordered quantity on hand, got %v", got)
	}
}

func TestReceivingGuardsAgainstOverReceiptAndForeignLines(t *testing.T) {
	w := newWorkspace(t, 0)
	poID, itemID := w.purchaseOrder(5)
	_ = w.setPOStatus(poID, "sent")

	if code, _ := w.receive(poID, itemID, 6); code != http.StatusBadRequest {
		t.Fatalf("over-receiving in one go must be refused, got %d", code)
	}
	if _, _ = w.receive(poID, itemID, 4); w.onHand() != 4 {
		t.Fatalf("precondition: expected 4 received, got %v", w.onHand())
	}
	if code, _ := w.receive(poID, itemID, 2); code != http.StatusBadRequest {
		t.Fatalf("over-receiving cumulatively must be refused, got %d", code)
	}
	if got := w.onHand(); got != 4 {
		t.Fatalf("a refused receipt must not move stock, got %v", got)
	}

	// A line item belonging to another purchase order may not be received here.
	otherPO, otherItem := w.purchaseOrder(5)
	_ = w.setPOStatus(otherPO, "sent")
	if code, _ := w.receive(poID, otherItem, 1); code != http.StatusBadRequest {
		t.Fatalf("a line from another po must be refused, got %d", code)
	}
	if got := w.onHand(); got != 4 {
		t.Fatalf("a refused cross-po receipt must not move stock, got %v", got)
	}
}
