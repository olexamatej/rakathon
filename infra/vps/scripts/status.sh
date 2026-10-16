#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Usage: sudo bash infra/vps/scripts/status.sh'; exit 2; }
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
systemctl status k3s --no-pager
k3s kubectl -n rakathon get pods,services,pvc
helm history rakathon -n rakathon
if test -f /var/lib/rakathon/current-release; then cat /var/lib/rakathon/current-release; fi
du -sh /var/lib/rakathon/data /var/lib/rakathon/releases /var/lib/rakathon/backups
df -h /var/lib/rakathon
ss -lntup
