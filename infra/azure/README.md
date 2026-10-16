# Azure Deployment

The target shape is documented in [`../../architecture.md`](../../architecture.md).
This directory is the home for reviewed, versioned Azure infrastructure as the
deployment is implemented.

Initial target:

- Azure Container Apps for the stateless Rust transfer API.
- Azure Database for PostgreSQL Flexible Server on private networking.
- Azure Key Vault for the keyed-digest pepper, accessed through managed
  identity.
- Azure Monitor / Application Insights with request and secret scrubbing.
- A scheduled Container Apps Job for transfer cleanup.

Do not publish the database or development ports. Keep credentials out of Git
and container images. Before public ingress, verify rate limiting across
replicas, expiry cleanup, monitoring redaction, database backups, and rollback.
No live Azure resources are created by this scaffold.
