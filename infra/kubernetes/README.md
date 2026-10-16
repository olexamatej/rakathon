# Kubernetes — PillGaze GitOps

The GitOps layout for changes that Flux reconciles from this repository:

```
infra/kubernetes/
├── README.md                    (this file; architecture notes)
├── charts/transfer-api/         (Helm chart for the transfer API)
└── clusters/pillgaze-dev/       (overlay + Flux Kustomization for dev)
    ├── namespace.yaml           (namespace with Pod Security 'restricted')
    └── transfer-api-helmrelease.yaml  (HelmRelease + dev values overlay)
```

## Chart highlights (`charts/transfer-api/`)

- Defaults are security-forward: non-root user (`runAsUser: 1000`), read-only
  root filesystem, dropped capabilities, `seccompProfile: RuntimeDefault`,
  Pod Security `restricted` namespace.
- No secret literals — the chart never renders the HMAC pepper into YAML;
  the Deployment resolves `TRANSFER_HMAC_SECRET` from a `secretKeyRef`, whose
  content is materialized either manually (existing secret) or via the
  Secrets Store CSI provider when `secretProvider.enabled=true`.
- Probes hit `/health/live` and `/health/ready` (documented in
  `packages/api-contract/openapi.yaml`).
- NetworkPolicy allows only kube-DNS egress and (optional) DB egress; the
  ingress policy narrows to Application Gateway for Containers.
- The PostgreSQL migration work remains pending; the chart only supports
  `database.mode: sqlite` today, with `persistentVolume` storage
  configurations for the Managed Disk PV.

## Environment overlays

`clusters/pillgaze-dev/` is the Flux root (via `flux bootstrap --path
clusters/pillgaze-dev`); the HelmRelease references
`infra/kubernetes/charts/transfer-api` inside this same repository and
overrides the values with an inline `SET_BY_PROVISIONING` block that
`infra/azure/scripts/fill-values.sh` fills with concrete cluster outputs.

Secret handling: The chart reads TRANSFER_HMAC_SECRET from
`secretKeyRef: transfer-api-hmac`; that secret is produced by the CSI
SecretProviderClass (Azure Key Vault) — see `values-dev.yaml`. The
Kubernetes secret itself is materialized by the Secrets Store CSI driver
(`az aks enable-addons -a secrets-store-csi-driver`), never committed here.

## Validation

```sh
# With helm on PATH (see infra/azure/README.md tooling note):
helm lint infra/kubernetes/charts/transfer-api
helm template --set secretProvider.enabled=false \
  --set secretRef.name=transfer-api-ci-hmac \
  --set image.repository=ci-test/transfer-api \
  infra/kubernetes/charts/transfer-api >/tmp/rendered.yaml
```

CI enforces the same checks in `chart-lint` (see
`.github/workflows/container-deploy.yml`).
# Active deployment

The active single-node VPS Helm chart is [`../vps/chart`](../vps/README.md).
The Azure/Flux manifests below are retained historical scaffolding, not the
current release configuration. Master releases use `.github/workflows/vps-deploy.yml`.
