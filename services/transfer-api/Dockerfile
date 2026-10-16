# Multi-stage build for the PillGaze transfer API.
# Builder and runtime images are pinned by digest so builds are reproducible.
# The compiled binary embeds the SQLite migrations via sqlx::migrate!(), so the
# runtime image needs no migration files or build tooling.

FROM rust:1-bookworm@sha256:e12566d5abc17a0da741628782cdb504b68b8961f5bfcf677936bf3e8b32de29 AS build

WORKDIR /build/services/transfer-api

# Build context is the repository root (the binary embeds apps/transfer-demo).
# Copy manifests first to keep dependency compilation cacheable.
# The lock file is authoritative: cargo build --locked fails if later commits
# drift from pinned dependency versions.
COPY services/transfer-api/Cargo.toml services/transfer-api/Cargo.lock ./

COPY services/transfer-api/src ./src
COPY services/transfer-api/migrations-sqlite ./migrations-sqlite
COPY apps/transfer-demo /build/apps/transfer-demo

# Bound parallelism so a 2 vCPU GitHub-hosted runner is not oversubscribed.
RUN CARGO_BUILD_JOBS=2 CARGO_PROFILE_RELEASE_DEBUG=0 cargo build --release --locked \
 && mv target/release/pillgaze-transfer-api /out-transfer-api

# Runtime image must run with a non-root user and a read-only filesystem.
FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

# UID/GID 1000 mirrors the Compose deployment on the VPS.
RUN mkdir /data && chown 1000:1000 /data && chmod 0700 /data
COPY --chmod=0755 --from=build /out-transfer-api /usr/local/bin/pillgaze-transfer-api

USER 1000:1000
WORKDIR /data
ENV RUST_LOG=info \
    BIND_ADDRESS=0.0.0.0:3000
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/pillgaze-transfer-api"]
