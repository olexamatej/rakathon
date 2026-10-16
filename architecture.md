# PillGaze Architecture

**Status:** transfer API and browser demo on the VPS; synthetic-data prototype
**Backend language:** Rust
**Deployment target:** Docker Compose on the Hetzner VPS

This document defines the first shared system boundary for parallel work. The
current Expo application remains at the repository root while it is actively
being developed. New backend, doctor web, and API contract work belongs
in the directories listed below. Moving the existing application is a separate
coordinated change because the current scripts and CI expect its root entry
points.

The transfer API now has a local Rust/Axum implementation backed by SQLite.
A PostgreSQL schema is retained for possible future storage work, but its adapter
is not implemented. The abandoned Azure/Kubernetes infrastructure is not a
deployment target.
The API serves a small patient-and-doctor browser demo at `/demo/patient` and
`/demo/doctor`. It accepts a medication-list JSON document; the photo-to-list
and OCR flow is not implemented yet.

## Product flow

### Current opaque-blob upload

`POST /v1/transfers` accepts any valid JSON and stores its exact bytes in the
separate SQLite `blob_transfers` table. It returns only a random six-character
alphanumeric `pin`; PINs are persisted as keyed digests, and collisions never
overwrite existing blobs. Payload fields are not interpreted. Expiry and
retrieval are not implemented for this path yet. It does not enforce encryption
and is for synthetic data only; storage currently grows without automatic cleanup.

### Legacy encrypted demo flow

The following flow and ciphertext-only trust boundaries describe the separate
legacy demo, whose upload route is now `POST /v1/encrypted-transfers`, not the
new opaque-blob endpoint.

1. The patient client captures or selects medicine photos and extracts a draft
   medication list. The patient reviews and confirms every item before sharing.
2. The patient client serializes the confirmed list and encrypts it on the
   device. Photos are not part of the transfer payload.
3. The client uploads only the encrypted envelope to the Rust transfer API.
   The service returns a short-lived, single-use retrieval code and a separate
   revocation token.
4. The patient gives the retrieval code to the doctor. The doctor web app sends
   that code to the API and receives the encrypted envelope.
5. The doctor obtains the decryption key from the patient through a separate
   in-person channel (for example, a local QR code). The doctor web app decrypts
   the envelope in the browser and displays the medication list for review.
6. The API marks a transfer as redeemed atomically. A redeemed ciphertext may
   remain until its original expiry so the same doctor request can retry after
   a lost response. Expired and revoked transfers are removed by a scheduled
   cleanup task.

The exact patient and doctor interaction can change, but the API must not
receive the decryption key. A retrieval PIN is an authorization secret, not an
encryption key. Deriving the encryption key from a short numeric PIN would make
offline guessing possible if an encrypted payload were copied.

## Trust and security boundaries

- Encrypt the structured medication list in the patient client with a fresh,
  cryptographically random 256-bit key and authenticated encryption (AES-256-GCM
  is the initial format). Use a unique 96-bit nonce per key.
- Keep the decryption key in the patient client and pass it to the doctor
  separately from the API request. Do not include it in URLs, API bodies,
  analytics, logs, or crash reports.
- Treat the API and database as untrusted for medication content: they store and
  return ciphertext only. The Rust service does not perform OCR or decrypt data.
- Generate a 12-character Crockford Base32 one-time retrieval code (60 bits;
  not a four-digit demo PIN). Store only a keyed digest of it. Enforce short
  expiry, attempt limits, and
  atomic single-use redemption across all service instances.
- Return the raw revocation token only once; store its keyed digest. Do not
  expose transfer IDs as authorization credentials.
- Require HTTPS, strict request-size limits, input validation, and generic
  errors for unavailable transfers. Never log request bodies, codes, tokens,
  ciphertext, or patient data.
- Do not send medicine photos to the transfer API. OCR should run in the client
  by default. Any third-party OCR service needs a separately reviewed data and
  retention boundary before integration.

This is a software architecture baseline, not a clinical safety claim or a
completed privacy/security review. The client must present OCR output as a draft
and require patient confirmation before transfer.

## Repository ownership map

| Area | Responsibility |
| --- | --- |
| Repository root (`App.tsx`, `src/`) | Existing Expo patient prototype and shared UI; keep its entry points at root during active work. |
| `apps/doctor-web/` | Doctor-facing browser client; enters a retrieval code, obtains the separate key, decrypts locally, and reviews the list. |
| `services/transfer-api/` | Rust HTTP API, persistence, expiry, redemption, revocation, and health endpoints. |
| `packages/api-contract/` | OpenAPI contract shared by patient client, doctor web, and backend. |
| `infra/vps/` | Existing Docker Compose deployment notes and generic frontend image inputs. |

Agree on folder ownership in the related PR before touching another team's
active files. API changes should update the OpenAPI document first and keep all
three consumers aligned.

## Backend API

The initial contract is [`packages/api-contract/openapi.yaml`](packages/api-contract/openapi.yaml).

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/transfers` | Store opaque JSON bytes and return only a six-character PIN. No expiry or retrieval yet. |
| `POST /v1/encrypted-transfers` | Legacy encrypted demo: return a retrieval code, expiry, and revocation token once. |
| `POST /v1/transfers/redeem` | Atomically redeem a code and return the encrypted envelope. Supports a same-client idempotent retry. |
| `DELETE /v1/transfers/{transferId}` | Revoke a transfer using its separate revocation token. |
| `GET /v1/admin/blobs` | Password-protected paginated JSON storage metadata (size and HMAC PIN digest only). |
| `DELETE /v1/admin/blobs/{pinDigest}` | Password-protected hard deletion of one JSON blob. |
| `GET /health/live` | Process liveness; does not depend on PostgreSQL. |
| `GET /health/ready` | Readiness check; succeeds only when required dependencies are available. |

The initial payload is a compact JSON medication-list document encrypted by the
client. The API stores the ciphertext, nonce, and format version. Do not put
images, OCR intermediates, patient identifiers, or unencrypted medication names
in the transfer record.

For the local browser demo, the patient page creates an AES-256-GCM key with Web
Crypto, encrypts the supplied JSON, and uploads only the envelope. The doctor
page submits the retrieval code, receives the ciphertext, and decrypts it in the
browser with the separately provided key. The demo pages are embedded in the
Rust binary and served from the API's origin to avoid local CORS configuration.
This is an integration prototype, not a production patient or doctor app.

## Persistence and lifecycle

Use SQLite in the current VPS prototype, with a persistent database file outside
source control. A future PostgreSQL adapter requires a separate implementation
and deployment review; it is not part of the current service. Its initial schema is in
[`services/transfer-api/migrations/0001_create_transfers.sql`](services/transfer-api/migrations/0001_create_transfers.sql).
The SQLite schema used for local development is in
`services/transfer-api/migrations-sqlite/`.

- Default transfer lifetime: 15 minutes; configurable within a bounded range.
- Redemption: one successful consume. A retry with the same client-generated
  idempotency key may receive the same ciphertext after a lost response, until
  the original expiry; a different key cannot redeem it again.
- Revocation: allowed until expiry or redemption.
- Cleanup: a scheduled task deletes expired and revoked rows. Retain redeemed
  ciphertext only until its original expiry to support the retry behavior above.
  Set a maximum lifetime and verify backup retention separately; deleting a
  live row does not immediately remove it from retained database backups.
- Keep the SQLite database and HMAC secret outside Git and container images.
  Rotate the secret deliberately; changing it affects outstanding retrieval codes.
  The current API uses the `pillgaze-transfer-data` volume and the protected
  `/home/rhodes/pillgaze-transfer/.secrets/transfer.env` file.

## VPS deployment

The live address is **https://rakathon.denishromada.com**. The existing Nginx
gateway terminates HTTPS and routes to a separate Compose frontend, which proxies
the private Rust API. Only gateway ports 80/443 are public; frontend 8080 and API
3000 are bound to IPv4 localhost. The independent CI runner is not modified by
application cleanup or deployment.

Operational configuration lives in `/home/rhodes/rakathon-site`,
`/home/rhodes/pillgaze-transfer`, and the shared `/home/rhodes/webserver` gateway.
The manual frontend refresh builds from an explicit `origin/main` revision and
retains a previous image for rollback. Repository pushes do not automatically
deploy the frontend or API. See [the VPS guide](infra/vps/README.md).

The separate static admin in `apps/storage-admin/` is intended for `/storage-admin`.
Its private container does not mount the database; admin list/delete requests
go through the transfer API, enabled only when `STORAGE_ADMIN_PASSWORD` is set.
See [admin configuration and limits](apps/storage-admin/README.md). These are
repository deployment inputs, not evidence that admin has been deployed.

No Kubernetes cluster was installed. AKS, k3s, Helm, Flux, Bicep, and their
unused deployment workflows were removed from this checkout. Do not reintroduce
them as a prerequisite for the existing Compose service.

SQLite uses a single API instance. Scaling, shared rate limits, consistent
backups, telemetry scrubbing, and production approval need separate work. Keep
real patient data out of this prototype.

## Initial non-goals

- Accounts, long-term patient profiles, or durable medication history.
- Server-side OCR, clinical recommendations, interaction checking, or treatment
  decisions.
- The server decrypting, indexing, searching, or modifying medication lists.
- Production deployment or public exposure before authentication boundaries,
  rate limits, cleanup, monitoring scrubbing, and recovery have been reviewed.
