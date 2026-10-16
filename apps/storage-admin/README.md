# Storage admin

Small Czech HTML/CSS/JavaScript admin, matching the patient PWA technology. Lists JSON blobs from `blob_transfers`: exact payload byte count, HMAC digest, and (when explicitly enabled) original PIN and stored JSON. Sensitive display is controlled by the UI checkbox and the API environment flag `STORAGE_ADMIN_DEBUG_VISIBILITY=true`. The flag also stores PINs for new uploads in the database; existing PINs cannot be recovered from their HMAC digests. Keep this mode limited to synthetic debugging data.
The optional PIN column is added by migration 0004; existing rows remain NULL. The current main's
existing 1 MiB widening migration still applies when updating an older API.

## Authentication

Set `STORAGE_ADMIN_PASSWORD` on the **transfer API**, using its protected external
environment file, not Git or the admin image. No default password is built in;
when unset, both admin endpoints return 404. Use the agreed hackathon password
only with synthetic data; use a strong random password for anything else.

The form sends the password as a Bearer header on each API request over HTTPS.
The API checks a keyed password digest in constant time. The browser keeps the
password in tab-scoped `sessionStorage`, clears the field on submit, and restores
access after refresh in the same tab. Logout, a rejected password or expiry clears
it; the original 15-minute deadline is not extended by refresh. Closing the tab
normally clears storage (browser session restoration may restore it until expiry).
If storage is blocked, login works in memory only. Same-origin JavaScript can
read this storage, so use a trusted browser and synthetic data. This is not a server-side session: anyone
knowing the password can call the API directly until it is changed and the API
restarted. No cookies means cross-site forms cannot authenticate deletions.
API responses and static admin assets use `Cache-Control: no-store`; there is no
admin service worker. Never log Authorization headers or metadata response bodies.

Admin requests are limited to 60/minute per socket IP, including failed login
attempts. Behind the existing VPS proxy this is a shared bucket. On HTTP 429,
respect `Retry-After: 60`; the UI does not automatically retry or poll.

## API

- `GET /api/v1/admin/blobs?offset=0`: at most 100 items, each with `pinDigest` and
  `sizeBytes`, and a `hasMore` flag. Previous/next pages allow visiting all rows.
  Concurrent inserts/deletes can shift offset-based pages; refresh to recheck.
- `DELETE /api/v1/admin/blobs/{pinDigest}`: hard delete one blob, returning 204;
  unknown digest returns 404, malformed digest 400. Requires the admin password;
  the digest is not an authorization credential. Legacy rows are untouched.
- `DELETE /api/v1/admin/blobs`: hard delete all blobs across all pages with one
  database statement; returns 204 even when empty. The **Smazat vše** button next
  to **Obnovit** requires confirmation, then reloads the first page. This invalidates
  all current storage PINs. Authentication, rate limits and no-store apply as above.

The public `/api` prefix is removed by the existing frontend proxy.
Delete removes the live row, not necessarily old SQLite pages/WAL or backups;
it is not secure erasure. Existing SQLite data volume and HMAC secret must remain.

## Separate container / deployment preparation

Build from repository root:

```sh
docker build -f infra/vps/storage-admin.Dockerfile -t pillgaze-storage-admin:YOUR_TAG .
STORAGE_ADMIN_IMAGE=pillgaze-storage-admin:YOUR_TAG \
  docker compose -p pillgaze-storage-admin -f infra/vps/storage-admin.compose.yml up -d
```

The example uses the existing private `pillgaze-transfer-local` Docker network;
it publishes **no host ports**, mounts no database, secrets or Docker socket,
and runs non-root with a read-only filesystem and resource limits.

In the **live rakathon-web Nginx server**, add this block (before its catch-all):

```nginx
location ~ ^/storage-admin(?:/|$) {
    set $admin pillgaze-storage-admin:8080;
    proxy_pass http://$admin;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "no-store" always;
}
```

Keep its Docker resolver and `absolute_redirect off`. The existing `/api/` proxy
already routes the admin API endpoints. No gateway, DNS, certificate or firewall
change is required. Review any inherited security headers when integrating; the
admin supplies its own CSP. The generic repo Nginx template has this routing too,
but is not the live configuration and the manual UI refresh does not deploy admin.

Deploying this needs a separately tested API image from this branch, the protected
password configuration and the targeted live proxy change. Back up SQLite using
its backup API before updating; do not copy an active WAL database file alone.
When updating from the old encrypted API, also update external smoke checks and
raise the live frontend body limit to `1m`, as required by the current main.
Retain the previous API/admin images. Expect a short API restart/proxy reload;
other websites should not be touched. Roll back proxy block and API/admin images
without deleting the persistent volume (`down -v` is forbidden). Rolling back
cannot restore manually deleted records without a backup.

## Tests

In an isolated non-root sandbox, without host credentials or Docker socket:

```sh
node --test apps/storage-admin/tests/*.test.mjs
cargo test --locked --manifest-path services/transfer-api/Cargo.toml
```

Use synthetic uploads only. Check wrong/missing password, list pagination,
confirmed deletion, logout, no-store headers and the public HTTPS route before
any actual deployment. This change adds repository sources, not live deployment.
