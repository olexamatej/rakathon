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

## Small changes

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

The patient PWA lives in `public/` and uses browser APIs without dependencies.
`server.mjs` serves only its public files. Use Node.js 22.13 or newer and run `npm test`
for list persistence, text handoff and public-file boundary checks. Preview with
`npm run web` and check the photo flow in a mobile viewport. Installation and camera
behavior still need checks on real devices over HTTPS.

On this VPS, run repository installation, tests, and builds only in the sandbox,
not as the Docker-enabled host account. Use a separate preview directory, never
the live Actions checkout.

## Continuous integration

`.github/workflows/repository-checks.yml` runs on pushes and pull requests targeting
`main` or `pillgaze`. It checks the agent configuration's JSON syntax, repository configuration
whitespace, accidentally tracked ignored files, and GitHub Actions workflows with
actionlint. The ignored-file check covers filenames and patterns, not secret
contents; review commits for credentials as well.

The workflow uses the existing ARM64 sandbox runner, read-only repository
permissions, SHA-pinned actions, checkout without persisted credentials, and
cancellation of older runs on the same branch or pull request. It has a five-minute
timeout and configuration-only checkout. It does not upload artifacts, publish
the prototype, or use secrets.
Fork pull requests are excluded from this persistent runner. It has no Docker
socket or access to the VPS application networks.

Deployment automation needs a defined target and credentials scoped to that target;
the workflow does not deploy an application.
