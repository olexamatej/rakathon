#!/usr/bin/env bash
# GitHub-hosted build runner only. No workload is started on the production VPS.
set -euo pipefail
: "${RELEASE:?}"
docker load -i bundle/api.tar
docker load -i bundle/web.tar
cleanup() {
    docker rm -f rakathon-test-web rakathon-test-api >/dev/null 2>&1 || true
    docker network rm rakathon-container-test >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create rakathon-container-test >/dev/null
# Supply a throwaway secret; not the production HMAC and not logged.
secret=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
export TRANSFER_HMAC_SECRET=$secret
unset secret
docker run -d --name rakathon-test-api --network rakathon-container-test \
    --network-alias rakathon-api.rakathon.svc.cluster.local --user 1000:1000 \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /data:uid=1000,gid=1000,mode=0700 --tmpfs /tmp:uid=1000,gid=1000 \
    --memory 256m --cpus 0.5 --pids-limit 64 -e TRANSFER_HMAC_SECRET \
    -e PILLGAZE_DB_PATH=/data/transfers.sqlite3 "rakathon-api:$RELEASE" >/dev/null
unset TRANSFER_HMAC_SECRET
# Docker DNS in tests; Kubernetes DNS in the installed image.
sed 's/resolver 10.43.0.10/resolver 127.0.0.11/' infra/vps/web-nginx.conf > "$RUNNER_TEMP/test-nginx.conf"
docker run -d --name rakathon-test-web --network rakathon-container-test \
    --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp:uid=1000,gid=1000 --memory 96m --cpus 0.25 --pids-limit 64 \
    -v "$RUNNER_TEMP/test-nginx.conf:/etc/nginx/nginx.conf:ro" \
    -p 127.0.0.1:18080:8080 "rakathon-web:$RELEASE" >/dev/null
sleep 5
python3 infra/vps/scripts/smoke.py http://127.0.0.1:18080 "$RELEASE"
