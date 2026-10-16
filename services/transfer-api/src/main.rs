mod crypto;
mod model;
mod store;

use std::{
    env,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, Path, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{SecondsFormat, TimeZone, Utc};
use model::{
    CreateTransferRequest, CreateTransferResponse, EncryptedEnvelope, RedeemTransferRequest,
    RedeemTransferResponse,
};
use serde::Serialize;
use sqlx::{sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions}, SqlitePool};
use store::TransferStore;
use tokio::time::{interval, MissedTickBehavior};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{error, info};
use uuid::Uuid;

const MAX_BODY_BYTES: usize = 384 * 1024;
const DEFAULT_BIND_ADDRESS: &str = "127.0.0.1:3000";
const DEFAULT_DATABASE_PATH: &str = "services/transfer-api/data/transfers.sqlite3";

#[derive(Clone)]
struct AppState {
    store: TransferStore,
    pepper: Arc<Vec<u8>>,
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
}

#[derive(Debug, Serialize)]
struct CreateBlobResponse {
    pin: String,
}

enum ApiError {
    BadRequest,
    NotFound,
    RateLimited,
    Unavailable,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match self {
            Self::BadRequest => (StatusCode::BAD_REQUEST, "bad_request"),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            Self::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
        };
        let mut response = (status, Json(ErrorBody { error: code })).into_response();
        if status == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static("60"));
        }
        response
    }
}

struct Config {
    bind_address: SocketAddr,
    database_path: PathBuf,
    pepper: Vec<u8>,
    cors_origins: Vec<HeaderValue>,
}

impl Config {
    fn from_env() -> Result<Self, String> {
        let bind_address = env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| DEFAULT_BIND_ADDRESS.to_owned())
            .parse()
            .map_err(|_| "BIND_ADDRESS must be a socket address".to_owned())?;
        let database_path = env::var_os("PILLGAZE_DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(DEFAULT_DATABASE_PATH));
        let pepper = env::var("TRANSFER_HMAC_SECRET")
            .map_err(|_| "TRANSFER_HMAC_SECRET must be set".to_owned())?
            .into_bytes();
        if pepper.len() < 32 {
            return Err("TRANSFER_HMAC_SECRET must be at least 32 bytes".to_owned());
        }
        let cors_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(|origin| origin.parse::<HeaderValue>())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "CORS_ALLOWED_ORIGINS contains an invalid origin".to_owned())?;
        Ok(Self { bind_address, database_path, pepper, cors_origins })
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env().map_err(std::io::Error::other)?;
    if let Some(parent) = config.database_path.parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    let options = SqliteConnectOptions::new()
        .filename(&config.database_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;
    migrate(&pool).await?;

    let store = TransferStore::new(pool);
    let state = AppState { store, pepper: Arc::new(config.pepper) };
    start_cleanup_worker(state.store.clone());

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(config.cors_origins.clone()))
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            HeaderName::from_static("idempotency-key"),
        ]);

    let app = Router::new()
        .route("/", get(demo_index))
        .route("/demo", get(demo_index))
        .route("/demo/patient", get(patient_page))
        .route("/demo/doctor", get(doctor_page))
        .route("/demo/app.js", get(demo_script))
        .route("/demo/styles.css", get(demo_styles))
        .route("/health/live", get(liveness))
        .route("/health/ready", get(readiness))
        .route("/v1/transfers", post(create_blob))
        .route("/v1/encrypted-transfers", post(create_transfer))
        .route("/v1/transfers/redeem", post(redeem_transfer))
        .route("/v1/transfers/{transfer_id}", delete(revoke_transfer))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(cors)
        .layer(middleware::from_fn(response_security_headers))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(config.bind_address).await?;
    info!(address = %config.bind_address, "PillGaze transfer API listening");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn migrate(pool: &SqlitePool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations-sqlite").run(pool).await
}

fn start_cleanup_worker(store: TransferStore) {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(60));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            if let Err(error) = store.cleanup().await {
                error!(%error, "transfer cleanup failed");
            }
        }
    });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn liveness() -> StatusCode {
    StatusCode::OK
}

async fn demo_index() -> Redirect {
    Redirect::temporary("/demo/patient")
}

async fn patient_page() -> Html<&'static str> {
    Html(include_str!("../../../apps/transfer-demo/patient.html"))
}

async fn doctor_page() -> Html<&'static str> {
    Html(include_str!("../../../apps/transfer-demo/doctor.html"))
}

async fn demo_script() -> Response {
    let mut response = include_str!("../../../apps/transfer-demo/app.js").into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/javascript; charset=utf-8"),
    );
    response
}

async fn demo_styles() -> Response {
    let mut response = include_str!("../../../apps/transfer-demo/styles.css").into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/css; charset=utf-8"),
    );
    response
}

async fn response_security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        HeaderName::from_static("content-security-policy"),
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
        ),
    );
    response.headers_mut().insert(
        HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("no-referrer"),
    );
    response
}

async fn readiness(State(state): State<AppState>) -> Result<StatusCode, ApiError> {
    state.store.ready().await.map_err(|error| {
        error!(%error, "readiness database check failed");
        ApiError::Unavailable
    })?;
    Ok(StatusCode::OK)
}

async fn create_blob(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<CreateBlobResponse>), ApiError> {
    let now = Utc::now().timestamp();
    enforce_source_limit(&state, address.ip(), b"rate:create:source", 30, now).await?;
    // Validate JSON syntax only. Preserve the original bytes, including whitespace
    // and field ordering; no medication schema or encryption envelope is required.
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"));
    if !is_json || serde_json::from_slice::<serde_json::Value>(&body).is_err() {
        return Err(ApiError::BadRequest);
    }

    for _ in 0..10 {
        let pin = crypto::new_pin().map_err(|_| ApiError::Unavailable)?;
        let pin_digest = crypto::digest(&state.pepper, b"blob-pin:v1", pin.as_bytes());
        let created = state.store.create_blob(&pin_digest, &body, now).await.map_err(|_| {
            // Do not include database errors: they might contain payload details.
            error!("blob transfer creation failed");
            ApiError::Unavailable
        })?;
        if created {
            return Ok((StatusCode::CREATED, Json(CreateBlobResponse { pin })));
        }
    }
    Err(ApiError::Unavailable)
}

async fn create_transfer(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(request): Json<CreateTransferRequest>,
) -> Result<(StatusCode, Json<CreateTransferResponse>), ApiError> {
    let now = Utc::now().timestamp();
    enforce_source_limit(&state, address.ip(), b"rate:create:source", 30, now).await?;
    let expires_in_seconds = request.expires_in_seconds.unwrap_or(900);
    if !(60..=3600).contains(&expires_in_seconds) {
        return Err(ApiError::BadRequest);
    }
    let envelope = request.envelope.decode().map_err(|_| ApiError::BadRequest)?;

    let retrieval_code = crypto::new_retrieval_code().map_err(|error| {
        error!(%error, "retrieval-code generation failed");
        ApiError::Unavailable
    })?;
    let revocation_token = crypto::new_revocation_token().map_err(|error| {
        error!(%error, "revocation-token generation failed");
        ApiError::Unavailable
    })?;
    let retrieval_digest = crypto::digest(
        &state.pepper,
        b"retrieval-code:v1",
        retrieval_code.as_bytes(),
    );
    let revocation_digest = crypto::digest(
        &state.pepper,
        b"revocation-token:v1",
        revocation_token.as_bytes(),
    );
    let transfer_id = Uuid::new_v4().to_string();
    let expires_at = now + i64::from(expires_in_seconds);

    state
        .store
        .create(
            &transfer_id,
            &retrieval_digest,
            &revocation_digest,
            envelope,
            now,
            expires_at,
        )
        .await
        .map_err(|error| {
            error!(%error, "transfer creation failed");
            ApiError::Unavailable
        })?;

    Ok((
        StatusCode::CREATED,
        Json(CreateTransferResponse {
            transfer_id,
            retrieval_code,
            revocation_token,
            expires_at: format_timestamp(expires_at)?,
        }),
    ))
}

async fn redeem_transfer(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(request): Json<RedeemTransferRequest>,
) -> Result<Json<RedeemTransferResponse>, ApiError> {
    let now = Utc::now().timestamp();
    enforce_source_limit(&state, address.ip(), b"rate:redeem:source", 20, now).await?;
    if !crypto::valid_retrieval_code(&request.retrieval_code) {
        return Err(ApiError::NotFound);
    }
    let idempotency_key = headers
        .get("Idempotency-Key")
        .and_then(|value| value.to_str().ok())
        .filter(|value| (22..=128).contains(&value.len()) && value.is_ascii())
        .ok_or(ApiError::BadRequest)?;
    let code_digest = crypto::digest(
        &state.pepper,
        b"retrieval-code:v1",
        request.retrieval_code.as_bytes(),
    );
    if !state
        .store
        .allow_code_attempt(&state.pepper, &code_digest, 5, now)
        .await
        .map_err(|error| {
            error!(%error, "code rate-limit check failed");
            ApiError::Unavailable
        })?
    {
        return Err(ApiError::RateLimited);
    }
    let idempotency_digest = crypto::digest(
        &state.pepper,
        b"redemption-idempotency:v1",
        idempotency_key.as_bytes(),
    );
    let record = state
        .store
        .redeem(&code_digest, &idempotency_digest, now)
        .await
        .map_err(|error| {
            error!(%error, "transfer redemption failed");
            ApiError::Unavailable
        })?
        .ok_or(ApiError::NotFound)?;

    let envelope = EncryptedEnvelope::from_stored(
        record.envelope_format,
        record.format_version,
        record.algorithm,
        &record.nonce,
        &record.ciphertext,
    );
    Ok(Json(RedeemTransferResponse {
        transfer_id: record.id,
        envelope,
        expires_at: format_timestamp(record.expires_at)?,
    }))
}

async fn revoke_transfer(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Path(transfer_id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let now = Utc::now().timestamp();
    enforce_source_limit(&state, address.ip(), b"rate:revoke:source", 60, now).await?;
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::NotFound)?;
    let digest = crypto::digest(&state.pepper, b"revocation-token:v1", token.as_bytes());
    let revoked = state
        .store
        .revoke(&transfer_id, &digest, now)
        .await
        .map_err(|error| {
            error!(%error, "transfer revocation failed");
            ApiError::Unavailable
        })?;
    if revoked {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

async fn enforce_source_limit(
    state: &AppState,
    source: IpAddr,
    purpose: &[u8],
    limit: i64,
    now: i64,
) -> Result<(), ApiError> {
    let allowed = state
        .store
        .allow_source(&state.pepper, purpose, source, limit, now)
        .await
        .map_err(|error| {
            error!(%error, "source rate-limit check failed");
            ApiError::Unavailable
        })?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::RateLimited)
    }
}

fn format_timestamp(timestamp: i64) -> Result<String, ApiError> {
    Utc.timestamp_opt(timestamp, 0)
        .single()
        .map(|datetime| datetime.to_rfc3339_opts(SecondsFormat::Secs, true))
        .ok_or(ApiError::Unavailable)
}

#[cfg(test)]
mod blob_tests {
    use super::*;

    async fn state() -> AppState {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&pool).await.unwrap();
        AppState { store: TransferStore::new(pool), pepper: Arc::new(vec![42; 32]) }
    }

    fn json_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    #[tokio::test]
    async fn upload_returns_only_pin_for_arbitrary_json() {
        let state = state().await;
        for payload in ["{\"unexpected\":[1,null,true]}", "[1,2]", "null", "42", "\"text\""] {
            let (status, Json(response)) = create_blob(
                State(state.clone()),
                ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                json_headers(),
                Bytes::from(payload),
            ).await.unwrap_or_else(|_| panic!("valid JSON rejected"));
            assert_eq!(status, StatusCode::CREATED);
            assert_eq!(response.pin.len(), 6);
            let value = serde_json::to_value(response).unwrap();
            assert_eq!(value.as_object().unwrap().len(), 1);
            assert!(value.get("pin").is_some());
        }
    }

    #[tokio::test]
    async fn rejects_invalid_json_and_wrong_content_type() {
        for (headers, payload) in [(json_headers(), "not json"), (HeaderMap::new(), "{}")] {
            let result = create_blob(
                State(state().await),
                ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                headers,
                Bytes::from(payload),
            ).await;
            assert!(matches!(result, Err(ApiError::BadRequest)));
        }
    }
}
