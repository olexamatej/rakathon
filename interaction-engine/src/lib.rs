mod codex;
mod jobs;
mod medscape;
pub mod model;
pub mod report;
mod research;
pub mod transcribe;

use std::{env, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use anyhow::{Context, ensure};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State, rejection::JsonRejection},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug)]
pub struct Config {
    pub bind: SocketAddr,
    pub codex_bin: PathBuf,
    pub model: Option<String>,
    pub service_tier: Option<String>,
    pub timeout: Duration,
    pub max_concurrent: usize,
    pub jobs_path: PathBuf,
    pub max_queued: usize,
    pub result_ttl: Duration,
    pub failure_ttl: Duration,
    pub queue_timeout: Duration,
    pub gemini_api_base: String,
    pub gemini_api_key: Option<String>,
    pub gemini_model: String,
    pub gemini_timeout: Duration,
    pub sukl_catalogue: PathBuf,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let timeout = env::var("CODEX_TIMEOUT_SECONDS")
            .unwrap_or_else(|_| codex::DEFAULT_TIMEOUT.as_secs().to_string())
            .parse()
            .context("CODEX_TIMEOUT_SECONDS must be an integer")?;
        let max_concurrent = env::var("MAX_CONCURRENT_CHECKS")
            .unwrap_or_else(|_| "4".into())
            .parse()
            .context("MAX_CONCURRENT_CHECKS must be an integer")?;
        ensure!(timeout > 0, "CODEX_TIMEOUT_SECONDS must be positive");
        ensure!(max_concurrent > 0, "MAX_CONCURRENT_CHECKS must be positive");
        let service_tier = env::var("CODEX_SERVICE_TIER")
            .ok()
            .map(|tier| normalize_service_tier(&tier))
            .transpose()?
            .or_else(|| Some("priority".into()));
        let gemini_api_base = env::var("GEMINI_API_BASE")
            .ok()
            .map(|base| base.trim().trim_end_matches('/').to_string())
            .filter(|base| !base.is_empty())
            .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta".into());
        let gemini_api_key = env::var("GEMINI_API_KEY")
            .ok()
            .or_else(|| env::var("GOOGLE_API_KEY").ok())
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty());
        Ok(Self {
            bind: env::var("BIND_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:3000".into())
                .parse()
                .context("invalid BIND_ADDR")?,
            codex_bin: env::var_os("CODEX_BIN")
                .map(PathBuf::from)
                .unwrap_or_else(|| "codex".into()),
            model: Some(
                env::var("CODEX_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "gpt-6.1-sol".into()),
            ),
            service_tier,
            timeout: Duration::from_secs(timeout),
            max_concurrent,
            jobs_path: env::var_os("JOBS_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| "data/jobs.sqlite3".into()),
            max_queued: env_number("MAX_QUEUED_CHECKS", 100)? as usize,
            result_ttl: Duration::from_secs(env_number("RESULT_TTL_SECONDS", 86400)?),
            failure_ttl: Duration::from_secs(env_number("FAILURE_TTL_SECONDS", 30)?),
            queue_timeout: Duration::from_secs(env_number("QUEUE_TIMEOUT_SECONDS", 300)?),
            gemini_api_base,
            gemini_api_key,
            gemini_model: env::var("GEMINI_MODEL")
                .ok()
                .filter(|model| !model.trim().is_empty())
                .unwrap_or_else(|| transcribe::DEFAULT_MODEL.into()),
            gemini_timeout: Duration::from_secs(env_number("GEMINI_TIMEOUT_SECONDS", 120)?),
            sukl_catalogue: env::var_os("SUKL_CATALOGUE_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| "../data/sukl/medications.json".into()),
        })
    }
}

fn env_number(name: &str, default: u64) -> anyhow::Result<u64> {
    let value = env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse()
        .with_context(|| format!("{name} must be an integer"))?;
    ensure!(value > 0, "{name} must be positive");
    Ok(value)
}

fn normalize_service_tier(tier: &str) -> anyhow::Result<String> {
    match tier {
        "default" => Ok("default".into()),
        "priority" | "fast" => Ok("priority".into()),
        _ => anyhow::bail!("CODEX_SERVICE_TIER must be default, priority, or fast"),
    }
}

#[derive(Clone)]
pub struct AppState {
    config: Arc<Config>,
    jobs: Arc<jobs::Store>,
    transcribe: Arc<transcribe::TranscribeState>,
}

impl AppState {
    pub fn new(mut config: Config) -> anyhow::Result<Self> {
        if let Some(tier) = &config.service_tier {
            config.service_tier = Some(normalize_service_tier(tier)?);
        }
        ensure!(
            config.max_concurrent > 0 && !config.timeout.is_zero(),
            "concurrency and timeout must be positive"
        );
        // Relative executable paths must survive a change to the scratch cwd.
        if config.codex_bin.components().count() > 1 && config.codex_bin.is_relative() {
            config.codex_bin = env::current_dir()?.join(&config.codex_bin);
        }
        Ok(Self {
            jobs: Arc::new(jobs::Store::open(&config)?),
            transcribe: Arc::new(transcribe::TranscribeState::new(config.gemini_timeout)?),
            config: Arc::new(config),
        })
    }
}

pub fn app(state: AppState) -> Router {
    jobs::start(&state);
    Router::new()
        .route("/interaction-checks", post(check))
        .route("/interaction-research", post(research_check))
        .route("/transcribe", post(transcribe::transcribe))
        .route(
            "/openapi.yaml",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "application/yaml")],
                    include_str!("../openapi.yaml"),
                )
            }),
        )
        .route("/healthz", get(|| async { Json(json!({"status": "ok"})) }))
        .fallback(|| async {
            Problem::new(StatusCode::NOT_FOUND, "Požadovaná cesta nebyla nalezena.")
        })
        .method_not_allowed_fallback(|| async {
            Problem::new(StatusCode::METHOD_NOT_ALLOWED, "Tato metoda není povolena.")
        })
        .layer(DefaultBodyLimit::max(64 * 1024))
        .with_state(state)
}

#[derive(Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct CheckRequest {
    drugs: Vec<String>,
}

async fn check(
    State(state): State<AppState>,
    payload: Result<Json<CheckRequest>, JsonRejection>,
) -> Result<Response, Problem> {
    let Json(request) = payload.map_err(|rejection| {
        let status = match rejection.status() {
            StatusCode::UNSUPPORTED_MEDIA_TYPE => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            StatusCode::PAYLOAD_TOO_LARGE => StatusCode::PAYLOAD_TOO_LARGE,
            _ => StatusCode::BAD_REQUEST,
        };
        Problem::new(status, "Očekává se objekt JSON pouze s polem drugs: seznamem 2 až 50 neprázdných názvů léčiv, každý o délce nejvýše 200 znaků.")
    })?;
    if !(2..=50).contains(&request.drugs.len()) {
        return Err(Problem::invalid("/drugs", "Zadejte 2 až 50 názvů léčiv."));
    }
    for (index, name) in request.drugs.iter().enumerate() {
        if name.trim().is_empty() || name.chars().count() > 200 {
            return Err(Problem::invalid(
                &format!("/drugs/{index}"),
                "Názvy léčiv nesmějí být prázdné a mohou obsahovat nejvýše 200 znaků.",
            ));
        }
    }
    jobs::submit(
        &state,
        jobs::Kind::Check,
        serde_json::to_value(request).unwrap(),
    )
}

async fn research_check(
    State(state): State<AppState>,
    payload: Result<Json<research::ResearchRequest>, JsonRejection>,
) -> Result<Response, Problem> {
    let Json(request) = payload.map_err(|rejection| {
        let status = match rejection.status() {
            StatusCode::UNSUPPORTED_MEDIA_TYPE => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            StatusCode::PAYLOAD_TOO_LARGE => StatusCode::PAYLOAD_TOO_LARGE,
            _ => StatusCode::BAD_REQUEST,
        };
        Problem::new(
            status,
            "Očekává se objekt JSON s poli drugs (právě dva názvy léčiv) a site (podporovaný web).",
        )
    })?;
    for (index, name) in request.drugs.iter().enumerate() {
        if name.trim().is_empty() || name.chars().count() > 200 {
            return Err(Problem::invalid(
                &format!("/drugs/{index}"),
                "Názvy léčiv nesmějí být prázdné a mohou obsahovat nejvýše 200 znaků.",
            ));
        }
    }
    if research::site(&request.site).is_none() {
        return Err(Problem::invalid(
            "/site",
            "Vyberte podporovaný web nebo jeho přesnou adresu uvedenou v dokumentaci API.",
        ));
    }
    let mut request = request;
    request.site = research::site(&request.site).unwrap().0.into();
    jobs::submit(
        &state,
        jobs::Kind::Research,
        serde_json::to_value(request).unwrap(),
    )
}

struct Problem {
    status: StatusCode,
    detail: String,
    errors: Option<Value>,
}

impl Problem {
    fn new(status: StatusCode, detail: &str) -> Self {
        Self {
            status,
            detail: detail.into(),
            errors: None,
        }
    }
    fn invalid(pointer: &str, message: &str) -> Self {
        Self {
            errors: Some(json!([{ "pointer": pointer, "message": message }])),
            ..Self::new(StatusCode::BAD_REQUEST, message)
        }
    }
}

impl IntoResponse for Problem {
    fn into_response(self) -> Response {
        let title = match self.status {
            StatusCode::BAD_REQUEST => "Neplatný požadavek",
            StatusCode::NOT_FOUND => "Nenalezeno",
            StatusCode::METHOD_NOT_ALLOWED => "Nepovolená metoda",
            StatusCode::PAYLOAD_TOO_LARGE => "Příliš velký požadavek",
            StatusCode::UNSUPPORTED_MEDIA_TYPE => "Nepodporovaný typ obsahu",
            StatusCode::TOO_MANY_REQUESTS => "Překročena kapacita služby",
            StatusCode::SERVICE_UNAVAILABLE => "Služba je dočasně nedostupná",
            _ => "Vnitřní chyba serveru",
        };
        let mut body = json!({
            "type": "about:blank", "title": title,
            "status": self.status.as_u16(), "detail": self.detail
        });
        if let Some(errors) = self.errors {
            body["errors"] = errors;
        }
        let mut response = (self.status, Json(body)).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            "application/problem+json".parse().unwrap(),
        );
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
        response
            .headers_mut()
            .insert(header::CONTENT_LANGUAGE, "cs".parse().unwrap());
        if matches!(
            self.status,
            StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE
        ) {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, "1".parse().unwrap());
        }
        response
    }
}
