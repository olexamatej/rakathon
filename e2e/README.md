# Patient → storage admin browser test

The Chromium scenario logs into storage admin, counts every page, submits a unique
synthetic patient draft by clicking **Odeslat seznam**, verifies the displayed
server-issued PIN and exact JSON read back through that PIN, loads the same list by PIN in a separate doctor browser context, then reloads admin
and requires **exactly one additional record**. The real Rust storage API handles
all requests; nothing mocks uploads or PINs. OCR is outside this scenario.

`.github/workflows/storage-e2e.yml` runs automatically on pushes and PRs to
main/pillgaze, and can also be started manually without inputs or secrets.
It builds the checked-out Rust API and browser test image on a fresh GitHub hosted
Ubuntu VM. This keeps Docker out of the existing Hetzner runner.

Each run starts a disposable **non-root container with networking disabled**,
a read-only root, dropped capabilities, no privilege escalation, bounded CPU,
memory and processes, temporary storage, no host mounts, no Docker socket and no
published ports. Patient UI, admin and API communicate only over container
loopback ports 4180/4181. The API gets a random HMAC secret, a fixed test-only
password and temporary SQLite. Its 101 synthetic baseline rows also exercise
pagination; the test verifies 101 → 102 records. The container and database are
removed after the test, including on failure. No production URL, production
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
code as the Docker-enabled VPS host user. No retries, traces, screenshots, saved
sessions or artifact uploads are enabled. Dependency setup follows the
[Playwright CI guide](https://playwright.dev/docs/ci).
