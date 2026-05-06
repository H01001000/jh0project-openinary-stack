use axum::{middleware::from_fn, Router};
use http::Method;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{config::AppConfig, routes, state::AppState};

pub fn build_app(config: AppConfig) -> Router {
    let state = AppState::new(config);

    Router::<AppState>::new()
        .merge(routes::router())
        .layer(
            CorsLayer::new()
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::PATCH,
                    Method::DELETE,
                ])
                .allow_origin(tower_http::cors::Any),
        )
        .layer(TraceLayer::new_for_http())
        .layer(from_fn(
            crate::routes::request_context::attach_request_context,
        ))
        .with_state(state)
}
