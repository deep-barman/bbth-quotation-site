# Functional test matrix - local run, 13 Nov 2026

Environment: `wrangler pages dev` (miniflare, fully local - zero Cloudflare
traffic), local D1 seeded from `schema.sql` + throwaway local-only test seeds
(admin login, serials, site_settings - see `smoke.py`; never use these values
on a production database). Script: `smoke.py` (kept in the project for
re-runs). Result: **53/53 PASS**.

| Area | Checks | Result |
|---|---|---|
| login | admin login, wrong password 401, staff login | 3/3 |
| whoami | role + perms introspection | 1/1 |
| settings | GET authed, PUT admin + readback, GET no-auth 401 | 3/3 |
| users | create, dupe reject, staff forbidden from list, admin list, disable blocks login | 5/5 |
| change-password | wrong current 400, change ok, new password logs in | 3/3 |
| refno | GET serials, atomic allocate (BBTH-100 -> next 101) | 2/2 |
| quotations | create, list fields (doc_type/doc_no/template/pdf_bytes), detail, update, soft delete + bin view, restore, hard purge | 8/8 |
| images | create, list, label edit, soft delete + bin, restore, purge | 6/6 |
| draft | PUT/GET per-user, DELETE | 2/2 |
| activity | staff blocked, admin rows (password change logged) | 2/2 |
| share | POST -> /s/<token> URL, public PDF view page | 2/2 |
| catalogue | add service, duplicate -> already, extra lands in site_settings | 3/3 |
| catalogue-history | save, list, delete | 3/3 |
| items-catalogue | draft PUT/GET (public read), photo PUT/GET/DELETE | 3/3 |
| photos-index (new) | lists stored key, excludes tombstoned, restored after untombstone, empty after delete, POST rejected | 5/5 |
| quote-list/view/pdf | list shape, staff view, PDF bytes | 3/3 |
| unknown route | /api/* -> 404 | 1/1 |

Notes:
- Run 1 of the script showed false failures from state carried over between
  runs (password changed, serial consumed). Fresh-database run: 53/53.
- Staff-scoped quotation detail (owner-only) and the shared /api/quote-view
  path both exercised.
- NOT covered here: end-to-end frontend clicks against this backend (needs a
  browser session - do on an isolated test deployment before production use),
  and the 11 assumptions/gaps in BUILD-NOTES.md.
