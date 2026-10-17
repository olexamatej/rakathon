# Patient and doctor browser tests

`storage.spec.mjs` logs into storage admin, counts every page, submits a unique
synthetic patient draft by clicking **Odeslat seznam**, verifies the displayed
server-issued PIN and **exactly one additional record** before retrieval. A separate
doctor context retrieves the exact list once, deleting the stored row; admin then
returns to its original inventory.

`storage-validity.spec.mjs` checks patient HEAD/renewal, retained local content after
consumption, restoration, network failures without stale PIN display, and renewal
of a display-expired demo row without duplicate uploads. `patient-resume.spec.mjs`
also verifies restoration after a real doctor's consuming GET.

`patient-doctor.spec.mjs` covers **Vyfotit** on mobile and **Z galerie** on desktop with
service workers enabled: a patient uploads a tiny synthetic image, the app's mock
recognizer creates three complete sample medicines, and the
patient submits them to the real Rust storage API. A clean doctor browser context
uses the server-issued PIN and verifies the same medicine names, dosages, and
schedule from storage. Admin diagnostics must show the exact same PIN and JSON.
The recognizer is mocked; uploads, storage, and PINs are not. The final admin
scenario tests cancelling deletion, then deleting every temporary record from
the second page and verifying that the synthetic PIN no longer retrieves data.

`.github/workflows/storage-e2e.yml` runs automatically on pushes and PRs to
main/pillgaze, and can also be started manually without inputs or secrets.
The `build-api` job builds the checked-out Rust API on a GitHub-hosted ARM64
Ubuntu VM and uploads a one-day artifact. Only the `storage` browser job runs on
the Hetzner runner. That runner has Node 24 and Playwright 1.64.1 Chromium
preinstalled; it downloads this run's API artifact, installs the locked test
package without install scripts, and runs one browser worker. No Rust or
Docker build runs on the VPS. Other application CI jobs use GitHub-hosted VMs.
Fork PRs are skipped. The runner's pre-job hook rejects other workflows/jobs.

The persistent runner container uses UID 1001, a read-only root, dropped
capabilities, no privilege escalation, 1 CPU, 1536 MiB RAM, 256 processes and
256 MiB shared memory. There are no host mounts, Docker socket or published
ports. Its isolated network reaches public HTTP/HTTPS only through the filtered
proxy; production, host, metadata and private network addresses are blocked.
Patient UI, admin and API communicate over loopback ports 4180/4181.
The API gets a random HMAC secret, a fixed test-only
password and temporary SQLite. Its 101 synthetic baseline rows also exercise
pagination; the storage test verifies exactly one additional record. The final
purge test removes all disposable rows. The temporary database is removed when the test server stops; the runner hook
removes the completed checkout, including downloaded API and node_modules. No production URL, production
credential or production database is used; `E2E_BASE_URL` is explicitly rejected.

To reproduce the CI run on a development machine with Docker:

```sh
docker build -f e2e/Dockerfile -t pillgaze-storage-e2e .
docker run --rm --init --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --cpus 2 --memory 2g --pids-limit 256 --shm-size 128m \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=256m pillgaze-storage-e2e
```

For local development in a non-root sandbox with Node 24, Rust and Chromium:

```sh
cargo build --locked --manifest-path services/transfer-api/Cargo.toml
cd e2e
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install --with-deps --only-shell chromium
npm test
```

`E2E_API_BINARY` can override the compiled backend path. Do not run repository
code as the Docker-enabled VPS host user. No retries, traces, screenshots or saved
browser sessions are enabled. The only CI artifact is the test API binary. Dependency setup follows the
[Playwright CI guide](https://playwright.dev/docs/ci).
