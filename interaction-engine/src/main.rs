use anyhow::Context;
use clap::Parser;
use interaction_engine::{AppState, Config, app};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(version, about = "Drug interaction API server")]
struct Args {
    /// HTTP listener port (overrides the port in BIND_ADDR; default: 3000)
    #[arg(short, long)]
    port: Option<u16>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let mut config = Config::from_env()?;
    if let Some(port) = args.port {
        config.bind.set_port(port);
    }
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .context("could not bind HTTP listener")?;
    tracing::info!(address = %listener.local_addr()?, "interaction API listening");
    axum::serve(listener, app(AppState::new(config)?))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
