// BBTH standalone backend - single Cloudflare Worker + D1, no upstream proxy.
// Assembled 13 Nov 2026 from: reconstructed routes (tested on an isolated
// test database) + recovered verbatim handlers + rewritten endpoints
// (see BUILD-NOTES.md).
const CAT_KEY = 'itemsCatalogueDraft';
const PHOTO_PREFIX = 'itemsCataloguePhoto:';
const MAX_BYTES = 900 * 1024;      // draft JSON cap
const MAX_PHOTO_B64 = 600 * 1024;  // one photo as data-URL cap

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// Authoritative session lookup: login sessions live in this same D1 as
// 'session_<token>' rows with a server-stamped role written at login time.
// Role is read from the stored session record, never from the request.
async function sessionIdentity(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const tok = auth.slice(7).trim();
  if (!/^[A-Za-z0-9-]{20,120}$/.test(tok)) return null;
  try {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('session_' + tok).first();
    if (!row) return null;
    const s = JSON.parse(row.v);
    if (s.exp && Date.now() > s.exp) return null;
    return { user: typeof s.u === 'string' ? s.u : '', role: typeof s.role === 'string' ? s.role : '' };
  } catch (e) { return null; }
}

async function authedAdmin(request, env) {
  const s = await sessionIdentity(request, env);
  return !!(s && s.role === 'admin');
}

// Per-staff feature permissions (admin-granted modules). Stored in one isolated
// settings key; '*' means all current feature permissions (never the admin role).
const PERMS_KEY = 'staffPermsV1';
const KNOWN_PERMS = ['register', 'catalogue'];
async function permsFor(env, user) {
  try {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(PERMS_KEY).first();
    if (!row) return [];
    const map = JSON.parse(row.v) || {};
    const p = map[user];
    return Array.isArray(p) ? p.filter(x => typeof x === 'string') : [];
  } catch (e) { return []; }
}
function hasPerm(idn, perms, name) {
  if (!idn) return false;
  if (idn.role === 'admin') return true;
  if (idn.role !== 'staff') return false;
  return perms.includes('*') || perms.includes(name);
}
const NOTIF_KEY = 'notifStateV1';
function regDatesParse(s) {
  const out = [];
  const re = /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/g; let m;
  while ((m = re.exec(s || ''))) out.push({ y: +m[3], mo: +m[2], d: +m[1] });
  const lead = /^(\d{1,2})\s*-\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.exec((s || '').trim());
  if (lead && out.length) out.push({ y: out[0].y, mo: out[0].mo, d: +lead[1] });
  return out;
}
async function handleNotifications(request, env) {
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const stRow = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(NOTIF_KEY).first();
  let st = {}; try { st = stRow ? (JSON.parse(stRow.v) || {}) : {}; } catch (e) { st = {}; }
  const mine = Array.isArray(st[s.user]) ? st[s.user] : [];
  if (request.method === 'PUT') {
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const ids = Array.isArray(body && body.dismissed) ? body.dismissed.map(x => String(x).slice(0, 80)).slice(0, 500) : [];
    st[s.user] = [...new Set(mine.concat(ids))].slice(-1000);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(NOTIF_KEY, JSON.stringify(st)).run();
    return json({ ok: true });
  }
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  const events = [];
  const perms = s.role === 'admin' ? ['*'] : await permsFor(env, s.user);
  const nowIst = new Date(Date.now() + 5.5 * 3600e3);
  const dkey = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const todayK = dkey(nowIst), tomorrowK = dkey(new Date(nowIst.getTime() + 864e5));
  if (s.role === 'admin' || perms.includes('*') || perms.includes('register')) {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(REG_KEY).first();
    let rows = []; try { rows = row ? ((JSON.parse(row.v) || {}).rows || []) : []; } catch (e) {}
    for (const r of rows) {
      for (const dt of regDatesParse(r.eventDates || '')) {
        const k = dt.y * 10000 + dt.mo * 100 + dt.d;
        if (k !== todayK && k !== tomorrowK) continue;
        events.push({ id: 'evt-' + r.id + '-' + k, kind: 'event',
          text: (k === todayK ? 'Today' : 'Tomorrow') + ': ' + (r.name || 'Client') + (r.eventType ? ' - ' + r.eventType : '') + (r.venue ? ' at ' + r.venue : '') + (r.phone ? ' (' + r.phone + ')' : ''),
          at: dt.y + '-' + String(dt.mo).padStart(2, '0') + '-' + String(dt.d).padStart(2, '0') });
      }
    }
  }
  const chRow = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CHG_KEY).first();
  let chg = []; try { chg = chRow ? ((JSON.parse(chRow.v) || {}).rows || []) : []; } catch (e) {}
  if (s.role === 'admin') {
    for (const c of chg.filter(x => x.status === 'pending'))
      events.push({ id: 'chg-' + c.id, kind: 'approval', text: (c.by || 'Staff') + ' requested ' + c.type + ': ' + String(c.summary || '').slice(0, 120), at: c.createdAt || '' });
    const stages = await env.DB.prepare('SELECT k FROM settings WHERE k LIKE ?').bind(CAT_STAGE_PREFIX + '%').all();
    for (const r2 of (stages.results || [])) {
      const u = String(r2.k).slice(CAT_STAGE_PREFIX.length);
      events.push({ id: 'stage-' + u, kind: 'approval', text: u + ' submitted catalogue edits for approval', at: '' });
    }
  } else {
    for (const c of chg.filter(x => x.by === s.user && (x.status === 'approved' || x.status === 'rejected')))
      events.push({ id: 'chgd-' + c.id, kind: 'decision', text: 'Your ' + c.type + ' request was ' + c.status + (c.summary ? ': ' + String(c.summary).slice(0, 100) : ''), at: c.createdAt || '' });
  }
  events.sort((a, b) => (a.kind === 'event' ? 0 : 1) - (b.kind === 'event' ? 0 : 1));
  const out = events.slice(0, 30).map(e => ({ ...e, read: mine.includes(e.id) }));
  return json({ events: out, unread: out.filter(e => !e.read).length });
}
async function handleStaffPerms(request, env) {
  if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(PERMS_KEY).first();
    let map = {};
    try { map = row ? (JSON.parse(row.v) || {}) : {}; } catch (e) { map = {}; }
    return json({ perms: map });
  }
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const user = String(body && body.user || '').trim();
    if (!user || user.length > 60) return json({ error: 'bad user' }, 400);
    const list = Array.isArray(body && body.perms) ? body.perms.filter(p => KNOWN_PERMS.includes(p) || p === '*') : [];
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(PERMS_KEY).first();
    let map = {};
    try { map = row ? (JSON.parse(row.v) || {}) : {}; } catch (e) { map = {}; }
    if (body && body.perms === null) delete map[user];
    else map[user] = [...new Set(list)];
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(PERMS_KEY, JSON.stringify(map)).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

const REG_KEY = 'clientRegisterV1';
const REG_MAX_BYTES = 500 * 1024;


// Staff-visible quotation/agreement list (Deep, 25 Oct): any logged-in staff
// may SEE the list; metadata only - no PDF blobs, no full record data.
// Staged catalogue edits: a granted staff member edits freely, but their
// changes go to a private staging area and go live ONLY when the admin applies
// them. The canonical draft/photos stay admin-only (Deep 25 Oct 17:34 rule).
const CAT_STAGE_PREFIX = 'catStage_';
const CAT_PHOTO_STAGE_PREFIX = 'catPhotoStage_';
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function catList(d) { return (((d && d.data && d.data.categories) || (d && d.categories)) || []); }
function itN(it) { return it.n != null ? it.n : it.name; }
// Full review diff: renames (index-aligned in-place edits), moves across
// categories, reorders, and photo add/replace/hide changes.
function diffCatalogue(liveDraft, stagedDraft) {
  const A = catList(liveDraft), B = catList(stagedDraft);
  const aNames = A.map(c => c.name), bNames = B.map(c => c.name);
  const aSet = new Set(aNames), bSet = new Set(bNames);
  const catRename = new Map();
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const an = A[i] && A[i].name, bn = B[i] && B[i].name;
    if (an && bn && an !== bn && !bSet.has(an) && !aSet.has(bn)) catRename.set(an, bn);
  }
  const catsRenamed = [...catRename].map(([from, to]) => ({ from, to }));
  const catsAdded = bNames.filter(n => !aSet.has(n));
  const catsRemoved = aNames.filter(n => !bSet.has(n) && !catRename.has(n));
  const bByName = new Map(B.map(c => [c.name, c]));
  const itemsAdded = [], itemsRemoved = [], itemsRenamed = [], itemsMoved = [], itemsReordered = [];
  for (const ac of A) {
    const bc = bByName.get(catRename.get(ac.name) || ac.name);
    if (!bc) continue;
    const aItems = (ac.items || []).map(itN), bItems = (bc.items || []).map(itN);
    const aiSet = new Set(aItems), biSet = new Set(bItems);
    const renamedHere = new Set();
    for (let i = 0; i < Math.max(aItems.length, bItems.length); i++) {
      const an = aItems[i], bn = bItems[i];
      if (an && bn && an !== bn && !biSet.has(an) && !aiSet.has(bn)) {
        itemsRenamed.push({ cat: bc.name, from: an, to: bn });
        renamedHere.add(an); renamedHere.add(bn);
      }
    }
    const removed = aItems.filter(n => !biSet.has(n) && !renamedHere.has(n));
    const added = bItems.filter(n => !aiSet.has(n) && !renamedHere.has(n));
    for (const r of removed) {
      const other = B.find(c => c.name !== bc.name && (c.items || []).some(it => itN(it) === r));
      if (other) itemsMoved.push({ item: r, from: ac.name, to: other.name });
      else itemsRemoved.push(ac.name + '|' + r);
    }
    for (const a of added) {
      const wasMovedOut = A.some(c => c.name !== ac.name && (c.items || []).some(it => itN(it) === a));
      if (!wasMovedOut) itemsAdded.push(bc.name + '|' + a);
    }
    const common = aItems.filter(n => biSet.has(n));
    const inB = bItems.filter(n => aiSet.has(n));
    if (common.length > 1 && common.join('') !== inB.join('')) itemsReordered.push(bc.name);
  }
  for (const bc of B) {
    if (aSet.has(bc.name) || [...catRename.values()].includes(bc.name)) continue;
  }
  const aCommon = aNames.map(n => catRename.get(n) || n).filter(n => bSet.has(n));
  const bCommon = bNames.filter(n => aCommon.includes(n));
  const catsReordered = aCommon.length > 1 && aCommon.join('') !== bCommon.join('');
  // hidden-photo tombstones live on the draft record
  const aHidden = new Set((liveDraft && liveDraft.hidden) || []);
  const bHidden = new Set((stagedDraft && stagedDraft.hidden) || []);
  return {
    catsAdded, catsRemoved, catsRenamed, catsReordered,
    itemsAdded, itemsRemoved, itemsRenamed, itemsMoved, itemsReordered,
    photosHidden: [...bHidden].filter(k => !aHidden.has(k)),
    photosUnhidden: [...aHidden].filter(k => !bHidden.has(k))
  };
}
async function photoStateHash(env) {
  const rows = await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ? ORDER BY k').bind(PHOTO_PREFIX + '%').all();
  const parts = [];
  for (const r of (rows.results || [])) parts.push(r.k + '=' + await sha256hex(String(r.v)));
  return sha256hex(parts.join(';'));
}
function unwrapStage(parsed) {
  if (parsed && typeof parsed === 'object' && parsed.rec !== undefined && parsed.meta) return parsed;
  return { meta: null, rec: parsed };
}
function stageUserOk(idn, perms) {
  return !!(idn && (idn.role === 'admin' || (idn.role === 'staff' && (perms.includes('*') || perms.includes('catalogue')))));
}
async function handleCatStage(request, env, url) {
  const s = await sessionIdentity(request, env);
  if (!s || !stageUserOk(s, await permsFor(env, s.user))) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'PUT') {
    const body = await request.text();
    if (!body || body.length > MAX_BYTES) return json({ error: 'too large or empty' }, 413);
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { return json({ error: 'invalid json' }, 400); }
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.categories)) return json({ error: 'bad shape' }, 400);
    const live = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_KEY).first();
    const baseHash = await sha256hex(live ? live.v : 'null');
    const photoHash = await photoStateHash(env);
    const wrapped = JSON.stringify({ meta: { by: s.user, at: new Date().toISOString(), baseHash, photoHash }, rec: parsed });
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(CAT_STAGE_PREFIX + s.user, wrapped).run();
    await chgLog(env, s.user, 'cat-stage-submit', 'staged catalogue draft by ' + s.user + ' (' + body.length + ' bytes)');
    return json({ ok: true, bytes: body.length });
  }
  if (request.method === 'GET') {
    if (s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
    const user = (url.searchParams.get('user') || '').trim();
    if (user) {
      const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_STAGE_PREFIX + user).first();
      if (!row) return json({ draft: null });
      const { meta, rec } = unwrapStage(JSON.parse(row.v));
      const live = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_KEY).first();
      const liveDraft = live ? JSON.parse(live.v) : null;
      const curHash = await sha256hex(live ? live.v : 'null');
      const curPhotoHash = await photoStateHash(env);
      const ph = await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ?').bind(CAT_PHOTO_STAGE_PREFIX + user + '|%').all();
      const d = diffCatalogue(liveDraft, rec);
      const livePhotoRows = await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ?').bind(PHOTO_PREFIX + '%').all();
      const livePhotoHashByKey = new Map();
      for (const r of (livePhotoRows.results || [])) livePhotoHashByKey.set(r.k, await sha256hex(String(r.v)));
      const stagedPhotos = [];
      for (const r of (ph.results || [])) {
        const itemKey = String(r.k).slice((CAT_PHOTO_STAGE_PREFIX + user + '|').length);
        const liveHash = livePhotoHashByKey.get(PHOTO_PREFIX + itemKey);
        const stagedHash = await sha256hex(String(r.v));
        stagedPhotos.push({ k: itemKey, data: r.v, status: !liveHash ? 'new' : (liveHash === stagedHash ? 'unchanged' : 'replaces-live') });
      }
      d.photos = stagedPhotos.length;
      d.liveIsFixture = !liveDraft;
      const draftStale = !!(meta && meta.baseHash && meta.baseHash !== curHash);
      const photosStale = !!(meta && meta.photoHash && meta.photoHash !== curPhotoHash);
      return json({ draft: rec, meta, stale: draftStale || photosStale, staleDraft: draftStale, stalePhotos: photosStale, diff: d, stagedPhotos });
    }
    const r = await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ?').bind(CAT_STAGE_PREFIX + '%').all();
    return json({ pending: (r.results || []).map(x => {
      let meta = null;
      try { meta = unwrapStage(JSON.parse(x.v)).meta; } catch (e) {}
      return { user: String(x.k).slice(CAT_STAGE_PREFIX.length), meta };
    }) });
  }
  if (request.method === 'DELETE') {
    const user = (url.searchParams.get('user') || '').trim();
    if (!user || user.length > 60) return json({ error: 'bad user' }, 400);
    if (s.role !== 'admin' && s.user !== user) return json({ error: 'unauthorized' }, 401);
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(CAT_STAGE_PREFIX + user).run();
    await env.DB.prepare('DELETE FROM settings WHERE k LIKE ?').bind(CAT_PHOTO_STAGE_PREFIX + user + '|%').run();
    await chgLog(env, s.user, s.user === user ? 'cat-stage-withdraw' : 'cat-stage-discard', 'staged catalogue draft of ' + user + (s.user === user ? ' withdrawn by owner' : ' discarded by admin ' + s.user));
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}
async function handleCatStagePhoto(request, env, url) {
  const s = await sessionIdentity(request, env);
  if (!s || !stageUserOk(s, await permsFor(env, s.user))) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'PUT') {
    let parsed;
    try { parsed = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const k = (url.searchParams.get('k') || (parsed && parsed.k) || '');
    if (!validKey(k)) return json({ error: 'bad key' }, 400);
    const data = parsed && parsed.data;
    if (typeof data !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(data) || data.length > MAX_PHOTO_B64)
      return json({ error: 'bad photo' }, 400);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(CAT_PHOTO_STAGE_PREFIX + s.user + '|' + k, data).run();
    return json({ ok: true, bytes: data.length });
  }
  if (request.method === 'DELETE') {
    const k = (url.searchParams.get('k') || '').trim();
    if (!validKey(k)) return json({ error: 'bad key' }, 400);
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(CAT_PHOTO_STAGE_PREFIX + s.user + '|' + k).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}
async function s0user(env, request) {
  const s = await sessionIdentity(request, env);
  return s ? s.user : 'admin';
}
async function handleCatApply(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
  const user = String(body && body.user || '').trim();
  if (!user || user.length > 60) return json({ error: 'bad user' }, 400);
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_STAGE_PREFIX + user).first();
  if (!row) return json({ error: 'no staged draft' }, 404);
  const { meta, rec } = unwrapStage(JSON.parse(row.v));
  const live = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_KEY).first();
  const curHash = await sha256hex(live ? live.v : 'null');
  if (meta && meta.baseHash && meta.baseHash !== curHash)
    return json({ error: 'stale', message: 'The live catalogue changed after ' + user + ' submitted this edit. Discard it and ask them to redo it against the current catalogue.' }, 409);
  const curPhotoHash = await photoStateHash(env);
  if (meta && meta.photoHash && meta.photoHash !== curPhotoHash)
    return json({ error: 'stale', message: 'Live catalogue photos changed after ' + user + ' submitted this edit. Discard it and ask them to redo it against the current photos.' }, 409);
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(CAT_KEY, JSON.stringify(rec)).run();
  const photos = await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ?').bind(CAT_PHOTO_STAGE_PREFIX + user + '|%').all();
  let moved = 0;
  for (const ph of (photos.results || [])) {
    const itemKey = String(ph.k).slice((CAT_PHOTO_STAGE_PREFIX + user + '|').length);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(PHOTO_PREFIX + itemKey, ph.v).run();
    moved++;
  }
  await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(CAT_STAGE_PREFIX + user).run();
  await env.DB.prepare('DELETE FROM settings WHERE k LIKE ?').bind(CAT_PHOTO_STAGE_PREFIX + user + '|%').run();
  await chgLog(env, await s0user(env, request), 'cat-stage-apply', 'admin applied staged catalogue draft of ' + user + ' (' + moved + ' photos)');
  return json({ ok: true, photosApplied: moved });
}

async function handleQuoteList(request, env) {
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  try {
    const r = await env.DB.prepare(
      "SELECT id, client, created_at, updated_at, user, (pdf IS NOT NULL) AS hasPdf, json_extract(data, '$.docType') AS docType FROM quotations WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 500"
    ).all();
    const rows = (r.results || []).map(q => ({
      id: q.id, client: q.client || '', createdAt: q.created_at || '', updatedAt: q.updated_at || '',
      by: q.user || '', docType: q.docType === 'agreement' ? 'agreement' : 'quotation', hasPdf: !!q.hasPdf
    }));
    return json({ rows, viewer: { user: s.user, role: s.role } });
  } catch (e) { return json({ error: 'server error' }, 500); }
}

// Post-save version recovery (Deep 25 Oct 18:23: "save ke baad purani version
// wapas laane ka option"): snapshot-before-overwrite into isolated keys; restore
// is a normal new write which itself snapshots first, so no one's later writes
// are ever destroyed. Caps bound storage.
const REG_HIST_KEY = 'registerHistoryV1';
const SETTINGS_HIST_KEY = 'settingsVersionsV1';
const HIST_CAP = 25;
async function versionSnap(env, key, prevValue, user){
  if(prevValue == null) return; // nothing to recover before the first save
  let hist = { versions: [] };
  try {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
    if(row) hist = JSON.parse(row.v);
  } catch(e) {}
  if(!Array.isArray(hist.versions)) hist.versions = [];
  hist.versions.push({ at: new Date().toISOString(), by: user || '', v: prevValue });
  if(hist.versions.length > HIST_CAP) hist.versions = hist.versions.slice(-HIST_CAP);
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(key, JSON.stringify(hist)).run();
}
async function handleHistory(request, env, key, needPerm){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if(needPerm === 'admin' && s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  if(needPerm && needPerm !== 'admin' && !hasPerm(s, await permsFor(env, s.user), needPerm)) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  let hist = { versions: [] };
  try { if(row) hist = JSON.parse(row.v); } catch(e) {}
  const versions = (Array.isArray(hist.versions) ? hist.versions : []).map((x, i) => ({ i, at: x.at, by: x.by, bytes: String(x.v || '').length }));
  return json({ versions: versions.reverse() });
}
async function handleHistoryGet(request, env, key, needPerm, url){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if(needPerm === 'admin' && s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  if(needPerm && needPerm !== 'admin' && !hasPerm(s, await permsFor(env, s.user), needPerm)) return json({ error: 'unauthorized' }, 401);
  const idx = parseInt(url.searchParams.get('i') || '-1', 10);
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  let hist = { versions: [] };
  try { if(row) hist = JSON.parse(row.v); } catch(e) {}
  const v = (hist.versions || [])[idx];
  if(!v) return json({ error: 'no such version' }, 404);
  return json({ at: v.at, by: v.by, value: JSON.parse(v.v) });
}

// Server-side restore with atomic stale-base rejection (parent 25 Oct 19:55):
// the client sends the live value it reviewed ("base"); the worker refuses the
// restore if the live value no longer matches - a save landing while the
// confirm dialog is open can never be silently rolled back.
function canonJson(t){
  // Canonical form so re-serialization whitespace never trips the base compare.
  try { return JSON.stringify(JSON.parse(t)); } catch(e) { return null; }
}
async function histValueAt(env, key, idx){
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  let hist = { versions: [] };
  try { if(row) hist = JSON.parse(row.v); } catch(e) {}
  const v = (hist.versions || [])[idx];
  return v || null;
}
async function handleRegisterRestore(request, env){
  const s = await sessionIdentity(request, env);
  if(!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch(e) { return json({ error: 'invalid json' }, 400); }
  const idx = parseInt(body && body.i, 10);
  const base = body && typeof body.base === 'string' ? body.base : null;
  if(base === null) return json({ error: 'base required' }, 400);
  const v = await histValueAt(env, REG_HIST_KEY, idx);
  if(!v) return json({ error: 'no such version' }, 404);
  // Atomic compare-and-swap: only replaces the live register if it still equals
  // the reviewed base. SQLite serializes writers, so no save can slip between
  // the compare and the write. The raw current value (matched byte-for-byte by
  // the WHERE) is what gets snapshotted.
  const canon = canonJson(base);
  if(canon === null) return json({ error: 'base invalid' }, 400);
  const curRow = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(REG_KEY).first();
  const curTxt = curRow ? curRow.v : '';
  if(canonJson(curTxt) !== canon){
    return json({ error: 'stale', message: 'Register changed since you reviewed it - re-open the list and review before restoring.' }, 409);
  }
  const r = await env.DB.prepare('UPDATE settings SET v = ? WHERE k = ? AND v = ?')
    .bind(v.v, REG_KEY, curTxt).run();
  if(!r.meta || !r.meta.changes){
    return json({ error: 'stale', message: 'Register changed since you reviewed it - re-open the list and review before restoring.' }, 409);
  }
  // The replaced value is exactly curTxt (CAS-guaranteed) - snapshot it so the
  // pre-restore state stays recoverable. No one's write is destroyed.
  await versionSnap(env, REG_HIST_KEY, curTxt, s.user);
  chgLog(env, s.user, 'register-restore', 'restored register version from ' + v.at);
  return json({ ok: true, value: JSON.parse(v.v) });
}

// Settings live upstream (no conditional write there), so all worker-funneled
// settings writes (normal saves AND restores) serialize through a D1 mutex;
// the restore additionally compares the fetched live value to the base while
// holding the lock. Only www.bbth.online (this worker) writes settings.
const SETTINGS_LOCK_KEY = 'settingsWriteLockV1';
async function settingsLock(env, token){
  const exp = new Date(Date.now() + 15000).toISOString();
  try {
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').bind(SETTINGS_LOCK_KEY, JSON.stringify({ token, exp })).run();
    return true;
  } catch(e) { /* row exists */ }
  const now = new Date().toISOString();
  const r = await env.DB.prepare("UPDATE settings SET v = ? WHERE k = ? AND json_extract(v, '$.exp') < ?")
    .bind(JSON.stringify({ token, exp }), SETTINGS_LOCK_KEY, now).run();
  return !!(r.meta && r.meta.changes);
}
async function settingsUnlock(env, token){
  try { await env.DB.prepare("DELETE FROM settings WHERE k = ? AND json_extract(v, '$.token') = ?").bind(SETTINGS_LOCK_KEY, token).run(); } catch(e) {}
}
async function handleSettingsRestore(request, env){
  const s = await sessionIdentity(request, env);
  if(!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch(e) { return json({ error: 'invalid json' }, 400); }
  const idx = parseInt(body && body.i, 10);
  const base = body && typeof body.base === 'string' ? body.base : null;
  if(base === null) return json({ error: 'base required' }, 400);
  const v = await histValueAt(env, SETTINGS_HIST_KEY, idx);
  if(!v) return json({ error: 'no such version' }, 404);
  const token = crypto.randomUUID();
  if(!(await settingsLock(env, token))) return json({ error: 'busy', message: 'Another settings save is in progress - try again.' }, 409);
  try {
    const curRow = await env.DB.prepare("SELECT v FROM settings WHERE k = 'site_settings'").first();
    const curTxt = curRow ? curRow.v : '{}';
    const canon = canonJson(base);
    if(canon === null) return json({ error: 'base invalid' }, 400);
    if(canonJson(curTxt) !== canon) return json({ error: 'stale', message: 'Settings changed since you reviewed them - re-open the list and review before restoring.' }, 409);
    await versionSnap(env, SETTINGS_HIST_KEY, curTxt, s.user);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('site_settings', v.v).run();
    chgLog(env, s.user, 'settings-restore', 'restored settings version from ' + v.at);
    return json({ ok: true, value: JSON.parse(v.v) });
  } finally {
    await settingsUnlock(env, token);
  }
}

const CHG_KEY = 'pendingChangesV1';

async function chgLog(env, user, action, detail) {
  // Activity audit: same table the upstream API writes logins to.
  try {
    await env.DB.prepare('INSERT INTO activity (ts, user, action, detail) VALUES (?, ?, ?, ?)')
      .bind(new Date().toISOString(), user || '', action, String(detail || '').slice(0, 500)).run();
  } catch (e) {}
}

async function handleChanges(request, env, url) {
  // Approval-gated staff edits: staff submit change requests; admin reviews,
  // approves (applies to source) or rejects. Nothing is applied before approval.
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const isAdmin = s.role === 'admin';
  const readRows = async () => {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CHG_KEY).first();
    try { return row ? (JSON.parse(row.v).rows || []) : []; } catch (e) { return []; }
  };
  const writeRows = rows => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(CHG_KEY, JSON.stringify({ rows: rows.slice(-500) })).run();

  if (request.method === 'GET') {
    if (!isAdmin) return json({ error: 'unauthorized' }, 401);
    const rows = await readRows();
    return json({ rows: rows.slice().reverse() });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const kind = String(body && body.type || '');
    if (!['quotation-edit', 'catalogue', 'texts', 'suggestion'].includes(kind)) return json({ error: 'bad type' }, 400);
    const payloadSize = JSON.stringify(body.payload || {}).length;
    if (payloadSize > 900 * 1024) return json({ error: 'too large' }, 413);
    const rows = await readRows();
    const chg = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: kind,
      targetId: body.targetId != null ? String(body.targetId).slice(0, 40) : null,
      summary: String(body.summary || '').slice(0, 300),
      payload: body.payload,
      by: s.user || 'unknown',
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    rows.push(chg);
    await writeRows(rows);
    await chgLog(env, s.user, 'change-request', kind + ' ' + (chg.summary || chg.id));
    return json({ ok: true, id: chg.id });
  }
  return json({ error: 'method' }, 405);
}

async function handleChangeDecision(request, env, url, approve) {
  const s = await sessionIdentity(request, env);
  if (!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id') || '';
  const row0 = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CHG_KEY).first();
  let rows = [];
  try { rows = row0 ? (JSON.parse(row0.v).rows || []) : []; } catch (e) { rows = []; }
  const chg = rows.find(r => r.id === id);
  if (!chg) return json({ error: 'not found' }, 404);
  if (chg.status !== 'pending') return json({ error: 'already ' + chg.status }, 409);
  if (!approve) {
    chg.status = 'rejected'; chg.decidedBy = s.user; chg.decidedAt = new Date().toISOString();
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(CHG_KEY, JSON.stringify({ rows })).run();
    await chgLog(env, s.user, 'change-rejected', chg.type + ' ' + (chg.summary || chg.id) + ' (by ' + chg.by + ')');
    return json({ ok: true, status: 'rejected' });
  }
  // apply to source
  try {
    if (chg.type === 'catalogue') {
      if (!chg.payload || !chg.payload.data || !Array.isArray(chg.payload.data.categories)) return json({ error: 'bad payload' }, 400);
      await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
        .bind(CAT_KEY, JSON.stringify(chg.payload)).run();
    } else if (chg.type === 'texts') {
      const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('site_settings').first();
      let cur = {};
      try { cur = row ? JSON.parse(row.v) : {}; } catch (e) { cur = {}; }
      cur.texts = chg.payload && chg.payload.texts ? chg.payload.texts : cur.texts;
      await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
        .bind('site_settings', JSON.stringify(cur)).run();
    } else if (chg.type === 'quotation-edit') {
      const qid = parseInt(chg.targetId || '', 10);
      if (!qid || !chg.payload || !chg.payload.data) return json({ error: 'bad payload' }, 400);
      const data = JSON.stringify(chg.payload.data);
      if (chg.payload.pdf && typeof chg.payload.pdf === 'string') {
        await env.DB.prepare("UPDATE quotations SET client = ?, data = ?, pdf = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(String(chg.payload.client || ''), data, chg.payload.pdf, qid).run();
      } else {
        await env.DB.prepare("UPDATE quotations SET client = ?, data = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(String(chg.payload.client || ''), data, qid).run();
      }
    } else {
      // suggestions carry no source mutation
    }
  } catch (e) { return json({ error: 'apply failed' }, 500); }
  chg.status = 'approved'; chg.decidedBy = s.user; chg.decidedAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(CHG_KEY, JSON.stringify({ rows })).run();
  await chgLog(env, s.user, 'change-approved', chg.type + ' ' + (chg.summary || chg.id) + ' (by ' + chg.by + ')');
  return json({ ok: true, status: 'approved' });
}

async function handleQuoteView(request, env, url) {
  // Staff may OPEN any quotation/agreement to view or to make an agreement from it
  // (Deep, 25 Oct). Returns record data only - never the PDF blob.
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const id = parseInt(url.searchParams.get('id') || '0', 10);
  if (!id) return json({ error: 'bad id' }, 400);
  try {
    const q = await env.DB.prepare('SELECT id, client, created_at, updated_at, user, data FROM quotations WHERE id = ? AND deleted = 0').bind(id).first();
    if (!q) return json({ error: 'not found' }, 404);
    let data = null;
    try { data = JSON.parse(q.data); } catch (e) { data = null; }
    return json({ id: q.id, client: q.client || '', created_at: q.created_at, updated_at: q.updated_at, user: q.user || '', data });
  } catch (e) { return json({ error: 'server error' }, 500); }
}

async function handleQuotePdf(request, env, url) {
  // Stored PDF bytes for the native in-app share path (no public link exists
  // inside the BBTH app). Authorization is IDENTICAL to the existing record
  // view (handleQuoteView, Deep 25 Oct): any logged-in user - admin or staff -
  // may open any non-deleted record; there is no owner narrowing and no
  // per-module gate on viewing. Read-only: bytes out, never a mutation.
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const id = parseInt(url.searchParams.get('id') || '0', 10);
  if (!id) return json({ error: 'bad id' }, 400);
  try {
    // hex() in SQL sidesteps BLOB serialization differences between D1 runtimes
    // (prod ArrayBuffer vs dev string/object) - the hex text always survives.
    const q = await env.DB.prepare('SELECT id, hex(pdf) AS pdfhex FROM quotations WHERE id = ? AND deleted = 0').bind(id).first();
    if (!q || !q.pdfhex) return json({ error: 'not found' }, 404);
    const hex = q.pdfhex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' } });
  } catch (e) { return json({ error: 'server error' }, 500); }
}

async function handleRegister(request, env) {
  // Client register: admin-only read AND bulk write (personal client data).
  // POST is an upsert used by auto-register on quotation save - any logged-in
  // staff may add/merge a client, but cannot read the register back.
  if (request.method === 'POST') {
    const s = await sessionIdentity(request, env);
    if (!s) return json({ error: 'unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const name = String(body && body.name || '').trim().slice(0, 120);
    const phone = String(body && body.phone || '').trim().slice(0, 40);
    if (!name) return json({ error: 'name required' }, 400);
    const venue = String(body && body.venue || '').trim().slice(0, 200);
    const eventDates = String(body && body.eventDates || '').trim().slice(0, 200);
    const doc = body && body.doc && typeof body.doc === 'object' ? {
      id: parseInt(body.doc.id || '0', 10) || 0,
      no: String(body.doc.no || '').trim().slice(0, 60),
      kind: body.doc.kind === 'agreement' ? 'agreement' : 'quotation',
      url: String(body.doc.url || '').trim().slice(0, 300)
    } : null;
    // attach document details: fill blanks only, dedupe by record id (retry-safe)
    const applyDoc = r => {
      if (venue && !r.venue) r.venue = venue;
      if (eventDates && !r.eventDates) r.eventDates = eventDates;
      if (doc && doc.id) {
        if (!Array.isArray(r.docLinks)) r.docLinks = [];
        const ex = r.docLinks.find(x => x && x.id === doc.id);
        if (ex) { ex.no = doc.no || ex.no; ex.kind = doc.kind; if (doc.url) ex.url = doc.url; }
        else r.docLinks.push(doc);
        const docNos = (r.docLinks || []).map(x => x.no).filter(Boolean);
        if (docNos.length) r.docs = docNos.join(', ');
      }
    };
    const row0 = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(REG_KEY).first();
    let rows = [];
    try { rows = row0 ? (JSON.parse(row0.v).rows || []) : []; } catch (e) { rows = []; }
    const norm = x => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const upgrade = r => {
      // upgrade Enquiry to Quoted; never downgrade Confirmed/Scheduled/Completed
      if (!r.status || r.status === 'Enquiry') r.status = 'Quoted';
      r.updatedAt = new Date().toISOString();
    };
    const persist = () => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(REG_KEY, JSON.stringify({ rows })).run();
    // 1. Merge only when phone AND normalized name match, and the event does not
    //    conflict (either side blank = no conflict). A phone alone NEVER merges:
    //    family/business phones are shared by distinct clients, and each row is a
    //    booking - a repeat event for the same client gets its own row
    //    ("bina duplicate banaye", Deep 25 Oct 18:20; APK review 25 Oct 20:26).
    //    Keep the EXISTING name - never silently relabel a client.
    const phoneHit = phone ? rows.find(r =>
      r.phone && String(r.phone).trim() === phone &&
      norm(r.name) === norm(name) &&
      (!eventDates || !r.eventDates || norm(r.eventDates) === norm(eventDates))
    ) : null;
    if (phoneHit) {
      upgrade(phoneHit); applyDoc(phoneHit);
      await persist();
      return json({ ok: true, merged: true, by: 'phone' });
    }
    // 2. Name alone NEVER merges automatically: same-name clients may be different
    //    people, and a silent merge cannot be undone. Only a shared phone identifies
    //    a contact (family/business). Anything else gets a NEW row - the admin can
    //    review and tidy duplicates by hand. Nothing is overwritten or deleted.
    const newRow = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, phone, status: 'Quoted', notes: '', updatedAt: new Date().toISOString() };
    applyDoc(newRow);
    rows.push(newRow);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(REG_KEY, JSON.stringify({ rows })).run();
    return json({ ok: true });
  }
  const rs = await sessionIdentity(request, env);
  if (!rs || !hasPerm(rs, await permsFor(env, rs.user), 'register')) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(REG_KEY).first();
    let rows = [];
    try { rows = row ? (JSON.parse(row.v).rows || []) : []; } catch (e) { rows = []; }
    return json({ rows });
  }
  if (request.method === 'PUT') {
    const body = await request.text();
    if (!body || body.length > REG_MAX_BYTES) return json({ error: 'too large or empty' }, 413);
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { return json({ error: 'invalid json' }, 400); }
    if (!parsed || !Array.isArray(parsed.rows)) return json({ error: 'bad shape' }, 400);
    const row0reg = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(REG_KEY).first();
    if (parsed.rows.length > 2000) return json({ error: 'too many rows' }, 413);
    for (const r of parsed.rows) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.name !== 'string') return json({ error: 'bad row' }, 400);
    }
    await versionSnap(env, REG_HIST_KEY, row0reg ? row0reg.v : null, rs.user);
    await env.DB.prepare(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(REG_KEY, body).run();
    return json({ ok: true, rows: parsed.rows.length });
  }
  return json({ error: 'method' }, 405);
}

async function handleDraft(request, env) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_KEY).first();
    return json({ draft: row ? JSON.parse(row.v) : null });
  }
  if (request.method === 'PUT') {
    if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    const body = await request.text();
    if (!body || body.length > MAX_BYTES) return json({ error: 'too large or empty' }, 413);
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { return json({ error: 'invalid json' }, 400); }
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.categories)) return json({ error: 'bad shape' }, 400);
    await env.DB.prepare(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(CAT_KEY, body).run();
    return json({ ok: true, bytes: body.length });
  }
  if (request.method === 'DELETE') {
    if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(CAT_KEY).run();
    await env.DB.prepare("DELETE FROM settings WHERE k LIKE ? ESCAPE '\\'").bind(PHOTO_PREFIX.replace('%','\\%') + '%').run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

function validKey(k){ return !!k && k.length <= 200 && !k.includes('%'); }
// One-call list of every stored catalogue photo key (prefix stripped), so the
// picker can split photo vs no-photo items exactly instead of probing each
// item with its own request. Public GET like the photo endpoint itself - the
// catalogue is not secret and keys are item names only.
async function handlePhotosIndex(request, env) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  const res = await env.DB.prepare("SELECT k FROM settings WHERE k LIKE ? ESCAPE '\\'")
    .bind(PHOTO_PREFIX.replace('%', '\\%') + '%').all();
  let keys = (res.results || []).map(r => String(r.k).slice(PHOTO_PREFIX.length));
  // Exclude photos the draft record marks as deleted or hidden: the stored
  // bytes may still exist (tombstone model), but they must not count as
  // present. Thumb rows ('t|' prefix) follow their base photo's state.
  let pv = {}, hidden = [];
  try {
    const recRow = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(CAT_KEY).first();
    if (recRow) { const rec = JSON.parse(recRow.v); pv = rec.photoV || {}; hidden = rec.hidden || []; }
  } catch (e) { /* no draft record yet - everything counts as present */ }
  const hiddenSet = new Set(hidden);
  const live = k => pv[k] !== '__del__' && !hiddenSet.has(k);
  keys = keys.filter(k => k.startsWith('t|') ? (pv[k] !== '__del__' && live(k.slice(2))) : live(k));
  return json({ count: keys.length, keys });
}
async function handlePhoto(request, env, url) {
  if (request.method === 'GET') {
    const k = url.searchParams.get('k') || '';
    if (!validKey(k)) return json({ error: 'bad key' }, 400);
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(PHOTO_PREFIX + k).first();
    return json({ photo: row ? row.v : null });
  }
  if (request.method === 'PUT') {
    if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    let parsed;
    try { parsed = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    const k = (url.searchParams.get('k') || (parsed && parsed.k) || '');
    if (!validKey(k)) return json({ error: 'bad key' }, 400);
    const data = parsed && parsed.data;
    if (typeof data !== 'string' || !data.startsWith('data:image/') || data.length > MAX_PHOTO_B64)
      return json({ error: 'bad photo' }, 400);
    await env.DB.prepare(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(PHOTO_PREFIX + k, data).run();
    return json({ ok: true, bytes: data.length });
  }
  if (request.method === 'DELETE') {
    const k = url.searchParams.get('k') || '';
    if (!validKey(k)) return json({ error: 'bad key' }, 400);
    if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(PHOTO_PREFIX + k).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

const SUBS_KEY = 'pushSubsV1';

async function handlePushSub(request, env) {
  // Web-push subscription store. Admin-authed; subscriptions are device
  // endpoints Deep explicitly enables from the admin panel.
  if (!(await authedAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(SUBS_KEY).first();
    let subs = [];
    try { subs = row ? (JSON.parse(row.v).subs || []) : []; } catch (e) { subs = []; }
    return json({ count: subs.length });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    if (!body || !body.endpoint || !body.keys || !body.keys.p256dh || !body.keys.auth)
      return json({ error: 'bad subscription' }, 400);
    if (String(body.endpoint).length > 1000) return json({ error: 'bad endpoint' }, 400);
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(SUBS_KEY).first();
    let subs = [];
    try { subs = row ? (JSON.parse(row.v).subs || []) : []; } catch (e) { subs = []; }
    subs = subs.filter(x => x && x.endpoint !== body.endpoint);
    subs.push({ endpoint: String(body.endpoint), keys: { p256dh: String(body.keys.p256dh), auth: String(body.keys.auth) }, added: new Date().toISOString() });
    if (subs.length > 20) subs = subs.slice(-20);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(SUBS_KEY, JSON.stringify({ subs })).run();
    return json({ ok: true, count: subs.length });
  }
  if (request.method === 'DELETE') {
    const u = new URL(request.url);
    const ep = u.searchParams.get('endpoint') || '';
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(SUBS_KEY).first();
    let subs = [];
    try { subs = row ? (JSON.parse(row.v).subs || []) : []; } catch (e) { subs = []; }
    subs = subs.filter(x => x && x.endpoint !== ep);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(SUBS_KEY, JSON.stringify({ subs })).run();
    return json({ ok: true, count: subs.length });
  }
  return json({ error: 'method' }, 405);
}

// =====================================================================
// Standalone API handlers (no upstream proxy).
// Provenance: login, users, users/[id], refno, settings = verbatim from the
// v2 function files (only the Pages-Functions context wrapper was removed).
// change-password = verbatim handler recovered from an archived build record (20 Oct).
// =====================================================================

// login.js (recovered verbatim) - POST {username,password} -> {token,username,role}
async function handleLogin(request, env){
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if(!username || !password) return json({ error: 'invalid' }, 401);
  const hash = await sha256hex(password);
  let role = null;
  if(username.toLowerCase() === 'admin'){
    const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'admin_pass_hash'").first();
    if(row && row.v === hash) role = 'admin';
  } else {
    const u = await env.DB.prepare('SELECT pass_hash, role, disabled FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if(u && u.pass_hash === hash && !u.disabled) role = u.role || 'staff';
  }
  if(!role) return json({ error: 'invalid' }, 401);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const sess = { u: username, role, exp: Date.now() + 7 * 24 * 3600 * 1000 };
  await env.DB.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)').bind('session_' + token, JSON.stringify(sess)).run();
  // NOTE: the live backend also appends a login row to the activity table; the
  // exact action/detail strings are unrecovered, so this recovered verbatim handler
  // does not log it. Tracked in BUILD-NOTES.md (activity endpoint rewrite).
  return json({ token, username, role });
}

// change-password handler (verbatim, recovered from an archived build record, 20 Oct; helpers mapped
// onto the shared json()/sha256hex() above - logic unchanged)
async function changePassword(req, env){
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('session_' + token).first();
  let sess = null; try { sess = row && JSON.parse(row.v); } catch (e) {}
  if (!sess || !sess.u || (sess.exp && sess.exp < Date.now())) return json({ error: 'unauthorized' }, 401);
  let b = null; try { b = await req.json(); } catch (e) {}
  const cur = b && typeof b.current === 'string' ? b.current : '';
  const next = b && typeof b.next === 'string' ? b.next : '';
  if (!cur) return json({ error: 'Enter your current password.' }, 400);
  if (next.length < 8) return json({ error: 'New password must be at least 8 characters.' }, 400);
  if (next.length > 128) return json({ error: 'New password is too long.' }, 400);
  if (next === cur) return json({ error: 'New password must be different from the current one.' }, 400);
  // throttle wrong guesses: 5 per 10 minutes per user
  const fk = 'pwfail_' + sess.u;
  const fr = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(fk).first();
  let f = { n: 0, t: 0 }; try { if (fr) f = JSON.parse(fr.v); } catch (e) {}
  if (f.n >= 5 && Date.now() - f.t < 600000) return json({ error: 'Too many wrong attempts. Try again in 10 minutes.' }, 429);
  const isAdmin = sess.u === 'admin';
  let stored = '';
  if (isAdmin) {
    const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'admin_pass_hash'").first(); stored = r ? r.v : '';
  } else {
    const r = await env.DB.prepare('SELECT pass_hash, disabled FROM users WHERE username = ?').bind(sess.u).first();
    if (!r || r.disabled) return json({ error: 'unauthorized' }, 401);
    stored = r.pass_hash;
  }
  if (!stored || (await sha256hex(cur)) !== stored) {
    const nf = { n: (Date.now() - f.t < 600000 ? f.n : 0) + 1, t: Date.now() };
    await env.DB.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)').bind(fk, JSON.stringify(nf)).run();
    return json({ error: 'Current password is wrong.' }, 400);
  }
  const nh = await sha256hex(next);
  if (isAdmin) await env.DB.prepare("UPDATE settings SET v = ? WHERE k = 'admin_pass_hash'").bind(nh).run();
  else await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE username = ?').bind(nh, sess.u).run();
  // sign out this user's other sessions, keep the current one
  const all = await env.DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'session_%'").all();
  for (const r of (all.results || [])) {
    if (r.k === 'session_' + token) continue;
    let s = null; try { s = JSON.parse(r.v); } catch (e) {}
    if (s && s.u === sess.u) await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(r.k).run();
  }
  await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(fk).run();
  await env.DB.prepare('INSERT INTO activity (ts, user, action, detail) VALUES (?, ?, ?, ?)').bind(new Date().toISOString(), sess.u, 'password.change', 'password changed by the user (other sessions signed out)').run();
  return json({ ok: true });
}

// users.js (recovered verbatim) - admin: GET list (+quote counts), POST create
async function handleUsers(request, env){
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.role !== 'admin') return json({ error: 'forbidden' }, 403);
  if (request.method === 'GET') {
    const r = await env.DB.prepare(
      `SELECT id, username, role, disabled, created_at, full_name, phone, email, designation, joined_on, notes,
              (SELECT COUNT(*) FROM quotations WHERE quotations.user = users.username) AS quotations
       FROM users ORDER BY id`
    ).all();
    return json({ users: r.results });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if(!username) return json({ error: 'Username is required.' }, 400);
    if(!password || password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
    const dupe = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if(dupe) return json({ error: 'That username is already taken.' }, 400);
    const hash = await sha256hex(password);
    const role = body.role === 'admin' ? 'admin' : 'staff';
    await env.DB.prepare(
      'INSERT INTO users (username, pass_hash, role, disabled, created_at, full_name, phone, email, designation, joined_on, notes) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(username, hash, role, new Date().toISOString(),
      String(body.full_name || ''), String(body.phone || ''), String(body.email || ''),
      String(body.designation || ''), String(body.joined_on || ''), String(body.notes || '')).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// users/[id].js (recovered verbatim) - admin: PUT role/disabled/password, DELETE
async function handleUserById(request, env, id){
  const s = await sessionIdentity(request, env);
  if (!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    const sets = []; const vals = [];
    if (body.role !== undefined) { sets.push('role = ?'); vals.push(body.role === 'admin' ? 'admin' : 'staff'); }
    if (body.disabled !== undefined) { sets.push('disabled = ?'); vals.push(body.disabled ? 1 : 0); }
    if (body.password) {
      if (String(body.password).length < 6) return json({ error: 'password: 6+ chars' }, 400);
      sets.push('pass_hash = ?'); vals.push(await sha256hex(String(body.password)));
    }
    if (!sets.length) return json({ error: 'nothing to update' }, 400);
    vals.push(id);
    const r = await env.DB.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
    if (!r.meta.changes) return json({ error: 'not found' }, 404);
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    if (!r.meta.changes) return json({ error: 'not found' }, 404);
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// refno.js (recovered verbatim) - server-allocated reference serials in settings k='serials'
const REFNO_SERIES = { q: '$.q', a: '$.a' };
async function handleRefno(request, env){
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'serials'").first();
    return json(row ? JSON.parse(row.v) : {});
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
    const series = String((body && body.series) || 'q');
    const path = REFNO_SERIES[series];
    if(!path) return json({ error: 'unknown series' }, 400);
    // single atomic UPDATE ... RETURNING: concurrent allocations can never hand out the same number
    const row = await env.DB.prepare(
      "UPDATE settings SET v = json_set(v, ?1, json_extract(v, ?2) + json_extract(v, ?3)) WHERE k = 'serials' RETURNING v"
    ).bind(path + '.next', path + '.next', path + '.step').first();
    if(!row) return json({ error: 'reference serials not initialized' }, 500);
    let cfg;
    try { cfg = JSON.parse(row.v)[series]; } catch(e){ return json({ error: 'reference serials corrupted' }, 500); }
    if(!cfg || !cfg.prefix) return json({ error: 'reference serials corrupted' }, 500);
    const allocated = cfg.next - cfg.step;
    return json({ ok: true, series, refNo: cfg.prefix + allocated, next: cfg.next });
  }
  return json({ error: 'method' }, 405);
}

// settings.js (recovered verbatim) - GET site_settings for any logged-in session.
// PUT lives in the router (needs the versioning snapshot + save mutex).
async function handleSettingsGet(request, env){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'site_settings'").first();
  if(!row) return json({});
  try { return new Response(row.v, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
  catch(e){ return json({}); }
}

// =====================================================================
// REWRITTEN endpoints (original sources unrecovered). Behavior rebuilt from
// the live frontend call sites + live response probing on 13 Nov 2026.
// Each handler is labeled; semantics that were ASSUMED (not observed) are
// marked ASSUMPTION and listed in BUILD-NOTES.md.
// =====================================================================

// ---- /api/quotations (REWRITTEN on the 19 Oct v2 base) ----
// list adds: deleted bin view, doc_no + template columns, protected id 900004.
const PROTECTED_QID = '900004'; // protected draft record, never deleted/restored via API
async function handleQuotations(request, env, url){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const bin = url.searchParams.get('deleted') === '1';
    const r = await env.DB.prepare(
      "SELECT id, client, user, created_at, updated_at, length(pdf) AS pdf_bytes, " +
      "json_extract(data, '$.docType') AS doc_type, json_extract(data, '$.docNo') AS doc_no, json_extract(data, '$.template') AS template " +
      "FROM quotations WHERE deleted = " + (bin ? '1' : '0') + " ORDER BY id DESC"
    ).all();
    return json({ count: r.results.length, quotations: r.results });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
    const data = body.data || {};
    const pdf = dataUrlToBytes(body.pdf);
    const now = new Date().toISOString();
    // Idempotent save (14 Nov, conflict-safe): a retry / repeated download of the SAME
    // document must never create a duplicate row, and must NEVER overwrite a different
    // document that happens to share the number (historical duplicate, reused number, or a
    // newer concurrent edit). One atomic INSERT ... WHERE NOT EXISTS closes the
    // check-then-insert race. When a row with this docNo already exists we only read it:
    //   identical content -> true retry: no write, return the existing id;
    //   different content -> 409 conflict: nothing is written; the client keeps its copy
    //   and tells the user. Match is owner-scoped and only on a non-empty docNo.
    // Existing/historical rows are never modified by this endpoint.
    const docNo = String(data.docNo || '').trim();
    if (docNo) {
      const ins = await env.DB.prepare(
        "INSERT INTO quotations (client, created_at, updated_at, deleted, data, pdf, user) " +
        "SELECT ?, ?, ?, 0, ?, ?, ? WHERE NOT EXISTS (" +
        "SELECT 1 FROM quotations WHERE deleted = 0 AND user = ? AND json_extract(data, '$.docNo') = ?)"
      ).bind(String(data.clientName || ''), now, now, JSON.stringify(data), pdf, s.user, s.user, docNo).run();
      if (ins.meta && ins.meta.changes > 0) return json({ ok: true, id: ins.meta.last_row_id });
      const ex = await env.DB.prepare(
        "SELECT id, data FROM quotations WHERE deleted = 0 AND user = ? AND json_extract(data, '$.docNo') = ? ORDER BY id DESC LIMIT 1"
      ).bind(s.user, docNo).first();
      if (ex && canonJson(ex.data) === canonJson(JSON.stringify(data))) {
        return json({ ok: true, id: ex.id, duplicate: true });
      }
      return json({ error: 'docno-conflict', docNo }, 409);
    }
    const r = await env.DB.prepare(
      'INSERT INTO quotations (client, created_at, updated_at, deleted, data, pdf, user) VALUES (?, ?, ?, 0, ?, ?, ?)'
    ).bind(String(data.clientName || ''), now, now, JSON.stringify(data), pdf, s.user).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  return json({ error: 'method' }, 405);
}
function b64encode(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
}
async function handleQuotationById(request, env, url, id){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT * FROM quotations WHERE id = ?').bind(id).first();
  // owner-scoped like the v2 base: staff see only their own records here
  // (the shared staff viewer is /api/quote-view).
  if (!row || (s.role !== 'admin' && row.user !== s.user)) return json({ error: 'not found' }, 404);
  if (request.method === 'GET') {
    return json({ id: row.id, client: row.client, user: row.user, created_at: row.created_at,
      updated_at: row.updated_at, deleted: row.deleted ? 1 : 0, data: JSON.parse(row.data), pdf: b64encode(row.pdf) });
  }
  if (request.method === 'PUT') {
    if (String(id) === PROTECTED_QID) return json({ error: 'protected record' }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    const now = new Date().toISOString();
    const sets = ['updated_at = ?']; const vals = [now];
    if (body.data) { sets.push('data = ?', 'client = ?'); vals.push(JSON.stringify(body.data).slice(0, 900000), (body.data.clientName || 'Client').slice(0, 120)); }
    if (body.pdf) {
      if (String(body.pdf).length > 3800000) return json({ error: 'pdf too large' }, 413);
      sets.push('pdf = ?');
      vals.push(dataUrlToBytes(body.pdf));
    }
    vals.push(id);
    await env.DB.prepare('UPDATE quotations SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
    return json({ ok: true });
  }
  if (request.method === 'PATCH') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    if (body && body.restore === true) {
      if (String(id) === PROTECTED_QID) return json({ error: 'protected record' }, 403);
      await env.DB.prepare('UPDATE quotations SET deleted = 0, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
      return json({ ok: true });
    }
    return json({ error: 'bad request' }, 400);
  }
  if (request.method === 'DELETE') {
    if (String(id) === PROTECTED_QID) return json({ error: 'protected record' }, 403);
    if (url.searchParams.get('hard') === '1') {
      if (s.role !== 'admin') return json({ error: 'forbidden' }, 403); // purge is admin-only in the UI
      await env.DB.prepare('DELETE FROM quotations WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    await env.DB.prepare('UPDATE quotations SET deleted = 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// ---- /api/images (REWRITTEN) ----
// GET: any session (form picker). Mutations: admin only (ASSUMPTION: the only
// observed mutation call site is the admin panel).
async function handleImages(request, env, url){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const bin = url.searchParams.get('deleted') === '1';
    const r = await env.DB.prepare(
      'SELECT id, label, data, created_at, user FROM images WHERE deleted = ' + (bin ? '1' : '0') + ' ORDER BY id DESC'
    ).all();
    return json({ images: r.results });
  }
  if (request.method === 'POST') {
    if (s.role !== 'admin') return json({ error: 'forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
    const data = String(body && body.data || '');
    if (!data.startsWith('data:image/') || data.length > MAX_PHOTO_B64) return json({ error: 'bad image' }, 400);
    const label = String(body && body.label || '').slice(0, 200);
    const r = await env.DB.prepare('INSERT INTO images (label, data, deleted, created_at, user) VALUES (?, ?, 0, ?, ?)')
      .bind(label, data, new Date().toISOString(), s.user).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  return json({ error: 'method' }, 405);
}
async function handleImageById(request, env, url, id){
  const s = await sessionIdentity(request, env);
  if(!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT id FROM images WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  if (request.method === 'PATCH') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    if (body && body.restore === true) {
      await env.DB.prepare('UPDATE images SET deleted = 0 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (body && typeof body.label === 'string') {
      await env.DB.prepare('UPDATE images SET label = ? WHERE id = ?').bind(body.label.slice(0, 200), id).run();
      return json({ ok: true });
    }
    return json({ error: 'bad request' }, 400);
  }
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    const data = String(body && body.data || '');
    if (!data.startsWith('data:image/') || data.length > MAX_PHOTO_B64) return json({ error: 'bad image' }, 400);
    await env.DB.prepare('UPDATE images SET data = ? WHERE id = ?').bind(data, id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    if (url.searchParams.get('hard') === '1') {
      await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    await env.DB.prepare('UPDATE images SET deleted = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// ---- /api/draft (REWRITTEN) ----
// Per-user agreement/quotation autosave. Keyed by session username.
async function handleDraftAutosave(request, env){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  const key = 'draft_' + s.user;
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
    if (!row) return json({ draft: null, updated_at: null });
    try { const d = JSON.parse(row.v); return json({ draft: d.draft, updated_at: d.updated_at }); }
    catch(e){ return json({ draft: null, updated_at: null }); }
  }
  if (request.method === 'PUT') {
    const body = await request.text();
    if (!body || body.length > MAX_BYTES) return json({ error: 'too large or empty' }, 413);
    try { JSON.parse(body); } catch (e) { return json({ error: 'invalid json' }, 400); }
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .bind(key, JSON.stringify({ draft: JSON.parse(body), updated_at: new Date().toISOString() })).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(key).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// ---- /api/public (REWRITTEN) ----
// No-auth company info for the public site footer/about. Serves site_settings.
async function handlePublic(request, env){
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'site_settings'").first();
  if (!row) return json({});
  try { return new Response(row.v, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
  catch(e){ return json({}); }
}

// ---- /api/activity (REWRITTEN) ----
async function handleActivity(request, env){
  const s = await sessionIdentity(request, env);
  if(!s || s.role !== 'admin') return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  const r = await env.DB.prepare('SELECT id, ts, user, action, detail FROM activity ORDER BY id DESC LIMIT 100').all();
  return json({ activity: r.results });
}

// ---- /api/share + /s/<token> (REWRITTEN) ----
// POST {id} -> {url}. ASSUMPTION for /s/<token>: serves a minimal public PDF
// viewer page; the original page markup is unrecovered.
async function handleShare(request, env, url){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
  const id = String(body && body.id || '').trim();
  if (!id) return json({ error: 'id required' }, 400);
  const q = await env.DB.prepare('SELECT id FROM quotations WHERE id = ? AND deleted = 0').bind(id).first();
  if (!q) return json({ error: 'not found' }, 404);
  const ex = await env.DB.prepare('SELECT token FROM shares WHERE id = ?').bind(id).first();
  let token = ex && ex.token;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    await env.DB.prepare('INSERT INTO shares (token, id, created_at) VALUES (?, ?, ?)').bind(token, id, new Date().toISOString()).run();
  }
  return json({ ok: true, url: 'https://' + (url.host || 'www.bbth.online') + '/s/' + token });
}
async function handleShareView(request, env, url, token){
  if (!/^[a-f0-9]{32,80}$/.test(token)) return new Response('Not found', { status: 404 });
  const sh = await env.DB.prepare('SELECT id FROM shares WHERE token = ?').bind(token).first();
  if (!sh) return new Response('Not found', { status: 404 });
  const q = await env.DB.prepare('SELECT client, pdf FROM quotations WHERE id = ? AND deleted = 0').bind(sh.id).first();
  if (!q || !q.pdf) return new Response('Not found', { status: 404 });
  const b64 = b64encode(q.pdf);
  const title = 'BBTH - document for ' + (q.client || 'client');
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title.replace(/</g, '&lt;') + '</title>'
    + '<style>body{margin:0;background:#222}embed{width:100vw;height:100vh;border:0}</style></head>'
    + '<body><embed type="application/pdf" src="data:application/pdf;base64,' + b64 + '"></body></html>';
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---- /api/catalogue (REWRITTEN) ----
// Adds a service/extra name to the shared settings lists (site_settings row).
async function handleCatalogueAdd(request, env){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
  const kind = String(body && body.kind || '');
  const name = String(body && body.name || '').trim().slice(0, 200);
  if (!name || (kind !== 'service' && kind !== 'extra')) return json({ error: 'bad request' }, 400);
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'site_settings'").first();
  let st = {};
  try { st = row ? JSON.parse(row.v) : {}; } catch(e){ st = {}; }
  const norm = x => String(x || '').trim().toLowerCase();
  if (kind === 'service') {
    st.services = Array.isArray(st.services) ? st.services : [];
    if (st.services.some(x => norm(x) === norm(name))) return json({ ok: true, already: true });
    st.services.push(name);
  } else {
    const rate = String(body && body.rate != null ? body.rate : '').slice(0, 40);
    st.extras = Array.isArray(st.extras) ? st.extras : [];
    if (st.extras.some(x => norm(x && x.name) === norm(name))) return json({ ok: true, already: true });
    st.extras.push({ name, rate });
  }
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind('site_settings', JSON.stringify(st)).run();
  return json({ ok: true, already: false });
}

// ---- /api/catalogue-history (REWRITTEN) ----
// Saved catalogues, shared across staff logins (any session may read/write).
async function handleCatalogueHistory(request, env, url){
  const s = await sessionIdentity(request, env);
  if(!s) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const r = await env.DB.prepare('SELECT id, data, created_at FROM catalogues ORDER BY id DESC LIMIT 200').all();
    return json({ rows: r.results });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
    if (!body || body.data == null) return json({ error: 'bad request' }, 400);
    const data = JSON.stringify(body.data).slice(0, 200000);
    const now = new Date().toISOString();
    const r = await env.DB.prepare('INSERT INTO catalogues (data, created_at, updated_at, user) VALUES (?, ?, ?, ?)')
      .bind(data, now, now, s.user).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'id required' }, 400);
    const r = await env.DB.prepare('DELETE FROM catalogues WHERE id = ?').bind(id).run();
    if (!r.meta.changes) return json({ error: 'not found' }, 404);
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// dataUrlToBytes (recovered verbatim _util.js)
function dataUrlToBytes(dataUrl){
  const b64 = String(dataUrl || '').replace(/^data:[^,]*,/, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = request.headers.get('host') || '';
    // hostname gate: never serve the catalogue store on the public site
    const isPreview = host.endsWith('.bbth-quote.pages.dev') || host.startsWith('localhost') || host.startsWith('127.0.0.1');
    // Venue Layout editor is staging-only (Deep, 25 Oct): never serve it on the
    // production hostname, including direct URLs and its static assets.
    if (!isPreview && url.pathname.startsWith('/app/layout')) {
      return new Response('Not found', { status: 404 });
    }
    if (url.pathname === '/api/whoami') {
      // Role introspection: reports the role stamped on the caller's stored
      // login session. Read-only; lets the admin confirm what the server
      // believes their role is.
      const idn = await sessionIdentity(request, env);
      if (!idn) return json({ error: 'unauthorized' }, 401);
      return json({ user: idn.user, role: idn.role, perms: idn.role === 'admin' ? ['*'] : await permsFor(env, idn.user) });
    }
    if (url.pathname === '/api/items-catalogue/stage/photo') {
      try { return await handleCatStagePhoto(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/items-catalogue/stage') {
      try { return await handleCatStage(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/items-catalogue/apply') {
      try { return await handleCatApply(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/items-catalogue') {
      try { return await handleDraft(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/push-config') {
      // Reveals only whether the VAPID secret is visible to THIS environment
      // plus the public key (public by design). Never the private key.
      return json({ configured: !!env.VAPID_PRIVATE_KEY, publicKey: env.VAPID_PUBLIC_KEY || '' });
    }
    if (url.pathname === '/api/push-sub') {
      try { return await handlePushSub(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/quote-list') {
      try { return await handleQuoteList(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/changes') {
      try { return await handleChanges(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/changes/approve') {
      try { return await handleChangeDecision(request, env, url, true); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/changes/reject') {
      try { return await handleChangeDecision(request, env, url, false); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/notifications') {
      try { return await handleNotifications(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/staff-perms') {
      try { return await handleStaffPerms(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/quote-view') {
      try { return await handleQuoteView(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/quote-pdf') {
      try { return await handleQuotePdf(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/client-register/history') {
      try { return await handleHistory(request, env, REG_HIST_KEY, 'admin'); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/client-register/history-get') {
      try { return await handleHistoryGet(request, env, REG_HIST_KEY, 'admin', url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/client-register/restore' && request.method === 'POST') {
      try { return await handleRegisterRestore(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/settings/restore' && request.method === 'POST') {
      try { return await handleSettingsRestore(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/settings/versions') {
      try { return await handleHistory(request, env, SETTINGS_HIST_KEY, 'admin'); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/settings/version-get') {
      try { return await handleHistoryGet(request, env, SETTINGS_HIST_KEY, 'admin', url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/settings' && request.method === 'GET') {
      return await handleSettingsGet(request, env);
    }
    if (url.pathname === '/api/settings' && request.method === 'PUT') {
      // Local site_settings write (admin only, per v2 settings.js). Snapshots the
      // previous value into the version history before replacing it, serialized
      // through the same mutex as settings restore.
      const s0 = await sessionIdentity(request, env);
      if (!s0) return json({ error: 'unauthorized' }, 401);
      if (s0.role !== 'admin') return json({ error: 'forbidden' }, 403);
      let newBody;
      try { newBody = JSON.stringify(await request.json()); } catch (e) { return json({ error: 'bad request' }, 400); }
      const lockTok = crypto.randomUUID();
      if (!(await settingsLock(env, lockTok))) return json({ error: 'busy', message: 'Another settings save is in progress - try again.' }, 409);
      try {
        try {
          const cur = await env.DB.prepare("SELECT v FROM settings WHERE k = 'site_settings'").first();
          if (cur) await versionSnap(env, SETTINGS_HIST_KEY, cur.v, s0.user);
        } catch (e) { /* versioning must never block a save */ }
        await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('site_settings', newBody).run();
        return json({ ok: true });
      } finally {
        await settingsUnlock(env, lockTok);
      }
    }
    if (url.pathname === '/api/client-register') {
      try { return await handleRegister(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/items-catalogue/photos-index') {
      try { return await handlePhotosIndex(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/items-catalogue/photo') {
      try { return await handlePhoto(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/login' && request.method === 'POST') {
      try { return await handleLogin(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/change-password') {
      try { return await changePassword(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/users') {
      try { return await handleUsers(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname.startsWith('/api/users/')) {
      const uid = decodeURIComponent(url.pathname.slice('/api/users/'.length));
      try { return await handleUserById(request, env, uid); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/refno') {
      try { return await handleRefno(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/quotations') {
      try { return await handleQuotations(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname.startsWith('/api/quotations/')) {
      const qid = decodeURIComponent(url.pathname.slice('/api/quotations/'.length));
      try { return await handleQuotationById(request, env, url, qid); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/images') {
      try { return await handleImages(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname.startsWith('/api/images/')) {
      const iid = decodeURIComponent(url.pathname.slice('/api/images/'.length));
      try { return await handleImageById(request, env, url, iid); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/draft') {
      try { return await handleDraftAutosave(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/public') {
      try { return await handlePublic(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/activity') {
      try { return await handleActivity(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/share') {
      try { return await handleShare(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/catalogue') {
      try { return await handleCatalogueAdd(request, env); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname === '/api/catalogue-history') {
      try { return await handleCatalogueHistory(request, env, url); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname.startsWith('/s/')) {
      const stk = decodeURIComponent(url.pathname.slice(3));
      try { return await handleShareView(request, env, url, stk); }
      catch (e) { return json({ error: 'server error' }, 500); }
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
