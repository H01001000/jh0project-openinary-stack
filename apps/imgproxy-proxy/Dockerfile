FROM rust:1.87-alpine AS builder

WORKDIR /app
RUN apk add --no-cache musl-dev pkgconfig openssl-dev

COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release

FROM alpine:3.21

WORKDIR /app
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/target/release/imgproxy-proxy /usr/local/bin/imgproxy-proxy

EXPOSE 3000
ENV PORT=3000

CMD ["imgproxy-proxy"]