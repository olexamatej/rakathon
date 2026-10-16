#!/usr/bin/env bash
# After the Bicep deployment (deploy.sh prints the values), run this from
# the repository worktree to replace the SET_BY_PROVISIONING placeholders
# in the Flux GitOps overlay:
#   bash infra/azure/scripts/fill-values.sh <acr-login-server> <key-vault-name> <workload-client-id>
# The values are NOT secret: vault name and identity client id are fine in
# repository source; the HMAC pepper never leaves Azure Key Vault.
set -euo pipefail

ACR="${1:?usage: fill-values.sh <acr-login-server> <key-vault-name> <workload-client-id>}"
KEYVAULT="${2:?missing key vault name}"
CLIENTID="${3:?missing workload identity client id}"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OVERLAY="${REPO_ROOT}/infra/kubernetes/clusters/pillgaze-dev/transfer-api-helmrelease.yaml"
DEV_VALUES="${REPO_ROOT}/infra/kubernetes/charts/transfer-api/values-dev.yaml"

replace() {
  # $1 file, $2 needle, $3 replacement; asserts the needle is present.
  python3 - "$1" "$2" "$3" <<'PY'
import pathlib, sys
path, needle, repl = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
if needle not in text:
    raise SystemExit(f"{path}: marker '{needle}' not found; check the file layout.")
path.write_text(text.replace(needle, repl, 1))
PY
}

replace "$OVERLAY" "repository: SET_BY_PROVISIONING" "repository: ${ACR}/transfer-api"
replace "$OVERLAY" "vaultName: SET_BY_PROVISIONING" "vaultName: ${KEYVAULT}"
replace "$OVERLAY" "clientId: SET_BY_PROVISIONING" "clientId: ${CLIENTID}"

replace "$DEV_VALUES" "repository: SET_BY_PROVISIONING.azurecr.io/transfer-api" "repository: ${ACR}/transfer-api"
replace "$DEV_VALUES" "vaultName: SET_BY_PROVISIONING-kv" "vaultName: ${KEYVAULT}"
replace "$DEV_VALUES" "clientId: SET_BY_PROVISIONING" "clientId: ${CLIENTID}"

echo "Placeholders replaced in:"
echo "  ${OVERLAY}"
echo "  ${DEV_VALUES}"
echo "Commit and push these two files as the next GitOps change."
