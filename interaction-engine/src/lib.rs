mod codex;
pub mod model;
pub mod report;

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
use tokio::sync::Semaphore;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind: SocketAddr,
    pub codex_bin: PathBuf,
    pub model: Option<String>,
    pub timeout: Duration,
    pub max_concurrent: usize,
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
        Ok(Self {
            bind: env::var("BIND_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:3000".into())
                .parse()
                .context("invalid BIND_ADDR")?,
            codex_bin: env::var_os("CODEX_BIN")
                .map(PathBuf::from)
                .unwrap_or_else(|| "codex".into()),
            model: env::var("CODEX_MODEL").ok().filter(|s| !s.is_empty()),
            timeout: Duration::from_secs(timeout),
            max_concurrent,
        })
    }
}

#[derive(Clone)]
pub struct AppState {
    config: Arc<Config>,
    permits: Arc<Semaphore>,
}

impl AppState {
    pub fn new(mut config: Config) -> anyhow::Result<Self> {
        ensure!(
            config.max_concurrent > 0 && !config.timeout.is_zero(),
            "concurrency and timeout must be positive"
        );
        // Relative executable paths must survive a change to the scratch cwd.
        if config.codex_bin.components().count() > 1 && config.codex_bin.is_relative() {
            config.codex_bin = env::current_dir()?.join(&config.codex_bin);
        }
        Ok(Self {
            permits: Arc::new(Semaphore::new(config.max_concurrent)),
            config: Arc::new(config),
        })
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/interaction-checks", post(check))
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
        .fallback(|| async { Problem::new(StatusCode::NOT_FOUND, "Route not found.") })
        .method_not_allowed_fallback(|| async {
            Problem::new(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed.")
        })
        .layer(DefaultBodyLimit::max(64 * 1024))
        .with_state(state)
}

#[derive(Deserialize)]
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
        Problem::new(status, "Expected a JSON object containing only drugs: an array of 2 to 50 nonblank drug names, each at most 200 characters.")
    })?;
    if !(2..=50).contains(&request.drugs.len()) {
        return Err(Problem::invalid(
            "/drugs",
            "Supply between 2 and 50 drug names.",
        ));
    }
    for (index, name) in request.drugs.iter().enumerate() {
        if name.trim().is_empty() || name.chars().count() > 200 {
            return Err(Problem::invalid(
                &format!("/drugs/{index}"),
                "Drug names must be nonblank and at most 200 characters.",
            ));
        }
    }
    let permit = state.permits.clone().try_acquire_owned().map_err(|_| {
        Problem::new(
            StatusCode::TOO_MANY_REQUESTS,
            "All interaction check workers are busy. Retry shortly.",
        )
    })?;

    // The owned permit remains with the worker even if the HTTP client disconnects.
    // Each worker is bounded by the Codex timeout and reaps its process on failure.
    let task = tokio::spawn(async move {
        let _permit = permit;
        let result = codex::infer(&state.config, &request.drugs).await?;
        report::build_report(&request.drugs, result)
    });
    match task.await {
        Ok(Ok(report)) => Ok((
            [
                (header::CACHE_CONTROL, "no-store"),
                (
                    header::HeaderName::from_static("x-interaction-source"),
                    "model-knowledge",
                ),
                (
                    header::HeaderName::from_static("x-sources-verified"),
                    "false",
                ),
            ],
            Json(report),
        )
            .into_response()),
        Ok(Err(error)) => {
            // No input names, prompts, raw model output, or credentials in logs.
            tracing::warn!(error = %error, "interaction inference failed");
            Err(Problem::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "The inference service could not complete a valid interaction check. Retry later.",
            ))
        }
        Err(_) => Err(Problem::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The interaction check worker failed.",
        )),
    }
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
        let mut body = json!({
            "type": "about:blank", "title": self.status.canonical_reason().unwrap_or("Error"),
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
