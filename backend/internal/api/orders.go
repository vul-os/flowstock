package api

import (
	"fmt"
	"net/http"

	"flowstock/backend/internal/store"
)

// putChild writes/soft-deletes order/PO line items so a saved document's
// children mirror the submitted set (delete-missing, then upsert).
func (s *Server) replaceChildren(tbl, parentCol, parentID string, children []map[string]any) error {
	existing, err := s.Store.ListRows(tbl, false)
	if err != nil {
		return err
	}
	keep := map[string]bool{}
	for _, c := range children {
		if id, _ := c["id"].(string); id != "" {
			keep[id] = true
		}
	}
	for _, row := range existing {
		id, _ := row["id"].(string)
		if asString(row[parentCol]) == parentID && !keep[id] {
			payload := stripEnvelope(row)
			if _, err := s.Store.LocalPut(tbl, id, payload, true); err != nil {
				return err
			}
		}
	}
	for _, child := range children {
		id, _ := child["id"].(string)
		if id == "" {
			id = store.NewID()
		}
		payload := stripEnvelope(child)
		payload[parentCol] = parentID
		if _, err := s.Store.LocalPut(tbl, id, payload, false); err != nil {
			return err
		}
	}
	return nil
}

func stripEnvelope(m map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		if k == "id" || k == "hlc" || k == "deleted" {
			continue
		}
		out[k] = v
	}
	return out
}

// ── sales orders ──────────────────────────────────────────────────────────────

func (s *Server) handleSaveOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Order    map[string]any   `json:"order"`
		Items    []map[string]any `json:"items"`
		Services []map[string]any `json:"services"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	order := body.Order
	id, _ := order["id"].(string)
	if id == "" {
		id = store.NewID()
	}

	existing, _ := s.Store.GetRow("orders", id)
	existingStatus := ""
	if existing != nil {
		existingStatus = asString(existing["status"])
	}

	payload := stripEnvelope(order)
	if asString(payload["order_number"]) == "" {
		payload["order_number"] = "ORD-" + id[len(id)-6:]
	}
	if asString(payload["branch_id"]) == "" {
		payload["branch_id"] = s.branchID()
	}
	if asString(payload["created_at"]) == "" {
		payload["created_at"] = nowISO()
	}
	// Status only moves through the status endpoint.
	if existingStatus != "" {
		payload["status"] = existingStatus
	} else if asString(payload["status"]) == "" {
		payload["status"] = "draft"
	}

	if _, err := s.Store.LocalPut("orders", id, payload, false); err != nil {
		badRequest(w, err)
		return
	}

	// Line items are editable only while the order is a draft.
	isDraft := existingStatus == "" || existingStatus == "draft"
	if isDraft {
		if body.Items != nil {
			if err := s.replaceChildren("order_items", "order_id", id, body.Items); err != nil {
				serverError(w, err)
				return
			}
		}
		if body.Services != nil {
			if err := s.replaceChildren("order_services", "order_id", id, body.Services); err != nil {
				serverError(w, err)
				return
			}
		}
	}
	row, _ := s.Store.GetRow("orders", id)
	writeJSON(w, row)
}

func (s *Server) handleSetOrderStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OrderID string `json:"order_id"`
		Status  string `json:"status"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	valid := map[string]bool{"draft": true, "confirmed": true, "paid": true, "cancelled": true}
	if !valid[body.Status] {
		badRequest(w, fmt.Errorf("invalid status: %s", body.Status))
		return
	}
	order, err := s.Store.GetRow("orders", body.OrderID)
	if err != nil || order == nil {
		badRequest(w, fmt.Errorf("order not found"))
		return
	}
	current := asString(order["status"])
	if current == "" {
		current = "draft"
	}
	allowed := map[string][]string{
		"draft":     {"confirmed", "cancelled"},
		"confirmed": {"paid", "cancelled"},
		"paid":      {"cancelled"},
	}
	if !contains(allowed[current], body.Status) {
		badRequest(w, fmt.Errorf("cannot move order from %s to %s", current, body.Status))
		return
	}

	branchID := asString(order["branch_id"])
	if branchID == "" {
		branchID = s.branchID()
	}

	// Confirming deducts stock (once).
	if body.Status == "confirmed" {
		sales, _ := s.Store.MovementsForRef("order", body.OrderID, "sale")
		if len(sales) == 0 {
			items, _ := s.Store.ListRows("order_items", false)
			for _, it := range items {
				if asString(it["order_id"]) != body.OrderID {
					continue
				}
				variant := asString(it["product_variant_id"])
				qty := asFloat(it["quantity"])
				if variant != "" && qty > 0 {
					if err := s.movement(variant, branchID, -qty, "sale", "order", body.OrderID, ""); err != nil {
						serverError(w, err)
						return
					}
				}
			}
		}
	}

	// Cancelling a confirmed/paid order reverses its stock (once).
	if body.Status == "cancelled" && current != "draft" {
		reversals, _ := s.Store.MovementsForRef("order", body.OrderID, "reversal")
		if len(reversals) == 0 {
			sales, _ := s.Store.MovementsForRef("order", body.OrderID, "sale")
			for _, m := range sales {
				variant := asString(m["variant_id"])
				qty := -asFloat(m["qty_delta"])
				if variant != "" && qty != 0 {
					if err := s.movement(variant, branchID, qty, "reversal", "order", body.OrderID, "order cancelled"); err != nil {
						serverError(w, err)
						return
					}
				}
			}
		}
	}

	payload := stripEnvelope(order)
	payload["status"] = body.Status
	if _, err := s.Store.LocalPut("orders", body.OrderID, payload, false); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// ── purchase orders ───────────────────────────────────────────────────────────

func (s *Server) handleSavePurchaseOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PurchaseOrder map[string]any   `json:"purchase_order"`
		Items         []map[string]any `json:"items"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	po := body.PurchaseOrder
	id, _ := po["id"].(string)
	if id == "" {
		id = store.NewID()
	}
	existing, _ := s.Store.GetRow("purchase_orders", id)
	existingStatus := ""
	if existing != nil {
		existingStatus = asString(existing["status"])
	}

	payload := stripEnvelope(po)
	if asString(payload["po_number"]) == "" {
		payload["po_number"] = "PO-" + id[len(id)-6:]
	}
	if asString(payload["branch_id"]) == "" {
		payload["branch_id"] = s.branchID()
	}
	if asString(payload["created_at"]) == "" {
		payload["created_at"] = nowISO()
	}
	if existingStatus != "" {
		payload["status"] = existingStatus
	} else if asString(payload["status"]) == "" {
		payload["status"] = "draft"
	}

	if _, err := s.Store.LocalPut("purchase_orders", id, payload, false); err != nil {
		badRequest(w, err)
		return
	}
	isDraft := existingStatus == "" || existingStatus == "draft"
	if isDraft && body.Items != nil {
		if err := s.replaceChildren("purchase_order_items", "purchase_order_id", id, body.Items); err != nil {
			serverError(w, err)
			return
		}
	}
	row, _ := s.Store.GetRow("purchase_orders", id)
	writeJSON(w, row)
}

func (s *Server) handleSetPOStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		POID   string `json:"po_id"`
		Status string `json:"status"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	po, err := s.Store.GetRow("purchase_orders", body.POID)
	if err != nil || po == nil {
		badRequest(w, fmt.Errorf("purchase order not found"))
		return
	}
	current := asString(po["status"])
	if current == "" {
		current = "draft"
	}
	allowed := map[string][]string{
		"draft": {"sent", "cancelled"},
		"sent":  {"cancelled"},
	}
	if !contains(allowed[current], body.Status) {
		badRequest(w, fmt.Errorf("cannot move purchase order from %s to %s (receiving drives the rest)", current, body.Status))
		return
	}
	payload := stripEnvelope(po)
	payload["status"] = body.Status
	if _, err := s.Store.LocalPut("purchase_orders", body.POID, payload, false); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) handleReceivePO(w http.ResponseWriter, r *http.Request) {
	var body struct {
		POID     string `json:"po_id"`
		Receipts []struct {
			ItemID string  `json:"item_id"`
			Qty    float64 `json:"qty"`
		} `json:"receipts"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	po, err := s.Store.GetRow("purchase_orders", body.POID)
	if err != nil || po == nil {
		badRequest(w, fmt.Errorf("purchase order not found"))
		return
	}
	status := asString(po["status"])
	if status != "sent" && status != "partially_received" {
		badRequest(w, fmt.Errorf("cannot receive against a %s purchase order", status))
		return
	}
	branchID := asString(po["branch_id"])
	if branchID == "" {
		branchID = s.branchID()
	}

	items, _ := s.Store.ListRows("purchase_order_items", false)
	itemByID := map[string]map[string]any{}
	for _, it := range items {
		if asString(it["purchase_order_id"]) == body.POID {
			itemByID[asString(it["id"])] = it
		}
	}

	for _, rc := range body.Receipts {
		if rc.Qty <= 0 {
			continue
		}
		item, ok := itemByID[rc.ItemID]
		if !ok {
			badRequest(w, fmt.Errorf("line item %s not on this purchase order", rc.ItemID))
			return
		}
		if asString(item["item_type"]) != "" && asString(item["item_type"]) != "product" {
			continue // services are not stocked
		}
		variant := asString(item["product_variant_id"])
		ordered := asFloat(item["quantity"])
		already := asFloat(item["received_quantity"])
		if already+rc.Qty > ordered+1e-9 {
			badRequest(w, fmt.Errorf("receiving %.4g would exceed ordered quantity %.4g", already+rc.Qty, ordered))
			return
		}
		if variant == "" {
			continue
		}
		if err := s.movement(variant, branchID, rc.Qty, "receive", "purchase_order", body.POID, ""); err != nil {
			serverError(w, err)
			return
		}
		payload := stripEnvelope(item)
		payload["received_quantity"] = already + rc.Qty
		if _, err := s.Store.LocalPut("purchase_order_items", rc.ItemID, payload, false); err != nil {
			serverError(w, err)
			return
		}
		itemByID[rc.ItemID]["received_quantity"] = already + rc.Qty
	}

	// Recompute PO status from receipts.
	var stockable []map[string]any
	for _, it := range itemByID {
		if asString(it["item_type"]) == "" || asString(it["item_type"]) == "product" {
			stockable = append(stockable, it)
		}
	}
	allReceived := len(stockable) > 0
	anyReceived := false
	for _, it := range stockable {
		if asFloat(it["received_quantity"]) > 0 {
			anyReceived = true
		}
		if asFloat(it["received_quantity"])+1e-9 < asFloat(it["quantity"]) {
			allReceived = false
		}
	}
	newStatus := status
	if allReceived {
		newStatus = "received"
	} else if anyReceived {
		newStatus = "partially_received"
	}
	payload := stripEnvelope(po)
	payload["status"] = newStatus
	if _, err := s.Store.LocalPut("purchase_orders", body.POID, payload, false); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "status": newStatus})
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
