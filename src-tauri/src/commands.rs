//! Tauri command surface. Catalog CRUD goes through the generic
//! `list_rows`/`put_row`/`delete_row` trio; anything that touches stock goes
//! through dedicated commands so movements are only ever written by domain
//! logic. Reports/dashboards are computed client-side from these primitives so
//! the in-browser demo driver can share the exact same code.

use crate::store::{self, StoreError};
use crate::sync::{self, SyncResult};
use crate::AppState;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Arc;
use tauri::State;
use ulid::Ulid;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn obj(v: &Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap_or_default()
}

impl AppState {
    pub fn branch_id(&self) -> String {
        let conn = self.db.lock().unwrap();
        crate::db::get_setting(&conn, "branch_id").unwrap_or_default()
    }

    fn put(&self, tbl: &str, row_id: &str, payload: Value, deleted: bool) -> Result<(), StoreError> {
        let mut conn = self.db.lock().unwrap();
        let mut clock = self.clock.lock().unwrap();
        store::local_put(&mut conn, &mut clock, &self.node_id, tbl, row_id, payload, deleted)?;
        Ok(())
    }

    fn movement(
        &self,
        variant_id: &str,
        branch_id: &str,
        qty_delta: f64,
        kind: &str,
        ref_kind: &str,
        ref_id: &str,
        note: &str,
    ) -> Result<String, StoreError> {
        let id = Ulid::new().to_string();
        self.put(
            "stock_movements",
            &id,
            json!({
                "variant_id": variant_id,
                "branch_id": branch_id,
                "qty_delta": qty_delta,
                "kind": kind,
                "ref_kind": ref_kind,
                "ref_id": ref_id,
                "note": note,
                "created_by": self.branch_name(),
                "created_at": now_iso(),
            }),
            false,
        )?;
        Ok(id)
    }

    fn branch_name(&self) -> String {
        let conn = self.db.lock().unwrap();
        crate::db::get_setting(&conn, "branch_name").unwrap_or_default()
    }

    fn movements_for_ref(&self, ref_kind: &str, ref_id: &str, kind: &str) -> Vec<Value> {
        let conn = self.db.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, variant_id, qty_delta FROM stock_movements WHERE ref_kind = ?1 AND ref_id = ?2 AND kind = ?3")
            .unwrap();
        let rows = stmt
            .query_map([ref_kind, ref_id, kind], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "variant_id": r.get::<_, String>(1)?,
                    "qty_delta": r.get::<_, f64>(2)?,
                }))
            })
            .unwrap();
        rows.filter_map(|r| r.ok()).collect()
    }
}

// ── bootstrap / setup ────────────────────────────────────────────────────────

#[tauri::command]
pub fn bootstrap(state: State<Arc<AppState>>) -> CmdResult<Value> {
    let conn = state.db.lock().unwrap();
    let get = |k: &str| crate::db::get_setting(&conn, k).unwrap_or_default();
    let initialized = !get("branch_id").is_empty();
    Ok(json!({
        "initialized": initialized,
        "node_id": state.node_id,
        "branch_id": get("branch_id"),
        "branch_name": get("branch_name"),
        "business_name": get("business_name"),
        "currency": { "code": if get("currency_code").is_empty() { "ZAR".into() } else { get("currency_code") },
                      "symbol": if get("currency_symbol").is_empty() { "R".into() } else { get("currency_symbol") } },
        "tax_rate": get("tax_rate").parse::<f64>().unwrap_or(15.0),
        "data_version": state.data_version(),
    }))
}

#[tauri::command]
pub fn setup_workspace(
    state: State<Arc<AppState>>,
    business_name: String,
    branch_name: String,
) -> CmdResult<Value> {
    let branch_id = Ulid::new().to_string();
    {
        let conn = state.db.lock().unwrap();
        if !crate::db::get_setting(&conn, "branch_id").unwrap_or_default().is_empty() {
            return Err("workspace already initialized".into());
        }
        crate::db::set_setting(&conn, "business_name", &business_name).map_err(err)?;
        crate::db::set_setting(&conn, "branch_name", &branch_name).map_err(err)?;
        crate::db::set_setting(&conn, "branch_id", &branch_id).map_err(err)?;
        if crate::db::get_setting(&conn, "sync_secret").unwrap_or_default().is_empty() {
            let secret: String = {
                use rand::Rng;
                let mut rng = rand::thread_rng();
                (0..32).map(|_| format!("{:x}", rng.gen_range(0..16u8))).collect()
            };
            crate::db::set_setting(&conn, "sync_secret", &secret).map_err(err)?;
        }
    }
    state
        .put(
            "branches",
            &branch_id,
            json!({ "name": branch_name, "code": "", "address": "", "is_active": 1, "created_at": now_iso() }),
            false,
        )
        .map_err(err)?;
    state.bump_data_version();
    bootstrap(state)
}

#[tauri::command]
pub fn update_settings(state: State<Arc<AppState>>, settings: Value) -> CmdResult<()> {
    let allowed = ["business_name", "branch_name", "currency_code", "currency_symbol", "tax_rate"];
    let conn = state.db.lock().unwrap();
    for (k, v) in obj(&settings) {
        if allowed.contains(&k.as_str()) {
            let s = v.as_str().map(|s| s.to_string()).unwrap_or_else(|| v.to_string());
            crate::db::set_setting(&conn, &k, &s).map_err(err)?;
        }
    }
    drop(conn);
    state.bump_data_version();
    Ok(())
}

// ── generic catalog CRUD ─────────────────────────────────────────────────────

#[tauri::command]
pub fn list_rows(state: State<Arc<AppState>>, tbl: String) -> CmdResult<Vec<Value>> {
    let conn = state.db.lock().unwrap();
    store::list_rows(&conn, &tbl, false).map_err(err)
}

#[tauri::command]
pub fn put_row(state: State<Arc<AppState>>, tbl: String, id: Option<String>, data: Value) -> CmdResult<Value> {
    if tbl == "stock_movements" {
        return Err("stock movements are written by stock commands only".into());
    }
    let row_id = id.unwrap_or_else(|| Ulid::new().to_string());
    state.put(&tbl, &row_id, data, false).map_err(err)?;
    state.bump_data_version();
    let conn = state.db.lock().unwrap();
    store::get_row(&conn, &tbl, &row_id)
        .map_err(err)?
        .ok_or_else(|| "row vanished".into())
}

#[tauri::command]
pub fn delete_row(state: State<Arc<AppState>>, tbl: String, id: String) -> CmdResult<()> {
    if tbl == "stock_movements" {
        return Err("stock movements are immutable".into());
    }
    let existing = {
        let conn = state.db.lock().unwrap();
        store::get_row(&conn, &tbl, &id).map_err(err)?
    };
    let Some(mut row) = existing else { return Ok(()) };
    if let Some(o) = row.as_object_mut() {
        o.remove("id");
        o.remove("hlc");
        o.remove("deleted");
    }
    state.put(&tbl, &id, row, true).map_err(err)?;
    state.bump_data_version();
    Ok(())
}

// ── stock ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_stock_levels(state: State<Arc<AppState>>) -> CmdResult<Vec<Value>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT variant_id, branch_id, SUM(qty_delta) FROM stock_movements
             GROUP BY variant_id, branch_id",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "variant_id": r.get::<_, String>(0)?,
                "branch_id": r.get::<_, String>(1)?,
                "qty": r.get::<_, f64>(2)?,
            }))
        })
        .map_err(err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn adjust_stock(
    state: State<Arc<AppState>>,
    variant_id: String,
    branch_id: String,
    qty_delta: f64,
    kind: String,
    note: String,
) -> CmdResult<()> {
    if !["adjustment", "count", "receive"].contains(&kind.as_str()) {
        return Err("kind must be adjustment, count or receive".into());
    }
    if qty_delta == 0.0 {
        return Err("quantity delta may not be zero".into());
    }
    state
        .movement(&variant_id, &branch_id, qty_delta, &kind, "manual", "", &note)
        .map_err(err)?;
    state.bump_data_version();
    Ok(())
}

#[tauri::command]
pub fn transfer_stock(
    state: State<Arc<AppState>>,
    variant_id: String,
    from_branch_id: String,
    to_branch_id: String,
    qty: f64,
    note: String,
) -> CmdResult<()> {
    if qty <= 0.0 {
        return Err("transfer quantity must be positive".into());
    }
    if from_branch_id == to_branch_id {
        return Err("cannot transfer to the same branch".into());
    }
    let transfer_id = Ulid::new().to_string();
    state
        .movement(&variant_id, &from_branch_id, -qty, "transfer_out", "transfer", &transfer_id, &note)
        .map_err(err)?;
    state
        .movement(&variant_id, &to_branch_id, qty, "transfer_in", "transfer", &transfer_id, &note)
        .map_err(err)?;
    state.bump_data_version();
    Ok(())
}

// ── orders (sales) ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SaveOrder {
    pub order: Value,
    #[serde(default)]
    pub items: Option<Vec<Value>>,
    #[serde(default)]
    pub services: Option<Vec<Value>>,
}

fn replace_children(
    state: &AppState,
    tbl: &str,
    parent_col: &str,
    parent_id: &str,
    new_children: Vec<Value>,
) -> Result<(), String> {
    let existing = {
        let conn = state.db.lock().unwrap();
        store::list_rows(&conn, tbl, false).map_err(err)?
    };
    let keep: Vec<String> = new_children
        .iter()
        .filter_map(|c| c.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
    for row in existing {
        let rid = row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let pid = row.get(parent_col).and_then(|v| v.as_str()).unwrap_or("");
        if pid == parent_id && !keep.contains(&rid) {
            let mut payload = obj(&row);
            payload.remove("id");
            payload.remove("hlc");
            payload.remove("deleted");
            state.put(tbl, &rid, Value::Object(payload), true).map_err(err)?;
        }
    }
    for child in new_children {
        let mut payload = obj(&child);
        let cid = payload
            .remove("id")
            .and_then(|v| v.as_str().map(String::from))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| Ulid::new().to_string());
        payload.insert(parent_col.into(), Value::from(parent_id));
        payload.remove("hlc");
        payload.remove("deleted");
        state.put(tbl, &cid, Value::Object(payload), false).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_order(state: State<Arc<AppState>>, payload: SaveOrder) -> CmdResult<Value> {
    let mut order = obj(&payload.order);
    let id = order
        .remove("id")
        .and_then(|v| v.as_str().map(String::from))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Ulid::new().to_string());
    order.remove("hlc");
    order.remove("deleted");

    let existing_status = {
        let conn = state.db.lock().unwrap();
        store::get_row(&conn, "orders", &id)
            .map_err(err)?
            .and_then(|r| r.get("status").and_then(|s| s.as_str()).map(String::from))
    };

    if order.get("order_number").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        order.insert("order_number".into(), Value::from(format!("ORD-{}", &id[id.len() - 6..])));
    }
    if order.get("branch_id").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        order.insert("branch_id".into(), Value::from(state.branch_id()));
    }
    if order.get("created_at").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        order.insert("created_at".into(), Value::from(now_iso()));
    }
    // Status transitions go through set_order_status; saving keeps the current one.
    if let Some(status) = &existing_status {
        order.insert("status".into(), Value::from(status.clone()));
    } else if order.get("status").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        order.insert("status".into(), Value::from("draft"));
    }

    state.put("orders", &id, Value::Object(order), false).map_err(err)?;

    // Line items are only editable while the order is a draft — stock effects
    // are snapshotted at confirmation time.
    let is_draft = existing_status.as_deref().unwrap_or("draft") == "draft";
    if is_draft {
        if let Some(items) = payload.items {
            replace_children(&state, "order_items", "order_id", &id, items)?;
        }
        if let Some(services) = payload.services {
            replace_children(&state, "order_services", "order_id", &id, services)?;
        }
    }
    state.bump_data_version();
    let conn = state.db.lock().unwrap();
    store::get_row(&conn, "orders", &id).map_err(err)?.ok_or_else(|| "order vanished".into())
}

#[tauri::command]
pub fn set_order_status(state: State<Arc<AppState>>, order_id: String, status: String) -> CmdResult<()> {
    let allowed = ["draft", "confirmed", "paid", "cancelled"];
    if !allowed.contains(&status.as_str()) {
        return Err(format!("invalid status: {status}"));
    }
    let (mut order, current) = {
        let conn = state.db.lock().unwrap();
        let row = store::get_row(&conn, "orders", &order_id)
            .map_err(err)?
            .ok_or("order not found")?;
        let cur = row.get("status").and_then(|s| s.as_str()).unwrap_or("draft").to_string();
        (obj(&row), cur)
    };

    let ok = matches!(
        (current.as_str(), status.as_str()),
        ("draft", "confirmed") | ("draft", "cancelled") | ("confirmed", "paid")
            | ("confirmed", "cancelled") | ("paid", "cancelled")
    );
    if !ok {
        return Err(format!("cannot move order from {current} to {status}"));
    }

    let branch_id = order
        .get("branch_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| state.branch_id());

    if status == "confirmed" && state.movements_for_ref("order", &order_id, "sale").is_empty() {
        let items = {
            let conn = state.db.lock().unwrap();
            store::list_rows(&conn, "order_items", false).map_err(err)?
        };
        for item in items.iter().filter(|i| i.get("order_id").and_then(|v| v.as_str()) == Some(order_id.as_str())) {
            let variant = item.get("product_variant_id").and_then(|v| v.as_str()).unwrap_or("");
            let qty = item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if !variant.is_empty() && qty > 0.0 {
                state
                    .movement(variant, &branch_id, -qty, "sale", "order", &order_id, "")
                    .map_err(err)?;
            }
        }
    }

    if status == "cancelled"
        && current != "draft"
        && state.movements_for_ref("order", &order_id, "reversal").is_empty()
    {
        for m in state.movements_for_ref("order", &order_id, "sale") {
            let variant = m.get("variant_id").and_then(|v| v.as_str()).unwrap_or("");
            let qty = -m.get("qty_delta").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if !variant.is_empty() && qty != 0.0 {
                state
                    .movement(variant, &branch_id, qty, "reversal", "order", &order_id, "order cancelled")
                    .map_err(err)?;
            }
        }
    }

    order.insert("status".into(), Value::from(status));
    order.remove("id");
    order.remove("hlc");
    order.remove("deleted");
    state.put("orders", &order_id, Value::Object(order), false).map_err(err)?;
    state.bump_data_version();
    Ok(())
}

// ── purchase orders ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SavePurchaseOrder {
    pub purchase_order: Value,
    #[serde(default)]
    pub items: Option<Vec<Value>>,
}

#[tauri::command]
pub fn save_purchase_order(state: State<Arc<AppState>>, payload: SavePurchaseOrder) -> CmdResult<Value> {
    let mut po = obj(&payload.purchase_order);
    let id = po
        .remove("id")
        .and_then(|v| v.as_str().map(String::from))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Ulid::new().to_string());
    po.remove("hlc");
    po.remove("deleted");

    let existing_status = {
        let conn = state.db.lock().unwrap();
        store::get_row(&conn, "purchase_orders", &id)
            .map_err(err)?
            .and_then(|r| r.get("status").and_then(|s| s.as_str()).map(String::from))
    };

    if po.get("po_number").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        po.insert("po_number".into(), Value::from(format!("PO-{}", &id[id.len() - 6..])));
    }
    if po.get("branch_id").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        po.insert("branch_id".into(), Value::from(state.branch_id()));
    }
    if po.get("created_at").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        po.insert("created_at".into(), Value::from(now_iso()));
    }
    if let Some(status) = &existing_status {
        po.insert("status".into(), Value::from(status.clone()));
    } else if po.get("status").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        po.insert("status".into(), Value::from("draft"));
    }

    state.put("purchase_orders", &id, Value::Object(po), false).map_err(err)?;

    let is_draft = existing_status.as_deref().unwrap_or("draft") == "draft";
    if is_draft {
        if let Some(items) = payload.items {
            replace_children(&state, "purchase_order_items", "purchase_order_id", &id, items)?;
        }
    }
    state.bump_data_version();
    let conn = state.db.lock().unwrap();
    store::get_row(&conn, "purchase_orders", &id)
        .map_err(err)?
        .ok_or_else(|| "purchase order vanished".into())
}

#[tauri::command]
pub fn set_purchase_order_status(state: State<Arc<AppState>>, po_id: String, status: String) -> CmdResult<()> {
    let (mut po, current) = {
        let conn = state.db.lock().unwrap();
        let row = store::get_row(&conn, "purchase_orders", &po_id)
            .map_err(err)?
            .ok_or("purchase order not found")?;
        let cur = row.get("status").and_then(|s| s.as_str()).unwrap_or("draft").to_string();
        (obj(&row), cur)
    };
    let ok = matches!(
        (current.as_str(), status.as_str()),
        ("draft", "sent") | ("draft", "cancelled") | ("sent", "cancelled")
    );
    if !ok {
        return Err(format!("cannot move purchase order from {current} to {status} (receiving drives the rest)"));
    }
    po.insert("status".into(), Value::from(status));
    po.remove("id");
    po.remove("hlc");
    po.remove("deleted");
    state.put("purchase_orders", &po_id, Value::Object(po), false).map_err(err)?;
    state.bump_data_version();
    Ok(())
}

#[derive(Deserialize)]
pub struct Receipt {
    pub item_id: String,
    pub qty: f64,
}

#[tauri::command]
pub fn receive_purchase_order(state: State<Arc<AppState>>, po_id: String, receipts: Vec<Receipt>) -> CmdResult<()> {
    let (mut po, status) = {
        let conn = state.db.lock().unwrap();
        let row = store::get_row(&conn, "purchase_orders", &po_id)
            .map_err(err)?
            .ok_or("purchase order not found")?;
        let cur = row.get("status").and_then(|s| s.as_str()).unwrap_or("draft").to_string();
        (obj(&row), cur)
    };
    if !["sent", "partially_received"].contains(&status.as_str()) {
        return Err(format!("cannot receive against a {status} purchase order"));
    }
    let branch_id = po
        .get("branch_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| state.branch_id());

    let items: Vec<Value> = {
        let conn = state.db.lock().unwrap();
        store::list_rows(&conn, "purchase_order_items", false)
            .map_err(err)?
            .into_iter()
            .filter(|i| i.get("purchase_order_id").and_then(|v| v.as_str()) == Some(po_id.as_str()))
            .collect()
    };

    for receipt in &receipts {
        if receipt.qty <= 0.0 {
            continue;
        }
        let Some(item) = items.iter().find(|i| i.get("id").and_then(|v| v.as_str()) == Some(receipt.item_id.as_str())) else {
            return Err(format!("line item {} not on this purchase order", receipt.item_id));
        };
        if item.get("item_type").and_then(|v| v.as_str()).unwrap_or("product") != "product" {
            continue; // services are never stocked
        }
        let variant = item.get("product_variant_id").and_then(|v| v.as_str()).unwrap_or("");
        let ordered = item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let already = item.get("received_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if already + receipt.qty > ordered + 1e-9 {
            return Err(format!("receiving {} would exceed ordered quantity {}", already + receipt.qty, ordered));
        }
        if variant.is_empty() {
            continue;
        }
        state
            .movement(variant, &branch_id, receipt.qty, "receive", "purchase_order", &po_id, "")
            .map_err(err)?;
        let mut payload = obj(item);
        let item_id = payload.remove("id").and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
        payload.remove("hlc");
        payload.remove("deleted");
        payload.insert("received_quantity".into(), Value::from(already + receipt.qty));
        state.put("purchase_order_items", &item_id, Value::Object(payload), false).map_err(err)?;
    }

    // Recompute PO status from receipts.
    let items: Vec<Value> = {
        let conn = state.db.lock().unwrap();
        store::list_rows(&conn, "purchase_order_items", false)
            .map_err(err)?
            .into_iter()
            .filter(|i| i.get("purchase_order_id").and_then(|v| v.as_str()) == Some(po_id.as_str()))
            .collect()
    };
    let stockable: Vec<&Value> = items
        .iter()
        .filter(|i| i.get("item_type").and_then(|v| v.as_str()).unwrap_or("product") == "product")
        .collect();
    let all_received = !stockable.is_empty()
        && stockable.iter().all(|i| {
            let ordered = i.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let received = i.get("received_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
            received + 1e-9 >= ordered
        });
    let any_received = stockable
        .iter()
        .any(|i| i.get("received_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0) > 0.0);
    let new_status = if all_received {
        "received"
    } else if any_received {
        "partially_received"
    } else {
        &status
    };
    po.insert("status".into(), Value::from(new_status));
    po.remove("id");
    po.remove("hlc");
    po.remove("deleted");
    state.put("purchase_orders", &po_id, Value::Object(po), false).map_err(err)?;
    state.bump_data_version();
    Ok(())
}

// ── sync settings / peers ────────────────────────────────────────────────────

#[tauri::command]
pub fn get_sync_settings(state: State<Arc<AppState>>) -> CmdResult<Value> {
    let cfg = state.sync_config();
    let listening = state.listener_stop.lock().unwrap().is_some();
    Ok(json!({
        "listen": cfg.listen,
        "port": cfg.port,
        "bind_addr": cfg.bind_addr,
        "secret": cfg.secret,
        "listening": listening && cfg.listen,
        "node_id": state.node_id,
    }))
}

#[tauri::command]
pub fn set_sync_settings(
    state: State<Arc<AppState>>,
    listen: bool,
    port: u16,
    bind_addr: String,
    secret: String,
) -> CmdResult<Value> {
    {
        let conn = state.db.lock().unwrap();
        crate::db::set_setting(&conn, "sync_listen", if listen { "1" } else { "0" }).map_err(err)?;
        crate::db::set_setting(&conn, "sync_port", &port.to_string()).map_err(err)?;
        crate::db::set_setting(&conn, "sync_bind_addr", &bind_addr).map_err(err)?;
        crate::db::set_setting(&conn, "sync_secret", secret.trim()).map_err(err)?;
    }
    sync::restart_listener(&state)?;
    get_sync_settings(state)
}

#[tauri::command]
pub fn new_sync_secret() -> CmdResult<String> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    Ok((0..32).map(|_| format!("{:x}", rng.gen_range(0..16u8))).collect())
}

#[tauri::command]
pub fn list_peers(state: State<Arc<AppState>>) -> CmdResult<Vec<Value>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, url, enabled, last_sync_at, last_status FROM peers ORDER BY name")
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "url": r.get::<_, String>(2)?,
                "enabled": r.get::<_, i64>(3)? != 0,
                "last_sync_at": r.get::<_, String>(4)?,
                "last_status": r.get::<_, String>(5)?,
            }))
        })
        .map_err(err)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_peer(state: State<Arc<AppState>>, id: Option<String>, name: String, url: String, enabled: bool) -> CmdResult<()> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("peer URL must start with http:// or https://".into());
    }
    let id = id.unwrap_or_else(|| Ulid::new().to_string());
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO peers (id, name, url, enabled) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, enabled = excluded.enabled",
        rusqlite::params![id, name, url, enabled as i64],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_peer(state: State<Arc<AppState>>, id: String) -> CmdResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM peers WHERE id = ?1", [id]).map_err(err)?;
    Ok(())
}

#[tauri::command]
pub async fn sync_now(state: State<'_, Arc<AppState>>, peer_id: Option<String>) -> CmdResult<Vec<SyncResult>> {
    Ok(sync::sync_all(state.inner().clone(), peer_id).await)
}

#[tauri::command]
pub async fn test_peer(state: State<'_, Arc<AppState>>, url: String) -> CmdResult<bool> {
    let secret = state.sync_secret();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(err)?;
    let res = client
        .get(format!("{}/sync/vector", url.trim_end_matches('/')))
        .header("authorization", format!("Bearer {secret}"))
        .send()
        .await
        .map_err(err)?;
    Ok(res.status().is_success())
}

#[tauri::command]
pub fn data_version(state: State<Arc<AppState>>) -> CmdResult<u64> {
    Ok(state.data_version())
}
