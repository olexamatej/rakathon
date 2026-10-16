use std::{process::Stdio, time::Duration};

use anyhow::{Context, bail};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};

use crate::{
    Config,
    model::{ModelResult, output_schema},
};

const MAX_OUTPUT_BYTES: u64 = 4 * 1024 * 1024;
// CLI 0.163 emits this startup diagnostic even when Code Mode was explicitly
// disabled. It confirms the tool host failed closed; it is not a failed turn.
const DISABLED_CODE_MODE_NOTICE: &str = "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.";

pub async fn infer(config: &Config, drugs: &[String]) -> anyhow::Result<ModelResult> {
    let value = run(
        config,
        &serde_json::to_value(drugs)?,
        &output_schema(),
        include_str!("prompt.txt"),
        None,
    )
    .await?;
    serde_json::from_value(value).context("Codex returned invalid result JSON")
}

pub(crate) async fn run(
    config: &Config,
    input: &serde_json::Value,
    schema: &serde_json::Value,
    prompt: &str,
    site: Option<&str>,
) -> anyhow::Result<serde_json::Value> {
    let scratch = tempfile::Builder::new()
        .prefix("interaction-check-")
        .tempdir()?;
    let schema_path = scratch.path().join("schema.json");
    tokio::fs::write(&schema_path, serde_json::to_vec(schema)?).await?;

    let mut command = command(config, prompt, site);
    command
        .current_dir(scratch.path())
        .arg("--output-schema")
        .arg(&schema_path)
        .arg("-c")
        .arg(format!(
            "log_dir={}",
            serde_json::to_string(scratch.path())?
        ))
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command.spawn().context("could not start Codex")?;
    let mut stdin = child.stdin.take().context("missing Codex stdin")?;
    let stdout = child.stdout.take().context("missing Codex stdout")?;
    let input = serde_json::to_vec(input)?;

    let result = tokio::time::timeout(config.timeout, async {
        stdin.write_all(&input).await?;
        stdin.shutdown().await?;
        drop(stdin);
        let mut output = Vec::new();
        stdout
            .take(MAX_OUTPUT_BYTES + 1)
            .read_to_end(&mut output)
            .await?;
        if output.len() as u64 > MAX_OUTPUT_BYTES {
            bail!("Codex output exceeds size limit");
        }
        let status = child.wait().await?;
        if !status.success() {
            bail!("Codex exited unsuccessfully");
        }
        parse_output(&output, site.is_some())
    })
    .await;
    match result {
        Ok(Ok(value)) => Ok(value),
        outcome => {
            // Reap before releasing the concurrency permit or deleting scratch.
            let _ = child.kill().await;
            let _ = child.wait().await;
            match outcome {
                Ok(Err(error)) => Err(error),
                Err(_) => bail!(
                    "Codex exceeded its {} second deadline",
                    config.timeout.as_secs()
                ),
                Ok(Ok(_)) => unreachable!(),
            }
        }
    }
}

fn command(config: &Config, prompt: &str, site: Option<&str>) -> Command {
    let mut cmd = Command::new(&config.codex_bin);
    // Avoid inheriting session IDs, injected instructions, debug switches, or
    // unrelated application secrets from the parent service environment.
    cmd.env_clear();
    for name in [
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "TMPDIR",
        "TMP",
        "TEMP",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "CODEX_HOME",
        "CODEX_API_KEY",
        "OPENAI_API_KEY",
        "OPENAI_ORG_ID",
        "OPENAI_ORGANIZATION",
        "OPENAI_PROJECT_ID",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ] {
        if let Some(value) = std::env::var_os(name) {
            cmd.env(name, value);
        }
    }
    // The inherited login is used by the CLI, but user settings/instructions and
    // tool integrations are excluded. No client value becomes a command argument.
    cmd.arg("exec").args([
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--json",
        "--color",
        "never",
        "--strict-config",
    ]);
    for feature in [
        "shell_tool",
        "unified_exec",
        "shell_snapshot",
        "view_image",
        "apps",
        "plugins",
        "remote_plugin",
        "hooks",
        "multi_agent",
        "multi_agent_v2",
        "browser_use",
        "computer_use",
        "image_generation",
        "code_mode",
        "memories",
        "skill_search",
        "skill_mcp_dependency_install",
        "goals",
        "sleep_tool",
    ] {
        cmd.arg("--disable").arg(feature);
    }
    // CLI 0.163 requires the host even for direct hosted web tools. Code
    // execution remains disabled; the event parser only permits web searches.
    cmd.arg(if site.is_some() {
        "--enable"
    } else {
        "--disable"
    })
    .arg("code_mode_host");
    for setting in [
        "approval_policy=\"never\"",
        "default_permissions=\"inference\"",
        "permissions.inference.filesystem={\"/\"=\"deny\",\":minimal\"=\"read\"}",
        "permissions.inference.network.enabled=false",
        "project_doc_max_bytes=0",
        "skills.include_instructions=false",
        "skills.bundled.enabled=false",
        "mcp_servers={}",
        "plugins._default.enabled=false",
        "tools.update_plan.enabled=false",
        "shell_environment_policy.inherit=\"none\"",
        "allow_login_shell=false",
        "history.persistence=\"none\"",
        "analytics.enabled=false",
        "otel.exporter=\"none\"",
        "otel.trace_exporter=\"none\"",
        "otel.metrics_exporter=\"none\"",
        "model_reasoning_effort=\"low\"",
    ] {
        cmd.arg("-c").arg(setting);
    }
    cmd.arg("-c").arg(format!(
        "developer_instructions={}",
        serde_json::to_string(prompt).unwrap()
    ));
    cmd.arg("-c").arg(if site.is_some() {
        "web_search=\"live\""
    } else {
        "web_search=\"disabled\""
    });
    if let Some(site) = site {
        cmd.arg("-c").arg(format!(
            "tools.web_search.allowed_domains={}",
            serde_json::to_string(&[site]).unwrap()
        ));
    }
    let (model, service_tier) = if site.is_some() {
        (Some("gpt-6-luna"), Some("priority"))
    } else {
        (config.model.as_deref(), config.service_tier.as_deref())
    };
    if let Some(model) = model {
        cmd.arg("--model").arg(model);
    }
    if let Some(tier) = service_tier {
        cmd.arg("-c").arg(format!(
            "service_tier={}",
            serde_json::to_string(tier).unwrap()
        ));
    }
    cmd
}

#[cfg(test)]
fn parse_events(output: &[u8]) -> anyhow::Result<ModelResult> {
    serde_json::from_value(parse_output(output, false)?).context("invalid model result")
}

fn parse_output(output: &[u8], allow_web: bool) -> anyhow::Result<serde_json::Value> {
    let mut final_message = None;
    let mut completed = false;
    let mut searched = false;
    let mut source_urls = std::collections::HashSet::new();
    let mut turn_started = false;
    for line in output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
    {
        let event: serde_json::Value =
            serde_json::from_slice(line).context("invalid Codex event")?;
        match event["type"].as_str() {
            Some("item.started" | "item.updated" | "item.completed") => {
                match event["item"]["type"].as_str() {
                    Some("agent_message") => {
                        if event["type"] == "item.completed" {
                            final_message = event["item"]["text"].as_str().map(str::to_owned);
                        }
                    }
                    Some("reasoning") => {}
                    Some("web_search") if allow_web => {
                        if event["type"] == "item.completed" {
                            searched = true;
                            if let Some(results) = event["item"]["results"].as_array() {
                                for result in results {
                                    if let Some(url) = result["url"].as_str() {
                                        source_urls.insert(url.to_owned());
                                    }
                                }
                            }
                        }
                    }
                    Some("error")
                        if !turn_started
                            && event["item"]["message"].as_str()
                                == Some(DISABLED_CODE_MODE_NOTICE) => {}
                    Some("error") => bail!("Codex reported an error item"),
                    _ => bail!("unexpected Codex tool activity"),
                }
            }
            Some("turn.completed") => completed = true,
            Some("turn.started") => turn_started = true,
            Some("thread.started") => {}
            Some("turn.failed" | "error") => bail!("Codex reported a failed turn"),
            _ => bail!("unrecognized Codex event"),
        }
    }
    if !completed {
        bail!("Codex did not complete its turn");
    }
    if allow_web && !searched {
        bail!("Codex research completed without web search");
    }
    let value: serde_json::Value =
        serde_json::from_str(&final_message.context("Codex returned no final JSON")?)
            .context("Codex returned invalid result JSON")?;
    if allow_web && value["status"] == "found" {
        let url = value["url"]
            .as_str()
            .context("research result has no URL")?;
        if !source_urls.contains(url) {
            bail!("research URL absent from web tool results");
        }
    }
    Ok(value)
}

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tolerates_only_the_known_disabled_host_notice_before_the_turn() {
        let notice = json!({"type": "item.completed", "item": {"type": "error", "message": DISABLED_CODE_MODE_NOTICE}}).to_string();
        let result = json!({"evaluationComplete": true, "resolutions": [], "interactions": []});
        let final_message = json!({"type": "item.completed", "item": {"type": "agent_message", "text": result.to_string()}});
        let turn_start = json!({"type": "turn.started"}).to_string();
        let turn_end = json!({"type": "turn.completed"}).to_string();
        let valid = format!("{notice}\n{turn_start}\n{final_message}\n{turn_end}\n");
        assert!(parse_events(valid.as_bytes()).is_ok());
        let late = format!("{turn_start}\n{notice}\n{final_message}\n{turn_end}\n");
        assert!(parse_events(late.as_bytes()).is_err());
        let unknown = valid.replace(DISABLED_CODE_MODE_NOTICE, "Some unexpected runtime error");
        assert!(parse_events(unknown.as_bytes()).is_err());
    }
}
