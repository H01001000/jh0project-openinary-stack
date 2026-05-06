pub mod health;
pub mod proxy;
pub mod request_context;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/healthz", axum::routing::get(health::healthz))
        .route(
            "/unsafe/{*wildcard}",
            axum::routing::get(proxy::unsafe_image),
        )
}
