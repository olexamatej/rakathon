use anyhow::Context;
use interaction_engine::{AppState, Config, app};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let config = Config::from_env()?;
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
