package store

import (
	"database/sql"
	"fmt"
)

// colKind constrains how a JSON value is coerced into SQLite.
type colKind int

const (
	kindText colKind = iota
	kindReal
	kindInt
)

type column struct {
	name string
	kind colKind
}

// tableDef declares one synced domain table. Every synced table shares the
// envelope columns (id, hlc, deleted); domain columns are declared here so the
// store can build upserts and serialize rows generically — adding a table is a
// one-line change.
//
// insertOnly tables (stock_movements) are immutable append-only facts that
// merge by set-union. That is what makes offline multi-branch stock safe: two
// branches that both traded while disconnected simply union their movements.
type tableDef struct {
	name       string
	cols       []column
	insertOnly bool
}

func t(name string, insertOnly bool, cols ...column) tableDef {
	return tableDef{name: name, cols: cols, insertOnly: insertOnly}
}
func txt(n string) column  { return column{n, kindText} }
func real(n string) column { return column{n, kindReal} }
func inte(n string) column { return column{n, kindInt} }

// tables is the synced-table registry.
var tables = []tableDef{
	t("branches", false, txt("name"), txt("code"), txt("address"), inte("is_active"), txt("created_at")),
	t("categories", false, txt("name")),
	t("products", false, txt("name"), txt("description"), txt("category_id"), txt("product_data"), txt("created_at"), txt("updated_at")),
	t("product_variants", false, txt("product_id"), txt("sku"), txt("name"), real("price"), real("cost_price"), real("reorder_point"), txt("attributes")),
	t("services", false, txt("name"), txt("description"), real("hourly_rate"), txt("created_at")),
	t("customers", false, txt("name"), txt("company_name"), txt("email"), txt("phone"), txt("billing_address"), txt("shipping_address"), txt("tax_number"), txt("payment_terms"), real("credit_limit"), txt("notes"), inte("is_active")),
	t("suppliers", false, txt("name"), txt("company_name"), txt("email"), txt("phone"), txt("address"), txt("tax_number"), txt("payment_terms"), txt("notes"), inte("is_active")),
	t("orders", false, txt("branch_id"), txt("customer_id"), txt("order_number"), txt("order_date"), txt("due_date"), txt("payment_terms"), txt("status"), real("subtotal"), real("total_amount"), txt("notes"), txt("created_at")),
	t("order_items", false, txt("order_id"), txt("product_variant_id"), real("quantity"), real("unit_price"), real("total_price")),
	t("order_services", false, txt("order_id"), txt("service_id"), real("hours"), real("hourly_rate"), real("total_price"), txt("description")),
	t("purchase_orders", false, txt("branch_id"), txt("supplier_id"), txt("po_number"), txt("order_date"), txt("expected_delivery_date"), txt("status"), real("subtotal"), real("tax_amount"), real("total_amount"), txt("notes"), txt("created_at")),
	t("purchase_order_items", false, txt("purchase_order_id"), txt("item_type"), txt("product_variant_id"), txt("service_id"), real("quantity"), real("unit_price"), real("total_price"), txt("description"), txt("unit_type"), real("received_quantity")),
	t("payments", false, txt("party_kind"), txt("party_id"), txt("direction"), real("amount"), txt("payment_date"), txt("method"), txt("note"), txt("created_at")),
	t("stock_movements", true, txt("variant_id"), txt("branch_id"), real("qty_delta"), txt("kind"), txt("ref_kind"), txt("ref_id"), txt("note"), txt("created_by"), txt("created_at")),
}

func tableByName(name string) (tableDef, bool) {
	for _, td := range tables {
		if td.name == name {
			return td, true
		}
	}
	return tableDef{}, false
}

// SyncedTables returns the names of all tables that participate in sync.
func SyncedTables() []string {
	out := make([]string, len(tables))
	for i, td := range tables {
		out[i] = td.name
	}
	return out
}

func sqlType(k colKind) string {
	switch k {
	case kindReal:
		return "REAL"
	case kindInt:
		return "INTEGER"
	default:
		return "TEXT"
	}
}

func initSchema(db *sql.DB) error {
	if _, err := db.Exec(`PRAGMA journal_mode = WAL;
		PRAGMA foreign_keys = OFF;
		PRAGMA synchronous = NORMAL;`); err != nil {
		return err
	}

	for _, td := range tables {
		cols := ""
		for _, c := range td.cols {
			cols += fmt.Sprintf(", %s %s", c.name, sqlType(c.kind))
		}
		stmt := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
			id TEXT PRIMARY KEY,
			hlc TEXT NOT NULL DEFAULT '',
			deleted INTEGER NOT NULL DEFAULT 0%s
		);`, td.name, cols)
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("create %s: %w", td.name, err)
		}
	}

	_, err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_movements_variant ON stock_movements(variant_id, branch_id);
		CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
		CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
		CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
		CREATE INDEX IF NOT EXISTS idx_order_services_order ON order_services(order_id);
		CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);

		CREATE TABLE IF NOT EXISTS oplog (
			hlc TEXT PRIMARY KEY,
			node_id TEXT NOT NULL,
			tbl TEXT NOT NULL,
			row_id TEXT NOT NULL,
			deleted INTEGER NOT NULL DEFAULT 0,
			payload TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_oplog_node ON oplog(node_id, hlc);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS peers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			last_sync_at TEXT NOT NULL DEFAULT '',
			last_status TEXT NOT NULL DEFAULT ''
		);`)
	return err
}
