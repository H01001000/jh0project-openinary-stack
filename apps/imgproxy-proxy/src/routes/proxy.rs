use axum::body::Body;
use axum::extract::{Path, State};

use crate::{error::AppError, state::AppState};
use axum::http::StatusCode;
use axum::response::{self, IntoResponse, Response};
use reqwest::Client;
use std::sync::LazyLock;

static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to create HTTP client")
});

pub async fn unsafe_image(
    State(_state): State<AppState>,
    Path(path): Path<String>,
) -> Result<Response, AppError> {
    let resp = CLIENT
        .get(format!("https://img.jh0project.com/unsafe/{}", path))
        .send()
        .await
        .map_err(|e| AppError::MissingUpstream)?;

    let mut response_builder = Response::builder().status(resp.status());
    *response_builder.headers_mut().unwrap() = resp.headers().clone();

    let response = response_builder
        .body(Body::from_stream(resp.bytes_stream()))
        .map_err(|e| AppError::MissingUpstream)?;

    Ok(response)
}
