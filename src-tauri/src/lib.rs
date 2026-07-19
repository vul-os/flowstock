//! FlowStock — offline-first, multi-branch inventory management.
//!
//! Architecture: a local SQLite database is the source of truth on every
//! branch; every mutation is journalled to an oplog with a hybrid-logical-clock
//! timestamp. Branches exchange oplog entries over an authenticated HTTP
//! listener (LAN or tunnel) whenever they can reach each other — catalog rows
//! merge last-writer-wins, stock movements merge by union, so a branch that
//! was offline for a week converges to the same totals as everyone else.

pub mod commands;
pub mod db;
pub mod hlc;
pub mod store;
pub mod sync;

use hlc::Hlc;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};

#[derive(Clone)]
pub struct SyncConfig {
    pub listen: bool,
    pub port: u16,
    pub bind_addr: String,
    pub secret: String,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub clock: Mutex<Hlc>,
    pub node_id: String,
    pub runtime: tokio::runtime::Handle,
    pub listener_stop: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    data_version: AtomicU64,
    pub on_change: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
}

impl AppState {
    pub fn init(data_dir: PathBuf, runtime: tokio::runtime::Handle) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let conn = Connection::open(data_dir.join("flowstock.db")).map_err(|e| e.to_string())?;
        db::init_schema(&conn).map_err(|e| e.to_string())?;

        let node_id = match db::get_setting(&conn, "node_id") {
            Some(id) if !id.is_empty() => id,
            _ => {
                let id = ulid::Ulid::new().to_string();
                db::set_setting(&conn, "node_id", &id).map_err(|e| e.to_string())?;
                id
            }
        };
        // Seed the clock past everything already journalled, so a wall clock
        // that moved backwards can never mint stale timestamps.
        let max_hlc: Option<String> = conn
            .query_row("SELECT MAX(hlc) FROM oplog", [], |r| r.get(0))
            .ok()
            .flatten();
        let clock = Hlc::new(node_id.clone(), max_hlc.as_deref());

        Ok(AppState {
            db: Mutex::new(conn),
            clock: Mutex::new(clock),
            node_id,
            runtime,
            listener_stop: Mutex::new(None),
            data_version: AtomicU64::new(1),
            on_change: Mutex::new(None),
        })
    }

    pub fn sync_config(&self) -> SyncConfig {
        let conn = self.db.lock().unwrap();
        SyncConfig {
            listen: db::get_setting(&conn, "sync_listen").as_deref() == Some("1"),
            port: db::get_setting(&conn, "sync_port")
                .and_then(|p| p.parse().ok())
                .unwrap_or(7365),
            bind_addr: db::get_setting(&conn, "sync_bind_addr").unwrap_or_else(|| "0.0.0.0".into()),
            secret: db::get_setting(&conn, "sync_secret").unwrap_or_default(),
        }
    }

    pub fn sync_secret(&self) -> String {
        let conn = self.db.lock().unwrap();
        db::get_setting(&conn, "sync_secret").unwrap_or_default()
    }

    pub fn data_version(&self) -> u64 {
        self.data_version.load(Ordering::Relaxed)
    }

    pub fn bump_data_version(&self) {
        self.data_version.fetch_add(1, Ordering::Relaxed);
        if let Some(cb) = self.on_change.lock().unwrap().as_ref() {
            cb();
        }
    }
}

fn runtime_handle() -> tokio::runtime::Handle {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
    .handle()
    .clone()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = std::env::var("FLOWSTOCK_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    app.path()
                        .app_data_dir()
                        .expect("no app data dir")
                });
            let state = Arc::new(AppState::init(data_dir, runtime_handle())?);

            let handle = app.handle().clone();
            *state.on_change.lock().unwrap() = Some(Box::new(move || {
                let _ = handle.emit("data-changed", ());
            }));

            if let Err(e) = sync::restart_listener(&state) {
                eprintln!("[sync] listener not started: {e}");
            }

            // Background sync: try every enabled peer once a minute.
            let bg = state.clone();
            state.runtime.spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    let _ = sync::sync_all(bg.clone(), None).await;
                }
            });

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::setup_workspace,
            commands::update_settings,
            commands::list_rows,
            commands::put_row,
            commands::delete_row,
            commands::get_stock_levels,
            commands::adjust_stock,
            commands::transfer_stock,
            commands::save_order,
            commands::set_order_status,
            commands::save_purchase_order,
            commands::set_purchase_order_status,
            commands::receive_purchase_order,
            commands::get_sync_settings,
            commands::set_sync_settings,
            commands::new_sync_secret,
            commands::list_peers,
            commands::save_peer,
            commands::delete_peer,
            commands::sync_now,
            commands::test_peer,
            commands::data_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlowStock");
}
