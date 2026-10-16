use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use crate::{crypto, enforce_source_limit, store::BlobMetadata, ApiError, AppState};

#[derive(Default, Deserialize)]
pub struct Pagination {
    #[serde(default)]
    offset: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobList {
    items: Vec<BlobMetadata>,
    has_more: bool,
}

async fn authorize(state: &AppState, address: SocketAddr, headers: &HeaderMap) -> Result<(), ApiError> {
    let expected = state.admin_password_digest.as_ref().ok_or(ApiError::NotFound)?;
    // Includes successful requests: bounded even when the password is known.
    // Behind the VPS proxy this bucket is shared; never trust arbitrary forwarded IPs.
    enforce_source_limit(state, address.ip(), b"rate:storage-admin:source", 60, Utc::now().timestamp()).await?;
    let password = headers.get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or(ApiError::Unauthorized)?;
    if !crypto::verify_digest(&state.pepper, b"storage-admin:password:v1", password.as_bytes(), expected) {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

pub async fn list_blobs(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(pagination): Query<Pagination>,
) -> Result<Json<BlobList>, ApiError> {
    authorize(&state, address, &headers).await?;
    let mut items = state.store.list_blobs(pagination.offset).await.map_err(|_| ApiError::Unavailable)?;
    let has_more = items.len() > 100;
    items.truncate(100);
    Ok(Json(BlobList { items, has_more }))
}

pub async fn delete_blob(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Path(pin_digest): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, address, &headers).await?;
    let digest = parse_digest(&pin_digest).ok_or(ApiError::BadRequest)?;
    if state.store.delete_blob(&digest).await.map_err(|_| ApiError::Unavailable)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

fn parse_digest(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut digest = [0; 32];
    for (index, byte) in digest.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(digest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::sync::Arc;
    use crate::store::TransferStore;

    #[tokio::test]
    async fn router_protects_admin_and_returns_no_store() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;
        let app = crate::storage_router(state().await);
        for (method, uri, authenticated, expected) in [
            ("GET", "/v1/admin/blobs", false, StatusCode::UNAUTHORIZED),
            ("DELETE", "/v1/admin/blobs/invalid", false, StatusCode::UNAUTHORIZED),
            ("GET", "/v1/admin/blobs?offset=0", true, StatusCode::OK),
            ("DELETE", "/v1/admin/blobs/invalid", true, StatusCode::BAD_REQUEST),
        ] {
            let mut builder = Request::builder().method(method).uri(uri);
            if authenticated {
                builder = builder.header(header::AUTHORIZATION, "Bearer synthetic-test-password");
            }
            let mut request = builder.body(Body::empty()).unwrap();
            request.extensions_mut().insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), expected);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        }
    }

    async fn state() -> AppState {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        crate::migrate(&pool).await.unwrap();
        AppState {
            store: TransferStore::new(pool), pepper: Arc::new(vec![42; 32]),
            admin_password_digest: Some(crypto::digest(&[42; 32], b"storage-admin:password:v1", b"synthetic-test-password")),
        }
    }

    fn headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, "Bearer synthetic-test-password".parse().unwrap());
        headers
    }

    #[tokio::test]
    async fn metadata_only_and_delete_only_selected_blob() {
        let state = state().await;
        state.store.create_blob(&[1; 32], b" {\"synthetic\":true} ", 1).await.unwrap();
        state.store.create_blob(&[2; 32], b"null", 2).await.unwrap();
        let address = "127.0.0.1:1234".parse().unwrap();
        let Json(list) = list_blobs(State(state.clone()), ConnectInfo(address), headers(), Query(Pagination::default()))
            .await.unwrap_or_else(|_| panic!("list rejected"));
        let json = serde_json::to_value(&list).unwrap();
        assert_eq!(list.items.len(), 2);
        assert_eq!(list.items[0].size_bytes, 20);
        assert_eq!(json["items"][0].as_object().unwrap().len(), 2);
        assert!(json["items"][0].get("payload").is_none());
        let digest = list.items[0].pin_digest.clone();
        assert_eq!(delete_blob(State(state.clone()), ConnectInfo(address), Path(digest.clone()), headers())
            .await.unwrap_or_else(|_| panic!("delete rejected")), StatusCode::NO_CONTENT);
        assert!(matches!(delete_blob(State(state.clone()), ConnectInfo(address), Path(digest), headers()).await, Err(ApiError::NotFound)));
        assert!(matches!(delete_blob(State(state.clone()), ConnectInfo(address), Path("invalid".to_owned()), headers()).await, Err(ApiError::BadRequest)));
        assert!(state.store.get_blob(&[1; 32]).await.unwrap().is_none());
        assert_eq!(state.store.get_blob(&[2; 32]).await.unwrap().unwrap(), b"null");
        assert_eq!(state.store.list_blobs(0).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn both_endpoints_require_password_and_admin_defaults_to_disabled() {
        let mut state = state().await;
        let address = "127.0.0.1:1234".parse().unwrap();
        for token in ["", "Bearer wrong", "Basic synthetic-test-password"] {
            let mut headers = HeaderMap::new();
            headers.insert(header::AUTHORIZATION, token.parse().unwrap());
            assert!(matches!(list_blobs(State(state.clone()), ConnectInfo(address), headers.clone(), Query(Pagination::default())).await, Err(ApiError::Unauthorized)));
            assert!(matches!(delete_blob(State(state.clone()), ConnectInfo(address), Path("01".repeat(32)), headers).await, Err(ApiError::Unauthorized)));
        }
        state.admin_password_digest = None;
        assert!(matches!(authorize(&state, address, &headers()).await, Err(ApiError::NotFound)));
    }

    #[tokio::test]
    async fn pagination_and_attempt_limit() {
        let state = state().await;
        for n in 0..102 {
            state.store.create_blob(&[n; 32], b"null", 0).await.unwrap();
        }
        let address = "127.0.0.1:1234".parse().unwrap();
        let Json(first) = list_blobs(State(state.clone()), ConnectInfo(address), headers(), Query(Pagination::default())).await
            .unwrap_or_else(|_| panic!("list rejected"));
        assert_eq!(first.items.len(), 100);
        assert!(first.has_more);
        let Json(last) = list_blobs(State(state.clone()), ConnectInfo(address), headers(), Query(Pagination { offset: 100 })).await
            .unwrap_or_else(|_| panic!("list rejected"));
        assert_eq!(last.items.len(), 2);
        assert!(!last.has_more);
        // Pre-fill adjacent buckets to avoid a flaky wall-clock minute boundary.
        let now = Utc::now().timestamp();
        for time in [now, now + 60] {
            for _ in 0..60 {
                state.store.allow_source(&state.pepper, b"rate:storage-admin:source", address.ip(), 60, time).await.unwrap();
            }
        }
        assert!(matches!(authorize(&state, address, &headers()).await, Err(ApiError::RateLimited)));
    }

    #[test]
    fn rejects_invalid_digests() {
        assert_eq!(parse_digest(&"aB".repeat(32)), Some([0xab; 32]));
        for value in ["a".repeat(63), "z".repeat(64), "é".repeat(32)] {
            assert!(parse_digest(&value).is_none());
        }
    }
}
