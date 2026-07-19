//! Write-through store: every mutation lands in the domain table *and* the
//! oplog inside one transaction. Merging a remote op is idempotent — the oplog
//! primary key dedupes, catalog rows resolve by last-writer-wins on the HLC,
//! and insert-only tables (stock movements) merge by union.

use crate::db::{self, ColKind, TableDef};
use crate::hlc::Hlc;
use rusqlite::{types::Value as SqlValue, Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Op {
    pub hlc: String,
    pub node_id: String,
    pub tbl: String,
    pub row_id: String,
    pub deleted: bool,
    pub payload: Value,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("unknown table: {0}")]
    UnknownTable(String),
    #[error("table {0} is insert-only")]
    InsertOnly(String),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
}

fn json_to_sql(kind: ColKind, v: Option<&Value>) -> SqlValue {
    match v {
        None | Some(Value::Null) => SqlValue::Null,
        Some(v) => match kind {
            ColKind::Text => match v {
                Value::String(s) => SqlValue::Text(s.clone()),
                other => SqlValue::Text(other.to_string()),
            },
            ColKind::Real => v
                .as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                .map(SqlValue::Real)
                .unwrap_or(SqlValue::Null),
            ColKind::Int => v
                .as_i64()
                .or_else(|| v.as_bool().map(|b| b as i64))
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                .map(SqlValue::Integer)
                .unwrap_or(SqlValue::Null),
        },
    }
}

/// Upsert a row from an op payload; last-writer-wins on the hlc column.
fn write_row(conn: &Connection, t: &TableDef, op: &Op) -> rusqlite::Result<()> {
    let payload = op.payload.as_object().cloned().unwrap_or_default();
    let col_names: Vec<&str> = t.cols.iter().map(|(n, _)| *n).collect();
    let placeholders: Vec<String> = (4..4 + col_names.len()).map(|i| format!("?{i}")).collect();

    let sql = if t.insert_only {
        format!(
            "INSERT OR IGNORE INTO {tbl} (id, hlc, deleted{cols}) VALUES (?1, ?2, ?3{vals})",
            tbl = t.name,
            cols = col_names.iter().map(|c| format!(", {c}")).collect::<String>(),
            vals = placeholders.iter().map(|p| format!(", {p}")).collect::<String>(),
        )
    } else {
        let updates: String = col_names
            .iter()
            .map(|c| format!(", {c} = excluded.{c}"))
            .collect();
        format!(
            "INSERT INTO {tbl} (id, hlc, deleted{cols}) VALUES (?1, ?2, ?3{vals})
             ON CONFLICT(id) DO UPDATE SET hlc = excluded.hlc, deleted = excluded.deleted{updates}
             WHERE excluded.hlc > {tbl}.hlc",
            tbl = t.name,
            cols = col_names.iter().map(|c| format!(", {c}")).collect::<String>(),
            vals = placeholders.iter().map(|p| format!(", {p}")).collect::<String>(),
        )
    };

    let mut params: Vec<SqlValue> = vec![
        SqlValue::Text(op.row_id.clone()),
        SqlValue::Text(op.hlc.clone()),
        SqlValue::Integer(op.deleted as i64),
    ];
    for (name, kind) in t.cols {
        params.push(json_to_sql(*kind, payload.get(*name)));
    }
    let param_refs: Vec<&dyn ToSql> = params.iter().map(|p| p as &dyn ToSql).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

fn append_oplog(conn: &Connection, op: &Op) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "INSERT OR IGNORE INTO oplog (hlc, node_id, tbl, row_id, deleted, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![op.hlc, op.node_id, op.tbl, op.row_id, op.deleted as i64, op.payload.to_string()],
    )?;
    Ok(n > 0)
}

/// Local write: stamp a fresh HLC, write row + oplog atomically. Returns the op.
pub fn local_put(
    conn: &mut Connection,
    clock: &mut Hlc,
    node_id: &str,
    tbl: &str,
    row_id: &str,
    payload: Value,
    deleted: bool,
) -> Result<Op, StoreError> {
    let t = db::table(tbl).ok_or_else(|| StoreError::UnknownTable(tbl.into()))?;
    if t.insert_only && deleted {
        return Err(StoreError::InsertOnly(tbl.into()));
    }
    let op = Op {
        hlc: clock.tick(),
        node_id: node_id.to_string(),
        tbl: tbl.to_string(),
        row_id: row_id.to_string(),
        deleted,
        payload,
    };
    let tx = conn.transaction()?;
    write_row(&tx, t, &op)?;
    append_oplog(&tx, &op)?;
    tx.commit()?;
    Ok(op)
}

/// Apply remote ops idempotently. Returns how many were new to this node.
pub fn apply_ops(
    conn: &mut Connection,
    clock: &mut Hlc,
    ops: &[Op],
) -> Result<usize, StoreError> {
    let mut fresh = 0;
    let tx = conn.transaction()?;
    for op in ops {
        let Some(t) = db::table(&op.tbl) else { continue };
        if append_oplog(&tx, op)? {
            write_row(&tx, t, op)?;
            clock.observe(&op.hlc);
            fresh += 1;
        }
    }
    tx.commit()?;
    Ok(fresh)
}

/// This node's version vector: newest hlc seen per origin node.
pub fn vector(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT node_id, MAX(hlc) FROM oplog GROUP BY node_id")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = HashMap::new();
    for row in rows {
        let (node, hlc) = row?;
        out.insert(node, hlc);
    }
    Ok(out)
}

/// Ops the holder of `remote_vector` has not seen yet, oldest first.
pub fn ops_after(
    conn: &Connection,
    remote_vector: &HashMap<String, String>,
    limit: usize,
) -> rusqlite::Result<Vec<Op>> {
    let mut stmt = conn.prepare(
        "SELECT hlc, node_id, tbl, row_id, deleted, payload FROM oplog ORDER BY hlc ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Op {
            hlc: r.get(0)?,
            node_id: r.get(1)?,
            tbl: r.get(2)?,
            row_id: r.get(3)?,
            deleted: r.get::<_, i64>(4)? != 0,
            payload: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or(Value::Null),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let op = row?;
        let seen = remote_vector.get(&op.node_id).map(|v| op.hlc <= *v).unwrap_or(false);
        if !seen {
            out.push(op);
            if out.len() >= limit {
                break;
            }
        }
    }
    Ok(out)
}

/// Read all live rows of a table as JSON objects (id + hlc included).
pub fn list_rows(conn: &Connection, tbl: &str, include_deleted: bool) -> Result<Vec<Value>, StoreError> {
    let t = db::table(tbl).ok_or_else(|| StoreError::UnknownTable(tbl.into()))?;
    let filter = if include_deleted { "" } else { "WHERE deleted = 0" };
    let mut stmt = conn.prepare(&format!("SELECT * FROM {} {} ORDER BY id ASC", t.name, filter))?;
    let col_count = stmt.column_count();
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map([], |r| {
        let mut obj = Map::new();
        for i in 0..col_count {
            let v: SqlValue = r.get(i)?;
            let jv = match v {
                SqlValue::Null => Value::Null,
                SqlValue::Integer(n) => Value::from(n),
                SqlValue::Real(f) => Value::from(f),
                SqlValue::Text(s) => Value::from(s),
                SqlValue::Blob(_) => Value::Null,
            };
            obj.insert(names[i].clone(), jv);
        }
        Ok(Value::Object(obj))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_row(conn: &Connection, tbl: &str, id: &str) -> Result<Option<Value>, StoreError> {
    let rows = list_rows(conn, tbl, true)?;
    Ok(rows.into_iter().find(|r| r.get("id").and_then(|v| v.as_str()) == Some(id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn node(name: &str) -> (Connection, Hlc) {
        let conn = Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        (conn, Hlc::new(name.to_string(), None))
    }

    fn sync(a: &mut (Connection, Hlc), b: &mut (Connection, Hlc)) {
        // b pulls from a, then a pulls from b — one full round.
        let vb = vector(&b.0).unwrap();
        let ops = ops_after(&a.0, &vb, 10_000).unwrap();
        apply_ops(&mut b.0, &mut b.1, &ops).unwrap();
        let va = vector(&a.0).unwrap();
        let ops = ops_after(&b.0, &va, 10_000).unwrap();
        apply_ops(&mut a.0, &mut a.1, &ops).unwrap();
    }

    fn stock(conn: &Connection, variant: &str) -> f64 {
        conn.query_row(
            "SELECT COALESCE(SUM(qty_delta), 0) FROM stock_movements WHERE variant_id = ?1",
            [variant],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn lww_row_merge() {
        let mut a = node("A");
        let mut b = node("B");
        local_put(&mut a.0, &mut a.1, "A", "products", "p1", json!({"name": "Bolt M6"}), false).unwrap();
        sync(&mut a, &mut b);
        // Concurrent edits: B edits later (observe ensures later hlc after sync).
        local_put(&mut a.0, &mut a.1, "A", "products", "p1", json!({"name": "Bolt M6 (A)"}), false).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        local_put(&mut b.0, &mut b.1, "B", "products", "p1", json!({"name": "Bolt M6 (B)"}), false).unwrap();
        sync(&mut a, &mut b);
        let ra = get_row(&a.0, "products", "p1").unwrap().unwrap();
        let rb = get_row(&b.0, "products", "p1").unwrap().unwrap();
        assert_eq!(ra.get("name"), rb.get("name"), "nodes must converge");
        assert_eq!(ra.get("name").unwrap(), "Bolt M6 (B)");
    }

    #[test]
    fn offline_stock_movements_union_merge() {
        let mut a = node("A");
        let mut b = node("B");
        // Both branches sell the same item while offline.
        local_put(&mut a.0, &mut a.1, "A", "stock_movements", "m1",
            json!({"variant_id": "v1", "branch_id": "bA", "qty_delta": -3.0, "kind": "sale"}), false).unwrap();
        local_put(&mut a.0, &mut a.1, "A", "stock_movements", "m2",
            json!({"variant_id": "v1", "branch_id": "bA", "qty_delta": 10.0, "kind": "receive"}), false).unwrap();
        local_put(&mut b.0, &mut b.1, "B", "stock_movements", "m3",
            json!({"variant_id": "v1", "branch_id": "bB", "qty_delta": -2.0, "kind": "sale"}), false).unwrap();
        sync(&mut a, &mut b);
        sync(&mut a, &mut b); // idempotent
        assert_eq!(stock(&a.0, "v1"), 5.0);
        assert_eq!(stock(&b.0, "v1"), 5.0);
    }

    #[test]
    fn soft_delete_replicates() {
        let mut a = node("A");
        let mut b = node("B");
        local_put(&mut a.0, &mut a.1, "A", "customers", "c1", json!({"name": "Acme"}), false).unwrap();
        sync(&mut a, &mut b);
        let row = get_row(&b.0, "customers", "c1").unwrap().unwrap();
        local_put(&mut b.0, &mut b.1, "B", "customers", "c1", json!(row), true).unwrap();
        sync(&mut a, &mut b);
        assert!(list_rows(&a.0, "customers", false).unwrap().is_empty());
    }

    #[test]
    fn three_nodes_converge_via_hub() {
        // A and C never talk directly; B relays ops both ways.
        let mut a = node("A");
        let mut b = node("B");
        let mut c = node("C");
        local_put(&mut a.0, &mut a.1, "A", "stock_movements", "ma",
            json!({"variant_id": "v9", "branch_id": "bA", "qty_delta": 4.0, "kind": "receive"}), false).unwrap();
        local_put(&mut c.0, &mut c.1, "C", "stock_movements", "mc",
            json!({"variant_id": "v9", "branch_id": "bC", "qty_delta": -1.0, "kind": "sale"}), false).unwrap();
        sync(&mut a, &mut b);
        sync(&mut b, &mut c);
        sync(&mut a, &mut b);
        assert_eq!(stock(&a.0, "v9"), 3.0);
        assert_eq!(stock(&b.0, "v9"), 3.0);
        assert_eq!(stock(&c.0, "v9"), 3.0);
    }

    #[test]
    fn stale_op_does_not_clobber_newer_row() {
        let mut a = node("A");
        let (mut cb, mut hb) = node("B");
        let old = local_put(&mut a.0, &mut a.1, "A", "categories", "cat1", json!({"name": "Old"}), false).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        local_put(&mut cb, &mut hb, "B", "categories", "cat1", json!({"name": "New"}), false).unwrap();
        apply_ops(&mut cb, &mut hb, &[old]).unwrap();
        let row = get_row(&cb, "categories", "cat1").unwrap().unwrap();
        assert_eq!(row.get("name").unwrap(), "New");
    }
}
