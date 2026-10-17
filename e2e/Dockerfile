# The API source and migrations are built from this commit, never from production.
FROM rust:1-bookworm@sha256:e12566d5abc17a0da741628782cdb504b68b8961f5bfcf677936bf3e8b32de29 AS api
WORKDIR /build
COPY services/transfer-api/Cargo.toml services/transfer-api/Cargo.lock ./
COPY services/transfer-api/src ./src
COPY services/transfer-api/migrations-sqlite ./migrations-sqlite
RUN CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 cargo build --locked

FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf
WORKDIR /work/e2e
COPY e2e/package.json e2e/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=api /build/target/debug/pillgaze-transfer-api /usr/local/bin/pillgaze-transfer-api
COPY e2e/*.mjs ./
COPY apps/patient-web/server.mjs /work/apps/patient-web/server.mjs
COPY apps/patient-web/public /work/apps/patient-web/public
COPY apps/storage-admin/public /work/apps/storage-admin/public
COPY data/regimens.json /work/data/regimens.json
ENV CI=true \
    E2E_API_BINARY=/usr/local/bin/pillgaze-transfer-api \
    E2E_OUTPUT_DIR=/tmp/test-results \
    npm_config_cache=/tmp/npm-cache
USER 1000:1000
CMD ["npm", "test"]
