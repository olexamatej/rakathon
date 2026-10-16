# Applications

The active patient-facing Expo application currently lives at the repository
root (`App.tsx`, `index.ts`, and `src/`). Its existing entry points and CI
assumptions are kept in place while the team is working on it; do not create a
second patient app here or move the root app without coordinating that migration.

`doctor-web/` is the home for the separate doctor-facing browser client. The
repository layout and data boundaries are described in [`../architecture.md`](../architecture.md).

The old `transfer-demo/` has been removed. Storage now exposes only JSON POST/GET
operations (plus operational probes), not embedded patient/doctor demo pages.
