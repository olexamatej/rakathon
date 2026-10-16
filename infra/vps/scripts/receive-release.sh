#!/usr/bin/env bash
# Root-owned, forced SSH command. No caller-provided shell, path, chart or kubeconfig.
set -euo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
ROOT=/var/lib/rakathon
exec 9>"$ROOT/deploy.lock"
flock -w 600 9
request=${1:-}
if [[ $request =~ ^rollback\ ([a-f0-9]{40}-[0-9]+-[0-9]+)$ ]]; then
    version=${BASH_REMATCH[1]}
    test -f "$ROOT/releases/$version/release.json"
    k3s ctr images import "$ROOT/releases/$version/api.tar"
    k3s ctr images import "$ROOT/releases/$version/web.tar"
    revision=${version%%-*}
elif [[ $request == deploy ]]; then
    incoming=$(mktemp -d "$ROOT/incoming.XXXXXX")
    trap 'rm -f "$incoming/bundle.tgz" "$incoming/api.tar" "$incoming/web.tar" "$incoming/release.json"; rmdir "$incoming"' EXIT
    # Bound input size/time, and extract ONLY regular files with fixed names.
    python3 - "$incoming" 3<&0 <<'PY'
import pathlib, signal, sys
signal.alarm(600)
root = pathlib.Path(sys.argv[1])
limit = 750 * 1024 * 1024
total = 0
with (root / 'bundle.tgz').open('wb') as output, open(3, 'rb') as source:
    while chunk := source.read(1024 * 1024):
        total += len(chunk)
        if total > limit:
            raise SystemExit('Release bundle exceeds 750 MiB')
        output.write(chunk)
PY
    python3 /opt/rakathon/scripts/unpack-release.py "$incoming"
    version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release"])' "$incoming/release.json")
    revision=${version%%-*}
    if test -e "$ROOT/releases/$version"; then
        echo 'Release already exists; use rollback to redeploy it.' >&2
        exit 1
    fi
    k3s ctr images import "$incoming/api.tar"
    k3s ctr images import "$incoming/web.tar"
    mkdir "$ROOT/releases/$version"
    cp "$incoming/release.json" "$ROOT/releases/$version/release.json"
    mv "$incoming/api.tar" "$incoming/web.tar" "$ROOT/releases/$version/"
else
    echo 'Allowed commands: deploy; rollback <release-id>' >&2
    exit 2
fi

previous=$(cat "$ROOT/current-release" 2>/dev/null || true)
if [[ $previous =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]; then
    # Kubelet may garbage-collect unused images; restore the known-good pair
    # BEFORE attempting an upgrade so Helm's automatic rollback can start it.
    k3s ctr images import "$ROOT/releases/$previous/api.tar"
    k3s ctr images import "$ROOT/releases/$previous/web.tar"
fi
helm upgrade --install rakathon /opt/rakathon/chart --namespace rakathon \
    --set-string "release=$version" --set-string "revision=$revision" \
    --atomic --wait --timeout 5m --history-max 10
if ! python3 /opt/rakathon/scripts/smoke.py http://172.20.0.1:30080 "$version"; then
    if [[ $previous =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]; then
        helm upgrade rakathon /opt/rakathon/chart --namespace rakathon \
            --set-string "release=$previous" --set-string "revision=${previous%%-*}" \
            --atomic --wait --timeout 5m --history-max 10
    fi
    echo 'Release smoke check failed; previous release restored when available.' >&2
    exit 1
fi
printf '%s\n' "$version" > "$ROOT/current-release.tmp"
mv "$ROOT/current-release.tmp" "$ROOT/current-release"
echo "Deployed $version (frontend and API verified)."
