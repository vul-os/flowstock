//! Branch-to-branch sync.
//!
//! Every node can expose an HTTP listener (axum) and/or dial peers. Sync is
//! stateless and pull-based on both sides: a round consists of
//!   1. `GET  /sync/vector`   → learn what the peer has seen,
//!   2. `POST /sync/ops`      → push ops the peer lacks,
//!   3. `POST /sync/pull`     → fetch ops we lack (batched).
//! Both endpoints require `Authorization: Bearer <sync secret>`; the listener
//! refuses to start without a secret (fail closed).

use crate::store::{self, Op};
use crate::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::oneshot;

pub const BATCH: usize = 2000;

#[derive(Serialize, Deserialize)]
pub struct PullReq {
    pub vector: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
pub struct OpsMsg {
    pub node_id: String,
    pub ops: Vec<Op>,
}

fn authed(state: &AppState, headers: &HeaderMap) -> bool {
    let secret = state.sync_secret();
    if secret.is_empty() {
        return false;
    }
    let presented = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    // Constant-time-ish comparison.
    presented.len() == secret.len()
        && presented
            .bytes()
            .zip(secret.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

async fn get_vector(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !authed(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = state.db.lock().unwrap();
    let vector = store::vector(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "node_id": state.node_id, "vector": vector })))
}

async fn post_ops(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(msg): Json<OpsMsg>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !authed(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let applied = {
        let mut conn = state.db.lock().unwrap();
        let mut clock = state.clock.lock().unwrap();
        store::apply_ops(&mut conn, &mut clock, &msg.ops)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };
    state.bump_data_version();
    Ok(Json(json!({ "applied": applied })))
}

async fn post_pull(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PullReq>,
) -> Result<Json<OpsMsg>, StatusCode> {
    if !authed(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let conn = state.db.lock().unwrap();
    let ops = store::ops_after(&conn, &req.vector, BATCH)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(OpsMsg { node_id: state.node_id.clone(), ops }))
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/sync/vector", get(get_vector))
        .route("/sync/ops", post(post_ops))
        .route("/sync/pull", post(post_pull))
        .route("/sync/ping", get(|| async { "flowstock" }))
        .with_state(state)
}

/// Start (or restart) the sync listener according to current settings.
/// Fails closed: no secret → no listener.
pub fn restart_listener(state: &Arc<AppState>) -> Result<Option<String>, String> {
    // Stop any previous listener.
    if let Some(stop) = state.listener_stop.lock().unwrap().take() {
        let _ = stop.send(());
    }
    let cfg = state.sync_config();
    if !cfg.listen {
        return Ok(None);
    }
    if cfg.secret.is_empty() {
        return Err("sync secret is not set — refusing to listen".into());
    }
    let addr = format!("{}:{}", cfg.bind_addr, cfg.port);
    let (tx, rx) = oneshot::channel::<()>();
    *state.listener_stop.lock().unwrap() = Some(tx);
    let app = router(state.clone());
    let addr_for_msg = addr.clone();
    state.runtime.spawn(async move {
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[sync] listen {addr} failed: {e}");
                return;
            }
        };
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });
    Ok(Some(addr_for_msg))
}

/// Sync every enabled peer (or one, if `only` is set) and record the outcome
/// on the peers table. Shared by the manual "Sync now" command and the
/// background loop.
pub async fn sync_all(state: Arc<AppState>, only: Option<String>) -> Vec<SyncResult> {
    let peers: Vec<(String, String)> = {
        let conn = state.db.lock().unwrap();
        let mut stmt = match conn.prepare("SELECT id, url FROM peers WHERE enabled = 1") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let rows = match stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };
        rows.filter_map(|r| r.ok())
            .filter(|(id, _)| only.as_deref().map(|p| p == id).unwrap_or(true))
            .collect()
    };
    let mut results = Vec::new();
    for (id, url) in peers {
        let res = sync_with_peer(state.clone(), id.clone(), url).await;
        {
            let conn = state.db.lock().unwrap();
            let status = if res.ok {
                format!("ok: pushed {}, pulled {}", res.pushed, res.pulled)
            } else {
                format!("error: {}", res.error)
            };
            let _ = conn.execute(
                "UPDATE peers SET last_sync_at = ?1, last_status = ?2 WHERE id = ?3",
                rusqlite::params![chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true), status, id],
            );
        }
        results.push(res);
    }
    results
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub peer_id: String,
    pub ok: bool,
    pub pushed: usize,
    pub pulled: usize,
    pub error: String,
}

/// Run one full sync round against a peer URL (e.g. "http://192.168.1.20:7365").
pub async fn sync_with_peer(state: Arc<AppState>, peer_id: String, url: String) -> SyncResult {
    let mut result = SyncResult { peer_id, ok: false, pushed: 0, pulled: 0, error: String::new() };
    let secret = state.sync_secret();
    if secret.is_empty() {
        result.error = "sync secret not set".into();
        return result;
    }
    let base = url.trim_end_matches('/').to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();
    let auth = format!("Bearer {secret}");

    let round = async {
        // 1. Peer's vector → push what it lacks.
        let peer_vec: serde_json::Value = client
            .get(format!("{base}/sync/vector"))
            .header("authorization", &auth)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        // The window vector starts at the peer's vector and advances past each
        // pushed batch, so batches never overlap.
        let mut window: HashMap<String, String> =
            serde_json::from_value(peer_vec.get("vector").cloned().unwrap_or_default())
                .unwrap_or_default();

        let mut pushed = 0usize;
        loop {
            let ops = {
                let conn = state.db.lock().unwrap();
                store::ops_after(&conn, &window, BATCH)?
            };
            if ops.is_empty() {
                break;
            }
            for op in &ops {
                let entry = window.entry(op.node_id.clone()).or_default();
                if op.hlc > *entry {
                    *entry = op.hlc.clone();
                }
            }
            let n = ops.len();
            client
                .post(format!("{base}/sync/ops"))
                .header("authorization", &auth)
                .json(&OpsMsg { node_id: state.node_id.clone(), ops })
                .send()
                .await?
                .error_for_status()?;
            pushed += n;
            if n < BATCH {
                break;
            }
        }

        // 2. Pull what we lack.
        let mut pulled = 0usize;
        loop {
            let my_vector = {
                let conn = state.db.lock().unwrap();
                store::vector(&conn)?
            };
            let msg: OpsMsg = client
                .post(format!("{base}/sync/pull"))
                .header("authorization", &auth)
                .json(&PullReq { vector: my_vector })
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            if msg.ops.is_empty() {
                break;
            }
            let n = msg.ops.len();
            {
                let mut conn = state.db.lock().unwrap();
                let mut clock = state.clock.lock().unwrap();
                store::apply_ops(&mut conn, &mut clock, &msg.ops)?;
            }
            pulled += n;
            if n < BATCH {
                break;
            }
        }
        Ok::<(usize, usize), Box<dyn std::error::Error + Send + Sync>>((pushed, pulled))
    };

    match round.await {
        Ok((pushed, pulled)) => {
            result.ok = true;
            result.pushed = pushed;
            result.pulled = pulled;
            if pulled > 0 {
                state.bump_data_version();
            }
        }
        Err(e) => result.error = e.to_string(),
    }
    result
}
