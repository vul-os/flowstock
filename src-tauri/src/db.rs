//! Schema + synced-table registry.
//!
//! Every synced table shares the same envelope: `id TEXT PRIMARY KEY`,
//! `hlc TEXT` (last-writer timestamp), `deleted INTEGER` (soft delete so
//! deletions replicate). Domain columns are declared in [`TABLES`]; the store
//! uses the registry to build upserts and serialize rows, so adding a table is
//! a one-line change.
//!
//! `stock_movements` is **insert-only**: rows are immutable facts and merge by
//! set-union, which is what makes offline multi-branch stock safe.

use rusqlite::Connection;

#[derive(Clone, Copy, PartialEq)]
pub enum ColKind {
    Text,
    Real,
    Int,
}

pub struct TableDef {
    pub name: &'static str,
    pub cols: &'static [(&'static str, ColKind)],
    /// Insert-only tables never update or soft-delete; ops merge by union.
    pub insert_only: bool,
}

use ColKind::{Int, Real, Text};

pub const TABLES: &[TableDef] = &[
    TableDef {
        name: "branches",
        cols: &[("name", Text), ("code", Text), ("address", Text), ("is_active", Int), ("created_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "categories",
        cols: &[("name", Text)],
        insert_only: false,
    },
    TableDef {
        name: "products",
        cols: &[("name", Text), ("description", Text), ("category_id", Text), ("product_data", Text), ("created_at", Text), ("updated_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "product_variants",
        cols: &[("product_id", Text), ("sku", Text), ("name", Text), ("price", Real), ("cost_price", Real), ("reorder_point", Real), ("attributes", Text)],
        insert_only: false,
    },
    TableDef {
        name: "services",
        cols: &[("name", Text), ("description", Text), ("hourly_rate", Real), ("created_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "customers",
        cols: &[("name", Text), ("company_name", Text), ("email", Text), ("phone", Text), ("billing_address", Text), ("shipping_address", Text), ("tax_number", Text), ("payment_terms", Text), ("credit_limit", Real), ("notes", Text), ("is_active", Int)],
        insert_only: false,
    },
    TableDef {
        name: "suppliers",
        cols: &[("name", Text), ("company_name", Text), ("email", Text), ("phone", Text), ("address", Text), ("tax_number", Text), ("payment_terms", Text), ("notes", Text), ("is_active", Int)],
        insert_only: false,
    },
    TableDef {
        name: "orders",
        cols: &[("branch_id", Text), ("customer_id", Text), ("order_number", Text), ("order_date", Text), ("due_date", Text), ("payment_terms", Text), ("status", Text), ("subtotal", Real), ("total_amount", Real), ("notes", Text), ("created_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "order_items",
        cols: &[("order_id", Text), ("product_variant_id", Text), ("quantity", Real), ("unit_price", Real), ("total_price", Real)],
        insert_only: false,
    },
    TableDef {
        name: "order_services",
        cols: &[("order_id", Text), ("service_id", Text), ("hours", Real), ("hourly_rate", Real), ("total_price", Real), ("description", Text)],
        insert_only: false,
    },
    TableDef {
        name: "purchase_orders",
        cols: &[("branch_id", Text), ("supplier_id", Text), ("po_number", Text), ("order_date", Text), ("expected_delivery_date", Text), ("status", Text), ("subtotal", Real), ("tax_amount", Real), ("total_amount", Real), ("notes", Text), ("created_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "purchase_order_items",
        cols: &[("purchase_order_id", Text), ("item_type", Text), ("product_variant_id", Text), ("service_id", Text), ("quantity", Real), ("unit_price", Real), ("total_price", Real), ("description", Text), ("unit_type", Text), ("received_quantity", Real)],
        insert_only: false,
    },
    TableDef {
        name: "payments",
        cols: &[("party_kind", Text), ("party_id", Text), ("direction", Text), ("amount", Real), ("payment_date", Text), ("method", Text), ("note", Text), ("created_at", Text)],
        insert_only: false,
    },
    TableDef {
        name: "stock_movements",
        cols: &[("variant_id", Text), ("branch_id", Text), ("qty_delta", Real), ("kind", Text), ("ref_kind", Text), ("ref_id", Text), ("note", Text), ("created_by", Text), ("created_at", Text)],
        insert_only: true,
    },
];

pub fn table(name: &str) -> Option<&'static TableDef> {
    TABLES.iter().find(|t| t.name == name)
}

fn sql_type(kind: ColKind) -> &'static str {
    match kind {
        ColKind::Text => "TEXT",
        ColKind::Real => "REAL",
        ColKind::Int => "INTEGER",
    }
}

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = OFF;
         PRAGMA synchronous = NORMAL;",
    )?;

    for t in TABLES {
        let mut cols = String::new();
        for (name, kind) in t.cols {
            cols.push_str(&format!(", {} {}", name, sql_type(*kind)));
        }
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS {t} (
                id TEXT PRIMARY KEY,
                hlc TEXT NOT NULL DEFAULT '',
                deleted INTEGER NOT NULL DEFAULT 0{cols}
             );",
            t = t.name,
            cols = cols
        ))?;
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_movements_variant ON stock_movements(variant_id, branch_id);
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
         );",
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}
