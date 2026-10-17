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
  with only `{"pin":"0042"}`. No payload fields are interpreted.
- `GET /v1/transfers/{pin}`: return those same bytes as `application/json`;
  return 404 for unknown or invalid PINs. One atomic DELETE RETURNING consumes
  the blob on the first successful GET; later GETs return 404 (no retry).
- `PUT /v1/transfers/{pin}`: replace an existing JSON blob, return HTTP 200
  with the same PIN. Unknown PINs return 404 without creating a blob. The PIN
  authorizes reading; editing also requires the upload-specific `X-Owner-Token`.
  Concurrent writes use last write wins.
- Successful storage GETs also return `X-Uploaded-At`, the server UTC time of
  the most recent POST/PUT. JSON bytes remain unchanged. The doctor displays
  that time beside the PIN in one card containing the regimen and medicines.
  The existing SQLite `created_at` field tracks this last upload; updating a
  blob now moves it to the top of the admin listing without changing its PIN.
- Operational probes: `GET /health/live` and `GET /health/ready`.
- `HEAD /v1/transfers/{pin}` checks availability without consuming content;
  `POST /v1/transfers/{pin}/renew` extends displayed validity to 14 days from now.
  Both require `X-Owner-Token` and return 404 for a different/reused PIN owner.
  POST/PUT receipts keep the JSON `{pin}` and add `X-Owner-Token`,
  `X-Uploaded-At`, `X-Expires-At` headers. Renewal preserves upload time and bytes.
  Migration 0005 adds the token and separate expiry timestamp, backfilling existing
  expiry as upload + 14 days. Old tokenless patient receipts require a new upload.

Use `/api` before these paths through the frontend proxy. POST requires
`Content-Type: application/json`. The API and SQLite enforce a 1 MiB payload
limit (1,048,576 bytes). The proxy must permit the same limit when deployed.
PINs are strings of exactly four ASCII digits (`0000`–`9999`), with leading zeros
preserved. HMAC digests are the lookup keys; optional admin debug mode also stores
the readable PIN. Random allocation plus a bounded namespace scan finds remaining
free PINs; the DB unique key prevents concurrent collisions from overwriting data.
The 10,000-code capacity returns 503 when full, while PUT remains available.
Old six-character codes are rejected without deleting their DB rows. Deploy API
and UI together. Patient v1/v2 receipts migrate to drafts for a new four-digit POST,
preserving original browser keys; the active patient key is v3 and doctor key v2. Keep `TRANSFER_HMAC_SECRET` outside source
control and images; rotation invalidates outstanding PINs.

The patient PWA sends `{ "version": 1, "regimen": "…", "items": […] }`,
without photographs or local IDs. The doctor also accepts legacy `{ "text": "…" }`
tab-separated payloads. Patient and doctor share validation for this format. Unknown strength/package fields may be empty; demo photos always include complete PARALEN, IBALGIN and LETROX items.
It records a local snapshot and displays the returned PIN only after a valid 201
response. The receipt uses server upload/expiry timestamps and an ownership token;
storage's JSON body still contains only the PIN.
The patient keeps one current PIN and reopens it on every page load. Previous
local history migrates to its latest entry; the patient UI has no history. The button below the PIN
returns to the original list and photo upload screen with that snapshot; saving uses PUT and replaces the local history entry
  only after the server confirms the same PIN (restoration of missing data may issue
  a new PIN). No automatic retry or offline upload queue is used. The local Node server handles `/api/transcribe` and interaction proxy endpoints;
storage uploads under `/api/v1/` use the same-origin VPS proxy in deployment.
For local UI development, `npm run web:remote` (or `WEB_BACKEND_URL` set to a
deployed HTTP(S) origin) proxies the allowlisted `/api/` endpoints to that origin,
including storage, transcription and interactions. The local server also serves
the checked-out storage admin assets in this mode and binds to loopback by default.
This changes no API contract or production CORS; requests affect deployed data,
not a temporary local database. Credentials are forwarded only to admin routes;
cookies and forwarding headers are not forwarded. Redirects and retries are disabled.

Admin-only endpoints, enabled with `STORAGE_ADMIN_PASSWORD`:
`GET /v1/admin/blobs` lists paginated size/HMAC metadata;
`DELETE /v1/admin/blobs/{pinDigest}` hard deletes a selected blob.
`DELETE /v1/admin/blobs` hard deletes all current blobs across all pages with the
same admin authentication; the UI requires confirmation.

Validity is display-only for the demo: there is **no age-based deletion job or
server-side age rejection**. The existing cleanup worker still removes only rate
limits. The patient checks on load/visible focus and at most once per visible minute,
hides unverified PINs, and keeps the local snapshot/date after consumption or
displayed expiry. Restore re-uploads a missing snapshot (new PIN/token) or renews
an existing owned blob, without duplicating an expired-but-still-stored demo row.
There is no public DELETE, revocation, or idempotency key.
Each POST creates a new blob. The old encrypted endpoints and embedded browser
demo are removed. Historical SQLite migrations and existing legacy rows are
retained for database compatibility; those rows are not served or deleted.
The migration widening the blob limit copies existing blobs transactionally.
PostgreSQL is not implemented; its old schema is historical only.

## Photo transcription

The patient starts with a secondary “Z galerie” button above a primary
“Vyfotit” button and can keep
adding photos while recognition runs. The UI shows a brief loading status and
recognized medicines, without photo previews, filenames or completed photo cards. A single
background worker processes the growing queue in order, appending each result
as it finishes. A failed photo is shown individually and does not stop the queue.
Saving waits for all queued photos to finish. The native file inputs survive UI
updates so an open file chooser is preserved.

The patient photo UI currently passes `{ mode: 'demo' }` to `recognizePhoto`,
producing three complete synthetic medicines without calling Gemini. Calling
`recognizePhoto(file)` retains real transcription, with no automatic mock fallback.

`POST /api/transcribe` on the patient Node server accepts raw JPEG, PNG or WebP
(up to 20 MiB) and proxies the bytes to the interaction engine's
`POST /transcribe`, which calls OpenRouter (default model `google/gemini-3.6-flash`) through the configured
Gemini-compatible endpoint and returns only `[{name, schedule}]`.
Each field is a string or null; visible strength stays in name. The client maps
these rows to its existing editable items without inventing strength or package
size. Invalid/incomplete provider output fails instead of returning partial data.
The engine reads the provider key and model from process environment variables
(loaded from `.env` by the Rust engine); only the engine holds the API key.
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

Limit requests by socket IP (30 combined POST/PUT/renew writes, 20 GETs per minute); clients behind the
current proxy share limits. Patient HEAD checks have a separate 60/minute budget.
Return `Retry-After: 60` on 429. Cleanup deletes only
expired rate-limit counters, not blobs. Storage grows without automatic expiry;
retention, backups, production authentication, and monitoring need separate work.
Use HTTPS and `Cache-Control: no-store`. The POC storage read audit intentionally
logs the requested PIN, UTC timestamp, placeholder user `poc-user`, socket source
IP and resulting status at INFO level. It logs attempts before validation/rate
limiting and their results separately. Invalid PIN text is escaped and bounded.
Do not log payloads, credentials or full request URLs at gateways or in analytics.

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
