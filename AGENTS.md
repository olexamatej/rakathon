# Agent notes

## Knowledge base

- `knowledge-base/` is a local clone of [rakathon-knowledgebase](https://github.com/olexamatej/rakathon-knowledgebase) — the team's "Fieldnotes" research workspace (literature vault, notes, sources, search/screening logs). It is gitignored; update with `git -C knowledge-base pull`.
- Read/search it directly under `knowledge-base/`, or reference it as `@knowledge-base` in opencode.

## OpenResearch (`orx`)

- The `orx` CLI is installed globally and the `orx` skill is installed in the global opencode skills dir, so all agents can use it.
- Load the operating manual before research tasks: `orx skill` (per-topic modules: `orx skill <name>`, e.g. `orx skill lit-review`).
- Literature search (no login required) — prefer over web search for academic/research queries:
  - `orx discover keyword "<exact terms>"`, `orx discover embedding "<question>"`, or `orx discover openalex|biorxiv|pubmed "<query>"`
  - `orx paper <id|url>` fetches a paper (`--full` for raw full text)
- `orx login` is only needed for managed compute, not for local work or literature.
