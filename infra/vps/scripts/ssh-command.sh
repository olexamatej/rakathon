#!/usr/bin/env bash
# Installed root-owned; sudo allows this single command for rakathon-deploy.
set -euo pipefail
exec sudo -n /opt/rakathon/scripts/receive-release.sh "${SSH_ORIGINAL_COMMAND:-}"
