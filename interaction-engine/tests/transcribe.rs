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
const ROWS: &str = r#"[{"name":" CONCOR ","strength":"5 mg","schedule":"1/2 – 0 – 0"},{"name":null,"strength":null,"schedule":null}]"#;

#[derive(Default)]
struct Captured {
    path: String,
    api_key: Option<String>,
    content_type: Option<String>,
    body: Value,
}

async fn stub(reply: Value, status: StatusCode) -> (String, Arc<Mutex<Vec<Captured>>>) {
    stub_sequence(vec![(reply, status)]).await
}

async fn stub_sequence(replies: Vec<(Value, StatusCode)>) -> (String, Arc<Mutex<Vec<Captured>>>) {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let sink = requests.clone();
    let replies = Arc::new(replies);
    let router = Router::new().fallback(move |uri: Uri, headers: HeaderMap, body: Bytes| {
        let sink = sink.clone();
        let replies = replies.clone();
        async move {
            let mut captured = sink.lock().unwrap();
            let reply = replies
                .get(captured.len())
                .cloned()
                .unwrap_or((json!({}), StatusCode::INTERNAL_SERVER_ERROR));
            captured.push(Captured {
                path: uri.path().to_string(),
                api_key: headers
                    .get("x-goog-api-key")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
                content_type: headers
                    .get("content-type")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
                body: serde_json::from_slice(&body).unwrap_or(Value::Null),
            });
            (reply.1, axum::Json(reply.0))
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (format!("http://{address}/v1beta"), requests)
}

fn canned(text: &str, finish: &str) -> Value {
    json!({"candidates": [{"finishReason": finish,
        "content": {"parts": [{"thought": true, "text": "not output"}, {"text": text}]}}]})
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
        gemini_api_base: base,
        gemini_api_key: Some("proxy-key".into()),
        gemini_model: "test-model".into(),
        gemini_timeout: Duration::from_secs(5),
        sukl_catalogue: catalogue
            .unwrap_or_else(|| PathBuf::from("/does/not/exist/medications.json")),
    }
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
async fn reads_image_before_matching_text_and_keeps_dosing_from_the_first_call() {
    let raw = json!([
        {"text":" paralen 500 ", "schedule":null},
        {"text":"Concord 5 mg", "schedule":"1/2 – 0 – 0"},
        {"text":"Letrox 50", "schedule":"V pondělí večer 1 tableta"},
        {"text":"Lipertance 10/5/5", "schedule":null},
        {"text":null, "schedule":null}
    ]);
    let matched = json!([
        {"name":"PARALEN", "strength":"500 mg"},
        {"name":"CONCOR", "strength":"5 mg"},
        {"name":"LETROX", "strength":"50 mcg"},
        {"name":"LIPERTANCE", "strength":"10 mg/5 mg/5 mg"},
        {"name":null, "strength":null}
    ]);
    let (base, requests) = stub_sequence(vec![
        (canned(&raw.to_string(), "STOP"), StatusCode::OK),
        (canned(&matched.to_string(), "STOP"), StatusCode::OK),
    ])
    .await;
    let catalogue = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data/sukl/medications.json");
    let router = app(AppState::new(config(base, Some(catalogue))).unwrap());
    let (status, headers, body) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("cache-control").unwrap(), "no-store");
    let rows: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        rows,
        json!([
            {"name":"PARALEN", "strength":"500 mg", "schedule":null},
            {"name":"CONCOR", "strength":"5 mg", "schedule":"1/2-0-0"},
            {"name":"LETROX", "strength":"50 mcg", "schedule":"V pondělí večer 1 tableta"},
            {"name":"LIPERTANCE", "strength":"10 mg/5 mg/5 mg", "schedule":null},
            {"name":null, "strength":null, "schedule":null}
        ])
    );
    assert_matches_openapi(&rows, "TranscriptionRows");

    let captured = requests.lock().unwrap();
    assert_eq!(captured.len(), 2);
    for request in captured.iter() {
        assert_eq!(request.path, "/v1beta/models/test-model:generateContent");
        assert_eq!(request.api_key.as_deref(), Some("proxy-key"));
        assert_eq!(request.content_type.as_deref(), Some("application/json"));
        assert_eq!(
            request.body["generationConfig"]["responseMimeType"],
            "application/json"
        );
        assert_eq!(request.body["generationConfig"]["maxOutputTokens"], 8192);
    }
    let reading = &captured[0].body;
    assert_eq!(
        reading["contents"][0]["parts"][0]["inline_data"],
        json!({"mime_type":"image/png", "data":"iVBORw0KGgo="})
    );
    assert!(!reading.to_string().contains("PARALEN"));
    assert_eq!(
        reading["generationConfig"]["responseJsonSchema"]["items"]["required"],
        json!(["text", "schedule"])
    );

    let matching = &captured[1].body;
    let parts = matching["contents"][0]["parts"].as_array().unwrap();
    assert_eq!(parts.len(), 1);
    assert_eq!(parts[0].as_object().unwrap().len(), 1);
    let input: Value = serde_json::from_str(parts[0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(input["transcription"][0]["text"], "paralen 500");
    assert_eq!(input["transcription"][1]["text"], "Concord 5 mg");
    assert!(
        input["transcription"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row.get("schedule").is_none())
    );
    assert!(
        input["catalogue"]
            .as_array()
            .unwrap()
            .contains(&json!({"name":"PARALEN", "strength":"500MG"}))
    );
    assert!(
        input["catalogue"]
            .as_array()
            .unwrap()
            .contains(&json!({"name":"LIPERTANCE", "strength":"10MG/5MG/5MG"}))
    );
    assert_eq!(
        matching["generationConfig"]["responseJsonSchema"]["items"]["required"],
        json!(["name", "strength"])
    );
}

#[tokio::test]
async fn empty_transcription_skips_matching() {
    let (base, requests) = stub(canned("[]", "STOP"), StatusCode::OK).await;
    let router = app(AppState::new(config(base, None)).unwrap());
    let (status, _, body) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::from_slice::<Value>(&body).unwrap(), json!([]));
    assert_eq!(requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn missing_catalogue_still_separates_fields_without_correcting_names() {
    let (base, requests) = stub_sequence(vec![
        (
            canned(r#"[{"text":"Unknown 20 mg","schedule":null}]"#, "STOP"),
            StatusCode::OK,
        ),
        (
            canned(r#"[{"name":"Unknown","strength":"20 mg"}]"#, "STOP"),
            StatusCode::OK,
        ),
    ])
    .await;
    let router = app(AppState::new(config(base, None)).unwrap());
    let (status, _, body) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap(),
        json!([{"name":"Unknown", "strength":"20 mg", "schedule":null}])
    );
    let captured = requests.lock().unwrap();
    let input: Value = serde_json::from_str(
        captured[1].body["contents"][0]["parts"][0]["text"]
            .as_str()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(input["catalogue"], json!([]));
}

#[tokio::test]
async fn invalid_or_failed_matching_never_returns_partial_readings() {
    let raw = r#"[{"text":"Paralen 500","schedule":null},{"text":null,"schedule":"1-0-0"}]"#;
    for (reply, provider_status, expected) in [
        (
            canned("[]", "STOP"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(
                r#"[{"name":"PARALEN","strength":"500 mg"},{"name":"X","strength":null}]"#,
                "STOP",
            ),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(
                r#"[{"name":"PARALEN","strength":"500 mg","schedule":null}]"#,
                "STOP",
            ),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("not json", "STOP"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("[]", "MAX_TOKENS"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            json!({}),
            StatusCode::TOO_MANY_REQUESTS,
            StatusCode::TOO_MANY_REQUESTS,
        ),
        (
            json!({}),
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::BAD_GATEWAY,
        ),
    ] {
        let (base, requests) = stub_sequence(vec![
            (canned(raw, "STOP"), StatusCode::OK),
            (reply, provider_status),
        ])
        .await;
        let router = app(AppState::new(config(base, None)).unwrap());
        let (status, _, _) = post_image(router, "image/png", PNG.to_vec()).await;
        assert_eq!(status, expected);
        assert_eq!(requests.lock().unwrap().len(), 2);
    }
}

#[tokio::test]
async fn both_model_calls_share_one_deadline() {
    let router = Router::new().fallback(|body: Bytes| async move {
        let request: Value = serde_json::from_slice(&body).unwrap();
        let fields = &request["generationConfig"]["responseJsonSchema"]["items"]["required"];
        let text = if fields == &json!(["text", "schedule"]) {
            r#"[{"text":"Paralen 500","schedule":null}]"#
        } else {
            r#"[{"name":"PARALEN","strength":"500 mg"}]"#
        };
        // Each call individually fits the deadline; together they exceed it.
        tokio::time::sleep(Duration::from_millis(150)).await;
        axum::Json(canned(text, "STOP"))
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let mut config = config(format!("http://{address}/v1beta"), None);
    config.gemini_timeout = Duration::from_millis(250);
    let router = app(AppState::new(config).unwrap());
    let (status, _, body) = post_image(router, "image/png", PNG.to_vec()).await;
    assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap()["status"],
        504
    );
}

#[test]
fn literal_null_fields_are_missing_in_all_columns() {
    let rows =
        parse_medications(r#"[{"name":"null","strength":" NULL ","schedule":"Null"}]"#).unwrap();
    assert_eq!(
        rows,
        vec![Row {
            name: None,
            strength: None,
            schedule: None
        }]
    );
}

#[tokio::test]
async fn rejects_invalid_photos_and_missing_configuration_without_calling_provider() {
    let (base, requests) = stub(canned("[]", "STOP"), StatusCode::OK).await;
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
    missing.gemini_api_key = None;
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
            json!({"promptFeedback": {"blockReason": "SAFETY"}}),
            StatusCode::OK,
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            canned("[]", "MAX_TOKENS"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned("not json", "STOP"),
            StatusCode::OK,
            StatusCode::BAD_GATEWAY,
        ),
        (
            canned(r#"[{"text":"X","schedule":null,"extra":1}]"#, "STOP"),
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
async fn unavailable_provider_yields_gateway_error() {
    let router = app(AppState::new(config("http://127.0.0.1:1/v1beta".into(), None)).unwrap());
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
        r#"[{"name":"X","strength":null,"schedule":1}]"#,
        r#"[{"name":"X","strength":null,"schedule":null,"extra":1}]"#,
        r#"[{"name":"","strength":null,"schedule":null}]"#,
        r#"[{"name":"X\nY","strength":null,"schedule":null}]"#,
    ] {
        assert!(parse_medications(text).is_err(), "{text}");
    }
    let long = json!([{"name": "X", "strength": null, "schedule": "x".repeat(121)}]).to_string();
    assert!(parse_medications(&long).is_err());
    assert_eq!(parse_medications("[]").unwrap(), Vec::new());
}
