use anyhow::{Context, ensure};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use url::Url;

use crate::{Config, codex, model::strict_objects};

const SITES: [(&str, &str); 7] = [
    ("drugs.com", "https://www.drugs.com/drug_interactions.html"),
    (
        "webmd.com",
        "https://www.webmd.com/interaction-checker/default.htm",
    ),
    (
        "patient.info",
        "https://patient.info/treatment-medication/interaction-checker",
    ),
    (
        "rxlist.com",
        "https://www.rxlist.com/drug-interaction-checker.htm",
    ),
    (
        "reference.medscape.com",
        "https://reference.medscape.com/drug-interactionchecker",
    ),
    ("rxlabelguard.com", "https://rxlabelguard.com/"),
    ("rxcheck.dev", "https://rxcheck.dev/"),
];

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ResearchRequest {
    pub drugs: [String; 2],
    pub site: String,
}

// Accept a canonical domain or precisely the supplied checker URL. Do not pass
// arbitrary user-provided URLs or subdomains into the agent configuration.
pub(crate) fn site(value: &str) -> Option<(&'static str, &'static str)> {
    SITES
        .iter()
        .copied()
        .find(|(domain, entry)| value == *domain || value == *entry)
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Status {
    Found,
    NotFound,
    Inconclusive,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ResearchResult {
    status: Status,
    url: Option<String>,
    summary: String,
}

fn output_schema() -> Value {
    let mut schema = serde_json::to_value(schemars::schema_for!(ResearchResult)).unwrap();
    strict_objects(&mut schema);
    schema
}

fn validate(result: &ResearchResult, domain: &str) -> anyhow::Result<()> {
    ensure!(
        !result.summary.trim().is_empty() && result.summary.chars().count() <= 2000,
        "invalid research summary"
    );
    ensure!(
        (result.status == Status::Found) == result.url.is_some(),
        "inconsistent research status and URL"
    );
    if let Some(value) = &result.url {
        ensure!(value.len() <= 4096, "research URL too long");
        let url = Url::parse(value).context("invalid research URL")?;
        let host = url.host_str().context("research URL has no host")?;
        ensure!(
            url.scheme() == "https"
                && url.username().is_empty()
                && url.password().is_none()
                && url.port().is_none()
                && (host == domain || host == format!("www.{domain}")),
            "research URL outside selected site"
        );
        ensure!(url.path() != "/", "research URL is a homepage");
        for (_, entry) in SITES {
            let checker = Url::parse(entry)?;
            ensure!(
                url.path().trim_end_matches('/') != checker.path().trim_end_matches('/'),
                "research URL is a generic checker"
            );
        }
    }
    Ok(())
}

pub(crate) async fn research(config: &Config, request: &ResearchRequest) -> anyhow::Result<Value> {
    let (domain, entry) = site(&request.site).context("unsupported site")?;
    let input = json!({"drugs": request.drugs, "site": domain, "checkerUrl": entry});
    let result: ResearchResult = serde_json::from_value(
        codex::run(
            config,
            &input,
            &output_schema(),
            include_str!("research_prompt.txt"),
            Some(domain),
        )
        .await?,
    )
    .context("invalid research result")?;
    validate(&result, domain)?;
    Ok(json!({
        "drugs": request.drugs,
        "site": domain,
        "checkedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "status": result.status,
        "url": result.url,
        "summary": result.summary,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_each_supported_domain_and_exact_checker_url() {
        for (domain, entry) in SITES {
            assert_eq!(site(domain), Some((domain, entry)));
            assert_eq!(site(entry), Some((domain, entry)));
            assert!(site(&format!("{domain}.evil.test")).is_none());
            let result = ResearchResult {
                status: Status::Found,
                url: Some(format!("https://{domain}/pairs/a-b")),
                summary: "Shrnutí.".into(),
            };
            assert!(validate(&result, domain).is_ok());
            assert!(
                jsonschema::validator_for(&output_schema())
                    .unwrap()
                    .is_valid(&serde_json::to_value(result).unwrap())
            );
        }
    }
}
