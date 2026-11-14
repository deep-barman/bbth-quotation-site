// BBTH Catalogue store - SHARED draft (staging site) with local offline cache.
// Shared draft lives in D1 via /api/items-catalogue (staging hostnames only).
// Writes require the staff login token. Production site never serves these routes.
window.ItemsStore = (function(){
  const CAT_KEY = 'bbth-items-catalogue-override-v1';
  const HIDE_KEY = 'bbth-items-photos-hidden-v1';
  const DB_NAME = 'bbth-items-photos';
  const DB_VER = 1;
  let dbp = null;

  function db(){
    if(dbp) return dbp;
    dbp = new Promise((res, rej)=>{
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = ()=>{ r.result.createObjectStore('photos'); };
      r.onsuccess = ()=>res(r.result);
      r.onerror = ()=>rej(r.error);
    });
    return dbp;
  }

  const normK = s => String(s||'').trim().toLowerCase();
  function token(){ return sessionStorage.getItem('bbth-admin-token') || localStorage.getItem('bbth-admin-token') || ''; }

  // Write mode: 'shared' (admin - changes go live directly) or 'staged'
  // (granted staff - changes wait for admin approval; the global catalogue and
  // photos are never written on this path).
  let SHARE_MODE = 'shared';
  function setShareMode(m){ SHARE_MODE = (m === 'staged') ? 'staged' : 'shared'; }
  function shareMode(){ return SHARE_MODE; }

  // ---------- shared (server) layer ----------
  async function fetchServerDraft(){
    try {
      const r = await fetch('/api/items-catalogue', { cache: 'no-store' });
      if(!r.ok) return null;
      const j = await r.json();
      return j && j.draft ? j.draft : null;
    } catch(e){ return null; }
  }
  async function pushDraft(rec){
    if(!token()) return { ok:false, error:'no-login' };
    try {
      const r = await fetch(SHARE_MODE === 'staged' ? '/api/items-catalogue/stage' : '/api/items-catalogue', { method:'PUT',
        headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token() },
        body: JSON.stringify(rec) });
      if(!r.ok) return { ok:false, error:'http-'+r.status };
      return { ok:true };
    } catch(e){ return { ok:false, error:'network' }; }
  }
  // NOTE: network failures THROW on purpose - callers must be able to tell
  // "server unreachable" (use the offline cache) apart from "server says this
  // key has no photo" (the shared store wins). A null return is a real answer.
  async function serverPhotoGet(k){
    const r = await fetch('/api/items-catalogue/photo?k='+encodeURIComponent(k), { cache:'no-store' });
    if(!r.ok) return null;
    const j = await r.json();
    return j && j.photo ? j.photo : null;
  }
  async function serverPhotoPut(k, dataURL){
    if(!token()) return false;
    try {
      const r = await fetch(SHARE_MODE === 'staged' ? '/api/items-catalogue/stage/photo' : '/api/items-catalogue/photo', { method:'PUT',
        headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token() },
        body: JSON.stringify({ k, data: dataURL }) });
      return r.ok;
    } catch(e){ return false; }
  }
  async function serverPhotoDel(k){
    if(!token()) return false;
    try {
      const r = await fetch((SHARE_MODE === 'staged' ? '/api/items-catalogue/stage/photo?k=' : '/api/items-catalogue/photo?k=')+encodeURIComponent(k), { method:'DELETE',
        headers:{ 'authorization':'Bearer '+token() } });
      return r.ok;
    } catch(e){ return false; }
  }

  // ---------- base fixture ----------
  async function fetchBase(){
    const [cat, svc] = await Promise.all([
      fetch('/app/items/fixture-catalogue.json?v=4').then(r=>r.json()),
      fetch('/app/items/fixture-services.json?v=1').then(r=>r.json()).catch(()=>null)
    ]);
    const cats = cat.categories.concat(svc && svc.categories ? svc.categories : []);
    return { basev: cat.basev || 3, categories: cats };
  }

  function readLocal(){
    try {
      const raw = localStorage.getItem(CAT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  }
  function writeLocal(rec){
    try { localStorage.setItem(CAT_KEY, JSON.stringify(rec)); } catch(e){}
  }
  function readHiddenLocal(){
    try { return JSON.parse(localStorage.getItem(HIDE_KEY)||'[]'); } catch(e){ return []; }
  }
  function writeHiddenLocal(arr){
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(arr)); } catch(e){}
  }

  let lastBaseV = 3;
  let lastServerMeta = null;   // tombstones/renames as the SERVER has them (never trust the local cache for these)
  let lastServerDataJSON = null; // canonical JSON of the draft data as the server had it at load/last save - stale-online detection
  let lastServerFullJSON = null; // canonical JSON of the WHOLE record (data+tombstones+renames+hidden+photoV+bin) - full stale detection
  let lastServerRec = null;    // the draft record as the server had it at load/last save/last focus-refresh
  const localPhotoOps = {};    // photo version markers this session set (shared mode) - merged into every save
  function canon(v){
    if(v === null || typeof v !== 'object') return JSON.stringify(v);
    if(Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  function recCanon(rec){ return canon({ d: rec.data, del: rec.deleted||[], dc: rec.deletedCats||[], r: rec.renames||[], h: rec.hidden||[], pv: rec.photoV||{}, bin: rec.bin||null }); }
  function adoptServerRec(rec){
    lastServerRec = rec;
    lastServerMeta = { deleted: rec.deleted||[], deletedCats: rec.deletedCats||[], renames: rec.renames||[], bin: rec.bin||null };
    loadBaseMeta = { deleted: lastServerMeta.deleted.slice(), deletedCats: lastServerMeta.deletedCats.slice(), hidden: (rec.hidden||[]).slice(), binKeys: Object.keys(((lastServerMeta.bin)||{}).items||{}), binCatKeys: Object.keys(((lastServerMeta.bin)||{}).cats||{}) };
    lastServerDataJSON = canon(rec.data);
    lastServerFullJSON = recCanon(rec);
    writeLocal(rec);
    writeHiddenLocal(rec.hidden || []);
  }
  // small string hash for photo version markers (content-addressed, no server needed)
  function shash(s){ let h1 = 5381, h2 = 52711; for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 31) ^ c; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + '-' + s.length.toString(36); }
  const PVER_KEY = 'bbth-items-photover-v1';
  function readPhotoVer(){ try { return JSON.parse(localStorage.getItem(PVER_KEY)||'{}'); } catch(e){ return {}; } }
  function setPhotoVer(k, v){ try { const m = readPhotoVer(); m[k] = { v, t: Date.now() }; localStorage.setItem(PVER_KEY, JSON.stringify(m)); } catch(e){} }
  // Deep 13 Nov: per-session photo-existence probe cache for UNMARKED legacy
  // photos (uploaded before markers existed, so the shared record says nothing
  // about them). Three-state grid discovery: marker -> authoritative answer;
  // probe cache -> remembered answer; unknown -> one lazy server probe (pooled
  // by the grid loader), its result cached here. A photo-less row costs at most
  // one request per session, and a real legacy photo is never treated as absent.
  const PROBE_KEY = 'bbth-items-photoprobe-v1';
  function readProbe(){ try { return JSON.parse(sessionStorage.getItem(PROBE_KEY)||'{}'); } catch(e){ return {}; } }
  function setProbe(k, v){ try { const m = readProbe(); m[k] = v; sessionStorage.setItem(PROBE_KEY, JSON.stringify(m)); } catch(e){} }
  let loadBaseMeta = null;     // tombstones/hidden as they were when this editing session loaded - needed so an explicit un-delete/un-hide is not silently re-tombstoned on save
  async function loadCatalogue(){
    const base = await fetchBase();
    lastBaseV = (base && base.basev) || 3;
    let rec = await fetchServerDraft();
    const serverOk = !!(rec && rec.data && Array.isArray(rec.data.categories));
    if(serverOk){ adoptServerRec(rec); }
    let source = 'shared';
    if(!serverOk){
      rec = readLocal();
      source = rec && rec.data ? 'local-override' : 'fixture';
    }
    if(!rec || !rec.data) return { data: {note: base.note, groups: base.groups, categories: base.categories}, source: 'fixture', offline: !serverOk };

    let data = rec.data, ov = rec.basev || 2;
    let deleted = rec.deleted || [], deletedCats = rec.deletedCats || [];
    if(!rec.basev){
      // legacy override (pre-versioning): derive deletions by diffing the v2 base
      data = (rec && rec.data && Array.isArray(rec.data.categories)) ? rec.data : rec; ov = 1; deleted = []; deletedCats = [];
      try {
        const b2 = await fetch('/app/items/fixture-base-v2.json?v=1').then(r=>r.ok?r.json():null);
        if(b2){
          const ocats = new Map((data.categories||[]).map(c=>[normK(c.name), new Set(c.items.map(i=>normK(i.n)))]));
          b2.categories.forEach(c=>{
            const have = ocats.get(normK(c.name));
            if(!have){ deletedCats.push(c.name); return; }
            c.items.forEach(it=>{ if(!have.has(normK(it.n))) deleted.push(c.name+'|'+it.n); });
          });
        }
      } catch(e){}
    }
    // never render entries the tombstones name: records written by older app
    // versions (or a blind save) can still carry them inside data. This filters
    // the RENDERED list only - the saved record is not rewritten here.
    const dzf = new Set(deleted.map(normK)), dcf = new Set(deletedCats.map(normK));
    data.categories = data.categories.filter(c=>!dcf.has(normK(c.name)));
    data.categories.forEach(c=>{ c.items = (c.items||[]).filter(i=>!dzf.has(normK(c.name+'|'+i.n))); });
    if(ov >= base.basev) return { data, source, offline: !serverOk };
    // NON-DESTRUCTIVE merge: bring in new base categories/items; edits and
    // deletions always win. Names match case-insensitively (pre-title-case drafts).
    const delSet = new Set(deleted.map(normK)), delCats = new Set(deletedCats.map(normK));
    const cmap = new Map(data.categories.map(c=>[normK(c.name), c]));
    let addedItems = 0, addedCats = 0;
    base.categories.forEach(bc=>{
      if(delCats.has(normK(bc.name))) return;
      let tc = cmap.get(normK(bc.name));
      if(!tc){
        tc = JSON.parse(JSON.stringify(bc));
        data.categories.push(tc); cmap.set(normK(bc.name), tc); addedCats++; return;
      }
      const have = new Set(tc.items.map(i=>normK(i.n)));
      bc.items.forEach(it=>{
        if(!have.has(normK(it.n)) && !delSet.has(normK(bc.name+'|'+it.n))){
          tc.items.push(JSON.parse(JSON.stringify(it))); addedItems++;
        }
      });
    });
    const mergedRec = { basev: base.basev, data, deleted, deletedCats, renames: rec.renames || [], hidden: readHiddenLocal() };
    writeLocal(mergedRec);
    return { data, source, offline: !serverOk, merged: { items: addedItems, cats: addedCats } };
  }

  // local cache write (always safe)
  function saveCatalogue(data, deleted, deletedCats){
    const prev = readLocal();
    writeLocal({
      basev: 3, data,
      deleted: deleted || (prev && prev.deleted) || [],
      deletedCats: deletedCats || (prev && prev.deletedCats) || [],
      hidden: readHiddenLocal()
    });
  }
  // shared save: local cache + server (needs staff login)
  async function saveShared(data, deleted, deletedCats, renames, bin){
    // Never wipe changes made on another device/tab: union the SERVER's
    // tombstones, hidden-photo list, photo versions and recycle-bin entries
    // into this save, EXCEPT ones this session deliberately restored/un-hid
    // (present at load, removed since) - restores must stay possible. Then
    // drop any item the final tombstone set still names.
    let hidden = readHiddenLocal();
    let photoV = Object.assign({}, localPhotoOps);
    let finalBin = bin ? { items: Object.assign({}, bin.items||{}), cats: Object.assign({}, bin.cats||{}) } : { items:{}, cats:{} };
    // Verify against the server FIRST, FAIL CLOSED: if the shared record cannot
    // be read right now (network/http), do NOT save blind. A blind whole-record
    // write silently resurrects items, tombstones and photo deletions another
    // device saved since this session loaded. (404 = record not created yet.)
    let srv = null;
    try {
      const vr = await fetch('/api/items-catalogue', { cache: 'no-store' });
      if(vr.ok){ const vj = await vr.json(); srv = vj && vj.draft ? vj.draft : null; }
      else if(vr.status !== 404) return { ok:false, error:'verify-http-' + vr.status };
    } catch(e){ return { ok:false, error:'verify-network' }; }
    // Stale-online guard: if the server's record moved since this session
    // loaded it (another tab/device saved ANY change - renames, additions,
    // reordering, hides, photo swaps, not just deletions), block this save
    // instead of silently overwriting it. Unions below only protect their
    // own lists.
    if(srv && srv.data && lastServerFullJSON !== null && recCanon(srv) !== lastServerFullJSON){
      return { ok:false, error:'stale' };
    }
    try {
      if(srv && srv.data){
        const localDel = new Set((deleted||[]).map(normK));
        const localDelCats = new Set((deletedCats||[]).map(normK));
        const restored = new Set(((loadBaseMeta && loadBaseMeta.deleted)||[]).map(normK).filter(k=>!localDel.has(k)));
        const restoredCats = new Set(((loadBaseMeta && loadBaseMeta.deletedCats)||[]).map(normK).filter(k=>!localDelCats.has(k)));
        (srv.deleted||[]).forEach(k=>{ const nk = normK(k); if(!localDel.has(nk) && !restored.has(nk)){ deleted.push(k); localDel.add(nk); } });
        (srv.deletedCats||[]).forEach(k=>{ const nk = normK(k); if(!localDelCats.has(nk) && !restoredCats.has(nk)){ deletedCats.push(k); localDelCats.add(nk); } });
        data.categories = data.categories.filter(c=>!localDelCats.has(normK(c.name)));
        data.categories.forEach(c=>{ c.items = c.items.filter(i=>!localDel.has(normK(c.name+'|'+i.n))); });
        // hidden-photo union with the same restore exception
        const localHid = new Set(hidden.map(normK));
        const unhid = new Set(((loadBaseMeta && loadBaseMeta.hidden)||[]).map(normK).filter(k=>!localHid.has(k)));
        (srv.hidden||[]).forEach(k=>{ const nk = normK(k); if(!localHid.has(nk) && !unhid.has(nk)){ hidden.push(k); localHid.add(nk); } });
        hidden = hidden.filter(k=>!unhid.has(normK(k)));
        // photo versions: server's map, overlaid with this session's ops
        photoV = Object.assign({}, srv.photoV||{}, localPhotoOps);
        // recycle bin: union server bin, then drop entries that were restored
        const sb = srv.bin || {};
        finalBin.items = Object.assign({}, sb.items||{}, finalBin.items||{});
        finalBin.cats = Object.assign({}, sb.cats||{}, finalBin.cats||{});
        const restoredBinKeys = new Set(((loadBaseMeta && loadBaseMeta.binKeys)||[]).filter(k=>!(bin && bin.items && (k in bin.items))));
        Object.keys(finalBin.items).forEach(k=>{ if(!localDel.has(normK(k)) && !(finalBin.items[k] && finalBin.items[k].dupOf && !restoredBinKeys.has(k))) delete finalBin.items[k]; });
        Object.keys(finalBin.cats).forEach(k=>{ if(!localDelCats.has(normK(k))) delete finalBin.cats[k]; });
        // seed bin entries for items deleted on another device whose details
        // still exist in the base fixture (covers pre-bin-era tombstones)
        try {
          const base = await fetchBase();
          localDel.forEach(nk=>{ if(finalBin.items[nk]) return; outer: for(const c of base.categories){ for(const i of c.items){ if(normK(c.name+'|'+i.n) === nk){ finalBin.items[nk] = { cat: c.name, item: JSON.parse(JSON.stringify(i)) }; break outer; } } } });
          localDelCats.forEach(nk=>{ if(finalBin.cats[nk]) return; for(const c of base.categories){ if(normK(c.name) === nk){ finalBin.cats[nk] = { cat: JSON.parse(JSON.stringify(c)) }; break; } } });
        } catch(e){}
      }
    } catch(e){}
    const rec = {
      basev: lastBaseV, data,
      deleted: deleted || [], deletedCats: deletedCats || [],
      renames: renames || [],
      hidden,
      photoV,
      bin: finalBin
    };
    writeLocal(rec);
    const r = await pushDraft(rec);
    if(r && r.ok){ adoptServerRec(rec); }
    if(r) r.merged = { deleted: rec.deleted.slice(), deletedCats: rec.deletedCats.slice() };
    return r;
  }
  // merge a photo-only change (version marker, hide/unhide) onto the FRESHEST
  // server record - never rewrites item data, so a photo upload from a stale
  // tab cannot overwrite catalogue edits made elsewhere.
  async function pushServerPatch(patchFn){
    if(!token()) return false;
    if(SHARE_MODE === 'staged'){
      // staff staging: keep the previous behaviour - patch this user's staged draft
      const rec = readLocal();
      if(rec && rec.data){ patchFn(rec); await pushDraft(rec); }
      return true;
    }
    try {
      // Deep 13 Nov: fail-closed compare-and-swap. Patch the freshest record,
      // then re-verify the server has not moved before writing (another tab's
      // save landing between our read and write would otherwise be clobbered).
      // One retry on the fresh record; a second drift aborts. If the server
      // cannot be re-read at any point, do NOT write blind.
      for(let attempt = 0; attempt < 2; attempt++){
        const srv = await fetchServerDraft();
        if(!srv || !srv.data) return false;
        const before = recCanon(srv);
        patchFn(srv);
        const chk = await fetchServerDraft();
        if(!chk || !chk.data) return false;
        if(recCanon(chk) === before){
          const r = await pushDraft(srv);
          if(r && r.ok) adoptServerRec(srv);
          return !!(r && r.ok);
        }
      }
      return false;
    } catch(e){ return false; }
  }
  function getOverrideMeta(){
    // server record wins; the local cache is only an offline fallback
    if(lastServerMeta) return { deleted: lastServerMeta.deleted.slice(), deletedCats: lastServerMeta.deletedCats.slice(), renames: (lastServerMeta.renames||[]).slice(), bin: (lastServerRec && lastServerRec.bin) ? JSON.parse(JSON.stringify(lastServerRec.bin)) : { items:{}, cats:{} } };
    const r = readLocal();
    return (r && r.data) ? { deleted: r.deleted||[], deletedCats: r.deletedCats||[], renames: r.renames||[], bin: r.bin || { items:{}, cats:{} } } : null;
  }
  function importOverride(rec){
    if(!rec || !rec.data || !Array.isArray(rec.data.categories)) throw new Error('invalid backup file');
    writeLocal({ basev: rec.basev || lastBaseV, data: rec.data, deleted: rec.deleted||[], deletedCats: rec.deletedCats||[], renames: rec.renames||[], hidden: rec.hidden||readHiddenLocal() });
  }
  function exportOverride(){
    try { return localStorage.getItem(CAT_KEY); } catch(e){ return null; }
  }
  function blobToDataURL(b){
    return new Promise((res, rej)=>{ const fr = new FileReader(); fr.onload = ()=>res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  }
  async function dataURLToBlob(u){
    const r = await fetch(u); return await r.blob();
  }
  async function exportBackup(){
    const rec = readLocal();
    const photos = {};
    const keys = await allPhotoKeys();
    for(const k of keys){
      const b = await getPhoto(k);
      if(b) photos[k] = await blobToDataURL(b);
    }
    return JSON.stringify({
      kind: 'bbth-catalogue-backup', exported_at: new Date().toISOString(),
      basev: (rec && rec.basev) || 3, data: rec && rec.data ? rec.data : null,
      deleted: rec && rec.deleted || [], deletedCats: rec && rec.deletedCats || [],
      renames: rec && rec.renames || [],
      hidden: [...hiddenSet()], photos
    });
  }
  async function importBackup(rec){
    if(!rec || rec.kind !== 'bbth-catalogue-backup' || !rec.data || !Array.isArray(rec.data.categories))
      throw new Error('invalid backup file');
    writeLocal({ basev: rec.basev || lastBaseV, data: rec.data, deleted: rec.deleted||[], deletedCats: rec.deletedCats||[], renames: rec.renames||[], hidden: rec.hidden||[] });
    writeHiddenLocal(rec.hidden || []);
    const ph = rec.photos || {};
    for(const k of Object.keys(ph)){
      await putPhoto(k, await dataURLToBlob(ph[k]));
    }
  }
  function clearCatalogueOverride(){
    localStorage.removeItem(CAT_KEY);
  }
  async function clearLocalPhotos(){
    const d = await db();
    await new Promise((res, rej)=>{
      const tx = d.transaction('photos','readwrite');
      tx.objectStore('photos').clear();
      tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error);
    });
  }
  // full reset: shared draft + shared photos + local cache.
  // Staged (staff) mode: local cache only - the global store is never touched;
  // the reset takes effect only if the admin approves the next submitted draft.
  async function clearShared(){
    clearCatalogueOverride();
    writeHiddenLocal([]);
    if(SHARE_MODE === 'staged') return { ok:true, staged:true };
    if(!token()) return { ok:false, error:'no-login' };
    try {
      const r = await fetch('/api/items-catalogue', { method:'DELETE',
        headers:{ 'authorization':'Bearer '+token() } });
      return r.ok ? { ok:true } : { ok:false, error:'http-'+r.status };
    } catch(e){ return { ok:false, error:'network' }; }
  }
  function hasOverride(){ return !!localStorage.getItem(CAT_KEY); }

  // cheap "could this item have any photo at all?" check: consults the already
  // loaded draft record's photo markers + the static manifest - NO network.
  // Grids use it to skip one doomed server request per photo-less row.
  async function hasAnyPhotoHint(itemKey){
    const pv = (lastServerRec && lastServerRec.photoV) || {};
    const v = pv[itemKey];
    if(v && v !== '__del__') return true;
    if(v !== '__del__'){
      const tv = pv['t|'+itemKey];
      if(tv && tv !== '__del__') return true;
      // Deep 13 Nov: unmarked legacy photo - neither the record nor a marker
      // says whether one exists. Trust this session's probe cache when present;
      // otherwise answer "maybe" so the lazy loader probes the server once
      // instead of wrongly showing the row as photo-less.
      const pr = readProbe()[itemKey];
      if(pr === '1') return true;
      if(pr === '0'){ try { return !!(await photoFileFor(itemKey)); } catch(e){ return false; } }
      return true;
    }
    try { return !!(await photoFileFor(itemKey)); } catch(e){ return true; }
  }
  // grid thumbnails: small "t|"-prefixed copies uploaded alongside full photos.
  // Zero extra requests when no thumb marker exists - the draft record already
  // carries photoV, so the check is in-memory. Falls back to the full photo.
  // A '__del__' marker on EITHER the photo or its thumb means deliberate
  // deletion: serve the static catalogue file only, never a stored copy.
  async function getThumb(itemKey){
    if(hiddenSet().has(itemKey)) return null;
    const pv = (lastServerRec && lastServerRec.photoV) || {};
    if(pv[itemKey] === '__del__' || pv['t|'+itemKey] === '__del__'){
      const f0 = await photoFileFor(itemKey);
      if(!f0) return null;
      try { const r0 = await fetch('/app/items/photos/'+f0); return r0.ok ? await r0.blob() : null; }
      catch(e){ return null; }
    }
    const tv = pv['t|'+itemKey];
    if(tv){ try { const t = await getPhoto('t|'+itemKey); if(t) return t; } catch(e){} }
    return getPhoto(itemKey);
  }
  async function putPhoto(itemKey, blob){
    const d = await db();
    await new Promise((res, rej)=>{
      const tx = d.transaction('photos','readwrite');
      tx.objectStore('photos').put(blob, itemKey);
      tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error);
    });
    // un-hide on explicit upload
    const h = hiddenSet(); h.delete(itemKey); writeHiddenLocal([...h]);
    // shared copy (best effort; needs login)
    let dataURL = null;
    try { dataURL = await blobToDataURL(blob); await serverPhotoPut(itemKey, dataURL); } catch(e){}
    if(dataURL && photoIdxSet) photoIdxSet.add(itemKey);
    if(dataURL){
      const v = shash(dataURL);
      setPhotoVer(itemKey, v);
      localPhotoOps[itemKey] = v;
      // propagate version marker + un-hide onto the FRESHEST server record so
      // other devices invalidate their cache - never rewrites item data
      pushServerPatch(rec=>{
        rec.photoV = Object.assign({}, rec.photoV||{}, { [itemKey]: v });
        const hh = new Set(rec.hidden||[]); hh.delete(itemKey); rec.hidden = [...hh];
      }).catch(()=>{});
    }
  }
  function hiddenSet(){
    return new Set(readHiddenLocal());
  }

  // Exact photo presence in ONE request (photos-index endpoint, newer
  // backends). undefined = not loaded yet, null = endpoint unavailable (older
  // backend) - then photoSplitHint falls back to markers + probe cache.
  let photoIdxSet = undefined;
  async function loadPhotoIndex(){
    if(photoIdxSet !== undefined) return photoIdxSet;
    try {
      const r = await fetch('/api/items-catalogue/photos-index');
      if(!r.ok){ photoIdxSet = null; return null; }
      const j = await r.json();
      photoIdxSet = (j && Array.isArray(j.keys)) ? new Set(j.keys) : null;
    } catch(e){ photoIdxSet = null; }
    if(photoIdxSet){
      try { const m = await photosManifest(); Object.keys(m.exact).forEach(k => photoIdxSet.add(k)); } catch(e){}
    }
    return photoIdxSet;
  }
  // Synchronous split for the two-section picker (Deep 13 Nov "catalogue
  // create karte waqt hi do sections me divide karo"): 'photo' renders as a
  // grid card, 'name' goes to the numbered no-photo name list. Unknowns stay
  // 'photo' so they still lazy-probe exactly as before - never wrongly listed
  // as photo-less.
  function photoSplitHint(itemKey){
    if(hiddenSet().has(itemKey)) return 'name';
    if(photoIdxSet) return (photoIdxSet.has(itemKey) || photoIdxSet.has('t|'+itemKey)) ? 'photo' : 'name';
    const pv = (lastServerRec && lastServerRec.photoV) || {};
    const v = pv[itemKey];
    if(v && v !== '__del__') return 'photo';
    if(v === '__del__') return 'photo'; // a bundled static catalogue photo may still show
    const tv = pv['t|'+itemKey];
    if(tv && tv !== '__del__') return 'photo';
    const pr = readProbe()[itemKey];
    if(pr === '0') return 'name';
    return 'photo';
  }
  function hidePhoto(itemKey){
    const h = hiddenSet(); h.add(itemKey);
    writeHiddenLocal([...h]);
    // sync tombstone onto the FRESHEST server record (best effort)
    pushServerPatch(rec=>{
      const hh = new Set(rec.hidden||[]); hh.add(itemKey); rec.hidden = [...hh];
    }).catch(()=>{});
  }
  function unhidePhoto(itemKey){
    const h = hiddenSet(); h.delete(itemKey);
    writeHiddenLocal([...h]);
    pushServerPatch(rec=>{
      const hh = new Set(rec.hidden||[]); hh.delete(itemKey); rec.hidden = [...hh];
    }).catch(()=>{});
  }
  async function getPhoto(itemKey){
    if(hiddenSet().has(itemKey)) return null;
    // version check first: the draft record (already fetched at load/refresh)
    // carries a content marker per photo; an unchanged marker means the local
    // copy is current - serve it with zero network. A '__del__' marker means
    // the server photo was deliberately deleted: never serve or re-upload a
    // local copy.
    const pv = (lastServerRec && lastServerRec.photoV) || {};
    const v = pv[itemKey];
    if(v === '__del__'){
      const f0 = await photoFileFor(itemKey);
      if(!f0) return null;
      try { const r0 = await fetch('/app/items/photos/'+f0); return r0.ok ? await r0.blob() : null; }
      catch(e){ return null; }
    }
    const lent = readPhotoVer()[itemKey];
    if(v && lent && lent.v === v){ // marker match alone: a matching content hash means the photo is current, no time-based staleness
      const loc0 = await idbGet(itemKey);
      if(loc0) return loc0;
    }
    // server-first (31 Oct sync fix): the shared store is authoritative, so
    // photo updates, deletions and hides made on any device reach every
    // device. IndexedDB is the offline fallback only.
    let remote = null, serverReachable = true;
    try { remote = await serverPhotoGet(itemKey); } catch(e){ serverReachable = false; }
    if(remote){
      setProbe(itemKey, '1');
      try {
        const b = await dataURLToBlob(remote);
        await putPhotoLocalOnly(itemKey, b);
        setPhotoVer(itemKey, shash(remote));
        // no marker backfill here: merely VIEWING a photo must never write the
        // shared record. Markers are written by real photo mutations (upload,
        // delete, offline-heal upload); unmarked photos stay server-first.
        return b;
      } catch(e){}
    }
    const local = await idbGet(itemKey);
    if(serverReachable && !remote) setProbe(itemKey, local ? '1' : '0');
    if(local){
      // Online + server has no photo for this key: heal the shared store
      // (covers a photo uploaded while this device was offline). Never heal
      // when the server record carries a version marker - the server state is
      // authoritative then.
      if(serverReachable && !v){
        // re-verify the marker FRESH before healing: another device may have
        // deleted this photo since this tab loaded the record. '__del__' (or a
        // failed re-check) means do not resurrect the local copy.
        let freshV;
        try { const srv = await fetchServerDraft(); freshV = (srv && srv.photoV) ? srv.photoV[itemKey] : null; }
        catch(e){ return local; }
        if(freshV === '__del__') return null;
        if(freshV) return local;
        try {
          const du = await blobToDataURL(local);
          await serverPhotoPut(itemKey, du);
          if(token() && SHARE_MODE !== 'staged'){
            const vv = shash(du);
            localPhotoOps[itemKey] = vv;
            pushServerPatch(rec=>{ rec.photoV = Object.assign({}, rec.photoV||{}, { [itemKey]: vv }); }).catch(()=>{});
          }
        } catch(e){}
      }
      return local;
    }
    // static catalogue photo (shipped with the site), keyed "Category|Item Name"
    const f = await photoFileFor(itemKey);
    if(!f) return null;
    try { const r = await fetch('/app/items/photos/'+f); return r.ok ? await r.blob() : null; }
    catch(e){ return null; }
  }
  function idbGet(itemKey){
    return db().then(d=>new Promise((res, rej)=>{
      const tx = d.transaction('photos','readonly');
      const q = tx.objectStore('photos').get(itemKey);
      q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>rej(q.error);
    }));
  }
  async function putPhotoLocalOnly(itemKey, blob){
    const d = await db();
    return new Promise((res, rej)=>{
      const tx = d.transaction('photos','readwrite');
      tx.objectStore('photos').put(blob, itemKey);
      tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error);
    });
  }
  // merge a photo-only change (version marker, hide/unhide) onto the FRESHEST
  // server record - never rewrites item data, so a photo op from a stale tab
  // cannot overwrite catalogue edits made elsewhere.
  async function pushServerPatch(patchFn){
    if(!token()) return false;
    if(SHARE_MODE === 'staged'){
      // staff staging: keep the previous behaviour - patch this user's staged draft
      const rec = readLocal();
      if(rec && rec.data){ patchFn(rec); await pushDraft(rec); }
      return true;
    }
    try {
      // Deep 13 Nov: fail-closed compare-and-swap. Patch the freshest record,
      // then re-verify the server has not moved before writing (another tab's
      // save landing between our read and write would otherwise be clobbered).
      // One retry on the fresh record; a second drift aborts. If the server
      // cannot be re-read at any point, do NOT write blind.
      for(let attempt = 0; attempt < 2; attempt++){
        const srv = await fetchServerDraft();
        if(!srv || !srv.data) return false;
        const before = recCanon(srv);
        patchFn(srv);
        const chk = await fetchServerDraft();
        if(!chk || !chk.data) return false;
        if(recCanon(chk) === before){
          const r = await pushDraft(srv);
          if(r && r.ok) adoptServerRec(srv);
          return !!(r && r.ok);
        }
      }
      return false;
    } catch(e){ return false; }
  }
  // refresh check: fetch the server record; when it changed, adopt it unless
  // the caller says local edits are unsaved (deferAdopt) - then only report.
  async function checkServerNow(opts){
    if(!lastServerFullJSON) return null;
    let rec = null;
    try { rec = await fetchServerDraft(); } catch(e){ return null; }
    if(!rec || !rec.data) return null;
    if(recCanon(rec) === lastServerFullJSON) return null;
    if(!(opts && opts.deferAdopt)) adoptServerRec(rec);
    return rec;
  }
  let watchCb = null, watchDirty = null, lastWatch = 0;
  function startFocusRefresh(cb, isDirty){
    watchCb = cb; watchDirty = isDirty || null;
    const run = async ()=>{
      if(document.hidden) return;
      const now = Date.now();
      if(now - lastWatch < 60000) return; // manual button + focus/visibility only; no polling timer
      lastWatch = now;
      const dirty = watchDirty && watchDirty();
      const rec = await checkServerNow({ deferAdopt: dirty });
      if(rec && watchCb) watchCb(rec, dirty);
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
  }
  async function delPhoto(itemKey){
    const d = await db();
    await new Promise((res, rej)=>{
      const tx = d.transaction('photos','readwrite');
      tx.objectStore('photos').delete(itemKey);
      tx.objectStore('photos').delete('t|'+itemKey);
      tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error);
    });
    try { await serverPhotoDel(itemKey); } catch(e){}
    try { await serverPhotoDel('t|'+itemKey); } catch(e){}
    if(photoIdxSet){ photoIdxSet.delete(itemKey); photoIdxSet.delete('t|'+itemKey); }
    localPhotoOps[itemKey] = '__del__';
    localPhotoOps['t|'+itemKey] = '__del__';
    setPhotoVer(itemKey, '__del__');
    pushServerPatch(rec=>{ rec.photoV = Object.assign({}, rec.photoV||{}, { [itemKey]: '__del__', ['t|'+itemKey]: '__del__' }); }).catch(()=>{});
  }
  async function allPhotoKeys(){
    const d = await db();
    const localKeys = await new Promise((res, rej)=>{
      const tx = d.transaction('photos','readonly');
      const q = tx.objectStore('photos').getAllKeys();
      q.onsuccess = ()=>res(q.result || []); q.onerror = ()=>rej(q.error);
    });
    const man = await photosManifest();
    const h = hiddenSet();
    return [...new Set([...localKeys, ...Object.keys(man.exact)])].filter(k=>!h.has(k));
  }
  // one-time migration: push photos that exist only in THIS browser to the shared store
  async function syncLocalPhotosToServer(){
    if(!token()) return { uploaded: 0 };
    // never resurrect a deliberately deleted photo: the shared record's
    // '__del__' markers are authoritative - purge THIS browser's copy instead.
    let pvDel = {};
    try { const srv = await fetchServerDraft(); pvDel = (srv && srv.photoV) || {}; } catch(e){}
    const d = await db();
    const localKeys = await new Promise((res, rej)=>{
      const tx = d.transaction('photos','readonly');
      const q = tx.objectStore('photos').getAllKeys();
      q.onsuccess = ()=>res(q.result || []); q.onerror = ()=>rej(q.error);
    });
    let uploaded = 0;
    for(const k of localKeys){
      if(pvDel[k] === '__del__'){
        try { await new Promise((res, rej)=>{ const tx = d.transaction('photos','readwrite'); tx.objectStore('photos').delete(k); tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error); }); } catch(e){}
        continue;
      }
      let have = null; try { have = await serverPhotoGet(k); } catch(e){ break; }
      if(have) continue;
      const b = await new Promise((res, rej)=>{
        const tx = d.transaction('photos','readonly');
        const q = tx.objectStore('photos').get(k);
        q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>rej(q.error);
      });
      if(!b) continue;
      if(await serverPhotoPut(k, await blobToDataURL(b))) uploaded++;
    }
    return { uploaded };
  }

  let photosp = null;
  function photosManifest(){
    if(photosp) return photosp;
    photosp = fetch('/app/items/photos/photos-manifest.json?v=4').then(r=>r.ok?r.json():{}).then(m=>{
      const lc = {}; Object.keys(m).forEach(k=>{ lc[String(k).trim().toLowerCase()] = m[k]; });
      return { exact: m, lc };
    }).catch(()=>({exact:{},lc:{}}));
    return photosp;
  }
  async function photoFileFor(itemKey){
    const m = await photosManifest();
    return m.exact[itemKey] || m.lc[String(itemKey).trim().toLowerCase()] || null;
  }

  // downscale an uploaded image file to a compact JPEG blob (max 900px, q .85)
  function processImage(file){
    return new Promise((res, rej)=>{
      const img = new Image();
      img.onload = ()=>{
        const max = 900;
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, max / Math.max(w, h));
        w = Math.round(w*scale); h = Math.round(h*scale);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', 0.85);
      };
      img.onerror = ()=>rej(new Error('image load failed'));
      img.src = URL.createObjectURL(file);
    });
  }

  return { loadCatalogue, saveCatalogue, saveShared, clearCatalogueOverride, clearShared, hasOverride, setShareMode, shareMode,
    putPhoto, getPhoto, getThumb, hasAnyPhotoHint, delPhoto, allPhotoKeys, clearLocalPhotos, processImage, hidePhoto, unhidePhoto, photosManifest,
    loadPhotoIndex, photoSplitHint,
    getOverrideMeta, importOverride, exportOverride, exportBackup, importBackup,
    syncLocalPhotosToServer, checkServerNow, startFocusRefresh };
})();
