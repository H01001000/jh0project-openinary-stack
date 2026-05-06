use std::{env, net::SocketAddr};

use thiserror::Error;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub listen_address: SocketAddr,
    pub imgproxy_url: String,
    pub s3_bucket_name: String,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    MissingEnvVar(&'static str),
    #[error("invalid LISTEN_ADDRESS: {0}")]
    InvalidListenAddress(String),
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let listen_address = env::var("LISTEN_ADDRESS")
            .unwrap_or_else(|_| "0.0.0.0:3000".into())
            .parse::<SocketAddr>()
            .map_err(|_| ConfigError::InvalidListenAddress("expected host:port".to_string()))?;

        let imgproxy_url =
            env::var("IMGPROXY_URL").map_err(|_| ConfigError::MissingEnvVar("IMGPROXY_URL"))?;

        let s3_bucket_name =
            env::var("S3_BUCKET_NAME").map_err(|_| ConfigError::MissingEnvVar("S3_BUCKET_NAME"))?;

        Ok(Self {
            listen_address,
            imgproxy_url,
            s3_bucket_name,
        })
    }
}
