FROM rust:1.99-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --workspace

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/sidepiece-api /usr/local/bin/sidepiece-api
COPY --from=builder /app/target/release/sidepiece-room-server /usr/local/bin/sidepiece-room-server
COPY --from=builder /app/target/release/sidepiece-event-worker /usr/local/bin/sidepiece-event-worker
CMD ["sidepiece-api"]
