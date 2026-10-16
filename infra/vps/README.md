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

## Unified update and rollback

```sh
/home/rhodes/refresh-rakathon.sh --status
/home/rhodes/refresh-rakathon.sh
/home/rhodes/refresh-rakathon.sh --rollback
```

The refresh script fetches `origin/main` once without switching or resetting any
worktree. It deploys API, storage admin and frontend from the same commit using
bounded non-root builds. If a component fails, already updated components are
rolled back in reverse order. Rollback uses the recorded local images.
Dependency downloads use the existing restricted egress proxy without accessing
runner credentials or workspace. The frontend component is an internal script
at `/home/rhodes/rakathon-site/bin/deploy-ui.sh`; the separate top-level
UI wrapper has been removed.

Recreating components may briefly interrupt their Rakathon endpoints. Database
storage and secrets are preserved. Other websites, DNS, firewall and certificates
are unchanged. Repository pushes do not automatically deploy the service.

## Retained image inputs

`web.Dockerfile` and `web-nginx.conf` remain as generic Docker/Compose inputs for
a tested web export in `dist/`. They use Docker DNS and the existing API service
name, not Kubernetes DNS. The active frontend refresh uses its own operational
Dockerfile and Nginx configuration in `/home/rhodes/rakathon-site`.

Keep synthetic data only. Per-client rate limits behind the shared proxy,
consistent backups, monitoring, scaling and production approval remain separate
work; this cleanup does not claim to implement them.
