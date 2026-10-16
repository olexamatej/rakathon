use std::collections::{BTreeMap, HashMap, HashSet};

use anyhow::{Context, bail, ensure};
use chrono::{SecondsFormat, Utc};
use serde_json::{Value, json};

use crate::model::{ModelResult, ResolutionStatus, Severity};

fn key(name: &str) -> String {
    name.trim().to_lowercase()
}
fn nonblank(value: &str) -> bool {
    !value.trim().is_empty()
}

pub fn build_report(input: &[String], result: ModelResult) -> anyhow::Result<Value> {
    ensure!(
        result.evaluation_complete,
        "model did not complete pair evaluation"
    );
    ensure!(
        result.resolutions.len() == input.len(),
        "missing drug resolutions"
    );
    let mut drugs = Vec::<Value>::new();
    let mut resolutions = Vec::<Value>::new();
    let mut drug_keys = HashMap::<String, usize>::new();
    let mut ingredient_keys = Vec::<HashSet<String>>::new();
    let mut input_drugs = Vec::<Option<usize>>::new();
    let mut partial = false;
    for (index, resolution) in result.resolutions.into_iter().enumerate() {
        ensure!(
            resolution.input_index == index,
            "resolution input indices do not match request"
        );
        ensure!(
            resolution.candidates.iter().all(|name| nonblank(name)),
            "blank candidate"
        );
        if resolution.status == ResolutionStatus::Resolved {
            let name = resolution
                .canonical_name
                .context("missing canonical drug name")?;
            ensure!(nonblank(&name), "blank canonical drug name");
            ensure!(
                resolution.message.is_none() && resolution.candidates.is_empty(),
                "inconsistent resolved input"
            );
            ensure!(
                !resolution.active_ingredients.is_empty(),
                "missing active ingredients"
            );
            ensure!(
                resolution
                    .active_ingredients
                    .iter()
                    .all(|name| nonblank(name)),
                "blank ingredient"
            );
            let ingredients: HashSet<_> = resolution
                .active_ingredients
                .iter()
                .map(|name| key(name))
                .collect();
            ensure!(
                ingredients.len() == resolution.active_ingredients.len(),
                "duplicate ingredient"
            );
            let normalized = key(&name);
            let drug_index = if let Some(&existing) = drug_keys.get(&normalized) {
                ensure!(
                    ingredient_keys[existing] == ingredients,
                    "inconsistent alias ingredients"
                );
                existing
            } else {
                let new_index = drugs.len();
                drugs.push(json!({
                    "id": format!("drug-{}", new_index + 1),
                    "name": name.trim(),
                    "activeIngredients": resolution.active_ingredients.iter().map(|s| s.trim()).collect::<Vec<_>>()
                }));
                ingredient_keys.push(ingredients);
                drug_keys.insert(normalized, new_index);
                new_index
            };
            resolutions.push(json!({
                "inputIndex": index, "inputName": input[index], "status": "resolved",
                "drugId": drugs[drug_index]["id"]
            }));
            input_drugs.push(Some(drug_index));
        } else {
            partial = true;
            ensure!(
                resolution.canonical_name.is_none() && resolution.active_ingredients.is_empty(),
                "inconsistent unresolved input"
            );
            let message = resolution
                .message
                .context("missing resolution issue message")?;
            ensure!(nonblank(&message), "blank resolution issue message");
            let status = match resolution.status {
                ResolutionStatus::Unrecognized => "unrecognized",
                ResolutionStatus::Ambiguous => "ambiguous",
                ResolutionStatus::Unsupported => "unsupported",
                ResolutionStatus::Resolved => unreachable!(),
            };
            resolutions.push(json!({
                "inputIndex": index, "inputName": input[index], "status": status,
                "message": message, "candidates": resolution.candidates
            }));
            input_drugs.push(None);
        }
    }

    let mut pairs = BTreeMap::<(usize, usize), Vec<Value>>::new();
    let mut pair_severity = HashMap::<(usize, usize), Severity>::new();
    for interaction in result.interactions {
        ensure!(
            interaction.drug_indices.len() == 2,
            "interaction must have exactly two inputs"
        );
        let resolve = |index: usize| -> anyhow::Result<usize> {
            input_drugs
                .get(index)
                .copied()
                .flatten()
                .context("interaction references an unresolved or missing drug")
        };
        let a = resolve(interaction.drug_indices[0])?;
        let b = resolve(interaction.drug_indices[1])?;
        ensure!(
            a != b,
            "self-interaction or interaction between duplicate aliases"
        );
        let pair = (a.min(b), a.max(b));
        ensure!(
            !interaction.findings.is_empty(),
            "interaction has no findings"
        );
        // Duplicate or reversed records can occur despite the prompt. Merge
        // findings deterministically rather than exposing duplicate pairs.
        let findings = pairs.entry(pair).or_default();
        let severity = pair_severity.entry(pair).or_insert(Severity::Unknown);
        for finding in interaction.findings {
            ensure!(nonblank(&finding.summary), "blank interaction summary");
            ensure!(
                finding
                    .clinical_effects
                    .iter()
                    .all(|effect| nonblank(effect)),
                "blank clinical effect"
            );
            ensure!(
                finding
                    .recommendations
                    .iter()
                    .all(|r| nonblank(&r.description)),
                "blank recommendation"
            );
            if let Some(mechanism) = &finding.mechanism {
                ensure!(nonblank(mechanism), "blank mechanism");
            }
            *severity = (*severity).max(finding.severity);
            let mut value = json!({
                "summary": finding.summary,
                "severity": finding.severity,
                "clinicalEffects": finding.clinical_effects,
                "recommendations": finding.recommendations,
                "evidence": { "level": finding.evidence_level, "references": [] }
            });
            if let Some(mechanism) = finding.mechanism {
                value["mechanism"] = Value::String(mechanism);
            }
            if !findings.contains(&value) {
                findings.push(value);
            }
        }
    }
    let mut interactions = Vec::new();
    for ((a, b), findings) in pairs {
        interactions.push(json!({
            "drugIds": [drugs[a]["id"], drugs[b]["id"]],
            "severity": pair_severity[&(a,b)],
            "findings": findings
        }));
    }
    let count = drugs.len();
    let evaluated_pairs = count * count.saturating_sub(1) / 2;
    if interactions.len() > evaluated_pairs {
        bail!("interaction count exceeds evaluated pairs");
    }
    let report = json!({
        "status": if partial { "partial" } else { "complete" },
        "checkedAt": Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        "resolutions": resolutions,
        "drugs": drugs,
        "coverage": {
            "uniqueResolvedDrugs": count,
            "evaluatedPairs": evaluated_pairs,
            "interactingPairs": interactions.len()
        },
        "interactions": interactions
    });
    Ok(report)
}
