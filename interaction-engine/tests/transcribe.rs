use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    Router,
    body::{Body, Bytes, to_bytes},
    http::{HeaderMap, Request, StatusCode, Uri},
};
use interaction_engine::{
    AppState, Config, app,
    transcribe::{Row, parse_medications},
};
use serde_json::{Value, json};
use tower::ServiceExt;

const PNG: &[u8] = &[137, 80, 78, 71, 13, 10, 26, 10];
const ROWS: &str = r#"[{"name":" CONCOR ","strength":" 5 mg ","schedule":"1/2 – 0 – 0"},{"name":null,"strength":null,"schedule":null}]"#;

#[derive(Default)]
struct Captured {
    path: String,
    api_key: Option<String>,
    content_type: Option<String>,
    body: Value,
}

async fn stub(reply: Value, status: StatusCode) -> (String, Arc<Mutex<Vec<Captured>>>) {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let sink = requests.clone();
    let router = Router::new().fallback(move |uri: Uri, headers: HeaderMap, body: Bytes| {
        let sink = sink.clone();
        let reply = reply.clone();
        async move {
            sink.lock().unwrap().push(Captured {
                path: uri.path().to_string(),
                api_key: headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
                content_type: headers
                    .get("content-type")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
                body: serde_json::from_slice(&body).unwrap_or(Value::Null),
            });
            (status, axum::Json(reply))
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (format!("http://{address}/api/v1"), requests)
}

fn canned(text: &str, finish: &str) -> Value {
    let content = if let Ok(rows) = serde_json::from_str::<Value>(text) {
        json!({"medications": rows}).to_string()
    } else {
        text.to_string()
    };
    json!({"choices": [{"finish_reason": finish,
        "message": {"role": "assistant", "content": content, "reasoning": "not output"}}]})
}

fn config(base: String, catalogue: Option<PathBuf>) -> Config {
    Config {
        bind: "127.0.0.1:0".parse().unwrap(),
        codex_bin: "/does/not/exist/codex".into(),
        model: None,
        service_tier: None,
        timeout: Duration::from_secs(5),
        max_concurrent: 1,
        jobs_path: tempfile::tempdir().unwrap().keep().join("jobs.sqlite3"),
        max_queued: 100,
        result_ttl: Duration::from_secs(86400),
        failure_ttl: Duration::from_secs(30),
        queue_timeout: Duration::from_secs(300),
        openrouter_api_base: base,
        openrouter_api_key: Some("proxy-key".into()),
        openrouter_model: "google/test-model:variant".into(),
        openrouter_timeout: Duration::from_secs(5),
        mock_transcribe: false,
        sukl_catalogue: catalogue
            .unwrap_or_else(|| PathBuf::from("/does/not/exist/medications.json")),
    }
}

fn catalogue_file(names: &[&str]) -> PathBuf {
    let path = tempfile::tempdir().unwrap().keep().join("medications.json");
    let records: Vec<Value> = names.iter().map(|name| json!({"name": name})).collect();
    std::fs::write(&path, serde_json::to_vec(&records).unwrap()).unwrap();
    path
}

async fn post_image(
    router: Router,
    content_type: &str,
    bytes: Vec<u8>,
) -> (StatusCode, HeaderMap, Vec<u8>) {
    let response = router
        .oneshot(
            Request::post("/transcribe")
                .header("content-type", content_type)
                .body(Body::from(bytes))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap()
        .to_vec();
    (status, headers, body)
}

fn assert_matches_openapi(value: &Value, name: &str) {
    let spec: Value = serde_yaml::from_str(include_str!("../openapi.yaml")).unwrap();
    let schema = json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": format!("#/components/schemas/{name}"),
        "components": spec["components"]
    });
    let validator = jsonschema::options()
        .should_validate_formats(true)
        .build(&schema)
        .unwrap();
    let errors: Vec<_> = validator
        .iter_errors(value)
        .map(|error| error.to_string())
        .collect();
    assert!(errors.is_empty(), "{errors:?}");
}

#[tokio::test]
async fn mock_transcription_returns_one_catalogue_name_without_calling_provider() {
    let (base, requests) = stub(json!({}), StatusCode::INTERNAL_SERVER_ERROR).await;
    let mut config = config(base, Some(catalogue_file(&["CONCOR", "ANOPYRIN"])));
    config.mock_transcribe = true;
    config.openrouter_api_key = None;
    config.openrouter_model.clear();
    let router = app(AppState::new(config).unwrap());
    for _ in 0..8 {
        let (status, headers, body) = post_image(router.clone(), "image/png", PNG.to_vec()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers["cache-control"], "no-store");
        let rows: Value = serde_json::from_slice(&body).unwrap();
        assert_matches_openapi(&rows, "TranscriptionRows");
        let rows = rows.as_array().unwrap();
        assert_eq!(rows.len(), 1);
        assert!(["CONCOR", "ANOPYRIN"].contains(&rows[0]["name"].as_str().unwrap()));
        assert!(rows[0]["strength"].is_null());
        assert!(rows[0]["schedule"].is_null());
    }
    assert!(requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mock_transcription_requires_a_usable_catalogue() {
    let (base, requests) = stub(json!({}), StatusCode::INTERNAL_SERVER_ERROR).await;
    for catalogue in [
        None,
        Some(catalogue_file(&[])),
        Some(catalogue_file(&["bad\nname"])),
    ] {
        let mut config = config(base.clone(), catalogue);
        config.mock_transcribe = true;
        config.openrouter_api_key = None;
        let router = app(AppState::new(config).unwrap());
        let (status, _, _) = post_image(router, "image/png", PNG.to_vec()).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    }
    assert!(requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn transcribes_with_catalogue_and_keeps_the_key_in_headers() {
    let (base, requests) = stub(canned(ROWS, "stop"), StatusCode::OK).await;
    let router = app(AppState::new(config(
        base.clone(),
        Some(catalogue_file(&["CONCOR", "ANOPYRIN"])),
    ))
    .unwrap());
    let (status, headers, body) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("cache-control").unwrap(), "no-store");
    let rows: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        rows,
        json!([{"name": "CONCOR", "strength": "5 mg", "schedule": "1/2-0-0"}, {"name": null, "strength": null, "schedule": null}])
    );
    assert_matches_openapi(&rows, "TranscriptionRows");

    let captured = requests.lock().unwrap();
    assert_eq!(captured.len(), 1);
    let request = &captured[0];
    assert_eq!(request.path, "/api/v1/chat/completions");
    assert_eq!(request.api_key.as_deref(), Some("Bearer proxy-key"));
    assert_eq!(request.content_type.as_deref(), Some("application/json"));
    assert_eq!(request.body["model"], "google/test-model:variant");
    assert_eq!(
        request.body["messages"][1]["content"][1]["type"],
        "image_url"
    );
    assert_eq!(
        request.body["messages"][1]["content"][1]["image_url"]["url"],
        "data:image/png;base64,iVBORw0KGgo="
    );
    assert!(!request.body.to_string().contains("proxy-key"));
    assert_eq!(request.body["provider"]["require_parameters"], true);
    assert_eq!(request.body["stream"], false);
    assert_eq!(request.body["max_tokens"], 8192);
    assert_eq!(request.body["response_format"]["type"], "json_schema");
    assert_eq!(
        request.body["response_format"]["json_schema"]["strict"],
        true
    );
    let schema = &request.body["response_format"]["json_schema"]["schema"];
    assert_eq!(schema["required"], json!(["medications"]));
    let rows_schema = &schema["properties"]["medications"];
    // A bounded array makes Gemini reject the request before generation.
    assert!(rows_schema.get("maxItems").is_none());
    assert_eq!(
        rows_schema["items"]["required"],
        json!(["name", "strength", "schedule"])
    );
    assert!(rows_schema["items"]["properties"]["strength"].is_object());
    let validator = jsonschema::validator_for(schema).unwrap();
    assert!(
        validator.is_valid(&json!({"medications": serde_json::from_str::<Value>(ROWS).unwrap()}))
    );
    assert!(!validator.is_valid(&json!({"medications": [{"name": "X"}]})));
    let prompt = request.body["messages"][0]["content"].as_str().unwrap();
    assert!(prompt.contains("<katalog>\nANOPYRIN\nCONCOR\n</katalog>"));
    assert!(prompt.contains("write that catalogue name exactly as listed"));
    assert!(prompt.contains("never take strengths, forms or dosing from the catalogue"));
}

#[tokio::test]
async fn no_catalogue_block_when_the_catalogue_is_unavailable() {
    let (base, requests) = stub(canned("[]", "stop"), StatusCode::OK).await;
    let router = app(AppState::new(config(base, None)).unwrap());
    let (status, _, _) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    let prompt = requests.lock().unwrap()[0].body["messages"][0]["content"].clone();
    assert!(!prompt.as_str().unwrap().contains("<katalog>"));
}

#[tokio::test]
async fn rejects_invalid_photos_and_missing_configuration_without_calling_provider() {
    let (base, requests) = stub(canned("[]", "stop"), StatusCode::OK).await;
    let router = app(AppState::new(config(base.clone(), None)).unwrap());
    let cases = [
        (
            "text/plain",
            PNG.to_vec(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ),
        ("image/png", Vec::new(), StatusCode::BAD_REQUEST),
        (
            "image/png",
            b"text".to_vec(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ),
        (
            "image/png",
            vec![0u8; interaction_engine::transcribe::MAX_IMAGE_BYTES + 1],
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
    ];
    for (content_type, bytes, expected) in cases {
        let (status, headers, _) = post_image(router.clone(), content_type, bytes).await;
        assert_eq!(status, expected, "{content_type}");
        assert_eq!(
            headers.get("content-type").unwrap(),
            "application/problem+json"
        );
    }
    let response = router
        .oneshot(Request::get("/transcribe").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert!(requests.lock().unwrap().is_empty());

    let mut missing = config(base, None);
    missing.openrouter_api_key = None;
    let router = app(AppState::new(missing).unwrap());
    let (status, _, _) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn maps_provider_failures_to_problem_statuses() {
    let cases: Vec<(Value, StatusCode, StatusCode)> = vec![
        (
            json!({}),
            StatusCode::TOO_MANY_REQUESTS,
            StatusCode::TOO_MANY_REQUESTS,
        ),
        (
            json!("private provider detail"),
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("[]", "content_filter"),
            StatusCode::OK,
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json!({"error": {"code": 429, "message": "private provider detail"}}),
            StatusCode::OK,
            StatusCode::TOO_MANY_REQUESTS,
        ),
        (
            json!({"choices": [{"finish_reason": "stop", "message": {"refusal": "blocked", "content": null}}]}),
            StatusCode::OK,
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json!({"choices": [{"finish_reason": "stop", "message": {"content": "[]"}}]}),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            json!({"choices": [{"finish_reason": "stop", "message": {"content": "{\"medications\":[],\"extra\":1}"}}]}),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            json!({"choices": []}),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("[]", "length"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("not json", "stop"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(
                &json!(vec![
                    json!({"name": "X", "strength": null, "schedule": null});
                    201
                ])
                .to_string(),
                "stop",
            ),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(
                &json!([{"name": "X", "strength": "x".repeat(121), "schedule": null}]).to_string(),
                "stop",
            ),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(
                r#"[{"name":"X","strength":null,"schedule":null,"extra":1}]"#,
                "stop",
            ),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
    ];
    for (reply, provider_status, expected) in cases {
        let (base, _) = stub(reply, provider_status).await;
        let router = app(AppState::new(config(base, None)).unwrap());
        let (status, headers, body) = post_image(router, "image/png", PNG.to_vec()).await;
        assert_eq!(status, expected);
        assert_eq!(
            headers.get("content-type").unwrap(),
            "application/problem+json"
        );
        let problem: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(problem["status"], expected.as_u16());
        assert!(!String::from_utf8_lossy(&body).contains("private provider detail"));
    }
}

#[tokio::test]
async fn logs_provider_error_details_without_exposing_the_api_key() {
    #[derive(Clone)]
    struct LogWriter(Arc<Mutex<Vec<u8>>>);
    impl std::io::Write for LogWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    let logs = Arc::new(Mutex::new(Vec::new()));
    let writer = LogWriter(logs.clone());
    let subscriber = tracing_subscriber::fmt()
        .without_time()
        .with_ansi(false)
        .with_writer(move || writer.clone())
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();

    for provider_status in [StatusCode::TOO_MANY_REQUESTS, StatusCode::BAD_REQUEST] {
        let (base, _) = stub(
            json!({"error": {"message": "Unsupported model; key=proxy-key"}}),
            provider_status,
        )
        .await;
        let router = app(AppState::new(config(base, None)).unwrap());
        let (status, _, body) = post_image(router, "image/png", PNG.to_vec()).await;
        assert_eq!(
            status,
            if provider_status == StatusCode::TOO_MANY_REQUESTS {
                StatusCode::TOO_MANY_REQUESTS
            } else {
                StatusCode::BAD_GATEWAY
            }
        );
        let logs = String::from_utf8(logs.lock().unwrap().clone()).unwrap();
        assert!(logs.contains("Unsupported model"), "{logs}");
        assert!(logs.contains(provider_status.as_str()), "{logs}");
        assert!(logs.contains("chat/completions"), "{logs}");
        assert!(logs.contains("test-model"), "{logs}");
        assert!(logs.contains("[REDACTED]"), "{logs}");
        assert!(!logs.contains("proxy-key"), "{logs}");
        assert!(!String::from_utf8_lossy(&body).contains("Unsupported model"));
    }
}

#[tokio::test]
async fn unavailable_provider_yields_gateway_error() {
    let router = app(AppState::new(config("http://127.0.0.1:1/api/v1".into(), None)).unwrap());
    let (status, _, _) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
}

#[test]
fn parsing_normalizes_only_schedule_typography_and_rejects_incomplete_rows() {
    assert_eq!(
        parse_medications(ROWS).unwrap(),
        vec![
            Row {
                name: Some("CONCOR".into()),
                strength: Some("5 mg".into()),
                schedule: Some("1/2-0-0".into())
            },
            Row {
                name: None,
                strength: None,
                schedule: None
            }
        ]
    );
    for (text, schedule) in [
        ("0-0-0-1", "0-0-0-1"),
        ("1 – 0 – 1", "1-0-1"),
        ("V pondělí večer 1 tableta", "V pondělí večer 1 tableta"),
        ("1-2-3-4-5", "1-2-3-4-5"),
    ] {
        let rows = parse_medications(
            &json!([{"name": "X", "strength": null, "schedule": text}]).to_string(),
        )
        .unwrap();
        assert_eq!(rows[0].schedule.as_deref(), Some(schedule), "{text}");
    }
    for text in [
        "```json\n[]\n```",
        "{}",
        r#"[{"name":"X"}]"#,
        r#"[{"name":"X","schedule":null}]"#,
        r#"[{"name":"X","strength":null,"schedule":1}]"#,
        r#"[{"name":"X","strength":null,"schedule":null,"extra":1}]"#,
        r#"[{"name":"","strength":null,"schedule":null}]"#,
        r#"[{"name":"X\nY","strength":null,"schedule":null}]"#,
    ] {
        assert!(parse_medications(text).is_err(), "{text}");
    }
    for strength in [json!("875 mg/125 mg"), json!("50 mikrogramů"), Value::Null] {
        let rows = parse_medications(
            &json!([{"name": "X", "strength": strength, "schedule": null}]).to_string(),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&rows[0]).unwrap()["strength"],
            strength
        );
    }
    for strength in [json!(""), json!(5), json!("5\nmg"), json!("x".repeat(121))] {
        assert!(
            parse_medications(
                &json!([{"name": "X", "strength": strength, "schedule": null}]).to_string()
            )
            .is_err()
        );
    }
    let long = json!([{"name": "X", "strength": null, "schedule": "x".repeat(121)}]).to_string();
    assert!(parse_medications(&long).is_err());
    assert_eq!(parse_medications("[]").unwrap(), Vec::new());
}
