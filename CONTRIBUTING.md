# Working on Pillgaze

Keep changes small and scoped. When another agent is developing the application,
use a separate Git worktree and avoid changing its checkout or uncommitted files.
Use `main` as the primary application branch. Fetch `origin/main` before integrating
changes and avoid force-pushing shared branches. The original prognosis project is
archived on `legacy-prognosis`.

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

- Keep Expo's entry points (`App.tsx`, `index.ts`) at the root. Reuse `src/ui.tsx`
  for shared UI and keep medication rules independent of UI in `src/medication.ts`.
  Add focused modules and tests as features grow, rather than reorganizing files
  while someone else is editing them.
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

Before pushing application changes, use Node.js 24 and run:

```sh
npm ci
npm run typecheck
npm test
npm run export:web -- --max-workers 1
```

On this VPS, run repository installation, tests, and builds only in the sandbox,
not as the Docker-enabled host account. Use a separate preview directory, never
the live Actions checkout. A web export checks bundling, not native device behavior.

## Continuous integration

`.github/workflows/repository-checks.yml` runs on pushes and pull requests targeting
`main` or `pillgaze`. It checks the agent configuration's JSON syntax, repository configuration
whitespace, accidentally tracked ignored files, and GitHub Actions workflows with
actionlint. The ignored-file check covers filenames and patterns, not secret
contents; review commits for credentials as well.

`.github/workflows/application-ci.yml` runs on the same branch events. It uses
Node.js 24, installs the committed lockfile with `npm ci`, checks TypeScript, runs
unit tests and the offline public-catalog integrity checks, and exports the Expo
web bundle with one Metro worker.
No application lint rules or formatter are imposed on the active development work.

The full `npm audit --audit-level=high` report is deliberately **non-blocking**
while Expo's upstream tooling findings are being reviewed. An audit failure emits
a workflow warning and job summary, including when the audit service is unavailable.
A green application build is not a clean security audit. Review the audit output
on dependency changes and before deployment; do not run `npm audit fix --force`,
which currently proposes incompatible framework downgrades. See README for the
dated findings. Making the audit blocking needs a deliberate review of upstream
fixes or narrowly scoped, documented exceptions, not silently ignoring advisories.

Both workflows use the existing ARM64 sandbox runner, read-only repository
permissions, SHA-pinned actions, checkout without persisted credentials, and
cancellation of older runs on the same branch or pull request. Repository checks
have a five-minute timeout and configuration-only checkout; application checks
have a fifteen-minute timeout and exclude all reference `assets/` and the local
knowledge base. The current app does not import those files. If runtime assets
are added, explicitly include only the necessary reviewed files in CI checkout.
Neither workflow uploads artifacts, publishes the prototype, or uses secrets.
Fork pull requests are excluded from this persistent runner. It has no Docker
socket or access to the VPS application networks.

Deployment automation needs a defined target and credentials scoped to that target;
neither workflow deploys the application.
