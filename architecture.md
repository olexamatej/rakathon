# PillGaze architecture

**Status:** synthetic-data prototype; deployment uses Docker Compose on Hetzner.

## Components

| Area | Responsibility |
| --- | --- |
| `apps/patient-web/` | Patient PWA with storage upload, plus the `/lekar` doctor UI served by the same Node server. Patient uploads and doctor retrieval use storage; interaction checks and site research use the interaction engine. The patient UI explicitly uses demo recognition with three complete synthetic medicines; real photo bytes are proxied to the engine's `/transcribe`. |
| `apps/doctor-web/` | Historical placeholder; the implemented doctor UI lives in `apps/patient-web/`. |
| `services/transcription/` | Standalone Python CLI/HTTP experiment for photo transcription; the patient server no longer uses it. |
| `services/transfer-api/` | Rust/Axum opaque JSON storage backed by SQLite. |
| `packages/api-contract/` | OpenAPI storage and separate transcription contracts. |
| `interaction-engine/` | Separate Rust interaction service: interaction checks, web research and `POST /transcribe` photo transcription; not part of storage. |
| `infra/vps/` | Existing Compose deployment notes and generic image inputs. |

## Storage contract

- `POST /v1/transfers`: store any valid JSON as exact bytes; return HTTP 201
  with only `{"pin":"A7K2QM"}`. No payload fields are interpreted.
- `GET /v1/transfers/{pin}`: return those same bytes as `application/json`;
  return 404 for unknown or invalid PINs. Repeated GETs do not consume the blob.
- Operational probes: `GET /health/live` and `GET /health/ready`.

Use `/api` before these paths through the frontend proxy. POST requires
`Content-Type: application/json`. The API and SQLite enforce a 1 MiB payload
limit (1,048,576 bytes). The proxy must permit the same limit when deployed.
PINs are six random Crockford Base32 characters, stored only as HMAC digests;
collisions do not overwrite data. Keep `TRANSFER_HMAC_SECRET` outside source
control and images; rotation invalidates outstanding PINs.

The patient PWA sends `{ "version": 1, "regimen": "…", "items": […] }`,
without photographs or local IDs. The doctor also accepts legacy `{ "text": "…" }`
tab-separated payloads. Patient and doctor share validation for this format. Unknown strength/package fields may be empty; demo photos always include complete PARALEN, IBALGIN and LETROX items.
It records a local snapshot and displays the returned PIN only after a valid 201
response. The receipt timestamp is client-side; storage returns only the PIN.
No automatic retry or offline upload queue is used. The local Node server handles `/api/transcribe` and interaction proxy endpoints;
storage uploads under `/api/v1/` require the same-origin VPS proxy.

Admin-only endpoints, enabled with `STORAGE_ADMIN_PASSWORD`:
`GET /v1/admin/blobs` lists paginated size/HMAC metadata;
`DELETE /v1/admin/blobs/{pinDigest}` hard deletes a selected blob.
`DELETE /v1/admin/blobs` hard deletes all current blobs across all pages with the
same admin authentication; the UI requires confirmation.

There is no expiry, public DELETE, revocation, idempotency key, or single-use retrieval.
Each POST creates a new blob. The old encrypted endpoints and embedded browser
demo are removed. Historical SQLite migrations and existing legacy rows are
retained for database compatibility; those rows are not served or deleted.
The migration widening the blob limit copies existing blobs transactionally.
PostgreSQL is not implemented; its old schema is historical only.

## Photo transcription

The patient photo UI currently passes `{ mode: 'demo' }` to `recognizePhoto`,
producing three complete synthetic medicines without calling Gemini. Calling
`recognizePhoto(file)` retains real transcription, with no automatic mock fallback.

`POST /api/transcribe` on the patient Node server accepts raw JPEG, PNG or WebP
(up to 20 MiB) and proxies the bytes to the interaction engine's
`POST /transcribe`, which calls Gemini 3.6 Flash through the configured
Gemini-compatible endpoint and returns only `[{name, schedule}]`.
Each field is a string or null; visible strength stays in name. The client maps
these rows to its existing editable items without inventing strength or package
size. Invalid/incomplete provider output fails instead of returning partial data.
The engine reads the provider key and model from process environment variables
(sourced from `.env` by `npm run engine`); only the engine holds the API key.
Large photos against the default Google endpoint use temporary Google Files,
deleted after generation. There is no automatic retry or fallback to simulated
data. This is separate from the opaque Rust storage.
See [configuration and routing](docs/gemini-transcription.md) and
[the transcription contract](packages/api-contract/transcription.openapi.yaml).

## Security and lifecycle

This API does not enforce encryption or process medication content. Anyone with
a PIN can read the blob. Use only synthetic data: a short PIN with indefinite
retention is not a production patient-data security design. No OCR, interaction
checks, accounts, or clinical validation belong to this storage service.

Limit requests by socket IP (30 POSTs, 20 GETs per minute); clients behind the
current proxy share limits. Return `Retry-After: 60` on 429. Cleanup deletes only
expired rate-limit counters, not blobs. Storage grows without automatic expiry;
retention, backups, production authentication, and monitoring need separate work.
Use HTTPS and `Cache-Control: no-store`. Never log bodies, PINs, or GET request
URLs containing PINs, including at gateways or in analytics.

## VPS deployment

Public traffic enters `https://rakathon.denishromada.com` through the shared
Nginx gateway. Frontend and API run in separate Compose projects. Only gateway
80/443 are public; frontend 8080 and API 3000 bind to host IPv4 localhost.
The independent CI runner is isolated from application networks and credentials.

Operational files live outside this repo in `/home/rhodes/rakathon-site`,
`/home/rhodes/pillgaze-transfer`, and `/home/rhodes/webserver`. Preserve the API's
`pillgaze-transfer-data` volume and protected `.secrets/transfer.env` file.
Do not use `down -v` or change other websites during storage work.

The separate static admin in `apps/storage-admin/` is intended for `/storage-admin`.
Its private container does not mount the database; admin list/delete requests
go through the transfer API, enabled only when `STORAGE_ADMIN_PASSWORD` is set.
See [admin configuration and limits](apps/storage-admin/README.md). These are
repository deployment inputs, not evidence that admin has been deployed.

Pushes do not deploy. Before API deployment, update the external smoke checks
from the removed encrypted-demo contract and raise the frontend Nginx body
limit from `384k` to `1m`. The manual UI refresh does not deploy this API.
Keep rollback images and validate migrations on a database copy before rollout.
See [`infra/vps/README.md`](infra/vps/README.md).

There is no Kubernetes cluster or PostgreSQL adapter. Do not restore abandoned
Azure/Kubernetes infrastructure as a deployment prerequisite. Build and test
repository code only in an isolated non-root sandbox on this VPS.
