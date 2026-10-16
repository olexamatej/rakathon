# VPS deployment — Docker Compose

Live demo: **https://rakathon.denishromada.com**. This is a synthetic-data
prototype, not an approved clinical service. The abandoned AKS/k3s/Helm/Flux
deployment proposals and their workflow have been removed. No Kubernetes cluster
was installed on this VPS; do not bootstrap one for the existing service.

## Existing operational directories

| Directory | Responsibility |
| --- | --- |
| `/home/rhodes/rakathon-site` | Compose frontend, Nginx, manual UI refresh, logs and rollback state. |
| `/home/rhodes/pillgaze-transfer` | Independent Rust API Compose project and pinned source snapshot. |
| `/home/rhodes/webserver` | Shared HTTPS gateway, personal homepage and Obed deployment. |
| `/home/rhodes/github-runner` | Independent CI runner; leave its services, workspace, credentials and proxy configuration unchanged. |

Runtime containers do not read application worktrees. The API persists SQLite in
`pillgaze-transfer-data`; its existing HMAC secret remains outside the repository
in `/home/rhodes/pillgaze-transfer/.secrets/transfer.env`. Preserve both. Never
use `down -v` or broad Docker pruning for routine deployment or cleanup.

Only the gateway publishes public HTTP/HTTPS ports 80/443. Frontend 8080 and API
3000 bind to IPv4 localhost. The frontend connects to the API on a private Docker
network. The existing Certbot renewal timer and gateway reload hook own TLS.

## Status and checks

```sh
/home/rhodes/rakathon-site/bin/status.sh
/home/rhodes/rakathon-site/bin/check.sh
/home/rhodes/webserver/bin/check.sh
/home/rhodes/rakathon-site/bin/compose.sh logs --tail=50
/home/rhodes/pillgaze-transfer/bin/compose.sh logs --tail=50 api
```

Use the operational READMEs in those directories for current image revisions,
API checks, build procedures and recovery details. They are separate from this
application checkout.

## Manual frontend update and rollback

```sh
/home/rhodes/refresh-rakathon-ui.sh --status
/home/rhodes/refresh-rakathon-ui.sh
/home/rhodes/refresh-rakathon-ui.sh --rollback
```

The refresh script fetches an explicit `origin/main` revision without switching
or resetting any worktree. It tests and builds the frontend in bounded non-root
containers, then recreates only the frontend and retains its previous image.
Dependency downloads use the existing restricted egress proxy without accessing
runner credentials or workspace. Rollback uses the recorded local image.

Frontend recreation may briefly interrupt Rakathon requests; the API, database,
other websites, DNS, firewall and certificates are not changed. API updates are
a separate deliberate operation managed under `/home/rhodes/pillgaze-transfer`.
Repository pushes do not automatically deploy either service.

## Retained image inputs

`web.Dockerfile` and `web-nginx.conf` remain as generic Docker/Compose inputs for
a tested web export in `dist/`. They use Docker DNS and the existing API service
name, not Kubernetes DNS. The active frontend refresh uses its own operational
Dockerfile and Nginx configuration in `/home/rhodes/rakathon-site`.

Keep synthetic data only. Per-client rate limits behind the shared proxy,
consistent backups, monitoring, scaling and production approval remain separate
work; this cleanup does not claim to implement them.
