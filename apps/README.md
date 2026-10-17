# Applications

`patient-web/` contains the patient PWA (`/pacient`) and doctor browser UI
(`/lekar`), built with plain HTML, CSS and JavaScript and served by a Node server.
Run `npm start` (or `npm run web:patient`) from the repository root.

`storage-admin/` contains the separate storage administration UI.
`doctor-web/` is a historical placeholder with no application code; doctor UI
changes belong in `patient-web/`.

See [`../architecture.md`](../architecture.md) for data boundaries and services.
