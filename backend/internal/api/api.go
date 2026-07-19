// Package api exposes FlowStock's application HTTP API: generic catalog CRUD,
// stock operations, order/purchase-order workflows, sync settings, and a
// server-sent-events stream that notifies the UI whenever data changes
// (locally or via a sync round).
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"flowstock/backend/internal/store"
	syncpkg "flowstock/backend/internal/sync"
)

// Server holds the app dependencies and the SSE subscriber set.
type Server struct {
	Store   *store.Store
	Sync    *syncpkg.Engine
	Version string

	subsMu sync.Mutex
	subs   map[chan struct{}]bool
}

func New(s *store.Store, sync *syncpkg.Engine, version string) *Server {
	srv := &Server{Store: s, Sync: sync, Version: version, subs: map[chan struct{}]bool{}}
	s.SetOnChange(srv.broadcast)
	return srv
}

// Routes registers every application route on mux. Callers wrap the returned
// handler with auth middleware as needed.
func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/bootstrap", s.handleBootstrap)
	mux.HandleFunc("POST /api/setup", s.handleSetup)
	mux.HandleFunc("POST /api/settings", s.handleUpdateSettings)

	mux.HandleFunc("GET /api/rows/{tbl}", s.handleListRows)
	mux.HandleFunc("POST /api/rows/{tbl}", s.handlePutRow)
	mux.HandleFunc("DELETE /api/rows/{tbl}/{id}", s.handleDeleteRow)

	mux.HandleFunc("GET /api/stock/levels", s.handleStockLevels)
	mux.HandleFunc("POST /api/stock/adjust", s.handleAdjustStock)
	mux.HandleFunc("POST /api/stock/transfer", s.handleTransferStock)

	mux.HandleFunc("POST /api/orders/save", s.handleSaveOrder)
	mux.HandleFunc("POST /api/orders/status", s.handleSetOrderStatus)

	mux.HandleFunc("POST /api/purchase-orders/save", s.handleSavePurchaseOrder)
	mux.HandleFunc("POST /api/purchase-orders/status", s.handleSetPOStatus)
	mux.HandleFunc("POST /api/purchase-orders/receive", s.handleReceivePO)

	mux.HandleFunc("GET /api/sync/settings", s.handleGetSyncSettings)
	mux.HandleFunc("POST /api/sync/settings", s.handleSetSyncSettings)
	mux.HandleFunc("GET /api/sync/secret/new", s.handleNewSecret)
	mux.HandleFunc("GET /api/peers", s.handleListPeers)
	mux.HandleFunc("POST /api/peers", s.handleSavePeer)
	mux.HandleFunc("DELETE /api/peers/{id}", s.handleDeletePeer)
	mux.HandleFunc("POST /api/sync/now", s.handleSyncNow)
	mux.HandleFunc("POST /api/sync/test", s.handleTestPeer)

	mux.HandleFunc("GET /api/events", s.handleEvents)
}

// ── SSE change notifications ───────────────────────────────────────────────────

func (s *Server) broadcast() {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for ch := range s.subs {
		select {
		case ch <- struct{}{}:
		default: // drop if the client is behind; it will refetch on the next tick
		}
	}
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan struct{}, 1)
	s.subsMu.Lock()
	s.subs[ch] = true
	s.subsMu.Unlock()
	defer func() {
		s.subsMu.Lock()
		delete(s.subs, ch)
		s.subsMu.Unlock()
	}()

	fmt.Fprint(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			fmt.Fprint(w, "event: data-changed\ndata: {}\n\n")
			flusher.Flush()
		case <-keepalive.C:
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

// ── bootstrap / setup / settings ──────────────────────────────────────────────

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	get := s.Store.GetSetting
	currencyCode := orDefault(get("currency_code"), "ZAR")
	currencySymbol := orDefault(get("currency_symbol"), "R")
	taxRate, _ := strconv.ParseFloat(orDefault(get("tax_rate"), "15"), 64)
	writeJSON(w, map[string]any{
		"initialized":   get("branch_id") != "",
		"node_id":       s.Store.NodeID(),
		"org_id":        s.Store.OrgID(),
		"branch_id":     get("branch_id"),
		"branch_name":   get("branch_name"),
		"business_name": get("business_name"),
		"currency":      map[string]any{"code": currencyCode, "symbol": currencySymbol},
		"tax_rate":      taxRate,
		"version":       s.Version,
	})
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BusinessName string `json:"business_name"`
		BranchName   string `json:"branch_name"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	if s.Store.GetSetting("branch_id") != "" {
		badRequest(w, fmt.Errorf("workspace already initialized"))
		return
	}
	branchID := store.NewID()
	_ = s.Store.SetSetting("business_name", body.BusinessName)
	_ = s.Store.SetSetting("branch_name", body.BranchName)
	_ = s.Store.SetSetting("branch_id", branchID)
	if s.Store.GetSetting("sync_secret") == "" {
		_ = s.Store.SetSetting("sync_secret", store.NewID()+store.NewID())
	}
	if _, err := s.Store.LocalPut("branches", branchID, map[string]any{
		"name": body.BranchName, "code": "", "address": "", "is_active": 1,
		"created_at": nowISO(),
	}, false); err != nil {
		serverError(w, err)
		return
	}
	s.handleBootstrap(w, r)
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var settings map[string]any
	if err := decode(r, &settings); err != nil {
		badRequest(w, err)
		return
	}
	allowed := map[string]bool{
		"business_name": true, "branch_name": true,
		"currency_code": true, "currency_symbol": true, "tax_rate": true,
	}
	for k, v := range settings {
		if !allowed[k] {
			continue
		}
		_ = s.Store.SetSetting(k, toStr(v))
	}
	s.broadcast()
	writeJSON(w, map[string]any{"ok": true})
}

// ── generic catalog CRUD ──────────────────────────────────────────────────────

func (s *Server) handleListRows(w http.ResponseWriter, r *http.Request) {
	tbl := r.PathValue("tbl")
	rows, err := s.Store.ListRows(tbl, false)
	if err != nil {
		badRequest(w, err)
		return
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	// received_quantity is not stored on the line item; it is derived by SUM
	// over the po_receipts ledger so concurrent branch receipts converge.
	if tbl == "purchase_order_items" {
		if received, err := s.Store.ReceivedByItem(); err == nil {
			for _, row := range rows {
				row["received_quantity"] = received[asString(row["id"])]
			}
		}
	}
	writeJSON(w, rows)
}

func (s *Server) handlePutRow(w http.ResponseWriter, r *http.Request) {
	tbl := r.PathValue("tbl")
	if tbl == "stock_movements" || tbl == "po_receipts" {
		badRequest(w, fmt.Errorf("%s is an append-only ledger written by domain operations only", tbl))
		return
	}
	var body struct {
		ID   string         `json:"id"`
		Data map[string]any `json:"data"`
	}
	if err := decode(r, &body); err != nil {
		badRequest(w, err)
		return
	}
	id := body.ID
	if id == "" {
		id = store.NewID()
	}
	if _, err := s.Store.LocalPut(tbl, id, body.Data, false); err != nil {
		badRequest(w, err)
		return
	}
	row, _ := s.Store.GetRow(tbl, id)
	writeJSON(w, row)
}

func (s *Server) handleDeleteRow(w http.ResponseWriter, r *http.Request) {
	tbl := r.PathValue("tbl")
	id := r.PathValue("id")
	if tbl == "stock_movements" || tbl == "po_receipts" {
		badRequest(w, fmt.Errorf("%s is an immutable ledger", tbl))
		return
	}
	row, err := s.Store.GetRow(tbl, id)
	if err != nil {
		badRequest(w, err)
		return
	}
	if row == nil {
		writeJSON(w, map[string]any{"ok": true})
		return
	}
	delete(row, "id")
	delete(row, "hlc")
	delete(row, "deleted")
	if _, err := s.Store.LocalPut(tbl, id, row, true); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// ── helpers ────────────────────────────────────────────────────────────────

func decode(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func badRequest(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusBadRequest)
}
func serverError(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func toStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "1"
		}
		return "0"
	case nil:
		return ""
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}

func nowISO() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

func asFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int64:
		return float64(x)
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	}
	return 0
}

func asString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", x)
	}
}
