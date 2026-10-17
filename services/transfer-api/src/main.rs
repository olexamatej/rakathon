mod admin;
mod crypto;
mod store;

use std::{
    env,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, atomic::{AtomicU64, Ordering}},
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, Path, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Serialize;
use sqlx::{sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions}, SqlitePool};
use store::TransferStore;
use tokio::time::{interval, MissedTickBehavior};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{error, info};

static NEXT_READ_ID: AtomicU64 = AtomicU64::new(1);

const MAX_BODY_BYTES: usize = 1024 * 1024;
const DEFAULT_BIND_ADDRESS: &str = "127.0.0.1:3000";
const DEFAULT_DATABASE_PATH: &str = "services/transfer-api/data/transfers.sqlite3";

#[derive(Clone)]
struct AppState {
    store: TransferStore,
    pepper: Arc<Vec<u8>>,
    admin_password_digest: Option<[u8; 32]>,
    admin_debug_visibility: bool,
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
    Unauthorized,
    BadRequest,
    NotFound,
    RateLimited,
    Unavailable,
}

impl ApiError {
    fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            Self::BadRequest => (StatusCode::BAD_REQUEST, "bad_request"),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            Self::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();
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
    admin_password_digest: Option<[u8; 32]>,
    admin_debug_visibility: bool,
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
        let admin_password_digest = match env::var("STORAGE_ADMIN_PASSWORD") {
            Ok(password) if !password.is_empty() && password.len() <= 256 =>
                Some(crypto::digest(&pepper, b"storage-admin:password:v1", password.as_bytes())),
            Ok(_) => return Err("STORAGE_ADMIN_PASSWORD must be 1–256 bytes or unset".to_owned()),
            Err(env::VarError::NotPresent) => None,
            Err(_) => return Err("STORAGE_ADMIN_PASSWORD must be valid Unicode".to_owned()),
        };
        let admin_debug_visibility = env::var("STORAGE_ADMIN_DEBUG_VISIBILITY").is_ok_and(|v| v == "true");
        Ok(Self { bind_address, database_path, pepper, cors_origins, admin_password_digest, admin_debug_visibility })
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
    let state = AppState {
        store, pepper: Arc::new(config.pepper),
        admin_password_digest: config.admin_password_digest,
        admin_debug_visibility: config.admin_debug_visibility,
    };
    start_cleanup_worker(state.store.clone());

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(config.cors_origins.clone()))
        .allow_methods([Method::GET, Method::POST, Method::PUT])
        .allow_headers([header::CONTENT_TYPE])
        .expose_headers([HeaderName::from_static("x-uploaded-at")]);

    let app = storage_router(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(config.bind_address).await?;
    info!(address = %config.bind_address, "PillGaze transfer API listening");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn storage_router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(liveness))
        .route("/health/ready", get(readiness))
        .route("/v1/admin/blobs", get(admin::list_blobs).delete(admin::delete_all_blobs))
        .route("/v1/admin/blobs/{pin_digest}", delete(admin::delete_blob))
        .route("/v1/transfers", post(create_blob))
        .route("/v1/transfers/{pin}", get(get_blob).put(update_blob))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn(response_security_headers))
        .with_state(state)
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
            if store.cleanup().await.is_err() {
                error!("rate-limit cleanup failed");
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

    // Every POST is an independent upload, even for byte-identical payloads.
    // Retry only PIN collisions; never reuse a PIN based on the payload.
    for _ in 0..10 {
        let pin = crypto::new_pin().map_err(|_| ApiError::Unavailable)?;
        let pin_digest = crypto::digest(&state.pepper, b"blob-pin:v1", pin.as_bytes());
        let debug_pin = state.admin_debug_visibility.then_some(pin.as_str());
        let created = state.store.create_blob(&pin_digest, debug_pin, &body, now).await.map_err(|_| {
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

async fn update_blob(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Path(pin): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<CreateBlobResponse>, ApiError> {
    let now = Utc::now().timestamp();
    // Share the write budget with POST, including invalid update attempts.
    enforce_source_limit(&state, address.ip(), b"rate:create:source", 30, now).await?;
    if !crypto::valid_pin(&pin) {
        return Err(ApiError::NotFound);
    }
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"));
    if !is_json || serde_json::from_slice::<serde_json::Value>(&body).is_err() {
        return Err(ApiError::BadRequest);
    }
    let digest = crypto::digest(&state.pepper, b"blob-pin:v1", pin.as_bytes());
    let updated = state.store.update_blob(&digest, &body, now).await.map_err(|_| {
        error!("blob transfer update failed");
        ApiError::Unavailable
    })?;
    if !updated {
        return Err(ApiError::NotFound);
    }
    Ok(Json(CreateBlobResponse { pin }))
}

async fn get_blob(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Path(pin): Path<String>,
) -> Result<Response, ApiError> {
    // POC audit: the identity is a placeholder, not an authenticated account.
    // Debug formatting escapes user-controlled PIN text onto a single log line.
    let read_id = NEXT_READ_ID.fetch_add(1, Ordering::Relaxed);
    let logged_pin: String = pin.chars().take(128).collect();
    info!(
        event = "storage_read_attempt", read_id, timestamp = %Utc::now().to_rfc3339(),
        pin = ?logged_pin, user = "poc-user", source_ip = %address.ip(),
        "storage read attempt"
    );
    let result: Result<Response, ApiError> = async {
        let now = Utc::now().timestamp();
        enforce_source_limit(&state, address.ip(), b"rate:get:source", 20, now).await?;
        if !crypto::valid_pin(&pin) {
            return Err(ApiError::NotFound);
        }
        let pin_digest = crypto::digest(&state.pepper, b"blob-pin:v1", pin.as_bytes());
        let (payload, uploaded_at) = state
            .store
            .get_blob_with_uploaded_at(&pin_digest)
            .await
            .map_err(|_| {
                error!("blob transfer lookup failed");
                ApiError::Unavailable
            })?
            .ok_or(ApiError::NotFound)?;
        let uploaded_at = chrono::DateTime::from_timestamp(uploaded_at, 0)
            .ok_or(ApiError::Unavailable)?.to_rfc3339();
        Ok(([(header::CONTENT_TYPE.as_str(), "application/json"),
            ("x-uploaded-at", uploaded_at.as_str())], payload).into_response())
    }.await;
    let status = match &result {
        Ok(response) => response.status(),
        Err(error) => error.status_and_code().0,
    };
    info!(
        event = "storage_read_result", read_id, timestamp = %Utc::now().to_rfc3339(),
        pin = ?logged_pin, user = "poc-user", source_ip = %address.ip(),
        status = status.as_u16(), "storage read result"
    );
    result
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

#[cfg(test)]
mod blob_tests {
    use super::*;
    use tower::ServiceExt;

    #[tokio::test]
    async fn router_enforces_one_mib_and_removes_legacy_routes() {
        let app = storage_router(state().await);
        for (size, status) in [(MAX_BODY_BYTES, StatusCode::CREATED), (MAX_BODY_BYTES + 1, StatusCode::PAYLOAD_TOO_LARGE)] {
            let payload = format!("\"{}\"", "x".repeat(size - 2));
            let mut request = Request::builder().method("POST").uri("/v1/transfers")
                .header(header::CONTENT_TYPE, "application/json")
                .body(axum::body::Body::from(payload)).unwrap();
            request.extensions_mut().insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), status);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        }
        for (method, uri, status) in [
            ("POST", "/v1/encrypted-transfers", StatusCode::NOT_FOUND),
            ("POST", "/v1/transfers/redeem", StatusCode::METHOD_NOT_ALLOWED),
            ("DELETE", "/v1/transfers/AAAAAA", StatusCode::METHOD_NOT_ALLOWED),
            ("GET", "/demo/patient", StatusCode::NOT_FOUND),
        ] {
            let request = Request::builder().method(method).uri(uri)
                .body(axum::body::Body::empty()).unwrap();
            assert_eq!(app.clone().oneshot(request).await.unwrap().status(), status);
        }
    }

    async fn state() -> AppState {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&pool).await.unwrap();
        AppState {
            store: TransferStore::new(pool), pepper: Arc::new(vec![42; 32]),
            admin_password_digest: None,
            admin_debug_visibility: false,
        }
    }

    fn json_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    #[tokio::test]
    async fn put_replaces_only_existing_blob_preserves_pin_and_rejects_bad_requests() {
        let state = state().await;
        let address = "127.0.0.1:1234".parse::<SocketAddr>().unwrap();
        let (_, Json(receipt)) = create_blob(State(state.clone()), ConnectInfo(address),
            json_headers(), Bytes::from_static(b"{\"old\":true}")).await.unwrap_or_else(|_| panic!("create failed"));
        let app = storage_router(state.clone());
        let payload = b" { \"edited\": [true, null] }\n";
        for (pin, body, content_type, expected) in [
            (receipt.pin.as_str(), payload.as_slice(), "application/json", StatusCode::OK),
            (receipt.pin.as_str(), b"not json".as_slice(), "application/json", StatusCode::BAD_REQUEST),
            (receipt.pin.as_str(), b"{}".as_slice(), "text/plain", StatusCode::BAD_REQUEST),
            ("ABC234", b"{}".as_slice(), "application/json", StatusCode::NOT_FOUND),
            ("invalid", b"{}".as_slice(), "application/json", StatusCode::NOT_FOUND),
        ] {
            // Ensure the deterministic missing PIN cannot collide with the generated PIN.
            if pin == "ABC234" && receipt.pin == pin { continue; }
            let mut request = Request::builder().method("PUT").uri(format!("/v1/transfers/{pin}"))
                .header(header::CONTENT_TYPE, content_type)
                .body(axum::body::Body::from(body.to_vec())).unwrap();
            request.extensions_mut().insert(ConnectInfo(address));
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), expected);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            if expected == StatusCode::OK {
                let bytes = axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES).await.unwrap();
                assert_eq!(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap(), serde_json::json!({"pin": receipt.pin}));
            }
        }
        let digest = crypto::digest(&state.pepper, b"blob-pin:v1", receipt.pin.as_bytes());
        assert_eq!(state.store.get_blob(&digest).await.unwrap().unwrap(), payload);
        assert_eq!(state.store.list_blobs(0, false).await.unwrap().len(), 1);
        let mut request = Request::builder().method("PUT").uri(format!("/v1/transfers/{}", receipt.pin))
            .header(header::CONTENT_TYPE, "application/json")
            .body(axum::body::Body::from(vec![b' '; MAX_BODY_BYTES + 1])).unwrap();
        request.extensions_mut().insert(ConnectInfo(address));
        assert_eq!(app.oneshot(request).await.unwrap().status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(state.store.get_blob(&digest).await.unwrap().unwrap(), payload);
    }

    #[derive(Clone)]
    struct AuditWriter(Arc<std::sync::Mutex<Vec<u8>>>);

    impl std::io::Write for AuditWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> { Ok(()) }
    }

    #[tokio::test]
    async fn read_audit_records_pin_time_identity_and_all_outcomes_without_payload() {
        use tracing::instrument::WithSubscriber;
        let output = Arc::new(std::sync::Mutex::new(Vec::new()));
        let writer = AuditWriter(output.clone());
        let subscriber = tracing_subscriber::fmt().without_time().with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .with_writer(move || writer.clone()).finish();
        async {
            let state = state().await;
            let address = "127.0.0.1:1234".parse::<SocketAddr>().unwrap();
            let (_, Json(receipt)) = create_blob(State(state.clone()), ConnectInfo(address),
                json_headers(), Bytes::from_static(b"{\"secret\":\"not-in-audit\"}"))
                .await.unwrap_or_else(|_| panic!("create failed"));
            let missing = if receipt.pin == "ABC234" { "DEF567" } else { "ABC234" };
            for (pin, status) in [(receipt.pin.as_str(), StatusCode::OK),
                (missing, StatusCode::NOT_FOUND), ("bad\nPIN", StatusCode::NOT_FOUND)] {
                let result = get_blob(State(state.clone()), ConnectInfo(address), Path(pin.to_owned())).await;
                assert_eq!(result.into_response().status(), status);
            }
            let now = Utc::now().timestamp();
            // Fill this and the next minute's bucket to avoid a boundary race.
            for period in [now, now + 60] {
                for _ in 0..20 {
                    state.store.allow_source(&state.pepper, b"rate:get:source", address.ip(), 20, period).await.unwrap();
                }
            }
            assert_eq!(get_blob(State(state.clone()), ConnectInfo(address), Path(receipt.pin.clone()))
                .await.into_response().status(), StatusCode::TOO_MANY_REQUESTS);
            let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
            pool.close().await;
            let mut unavailable = state;
            unavailable.store = TransferStore::new(pool);
            assert_eq!(get_blob(State(unavailable), ConnectInfo(address), Path(receipt.pin.clone()))
                .await.into_response().status(), StatusCode::SERVICE_UNAVAILABLE);
            let logs = String::from_utf8(output.lock().unwrap().clone()).unwrap();
            assert!(logs.contains(&format!("pin=\"{}\"", receipt.pin)));
            assert!(logs.contains("pin=\"bad\\nPIN\""));
        }.with_subscriber(subscriber).await;
        let logs = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        let attempts: Vec<_> = logs.lines().filter(|line| line.contains("event=\"storage_read_attempt\"")).collect();
        let results: Vec<_> = logs.lines().filter(|line| line.contains("event=\"storage_read_result\"")).collect();
        assert_eq!(attempts.len(), 5);
        assert_eq!(results.len(), 5);
        for line in attempts.iter().chain(results.iter()) {
            assert!(line.contains("read_id="));
            assert!(line.contains("timestamp="));
            assert!(line.contains("user=\"poc-user\""));
            assert!(line.contains("source_ip=127.0.0.1"));
        }
        for status in [200, 404, 429, 503] { assert!(logs.contains(&format!("status={status}"))); }
        assert!(!logs.contains("not-in-audit"));
    }

    #[tokio::test]
    async fn get_returns_original_json_repeatedly() {
        let state = state().await;
        let payload = " {\"z\":null, \"a\": [1,2]}\n";
        let (_, Json(receipt)) = create_blob(
            State(state.clone()),
            ConnectInfo("127.0.0.1:1234".parse().unwrap()),
            json_headers(),
            Bytes::from(payload),
        ).await.unwrap_or_else(|_| panic!("upload failed"));
        for _ in 0..2 {
            let response = get_blob(
                State(state.clone()),
                ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                Path(receipt.pin.clone()),
            ).await.unwrap_or_else(|_| panic!("lookup failed"));
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
            assert!(chrono::DateTime::parse_from_rfc3339(response.headers()["x-uploaded-at"].to_str().unwrap()).is_ok());
            let body = axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES).await.unwrap();
            assert_eq!(&body[..], payload.as_bytes());
        }
    }

    #[tokio::test]
    async fn identical_uploads_have_distinct_pins_and_independent_storage() {
        let state = state().await;
        let app = storage_router(state.clone());
        let payload = " {\"photos\":[\"synthetic-photo\"],\"text\":\"same list\"}\n";
        let mut pins = Vec::new();
        for _ in 0..2 {
            let mut request = Request::builder().method("POST").uri("/v1/transfers")
                .header(header::CONTENT_TYPE, "application/json")
                .body(axum::body::Body::from(payload)).unwrap();
            request.extensions_mut().insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), StatusCode::CREATED);
            let body = axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES).await.unwrap();
            let receipt: serde_json::Value = serde_json::from_slice(&body).unwrap();
            pins.push(receipt["pin"].as_str().unwrap().to_owned());
        }
        assert_ne!(pins[0], pins[1]);
        assert_eq!(state.store.list_blobs(0, false).await.unwrap().len(), 2);
        for pin in &pins {
            let response = get_blob(
                State(state.clone()),
                ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                Path(pin.clone()),
            ).await.unwrap_or_else(|_| panic!("lookup failed"));
            let body = axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES).await.unwrap();
            assert_eq!(&body[..], payload.as_bytes());
        }
        let first_digest = crypto::digest(&state.pepper, b"blob-pin:v1", pins[0].as_bytes());
        let second_digest = crypto::digest(&state.pepper, b"blob-pin:v1", pins[1].as_bytes());
        assert!(state.store.delete_blob(&first_digest).await.unwrap());
        assert!(state.store.get_blob(&first_digest).await.unwrap().is_none());
        assert_eq!(state.store.get_blob(&second_digest).await.unwrap().unwrap(), payload.as_bytes());
        assert_eq!(state.store.list_blobs(0, false).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn get_rejects_unknown_and_invalid_pins() {
        let state = state().await;
        for pin in ["AAAAAA", "abc", "123456789012", "!!!!!!"] {
            let result = get_blob(
                State(state.clone()),
                ConnectInfo("127.0.0.1:1234".parse().unwrap()),
                Path(pin.to_owned()),
            ).await;
            assert!(matches!(result, Err(ApiError::NotFound)));
        }
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
