# Gemini photo transcription

The patient PWA's photo/gallery flow posts to `POST /api/transcribe` on the
patient Node server, which proxies the raw photo to `POST /transcribe` on the
Rust interaction engine (`interaction-engine/`); the engine calls Gemini
**3.6 Flash** and returns strict minimal rows. The patient PWA currently
explicitly selects `{ mode: 'demo' }` to provide three complete synthetic
medicines for the PIN handoff demonstration; that mode makes no request at all.
Calling `recognizePhoto(file)` without the demo option retains real transcription
and never replaces errors with mock results.

## Run

Use Node.js 24 for the patient server and Rust 1.91+ for the engine. In the
repository root, create `.env` (or edit the existing file):

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.6-flash
TRANSCRIBE_API_URL=http://127.0.0.1:3000
```

`npm run engine` sources the root `.env` (values already exported in the shell
are kept) and starts the engine on its default port 3000. Then run
`npm run web:patient` and open `http://localhost:8081/pacient`. The patient
server proxies `/api/transcribe` to `TRANSCRIBE_API_URL` when set, otherwise to
`INTERACTION_API_URL`, otherwise to the production engine. Without a local
engine the photo flow uses the production service. The engine also accepts
`GOOGLE_API_KEY` when `GEMINI_API_KEY` is absent, and `GEMINI_TIMEOUT_SECONDS`
(default 120). Restart after changing configuration.

The key stays in the server environment. Never put it in public JavaScript or any
client-exposed environment variable. `.env` is ignored by Git and excluded from Docker input.

## Antigravity via a local proxy

Instead of a Google Gemini API key the engine can use an Antigravity
subscription. Antigravity has no public API, so a local
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance sits in
between and speaks the same Gemini protocol (`/v1beta/models/{model}:generateContent`).

One-time setup on a fresh machine:

```sh
scripts/setup-antigravity-proxy.sh
```

The script installs `cli-proxy-api` into `~/.local/bin`, writes
`~/.cli-proxy-api/config.yaml` (listener `127.0.0.1:8317`, a fresh client key
under `access.api-keys`; an existing config is kept), runs the Antigravity OAuth
login and prints the `.env` values from this page. Re-run it to refresh an
expired login; `--no-login` skips the browser step. By hand, equivalently:

- Install the `cli-proxy-api` binary and point it at
  `~/.cli-proxy-api/config.yaml` (listener `127.0.0.1:8317`, client key under
  `access.api-keys`).
- Run `cli-proxy-api -config ~/.cli-proxy-api/config.yaml -antigravity-login`
  and sign in with the same Google account as in Antigravity; the OAuth token is
  stored in `~/.cli-proxy-api` and refreshed by the proxy.
- Start the proxy before the engine, e.g. `npm run proxy`.

Root `.env`:

```dotenv
GEMINI_API_BASE=http://127.0.0.1:8317/v1beta
GEMINI_API_KEY=the_key_from_access.api-keys
GEMINI_MODEL=gemini-3.8-flash-medium
```

With a custom `GEMINI_API_BASE` every photo is sent inline (the resumable Google
Files API exists only upstream at Google), so the 14 MiB inline threshold does
not apply and the raw photo limit stays 20 MiB. Responses, errors and the strict
minimal output are identical to the direct Google endpoint.

## Request and response

`POST /api/transcribe` on the patient server (proxied verbatim to the engine's
`POST /transcribe`), raw image bytes (not multipart), with `Content-Type:
image/jpeg`, `image/png` or `image/webp`. Maximum raw size: 20 MiB. The engine
checks the file signature. HEIC must be converted to one of these formats first.

```json
[{"name":"Concor 5 mg","schedule":"1-0-0"},{"name":"Example 20 mg","schedule":null}]
```

The response is an array with exactly `name` and `schedule` per row. Either field
can be `null`; strings are at most 120 characters, and there are at most 200 rows.
Visible strength stays in `name`. Fractions and written instructions are preserved;
only numeric schedule separators are normalized (`1/2 – 0 – 0` → `1/2-0-0`).
A handwritten list takes precedence over a printed list in the same photo.
When the local SÚKL catalogue is available, the engine appends its official
medicine names to the instruction: a clearly matching visible name may be written
with the catalogue spelling (visible strength stays, e.g. `CONCOR 5 mg`).
Strengths, forms and dosing are never taken from the catalogue, an unreadable
name is never filled from it, and no values are invented. The catalogue is read
from `SUKL_CATALOGUE_PATH` (`npm run engine` defaults to
`data/sukl/medications.json`); a missing catalogue only skips name correction.
No medicines gives `[]`.

The existing UI adds local IDs, maps null names to empty editable names, keeps
unknown dosage/package fields empty, and omits null schedules. An unreadable name
blocks submission; remove that row and take a clearer photograph. Empty dosage/package fields are valid in
patient/doctor handoff. This avoids inventing package sizes merely to pass form
validation. Storage retains its existing structured payload shape.

Malformed JSON, additional fields, truncated generation and provider failures
return an error rather than partial or demo data. Responses use `no-store`.
Engine generation/upload timeout is 120 seconds (`GEMINI_TIMEOUT_SECONDS`);
browser timeout is 135 seconds.
With the default Google endpoint up to 14 MiB is sent inline; larger images use
resumable Google Files upload and a deletion attempt after generation, including
failed generation. With a custom `GEMINI_API_BASE` (local proxy) images go inline
regardless of size. There is no automatic retry. Neither images nor provider
responses are written to local disk.

The full image is sent to Google. The prompt excludes identifiers from the
returned data; it does not anonymize the uploaded photograph. Use synthetic or
already anonymized inputs for prototype testing.

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
connection failure to the engine yields its own 502. Google HTTP 429 may indicate
exhausted daily free-tier quota, not only temporary load; check the key's project
quota before retrying.

## Verification

`npm test` covers the patient proxy and its request checks with a stub engine over
loopback. `cargo test` in `interaction-engine/` covers request shape, the
catalogue prompt, strict output, provider-failure mapping and missing
configuration with a stub Gemini server. Browser E2E stubs only transcription,
keeping the real storage flow. No Google credentials or real patient photographs
are needed for automated tests.

Official API references: [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash),
[images](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding),
[structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
