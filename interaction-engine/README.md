# Drug Interaction API

Rust/Axum server implementing [openapi.yaml](openapi.yaml). Each uncached check runs in the background using a
fresh `codex exec --ephemeral` process and requests schema-constrained JSON.
Rust validates the result and constructs the public response.

## Run

Requires Rust 1.91+ and Codex CLI 0.163.0 (the version used for development),
plus its `codex-code-mode-host` companion on PATH for research requests,
authenticated using `codex login` or the CLI's supported API-key authentication.
Your existing Codex login is used; user configuration is ignored for inference.

```sh
cargo run --release
```

Set the listening port with `--port` (or `-p`):

```sh
cargo run --release -- --port 8080
```

The default is port 3000. `--port` overrides the port in `BIND_ADDR` while
keeping its host address. Run with `--help` to see command line options.

```sh
curl -i http://127.0.0.1:3000/interaction-checks \
  -H 'Content-Type: application/json' \
  -d '{"drugs":["warfarin","ibuprofen","unknown-drug-name"]}'
```

Repeat the same POST to poll. The first request returns `202 Accepted` with
`{"state":"queued"}`; subsequent requests return `202` with `queued` or `running`
while work is pending. Follow `Retry-After: 2`, backing off to five seconds for
longer waits. On completion the same request returns `200` with the existing
result schema, or a retained `503` problem response on failure. No public job IDs
or separate polling URLs are needed. Both endpoints use this behavior.

Identical validated data shares one execution. Drug strings, spelling, whitespace,
and order are significant because results echo input names and indexes. Research
site URLs are canonicalized to their supported domain. Object property order and
JSON formatting do not matter. Model, service tier and prompt versions are also
part of the internal fingerprint. Successful results are reused for 24 hours
and failures for 30 seconds by default, measured from completion. After expiry,
the next matching request starts fresh work. Completed negative or inconclusive
research is a successful result and uses the normal result retention period.

Requests and results are stored locally in SQLite at `JOBS_PATH`. Queued work
and completed results survive restarts. Interrupted running work becomes a
retained `503` with code `worker_interrupted`; execution failures use
`execution_failed`, and expired queued work uses `queue_timeout`. This is a
single-server queue: a lock prevents two server processes sharing one database.
Expired records are deleted during queue maintenance and submission. Pending
work waits at most `QUEUE_TIMEOUT_SECONDS` before being marked failed when the
queue is next checked. The inference timeout starts when execution starts.
All API responses use `Cache-Control: no-store` independently of internal reuse.

`GET /openapi.yaml` serves the contract. `GET /healthz` checks the HTTP process;
it does not make a model call or verify Codex authentication.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1:3000` | HTTP listener |
| `CODEX_BIN` | `codex` on PATH | Codex executable |
| `CODEX_MODEL` | `gpt-6.1-sol` | Optional model override |
| `CODEX_SERVICE_TIER` | `priority` (Fast) | `default` for Standard; `fast` or `priority` to request Fast mode |
| `CODEX_TIMEOUT_SECONDS` | `90` | Per-process deadline |
| `MAX_CONCURRENT_CHECKS` | `4` | Maximum simultaneous Codex processes |
| `JOBS_PATH` | `data/jobs.sqlite3` | Persistent request/result database; one server per database |
| `MAX_QUEUED_CHECKS` | `100` | Maximum queued requests, shared by both endpoints |
| `RESULT_TTL_SECONDS` | `86400` | Successful-result retention after completion |
| `FAILURE_TTL_SECONDS` | `30` | Failure retention before another attempt is allowed |
| `QUEUE_TIMEOUT_SECONDS` | `300` | Maximum wait before execution |
| `RUST_LOG` | `info` | Server logging filter |

Low reasoning effort is requested for latency. One model call evaluates the
whole submitted list. There is no retry loop or per-pair subprocess fan-out.
No authentication is required by the API, as agreed in the initial spec. The
listener defaults to localhost. New requests beyond the queue limit receive 429
with `Retry-After`; existing requests can still be polled when the queue is full. Bodies are limited to 64 KiB.

## Inference and response handling

- Explanations are always in Czech (`cs`): summaries, mechanisms, clinical
  effects, recommendations, name-resolution messages, and API error messages.
  JSON property names and enum values keep their specified English identifiers;
  drug names retain their identity. Responses declare `Content-Language: cs`.
- Input is 2–50 drug name strings, each nonblank and at most 200 Unicode characters.
- Unrecognized, ambiguous, and unsupported names are returned alongside results.
- The internal model schema is generated from Rust types. The model supplies
  name resolutions and clinical findings; Rust owns IDs, timestamps, pair counts,
  and severity aggregation.
- Interactions are strictly pairwise. Duplicate aliases are consolidated;
  reversed or repeated pair records are merged. Self-pairs, references to missing
  drugs, malformed output, and incomplete evaluation cause 503.
- No known interactions produces an empty array. A missing interaction does not
  establish safety. Coverage counts describe pairs considered by the model,
  not a verified search of a curated interaction database.
- Success responses include `X-Interaction-Source: model-knowledge` and
  `X-Sources-Verified: false`. Clinical effects and evidence labels come from
  model knowledge and are not verified against current sources. References stay
  empty.

## External-site research

`POST /interaction-research` queues research for exactly two names on one
supported site. Medscape uses its checker JSON endpoints directly; other sites
use a fresh agent with live web search:

```sh
curl http://127.0.0.1:3000/interaction-research \
  -H 'Content-Type: application/json' \
  -d '{"drugs":["warfarin","ibuprofen"],"site":"drugs.com"}'
```

Supply `site` as `drugs.com`, `webmd.com`, `patient.info`, `rxlist.com`,
`reference.medscape.com`, `rxlabelguard.com`, or `rxcheck.dev`. The exact seven
checker URLs listed in the OpenAPI request schema are also accepted. The
response always uses the canonical domain.

Responses contain `drugs`, `site`, `checkedAt`, `status`, `url`, and `summary`:

- `found`: a dedicated page for that pair was retrieved (or a validated Medscape
  checker API response); `url`
  contains its HTTPS address on the selected site. The short Czech summary
  describes the interaction, severity, and precautions where the page provides
  them. A page explicitly reporting no known interaction can also qualify.
- `not_found`: no dedicated pair page was found; `url` is null. This does not
  establish safety or absence of an interaction.
- `inconclusive`: access restrictions, ambiguous names, or insufficient
  accessible evidence prevented a reliable answer; `url` is null.

Medscape is a special case: the server resolves each name using the public
checker typeahead API and requires one exact match (case/whitespace insensitive).
Brand names map to the generic record returned by Medscape; partial names,
ambiguous names, and two aliases of the same record return `inconclusive`.
It then calls `druginteraction.do?action=getMultiInteraction&ids=...`, validates
that every returned record names the resolved pair, and uses a tool-free model
call only to summarize those records in Czech. An explicitly empty API response
returns `found` with a qualified no-record summary. The result URL points to the
actual pair-specific JSON request. No browser, login, cookies, or new server
configuration is required. HTTP access/transport failures return `inconclusive`;
malformed data or mismatched pairs fail closed with 503. These undocumented
endpoints may change or be blocked from a hosting provider; deployment should
include a live check. The server makes these HTTPS requests directly; model
command network access stays disabled. Redirects are disabled, each HTTP request
has a 15-second limit and a 1 MiB response limit, and the overall operation shares
the configured research deadline.

For other sites, generic checkers and homepages do not qualify as result URLs. The agent is
instructed to retrieve the actual pair page and use only its clinical claims;
the server validates URL structure, host, status consistency, summary length,
and that the returned URL appeared in the web tool results.
These are agent-reported findings, not independent clinical verification.
Search is configured with a domain filter for the selected site. The web-search path
requires a completed web-search tool event and rejects other tool activity.
The Code Mode host is enabled for research because CLI 0.163 requires it to
expose web tools; Code Mode execution remains disabled. Live retrieval is
enabled through Codex's hosted search tool; command network
access remains disabled. This does not automate login or browser-only checkers.

Research shares the existing model, service tier, `CODEX_TIMEOUT_SECONDS`
(default 90 seconds), and `MAX_CONCURRENT_CHECKS` capacity. Requests return 202 while pending,
receive 429 when the queue is full, and return a retained 503 for model/process
failures, timeouts, or invalid output. Completed negative and inconclusive
research returns 200. Responses declare `Content-Language: cs`,
`X-Interaction-Source: web-search` (or `medscape-api` for Medscape), and
`Cache-Control: no-store`.

Web-search settings follow the official
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Codex restrictions

Interaction checks disable web search. Every invocation disables shell execution, image/file viewing,
plugins, connectors, MCP configuration, hooks, subagents, and memories. User
configuration and execution rules are ignored; project instructions and the
skills instruction catalog are excluded. The working directory is a fresh
temporary directory outside the repository. Drug names travel through stdin
as JSON data and never become command arguments or shell code.

A named permission profile denies filesystem access except the minimal runtime
paths, and disables command network access. Model execution tools are disabled
independently, so the model has no shell or file-viewing tool with which to use
those paths. The CLI fails rather than falling back if these settings are rejected.

The CLI still needs its own host access to read authentication, start the
process, and contact the model provider. Disabling model tools is distinct from
putting the entire CLI process in a container. `--ephemeral` suppresses session
files; temporary schema files and CLI logs are removed after each check. This
does not make a claim about provider-side retention.

Unexpected tool events (except web-search events on research requests), failed processes, invalid responses, or timeouts return
a generic 503 without exposing model output or CLI diagnostics. Server logs do
not include submitted names or raw responses. Processes are killed and reaped
on timeout; workers continue background checks even when a
client disconnects.

CLI behavior can change between versions. Recheck restriction flags and the live
smoke test before upgrading. Relevant official documentation:
[non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode)
and [configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

## Verify

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Tests use a fake executable rather than making paid model calls. They cover
OpenAPI response conformance, pair invariants, partial resolution, invalid input,
subprocess flags, invalid output, unexpected tool activity, timeout cleanup, capacity limits, request deduplication, persistent results, expiry, and restart recovery. The subprocess tests require Unix and `/usr/bin/python3`.

An optional live smoke test uses your configured Codex login and makes a real
model call:

```sh
cargo test --test api live_codex_smoke -- --ignored --nocapture
```

The optional live research check also uses your login and makes a real model call:

```sh
cargo test --test api live_research_smoke -- --ignored --nocapture
```

Print the internal Structured Outputs schema with
`cargo run --example model_schema`.

## Model benchmark

The [2026-10-16 benchmark report](benchmarks/2026-10-16-model-comparison/REPORT.md)
compares Luna, Terra, and Sol in Standard and Fast modes on the four-drug sample.
It includes actual response files, latency ranges, OpenAPI checks, and qualitative
review against a [source-backed checklist](benchmarks/REFERENCE.md).
The [Astra follow-up](benchmarks/2026-10-16-astra-comparison/REPORT.md) adds
`gpt-6-astra` in both modes and compares it with the earlier results.

To reproduce with a new output directory:

```sh
cargo build --release
python3 scripts/benchmark.py --output benchmarks/<new-run-name>
python3 scripts/review_benchmark.py benchmarks/<new-run-name>
cargo run --example validate_benchmark -- benchmarks/<new-run-name>
```

To benchmark only Astra, add `--models gpt-6-astra` to the benchmark command.

The runner uses three repetitions per model/mode by default and measures real
HTTP submissions and polling sequentially, with a separate database per run to ensure fresh inference. These commands use the configured Codex login and make
real model calls. Fast is requested through the Codex `service_tier` setting;
the CLI does not confirm the actual served tier in its event output.
