# imgproxy-proxy

Axum-based Rust template for the imgproxy proxy service.

## Layout

- `src/main.rs`: process entrypoint
- `src/config.rs`: environment-driven configuration
- `src/app.rs`: router assembly and middleware wiring
- `src/routes/`: request handlers grouped by feature
- `src/state.rs`: shared application state
- `src/error.rs`: typed API errors

## Run

```bash
cargo run
```

## Environment

- `LISTEN_ADDRESS`: required socket address, for example `0.0.0.0:3000`
- `IMGPROXY_URL`: required upstream imgproxy base URL
- `S3_BUCKET_NAME`: required cache/storage bucket name