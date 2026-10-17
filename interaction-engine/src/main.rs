use anyhow::Context;
use clap::Parser;
use interaction_engine::{AppState, Config, app};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(version, about = "Drug interaction API server")]
struct Args {
    /// HTTP listener port (overrides the port in BIND_ADDR; default: 6767)
    #[arg(short, long)]
    port: Option<u16>,
    /// Return one random SÚKL name from /transcribe without calling the model
    #[arg(long)]
    mock_transcribe: bool,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    // Load before starting runtime threads. Existing environment values win.
    match dotenvy::dotenv() {
        Ok(_) => {}
        Err(error) if error.not_found() => {}
        Err(error) => return Err(error).context("could not load .env"),
    }
    run(args)
}

#[tokio::main]
async fn run(args: Args) -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let mut config = Config::from_env()?;
    config.mock_transcribe = args.mock_transcribe;
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
