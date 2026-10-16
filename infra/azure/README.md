# Azure deployment — PillGaze transfer API

Target stack: AKS + ACR + Key Vault with Flux GitOps implementation files
stored in this repository. Azure authentication is restricted; use the team
owner's Cloud Shell (interactive `az login` is blocked by tenant CA policy on
this VPS).

## Repo layout

- `main.bicep` and `modules/*.bicep` — Bicep infrastructure definitions.
  The Bicep command compiles successfully with version 0.48.1.
- `scripts/deploy.sh` — runs from Cloud Shell: creates the resource group
  contents, wires role assignments and loads the generated HMAC pepper and
  optional PostgreSQL password into Key Vault. No secrets go to stdout.
- `scripts/fill-values.sh` — updates the GitOps overlay inside this
  repository with the deployment outputs (values are not secret).
- `kubernetes/` (at `infra/kubernetes/`) — GitOps manifests and the Helm
  chart for the transfer API.

## Role assignments

Two managed identities are created by the Bicep modules:

- `id-github-acr-push` — federated identity for GitHub Actions using OIDC
  (only `main` of `olexamatej/rakathon`). Owns `Container Registry
  Contributor` and `Container Registry Data Contributor` scopes on the ACR.
- `id-workload-transferapi` — Workload Identity for the transfer API in
  namespace `pillgaze-dev`, service account `transfer-api`; linked to
  Kubernetes OIDC issuer and allowed `Key Vault Secrets User` RBAC.

Additionally the AKS system identity gets `AcrPull` on the registry
(assigned by `deploy.sh` after provisioning — the system identity's
principalId only exists after cluster creation).

## Deployment steps (Cloud Shell — operator, interactive)

1. Ensure Contributor on `rg-team78` (subscription
   `83ae1511-eee9-469a-8c48-b9a9069b92e4`).
2. Run the infrastructure:
   ```bash
   git clone https://github.com/olexamatej/rakathon && cd rakathon/infra/azure
   bash scripts/deploy.sh rg-team78
   ```
   Costs (as of writing; units approximate, review before executing):
   AKS Free tier + 1× `Standard_B2s` system node ≈ USD 0.10/hour, ACR
   Standard ≈ USD 0.17/day, Key Vault vault itself free (operations billed,
   ~$0.03/10k ops), Secrets Provider add-on instance is included in AKS Free.
   Match to your budget before running.
3. Take the deployment outputs and set repository variables:
   `AKS_DEPLOY_ENABLED=true`, `ACR_LOGIN_SERVER`, `ACR_FEDERATED_CLIENT`,
   `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Never use repository
   *secrets* here — those values are not secret material.
4. Fill the GitOps overlay and push:
   ```bash
   bash scripts/fill-values.sh <acr-login-server> <kv-name> <workload-client-id>
   git add infra/kubernetes && git commit -m "chore(aks): fill dev overlay values" && git push
   ```
   This replaces `SET_BY_PROVISIONING` placeholders in the HelmRelease and
   `values-dev.yaml`.
5. Bootstrap Flux: see the dedicated section below. It is a manual managed
   configuration step done with `az k8s-configuration flux create`.

## Flux bootstrap

```bash
az provider register -n Microsoft.KubernetesConfiguration --wait  # once per subscription
# Requires ~/.azure - created by the Cloud Shell; may validate SSH key:
az k8s-configuration flux create \
  --resource-group rg-team78 \
  --cluster-name pillgaze-dev-aks \
  --cluster-type managedClusters \
  --name rakathon \
  --namespace flux-system \
  --scope cluster \
  --url "ssh://git@github.com/olexamatej/rakathon" \
  --branch main \
  --sync-interval 5m \
  --ssh-key-algorithm rsa \
  --git-ssh-private-key \
  --path "clusters/pillgaze-dev"
```

Additional needed reconciliation steps recorded for operator follow-up:
  - Install the Secrets-Store CSI add-on:
    `az aks enable-addons --addon secrets-store-csi-driver --name pillgaze-dev-aks --resource-group $RG`
  - Deploy the Flux kustomization that watches `clusters/pillgaze-dev`.

## CI → CD flow (already implemented in this repo)

`.github/workflows/container-deploy.yml`:

1. **chart-lint** on the persistent self-hosted ARM sandbox runner:
   `helm lint`+`template` of `infra/kubernetes/charts/transfer-api` with
   pinned, checksum-verified helm binary, then assertions on the rendered
   YAML (non-root user, read-only root FS, dropped capabilities, no secret
   literals).
2. **build-and-push** on GitHub-hosted x64: OIDC login via the federated
   identity, `docker buildx build` of `services/transfer-api` with the
   commit-SHA tag, push, then a Trivy CRITICAL/HIGH gate before allowing
   the GitOps step. The scan is deliberately blocking: fix the
   `ignore-unfixed` finding before advancing; treat it as a quality gate
   rather than noise.
3. **deploy-gitops-tag** on GitHub-hosted: updates the inline tag inside
   `infra/kubernetes/clusters/pillgaze-dev/transfer-api-helmrelease.yaml`
   with a `chore(api): image update` commit. Both build and GitOps jobs
   skip when that prefix is detected, so the commit doesn't re-trigger
   the whole workflow.
4. **record-status**: summary of the pipeline stages.

Manual safety positions: unless `vars.AKS_DEPLOY_ENABLED == 'true'` and
the OIDC client id is set in the repository variables, the image jobs
never run. `deploy-gitops-tag` and the trivy scan edge cases are guarded
by explicit `if:` conditions.

## Current implementation status (this commit)

- Bicep compiles (bicep 0.48.1 — see `tools/bin/bicep` note below).
- Azure resources have NOT been provisioned yet: the deploy script needs
  a Cloud Shell session by the team owner.
- Helm chart is written but not yet rendered/validated end-to-end, and
  does not produce a running cluster on its own.
- CI/CD workflow validates chart, builds and scans image; image pushing
  is gated behind explicit repository variables that get set by deploy.sh,
  so nothing can deploy unintentionally before the cluster exists.
- Postgres is disabled by default; the Rust storage adapter is not
  implemented. Investigate before enabling, see architecture.md.

## NOT implemented here (known gaps)

- Application Gateway for Containers external deployment: Bicep creates
  the cluster only; the external controller (ALB infrastructure) must be
  deployed separately. Until that is present, keep `ingress.enabled=false`.
- The PostgreSQL adapter for the Rust API: SQLite is always active until
  the adapter is merged and `database.mode` (migrations) work well —
  the migrations in `services/transfer-api/migrations/` are a starting
  point authored for Azure Postgres (schema includes the format version).
- Monitoring dashboards/redaction and production-grade review of rate
  limits across replicas must be added before treating this as a
  production deployment (see architecture.md trust-bounds section).

## Local tooling note

Host-local `helm` and `bicep` binaries live in
`~/azure-team78/tools/bin/` on the deployment VPS — they are NOT part of
the repository and are documented for cross-session reproducibility; CI
downloads/caches tools independently (pinned versions above).
