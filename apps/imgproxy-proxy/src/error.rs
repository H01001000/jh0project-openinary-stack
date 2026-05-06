use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("upstream proxy is not configured")]
    MissingUpstream,
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            AppError::MissingUpstream => StatusCode::NOT_IMPLEMENTED,
        };

        (status, Json(ErrorResponse { error: self.to_string() })).into_response()
    }
}