# Shared API Contract

`openapi.yaml` is the source of truth for the first transfer-service HTTP
contract. Update it with the backend, patient client, and doctor web owners when
an endpoint or payload changes. The service must return ciphertext only; the
decryption key is exchanged directly between the patient and doctor.
