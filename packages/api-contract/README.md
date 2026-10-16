# Shared API contract

`openapi.yaml` defines opaque JSON blob storage:

- `POST /v1/transfers`: any JSON in, only `{"pin":"A7K2QM"}` out.
- `GET /v1/transfers/{pin}`: original JSON out, without consumption or expiry.

Operational liveness/readiness probes remain separate. Old encrypted transfer
and demo endpoints are removed. Use synthetic data only; this API does not
enforce encryption. Update the contract together with its client consumers.
