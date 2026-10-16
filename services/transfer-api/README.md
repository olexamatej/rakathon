# Transfer API

Rust HTTP service with two separate transfer paths:

- `POST /v1/transfers`: store any valid JSON as an opaque blob, preserving exact
  request bytes. Send `Content-Type: application/json`; no wrapper or medication
  schema is required. Returns HTTP 201 with only `{"pin":"A7K2QM"}`. PINs are
  six random Crockford Base32 alphanumeric characters; collisions are retried
  without overwriting stored blobs. Only keyed PIN digests are persisted.
  The request limit is 384 KiB and the existing source rate limit is retained.
  Blobs have **no expiry, retrieval, or revocation endpoint yet** and are not
  deleted by the legacy cleanup worker. Storage can grow indefinitely.
  This path does not enforce client-side encryption: do not send real patient data.
- `POST /v1/encrypted-transfers`: legacy client-encrypted envelope upload, used
  by the browser demo. This path remains a blind relay; it must never receive
  the decryption key. Existing redemption and revocation routes are unchanged.

Example for the new path (synthetic data):

```sh
curl -X POST http://127.0.0.1:3000/v1/transfers \
  -H 'Content-Type: application/json' \
  --data-binary '{"anything":["synthetic",123]}'
# {"pin":"A7K2QM"} (random on each successful request)
```

The lifecycle and encryption notes below apply to the legacy path only.

Local development uses a persistent SQLite file. Azure deployment will use
PostgreSQL; both implementations must preserve the same HTTP contract and
single-use redemption behavior. SQLite is not suitable for a shared file across
scaled service replicas.

The service also serves the two-sided prototype at `/demo/patient` and
`/demo/doctor`. It embeds the static files from
[`../../apps/transfer-demo/`](../../apps/transfer-demo/README.md), so the browser
clients and API use the same origin. This demo accepts a medication-list JSON
document; photo capture and OCR are not implemented yet.

The shared endpoint and request/response definitions are in
[`../../packages/api-contract/openapi.yaml`](../../packages/api-contract/openapi.yaml).
The initial PostgreSQL schema is in `migrations/0001_create_transfers.sql`.

## Run locally

Install a current Rust toolchain, then from the repository root:

```sh
export TRANSFER_HMAC_SECRET='replace-with-a-random-secret-of-at-least-32-bytes'
cargo run --manifest-path services/transfer-api/Cargo.toml
```

Then open `http://127.0.0.1:3000/demo/patient` and, in another tab or browser
profile, `http://127.0.0.1:3000/demo/doctor`. Use only synthetic data. The patient
page encrypts the JSON before sending it; give the doctor the retrieval PIN and
the decryption key through separate channels. The doctor page sends only the PIN
to the API and decrypts the returned envelope locally.

The service listens on `127.0.0.1:3000` by default and creates
`services/transfer-api/data/transfers.sqlite3` when started from the repository
root. Set `BIND_ADDRESS` and `PILLGAZE_DB_PATH` to override those defaults.
Copy `.env.example` to `.env` in this directory, replace the secret, then load
it in your shell before starting the service:

```sh
cp services/transfer-api/.env.example services/transfer-api/.env
set -a
source services/transfer-api/.env
set +a
cargo run --manifest-path services/transfer-api/Cargo.toml
```

Only the exact origins in `CORS_ALLOWED_ORIGINS` receive browser CORS headers.
Local state and `.env` files are ignored by Git. Use synthetic medication data
only. For a physical phone, bind to the development machine's LAN address and
configure the API URL in the client; `127.0.0.1` on the phone refers to the
phone itself.

## Implementation boundary

- Keep the documented endpoints aligned with the shared OpenAPI contract.
- Keep persistence behind the store module. Local SQLite is the development
  implementation; PostgreSQL is the Azure implementation target. Redemption
  must be atomic across API replicas when deployed.
- Store keyed digests of retrieval and revocation secrets, never their raw
  values. Keep the digest pepper outside the database in Azure Key Vault.
- Use one atomic database update and the same idempotency key to support a retry
  after a lost redemption response.
- Enforce request-size, code-attempt, and source rate limits. SQLite counters
  apply to one local service instance; Azure counters must use shared storage.
- `GET /health/live` must not query PostgreSQL. `GET /health/ready` must check
  required dependencies without exposing connection details.
- Keep `Cache-Control: no-store` on every response, especially transfer
  responses that contain one-time secrets.
- Do not log request bodies, headers containing secrets, ciphertext, or codes.
- Keep a redeemed ciphertext only until the original expiry so the same
  idempotency key can retry; delete expired and revoked rows with the scheduled
  cleanup task.

Do not use real patient data during local development. Before public deployment,
review Azure storage, trusted-proxy client IP handling, rate limits across
replicas, expiry cleanup, secret handling, TLS, monitoring scrubbing, and
recovery behavior.
