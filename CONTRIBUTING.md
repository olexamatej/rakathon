# Working on Pillgaze

Keep changes small and scoped. When another agent is developing the application,
use a separate Git worktree and avoid changing its checkout or uncommitted files.
Use `main` as the primary application branch. Fetch `origin/main` before integrating
changes and avoid force-pushing shared branches. The original prognosis project is
archived on `legacy-prognosis`.

The live VPS uses separate Docker Compose projects for the frontend and API.
Pushes do not deploy them automatically; the manual frontend refresh reads
`origin/main`. Do not restore the abandoned Kubernetes release workflow.
See [`infra/vps/README.md`](infra/vps/README.md).

## Repository conventions

- Follow `.editorconfig`; source files use UTF-8 and LF line endings.
- Commit dependency manifests and lockfiles together when the application adds them.
- Keep `.env` files, credentials, virtual environments, dependencies, caches,
  generated builds, local databases, and exports out of Git. Share configuration
  through `.env.example` with placeholder values.
- `knowledge-base/` stays local as described in `AGENTS.md`.
- Treat `assets/` as reference/input material. Preserve its original bytes and
  avoid bulk formatting or line-ending conversion. Use synthetic fixtures for
  tests and review new inputs before committing them.
- `.gitignore` does not remove files already tracked in Git or its history.
- Keep project documentation in `docs/` and public reference catalogs in `data/`.
  Update catalog data and provenance metadata together; preserve source values.
  See `data/sukl/README.md` for the current snapshot and update procedure.

## Application boundaries and small changes

- Keep the patient and doctor browser UI in `apps/patient-web/public/` and the
  local server in `apps/patient-web/server.mjs`. Share medication validation
  between the patient and doctor flows rather than duplicating it.
- Add regression tests for changes to validation, export, and handoff behavior.
  Keep fixtures synthetic; do not read patient documents or photographs in tests.
  Offline integrity tests may read the versioned public SÚKL catalog, but must
  not query external services or claim clinical validation.
- Use npm and `npm ci`; do not introduce another package manager or regenerate
  the lockfile for unrelated cleanup. Review runtime upgrades separately.
- Follow surrounding style. No repository-wide formatting, mass renames, or
  dependency upgrades during concurrent application work.
- Explain scope and verification in commits/PRs. Keep infrastructure and CI
  changes separate from application features. The branch's
  `.github/pull_request_template.md` is a short checklist; copy it manually if
  GitHub does not offer it (automatic templates come from the default branch).

## Parallel application and service work

- The patient PWA and doctor UI share `apps/patient-web/`. `apps/doctor-web/`
  is a historical placeholder, not a separate application.
- Keep the Rust transfer service in `services/transfer-api/` and the shared
  OpenAPI contract in `packages/api-contract/`. `infra/vps/` documents the existing
  Compose deployment; live operational files stay outside the checkout.
- Read [`architecture.md`](architecture.md) before changing a cross-component
  boundary. Update the OpenAPI contract when API behavior changes and coordinate
  the matching patient, doctor, and service updates.
- The Rust transfer service uses SQLite; the VPS runs Docker Compose, not k3s.
  PostgreSQL storage and production approval are future work. Do not send real
  patient data to the local prototype.
- Commit the Rust crate's `Cargo.lock` with dependency changes. The Rust CI job
  tests its targets with `--locked` on the isolated ARM64 runner.

Before pushing application changes, use Node.js 24 and run:

```sh
npm ci
npm test
node --test apps/storage-admin/tests/*.test.mjs
```

On this VPS, run repository installation, tests, and builds only in the sandbox,
not as the Docker-enabled host account. Use a separate preview directory, never
the live Actions checkout. Check browser camera/gallery behavior manually when changing that flow.

## Continuous integration

`.github/workflows/repository-checks.yml` runs on pushes and pull requests targeting
`main` or `pillgaze`. It checks the agent configuration's JSON syntax, repository configuration
whitespace, accidentally tracked ignored files, and GitHub Actions workflows with
actionlint. The ignored-file check covers filenames and patterns, not secret
contents; review commits for credentials as well.

`.github/workflows/application-ci.yml` runs on the same branch events. It uses
Node.js 24, installs the committed lockfile with `npm ci`, runs web application
and storage admin unit tests, and checks the public catalog offline. The root
web application has no external npm dependencies. Review any future dependency
additions and their audit results. The workflow also tests the Rust transfer API
with locked dependencies on GitHub-hosted runners.

Checks use read-only repository permissions, SHA-pinned actions and checkout
without persisted credentials. Application checks exclude reference `assets/`
and the local knowledge base. Neither workflow deploys the application.

Deployment automation needs a defined target and credentials scoped to that target;
neither workflow deploys the application.

The browser storage flow is checked separately by
[Patient storage E2E](e2e/README.md). Each push/PR starts a disposable non-root
container on a GitHub hosted VM, running the checked-out frontend and real Rust
API with temporary SQLite. The runtime has no external network, host mounts,
Docker socket or published ports. No production services or secrets are used.
