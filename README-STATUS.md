# Repo status (14 Nov 2026)

## Provenance - what is verbatim and what is reconstructed

The BBTH site (www.bbth.online) is a custom-coded app: plain HTML/CSS/JS
frontend, a Cloudflare Worker backend, and a Cloudflare D1 (SQLite) database.
No WordPress, no framework.

- **Frontend** (`dist/`): the exact production frontend, with the 14 Nov
  save-fix applied (`dist/js/app.js`, sha256 395d9056...). Verbatim as
  deployed.
- **Backend** (`_worker.js`, root and `dist/`): a full RECONSTRUCTION of the
  original backend, including the 14 Nov save-fix (conflict-safe quotation
  saves, duplicate-save protection, quotation activity logging). The original
  backend source was never recovered; this reconstruction is API-compatible
  and passes the local test matrix, but it is NOT the verbatim original.
- **`live-snapshot/`**: the exact bundle deployed to production on 14 Nov
  (statics + a small shim worker that forwards `/api/*` to the pinned
  original backend and intercepts only `POST /api/quotations` with the
  save-fix). Kept for reference and rollback.
- **`schema.sql`**: the D1 schema. No client data, no database dump - this
  repo intentionally contains NO client records, photos or PDFs, and no
  secrets (API tokens, VAPID keys, sessions).

## Current production wiring

Production serves these statics via Cloudflare Pages; `/api/*` goes to the
pinned original backend (25 Oct deployment) through the shim in
`live-snapshot/_worker.js`. The reconstruction in the repo root is the
developable codebase going forward - it already includes everything the shim
adds.

See README.md for architecture and hosting requirements, BUILD-NOTES.md for
build/deploy steps, and TEST-MATRIX.md for the checks run.
