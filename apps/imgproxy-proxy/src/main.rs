use dotenv::dotenv;
use imgproxy_proxy::{app::build_app, config::AppConfig, observability::init_tracing};

#[tokio::main]
async fn main() {
    dotenv().ok();

    init_tracing();

    let config = AppConfig::from_env().expect("failed to load required environment variables");
    let listener = tokio::net::TcpListener::bind(config.listen_address)
        .await
        .expect("failed to bind TCP listener");
    let app = build_app(config);

    tracing::info!(address = %listener.local_addr().expect("listener address"), "imgproxy-proxy listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server failed");
}
