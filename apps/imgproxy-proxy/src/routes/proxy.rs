use crate::{error::AppError, state::AppState};
use aws_sdk_s3::primitives::ByteStream;
use axum::body::Body;
use axum::extract::{OriginalUri, State};
use axum::http::header::{HeaderMap, HeaderValue};
use axum::response::Response;
use futures_util::{StreamExt, TryStreamExt};
use http::StatusCode;
use hyper::body::Frame;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to create HTTP client")
});

pub fn get_request_hash(path: &str, accept_header: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    hasher.update(accept_header.as_bytes());

    let result = hasher.finalize();
    hex::encode(result)
}

pub async fn unsafe_image(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let path = uri.path().to_owned();
    let accept_header = headers
        .get("Accept")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    let request_hash = get_request_hash(&path, &accept_header);

    let s3_result = state
        .config
        .s3_config
        .client
        .get_object()
        .bucket(state.config.s3_config.bucket_name.clone())
        .key(&request_hash)
        .send()
        .await;

    let s3_result = match s3_result {
        Ok(s3_result) => {
            tracing::info!(
                path = %path,
                request_hash = %request_hash,
                "Cache hit for key"
            );

            let mut response_builder = Response::builder();
            if let Some(content_type) = s3_result.content_type {
                response_builder.headers_mut().unwrap().insert(
                    "Content-Type",
                    HeaderValue::from_str(&String::from(content_type)).unwrap(),
                );
            }
            let response = response_builder
                .body(Body::from_stream(tokio_util::io::ReaderStream::new(
                    s3_result.body.into_async_read(),
                )))
                .map_err(|e| {
                    tracing::error!(
                        error = ?e,
                        path = %path,
                        request_hash = %request_hash,
                        "Failed to build response from S3 response"
                    );
                    AppError::UpstreamError(StatusCode::INTERNAL_SERVER_ERROR)
                })?;

            return Ok(response);
        }
        Err(e) => e,
    };

    if s3_result
        .as_service_error()
        .is_some_and(|e| e.is_no_such_key())
    {
        tracing::info!(
            path = %path,
            request_hash = %request_hash,
            "Cache miss for key"
        );
    } else {
        tracing::error!(
            error = ?s3_result,
            path = %path,
            request_hash = %request_hash,
            "Failed to get object from S3"
        );
        return Err(AppError::UpstreamError(StatusCode::INTERNAL_SERVER_ERROR));
    }

    let resp = CLIENT
        .get(format!("https://img.jh0project.com/{}", path))
        .header("Accept", accept_header)
        .send()
        .await
        .map_err(|e| {
            tracing::error!(
                error = ?e,
                path = %path,
                request_hash = %request_hash,
                "Failed to fetch image from imgproxy"
            );
            AppError::UpstreamError(StatusCode::INTERNAL_SERVER_ERROR)
        })?
        .error_for_status()
        .map_err(|e| {
            tracing::error!(
                error = ?e,
                path = %path,
                request_hash = %request_hash,
                "Received error status from imgproxy"
            );
            AppError::UpstreamError(e.status().unwrap_or(StatusCode::INTERNAL_SERVER_ERROR))
        })?;
    let headers = resp.headers().clone();
    let content_type = headers.get("Content-Type").clone();
    let s3_content_type = content_type
        .and_then(|h| h.to_str().ok())
        .map(str::to_owned);
    let status = resp.status();
    let (s3_upload_tx, s3_upload_rx) = mpsc::channel::<Result<bytes::Bytes, reqwest::Error>>(64);
    let (response_tx, response_rx) = mpsc::channel::<Result<bytes::Bytes, reqwest::Error>>(64);
    let mut resp_body = resp.bytes_stream();

    tokio::spawn(async move {
        while let Some(item) = resp_body.next().await {
            match item {
                Ok(chunk) => {
                    let chunk2 = chunk.clone();

                    if s3_upload_tx.send(Ok(chunk)).await.is_err() {
                        break;
                    }

                    if response_tx.send(Ok(chunk2)).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    tracing::error!(
                        error = ?err,
                        "Error while reading response body"
                    );
                    break;
                }
            }
        }
    });

    let request_hash_for_upload = request_hash.clone();
    let path_for_upload = path.clone();
    tokio::spawn(async move {
        let put_body = ByteStream::from_body_1_x(http_body_util::StreamBody::new(
            ReceiverStream::new(s3_upload_rx).map_ok(Frame::data),
        ));

        let s3_upload_result = state
            .config
            .s3_config
            .client
            .put_object()
            .bucket(state.config.s3_config.bucket_name.clone())
            .key(request_hash_for_upload.clone())
            .body(put_body)
            .set_content_type(s3_content_type)
            .send()
            .await;

        match s3_upload_result {
            Ok(_) => tracing::info!(
                path = %path_for_upload,
                request_hash = %request_hash_for_upload,
                "Cached image"
            ),
            Err(e) => {
                tracing::error!(
                    error = ?e,
                    path = %path_for_upload,
                    request_hash = %request_hash_for_upload,
                    "Failed to cache image"
                )
            }
        }
    });

    let mut response_builder = Response::builder().status(status);
    if let Some(content_type) = content_type {
        response_builder
            .headers_mut()
            .unwrap()
            .insert("Content-Type", content_type.clone());
    }

    let response = response_builder
        .body(Body::from_stream(ReceiverStream::new(response_rx)))
        .map_err(|e| {
            tracing::error!(
                error = ?e,
                path = %path,
                request_hash = %request_hash,
                "Failed to build response from imgproxy response"
            );
            AppError::UpstreamError(StatusCode::INTERNAL_SERVER_ERROR)
        })?;

    Ok(response)
}
