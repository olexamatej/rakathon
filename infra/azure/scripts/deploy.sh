#!/usr/bin/env bash
# Deploy the AMD infra stack from an authenticated Azure CLI session.
# The team owner's Cloud Shell is the established way to authenticate;
# run: bash scripts/deploy.sh [resource-group] [--no-postgres]
# Outputs land in ../../logs? No — write machine-outputs to stdout only.
set -euo pipefail

RG="${1:?usage: deploy.sh <resource-group> [--no-postgres]}"
shift || true
DEPLOY_POSTGRES="${1:-}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TEMPLATE_DIR"

if ! az account show >/dev/null 2>&1; then
  echo "Not authenticated. Use Cloud Shell (az login is blocked on the VPS tenant CA)." >&2
  exit 2
fi

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Deploying into subscription ${SUBSCRIPTION_ID}, resource group ${RG}."

GENERATED_PG_PASSWORD=""
PARAMS=()
if [ "${DEPLOY_POSTGRES:-}" = "--postgres" ]; then
  GENERATED_PG_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
  PARAMS+=(--parameters "prefix=pillgaze" "deployPostgres=true" "postgresAdminPassword=${GENERATED_PG_PASSWORD}")
else
  PARAMS+=(--parameters "prefix=pillgaze" "deployPostgres=false")
fi

OUTPUT_JSON="$(az deployment group create \
  --resource-group "$RG" \
  --template-file main.bicep \
  "${PARAMS[@]}" \
  --query properties.outputs -o json)"

ACR_NAME="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["acrName"]["value"])')"
ACR_SERVER="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["acrLoginServer"]["value"])')"
CLUSTER_NAME="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clusterName"]["value"])')"
KV_NAME="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["keyVaultName"]["value"])')"
CLUSTER_IDENTITY="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clusterSystemIdentityPrincipalId"]["value"])')"
GITHUB_CLIENT_ID="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["githubPushClientId"]["value"])')"
WORKLOAD_CLIENT_ID="$(echo "$OUTPUT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["workloadIdentityClientId"]["value"])')"

# 1. Node image pulls from ACR with the cluster identity.
az role assignment create \
  --assignee "$CLUSTER_IDENTITY" \
  --role AcrPull \
  --subscription "$SUBSCRIPTION_ID" \
  --scope "$(az acr show --name "$ACR_NAME" --resource-group "$RG" --query id -o tsv)" > /dev/null

# 2. Seed the HMAC pepper directly into Key Vault. The generated value is
# never printed and never stored anywhere except the vault.
KV_ID="$(az keyvault show --name "$KV_NAME" --resource-group "$RG" --query id -o tsv)"
if ! az keyvault secret show --vault-name "$KV_NAME" --name transfer-hmac-secret >/dev/null 2>&1; then
  # Data-plane writes need a specific data role; Contributor is not enough.
  az role assignment create \
    --role "Key Vault Secrets Officer" \
    --assignee "$(az account show --query user.name -o tsv)" \
    --scope "$KV_ID" >/dev/null 2>&1 || true
  HMAC_MESSAGE_PEPPER="$(head -c 32 /dev/urandom | base64)"
  az keyvault secret set --vault-name "$KV_NAME" \
    --name transfer-hmac-secret \
    --value "$HMAC_MESSAGE_PEPPER" > /dev/null
  unset HMAC_MESSAGE_PEPPER
  echo "Created Key Vault secret transfer-hmac-secret in ${KV_NAME}."
fi

# 3. Register PostgreSQL admin password. Same handling: only in the vault.
if [ -n "$GENERATED_PG_PASSWORD" ]; then
  az role assignment create \
    --role "Key Vault Secrets Officer" \
    --assignee "$(az account show --query user.name -o tsv)" \
    --scope "$KV_ID" >/dev/null 2>&1 || true
  az keyvault secret set --vault-name "$KV_NAME" \
    --name postgres-admin-password \
    --value "$GENERATED_PG_PASSWORD" > /dev/null
  unset GENERATED_PG_PASSWORD
  echo "Created Key Vault secret postgres-admin-password in ${KV_NAME}."
fi

echo
echo "Deployment complete. Fill the GitHub repository variables:"
echo "  AKS_DEPLOY_ENABLED = true"
echo "  ACR_LOGIN_SERVER   = ${ACR_SERVER}"
echo "  ACR_FEDERATED_CLIENT = ${GITHUB_CLIENT_ID}"
echo "  AZURE_TENANT_ID    = ${TENANT_ID}"
echo "  AZURE_SUBSCRIPTION_ID = ${SUBSCRIPTION_ID}"
echo "  (workload identity client id for the chart: ${WORKLOAD_CLIENT_ID})"
echo "Cluster: ${CLUSTER_NAME}; ACR: ${ACR_NAME}; Key Vault: ${KV_NAME}."
