# Gemini photo transcription

The Gemini **3.6 Flash** adapter runs through the Node server. The patient PWA
currently explicitly selects `{ mode: 'demo' }` to provide three complete synthetic
medicines for the PIN handoff demonstration. That mode makes no Gemini request.
Calling `recognizePhoto(file)` without the demo option retains real transcription
and never replaces errors with mock results. This does not change the separate
older Expo prototype at the repository root.

## Run

Use Node.js 24. In the repository root, create `.env` (or edit the existing file):

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.6-flash
```

Run `npm run web:patient` and open `http://localhost:8081/pacient`.
The server loads `.env` independently of the current directory. Existing process
environment variables take precedence. `GOOGLE_API_KEY` is also accepted when
`GEMINI_API_KEY` is absent. Restart after changing configuration. No SDK or
additional dependency installation is required for this server.

The key stays on the server. Never put it in public JavaScript or an
`EXPO_PUBLIC_` variable. `.env` is ignored by Git and excluded from Docker input.

## Request and response

`POST /api/transcribe`, raw image bytes (not multipart), with `Content-Type:
image/jpeg`, `image/png` or `image/webp`. Maximum raw size: 20 MiB. The server
checks the file signature. HEIC must be converted to one of these formats first.

```json
[{"name":"Concor 5 mg","schedule":"1-0-0"},{"name":"Example 20 mg","schedule":null}]
```

The response is an array with exactly `name` and `schedule` per row. Either field
can be `null`; strings are at most 120 characters, and there are at most 200 rows.
Visible strength stays in `name`. Fractions and written instructions are preserved;
only numeric schedule separators are normalized (`1/2 – 0 – 0` → `1/2-0-0`).
A handwritten list takes precedence over a printed list in the same photo.
No catalogue correction or invented dosing is requested. No medicines gives `[]`.

The existing UI adds local IDs, maps null names to empty editable names, keeps
unknown dosage/package fields empty, and omits null schedules. An unreadable name
blocks submission; remove that row and take a clearer photograph. Empty dosage/package fields are valid in
patient/doctor handoff. This avoids inventing package sizes merely to pass form
validation. Storage retains its existing structured payload shape.

Malformed JSON, additional fields, truncated generation and provider failures
return an error rather than partial or demo data. Responses use `no-store`.
Server generation/upload timeout is 120 seconds; browser timeout is 135 seconds.
Up to 14 MiB is sent inline; larger images use resumable Google Files upload and
a deletion attempt after generation, including failed generation. There is no
automatic retry. Neither images nor provider responses are written to local disk.

The full image is sent to Google. The prompt excludes identifiers from the
returned data; it does not anonymize the uploaded photograph. Use synthetic or
already anonymized inputs for prototype testing.

## Routing

The existing live frontend is static. Deploying only its public files does not
provide recognition: run the Node server with its private environment and route
`/api/transcribe` to it. Configure this route's body limit for 20 MiB and upstream
timeout for at least 135 seconds. Keep `/api/v1/` routed to Rust storage and
existing interaction routes intact. Live Compose/gateway configuration lives
outside this checkout; this change does not deploy or alter it.

HTTP failures: 400 empty image, 405 method, 413 size, 415 format, 422 blocked
image, 429 provider quota, 502 provider/invalid output, 503 missing configuration,
504 timeout. Google HTTP 429 may indicate exhausted daily free-tier quota, not
only temporary load; check the key's project quota before retrying.

## Verification

`npm test` runs synthetic offline tests for the Google request, strict output,
provider failures, large-file cleanup, HTTP endpoint, client mapping and doctor
handoff. Browser E2E stubs only transcription, keeping the real storage flow.
No Google credentials or real patient photographs are needed for automated tests.

Official API references: [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash),
[images](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding),
[structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
