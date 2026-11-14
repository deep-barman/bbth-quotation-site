# BBTH base code - build notes (13 Nov 2026)

## What this is
A single Cloudflare Worker (`_worker.js`) + one D1 database serving every
`/api/*` route the current BBTH frontend calls, plus the public `/s/<token>`
share pages. No dependency on the previous backend deployment. Static assets
are served by the same Pages project (`env.ASSETS`). The frontend in `dist/`
is the current production frontend code plus the two-section catalogue work
described below.

## Provenance labels
- **reconstructed (tested)**: items-catalogue draft/photos/stage/apply,
  client-register + history/restore, changes (staff edit approval), quote-list
  / quote-view / quote-pdf, settings versions/restore, staff-perms,
  notifications, push-sub, whoami. Rebuilt from archived build records of the
  site and verified against the live API contract; previously passed a smoke
  test on an isolated test database. NOT verbatim original code.
- **recovered verbatim original source**: login, users, users/[id], refno,
  settings GET, change-password. Only the Pages-Functions wrapper
  (`onRequestGet(context)` etc.) was rewritten as plain handler functions; the
  logic is unchanged.
- **rewritten (original source unavailable)**: quotations list/detail/save/
  restore/delete, images, draft autosave, public, activity, share +
  /s/<token>, catalogue (service/extra add), catalogue-history. Rebuilt from
  the current frontend call sites and live response shapes observed 13 Nov
  2026.
- **new in this package**: `GET /api/items-catalogue/photos-index` (one-call
  list of stored catalogue photo keys) and the two-section catalogue picker
  described below.

## Two-section catalogue picker (NEW, partially verified)
Per Deep's 13 Nov request: the catalogue create form divides into "Items with
photos" (grid cards) and "Items without photos" (category-wise numbered name
list), and the grid-template PDF prints all photo items first, then the
no-photo names starting on their OWN page with a section header, one running
serial sequence across both. Supporting changes:
- `dist/app/items/items.js` (picker split + PDF stream order + page break),
  `dist/app/items/items.css` (name-list + section styles),
  `dist/app/items/store.js` (`loadPhotoIndex` / `photoSplitHint`),
  `dist/js/pdf.js` (pageBreak stream markers; inert for all other callers),
  `_worker.js` (`/api/items-catalogue/photos-index`, excludes photos the draft
  record marks deleted or hidden).
Status: the FORM split is implemented and pixel-verified locally (headless
browser screenshot against the local dev server). The PDF two-section output
(grid template) is NOW pixel-verified locally too (13 Nov 2026, ~19:15 IST):
verification first exposed a real defect - the grid PDF crashed whenever a
no-photo item was selected (the pageBreak stream marker reached the row
renderer, which read ._n of undefined; fixed with a one-line marker guard in
dist/app/items/items.js rowHtml). After the fix, an actual PDF was generated
in a headless browser against a local copy of the full 450-item production
catalogue: page 1 shows the photo cards with their real photos, the no-photo
names start on their own following page, and serial numbers run continuously
across both sections.
The photos-index endpoint only removes per-item photo-PRESENCE probe requests;
photo images themselves still load one request per photo as before.
On a backend without photos-index the picker falls back to the previous
marker/probe behavior, so this frontend also works against the current live
backend.

## Known gaps / assumptions (verify before production use)
1. quotations list `doc_no`/`template` come from `data.docNo` / `data.template`
   JSON paths (frontend field names confirmed; JSON paths inferred from the
   detail payload shape).
2. Protected record 900004: PUT/PATCH/DELETE refused (403). The frontend never
   offers it for editing; exact original protection semantics unknown.
3. Image mutations restricted to admin: only the admin panel mutates the image
   library in the observed frontend. GET is open to any session (form picker).
4. Share pages: `/s/<token>` serves a minimal HTML page embedding the PDF.
   Original page markup is unrecovered.
5. Login rows in the activity feed: the live backend logs logins; the exact
   action/detail strings are unrecovered, so the recovered login handler does
   not write them.
6. Login sessions are `session_<token>` settings rows with 7-day expiry.
   Password change signs out other sessions (recovered handler).
7. `invoices` endpoints existed in an old version but the current frontend
   never calls them; omitted intentionally.
8. catalogue-history GET on the current live backend returns the SPA HTML
   (broken upstream); this package implements the intended JSON contract the
   frontend expects.
9. Hostname gate retained from the reconstructed routes: `/app/layout` stays
   staging-only; the catalogue store routes are served on any host (adjust
   the gate when the production hostname changes).
10. RESOLVED 13 Nov 2026: the two-section catalogue PDF output (grid
    template) is pixel-verified locally - see Status above. The other PDF
    templates (classic table, compact list, tick sheet) were not re-exercised
    in that session.
11. PARTIALLY RESOLVED 13 Nov 2026: a headless browser session drove the
    real picker UI against this backend on a local copy of the production
    database - catalogue render (450 items), item selection, and the grid
    PDF download all exercised through actual DOM clicks, with the generated
    PDF pixel-checked. Not covered: the classic/list/tick PDF templates,
    the admin write flows through the UI, and any real mobile device.

## Testing status
- FULL local test run 13 Nov 2026: 53/53 PASS (see TEST-MATRIX.md) on
  `wrangler pages dev` + local D1 with schema.sql + throwaway local seeds.
  Zero Cloudflare traffic used. smoke.py is a local test script; its seeds and
  credentials are local-only test values, never for production.
- The reconstructed portion additionally passed an earlier smoke test on an
  isolated test database.
