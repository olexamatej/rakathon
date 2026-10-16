# VPS releases — frontend + backend

Active target: **https://rakathon.denishromada.cz**, single-node ARM64 k3s on
this Hetzner VPS. Develop from the current `main`; **`master` is the release
branch**. Azure is not used by this workflow. No public Kubernetes API or registry.

## Every change to master

`Rakathon VPS release` runs for **every push**, without path filters:

1. Reuse the existing isolated VPS runner for TypeScript, unit tests, Expo web
   export and locked Rust tests. Fork code never runs there.
2. Validate the Helm schema, rendered security/persistence assertions and
   release-bundle rejection tests on a GitHub-hosted ARM64 runner.
3. Build **both** ARM64 images on that hosted runner. The Rust image embeds the
   browser demo, so its build context is the repository root. No Docker socket
   or host filesystem is given to the existing runner.
4. Test packaged frontend/API containers with a synthetic transfer roundtrip.
5. Send the image-only bundle over SSH, using a pinned host key and dedicated
   forced-command account. No generic shell, port forwarding or kubeconfig in CI.
6. Import into k3s containerd; root-owned Helm chart deploys both images with
   `--atomic --wait`. Verify frontend release ID, API health and single-use transfer.
7. Check public HTTPS and the same release. A failed check is a failed workflow,
   not “deployment success”. A release consists of SHA + run ID + attempt.

Frontend is `/`; API is `/api/v1/transfers`, health `/api/health/ready`.
The existing encrypted demo is `/demo/patient` and `/demo/doctor`; `/v1` remains
available for that demo. **The main Expo UI still uses local demo handoff —
deploying both services does not implement its missing cross-device integration.**
This is a synthetic-data prototype, not an approved clinical service. API rate
limits currently share the reverse-proxy source IP; do not trust client-supplied
forwarded headers or claim per-client protection.

## One-time bootstrap (not a release task)

**Current status: implementation prepared; cluster, DNS, TLS and CI deploy
credentials are NOT configured. No live migration/deployment has occurred.**
Before bootstrap, master pushes still build/test both images, but the deploy job
fails explicitly instead of reporting a skipped deployment as success.
The domain `.cz` had no DNS answer when inspected; the existing websites use
`.com`. Keep the requested `.cz` unless the owner explicitly corrects it.

The host has 2 ARM64 CPUs, 3.7 GiB RAM without swap and approximately 11 GiB disk
free. Only about 830 MiB RAM was available; bootstrap deliberately requires
1.5 GiB available and 6 GiB disk free. Close unused workloads deliberately or
increase capacity; do not terminate other agent sessions blindly. k3s control
plane adds substantial steady-state memory use. No broad upgrades or reboot.

The operator needs root; `rhodes` sudo currently requires interactive approval.
Never send passwords to the agent. From a reviewed checkout:

```sh
sudo bash infra/vps/scripts/bootstrap.sh --confirm
```

This installs pinned k3s `v1.35.9+k3s1` and Helm `v3.22.1` with checksum checks,
enables `k3s.service`, uses a separate containerd, encrypts Kubernetes secrets,
and creates a dedicated `rakathon-deploy` account. Chart and receiver live
root-owned in `/opt/rakathon`; data is `/var/lib/rakathon/data`.
It does **not** modify DNS, the public Nginx gateway or issue certificates.
If interrupted, inspect `systemctl status k3s` and `journalctl -u k3s`; do not
retry installation over existing cluster state. Kubernetes config updates are
reviewed administrator changes; CI cannot upload arbitrary charts or host scripts.

### Secrets and SQLite migration

After cluster health is verified, explicitly migrate:

```sh
sudo bash infra/vps/scripts/migrate-data.sh --confirm
```

This stops only the old `pillgaze-transfer-api`, backs up the quiesced SQLite
volume, copies it and preserves the **original** HMAC pepper in `rakathon-hmac`.
Never regenerate the pepper on access errors. Source volume
`pillgaze-transfer-data` and `/home/rhodes/pillgaze-transfer/.secrets/transfer.env`
remain intact. Expect the private API to be down between migration and the first
successful deployment. Backups contain sensitive data; root-only, not in Git.
The PV is `Retain` and outside Helm, so failed installs/rollback cannot delete it.
Local path capacity is not a disk quota. Schedule protected, consistent SQLite
backups if real data is later allowed; no scheduled backup is claimed here.

### CI authorization (once)

Generate a dedicated Ed25519 key outside the repo, store the private key as
GitHub environment **`vps-production`** secret `VPS_DEPLOY_KEY`, and authorize
only its public key in `/home/rakathon-deploy/.ssh/authorized_keys` with mode 0600,
owned by `rakathon-deploy`. Do not reuse the runner registration token or Git deploy key.
The sshd configuration forces the receiver for this account and disables
forwarding/password/TTY. It allows only `deploy` and `rollback <release-id>`.
Pin the VPS SSH host key obtained **locally from `/etc/ssh/ssh_host_ed25519_key.pub`**
as environment secret `VPS_SSH_KNOWN_HOSTS` (known_hosts format). Never use
`StrictHostKeyChecking=no` or trust an unchecked network `ssh-keyscan`.
Set repository variable `VPS_SSH_HOST=37.27.43.72`.
Restrict `vps-production` deployment branches to `master`.

### DNS, gateway and HTTPS (once, staged)

First verify domain ownership, existing records, Cloudflare zone/TLS mode and
Hetzner firewall for IPv4 **and** IPv6. Do not enable UFW remotely without an
explicit SSH allow rule; Docker-published ports can bypass UFW.

1. Set `rakathon.denishromada.cz` A to `37.27.43.72`; do not publish an AAAA
   unless it points to the verified VPS IPv6 and ingress works. For this nested
   host verify the Cloudflare edge certificate covers it if proxying is enabled.
2. Back up `/home/rhodes/webserver/conf.d/site.conf`, append `gateway-http.conf`,
   and use `/home/rhodes/webserver/bin/reload-gateway.sh` (validates before reload).
   Test one HTTP-01 file externally before contacting the CA.
3. Inspect `certbot certificates`, renewal configs and deploy hooks first.
   Use the existing webroot `/opt/ssl_certs/denishromada`; perform a staging test,
   then **one deliberate** production issuance, with an operator-approved email:
   `certbot certonly --webroot -w /opt/ssl_certs/denishromada -d rakathon.denishromada.cz`.
   Do not repeatedly issue certificates or replace existing site lineages.
4. Append `gateway-https.conf` only when certificate files exist. Validate/reload
   gracefully and run the established webserver checks. Preserve Obed source and
   all existing hosts. The host's `snap.certbot.renew.timer` remains the only
   scheduler. Ensure its deploy hook reloads this new lineage too; run a bounded
   renewal dry run with the deploy hook after DNS/TLS is stable.
5. Verify port exposure: public **22,80,443 only**; Kubernetes API 6443 and kubelet
   10250 and NodePort 30080 only via private Docker bridge `172.20.0.1`, not public interfaces.
   No Traefik, ServiceLB, public registry, Docker socket mount, or extra public app port.
   Validate Docker/k3s network interaction and that the isolated runner still
   cannot reach websites/private addresses with its established `bin/check.sh`.
6. Once prerequisites are verified, set `VPS_DEPLOY_ENABLED=true` and dispatch
   `Rakathon VPS release` on **master**. From then on master pushes deploy automatically.

## Status, logs and rollback

```sh
sudo k3s kubectl -n rakathon get pods,services,pvc
sudo k3s kubectl -n rakathon logs deploy/rakathon-api --tail=50
sudo env KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm history rakathon -n rakathon
sudo cat /var/lib/rakathon/current-release
systemctl status k3s --no-pager
```

Use Actions → `Rakathon VPS release` → Run on `master` → set
`rollback_release` to a previous successful release ID. It restores that **pair**
without rebuilding or changing SQLite/HMAC. Protected image archives are retained
in `/var/lib/rakathon/releases` and re-imported for rollback even after kubelet
image garbage collection. Monitor disk use; deliberately remove only obsolete
release directories while retaining current and at least two known-good versions.
Do not broadly prune rollback images. Automatic Helm
rollback covers failed readiness; the receiver also restores the previous pair
on a failed local roundtrip. The public verification failure remains visible
and needs a deliberate rollback/diagnosis (do not loop production tests).

SQLite uses one replica and `Recreate`, so API releases have a brief outage
(usually seconds; failed releases can take minutes). This is not zero-downtime HA.
Schema-changing releases require a separately reviewed backward-compatibility/
backup plan; Helm rollback does not undo migrations.

Emergency recovery before public cutover: stop the new API deployment, preserve
its latest database separately, then explicitly restart the old Compose API
using its retained original volume/secret. That volume is a **pre-migration**
snapshot, not synchronized ongoing state. Revert only the new gateway blocks
and gracefully reload if returning to the old public configuration. Never run
`down -v`, delete the PV/data, or run a k3s uninstall script during routine rollback.

Completion requires two successful full deployments and one verified rollback,
working public TLS and unchanged existing websites/runner isolation. Those live
checks have not yet been possible without operator bootstrap and DNS.
