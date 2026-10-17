# Blob storage API

Rust/Axum + SQLite. Public storage endpoints, plus optional protected administration:

| Endpoint | Behavior |
| --- | --- |
| `POST /v1/transfers` | Store any valid JSON, preserving exact request bytes; return HTTP 201 with only `{"pin":"0042"}`. |
| `GET /v1/transfers/{pin}` | Return the original JSON bytes, HTTP 200 and `Content-Type: application/json`; unknown or invalid PIN returns 404. |
| `HEAD /v1/transfers/{pin}` | Check availability without consuming JSON; requires `X-Owner-Token`. |
| `PUT /v1/transfers/{pin}` | Replace JSON under the same PIN; requires `X-Owner-Token`. |
| `POST /v1/transfers/{pin}/renew` | Extend displayed validity to 14 days from now; requires `X-Owner-Token`, no body. |

Through the VPS frontend proxy, prefix these paths with `/api`.
POST requires `Content-Type: application/json`; the maximum body is 1 MiB
(1,048,576 bytes), enforced by the API and SQLite.
No medication schema, wrapper, or encryption envelope is required.
PINs are exactly four ASCII digits, returned and accepted as strings (`0000`–`9999`).
Leading zeros are significant. Generation uses unbiased cryptographic randomness.
There are at most 10,000 simultaneously occupied four-digit PINs. After bounded
random collision retries, allocation scans the remaining codes; concurrent uploads
are resolved by the database unique key. Full storage returns HTTP 503 without
modifying existing records. PUT still works when all PINs are occupied.
Collisions never overwrite data;
keyed PIN digests identify SQLite rows (debug mode may also store the PIN).
GET atomically deletes and returns the blob: only one concurrent retrieval succeeds.
If the response is lost, the patient must upload again from scratch.
There is no public DELETE, revocation, or idempotency key.
Each successful POST creates a separate database row with a distinct PIN, even
when the request bytes (including photos or lists) are identical. There is no
content-based deduplication, including retries. Copies can be deleted independently.

```sh
curl http://127.0.0.1:3000/v1/transfers \
  -H 'Content-Type: application/json' --data-binary '{"items":["synthetic"]}'
# {"pin":"0042"} (random)
curl http://127.0.0.1:3000/v1/transfers/0042
# {"items":["synthetic"]}; a second GET returns 404
```

## Run and configuration

```sh
export TRANSFER_HMAC_SECRET='replace-with-a-random-secret-of-at-least-32-bytes'
cargo run --locked --manifest-path services/transfer-api/Cargo.toml
```

Default bind: `127.0.0.1:3000`; default database:
`services/transfer-api/data/transfers.sqlite3`. Override with `BIND_ADDRESS` and
`PILLGAZE_DB_PATH`. `CORS_ALLOWED_ORIGINS` is a comma-separated exact-origin list.
Keep the database and HMAC secret outside Git and images. Changing the HMAC
secret makes existing PINs unusable. On this VPS, run builds/tests only in an
isolated non-root sandbox, not as the Docker-enabled host user.

Successful GETs return `X-Uploaded-At` (RFC 3339 UTC) from the stored upload
timestamp. POST sets it, PUT updates it atomically with the payload. Existing
rows retain their original upload time until updated. The existing `created_at`
column tracks this most recent upload, so updated blobs move up in admin listings.
POST/PUT also return `X-Owner-Token` (random 256-bit upload credential) and
`X-Expires-At`. Migration 0005 adds ownership and separate expiry timestamps;
existing rows get a display deadline of upload + 14 days and no ownership token.
Patient receipts without a valid future local expiry are marked invalid on load.
Renewal changes only expiry, preserving JSON and the real upload time.
**Demo only:** validity is display-only. No age-based deletion job or automatic
age rejection is implemented; cleanup still only deletes rate-limit counters.
Patient HEAD checks cannot consume data, and stale tokens cannot edit or renew
a PIN later allocated to another upload. Never log the token.
Patient load checks local expiry before HEAD. Expired deadlines or missing server
rows mark the local receipt expired and return to fresh photo upload. The invalid
PIN/list stay locally; unsent edits are retained separately as `invalidatedDraft`.
Neither is automatically restored or uploaded.
Network errors retain data for another check; expired lists cannot be restored.
Saving an active patient draft validates availability first: PUT for an existing
valid upload, POST with a fresh PIN otherwise. A PUT 404 race permits one POST;
uncertain writes and service errors are not retried. The draft is preserved until
the write succeeds. This differs intentionally from page-load expiration reset.

Operational probes remain `GET /health/live` and `GET /health/ready`.
The latter checks SQLite. Source rate limits are 30 combined POST/PUT/renew writes,
20 GETs and a separate 60 HEAD checks per minute;
clients behind the current proxy share the socket-IP limit. HTTP 429 includes
`Retry-After: 60`. The cleanup worker deletes only expired rate-limit counters.
All responses carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
In POC mode, every storage GET handler emits INFO events `storage_read_attempt`
(before validation/rate limiting/database access) and `storage_read_result`
(with the HTTP status, including 404, 429 and 503). Each carries an explicit UTC
`timestamp`, `pin`, fixed placeholder `user="poc-user"`, and socket `source_ip`.
The pair shares a process-local `read_id` for correlation during concurrent reads.
The identity is not authenticated; behind a proxy the IP identifies the proxy.
Valid PINs are logged in full; invalid input is escaped and capped at 128 characters.
An attempt without a result means the operation did not finish (for example shutdown).
These events use the existing process log stream; no database migration or log
volume is added. `RUST_LOG` defaults to `info`; a stricter filter suppresses them.
After deployment, inspect using `docker logs --since 10m pillgaze-transfer-api`.
Do not log request bodies or full request URLs.
Ensure gateways, analytics, and access logs do not record those URLs either.

## Boundaries and compatibility

This is a synthetic-data prototype, not a clinically approved or production-safe
patient data service. Encryption is not enforced; anyone with a PIN can retrieve
the blob; replacing it also needs the upload-specific token. Four-digit PINs and indefinite retention are not a production
security design. Storage grows indefinitely; backups, retention, authentication,
and production monitoring need separate work.

This changes the previous six-character contract. GET/PUT now reject those old
PINs (404); their database rows remain available to the protected admin and are
not deleted or renumbered. Deploy API and patient/doctor UI together. The patient
migrates its old local receipt to an editable draft for a new POST, preserving any
unfinished draft; original v1/v2 browser storage stays intact. New receipts use
`pillgaze:patient:v3`; doctor history uses `pillgaze:doctor:v2`, leaving v1 intact.
Deleting a record releases its PIN for future uploads; an old shared PIN must not
be treated as a permanent patient identifier.

The old encrypted upload, redeem, revoke, and browser demo routes are removed.
Historical SQLite migrations are intentionally retained unchanged so existing
databases still migrate successfully. Legacy rows are neither exposed by these
endpoints nor deleted. No destructive migration is performed. The unused
PostgreSQL schema is historical; there is no PostgreSQL adapter.

## Storage administration

Optional password-protected metadata listing and hard deletion for JSON blobs:
`GET /v1/admin/blobs?offset=0` and `DELETE /v1/admin/blobs/{pinDigest}`.
Set `STORAGE_ADMIN_PASSWORD` privately to enable; unset means disabled (404).
See [`apps/storage-admin/README.md`](../../apps/storage-admin/README.md) for
the separate static UI, authentication limits, tests and deployment inputs.

Shared contract: [`../../packages/api-contract/openapi.yaml`](../../packages/api-contract/openapi.yaml).
Repository changes do not deploy the live VPS automatically. Before deploying,
update the external operational smoke scripts to the POST/GET contract; old
encrypted-demo checks are incompatible. Preserve the persistent volume and secret.
Also raise the frontend Nginx `client_max_body_size` from `384k` to `1m` before
accepting blobs up to the new limit; the live proxy is not changed by this commit.
