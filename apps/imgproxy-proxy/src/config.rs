use std::{env, net::SocketAddr};

use aws_config::Region;
use aws_sdk_s3::config::{Credentials, RequestChecksumCalculation};
use thiserror::Error;

#[derive(Clone, Debug)]
pub struct S3Config {
    pub client: aws_sdk_s3::Client,
    pub bucket_name: String,
}

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub listen_address: SocketAddr,
    pub imgproxy_url: String,
    pub s3_config: S3Config,
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

        let region = env::var("S3_DEFAULT_REGION")
            .map_err(|_| ConfigError::MissingEnvVar("S3_DEFAULT_REGION"))?;
        let access_key_id = env::var("S3_ACCESS_KEY_ID")
            .map_err(|_| ConfigError::MissingEnvVar("S3_ACCESS_KEY_ID"))?;
        let secret_access_key = env::var("S3_SECRET_ACCESS_KEY")
            .map_err(|_| ConfigError::MissingEnvVar("S3_SECRET_ACCESS_KEY"))?;
        let bucket_name =
            env::var("S3_BUCKET_NAME").map_err(|_| ConfigError::MissingEnvVar("S3_BUCKET_NAME"))?;
        let endpoint_url = env::var("S3_ENDPOINT_URL")
            .map_err(|_| ConfigError::MissingEnvVar("S3_ENDPOINT_URL"))?;

        let s3_config = aws_sdk_s3::config::Builder::new()
            .region(Region::new(region))
            .endpoint_url(endpoint_url)
            .credentials_provider(
                Credentials::builder()
                    .access_key_id(access_key_id)
                    .secret_access_key(secret_access_key)
                    .provider_name("garage")
                    .build(),
            )
            .force_path_style(true)
            .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
            .behavior_version_latest()
            .build();
        let s3_client = aws_sdk_s3::Client::from_conf(s3_config);

        Ok(Self {
            listen_address,
            imgproxy_url,
            s3_config: S3Config {
                client: s3_client,
                bucket_name,
            },
        })
    }
}
