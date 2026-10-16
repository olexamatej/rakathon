# PillGaze architecture

**Status:** synthetic-data prototype; deployment uses Docker Compose on Hetzner.

## Components

| Area | Responsibility |
| --- | --- |
| `apps/patient-web/` | Patient PWA with storage upload, plus the `/lekar` doctor UI served by the same local static server. Patient uploads and doctor retrieval use storage; recognition and doctor interactions remain simulated. |
| Root `App.tsx`, `src/` | Separate older Expo prototype; preserve its entry points. |
| `apps/doctor-web/` | Doctor-facing browser UI area. |
| `services/transfer-api/` | Rust/Axum opaque JSON storage backed by SQLite. |
| `packages/api-contract/` | Shared OpenAPI storage contract. |
| `interaction-engine/` | Separate Rust interaction service; not part of storage. |
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

The patient PWA sends `{ "text": "…" }`, where text is the current tab-separated
list including optional regimen and schedules, without photographs or local IDs.
It records a local snapshot and displays the returned PIN only after a valid 201
response. The receipt timestamp is client-side; storage returns only the PIN.
No automatic retry or offline upload queue is used. The local Node static server
does not proxy `/api`; integrated uploads require the same-origin VPS proxy.

Admin-only endpoints, enabled with `STORAGE_ADMIN_PASSWORD`:
`GET /v1/admin/blobs` lists paginated size/HMAC metadata;
`DELETE /v1/admin/blobs/{pinDigest}` hard deletes a selected blob.

There is no expiry, public DELETE, revocation, idempotency key, or single-use retrieval.
Each POST creates a new blob. The old encrypted endpoints and embedded browser
demo are removed. Historical SQLite migrations and existing legacy rows are
retained for database compatibility; those rows are not served or deleted.
The migration widening the blob limit copies existing blobs transactionally.
PostgreSQL is not implemented; its old schema is historical only.

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
