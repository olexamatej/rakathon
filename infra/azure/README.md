# Azure Kubernetes Deployment

The selected target is documented in [`../../architecture.md`](../../architecture.md).
This directory will hold reviewed, versioned Bicep infrastructure, Helm charts,
and Flux configuration. No live Azure resources are created by this scaffold.

## Target components

- AKS for the Rust API and its same-origin patient and doctor web pages.
- Azure Application Gateway for Containers for HTTPS ingress configured with
  Gateway API resources.
- Azure Container Registry for immutable container image tags. The AKS kubelet
  identity can pull images; GitHub Actions receives push-only registry access.
- Azure Database for PostgreSQL Flexible Server on private VNet networking.
- Azure Key Vault for the digest pepper, database credentials, and Flux's
  read-only GitHub credential. AKS Workload ID and the Key Vault CSI provider
  expose only the secrets required by each workload.
- Azure Monitor / Application Insights with request-body and secret scrubbing.
- Azure GitOps Flux v2 extension for pull-based reconciliation of Kubernetes
  manifests from this repository.

## CI/CD flow

1. Pull requests run the existing application, API, and repository checks. Add
   container-build and deployment-manifest validation before enabling deploys.
2. After a successful merge to `main`, GitHub Actions builds the API image on a
   GitHub-hosted runner and pushes it to ACR with the commit SHA and immutable
   digest. Azure authentication uses GitHub OIDC and a federated credential;
   do not add a service-principal password or kubeconfig to GitHub secrets.
3. The workflow updates the dev image reference in Git. Flux reads that change
   from inside AKS and reconciles the release. A private AKS API endpoint does
   not need to be reachable from the GitHub-hosted runner.
4. Promote the same image digest to staging or production through a separate
   GitHub Environment and approval when those environments are added.

The Flux Git source is private, so bootstrap its read-only GitHub credential
once and keep it in Key Vault. GitHub Actions gets no Kubernetes deployment
credential. Use a separate least-privilege federated identity for image pushes.

## Implementation order

1. Replace the SQLite-only store with a PostgreSQL adapter and verify atomic
   redemption, idempotent retries, rate limiting, and migrations.
2. Add a non-root API image, health probes, and a Helm chart with read-only root
   filesystem, dropped capabilities, resource requests/limits, and no secret
   literals.
3. Add Bicep for the AKS/VNet, ACR, private PostgreSQL, Key Vault, and HTTPS
   ingress, plus Workload ID and the AKS registry-pull identity.
4. Enable Flux and configure a dev namespace. Add GitHub OIDC and image
   publishing only after Azure resource names, region, and subscription are
   selected.

Do not publish the database or development ports. Before production ingress,
verify rate limiting across replicas, expiry cleanup, monitoring redaction,
database backups, restore, and rollback. AKS and its managed database and
ingress carry ongoing costs; confirm region and sizes before provisioning.

## Official references

- [AKS GitOps with Flux v2](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-gitops-flux2)
- [GitHub Actions OIDC for Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)
- [AKS Microsoft Entra Workload ID](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
- [Key Vault CSI provider on AKS](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)
- [Application Gateway for Containers](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Private networking for PostgreSQL Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking)
