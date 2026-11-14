# BBTH - standalone backend (rewrite, 13 Nov 2026)

One Cloudflare Worker (`_worker.js`) + one Cloudflare D1 database. Serves the
whole BBTH API (`/api/*`), the public share pages (`/s/<token>`), and the
site's static assets. No dependency on any previous backend deployment.

## What your developers need to know

### Architecture
- `_worker.js` - the entire backend: a router (`export default { fetch }`)
  plus one handler per endpoint group. Plain JavaScript, no framework, no
  build step. Cloudflare Workers runtime (V8 isolates, not Node).
- D1 (SQLite) - all persistence. Schema in `schema.sql`. Most feature state
  lives in the `settings` key-value table; documents, users, images,
  catalogues, shares and the activity feed have their own tables.
- Static frontend - any static files deployed with the same Pages project are
  served via `env.ASSETS`. The worker only intercepts `/api/*` and `/s/*`.

### Hosting requirements (honest)
- This runs on **Cloudflare Pages + Workers + D1**. It will NOT run as-is on
  shared/cPanel/PHP hosting (e.g. a plain Hostinger plan) - those cannot run
  Cloudflare Workers or D1. Porting to a Node/hosted-SQL stack means
  translating the Worker API (`fetch` handler, `env.DB` D1 prepared
  statements) to your framework of choice; the handlers are small and
  self-contained to make that practical.
- Cloudflare has a free tier for Pages, Workers and D1, but usage caps
  are real: on 13 Nov 2026 this site's daily Workers request cap was
  exceeded (photo-heavy catalogue pages make one request per photo).
  Monitor usage; a paid Workers plan may be needed as traffic grows.

### Setup (new environment)
1. Create a D1 database: `wrangler d1 create bbth-quote-db`
2. Put its id in `wrangler.toml` (`database_id`).
3. Apply the schema: `wrangler d1 execute bbth-quote-db --file=schema.sql`
4. Seed the required settings rows (see the commented INSERTs at the bottom of
   `schema.sql`): admin password hash, reference serials, site settings.
5. Deploy: `cp _worker.js dist/ && wrangler pages deploy dist`.
   Pages serves `dist/` as static assets and picks up `dist/_worker.js` as
   the advanced-mode Pages Functions worker. Edit the ROOT `_worker.js` as
   the source of truth; the copy in `dist/` is the deploy artifact - always
   re-copy before deploying.

### Authentication
- `POST /api/login` {username, password} -> `{token, username, role}`.
  Tokens are `session_<token>` rows in `settings`, 7-day expiry.
- Admin login = username `admin` + the `admin_pass_hash` settings row.
  Staff logins live in the `users` table (created from the admin panel).
- Every authed endpoint takes `Authorization: Bearer <token>`.

### Read first
`BUILD-NOTES.md` - provenance of every route (recovered verbatim /
reconstructed / rewritten / new), the two-section catalogue picker status,
known assumptions, and what is not yet tested.

### Local development (no Cloudflare account needed)
The whole backend runs locally with the exact commands used for the 13 Nov
test run:
1. `cp _worker.js dist/` (the Pages dev server serves `dist/` + its `_worker.js`)
2. `npx wrangler pages dev dist --d1 DB=local-bbth --port 8788`
3. Seed the local D1 (file under `.wrangler/state/v3/d1/.../*.sqlite`, created
   on first request) with `schema.sql` + the seed INSERTs.
4. Run `python3 smoke.py` for the 53-check route test matrix (local-only
   throwaway seeds; never use them on a production database).
