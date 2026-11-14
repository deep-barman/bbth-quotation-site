// BBTH Catalogue Admin - staging draft editor. LOCAL persistence only (store.js).
// Never calls any /api write. Never touches live D1.
(function(){
  // Cross-tab logout guard (shared, /js/crosstab.js): gate when this session predates the
  // last logout signal; unsaved catalogue edits are never blindly reloaded away.
  if(BBTHXTab.install()) return;
  function token(){ return sessionStorage.getItem('bbth-admin-token') || localStorage.getItem('bbth-admin-token') || ''; }
  function role(){ return sessionStorage.getItem('bbth-role') || localStorage.getItem('bbth-role') || ''; }
  const main = document.getElementById('main');
  if(!token()){
    main.innerHTML = '<div class="gate"><img src="/assets/logo-lockup-dark.png?v=6" alt="BBTH"><h2>Login required</h2><p>This tool is private. Log in from the staff portal first.</p><a class="btn-solid" href="/app/">Go to login</a></div>';
    return;
  }
  function start(editorMode){
  const S = window.ItemsStore;
  const STAFF_MODE = editorMode === 'staff';
  function syncEmbedFullpage(on){
    try { if(window.frameElement) window.frameElement.classList.toggle('iframe-fullpage', !!on); } catch(e){}
  }
  try { if(localStorage.getItem('bbth-admin-fullpage') === '1'){ document.body.classList.add('fullpage'); syncEmbedFullpage(true); } } catch(e){}
  if(STAFF_MODE) S.setShareMode('staged');
  let PENDING_STAGE = [];
  async function refreshPending(){
    if(STAFF_MODE) return;
    try {
      const r = await fetch('/api/items-catalogue/stage', { headers: { authorization: 'Bearer ' + token() }, cache: 'no-store' });
      if(r.ok){ const j = await r.json(); PENDING_STAGE = (Array.isArray(j.pending) ? j.pending : []).map(p => typeof p === 'string' ? { user: p, meta: null } : p); }
    } catch(e){}
  }
  let DATA = null, SOURCE = 'fixture', dirty = false;
  const photoCache = {}; // key -> objectURL

  function escH(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function key(cat,n){ return cat+'|'+n; }

  let DELETED = [], DELETEDCATS = [], RENAMES = [], MERGED = null, FILTER_Q = '', BIN = { items:{}, cats:{} };
  const normk = s => String(s||'').trim().toLowerCase();
  function addRename(from, to){
    const f=(from||'').trim(), t=(to||'').trim();
    if(!f || !t || f.toLowerCase()===t.toLowerCase()) return;
    for(const r of RENAMES){ if((r.to||'').toLowerCase()===f.toLowerCase()){ r.to=t; return; } }
    RENAMES.push({ from: f, to: t });
  }
  Promise.all([S.loadCatalogue(), refreshPending()]).then(([res])=>{
    DATA = res.data; SOURCE = res.source; MERGED = res.merged || null;
    // one-time migration: this browser's previously uploaded photos -> shared store
    if(S.syncLocalPhotosToServer) S.syncLocalPhotosToServer().then(r=>{
      if(r && r.uploaded){ const m=document.getElementById('msg'); if(m) m.textContent = r.uploaded + ' photos synced to the site.'; }
    }).catch(()=>{});
    const meta = S.getOverrideMeta ? S.getOverrideMeta() : null;
    if(meta){ DELETED = meta.deleted.slice(); DELETEDCATS = meta.deletedCats.slice(); RENAMES = (meta.renames||[]).slice(); BIN = meta.bin ? { items: Object.assign({}, meta.bin.items||{}), cats: Object.assign({}, meta.bin.cats||{}) } : { items:{}, cats:{} }; }
    // cross-device freshness: when another device saved changes, refresh this
    // editor - silently when there are no unsaved edits, with a banner otherwise.
    if(S.startFocusRefresh) S.startFocusRefresh(()=>{
      if(dirty){ const sb=document.getElementById('syncbar'); if(sb) sb.style.display=''; }
      else reloadFromServer('Catalogue updated - changes from another device loaded.');
    }, ()=>dirty);
    render();
    if(res.offline){
      // server unreachable: catalogue shown from a cache/the base fixture and
      // may include items someone already deleted. Block saving so a stale
      // state can never be pushed back over the shared catalogue.
      const m = document.getElementById('msg');
      if(m) m.textContent = 'Offline - this list may be out of date. Editing and Save are disabled until you reload with a connection.';
      const b = document.getElementById('btnSave'); if(b) b.disabled = true;
      const b2 = document.getElementById('btnRestore'); if(b2) b2.disabled = true;
    }
    if(MERGED && (MERGED.items || MERGED.cats)){
      const m = document.getElementById('msg');
      if(m) m.textContent = 'New catalogue items arrived: +' + MERGED.items + ' items' + (MERGED.cats?', +'+MERGED.cats+' categories':'') + ' - your edits/deletes are safe. Press Save draft.';
    }
  });

  async function reloadFromServer(note){
    const res = await S.loadCatalogue();
    DATA = res.data; SOURCE = res.source; dirty = false;
    const meta = S.getOverrideMeta ? S.getOverrideMeta() : null;
    if(meta){ DELETED = meta.deleted.slice(); DELETEDCATS = meta.deletedCats.slice(); RENAMES = (meta.renames||[]).slice(); BIN = meta.bin ? { items: Object.assign({}, meta.bin.items||{}), cats: Object.assign({}, meta.bin.cats||{}) } : { items:{}, cats:{} }; }
    UNDO.past.length = 0; UNDO.future.length = 0; UNDO.pendingPhotos = [];
    render();
    if(note) flash(note, 6000);
  }
  function catNames(){ return DATA.categories.map(c=>c.name); }
  function it_n_cur(D, inp){ const c=D.categories[+inp.dataset.ci]; const i=c&&c.items[+inp.dataset.ii]; return i?i.n:''; }

  function setBusy(on, text){
    ['btnSave','btnAddCat','btnBackup','btnRestore','btnReset'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled = !!on; });
    const m = document.getElementById('msg');
    if(m && text !== undefined) m.textContent = text;
  }
  function flash(text, ms){
    const m = document.getElementById('msg');
    if(m) m.textContent = text;
    setTimeout(()=>{ const mm=document.getElementById('msg'); if(mm && mm.textContent===text) mm.textContent=''; }, ms || 6000);
  }

  function render(){
    let html = '<div class="toolbar">'
      + '<button id="btnSave" class="btn-solid">' + (STAFF_MODE ? 'Submit for admin approval' : 'Save (live for everyone on the site)') + '</button>'
      + '<button id="btnUndo" class="btn-line" disabled>&#8617; Undo</button>'
      + '<button id="btnRedo" class="btn-line" disabled>&#8618; Redo</button>'
      + '<button id="btnAddCat" class="btn-line">+ Category</button>'
      + '<button id="btnBackup" class="btn-line">Backup</button>'
      + '<button id="btnRestore" class="btn-line">Restore</button>'
      + '<button id="btnReset" class="btn-danger">Reset to original list</button>'
      + '<button id="btnBin" class="btn-line" title="Deleted items and categories - restore from here">Recycle bin</button>'
      + '<button id="btnCheck" class="btn-line" title="Check whether another device saved changes">&#8635; Check for updates</button>'
      + '<button id="btnFullPage" class="btn-line" title="Expand the editor to the full page width">' + (document.body.classList.contains('fullpage') ? 'Exit full page' : 'Full page') + '</button>'
      + '<input id="catSearch" type="search" placeholder="Search items or categories..." autocomplete="off" style="flex:1;min-width:170px;max-width:340px;padding:9px 12px;border:1.5px solid #cfd8c9;border-radius:10px;font:inherit;font-size:14px">'
      + '<span class="spacer"></span>'
      + '<span class="srnote" style="font-size:12px;color:#7a8a72;white-space:nowrap">Serial = position inside its category</span>'
      + '<span class="srcnote">Source: ' + (SOURCE==='shared'?'shared site draft':SOURCE==='local-override'?'your saved draft (this browser)':'original fixture') + (dirty?' - UNSAVED changes':'') + '</span>'
      + '<span id="msg" class="msg"></span></div>'
      + '<datalist id="catlist">' + catNames().map(n=>'<option value="'+escH(n)+'">').join('') + '</datalist>';
    if(!STAFF_MODE && PENDING_STAGE.length){
      html += '<div class="stagebar"><b>Staff edits waiting for approval:</b> ' + PENDING_STAGE.map(p =>
        '<span class="stageuser">' + escH(p.user) + (p.meta && p.meta.at ? ' <span style="opacity:.65;font-size:12px">' + escH(new Date(p.meta.at).toLocaleString()) + '</span>' : '') + '</span>'
        + '<button class="ibtn" data-reviewstage="' + escH(p.user) + '">Review changes</button>'
        + '<button class="ibtn" data-applystage="' + escH(p.user) + '">Apply (go live)</button>'
        + '<button class="ibtn del" data-discardstage="' + escH(p.user) + '">Discard</button>').join(' ') + '</div>'
        + '<div id="stageDetail" class="stagebar" style="display:none"></div>';
    }
    if(STAFF_MODE){
      html += '<div class="stagebar staff">You are editing as staff: your Save submits the catalogue to the admin for approval. Nothing goes live until the admin applies it.</div>';
    }
    html += '<div id="syncbar" class="stagebar" style="display:none">The catalogue was changed on another device. Your unsaved edits are safe - <button class="ibtn" id="btnSyncReload">reload the latest</button> (your unsaved edits will be dropped) or keep editing and Save after reloading.</div>'
      + '<div id="binbar" class="stagebar" style="display:none"></div>';

    DATA.categories.forEach((cat,ci)=>{
      html += '<div class="catblock"><div class="cathead">'
        + '<input class="cname" data-ci="'+ci+'" value="'+escH(cat.name)+'">'
        + '<span class="fedit" style="display:none"><button class="ibtn ok" data-cnok="'+ci+'" title="Save this category name now (live)">&#10003;</button><button class="ibtn" data-cncancel="'+ci+'" title="Discard the change">&#10005;</button></span>'
        + '<span class="cnt">'+cat.items.length+' items</span>'
        + '<button class="ibtn del" data-delcat="'+ci+'">Delete category</button></div>';
      cat.items.forEach((it,ii)=>{
        const k = key(cat.name, it.n);
        const url = photoCache[k];
        html += '<div class="itrow">'
          + '<div class="it-photo">'
          + '<div class="thumb" data-k="'+escH(k)+'" title="Click to '+(url?'change':'upload')+' photo">'+(url?'<img src="'+url+'" alt="">':'<span>+<br>photo</span>')+'</div>'
          + '<button class="ibtn up" data-uphoto="'+escH(k)+'">'+(url?'Change photo':'Upload photo')+'</button>'
          + (url?'<button class="ibtn dl" data-dlphoto="'+escH(k)+'" title="Download this photo - file saves with the item name">Download</button>':'')
          + (url?'<button class="ibtn del" data-rmphoto="'+escH(k)+'">Remove photo</button>':'')
          + '</div>'
          + '<div class="it-main">'
          + '<div class="it-field f-nm"><label>Item name</label><input class="nm" data-ci="'+ci+'" data-ii="'+ii+'" value="'+escH(it.n)+'"><span class="fedit" style="display:none"><button class="ibtn ok" data-nmok="'+ci+'|'+ii+'" title="Save this name now (live)">&#10003;</button><button class="ibtn" data-nmcancel="'+ci+'|'+ii+'" title="Discard the change">&#10005;</button></span></div>'
          + '<div class="it-field f-ct"><label>Category</label><input class="ct" list="catlist" data-ci="'+ci+'" data-ii="'+ii+'" value="'+escH(cat.name)+'"></div>'
          + '<div class="it-field f-sr"><label>Sl.</label><div class="srwrap"><button type="button" class="srbtn" data-srstep="-1" data-ci="'+ci+'" data-ii="'+ii+'" title="Move one position earlier">&#8722;</button><input class="sr" type="number" min="1" step="1" value="' + (ii+1) + '" data-ci="'+ci+'" data-ii="'+ii+'" title="Serial number: position within this category - type a number to move the item there"><button type="button" class="srbtn" data-srstep="1" data-ci="'+ci+'" data-ii="'+ii+'" title="Move one position later">+</button></div></div>'
          + '<button class="ibtn del it-del" data-delitem="'+ci+'|'+ii+'" title="Delete this item">Delete</button>'
          + '</div></div>';
      });
      html += '<div class="addrow"><button class="btn-line additem" data-additem="'+ci+'">+ Add item to this category</button></div></div>';
    });
    main.innerHTML = html;
    bind();
    renderBin();
    loadThumbs();
  }


  async function doSave(){
    const btn = document.getElementById('btnSave');
    const m = document.getElementById('msg');
    btnLoad(btn, true);
    m.textContent = STAFF_MODE ? 'Submitting for approval...' : 'Saving...';
    const r = await S.saveShared(DATA, DELETED, DELETEDCATS, RENAMES, BIN);
    btnLoad(btn, false);
    if(r.ok){
      dirty=false; SOURCE = 'shared';
      if(r.merged){ DELETED = r.merged.deleted.slice(); DELETEDCATS = r.merged.deletedCats.slice(); }
    }
    render();
    const m2 = document.getElementById('msg');
    if(m2){
      if(r.ok){
        m2.textContent = STAFF_MODE ? 'Submitted - goes live when the admin approves' : 'Saved - live for everyone on the site';
        setTimeout(()=>{const mm=document.getElementById('msg'); if(mm) mm.textContent='';},5000);
      } else {
        m2.textContent = (r.error === 'stale')
          ? 'NOT SAVED - the catalogue was changed in another tab or device since you opened it. Reload to see the latest, then redo your change. Nothing was overwritten.'
          : 'SAVE FAILED ('+r.error+') - your changes are only in this browser and will be lost on reload. Do not keep editing; reload and try again.';
      }
    }
    return r;
  }

  function renderBin(){
    const bb = document.getElementById('binbar');
    if(!bb) return;
    const itemKeys = Object.keys(BIN.items||{});
    const catKeys = Object.keys(BIN.cats||{});
    // bin keys may be normalized (lowercase) while tombstones keep original
    // case - compare normalized everywhere or entries double-list
    const binItemNorm = new Set(itemKeys.map(normk));
    const binCatNorm = new Set(catKeys.map(normk));
    const looseCount = DELETED.filter(k=>!binItemNorm.has(normk(k))).length + DELETEDCATS.filter(k=>!binCatNorm.has(normk(k))).length;
    const bbtn = document.getElementById('btnBin');
    if(bbtn) bbtn.textContent = 'Recycle bin (' + (itemKeys.length + catKeys.length + looseCount) + ')';
    if(!itemKeys.length && !catKeys.length && !looseCount){ bb.innerHTML = '<b>Recycle bin:</b> empty - deleted items and categories wait here and can be restored.'; return; }
    let h = '<div class="binhead"><b>Recycle bin</b><span class="binsub">Deleted entries stay listed here until restored. Restore puts the entry back and saves.</span></div>';
    catKeys.forEach(ck=>{
      const disp = (BIN.cats[ck] && BIN.cats[ck].cat && BIN.cats[ck].cat.name) || ck;
      h += '<div class="binsec"><div class="binsechead">' + escH(disp) + ' <span class="binmark">(whole category)</span></div>'
        + '<div class="binrow"><span class="binname">' + escH(disp) + '</span>'
        + '<button class="ibtn" data-rstcat="' + escH(ck) + '">Restore category</button></div></div>';
    });
    // older name-only category deletions (no captured details) still get a row
    DELETEDCATS.filter(k=>!binCatNorm.has(normk(k))).forEach(ck=>{
      h += '<div class="binsec"><div class="binsechead">' + escH(ck) + ' <span class="binmark">(whole category)</span></div>'
        + '<div class="binrow"><span class="binname">' + escH(ck) + '</span><span class="binmark">(earlier deletion)</span>'
        + '<button class="ibtn" data-rstcat="' + escH(ck) + '">Restore category</button></div></div>';
    });
    // one row per entry, grouped under its category: full-detail bin entries
    // first, then older name-only tombstones (details recovered from the
    // original list where possible)
    const byCat = {};
    const pushRow = (catDisp, e)=>{ const nk = normk(catDisp); (byCat[nk] = byCat[nk] || { disp: catDisp, rows: [] }).rows.push(e); };
    itemKeys.forEach(k=>{ const c = (BIN.items[k] && BIN.items[k].cat) || k.split('|')[0]; pushRow(c, { k, name: (BIN.items[k].item && BIN.items[k].item.n) || k.split('|').slice(1).join('|'), full: true }); });
    const loose = DELETED.filter(k=>!binItemNorm.has(normk(k)));
    loose.forEach(k=>{ pushRow(k.split('|')[0], { k, name: k.split('|').slice(1).join('|'), full: false }); });
    // merge history is not a deletion: a tombstone whose item name is a rename
    // source was folded into another entry, so restoring it would duplicate the
    // target. List it as history with its destination, no Restore button.
    const mergedInto = {};
    (RENAMES || []).forEach(r=>{ if(r && r.from && r.to) mergedInto[normk(r.from)] = r.to; });
    Object.keys(byCat).sort((a,b)=>byCat[a].disp.localeCompare(byCat[b].disp)).forEach(c=>{
      h += '<div class="binsec"><div class="binsechead">' + escH(byCat[c].disp) + ' (' + byCat[c].rows.length + ')</div>';
      byCat[c].rows.forEach(e=>{
        const mi = mergedInto[normk(e.name)];
        h += '<div class="binrow"><span class="binname">' + escH(e.name) + '</span>'
          + (mi ? '<span class="binmark">(merged into ' + escH(mi) + ')</span>'
               : (e.full ? '' : '<span class="binmark">(earlier deletion)</span>')
                 + '<button class="ibtn" data-rst' + (e.full ? 'item' : 'old') + '="' + escH(e.k) + '">Restore</button>')
          + '</div>';
      });
      h += '</div>';
    });
    bb.innerHTML = h;
    bb.querySelectorAll('[data-rstitem]').forEach(b=>b.addEventListener('click', async ()=>{
      const k = b.dataset.rstitem;
      const ent = BIN.items[k];
      if(!ent) return;
      snapBefore();
      DELETED = DELETED.filter(x=>normk(x) !== normk(k));
      delete BIN.items[k];
      let cat = DATA.categories.find(c=>normk(c.name) === normk(ent.cat));
      if(!cat){ cat = { name: ent.cat, items: [] }; DATA.categories.push(cat); }
      // a deleted duplicate COPY restores as a second same-name row on purpose
      if(ent.dupOf){ cat.items.push(ent.item); }
      else if(!cat.items.some(i=>normk(i.n) === normk(ent.item.n))) cat.items.push(ent.item);
      markDirty(); render();
      flash('Restored "' + ent.item.n + '" - saving...');
      await doSave();
    }));
    bb.querySelectorAll('[data-rstold]').forEach(b=>b.addEventListener('click', async ()=>{
      const k = b.dataset.rstold;
      const catName = k.split('|')[0], itemName = k.split('|').slice(1).join('|');
      snapBefore();
      DELETED = DELETED.filter(x=>normk(x) !== normk(k));
      // try to recover the item details from the original fixture
      let def = null;
      try {
        const fx = await fetch('/app/items/fixture-catalogue.json?v=4').then(r=>r.ok?r.json():null);
        if(fx) outer: for(const c of (fx.categories||[])) for(const i of (c.items||[]))
          if(normk(i.n) === normk(itemName)){ def = JSON.parse(JSON.stringify(i)); break outer; }
      } catch(e){}
      if(def){
        let cat = DATA.categories.find(c=>normk(c.name) === normk(catName));
        if(!cat){ cat = { name: catName, items: [] }; DATA.categories.push(cat); }
        if(!cat.items.some(i=>normk(i.n) === normk(def.n))) cat.items.push(def);
      }
      markDirty(); render();
      flash(def ? ('Restored "' + itemName + '" from the original list - saving...') : ('Tombstone removed for "' + itemName + '" - the name was not in the original list, re-add it manually if needed. Saving...'));
      await doSave();
    }));
    bb.querySelectorAll('[data-rstcat]').forEach(b=>b.addEventListener('click', async ()=>{
      const ck = b.dataset.rstcat;
      const ent = BIN.cats[ck];
      if(!ent) return;
      snapBefore();
      DELETEDCATS = DELETEDCATS.filter(x=>normk(x) !== normk(ck));
      delete BIN.cats[ck];
      if(!DATA.categories.some(c=>normk(c.name) === normk(ck))) DATA.categories.push(ent.cat);
      markDirty(); render();
      flash('Restored category "' + ck + '" - saving...');
      await doSave();
    }));
  }

  // Download this item's current photo; the saved file is named exactly
  // after the item (Deep 7 Nov: files named per item for his re-upload ZIP flow).
  async function downloadPhoto(k){
    let blob = null;
    const url = photoCache[k];
    if(url){ try{ blob = await (await fetch(url)).blob(); }catch(e){} }
    if(!blob){ try{ blob = await S.getPhoto(k); }catch(e){} }
    if(!blob){ const m=document.getElementById('msg'); if(m) m.textContent='Photo could not be loaded - please try again.'; return; }
    const item = k.split('|').slice(1).join('|') || k;
    const safe = item.replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim() || 'photo';
    let ext = (blob.type && blob.type.indexOf('image/')===0) ? blob.type.slice(6) : 'jpg';
    if(ext === 'jpeg') ext = 'jpg';
    const ou = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = ou; a.download = safe + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(ou), 10000);
  }

  async function removePhoto(k){
    snapBefore();
    const before=await S.getPhoto(k);
    recordPhotoOp(k, before, null, true);
    await S.delPhoto(k);
    if(S.hidePhoto) S.hidePhoto(k); // tombstone static catalogue photos too
    delete photoCache[k]; render();
  }
  // Lazy thumbnails (Deep 25 Oct 18:14 "hang" complaint): only rows near the
  // viewport fetch their photo; the rest load as they scroll in. In-place DOM
  // update - no full re-render per photo.
  async function loadThumbs(){
    const thumbs = [...main.querySelectorAll('.thumb[data-k]')];
    const loadOne = async (el)=>{
      const k = el.dataset.k;
      if(!k || photoCache[k] || el.dataset.tried) return;
      el.dataset.tried = '1';
      try {
        if(!(await S.hasAnyPhotoHint(k))) return;
        const b = await S.getThumb(k);
        if(!b) return;
        photoCache[k] = URL.createObjectURL(b);
        el.innerHTML = '<img src="' + photoCache[k] + '" alt="">';
        const row = el.closest('.itrow');
        if(row){
          const up = row.querySelector('[data-uphoto]');
          if(up) up.textContent = 'Change photo';
          if(up && !row.querySelector('[data-dlphoto]')){
            const dl = document.createElement('button');
            dl.className = 'ibtn dl'; dl.dataset.dlphoto = k; dl.textContent = 'Download';
            dl.title = 'Download this photo - file saves with the item name';
            dl.addEventListener('click', ()=>downloadPhoto(k));
            up.after(dl);
          }
          if(up && !row.querySelector('[data-rmphoto]')){
            const del = document.createElement('button');
            del.className = 'ibtn del'; del.dataset.rmphoto = k; del.textContent = 'Remove photo';
            del.addEventListener('click', ()=>removePhoto(k));
            const dl2 = row.querySelector('[data-dlphoto]');
            (dl2 || up).after(del);
          }
        }
      } catch(e){}
    };
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver(es=>{
        es.forEach(en=>{ if(en.isIntersecting){ io.unobserve(en.target); loadOne(en.target); } });
      }, { rootMargin: '500px 0px' });
      thumbs.forEach(t=>io.observe(t));
    } else {
      await Promise.all(thumbs.map(loadOne));
    }
  }

  async function migratePhoto(oldK, newK){
    if(oldK === newK) return;
    try {
      const b = await S.getPhoto(oldK);
      if(!b) return;
      recordPhotoOp(newK, null, b);
      recordPhotoOp(oldK, b, null);
      await S.putPhoto(newK, b);          // materializes static photos under the new name too
      await S.delPhoto(oldK);
      photoCache[newK] = URL.createObjectURL(b);
      delete photoCache[oldK];
    } catch(e){}
  }

  function markDirty(){ dirty=true; const n=main.querySelector('.srcnote'); if(n && !n.textContent.includes('UNSAVED')) n.textContent += ' - UNSAVED changes'; }

  // ---- unlimited undo/redo (Deep 25 Oct 18:23): every catalogue edit is one
  // step; photo changes ride along as before/after blob ops. Memory-only.
  const UNDO = { past: [], future: [], pendingPhotos: [] };
  function stateSnap(){ return { data: JSON.parse(JSON.stringify(DATA)), deleted: DELETED.slice(), deletedCats: DELETEDCATS.slice(), renames: (RENAMES || []).slice() }; }
  function snapBefore(){
    UNDO.past.push({ snap: stateSnap(), photos: UNDO.pendingPhotos });
    UNDO.pendingPhotos = [];
    UNDO.future.length = 0;
    updateUndoBtns();
  }
  function recordPhotoOp(k, before, after, hide){ UNDO.pendingPhotos.push({ k, before, after, hide: !!hide }); }
  async function applyPhotoOps(ops, dir){
    for(const op of ops){
      const blob = dir === 'undo' ? op.before : op.after;
      if(blob){ await S.putPhoto(op.k, blob); photoCache[op.k] = URL.createObjectURL(blob); }
      else { await S.delPhoto(op.k); if(dir === 'redo' && op.hide && S.hidePhoto) S.hidePhoto(op.k); delete photoCache[op.k]; }
    }
  }
  async function doUndo(){
    const e = UNDO.past.pop(); if(!e) return;
    UNDO.future.push({ snap: stateSnap(), photos: e.photos });
    await applyPhotoOps(e.photos.slice().reverse(), 'undo');
    DATA = e.snap.data; DELETED = e.snap.deleted; DELETEDCATS = e.snap.deletedCats; RENAMES = e.snap.renames;
    markDirty(); render();
    flash('Undone' + (UNDO.past.length ? ' - ' + UNDO.past.length + ' more step' + (UNDO.past.length === 1 ? '' : 's') + ' to undo' : ''));
  }
  async function doRedo(){
    const e = UNDO.future.pop(); if(!e) return;
    UNDO.past.push({ snap: stateSnap(), photos: e.photos });
    await applyPhotoOps(e.photos, 'redo');
    DATA = e.snap.data; DELETED = e.snap.deleted; DELETEDCATS = e.snap.deletedCats; RENAMES = e.snap.renames;
    markDirty(); render();
    flash('Redone');
  }
  function updateUndoBtns(){
    const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
    if(u) u.disabled = !UNDO.past.length;
    if(r) r.disabled = !UNDO.future.length;
  }
  window.addEventListener('keydown', e=>{
    if(!(e.ctrlKey || e.metaKey)) return;
    const k = (e.key || '').toLowerCase();
    if(k === 'z' && !e.shiftKey){ e.preventDefault(); doUndo(); }
    else if(k === 'y' || (k === 'z' && e.shiftKey)){ e.preventDefault(); doRedo(); }
  });
  function btnLoad(btn, on){ if(btn){ btn.classList.toggle('loading', !!on); btn.disabled = !!on; } }

  function bind(){
    document.getElementById('btnUndo').onclick = ()=>doUndo();
    document.getElementById('btnRedo').onclick = ()=>doRedo();
    updateUndoBtns();
    document.getElementById('btnSave').onclick = ()=>doSave();
    const bck = document.getElementById('btnCheck');
    if(bck) bck.onclick = async ()=>{
      btnLoad(bck, true);
      const rec = await S.checkServerNow({ deferAdopt: dirty });
      btnLoad(bck, false);
      if(!rec) flash('Up to date - this device has the latest catalogue.', 4000);
      else if(dirty){ const sb=document.getElementById('syncbar'); if(sb) sb.style.display=''; }
      else reloadFromServer('Catalogue updated - changes from another device loaded.');
    };
    const bsr = document.getElementById('btnSyncReload');
    if(bsr) bsr.onclick = ()=>location.reload();
    const bbin = document.getElementById('btnBin');
    if(bbin) bbin.onclick = ()=>{ const bb=document.getElementById('binbar'); if(bb){ bb.style.display = bb.style.display === 'none' ? '' : 'none'; } };
    document.getElementById('btnFullPage').onclick = ()=>{
      const on = document.body.classList.toggle('fullpage');
      syncEmbedFullpage(on);
      try { localStorage.setItem('bbth-admin-fullpage', on ? '1' : '0'); } catch(e){}
      const bfp = document.getElementById('btnFullPage');
      if(bfp) bfp.textContent = on ? 'Exit full page' : 'Full page';
    };
    document.getElementById('btnAddCat').onclick = ()=>{
      const name = prompt('New category name:');
      if(name && name.trim()){
        snapBefore();
        DATA.categories.push({name:name.trim(), items:[]}); markDirty(); render();
        flash('Category "' + name.trim() + '" added - press Save to publish');
      }
    };
    async function downloadBackup(){
      const raw = await S.exportBackup();
      const blob = new Blob([raw], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BBTH-catalogue-backup-' + new Date().toISOString().slice(0,19).replace(/[T:]/g,'-') + '.json';
      a.click();
    }
    document.getElementById('btnBackup').onclick = async ()=>{
      const btn = document.getElementById('btnBackup');
      setBusy(true, 'Preparing backup (items + photos)...'); btnLoad(btn, true);
      try { await downloadBackup(); flash('Backup downloaded - keep the file safe'); }
      catch(e){ flash('Backup failed: ' + e.message); }
      setBusy(false); btnLoad(btn, false);
    };
    document.getElementById('btnRestore').onclick = ()=>{
      if(!confirm('Restore replaces the editor content with the uploaded backup file. A backup of the CURRENT list will download first, so you can recover it. Continue?')) return;
      const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
      inp.onchange = async ()=>{
        if(!inp.files[0]) return;
        try {
          setBusy(true, 'Reading backup file...');
          const rec = JSON.parse(await inp.files[0].text());
          if(!(rec && (rec.kind === 'bbth-catalogue-backup' || (rec.data && Array.isArray(rec.data.categories)))))
            throw new Error('this is not a BBTH catalogue backup file');
          setBusy(true, 'Downloading a backup of the current list first...');
          await downloadBackup(); // preserve current state for recovery
          setBusy(true, 'Restoring backup into the editor...');
          if(rec.kind === 'bbth-catalogue-backup') await S.importBackup(rec);
          else S.importOverride(rec);
          alert('Backup restored in this editor. Press the Save button to publish it.');
          location.reload();
        } catch(e){ setBusy(false, ''); alert('Restore failed: ' + e.message); }
      };
      inp.click();
    };
    document.getElementById('btnReset').onclick = async ()=>{
      const btnR = document.getElementById('btnReset');
      btnLoad(btnR, true);
      if(!confirm('A backup will download first, then the list resets to the original' + (STAFF_MODE ? ' in YOUR editor (goes live only after admin approval)' : '') + '. Your draft edits stay in the backup file. Continue?')) return;
      setBusy(true, 'Preparing backup (items + photos)...');
      try { await downloadBackup(); }
      catch(e){ setBusy(false, ''); btnLoad(btnR, false); alert('Backup failed (' + e.message + ') - the list was NOT reset.'); return; }
      setBusy(true, 'Resetting the catalogue to the original list...');
      const r = await S.clearShared();
      if(!r.ok){ setBusy(false, ''); btnLoad(btnR, false); alert('Shared reset failed (' + r.error + ') - please try again'); location.reload(); return; }
      try { await S.clearLocalPhotos(); } catch(e){}
      Object.keys(photoCache).forEach(k=>delete photoCache[k]);
      alert('Done - catalogue is back to the original list. The backup file has your previous version.');
      location.reload();
    };
    // Move an item to a 1-based position inside its category (shared by the
    // serial input and the mobile +/- steppers; one undo step per move).
    function moveItemTo(ci, ii, pos){
      const items=DATA.categories[ci].items;
      pos=Math.round(+pos); if(isNaN(pos)) pos=ii+1;
      pos=Math.max(1, Math.min(items.length, pos));
      if(pos!==ii+1){ snapBefore(); const it=items.splice(ii,1)[0]; items.splice(pos-1,0,it); markDirty(); }
      render();
    }
    main.querySelectorAll('input.sr').forEach(inp=>inp.addEventListener('change',()=>{
      moveItemTo(+inp.dataset.ci, +inp.dataset.ii, inp.value);
    }));
    main.querySelectorAll('.srbtn').forEach(b=>b.addEventListener('click',()=>{
      const ii=+b.dataset.ii;
      moveItemTo(+b.dataset.ci, ii, (ii+1) + (+b.dataset.srstep));
    }));
    main.querySelectorAll('input.cname').forEach(inp=>inp.addEventListener('change',()=>{
      const ci=+inp.dataset.ci; const v=inp.value.trim(); if(!v || v===DATA.categories[ci].name) { const f=inp.parentElement.querySelector('.fedit'); if(f) f.style.display='none'; return; }
      const hadOtherEdits = dirty; // the tick saves immediately ONLY when this rename is the sole pending change
      snapBefore();
      DATA.categories[ci].name=v; markDirty(); render();
      if(hadOtherEdits) flash('Category renamed here - press Save to publish all pending changes.', 6000);
      else doSave();
    }));
    main.querySelectorAll('input.cname').forEach(inp=>inp.addEventListener('input',()=>{
      const f=inp.parentElement.querySelector('.fedit');
      if(f) f.style.display = (inp.value.trim() && inp.value.trim()!==DATA.categories[+inp.dataset.ci].name) ? '' : 'none';
    }));
    main.querySelectorAll('[data-cncancel]').forEach(b=>b.addEventListener('click',()=>{
      const ci=+b.dataset.cncancel;
      const inp=main.querySelector('input.cname[data-ci="'+ci+'"]');
      if(inp){ inp.value=DATA.categories[ci].name; inp.parentElement.querySelector('.fedit').style.display='none'; }
    }));
    main.querySelectorAll('[data-cnok]').forEach(b=>b.addEventListener('click',()=>{
      const inp=main.querySelector('input.cname[data-ci="'+b.dataset.cnok+'"]');
      if(inp) inp.dispatchEvent(new Event('change'));
    }));
    main.querySelectorAll('input.nm').forEach(inp=>inp.addEventListener('change',async ()=>{
      const v=inp.value.trim(); if(!v) return;
      if(v === it_n_cur(DATA, inp)) { const f=inp.parentElement.querySelector('.fedit'); if(f) f.style.display='none'; return; }
      const hadOtherEdits = dirty; // the tick saves immediately ONLY when this rename is the sole pending change
      snapBefore();
      const it=DATA.categories[+inp.dataset.ci].items[+inp.dataset.ii];
      const oldK=DATA.categories[+inp.dataset.ci].name+'|'+it.n;
      addRename(it.n, v);
      it.n=v; markDirty();
      await migratePhoto(oldK, DATA.categories[+inp.dataset.ci].name+'|'+v);
      render();
      if(hadOtherEdits) flash('Name updated here - press Save to publish all pending changes.', 6000);
      else doSave();
    }));
    main.querySelectorAll('input.nm').forEach(inp=>inp.addEventListener('input',()=>{
      const f=inp.parentElement.querySelector('.fedit');
      if(f) f.style.display = (inp.value.trim() && inp.value.trim()!==it_n_cur(DATA, inp)) ? '' : 'none';
    }));
    main.querySelectorAll('[data-nmcancel]').forEach(b=>b.addEventListener('click',()=>{
      const [ci,ii]=b.dataset.nmcancel.split('|');
      const inp=main.querySelector('input.nm[data-ci="'+ci+'"][data-ii="'+ii+'"]');
      if(inp){ inp.value=it_n_cur(DATA, inp); inp.parentElement.querySelector('.fedit').style.display='none'; }
    }));
    main.querySelectorAll('[data-nmok]').forEach(b=>b.addEventListener('click',()=>{
      const [ci,ii]=b.dataset.nmok.split('|');
      const inp=main.querySelector('input.nm[data-ci="'+ci+'"][data-ii="'+ii+'"]');
      if(inp) inp.dispatchEvent(new Event('change'));
    }));
    main.querySelectorAll('input.ct').forEach(inp=>inp.addEventListener('change',async ()=>{
      const v=inp.value.trim(); if(!v) return;
      const ci=+inp.dataset.ci, ii=+inp.dataset.ii;
      const it=DATA.categories[ci].items[ii];
      const oldCat=DATA.categories[ci].name;
      if(v===oldCat) return;
      snapBefore();
      let tgt=DATA.categories.find(c=>c.name===v);
      if(!tgt){ tgt={name:v,items:[]}; DATA.categories.push(tgt); }
      DATA.categories[ci].items.splice(ii,1);
      tgt.items.push(it);
      markDirty();
      await migratePhoto(oldCat+'|'+it.n, v+'|'+it.n);
      render();
    }));
    main.querySelectorAll('[data-delitem]').forEach(b=>b.addEventListener('click',()=>{
      const [ci,ii]=b.dataset.delitem.split('|').map(Number);
      const it=DATA.categories[ci].items[ii];
      if(confirm('Delete "'+it.n+'"? It moves to the Recycle bin and can be restored from there.')){
        snapBefore();
        const cat = DATA.categories[ci];
        const k = cat.name+'|'+it.n;
        // Duplicate names share ONE name-keyed identity: a tombstone here would
        // make the save drop EVERY item with this name (original included) and
        // orphan the shared photo. When a same-name sibling stays behind,
        // remove ONLY this row - no tombstone; the bin keeps a restorable copy
        // under a unique key (the store preserves dupOf entries across saves).
        const sameName = cat.items.filter(x=>normk(x.n) === normk(it.n)).length > 1;
        if(sameName){
          const uk = k + ' #dup-' + Date.now().toString(36);
          BIN.items[uk] = { cat: cat.name, item: JSON.parse(JSON.stringify(it)), dupOf: k };
        } else {
          DELETED.push(k);
          BIN.items[k]={ cat: cat.name, item: JSON.parse(JSON.stringify(it)) };
        }
        DATA.categories[ci].items.splice(ii,1); markDirty(); render();
      }
    }));
    main.querySelectorAll('[data-delcat]').forEach(b=>b.addEventListener('click',()=>{
      const ci=+b.dataset.delcat;
      if(confirm('Delete category "'+DATA.categories[ci].name+'" with all its items? It moves to the Recycle bin and can be restored from there.')){
        snapBefore();
        const nm=DATA.categories[ci].name;
        DELETEDCATS.push(nm);
        BIN.cats[nm]={ cat: JSON.parse(JSON.stringify(DATA.categories[ci])) };
        DATA.categories.splice(ci,1); markDirty(); render();
      }
    }));
    main.querySelectorAll('[data-additem]').forEach(b=>b.addEventListener('click',()=>{
      const name=prompt('New item name:');
      if(name && name.trim()){ snapBefore(); DATA.categories[+b.dataset.additem].items.push({n:name.trim(),g:'c'}); markDirty(); render(); }
    }));
    function pickPhoto(k){
      const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
      inp.onchange=async ()=>{
        if(!inp.files[0]) return;
        try {
          snapBefore();
          const m0=document.getElementById('msg'); if(m0) m0.textContent='Uploading photo...';
          const before=await S.getPhoto(k);
          const blob=await S.processImage(inp.files[0]);
          recordPhotoOp(k, before, blob);
          await S.putPhoto(k, blob);
          photoCache[k]=URL.createObjectURL(blob);
          render();
          document.getElementById('msg').textContent='Photo saved - live for everyone on the site';
          setTimeout(()=>{const m=document.getElementById('msg'); if(m) m.textContent='';},3000);
        } catch(e){ alert('Photo save failed: '+e.message); }
      };
      inp.click();
    }
    main.querySelectorAll('.thumb').forEach(t=>t.addEventListener('click',()=>pickPhoto(t.dataset.k)));
    main.querySelectorAll('[data-uphoto]').forEach(b=>b.addEventListener('click',()=>pickPhoto(b.dataset.uphoto)));
    main.querySelectorAll('[data-dlphoto]').forEach(b=>b.addEventListener('click',()=>downloadPhoto(b.dataset.dlphoto)));
    main.querySelectorAll('[data-rmphoto]').forEach(b=>b.addEventListener('click',()=>removePhoto(b.dataset.rmphoto)));
    const qs = document.getElementById('catSearch');
    if(qs){
      qs.value = FILTER_Q;
      qs.addEventListener('input', ()=>{ FILTER_Q = qs.value; applyFilter(); });
      applyFilter();
    }
  }
  function stageSummary(j){
    const d = j.diff || {}; const L = [];
    if(j.meta && j.meta.by) L.push('Submitted by ' + j.meta.by + (j.meta.at ? ' at ' + new Date(j.meta.at).toLocaleString() : ''));
    if(d.liveIsFixture) L.push('Live list is currently the ORIGINAL fixture - applying replaces it with this staged version.');
    if(d.catsRenamed && d.catsRenamed.length) L.push('Categories renamed: ' + d.catsRenamed.map(r => r.from + ' -> ' + r.to).join(', '));
    if(d.catsAdded && d.catsAdded.length) L.push('+ categories: ' + d.catsAdded.join(', '));
    if(d.catsRemoved && d.catsRemoved.length) L.push('- categories: ' + d.catsRemoved.join(', '));
    if(d.catsReordered) L.push('Category order changed.');
    if(d.itemsRenamed && d.itemsRenamed.length) L.push('Items renamed: ' + d.itemsRenamed.map(r => r.from + ' -> ' + r.to + ' (' + r.cat + ')').join(', '));
    if(d.itemsMoved && d.itemsMoved.length) L.push('Items moved: ' + d.itemsMoved.map(m => m.item + ': ' + m.from + ' -> ' + m.to).join(', '));
    if(d.itemsAdded && d.itemsAdded.length) L.push('+ items: ' + d.itemsAdded.join(', '));
    if(d.itemsRemoved && d.itemsRemoved.length) L.push('- items: ' + d.itemsRemoved.join(', '));
    if(d.itemsReordered && d.itemsReordered.length) L.push('Item order changed in: ' + d.itemsReordered.join(', '));
    if(!d.catsAdded.length && !d.catsRemoved.length && !(d.catsRenamed||[]).length && !d.itemsAdded.length && !d.itemsRemoved.length && !(d.itemsRenamed||[]).length && !(d.itemsMoved||[]).length && !d.catsReordered && !(d.itemsReordered||[]).length) L.push('No list changes - only photo changes.');
    const sp = j.stagedPhotos || [];
    if(sp.length) L.push('Photos: ' + sp.map(p => p.k + ' (' + (p.status === 'new' ? 'new' : p.status === 'replaces-live' ? 'REPLACES live photo' : 'unchanged') + ')').join(', '));
    if(d.photosHidden && d.photosHidden.length) L.push('Photos removed/hidden: ' + d.photosHidden.join(', '));
    if(d.photosUnhidden && d.photosUnhidden.length) L.push('Photos restored: ' + d.photosUnhidden.join(', '));
    if(j.stale) L.push('WARNING: the live catalogue' + (j.stalePhotos && !j.staleDraft ? ' photos' : '') + ' changed after this was submitted - applying is refused. Discard and ask staff to redo it.');
    return L;
  }
  function stagePhotoThumbs(j){
    return (j.stagedPhotos || []).map(p =>
      '<figure style="display:inline-block;margin:6px 10px 2px 0;text-align:center">'
      + '<img src="' + p.data + '" alt="" style="width:86px;height:86px;object-fit:contain;background:#faf7ef;border-radius:8px;border:2px solid ' + (p.status === 'replaces-live' ? '#c0392b' : p.status === 'new' ? '#2e7d32' : '#aaa') + '">'
      + '<figcaption style="font-size:11px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(p.k.split('|').pop()) + '<br><b>' + (p.status === 'new' ? 'NEW' : p.status === 'replaces-live' ? 'REPLACES LIVE' : 'same') + '</b></figcaption></figure>').join('');
  }
  async function fetchStageDetail(u){
    const r = await fetch('/api/items-catalogue/stage?user=' + encodeURIComponent(u), { headers: { authorization: 'Bearer ' + token() }, cache: 'no-store' });
    const j = await r.json().catch(()=>({}));
    return r.ok ? j : null;
  }
  function applyFilter(){
    const q = FILTER_Q.trim().toLowerCase();
    // display-only filter: hidden rows stay in the data model and in every Save
    main.querySelectorAll('[data-reviewstage]').forEach(b=>b.addEventListener('click', async ()=>{
      const panel = document.getElementById('stageDetail');
      if(!panel) return;
      try {
        const j = await fetchStageDetail(b.dataset.reviewstage);
        if(!j || !j.draft){ flash('Could not load the staged detail.'); return; }
        panel.style.display = 'block';
        panel.innerHTML = '<b>Proposed changes by ' + escH(b.dataset.reviewstage) + ':</b><br>' + stageSummary(j).map(escH).join('<br>') + (stagePhotoThumbs(j) ? '<div style="margin-top:6px">' + stagePhotoThumbs(j) + '</div>' : '');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch(e){ flash('Review failed: network'); }
    }));
    main.querySelectorAll('[data-applystage]').forEach(b=>b.addEventListener('click', async ()=>{
      const u = b.dataset.applystage;
      let summary = '';
      try {
        const j0 = await fetchStageDetail(u);
        if(j0 && j0.draft){
          if(j0.stale){ alert('STALE: the live catalogue changed after ' + u + ' submitted this edit.\n\nDiscard it and ask them to redo it against the current catalogue.'); return; }
          summary = '\n\nProposed changes:\n' + stageSummary(j0).join('\n');
        }
      } catch(e){}
      if(!confirm('Apply ' + u + "'s staged catalogue edits? They go live for everyone, including staged photos." + summary)) return;
      try {
        const r = await fetch('/api/items-catalogue/apply', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ user: u }) });
        const j = await r.json().catch(()=>({}));
        if(r.ok){
          flash('Applied - ' + u + "'s edits are now live (" + (j.photosApplied || 0) + ' photos)');
          await refreshPending();
          const res = await S.loadCatalogue();
          DATA = res.data; SOURCE = res.source; render();
        } else if(j.error === 'stale'){
          alert('Refused: ' + (j.message || 'the live catalogue changed after this was submitted.'));
        } else flash('Apply failed: ' + (j.error || r.status));
      } catch(e){ flash('Apply failed: network'); }
    }));
    main.querySelectorAll('[data-discardstage]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Discard ' + b.dataset.discardstage + "'s staged edits? They will NOT go live.")) return;
      try {
        await fetch('/api/items-catalogue/stage?user=' + encodeURIComponent(b.dataset.discardstage), { method: 'DELETE', headers: { authorization: 'Bearer ' + token() } });
      } catch(e){}
      await refreshPending(); render();
    }));
    main.querySelectorAll('.catblock').forEach(block=>{
      if(!q){ block.style.display=''; block.querySelectorAll('.itrow').forEach(r=>r.style.display=''); return; }
      const cnEl = block.querySelector('input.cname');
      const catHit = cnEl && cnEl.value.toLowerCase().includes(q);
      let anyVisible = false;
      block.querySelectorAll('.itrow').forEach(row=>{
        const nmEl = row.querySelector('input.nm');
        const hit = catHit || (nmEl && nmEl.value.toLowerCase().includes(q));
        row.style.display = hit ? '' : 'none';
        if(hit) anyVisible = true;
      });
      block.style.display = (catHit || anyVisible) ? '' : 'none';
    });
  }
  } // end start()

  if(role() === 'admin'){ start('admin'); return; }
  // Staff may be granted Catalogue Editor access (admin: Users > Access). The
  // server enforces the same permission on every write; this is the UI gate.
  fetch('/api/whoami', { headers: { authorization: 'Bearer ' + token() } })
    .then(r => r.ok ? r.json() : null)
    .then(w => {
      const perms = w && Array.isArray(w.perms) ? w.perms : [];
      if(w && (perms.includes('*') || perms.includes('catalogue'))){ start('staff'); return; }
      main.innerHTML = '<div class="gate"><img src="/assets/logo-lockup-dark.png?v=6" alt="BBTH"><h2>No access</h2><p>Catalogue editing needs the admin to grant you Catalogue Editor access (Users &gt; Access). You can still view and download the catalogue from the staff portal.</p><a class="btn-solid" href="/app/">Back to staff portal</a></div>';
    })
    .catch(() => {
      main.innerHTML = '<div class="gate"><img src="/assets/logo-lockup-dark.png?v=6" alt="BBTH"><h2>No access</h2><p>Catalogue editing needs the admin to grant you Catalogue Editor access (Users &gt; Access).</p><a class="btn-solid" href="/app/">Back to staff portal</a></div>';
    });
})();
