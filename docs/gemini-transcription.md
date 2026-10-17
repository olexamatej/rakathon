# OpenRouter photo transcription

The patient PWA sends photos to `POST /api/transcribe` on the patient Node
server, which forwards the raw photo to `POST /transcribe` on the Rust
interaction engine. The engine calls OpenRouter directly using its chat
completions API; no CLIProxyAPI or Antigravity login is needed. The default
model is `google/gemini-3.6-flash`.

## Run

Use Node.js 24 for the patient server and Rust 1.91+ for the engine. Edit the
repository-root `.env`:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key_here
OPENROUTER_MODEL=google/gemini-3.6-flash
TRANSCRIBE_API_URL=http://127.0.0.1:6767
```

Run `cargo run` and `npm run web:patient` from the repository root in separate
terminals, then open
`http://localhost:8081/pacient`. Both commands load the root `.env`;
The engine defaults to port 6767; use `-- --port 8080` to override it. Restart after configuration
changes. The engine requires an OpenRouter key; old `GEMINI_*` and
`GOOGLE_API_KEY` settings are no longer used.

`OPENROUTER_API_BASE` defaults to `https://openrouter.ai/api/v1` (without
`/chat/completions`). `OPENROUTER_TIMEOUT_SECONDS` defaults to 120.
`OPENROUTER_MODEL` accepts OpenRouter model IDs including provider prefixes and
variant suffixes; choose a model with image input and structured-output support.
The request uses `provider.require_parameters: true` to select compatible
providers. The key stays in the server environment and is sent only as a bearer
header. `.env` is ignored by Git and excluded from Docker input.

The patient server uses `TRANSCRIBE_API_URL`, then `INTERACTION_API_URL`, then
the production engine. `WEB_BACKEND_URL` overrides these settings and sends all
API routes to the specified remote backend; leave it unset to use the local
engine for transcription.

## Request and response

`POST /api/transcribe` on the patient server (proxied verbatim to the engine's
`POST /transcribe`), raw image bytes (not multipart), with `Content-Type:
image/jpeg`, `image/png` or `image/webp`. Maximum raw size: 20 MiB. The engine
checks the file signature. HEIC must be converted to one of these formats first.

```json
[{"name":"Concor","strength":"5 mg","schedule":"1-0-0"},{"name":"Example","strength":null,"schedule":null}]
```

The response is an array with exactly `name`, `strength` and `schedule` per row.
Any field can be `null`; strings are at most 120 characters, and there are at most
200 rows. Visible strength, including units, is returned separately in `strength`;
`name` keeps the name and qualifiers. Fractions and written instructions are preserved;
only numeric schedule separators are normalized (`1/2 – 0 – 0` → `1/2-0-0`).
A handwritten list takes precedence over a printed list in the same photo.
When the local SÚKL catalogue is available, the engine appends its official
medicine names to the instruction: a clearly matching visible name may be written
with the catalogue spelling (e.g. `name: "CONCOR"`, `strength: "5 mg"`).
Strengths, forms and dosing are never taken from the catalogue, an unreadable
name is never filled from it, and no values are invented. The catalogue is read
from `SUKL_CATALOGUE_PATH` (defaults to the repository
`data/sukl/medications.json` from either working directory); a missing catalogue only skips name correction.
No medicines gives `[]`.

The existing UI adds local IDs, maps null names to empty editable names, maps
`strength` to the editable `dosage` field, keeps unknown strength/package fields
empty, and omits null schedules. An unreadable name
blocks submission; remove that row and take a clearer photograph. Empty dosage/package fields are valid in
patient/doctor handoff. This avoids inventing package sizes merely to pass form
validation. Storage retains its existing structured payload shape.

Malformed JSON, additional fields, truncated generation and provider failures
return an error rather than partial or demo data. Responses use `no-store`.
The provider deadline is 120 seconds (`OPENROUTER_TIMEOUT_SECONDS`);
the browser timeout is 135 seconds. Every photo is sent inline as a base64 data
URL to OpenRouter. The upstream structured response wraps the rows in a
`medications` object property; the engine validates and unwraps it, so the public
response remains the same array. Refused, malformed or truncated responses fail.
The upstream array schema deliberately omits `maxItems`: Gemini 3.8 Flash
rejects `maxItems: 200` with a generic `400 INVALID_ARGUMENT`. The engine still
enforces the 200-row limit when validating the response.
There is no automatic retry. Images and provider responses are not written to
local disk. The entire photograph is sent to OpenRouter and its selected model
provider; excluding identifiers from the response does not anonymize the input.

## Routing

The existing live frontend is static. Route `/api/transcribe` to the patient
Node server (which proxies to the engine via `TRANSCRIBE_API_URL`) or directly to
the engine's `/transcribe`. Either way configure the body limit for 20 MiB and
the upstream timeout for at least 135 seconds. Keep `/api/v1/` routed to Rust
storage and existing interaction routes intact. Live Compose/gateway
configuration lives outside this checkout; this change does not deploy or alter it.

HTTP failures from the engine: 400 empty image, 405 method, 413 size, 415 format,
422 blocked image, 429 provider quota, 502 provider/invalid output, 503 missing
configuration, 504 timeout. The patient server forwards them unchanged; a
connection failure to the engine yields its own 502.

## Verification

`npm test` covers the patient proxy and its request checks with a stub engine over
loopback. `cargo test` in `interaction-engine/` covers request shape, the
catalogue prompt, strict output, provider-failure mapping and missing
configuration with a stub OpenRouter server. Browser E2E stubs only transcription,
keeping the real storage flow. No OpenRouter credentials or real patient photographs
are needed for automated tests.

Official API references: [image inputs](https://openrouter.ai/docs/guides/overview/multimodal/images),
[structured output](https://openrouter.ai/docs/guides/features/structured-outputs).
