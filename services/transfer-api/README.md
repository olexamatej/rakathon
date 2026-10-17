# Blob storage API

Rust/Axum + SQLite. Two public data endpoints, plus optional protected administration:

| Endpoint | Behavior |
| --- | --- |
| `POST /v1/transfers` | Store any valid JSON, preserving exact request bytes; return HTTP 201 with only `{"pin":"A7K2QM"}`. |
| `GET /v1/transfers/{pin}` | Return the original JSON bytes, HTTP 200 and `Content-Type: application/json`; unknown or invalid PIN returns 404. |

Through the VPS frontend proxy, prefix these paths with `/api`.
POST requires `Content-Type: application/json`; the maximum body is 1 MiB
(1,048,576 bytes), enforced by the API and SQLite.
No medication schema, wrapper, or encryption envelope is required.
New PINs use six uniformly random characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ`,
excluding ambiguous `0`, `1`, `I`, `L`, and `O` (and the previously excluded `U`).
Previously issued PINs containing `0` or `1` remain valid for retrieval.
Collisions never overwrite data;
only keyed PIN digests are stored in SQLite. GET is repeatable and does not delete
or consume the blob. There is no expiry, public DELETE, revocation, or idempotency key.
Each successful POST creates a separate database row with a distinct PIN, even
when the request bytes (including photos or lists) are identical. There is no
content-based deduplication, including retries. Copies can be deleted independently.

```sh
curl http://127.0.0.1:3000/v1/transfers \
  -H 'Content-Type: application/json' --data-binary '{"items":["synthetic"]}'
# {"pin":"A7K2QM"} (random)
curl http://127.0.0.1:3000/v1/transfers/A7K2QM
# {"items":["synthetic"]}
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

Operational probes remain `GET /health/live` and `GET /health/ready`.
The latter checks SQLite. Source rate limits are 30 POSTs and 20 GETs per minute;
clients behind the current proxy share the socket-IP limit. HTTP 429 includes
`Retry-After: 60`. The cleanup worker deletes only expired rate-limit counters.
All responses carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
Do not log request bodies or request URLs: GET URLs contain the secret PIN.
Ensure gateways, analytics, and access logs do not record those URLs either.

## Boundaries and compatibility

This is a synthetic-data prototype, not a clinically approved or production-safe
patient data service. Encryption is not enforced; anyone with a PIN can retrieve
the blob. Six-character PINs and indefinite retention are not a production
security design. Storage grows indefinitely; backups, retention, authentication,
and production monitoring need separate work.

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
