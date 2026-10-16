#!/usr/bin/env bash
set -euo pipefail
umask 077
test -n "${VPS_DEPLOY_KEY:-}" && test -n "${VPS_SSH_KNOWN_HOSTS:-}"
[[ ${VPS_SSH_HOST:-} =~ ^[a-zA-Z0-9.-]+$ ]]
temporary=$(mktemp -d "${RUNNER_TEMP:-/tmp}/rakathon-ssh.XXXXXX")
trap 'rm -f "$temporary/key" "$temporary/known_hosts"; rmdir "$temporary"' EXIT
printf '%s\n' "$VPS_DEPLOY_KEY" > "$temporary/key"
printf '%s\n' "$VPS_SSH_KNOWN_HOSTS" > "$temporary/known_hosts"
unset VPS_DEPLOY_KEY VPS_SSH_KNOWN_HOSTS
options=(-i "$temporary/key" -o IdentitiesOnly=yes -o BatchMode=yes
         -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary/known_hosts"
         -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=3)
case ${1:-} in
    deploy)
        ssh "${options[@]}" "rakathon-deploy@$VPS_SSH_HOST" deploy < release-bundle.tgz
        ;;
    rollback)
        [[ ${ROLLBACK_RELEASE:-} =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
        ssh "${options[@]}" "rakathon-deploy@$VPS_SSH_HOST" "rollback $ROLLBACK_RELEASE"
        ;;
    *) exit 2 ;;
esac
