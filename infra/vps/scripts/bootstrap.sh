#!/usr/bin/env bash
# Reviewed, one-time host installation. Does not touch DNS, certificates or live gateway.
set -euo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test "$(id -u)" = 0 || { echo 'Run with sudo; never share your password.' >&2; exit 2; }
test "${1:-}" = --confirm || { echo 'Usage: sudo bash infra/vps/scripts/bootstrap.sh --confirm'; exit 2; }
test "$(uname -m)" = aarch64
for command in curl python3 docker flock systemctl ssh-keygen visudo; do command -v "$command" >/dev/null; done
if systemctl is-active --quiet k3s || test -e /etc/rancher/k3s/config.yaml; then
    echo 'Existing Kubernetes configuration found; inspect it rather than overwrite.' >&2
    exit 1
fi
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
test "$available" -ge 1572864 || { echo 'Need at least 1.5 GiB MemAvailable before installing k3s. Do not stop unrelated sessions blindly.' >&2; exit 1; }
test "$(df --output=avail -k /var/lib | tail -1)" -ge 6291456 || { echo 'Need at least 6 GiB free disk.' >&2; exit 1; }
bridge=$(docker network inspect denishromada-web --format '{{(index .IPAM.Config 0).Gateway}}')
test "$bridge" = 172.20.0.1 || { echo 'Gateway bridge changed; review chart, NodePort and gateway configuration.' >&2; exit 1; }
bridge_id=$(docker network inspect denishromada-web --format '{{.Id}}')
bridge_interface="br-${bridge_id:0:12}"
ip link show "$bridge_interface" >/dev/null
install -d -m 0700 /var/lib/rakathon /var/lib/rakathon/releases /var/lib/rakathon/backups
install -d -m 0700 -o 1000 -g 1000 /var/lib/rakathon/data
install -d -m 0755 /opt/rakathon/scripts /etc/rancher/k3s
work=$(mktemp -d /var/lib/rakathon/bootstrap.XXXXXX)
trap 'rm -f "$work/k3s" "$work/sha256sum-arm64.txt" "$work/helm.tgz" "$work/helm.sha256" "$work/install-k3s.sh"; rm -f "$work/linux-arm64/helm" "$work/linux-arm64/LICENSE" "$work/linux-arm64/README.md"; rmdir "$work/linux-arm64" 2>/dev/null || true; rmdir "$work"' EXIT
# Pinned releases, checksums from the same official release. No unreviewed latest upgrade.
K3S_VERSION=v1.35.9+k3s1
HELM_VERSION=v3.22.1
curl -fSL --connect-timeout 10 --max-time 180 -o "$work/k3s" "https://github.com/k3s-io/k3s/releases/download/$K3S_VERSION/k3s-arm64"
curl -fSL --connect-timeout 10 --max-time 60 -o "$work/sha256sum-arm64.txt" "https://github.com/k3s-io/k3s/releases/download/$K3S_VERSION/sha256sum-arm64.txt"
checksum=$(awk '$2 == "k3s-arm64" {print $1}' "$work/sha256sum-arm64.txt")
[[ $checksum =~ ^[a-f0-9]{64}$ ]]
test "$checksum" = 6176dd12c512e177af998e6035920f6283c5fdbd5adfdff85c103a7fdf2a00b5
printf '%s  %s\n' "$checksum" "$work/k3s" | sha256sum -c -
curl -fSL --connect-timeout 10 --max-time 120 -o "$work/helm.tgz" "https://get.helm.sh/helm-$HELM_VERSION-linux-arm64.tar.gz"
curl -fSL --connect-timeout 10 --max-time 60 -o "$work/helm.sha256" "https://get.helm.sh/helm-$HELM_VERSION-linux-arm64.tar.gz.sha256sum"
checksum=$(awk '{print $1}' "$work/helm.sha256")
[[ $checksum =~ ^[a-f0-9]{64}$ ]]
test "$checksum" = 4c29e286b279d170fa048ddfc3e4e83dcd069ca9c52102766ba672d7149e694d
printf '%s  %s\n' "$checksum" "$work/helm.tgz" | sha256sum -c -
tar -xzf "$work/helm.tgz" -C "$work" linux-arm64/helm
install -m 0755 "$work/linux-arm64/helm" /usr/local/bin/helm
install -m 0755 "$work/k3s" /usr/local/bin/k3s
# Private bridge is reachable by pods (loopback API would break CoreDNS).
# No Kubernetes port binds to the VPS public IPv4 or IPv6.
cat > /etc/rancher/k3s/config.yaml <<YAML
node-name: rakathon-vps
node-ip: 172.20.0.1
flannel-iface: $bridge_interface
bind-address: 172.20.0.1
advertise-address: 172.20.0.1
https-listen-port: 6443
write-kubeconfig-mode: "0600"
secrets-encryption: true
flannel-backend: host-gw
cluster-cidr: 10.42.0.0/16
service-cidr: 10.43.0.0/16
disable:
  - traefik
  - servicelb
  - metrics-server
  - local-storage
kube-proxy-arg:
  - nodeport-addresses=172.20.0.1/32
kubelet-arg:
  - address=172.20.0.1
  - read-only-port=0
  - max-pods=30
  - system-reserved=memory=768Mi
  - "eviction-hard=memory.available<200Mi,nodefs.available<10%"
YAML
cat > /etc/systemd/system/k3s.service <<'UNIT'
[Unit]
Description=Rakathon single-node k3s
Wants=network-online.target
After=network-online.target docker.service
[Service]
Type=notify
TimeoutStartSec=300
ExecStart=/usr/local/bin/k3s server
Restart=on-failure
RestartSec=10
KillMode=process
Delegate=yes
LimitNOFILE=1048576
LimitNPROC=infinity
TasksMax=infinity
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now k3s
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# A single bounded readiness wait; do not repeatedly reinstall on errors.
timeout 180 bash -c 'until k3s kubectl get node rakathon-vps >/dev/null 2>&1; do sleep 5; done'
k3s kubectl wait --for=condition=Ready node/rakathon-vps --timeout=180s
k3s kubectl apply -f "$SOURCE/persistence.yaml"
cp -a "$SOURCE/chart" /opt/rakathon/chart
install -m 0755 "$SOURCE/scripts/receive-release.sh" "$SOURCE/scripts/ssh-command.sh" "$SOURCE/scripts/smoke.py" "$SOURCE/scripts/unpack-release.py" /opt/rakathon/scripts/
chown -R root:root /opt/rakathon
chmod -R go-w /opt/rakathon
id rakathon-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash rakathon-deploy
install -d -m 0700 -o rakathon-deploy -g rakathon-deploy /home/rakathon-deploy/.ssh
cat > /etc/sudoers.d/rakathon-deploy <<'SUDO'
rakathon-deploy ALL=(root) NOPASSWD: /opt/rakathon/scripts/receive-release.sh *
SUDO
chmod 0440 /etc/sudoers.d/rakathon-deploy
visudo -cf /etc/sudoers.d/rakathon-deploy
cat > /etc/ssh/sshd_config.d/70-rakathon-deploy.conf <<'SSH'
Match User rakathon-deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    DisableForwarding yes
    PermitTTY no
    ForceCommand /opt/rakathon/scripts/ssh-command.sh
Match all
SSH
/usr/sbin/sshd -t
systemctl reload ssh
echo 'Cluster installed. NEXT: migrate data/secret, authorize CI public key, configure DNS+TLS, then enable VPS_DEPLOY_ENABLED.'
echo 'No website configuration, DNS or certificate issuance was changed.'
