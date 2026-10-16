# Shared API Contract

`openapi.yaml` is the source of truth for the first transfer-service HTTP
contract. Update it with the backend, patient client, and doctor web owners when
an endpoint or payload changes.

`POST /v1/transfers` stores opaque JSON bytes and returns only a six-character
`pin`. It does not enforce encryption; expiry and retrieval are not implemented
for these blobs yet. Use synthetic data only.

The legacy demo uploads to `POST /v1/encrypted-transfers`. Its redemption response
contains ciphertext only; the decryption key is exchanged directly between the
patient and doctor. Existing legacy redemption and revocation paths are unchanged.
