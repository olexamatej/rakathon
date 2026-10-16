# Patient → storage admin browser test

`storage.spec.mjs` uses Chromium, the patient PWA, the admin UI and the real Rust
storage API. It logs in before sending, counts **all** admin pages, seeds a unique
synthetic patient draft in localStorage, clicks **Odeslat seznam** once, checks the
server-issued PIN displayed by the patient UI, reads back identical JSON using
that PIN, reloads the authenticated admin, and requires exactly one additional
record with a new HMAC digest. Nothing intercepts or mocks storage requests.
Photo recognition is outside this scenario.

## Automatic CI

`.github/workflows/storage-e2e.yml` runs on pushes and PRs to main/pillgaze using
a fresh GitHub hosted Ubuntu VM. This preserves the Hetzner runner's intentional
block on the deployed website. Local mode starts the checked-out Rust backend
with a random test HMAC secret, disposable SQLite DB seeded with 101 synthetic
rows to exercise pagination, fixed test-only admin
password, and a Node same-origin gateway serving the checked-out UI. It binds
only loopback ports 4180/4181. It neither deploys nor needs production secrets.
Dependency setup follows [Playwright's CI guide](https://playwright.dev/docs/ci).

To run in a development sandbox with Node 24, Rust and Chromium dependencies:

```sh
cargo build --locked --manifest-path services/transfer-api/Cargo.toml
cd e2e
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install --with-deps --only-shell chromium
npm test
```

`E2E_API_BINARY` can override the compiled backend path. Do not run repo code as
the Docker-enabled VPS host user; use a disposable non-root sandbox.

## Deliberate live check

Add repository Actions secret `STORAGE_ADMIN_PASSWORD` with the existing storage
admin password through GitHub's secret settings. Never commit or print it.
Run **Patient storage E2E → Run workflow**, choose branch **main** and enable
`live`. Live mode is restricted to main and the canonical HTTPS origin. It does
not build/start local services. A missing secret fails the job rather than
silently skipping the test. The test step alone receives the secret.

Each live run leaves **one synthetic record** for inspection. No automatic
retries, scheduled production writes, deletion, trace, screenshot, video, saved
browser session, or artifact upload. Keep runs at least one minute apart; the
API rate limit is shared behind the proxy. The test bounds pagination at 2000
records. Concurrent real uploads/deletions between snapshots correctly fail the
strict +1 assertion; rerun deliberately during a quiet period after diagnosis.
The local gateway and database are removed when Playwright stops its web server.
