// BBTH release shim (v5 save-fix, 14 Nov 2026).
// Serves the updated static site from this deployment's assets; every /api/* call
// is forwarded verbatim to the PINNED original deployment, whose worker + D1 stay
// fully authoritative. The original deployment is never modified or deleted.
//
// ONE scoped exception (the 14 Nov save-fix): POST /api/quotations is handled
// locally against the same D1 database with conflict-safe idempotency:
//   - one atomic INSERT ... WHERE NOT EXISTS (owner-scoped, non-empty docNo)
//     closes the check-then-insert race: a retry / repeated download of the SAME
//     document can never create a duplicate row;
//   - when the number already exists the row is only READ:
//       identical content  -> no-write duplicate no-op, returns the existing id;
//       different content  -> 409 docno-conflict, NOTHING is written (a different
//                             document sharing the number is never overwritten);
//   - a real insert also writes the quotation.create activity row in the
//     original backend's format, so the admin activity log stays complete.
// All other routes (including PUT/DELETE/GET on quotations) keep flowing to the
// pinned original backend unchanged.
const PINNED = 'https://1d65f224.bbth-quote.pages.dev';
const SITE = 'https://www.bbth.online';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
function dataUrlToBytes(dataUrl){
  const b64 = String(dataUrl || '').replace(/^data:[^,]*,/, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function canonJson(t){
  try { return JSON.stringify(JSON.parse(t)); } catch(e) { return null; }
}
// Session check identical to the backend contract: 'session_<token>' rows with a
// server-stamped role written at login time; role is read from the stored record.
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

async function handleQuotationCreate(request, env) {
  const s = await sessionIdentity(request, env);
  if (!s) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: 'bad request' }, 400); }
  const data = body.data || {};
  const pdf = dataUrlToBytes(body.pdf);
  const now = new Date().toISOString();
  const docNo = String(data.docNo || '').trim();
  if (docNo) {
    const ins = await env.DB.prepare(
      "INSERT INTO quotations (client, created_at, updated_at, deleted, data, pdf, user) " +
      "SELECT ?, ?, ?, 0, ?, ?, ? WHERE NOT EXISTS (" +
      "SELECT 1 FROM quotations WHERE deleted = 0 AND user = ? AND json_extract(data, '$.docNo') = ?)"
    ).bind(String(data.clientName || ''), now, now, JSON.stringify(data), pdf, s.user, s.user, docNo).run();
    if (ins.meta && ins.meta.changes > 0) {
      const newId = ins.meta.last_row_id;
      // Activity row in the original backend's format: "#<id> <client> (<docNo>)".
      const detail = '#' + newId + ' ' + String(data.clientName || '') + (docNo ? ' (' + docNo + ')' : '');
      try {
        await env.DB.prepare('INSERT INTO activity (ts, user, action, detail) VALUES (?, ?, ?, ?)')
          .bind(now, s.user, 'quotation.create', detail).run();
      } catch (e) { /* the save itself already succeeded; never fail it over a log row */ }
      return json({ ok: true, id: newId });
    }
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
  const newId = r.meta.last_row_id;
  try {
    await env.DB.prepare('INSERT INTO activity (ts, user, action, detail) VALUES (?, ?, ?, ?)')
      .bind(now, s.user, 'quotation.create', '#' + newId + ' ' + String(data.clientName || '')).run();
  } catch (e) { /* never fail the save over a log row */ }
  return json({ ok: true, id: newId });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // The one scoped local route: conflict-safe quotation creation (14 Nov save-fix).
    if (url.pathname === '/api/quotations' && request.method === 'POST') {
      return handleQuotationCreate(request, env);
    }

    const origin = (env && env.BACKEND_ORIGIN) || PINNED;
    const target = origin + url.pathname + url.search;

    // redirect:'manual' - never follow a redirect, so Authorization can never be
    // forwarded to an unexpected host. A backend redirect is passed through with
    // its Location rewritten to the public site host.
    const resp = await fetch(new Request(target, request), { redirect: 'manual' });

    const headers = new Headers(resp.headers);
    const loc = headers.get('location');
    if (loc && loc.startsWith(origin)) headers.set('location', SITE + loc.slice(origin.length));

    // Worker-built absolute URLs inside JSON (e.g. share links) must keep pointing
    // at the public site, not the pinned deployment host.
    const ct = headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const text = await resp.text();
      return new Response(text.split(origin).join(SITE), { status: resp.status, headers });
    }
    return new Response(resp.body, { status: resp.status, headers });
  }
};
