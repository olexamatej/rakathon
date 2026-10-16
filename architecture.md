# PillGaze Architecture

**Status:** initial local backend implementation; Azure deployment remains future work
**Backend language:** Rust
**Deployment target:** Azure

This document defines the first shared system boundary for parallel work. The
current Expo application remains at the repository root while it is actively
being developed. New backend, doctor web, API contract, and Azure work belongs
in the directories listed below. Moving the existing application is a separate
coordinated change because the current scripts and CI expect its root entry
points.

The transfer API now has a local Rust/Axum implementation backed by SQLite.
Azure PostgreSQL remains the deployment target and has a matching initial
schema, but its storage adapter and Azure resources are not implemented yet.

## Product flow

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
| `infra/azure/` | Azure deployment notes and, as deployment work begins, versioned infrastructure definitions. |

Agree on folder ownership in the related PR before touching another team's
active files. API changes should update the OpenAPI document first and keep all
three consumers aligned.

## Backend API

The initial contract is [`packages/api-contract/openapi.yaml`](packages/api-contract/openapi.yaml).

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/transfers` | Store an encrypted envelope and return a retrieval code, expiry, and revocation token once. |
| `POST /v1/transfers/redeem` | Atomically redeem a code and return the encrypted envelope. Supports a same-client idempotent retry. |
| `DELETE /v1/transfers/{transferId}` | Revoke a transfer using its separate revocation token. |
| `GET /health/live` | Process liveness; does not depend on PostgreSQL. |
| `GET /health/ready` | Readiness check; succeeds only when required dependencies are available. |

The initial payload is a compact JSON medication-list document encrypted by the
client. The API stores the ciphertext, nonce, and format version. Do not put
images, OCR intermediates, patient identifiers, or unencrypted medication names
in the transfer record.

## Persistence and lifecycle

Use SQLite in local development, with a persistent database file outside
source control. Use Azure Database for PostgreSQL Flexible Server for the Azure
deployment; the service keeps persistence behind a storage module so this
backend change does not alter the API contract. The Azure schema is in
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
- Keep the Azure database private to the Container Apps environment. Store the
  retrieval-code digest pepper in Azure Key Vault and grant access through a
  managed identity. Rotate it deliberately; document how active transfers are
  handled during rotation.

## Azure deployment shape

Start with a small number of managed services:

- **Azure Container Apps:** run the Rust API with HTTPS ingress and a managed
  identity. Keep the container stateless and use multiple replicas only after
  redemption and rate limiting are safe across instances.
- **Azure Database for PostgreSQL Flexible Server:** private network access,
  encrypted storage, and the transfer table above.
- **Azure Key Vault:** retrieval-code digest pepper and any required connection
  material; no secrets in the image or repository.
- **Azure Monitor / Application Insights:** health, latency, failures, and
  dependency metrics with request-body and secret scrubbing enabled.
- **Scheduled cleanup:** an Azure Container Apps Job or equivalent bounded
  scheduled task to purge expired records.

Do not add a public database endpoint, public development ports, a blob store,
or a separately managed cache in the first implementation without a measured
need. The local SQLite database is for development only; do not mount a shared
SQLite file into scaled Container Apps replicas. The local implementation
persists rate-limit buckets in SQLite; Azure must keep those counters in shared
PostgreSQL or another distributed mechanism. Keep backups and telemetry inside
the same data-handling review as the primary database.

## Initial non-goals

- Accounts, long-term patient profiles, or durable medication history.
- Server-side OCR, clinical recommendations, interaction checking, or treatment
  decisions.
- The server decrypting, indexing, searching, or modifying medication lists.
- Production deployment or public exposure before authentication boundaries,
  rate limits, cleanup, monitoring scrubbing, and recovery have been reviewed.
