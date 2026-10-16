//! Validate saved HTTP responses against the same OpenAPI contract clients use.
use anyhow::Context;
use serde_json::{Value, json};

fn main() -> anyhow::Result<()> {
    let directory = std::path::PathBuf::from(
        std::env::args_os()
            .nth(1)
            .context("usage: cargo run --example validate_benchmark -- <directory>")?,
    );
    let spec: Value = serde_yaml::from_str(include_str!("../openapi.yaml"))?;
    let schema = json!({"$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "#/components/schemas/InteractionCheckResponse", "components": spec["components"]});
    let validator = jsonschema::options()
        .should_validate_formats(true)
        .build(&schema)?;
    let runs: Vec<Value> = serde_json::from_slice(&std::fs::read(directory.join("runs.json"))?)?;
    let mut results = Vec::new();
    for run in runs {
        let mut errors = Vec::new();
        if run["httpStatus"] != 200 {
            errors.push("HTTP request was not successful".to_owned());
        }
        if let Some(file) = run["responseFile"].as_str() {
            match serde_json::from_slice::<Value>(&std::fs::read(directory.join(file))?) {
                Ok(response) if run["httpStatus"] == 200 => {
                    errors.extend(
                        validator
                            .iter_errors(&response)
                            .map(|error| error.to_string()),
                    );
                }
                Err(error) => errors.push(format!("invalid JSON: {error}")),
                _ => {}
            }
        } else {
            errors.push("no response body".into());
        }
        results.push(json!({"responseFile": run["responseFile"], "valid": errors.is_empty(), "errors": errors}));
    }
    let valid = results
        .iter()
        .filter(|result| result["valid"] == true)
        .count();
    println!("{valid}/{} responses conform to OpenAPI", results.len());
    std::fs::write(
        directory.join("schema-validation.json"),
        serde_json::to_string_pretty(&results)? + "\n",
    )?;
    Ok(())
}
