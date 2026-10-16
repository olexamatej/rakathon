//! Deterministic enrichment after inference. No model-generated URLs, provider
//! IDs, clinical lookups, or network calls are used here.
use std::{collections::HashMap, sync::LazyLock};

use anyhow::{Context, ensure};
use serde::Deserialize;
use serde_json::{Value, json};
use url::Url;

const PROVIDERS: [(&str, &str); 5] = [
    ("Drugs.com", "https://www.drugs.com/drug_interactions.html"),
    (
        "WebMD",
        "https://www.webmd.com/interaction-checker/default.htm",
    ),
    (
        "Patient.info",
        "https://patient.info/treatment-medication/interaction-checker",
    ),
    (
        "RxList",
        "https://www.rxlist.com/drug-interaction-checker.htm",
    ),
    (
        "Medscape",
        "https://reference.medscape.com/drug-interactionchecker",
    ),
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    names: Vec<String>,
    id: String,
    source_url: String,
    verified_at: String,
}

static DRUGS_COM_IDS: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    parse_catalog(include_str!("../data/drugs-com-ids.json"))
        .expect("bundled Drugs.com identifier catalog must be valid")
});

fn parse_catalog(source: &str) -> anyhow::Result<HashMap<String, String>> {
    let entries: Vec<CatalogEntry> = serde_json::from_str(source)?;
    let mut ids = HashMap::new();
    for entry in entries {
        let parts: Vec<_> = entry.id.split('-').collect();
        ensure!(
            parts.len() == 2
                && parts
                    .iter()
                    .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())),
            "invalid Drugs.com identifier"
        );
        let source = Url::parse(&entry.source_url)?;
        ensure!(
            source.scheme() == "https" && source.host_str() == Some("www.drugs.com"),
            "catalog provenance must be a Drugs.com URL"
        );
        ensure!(
            chrono::NaiveDate::parse_from_str(&entry.verified_at, "%Y-%m-%d").is_ok(),
            "invalid catalog verification date"
        );
        ensure!(!entry.names.is_empty(), "catalog entry has no names");
        for name in entry.names {
            let key = name.trim().to_lowercase();
            ensure!(!key.is_empty(), "blank catalog name");
            ensure!(
                ids.insert(key, entry.id.clone()).is_none(),
                "duplicate catalog name"
            );
        }
    }
    Ok(ids)
}

fn general(provider: &str, url: &str, names: &[&str], reason: &str, message: &str) -> Value {
    json!({
        "provider": provider, "url": url, "scope": "general", "prefilled": false,
        "drugNames": names, "manualEntryReason": reason, "message": message
    })
}

fn prefilled(provider: &str, url: Url, names: &[&str]) -> Value {
    json!({"provider": provider, "url": url.as_str(), "scope": "pair", "prefilled": true, "drugNames": names})
}

pub fn pair_links(names: [&str; 2]) -> Value {
    let drugs_ids: Option<Vec<_>> = names
        .iter()
        .map(|name| DRUGS_COM_IDS.get(&name.trim().to_lowercase()))
        .collect();
    let drugs = match drugs_ids {
        Some(ids) if ids[0] != ids[1] => {
            let mut url = Url::parse("https://www.drugs.com/interactions-check.php").unwrap();
            url.query_pairs_mut()
                .append_pair("drug_list", &format!("{},{}", ids[0], ids[1]));
            prefilled("Drugs.com", url, &names)
        }
        _ => general(
            PROVIDERS[0].0,
            PROVIDERS[0].1,
            &names,
            "drug_id_unavailable",
            "Pro tuto dvojici nejsou v místní mapě dostupné dva odlišné ověřené identifikátory Drugs.com. Názvy léčiv zadejte ručně.",
        ),
    };
    // The actual Patient.info widget accepts comma/newline/word 'and' as
    // separators. Reject such names instead of silently creating extra drugs.
    let patient = if names.iter().all(|name| patient_name_supported(name)) {
        let mut url = Url::parse("https://rxinteractions.patient.info/").unwrap();
        url.query_pairs_mut()
            .append_pair("medicines", &names.join(","));
        prefilled("Patient.info", url, &names)
    } else {
        general(
            PROVIDERS[2].0,
            PROVIDERS[2].1,
            &names,
            "unsupported_drug_name",
            "Název léčiva obsahuje oddělovač používaný službou Patient.info. Dvojici nelze bezpečně předvyplnit; zadejte ji ručně.",
        )
    };
    let unsupported = |index: usize| {
        general(
            PROVIDERS[index].0,
            PROVIDERS[index].1,
            &names,
            "url_prefill_unavailable",
            "Pro tento ověřovač nebyl ověřen podporovaný formát předvyplnění pomocí URL. Uvedenou dvojici léčiv zadejte ručně.",
        )
    };
    json!([
        drugs,
        unsupported(1),
        patient,
        unsupported(3),
        unsupported(4)
    ])
}

fn patient_name_supported(name: &str) -> bool {
    !name.trim().is_empty()
        && !name.contains([',', '\n', '\r'])
        && !name
            .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
            .any(|word| word.eq_ignore_ascii_case("and"))
}

/// Also used to refresh saved API examples without repeating model inference.
/// Keeps all clinical data and the original checkedAt timestamp unchanged.
pub fn enrich_report(report: &mut Value) -> anyhow::Result<()> {
    let drugs: HashMap<String, String> = report["drugs"]
        .as_array()
        .context("missing drugs")?
        .iter()
        .map(|drug| {
            Ok((
                drug["id"].as_str().context("missing drug id")?.to_owned(),
                drug["name"]
                    .as_str()
                    .context("missing drug name")?
                    .to_owned(),
            ))
        })
        .collect::<anyhow::Result<_>>()?;
    for interaction in report["interactions"]
        .as_array_mut()
        .context("missing interactions")?
    {
        let ids = interaction["drugIds"]
            .as_array()
            .context("missing pair ids")?;
        ensure!(ids.len() == 2, "expected exactly two drugs");
        let name = |index: usize| -> anyhow::Result<&str> {
            Ok(drugs
                .get(ids[index].as_str().context("invalid drug id")?)
                .context("unknown drug id")?
                .as_str())
        };
        interaction["externalLinks"] = pair_links([name(0)?, name(1)?]);
    }
    report["externalLinks"] = Value::Array(PROVIDERS.iter().map(|(provider, url)| {
        general(provider, url, &[], "pair_required",
            "Předvyplněné odkazy pro nalezené dvojice jsou uvedeny u jednotlivých interakcí.")
    }).collect());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_pair_has_verified_drugs_com_and_patient_links() {
        let links = pair_links(["warfarin", "kyselina acetylsalicylová"]);
        assert_eq!(links.as_array().unwrap().len(), 5);
        let drugs = Url::parse(links[0]["url"].as_str().unwrap()).unwrap();
        assert_eq!(
            drugs.query_pairs().collect::<Vec<_>>(),
            vec![("drug_list".into(), "2311-0,243-0".into())]
        );
        let patient = Url::parse(links[2]["url"].as_str().unwrap()).unwrap();
        assert_eq!(
            patient.query_pairs().collect::<Vec<_>>(),
            vec![(
                "medicines".into(),
                "warfarin,kyselina acetylsalicylová".into()
            )]
        );
        for index in [0, 2] {
            assert_eq!(links[index]["scope"], "pair");
            assert_eq!(links[index]["prefilled"], true);
        }
        for index in [1, 3, 4] {
            assert_eq!(links[index]["scope"], "general");
            assert_eq!(links[index]["prefilled"], false);
        }
    }

    #[test]
    fn unknown_ids_do_not_produce_guessed_drugs_com_links() {
        let links = pair_links(["unmapped-drug", "warfarin"]);
        assert_eq!(links[0]["manualEntryReason"], "drug_id_unavailable");
        assert_eq!(links[0]["url"], PROVIDERS[0].1);
        assert_eq!(links[2]["prefilled"], true);
        assert_eq!(links[0]["drugNames"], json!(["unmapped-drug", "warfarin"]));
    }

    #[test]
    fn patient_names_cannot_inject_extra_drugs_or_url_parameters() {
        for name in ["A,B", "A\nB", "A AND B", "vitamin (and) minerals", "A\rB"] {
            assert_eq!(
                pair_links([name, "warfarin"])[2]["manualEntryReason"],
                "unsupported_drug_name"
            );
        }
        let names = ["A&B?x=1#fragment", "lék/žluťoučký"];
        let links = pair_links(names);
        let url = Url::parse(links[2]["url"].as_str().unwrap()).unwrap();
        assert!(url.fragment().is_none());
        assert_eq!(
            url.query_pairs().collect::<Vec<_>>(),
            vec![("medicines".into(), names.join(",").into())]
        );
    }

    #[test]
    fn catalog_validates_identifiers_and_provenance() {
        assert!(parse_catalog(include_str!("../data/drugs-com-ids.json")).is_ok());
        let invalid =
            include_str!("../data/drugs-com-ids.json").replace("2311-0", "2311-0&other=1");
        assert!(parse_catalog(&invalid).is_err());
    }
}
