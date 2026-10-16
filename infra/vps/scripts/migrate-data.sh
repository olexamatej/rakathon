#!/usr/bin/env bash
# One-time, explicit migration. Preserve source volume and secret for rollback.
set -euo pipefail
umask 077
test "$(id -u)" = 0
test "${1:-}" = --confirm || { echo 'Usage: sudo bash infra/vps/scripts/migrate-data.sh --confirm'; exit 2; }
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
ROOT=/var/lib/rakathon
test -d "$ROOT/data"
if k3s kubectl -n rakathon get secret rakathon-hmac >/dev/null 2>&1; then
    echo 'Secret already exists; refusing to migrate/rotate it again.' >&2
    exit 1
fi
test -z "$(find "$ROOT/data" -mindepth 1 -print -quit)" || { echo 'Destination data is not empty.' >&2; exit 1; }
source=$(docker volume inspect pillgaze-transfer-data --format '{{.Mountpoint}}')
test -f /home/rhodes/pillgaze-transfer/.secrets/transfer.env
test "$(docker inspect pillgaze-transfer-api --format '{{.State.Running}}')" = true
# Brief downtime for the old private API; no public websites are stopped.
docker stop --time 30 pillgaze-transfer-api >/dev/null
trap 'docker start pillgaze-transfer-api >/dev/null' ERR
backup="$ROOT/backups/pre-kubernetes-$(date -u +%Y%m%dT%H%M%SZ).tar"
tar -C "$source" -cf "$backup" .
cp -a "$source/." "$ROOT/data/"
chown -R 1000:1000 "$ROOT/data"
chmod 0700 "$ROOT/data"
# The exact original HMAC pepper is required for issued retrieval codes.
# Do not print it or rotate on permission errors.
python3 - <<'PY' | k3s kubectl apply -f - >/dev/null
import base64, json, pathlib
entries = {}
for line in pathlib.Path('/home/rhodes/pillgaze-transfer/.secrets/transfer.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        entries[key] = value
secret = entries['TRANSFER_HMAC_SECRET']
assert len(secret) >= 32
print(json.dumps({'apiVersion': 'v1', 'kind': 'Secret',
                  'metadata': {'name': 'rakathon-hmac', 'namespace': 'rakathon'},
                  'type': 'Opaque', 'data': {'TRANSFER_HMAC_SECRET': base64.b64encode(secret.encode()).decode()}}))
PY
trap - ERR
echo 'Consistent database copied and original HMAC preserved. Old container is stopped; original volume remains untouched.'
echo "Protected backup: $backup"
