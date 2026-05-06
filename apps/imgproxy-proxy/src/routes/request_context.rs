use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

pub async fn attach_request_context(request: Request<axum::body::Body>, next: Next) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();

    tracing::debug!(%method, %path, "request received");

    next.run(request).await
}