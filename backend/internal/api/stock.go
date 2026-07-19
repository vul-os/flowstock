package api

import (
	"fmt"
	"net/http"

	"flowstock/backend/internal/store"
)

// movement writes one immutable ledger row. Stock is only ever changed here.
func (s *Server) movement(variantID, branchID string, qtyDelta float64, kind, refKind, refID, note string) error {
	_, err := s.Store.LocalPut("stock_movements", store.NewID(), map[string]any{
		"variant_id": variantID,
		"branch_id":  branchID,
		"qty_delta":  qtyDelta,
		"kind":       kind,
		"ref_kind":   refKind,
		"ref_id":     refID,
		"note":       note,
		"created_by": s.Store.GetSetting("branch_name"),
		"created_at": nowISO(),
	}, false)
	return err
}

// receipt writes one immutable goods-receipt fact against a PO line item. The
// line's received quantity is the SUM of these rows, so receipts from different
// branches merge by union instead of clobbering an LWW counter.
func (s *Server) receipt(poID, itemID, variantID, branchID string, qty float64, note string) error {
	_, err := s.Store.LocalPut("po_receipts", store.NewID(), map[string]any{
		"purchase_order_id": poID,
		"po_item_id":        itemID,
		"variant_id":        variantID,
		"branch_id":         branchID,
		"qty":               qty,
		"note":              note,
		"created_by":        s.Store.GetSetting("branch_name"),
		"created_at":        nowISO(),
	}, false)
	return err
}

func (s *Server) branchID() string { return s.Store.GetSetting("branch_id") }

func (s *Server) handleStockLevels(w http.ResponseWriter, r *http.Request) {
	levels, err := s.Store.StockLevels()
	if err != nil {
		serverError(w, err)
		return
	}
	if levels == nil {
		levels = []store.StockLevel{}
	}
	writeJSON(w, levels)
}

func (s *Server) handleAdjustStock(w http.ResponseWriter, r *http.Request) {
	var body struct {
		VariantID string  `json:"variant_id"`
		BranchID  string  `json:"branch_id"`
		QtyDelta  float64 `json:"qty_delta"`
		Kind      string  `json:"kind"`
		Note      string  `json:"note"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	if body.Kind != "adjustment" && body.Kind != "count" && body.Kind != "receive" {
		badRequest(w, fmt.Errorf("kind must be adjustment, count or receive"))
		return
	}
	if body.QtyDelta == 0 {
		badRequest(w, fmt.Errorf("quantity delta may not be zero"))
		return
	}
	if body.BranchID == "" {
		body.BranchID = s.branchID()
	}
	if err := s.movement(body.VariantID, body.BranchID, body.QtyDelta, body.Kind, "manual", "", body.Note); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) handleTransferStock(w http.ResponseWriter, r *http.Request) {
	var body struct {
		VariantID    string  `json:"variant_id"`
		FromBranchID string  `json:"from_branch_id"`
		ToBranchID   string  `json:"to_branch_id"`
		Qty          float64 `json:"qty"`
		Note         string  `json:"note"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	if body.Qty <= 0 {
		badRequest(w, fmt.Errorf("transfer quantity must be positive"))
		return
	}
	if body.FromBranchID == body.ToBranchID {
		badRequest(w, fmt.Errorf("cannot transfer to the same branch"))
		return
	}
	transferID := store.NewID()
	if err := s.movement(body.VariantID, body.FromBranchID, -body.Qty, "transfer_out", "transfer", transferID, body.Note); err != nil {
		serverError(w, err)
		return
	}
	if err := s.movement(body.VariantID, body.ToBranchID, body.Qty, "transfer_in", "transfer", transferID, body.Note); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
