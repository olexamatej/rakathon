# Doctor Web

This directory is reserved for the doctor-facing browser application. Its first
flow is to accept a one-time retrieval code, fetch an encrypted medication-list
envelope from the transfer API, obtain the decryption key separately from the
patient, and decrypt locally in the browser.

The API must never receive the decryption key. Do not put the key in a URL,
request body, browser analytics, or logs. Keep the existing root Expo prototype
and its doctor demo intact while this client is developed independently.

Use the shared [OpenAPI contract](../../packages/api-contract/openapi.yaml) and
[architecture](../../architecture.md) before implementing API calls. This
directory intentionally has no second package manifest yet; choose its web
framework and dependency workflow with the team before adding one.
