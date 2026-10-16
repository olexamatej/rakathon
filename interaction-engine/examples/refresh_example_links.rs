use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let path = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| "examples/four-drug-interactions.response.json".into());
    let mut report = serde_json::from_slice(&std::fs::read(&path)?)?;
    interaction_engine::links::enrich_report(&mut report)?;
    std::fs::write(path, serde_json::to_string_pretty(&report)? + "\n")?;
    Ok(())
}
