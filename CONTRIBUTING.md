# Working on Pillgaze

Keep changes small and scoped. When another agent is developing the application,
use a separate Git worktree and avoid changing its checkout or uncommitted files.
Fetch `origin/pillgaze` before pushing and integrate concurrent changes without
force-pushing the shared branch.

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

## Continuous integration

`.github/workflows/repository-checks.yml` runs on pushes and pull requests targeting
`pillgaze`. It checks the agent configuration's JSON syntax, repository configuration
whitespace, accidentally tracked ignored files, and GitHub Actions workflows with
actionlint. The ignored-file check covers filenames and patterns, not secret
contents; review commits for credentials as well.

Jobs use the existing ARM64 sandbox runner, read-only repository permissions,
checkout without persisted credentials, a five-minute timeout, and cancellation of
older runs on the same branch or pull request. Checkout includes configuration
only; reference inputs and the local knowledge base are not materialized. Fork pull
requests are excluded from this persistent runner.

At setup, `pillgaze` contains reference material and agent configuration, with no
application manifest or source. These checks do not yet build or test an
application. Once the application is committed, add its lint, synthetic tests,
dependency audit, and build in a separate workflow using its actual runtime and
lockfile. Keep those commands reproducible locally and within the runner's resource
limits. The sandbox has no Docker socket or access to the VPS application networks.

Deployment automation needs a defined target and credentials scoped to that target.
The current workflow performs repository checks only.
