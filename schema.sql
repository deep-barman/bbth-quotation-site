-- BBTH standalone backend - D1 schema (fresh setup).
-- The existing production database already has these tables; this file is for
-- new environments (staging, a developer's own D1, a future migration).
-- All statements are idempotent (IF NOT EXISTS).

-- Key-value store: site_settings, admin_pass_hash, serials, sessions
-- (session_<token>), catalogue draft (itemsCatalogueDraft), photos
-- (itemsCataloguePhoto:<Category|Item>), client register, staff perms,
-- push subscriptions, per-user drafts (draft_<username>), version histories.
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT
);

-- Staff users (the admin login is NOT here - it is the 'admin_pass_hash'
-- settings row, checked by /api/login).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  full_name TEXT, phone TEXT, email TEXT,
  designation TEXT, joined_on TEXT, notes TEXT
);

-- Quotations + agreements + invoices-as-quotations. pdf is the rendered file.
-- deleted=1 is the recycle bin; DELETE ?hard=1 purges.
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT,
  user TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  pdf BLOB
);

-- Admin activity feed (logins, password changes, settings restores, ...).
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  user TEXT,
  action TEXT,
  detail TEXT
);

-- Reference image library (data-URL images used in quotation forms).
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  data TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  user TEXT
);

-- Saved catalogues (Create Catalogue history, shared across staff logins).
CREATE TABLE IF NOT EXISTS catalogues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT,
  created_at TEXT,
  updated_at TEXT,
  user TEXT
);

-- Public share links for quotations (/s/<token>).
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  id TEXT,
  created_at TEXT
);

-- ---- Seed rows a fresh database needs (edit values before applying) ----
-- Admin password hash: hex SHA-256 of the admin password. Generate with:
--   printf 'your-password' | sha256sum
-- INSERT OR REPLACE INTO settings (k, v) VALUES ('admin_pass_hash', '<hex sha256 of admin password>');
--
-- Reference number serials (q = quotations, a = agreements):
-- INSERT OR REPLACE INTO settings (k, v) VALUES ('serials', '{"q":{"prefix":"BBTH-","next":1,"step":1},"a":{"prefix":"BBTH-A-","next":1,"step":1}}');
--
-- Company settings shown on the public site and document letterheads:
-- INSERT OR REPLACE INTO settings (k, v) VALUES ('site_settings', '{"company":"BBTH","address":"","contact":""}');
