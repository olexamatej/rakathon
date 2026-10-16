//! Persistent, single-process work queue addressed only by request fingerprints.
use std::{
    fs::{self, File, OpenOptions},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, ensure};
use axum::{
    Json,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::Notify;

use crate::{AppState, CheckRequest, Config, Problem, codex, report, research};

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Kind {
    Check,
    Research,
}

pub(crate) struct Store {
    db: Mutex<Connection>,
    _lock: File,
    started: AtomicBool,
    notify: Arc<Notify>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn failure(code: &str) -> Value {
    json!({"type": "about:blank", "title": "Služba je dočasně nedostupná", "status": 503,
        "detail": "Služba nedokázala dokončit požadavek. Zkuste to později znovu.", "code": code})
}

impl Store {
    pub(crate) fn open(config: &Config) -> anyhow::Result<Self> {
        ensure!(
            config.max_queued > 0
                && !config.result_ttl.is_zero()
                && !config.failure_ttl.is_zero()
                && !config.queue_timeout.is_zero(),
            "queue limits and retention must be positive"
        );
        if let Some(parent) = config
            .jobs_path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
        {
            fs::create_dir_all(parent)?;
        }
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(config.jobs_path.with_extension("lock"))?;
        lock.try_lock_exclusive()
            .context("job database is already used by another server")?;
        let db = Connection::open(&config.jobs_path)?;
        db.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS jobs (
                fingerprint TEXT PRIMARY KEY, kind TEXT NOT NULL, request TEXT NOT NULL,
                state TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER, body TEXT
            );
            CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state, created);
            CREATE INDEX IF NOT EXISTS jobs_expiry ON jobs(expires);",
        )?;
        db.execute(
            "UPDATE jobs SET state='failed', body=?1, expires=?2 WHERE state='running'",
            params![
                failure("worker_interrupted").to_string(),
                now() + config.failure_ttl.as_secs() as i64
            ],
        )?;
        Ok(Self {
            db: Mutex::new(db),
            _lock: lock,
            started: AtomicBool::new(false),
            notify: Arc::new(Notify::new()),
        })
    }

    fn claim(&self, config: &Config) -> anyhow::Result<Option<Work>> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction()?;
        // Sweep expired records even when no clients are submitting work.
        tx.execute("DELETE FROM jobs WHERE expires <= ?1", [now()])?;
        tx.execute("UPDATE jobs SET state='failed', body=?1, expires=?2 WHERE state='queued' AND created <= ?3",
            params![failure("queue_timeout").to_string(), now() + config.failure_ttl.as_secs() as i64, now() - config.queue_timeout.as_secs() as i64])?;
        let work = tx.query_row("SELECT fingerprint, kind, request FROM jobs WHERE state='queued' ORDER BY created, rowid LIMIT 1", [], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        }).optional()?;
        let work = work
            .map(|(key, kind, request)| -> anyhow::Result<Work> {
                tx.execute(
                    "UPDATE jobs SET state='running' WHERE fingerprint=?1",
                    [&key],
                )?;
                Ok(Work {
                    key,
                    kind: serde_json::from_str(&kind)?,
                    request: serde_json::from_str(&request)?,
                })
            })
            .transpose()?;
        tx.commit()?;
        Ok(work)
    }

    fn finish(
        &self,
        key: &str,
        result: &anyhow::Result<Value>,
        config: &Config,
    ) -> anyhow::Result<()> {
        let (state, body, ttl) = match result {
            Ok(body) => ("succeeded", body.clone(), config.result_ttl),
            Err(_) => {
                // Do not expose model diagnostics or submitted names.
                tracing::warn!("background interaction work failed");
                ("failed", failure("execution_failed"), config.failure_ttl)
            }
        };
        self.db.lock().unwrap().execute(
            "UPDATE jobs SET state=?1, body=?2, expires=?3 WHERE fingerprint=?4",
            params![state, body.to_string(), now() + ttl.as_secs() as i64, key],
        )?;
        Ok(())
    }
}

struct Work {
    key: String,
    kind: Kind,
    request: Value,
}

pub(crate) fn start(state: &AppState) {
    if state.jobs.started.swap(true, Ordering::SeqCst) {
        return;
    }
    for _ in 0..state.config.max_concurrent {
        let weak = Arc::downgrade(&state.jobs);
        let notify = state.jobs.notify.clone();
        let config = state.config.clone();
        tokio::spawn(async move {
            loop {
                // Register before checking the queue to avoid losing a wake-up.
                let wake = notify.notified();
                tokio::pin!(wake);
                wake.as_mut().enable();
                let Some(store) = weak.upgrade() else {
                    break;
                };
                match store.claim(&config) {
                    Ok(Some(work)) => {
                        let task_config = config.clone();
                        let result = tokio::spawn(async move {
                            match work.kind {
                                Kind::Check => {
                                    let request: CheckRequest =
                                        serde_json::from_value(work.request)?;
                                    let result = codex::infer(&task_config, &request.drugs).await?;
                                    report::build_report(&request.drugs, result)
                                }
                                Kind::Research => {
                                    research::research(
                                        &task_config,
                                        &serde_json::from_value(work.request)?,
                                    )
                                    .await
                                }
                            }
                        })
                        .await
                        .unwrap_or_else(|_| Err(anyhow::anyhow!("worker panicked")));
                        // Retry persistence without repeating inference or losing its result.
                        while store.finish(&work.key, &result, &config).is_err() {
                            tracing::error!("could not persist completed interaction work");
                            tokio::time::sleep(Duration::from_secs(1)).await;
                        }
                    }
                    Ok(None) => {
                        drop(store);
                        tokio::select! { _ = wake => {}, _ = tokio::time::sleep(Duration::from_secs(1)) => {} }
                    }
                    Err(_) => {
                        tracing::error!("could not read interaction queue");
                        drop(store);
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }
}

pub(crate) fn submit(state: &AppState, kind: Kind, request: Value) -> Result<Response, Problem> {
    submit_inner(state, kind, request).map_err(|_| {
        Problem::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "Úložiště požadavků je dočasně nedostupné.",
        )
    })?
}

fn submit_inner(
    state: &AppState,
    kind: Kind,
    request: Value,
) -> anyhow::Result<Result<Response, Problem>> {
    let kind_json = serde_json::to_string(&kind)?;
    // Exact names/order are retained because reports reference input indexes.
    let identity = json!([
        "contract-async-1",
        kind_json,
        request,
        state.config.model,
        state.config.service_tier,
        include_str!("prompt.txt"),
        include_str!("research_prompt.txt")
    ]);
    let key = Sha256::digest(serde_json::to_vec(&identity)?)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let mut db = state.jobs.db.lock().unwrap();
    let tx = db.transaction()?;
    tx.execute("DELETE FROM jobs WHERE expires <= ?1", [now()])?;
    let row = tx
        .query_row(
            "SELECT state, body FROM jobs WHERE fingerprint=?1",
            [&key],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()?;
    let (status, body) = if let Some((phase, body)) = row {
        match phase.as_str() {
            "succeeded" => (
                StatusCode::OK,
                serde_json::from_str(&body.context("missing result")?)?,
            ),
            "failed" => (
                StatusCode::SERVICE_UNAVAILABLE,
                serde_json::from_str(&body.context("missing error")?)?,
            ),
            _ => (StatusCode::ACCEPTED, json!({"state": phase})),
        }
    } else {
        let queued: i64 =
            tx.query_row("SELECT COUNT(*) FROM jobs WHERE state='queued'", [], |r| {
                r.get(0)
            })?;
        if queued >= state.config.max_queued as i64 {
            return Ok(Err(Problem::new(
                StatusCode::TOO_MANY_REQUESTS,
                "Fronta požadavků je nyní plná. Zkuste to za chvíli znovu.",
            )));
        }
        tx.execute("INSERT INTO jobs (fingerprint, kind, request, state, created) VALUES (?1, ?2, ?3, 'queued', ?4)",
            params![key, kind_json, request.to_string(), now()])?;
        (StatusCode::ACCEPTED, json!({"state": "queued"}))
    };
    tx.commit()?;
    drop(db);
    state.jobs.notify.notify_one();
    let mut response = (status, Json(body)).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, "no-store".parse()?);
    headers.insert(header::CONTENT_LANGUAGE, "cs".parse()?);
    if status == StatusCode::ACCEPTED || status == StatusCode::SERVICE_UNAVAILABLE {
        headers.insert(header::RETRY_AFTER, "2".parse()?);
    }
    if status == StatusCode::SERVICE_UNAVAILABLE {
        headers.insert(header::CONTENT_TYPE, "application/problem+json".parse()?);
    }
    if status == StatusCode::OK {
        headers.insert(
            "x-interaction-source",
            match kind {
                Kind::Check => "model-knowledge",
                Kind::Research => "web-search",
            }
            .parse()?,
        );
        if matches!(kind, Kind::Check) {
            headers.insert("x-sources-verified", "false".parse()?);
        }
    }
    Ok(Ok(response))
}
