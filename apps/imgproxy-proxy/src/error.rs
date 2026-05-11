use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("upstream returned error status: {0}")]
    UpstreamError(StatusCode),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let status: StatusCode = match self {
            AppError::UpstreamError(code) => code,
        };

        (
            status,
            Json(ErrorResponse {
                error: self.to_string(),
            }),
        )
            .into_response()
    }
}
