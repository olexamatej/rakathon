# Local transfer demo

This is a small browser prototype for the patient-to-doctor transfer. The Rust
service embeds and serves these files from the same origin:

- `http://127.0.0.1:3000/demo/patient` — load or paste a medication-list JSON
  document, encrypt it with AES-256-GCM in Web Crypto, and upload only the
  encrypted envelope.
- `http://127.0.0.1:3000/demo/doctor` — enter the one-time retrieval PIN and the
  decryption key supplied separately by the patient. The browser fetches the
  ciphertext and decrypts it locally.

## Run it

This legacy encrypted demo uploads to `/v1/encrypted-transfers`; it does not use
the new opaque-JSON `/v1/transfers` endpoint or its six-character PINs.

From the repository root, set a local-only HMAC secret and start the Rust API:

```sh
export TRANSFER_HMAC_SECRET="$(openssl rand -hex 32)"
cargo run --manifest-path services/transfer-api/Cargo.toml
```

Open the patient and doctor URLs above in separate tabs or browser profiles.
The patient must pass the PIN and decryption key through separate channels. The
PIN retrieves ciphertext; it is not the encryption key. Keep the doctor page
open if a request needs retrying, because its idempotency key remains in memory
for that tab only.

The local server listens only on `127.0.0.1:3000` by default and stores state in
the Git-ignored SQLite database at
`services/transfer-api/data/transfers.sqlite3`. Use synthetic data only. This
prototype accepts JSON, not medicine photos, and does not include OCR or
production hosting. Do not expose the port publicly or use real patient data.

Expected JSON shape:

```json
{
  "medications": [
    {
      "name": "Example medicine",
      "strength": "500 mg",
      "dose": "1 tablet",
      "schedule": "morning"
    }
  ]
}
```
