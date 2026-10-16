//! Adapter for the two JSON endpoints used by Medscape's public mdic.js checker.
use anyhow::{Context, ensure};
use reqwest::Client;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use url::Url;

use crate::{
    Config, codex,
    model::strict_objects,
    research::{ResearchResult, Status},
};

const TYPEAHEAD: &str = "https://www.medscape.com/api/v1/spiiderenc/drug_interaction_typeahead";
const INTERACTIONS: &str = "https://reference.medscape.com/druginteraction.do";
const MAX_BYTES: usize = 1024 * 1024;

#[derive(Deserialize)]
struct Search {
    types: Vec<SearchType>,
}
#[derive(Deserialize)]
struct SearchType {
    #[serde(rename = "typeID")]
    type_id: String,
    references: Vec<Drug>,
}
#[derive(Clone, Deserialize, Serialize)]
struct Drug {
    id: String,
    val: String,
    text: String,
    has_interactions: String,
}
#[derive(Deserialize)]
struct Interactions {
    #[serde(rename = "errorCode")]
    error_code: u32,
    #[serde(rename = "multiInteractions")]
    records: Vec<Interaction>,
}
#[derive(Deserialize, Serialize)]
struct Interaction {
    subject: String,
    object: String,
    text: String,
    severity: String,
}

fn normalize(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

// Never select a fuzzy first suggestion: ibuprofen IV and combination products
// must not be substituted for plain ibuprofen. Brand text maps to generic val.
fn resolve(search: Search, name: &str) -> anyhow::Result<Option<Drug>> {
    let name = normalize(name);
    let mut matches = std::collections::BTreeMap::new();
    for group in search.types.into_iter().filter(|g| g.type_id == "10417") {
        for drug in group.references {
            if drug.has_interactions == "1" && normalize(&drug.text) == name {
                ensure!(
                    !drug.id.is_empty() && drug.id.bytes().all(|c| c.is_ascii_digit()),
                    "invalid Medscape drug ID"
                );
                ensure!(!drug.val.trim().is_empty(), "empty Medscape canonical name");
                if let Some(previous) = matches.insert(drug.id.clone(), drug.clone()) {
                    ensure!(
                        normalize(&previous.val) == normalize(&drug.val),
                        "conflicting Medscape names"
                    );
                }
            }
        }
    }
    Ok(if matches.len() == 1 {
        matches.into_values().next()
    } else {
        None
    })
}

fn validate_records(data: &Interactions, drugs: &[Drug; 2]) -> anyhow::Result<()> {
    // Observed checker convention: 0 with no records, 1 with one or more.
    ensure!(
        matches!(
            (data.error_code, data.records.is_empty()),
            (0, true) | (1, false)
        ),
        "unexpected Medscape result code"
    );
    ensure!(data.records.len() <= 100, "too many Medscape records");
    for r in &data.records {
        let a = normalize(&r.subject);
        let b = normalize(&r.object);
        let x = normalize(&drugs[0].val);
        let y = normalize(&drugs[1].val);
        ensure!(
            (a == x && b == y) || (a == y && b == x),
            "Medscape returned a different pair"
        );
        ensure!(
            !r.text.trim().is_empty() && r.text.len() <= 16000,
            "invalid Medscape interaction text"
        );
        ensure!(
            [
                "Contraindicated",
                "Serious",
                "Significant",
                "Monitor",
                "Minor"
            ]
            .iter()
            .any(|s| r.severity.starts_with(s)),
            "unknown Medscape severity"
        );
    }
    Ok(())
}

async fn get_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: Url,
    timeout: Duration,
) -> anyhow::Result<T> {
    // Avoid including drug names, query strings, or response bodies in errors.
    ensure!(!timeout.is_zero(), "Medscape research deadline exceeded");
    let mut response = client
        .get(url)
        .timeout(timeout.min(Duration::from_secs(15)))
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("Medscape request failed"))?;
    ensure!(
        response.status().is_success(),
        "Medscape returned HTTP {}",
        response.status().as_u16()
    );
    ensure!(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json")),
        "Medscape did not return JSON"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| anyhow::anyhow!("Medscape response read failed"))?
    {
        ensure!(
            bytes.len() + chunk.len() <= MAX_BYTES,
            "Medscape response exceeds size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).context("invalid Medscape JSON")
}

fn inconclusive(summary: &str) -> ResearchResult {
    ResearchResult {
        status: Status::Inconclusive,
        url: None,
        summary: summary.into(),
    }
}

pub(crate) async fn research(
    config: &Config,
    names: &[String; 2],
) -> anyhow::Result<ResearchResult> {
    let deadline = tokio::time::Instant::now() + config.timeout;
    let client = Client::builder()
        .user_agent(concat!(
            env!("CARGO_PKG_NAME"),
            "/",
            env!("CARGO_PKG_VERSION")
        ))
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15).min(config.timeout))
        .build()?;
    let mut resolved = Vec::new();
    for name in names {
        let mut url = Url::parse(TYPEAHEAD)?;
        url.query_pairs_mut()
            .append_pair("q", name.trim())
            .append_pair("sz", "500");
        let search = match get_json(
            &client,
            url,
            deadline.saturating_duration_since(tokio::time::Instant::now()),
        )
        .await
        {
            Ok(value) => value,
            Err(_) => {
                return Ok(inconclusive(
                    "Našeptávač Medscape se nepodařilo spolehlivě načíst. Výsledek nepotvrzuje bezpečnost kombinace.",
                ));
            }
        };
        let Some(drug) = resolve(search, name)? else {
            return Ok(inconclusive(
                "Medscape nevrátil jednoznačnou přesnou shodu pro oba zadané názvy. Interakci nelze spolehlivě ověřit a výsledek nepotvrzuje bezpečnost kombinace.",
            ));
        };
        resolved.push(drug);
    }
    let drugs: [Drug; 2] = resolved.try_into().ok().context("missing Medscape drugs")?;
    if drugs[0].id == drugs[1].id {
        return Ok(inconclusive(
            "Oba názvy odpovídají stejnému záznamu Medscape; nelze je vyhodnotit jako dvojici různých léčiv. Výsledek nepotvrzuje bezpečnost užívání.",
        ));
    }
    let mut url = Url::parse(INTERACTIONS)?;
    url.query_pairs_mut()
        .append_pair("action", "getMultiInteraction")
        .append_pair("ids", &format!("{},{}", drugs[0].id, drugs[1].id));
    let data: Interactions = match get_json(
        &client,
        url.clone(),
        deadline.saturating_duration_since(tokio::time::Instant::now()),
    )
    .await
    {
        Ok(value) => value,
        Err(_) => {
            return Ok(inconclusive(
                "Interakční API Medscape se nepodařilo spolehlivě načíst. Výsledek nepotvrzuje bezpečnost kombinace.",
            ));
        }
    };
    validate_records(&data, &drugs)?;
    let summary = if data.records.is_empty() {
        "Medscape pro tuto dvojici nevrátil žádný interakční záznam. To neznamená, že je kombinace za všech okolností bezpečná.".into()
    } else {
        #[derive(Deserialize, JsonSchema)]
        #[serde(deny_unknown_fields)]
        struct Summary {
            summary: String,
        }
        let mut schema = serde_json::to_value(schemars::schema_for!(Summary))?;
        strict_objects(&mut schema);
        // Let Codex own its timeout cleanup (kill and reap), rather than
        // cancelling that future from an outer deadline.
        let mut summary_config = config.clone();
        summary_config.timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
        ensure!(
            !summary_config.timeout.is_zero(),
            "Medscape research deadline exceeded"
        );
        let value = codex::run(
            &summary_config,
            &json!({"drugs": drugs, "records": data.records}),
            &schema,
            include_str!("medscape_prompt.txt"),
            None,
        )
        .await?;
        serde_json::from_value::<Summary>(value)
            .context("invalid Medscape summary")?
            .summary
    };
    Ok(ResearchResult {
        status: Status::Found,
        url: Some(url.into()),
        summary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn search(s: &str) -> Search {
        serde_json::from_str(s).unwrap()
    }
    const IBUPROFEN: &str = include_str!("../tests/fixtures/medscape/ibuprofen.json");
    const WARFARIN: &str = include_str!("../tests/fixtures/medscape/warfarin.json");
    #[tokio::test]
    async fn http_client_accepts_json_and_rejects_blocking_redirects_and_oversized_bodies() {
        use axum::{Router, response::Redirect, routing::get};
        let app = Router::new()
            .route(
                "/ok",
                get(|| async { ([("content-type", "application/json")], WARFARIN) }),
            )
            .route(
                "/blocked",
                get(|| async { axum::http::StatusCode::FORBIDDEN }),
            )
            .route("/redirect", get(|| async { Redirect::temporary("/ok") }))
            .route("/html", get(|| async { "<html>Login</html>" }))
            .route(
                "/large",
                get(|| async {
                    (
                        [("content-type", "application/json")],
                        " ".repeat(MAX_BYTES + 1),
                    )
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let search: Search = get_json(
            &client,
            Url::parse(&format!("{base}/ok")).unwrap(),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert_eq!(resolve(search, "warfarin").unwrap().unwrap().id, "342182");
        for path in ["blocked", "redirect", "html", "large"] {
            assert!(
                get_json::<Search>(
                    &client,
                    Url::parse(&format!("{base}/{path}")).unwrap(),
                    Duration::from_secs(5)
                )
                .await
                .is_err(),
                "{path}"
            );
        }
        server.abort();
    }
    #[test]
    fn resolves_exact_names_and_brands_without_selecting_related_products() {
        assert_eq!(
            resolve(search(IBUPROFEN), " Ibuprofen ")
                .unwrap()
                .unwrap()
                .id,
            "343289"
        );
        assert!(resolve(search(IBUPROFEN), "ibupro").unwrap().is_none());
        assert_eq!(
            resolve(
                search(include_str!("../tests/fixtures/medscape/advil.json")),
                "Advil"
            )
            .unwrap()
            .unwrap()
            .val,
            "ibuprofen"
        );
        let mut ambiguous: serde_json::Value = serde_json::from_str(IBUPROFEN).unwrap();
        ambiguous["types"][0]["references"][1]["text"] = json!("ibuprofen");
        assert!(
            resolve(serde_json::from_value(ambiguous).unwrap(), "ibuprofen")
                .unwrap()
                .is_none()
        );
    }
    #[test]
    fn verifies_pair_identity_and_distinguishes_empty_from_invalid_results() {
        let drugs = [
            resolve(search(WARFARIN), "warfarin").unwrap().unwrap(),
            resolve(search(IBUPROFEN), "ibuprofen").unwrap().unwrap(),
        ];
        let mut data: Interactions =
            serde_json::from_str(include_str!("../tests/fixtures/medscape/pair.json")).unwrap();
        validate_records(&data, &drugs).unwrap();
        data.records[0].object = "meloxicam".into();
        assert!(validate_records(&data, &drugs).is_err());
        data.records.clear();
        assert!(validate_records(&data, &drugs).is_err());
        data.error_code = 0;
        validate_records(&data, &drugs).unwrap();
        assert!(serde_json::from_str::<Interactions>(r#"{"errorCode":0}"#).is_err());
    }
}
