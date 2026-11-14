// BBTH Quotation Maker - form logic, draft save/load
const $ = id => document.getElementById(id);
const BS = () => window.BBTH_SETTINGS;
const state = {
  clientName:'', clientPlace:'', clientPhone:'', eventDates:'', budget:'',
  company: BS().company, address: BS().address,
  contact: BS().contact, signoff: BS().signoff,
  footerContacts: BS().footerContacts,
  services: [],   // {name, on, qty, size, custom}
  extras: [],     // {name, rate, on, custom}
  refImages: [],  // {label, caption, img(dataURL)}
  imgLayout: 'collage',
  docType: 'quotation',
  orderType: 'proposal',
  template: (typeof BBTH_DEFAULT_TEMPLATE !== 'undefined' ? BBTH_DEFAULT_TEMPLATE : 'sage-gold'),
  docNo: '',
  agree: {}        // per-agreement wording overrides (step 5), prefilled from template texts
};

// ---- init service + extra lists ----
// Newly photographed catalogue items (31) + Buffet Counter staged for review: merge into the
// service list ONLY on non-production hosts. Never written to D1 site_settings.
var BBTH_STAGED_SERVICES = ["Amber Ribbed Vessel","Amber Round Bottle Vase","Blue Lidded Jar","Cane Wood Sofa","Crystal-Style Candelabra","Curved Hook Stand","Curved Tube Component","Ganesh Statue","Gold Arch Frame (Round Top)","Gold Arched Ornamental Frame","Gold Console Table","Gold Curved-Top Vertical-Bar Panel","Gold Cylindrical Vessel","Gold Diagonal-Bar Frame","Gold Embossed Vessel","Gold Grid Frame (Fine Grid)","Gold Grid Frame (Large Grid)","Gold Grid Frame (Medium Grid)","Gold Open Frame (Tall, Side Bars)","Gold Rectangular Backdrop Frame (with Feet)","Gold Scalloped Oval-Pattern Panel","Gold Vertical-Bar Frame","Hanging Perforated Metallic Ball Lights","Ornate Gold Chair","Pale Yellow Faceted Vessel","Patterned Table Cloth","Pink Patterned Vessel","Purple Twisted Vase","Silver Patterned Vessel","Sloping-Top Open Frame","White Pop-Up Canopy","Buffet Counter"];
function bbthIsStagingHost(){
  var h = (location.hostname||'').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || /\.pages\.dev$/.test(h);
}
// Shared-catalogue link (staging only): the admin Catalogue Editor's shared draft
// drives service names here - recorded renames follow through, editor deletions
// drop entries, new Services-category items appear. Read-only overlay: upstream
// settings and saved historical documents are never touched.
async function bbthCatalogueLinks(){
  try{
    const r = await fetch('/api/items-catalogue', { cache: 'no-store' });
    if(!r.ok) return null;
    const d = await r.json(); const dr = d && d.draft;
    if(!dr || !dr.data || !Array.isArray(dr.data.categories)) return null;
    const rename = {};
    (dr.renames||[]).forEach(x => { if(x && x.from && x.to) rename[String(x.from).toLowerCase()] = String(x.to); });
    const deleted = new Set((dr.deleted||[]).map(k => String(k).split('|').pop().toLowerCase()));
    const inDraft = new Set();
    dr.data.categories.forEach(c => (c.items||[]).forEach(it => { if(it && it.n) inDraft.add(String(it.n).toLowerCase()); }));
    const svcCat = dr.data.categories.find(c => /^services$/i.test((c && c.name) || ''));
    return { rename, deleted, inDraft, svcItems: svcCat ? (svcCat.items||[]).map(i => i && i.n).filter(Boolean) : [] };
  }catch(e){ return null; }
}
function bbthFollowRename(links, name){
  if(!links) return name;
  let nm = String(name), seen = 0;
  while(links.rename[nm.toLowerCase()] && seen++ < 10) nm = links.rename[nm.toLowerCase()];
  return nm;
}
async function initLists(){
  let links = null;
  if(bbthIsStagingHost()) links = await bbthCatalogueLinks();
  if(bbthIsStagingHost()){
    var have = {};
    (BS().services||[]).forEach(n => { have[String(n).toLowerCase()] = 1; });
    BBTH_STAGED_SERVICES.forEach(n => {
      let nm = bbthFollowRename(links, n);
      if(links){
        if(links.deleted.has(nm.toLowerCase()) || links.deleted.has(String(n).toLowerCase())) return;
      }
      if(!have[nm.toLowerCase()]){ BS().services.push(nm); have[nm.toLowerCase()] = 1; }
    });
    if(links){
      links.svcItems.forEach(n => {
        const nm = String(n);
        if(links.deleted.has(nm.toLowerCase())) return;
        if(!have[nm.toLowerCase()]){ BS().services.push(nm); have[nm.toLowerCase()] = 1; }
      });
    }
  }
  state.services = (BS().services||[])
    .map(n => bbthFollowRename(links, n))
    .filter(n => !(links && links.deleted.has(String(n).toLowerCase())))
    .map(n => ({ name:n, on:false, qty:'', size:'', theme:'', custom:false }));
  state.extras = (BS().extras||[])
    .map(e => ({ name: bbthFollowRename(links, e.name), rate: e.rate, on:false, custom:false }))
    .filter(e => !(links && links.deleted.has(String(e.name).toLowerCase())));
  renderServices(); if($('extraList')) renderExtras();
}

function renderServices(){
  const wrap = $('serviceList'); wrap.innerHTML = '';
  const groups = (typeof bbthGroupServices === 'function')
    ? bbthGroupServices(state.services.map(s => s.name))
    : [{ title: '', icon: '', idx: state.services.map((s, i) => i) }];
  groups.forEach(g => {
    if(g.title){
      const h = document.createElement('div');
      h.className = 'svc-grp-head';
      h.innerHTML = '<span class="svc-grp-ic">' + g.icon + '</span> ' + esc(g.title) + ' <small>' + g.idx.length + '</small>';
      wrap.appendChild(h);
    }
    g.idx.forEach(i => {
      const s = state.services[i];
      const div = document.createElement('div');
      div.className = 'svc-item' + (s.on ? ' on' : '');
      div.dataset.name = s.name.toLowerCase();
      div.innerHTML =
        '<label class="svc-head"><input type="checkbox" '+(s.on?'checked':'')+' data-i="'+i+'">'
        + '<span class="svc-name">'+esc(s.name)+'</span></label>'
        + '<div class="svc-fields">'
        + '<div><label data-ft="fLblQty">Qty</label><input type="text" inputmode="numeric" placeholder="e.g. 25" value="'+esc(s.qty)+'" data-qty="'+i+'"></div>'
        + '<div><label data-ft="fLblSize">Size (ft)</label><input type="text" placeholder="e.g. 14 x 150" value="'+esc(s.size)+'" data-size="'+i+'"></div>'
        + (/theme.based/i.test(s.name) ? '<div><label data-ft="fLblTheme">Theme</label><input type="text" value="'+esc(s.theme||'')+'" data-theme="'+i+'"></div>' : '')
        + (s.custom ? '<div style="align-self:flex-end"><button class="small-btn danger" data-del="'+i+'" type="button">Remove</button></div>' : '')
        + '</div>';
      wrap.appendChild(div);
    });
  });
}

// live preview of the reference-image pages: the real PDF page markup, scaled down
function renderLayoutPreview(){
  const box = $('layoutPreview'); if(!box) return;
  box.innerHTML = '';
  const imgs = state.refImages || [];
  if(!imgs.length){ box.innerHTML = '<p class="hint">Add photos to see how the pages will look.</p>'; return; }
  let pages = [];
  try{ pages = buildRefPages(state, imgs, state.imgLayout || 'collage'); }catch(e){ return; }
  const per = (REF_CONF[state.imgLayout] || REF_CONF.collage).per;
  const S = 0.34;
  pages.forEach((html, i) => {
    const n = Math.min(per, imgs.length - i * per);
    const card = document.createElement('div'); card.className = 'lp-card';
    card.innerHTML = '<div class="lp-lab">Page ' + (i + 1) + ' - ' + n + ' photo' + (n === 1 ? '' : 's') + '</div>'
      + '<div class="lp-win" style="width:' + Math.round(794 * S) + 'px;height:' + Math.round(1123 * S) + 'px"><div class="lp-sc" style="transform:scale(' + S + ')">' + html + '</div></div>';
    box.appendChild(card);
  });
  if(typeof applyTemplateVars === 'function') applyTemplateVars(box, state.template);
}

function renderExtras(){
  const wrap = $('extraList'); if(!wrap) return; wrap.innerHTML = '';
  state.extras.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'svc-item' + (s.on ? ' on' : '');
    div.innerHTML =
      '<label class="svc-head"><input type="checkbox" '+(s.on?'checked':'')+' data-xi="'+i+'">'
      + '<span class="svc-name">'+esc(s.name)+'</span></label>'
      + '<div class="svc-fields">'
      + '<div style="flex:1;min-width:220px"><label>Rate</label><input class="rate" type="text" value="'+esc(s.rate)+'" data-rate="'+i+'"></div>'
      + (s.custom ? '<div style="align-self:flex-end"><button class="small-btn danger" data-xdel="'+i+'" type="button">Remove</button></div>' : '')
      + '</div>';
    wrap.appendChild(div);
  });
}

// ---- in-session Undo/Redo (Deep 25 Oct 18:23: makers mein bhi Undo/Redo, koi 5-step
// limit nahi). In-memory only - drafts stay disabled; refresh still starts blank.
// Snapshot BEFORE each mutation, restore re-renders everything. Unlimited stack.
const MAKER_UNDO = [], MAKER_REDO = [];
let RESTORING = false;
const makerSnapJSON = () => JSON.stringify(state);
function pushMakerUndo(pre){
  if(MAKER_UNDO.length && MAKER_UNDO[MAKER_UNDO.length - 1] === pre) return;
  MAKER_UNDO.push(pre);
  MAKER_REDO.length = 0;
  updMakerUndoUI();
}
function updMakerUndoUI(){
  const u = $('mkUndo'), r = $('mkRedo');
  if(u) u.disabled = !MAKER_UNDO.length;
  if(r) r.disabled = !MAKER_REDO.length;
}
function applyMakerSnap(j){
  RESTORING = true;
  try {
    Object.keys(state).forEach(k => { delete state[k]; });
    Object.assign(state, JSON.parse(j));
    fillForm();
    renderSummary();
    if($('previewOverlay') && !$('previewOverlay').classList.contains('hidden')) renderPreview();
  } finally { RESTORING = false; }
}
function doMakerUndo(){
  if(!MAKER_UNDO.length) return;
  MAKER_REDO.push(makerSnapJSON());
  applyMakerSnap(MAKER_UNDO.pop());
  updMakerUndoUI();
}
function doMakerRedo(){
  if(!MAKER_REDO.length) return;
  MAKER_UNDO.push(makerSnapJSON());
  applyMakerSnap(MAKER_REDO.pop());
  updMakerUndoUI();
}
// Text fields: one undo step per focus session (pre-focus state kept, compared at blur).
document.addEventListener('focusin', e => {
  if(RESTORING) return;
  const t = e.target;
  if(!(t instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if(t.type === 'checkbox' || t.type === 'radio' || t.type === 'file' || t.type === 'button') return;
  t.__mkPre = makerSnapJSON();
}, true);
document.addEventListener('focusout', e => {
  if(RESTORING) return;
  const t = e.target;
  if(!(t instanceof HTMLElement) || t.__mkPre === undefined) return;
  const pre = t.__mkPre; delete t.__mkPre;
  if(pre !== makerSnapJSON()) pushMakerUndo(pre);
}, true);
// Toggles, radios, selects, file picks: snapshot in capture phase, before the
// app's bubble-phase handlers mutate state; drop if nothing actually changed.
document.addEventListener('change', e => {
  if(RESTORING) return;
  const t = e.target;
  if(!(t instanceof HTMLElement)) return;
  if(t.type !== 'checkbox' && t.type !== 'radio' && t.tagName !== 'SELECT' && t.type !== 'file') return;
  const pre = makerSnapJSON();
  setTimeout(() => { if(!RESTORING && pre !== makerSnapJSON()) pushMakerUndo(pre); }, 0);
}, true);
// Button actions (add/remove/select-all/template/layout picks): same pattern.
document.addEventListener('click', e => {
  if(RESTORING) return;
  const t = e.target;
  const b = (t instanceof HTMLElement) && t.closest ? t.closest('button') : null;
  if(!b || b.id === 'mkUndo' || b.id === 'mkRedo') return;
  const pre = makerSnapJSON();
  setTimeout(() => { if(!RESTORING && pre !== makerSnapJSON()) pushMakerUndo(pre); }, 0);
}, true);
if($('mkUndo')) $('mkUndo').addEventListener('click', doMakerUndo);
if($('mkRedo')) $('mkRedo').addEventListener('click', doMakerRedo);
window.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey)) return;
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // native field undo stays
  const k = (e.key || '').toLowerCase();
  if(k === 'z' && !e.shiftKey){ e.preventDefault(); doMakerUndo(); }
  else if(k === 'y' || (k === 'z' && e.shiftKey)){ e.preventDefault(); doMakerRedo(); }
});

// ---- events ----
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.i !== undefined && t.type === 'checkbox'){ state.services[+t.dataset.i].on = t.checked; t.closest('.svc-item').classList.toggle('on', t.checked); saveDraft(); }
  if(t.dataset.xi !== undefined && t.type === 'checkbox'){ state.extras[+t.dataset.xi].on = t.checked; t.closest('.svc-item').classList.toggle('on', t.checked); saveDraft(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if(t.dataset.qty !== undefined){ state.services[+t.dataset.qty].qty = t.value; saveDraft(); }
  if(t.dataset.size !== undefined){ state.services[+t.dataset.size].size = t.value; saveDraft(); }
  if(t.dataset.theme !== undefined){ state.services[+t.dataset.theme].theme = t.value; saveDraft(); }
  if(t.dataset.rate !== undefined){ state.extras[+t.dataset.rate].rate = t.value; saveDraft(); }
  if(['clientName','clientPlace','clientPhone','eventDates','budget','company','companyAddr','companyContact','signoff','footerContacts'].includes(t.id)){
    const map = { companyAddr:'address', companyContact:'contact' };
    state[map[t.id] || t.id] = t.value; saveDraft();
  }
});
document.addEventListener('click', e => {
  const t = e.target;
  if(t.dataset.del !== undefined){ state.services.splice(+t.dataset.del, 1); renderServices(); saveDraft(); }
  if(t.dataset.xdel !== undefined){ state.extras.splice(+t.dataset.xdel, 1); renderExtras(); saveDraft(); }
});

$('selAllSvc').addEventListener('click', () => { state.services.forEach(sv => sv.on = true); renderServices(); saveDraft(); });
$('deselAllSvc').addEventListener('click', () => { state.services.forEach(sv => sv.on = false); renderServices(); saveDraft(); });
if($('selAllExt')) $('selAllExt').addEventListener('click', () => { state.extras.forEach(ex => ex.on = true); renderExtras(); saveDraft(); });
if($('deselAllExt')) $('deselAllExt').addEventListener('click', () => { state.extras.forEach(ex => ex.on = false); renderExtras(); saveDraft(); });
$('serviceSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#serviceList .svc-item').forEach(el => {
    el.style.display = el.dataset.name.includes(q) ? '' : 'none';
  });
  // hide a category heading when none of its items match
  document.querySelectorAll('#serviceList .svc-grp-head').forEach(h => {
    let n = h.nextElementSibling, any = false;
    while(n && !n.classList.contains('svc-grp-head')){ if(n.style.display !== 'none') any = true; n = n.nextElementSibling; }
    h.style.display = any ? '' : 'none';
  });
});

$('addCustomService').addEventListener('click', () => {
  const n = $('customServiceName').value.trim(); if(!n) return;
  state.services.push({ name:n, on:true, qty:'', size:'', theme:'', custom:true });
  renderServices(); $('customServiceName').value = ''; saveDraft();
});
if($('addCustomExtra')) $('addCustomExtra').addEventListener('click', () => {
  const n = $('customExtraName').value.trim(); if(!n) return;
  state.extras.push({ name:n, rate:$('customExtraRate').value.trim(), on:true, custom:true });
  renderExtras(); $('customExtraName').value=''; $('customExtraRate').value=''; saveDraft();
});

// ---- save custom item to the shared template (staff-writable catalogue) ----
function flashBtn(btn, msg){
  if(!btn) return;
  const old = btn.textContent;
  btn.textContent = msg; btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2200);
}
async function saveServiceToTemplate(){
  const n = $('customServiceName').value.trim(); if(!n) return;
  const lname = n.toLowerCase();
  const existing = state.services.find(sv => !sv.custom && sv.name.toLowerCase() === lname);
  if(existing){
    existing.on = true; renderServices(); $('customServiceName').value = ''; saveDraft();
    flashBtn($('addCustomServiceSave'), 'Already in template'); return;
  }
  try {
    const r = await fetch('/api/catalogue', { method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() },
      body: JSON.stringify({ kind: 'service', name: n }) });
    if(!r.ok) throw new Error('save failed');
    const j = await r.json();
    if(!j.already){ (BS().services = BS().services || []).push(n); }
    state.services.push({ name:n, on:true, qty:'', size:'', theme:'', custom:false });
    renderServices(); $('customServiceName').value = ''; saveDraft();
    flashBtn($('addCustomServiceSave'), 'Saved to template \u2713');
  } catch(e){ flashBtn($('addCustomServiceSave'), 'Could not save - try again'); }
}
async function saveExtraToTemplate(){
  const n = $('customExtraName').value.trim(); if(!n) return;
  const rate = $('customExtraRate').value.trim();
  const lname = n.toLowerCase();
  const existing = state.extras.find(x => !x.custom && x.name.toLowerCase() === lname);
  if(existing){
    existing.on = true; renderExtras(); $('customExtraName').value=''; $('customExtraRate').value=''; saveDraft();
    flashBtn($('addCustomExtraSave'), 'Already in template'); return;
  }
  try {
    const r = await fetch('/api/catalogue', { method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() },
      body: JSON.stringify({ kind: 'extra', name: n, rate: rate }) });
    if(!r.ok) throw new Error('save failed');
    const j = await r.json();
    if(!j.already){ (BS().extras = BS().extras || []).push({ name:n, rate:rate }); }
    state.extras.push({ name:n, rate:rate, on:true, custom:false });
    renderExtras(); $('customExtraName').value=''; $('customExtraRate').value=''; saveDraft();
    flashBtn($('addCustomExtraSave'), 'Saved to template \u2713');
  } catch(e){ flashBtn($('addCustomExtraSave'), 'Could not save - try again'); }
}
$('addCustomServiceSave').addEventListener('click', saveServiceToTemplate);
if($('addCustomExtraSave')) $('addCustomExtraSave').addEventListener('click', saveExtraToTemplate);

// ---- steps ----
function goStep(n){
  if(!document.getElementById('step-'+n)) return;
  if(n === 5) syncOrderUI();
  document.querySelectorAll('.step-panel[id^="step-"]').forEach(p => p.classList.add('hidden'));
  $('step-'+n).classList.remove('hidden');
  document.querySelectorAll('.step-btn').forEach(b => b.classList.toggle('active', b.dataset.step == String(n)));
  if(String(n) === '5') renderSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.step-btn').forEach(b => b.addEventListener('click', () => goStep(b.dataset.step)));
document.querySelectorAll('.next-btn').forEach(b => b.addEventListener('click', () => goStep(b.dataset.next)));

// ---- draft ----
let saveT;
let BOOTED = false;
const EDIT_ID = new URLSearchParams(location.search).get('edit');
let EDIT_DOCTYPE = null;
function saveDraft(){ return; // drafts disabled - refresh always starts blank (Deep, 20 Oct)
  if(!BOOTED) return; clearTimeout(saveT); saveT = setTimeout(() => {
  try { localStorage.setItem('bbth-draft', JSON.stringify(state)); localStorage.setItem('bbth-draft-ts', String(Date.now())); } catch(e){
    try { localStorage.setItem('bbth-draft', JSON.stringify(Object.assign({}, state, { refImages: [] }))); } catch(e2){}
  }
}, 400); pushServerDraft(); }
function saveDraftX(){} // placeholder
// ---- server-side draft sync (follows the logged-in user across devices) ----
let DRAFT_PUSH_T = null;
function draftPayload(){
  try { return JSON.stringify(state); } catch(e){ return null; }
}
function pushServerDraft(){ return; // drafts disabled

  if(!BOOTED || !currentUser().token || EDIT_ID) return;
  clearTimeout(DRAFT_PUSH_T);
  DRAFT_PUSH_T = setTimeout(async () => {
    let body = draftPayload();
    if(!body) return;
    if(body.length > 900000){
      try { body = JSON.stringify(Object.assign({}, state, { refImages: [] })); } catch(e){ return; }
    }
    try {
      await fetch('/api/draft', { method: 'PUT', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() }, body });
      try { localStorage.setItem('bbth-draft-ts', String(Date.now())); } catch(e){}
    } catch(e){ /* offline - local draft still kept */ }
  }, 2500);
}
async function syncServerDraft(){
  if(!currentUser().token || EDIT_ID) return;
  try {
    const r = await fetch('/api/draft', { headers: { 'authorization': 'Bearer ' + adminToken() } });
    if(!r.ok) return;
    const d = await r.json();
    if(!d || !d.draft) return;
    const serverTs = Date.parse(d.updated_at || '') || 0;
    const localTs = +(localStorage.getItem('bbth-draft-ts') || 0);
    const localRaw = localStorage.getItem('bbth-draft');
    if(!localRaw || serverTs > localTs){
      localStorage.setItem('bbth-draft', typeof d.draft === 'string' ? d.draft : JSON.stringify(d.draft));
      localStorage.setItem('bbth-draft-ts', String(serverTs || Date.now()));
    }
  } catch(e){}
}

function loadDraft(){
  try {
    const raw = localStorage.getItem('bbth-draft');
    if(!raw) return false;
    const d = JSON.parse(raw);
    // company details come from the admin Company page, not from old drafts
    ['company','address','contact','signoff','footerContacts'].forEach(k => { delete d[k]; });
    if(d.eventDate && !d.eventDates){ d.eventDates = fmtDate(d.eventDate); }
    delete d.eventDate;
    // service & extra lists always come from the current settings (server or defaults);
    // the draft only restores the user's selections, matched by name so renames never resurrect old lists
    const dSvcs = Array.isArray(d.services) ? d.services : [];
    const dExts = Array.isArray(d.extras) ? d.extras : [];
    delete d.services; delete d.extras;
    Object.assign(state, d);
    const svcByName = {};
    dSvcs.forEach(s => { if(s && s.name) svcByName[s.name.toLowerCase()] = s; });
    state.services.forEach(sv => {
      const m = svcByName[sv.name.toLowerCase()];
      if(m){ sv.on = !!m.on; sv.qty = m.qty || ''; sv.size = m.size || ''; sv.theme = m.theme || ''; }
    });
    dSvcs.filter(s => s && s.custom && !state.services.some(sv => sv.name.toLowerCase() === s.name.toLowerCase()))
      .forEach(s => state.services.push({ name:s.name, on:!!s.on, qty:s.qty || '', size:s.size || '', theme:s.theme || '', custom:true }));
    const extByName = {};
    dExts.forEach(e => { if(e && e.name) extByName[e.name.toLowerCase()] = e; });
    state.extras.forEach(ex => {
      const m = extByName[ex.name.toLowerCase()];
      if(m){ ex.on = !!m.on; if(m.rate !== undefined) ex.rate = m.rate; }
    });
    dExts.filter(e => e && e.custom && !state.extras.some(x => x.name.toLowerCase() === e.name.toLowerCase()))
      .forEach(e => state.extras.push({ name:e.name, rate:e.rate || '', on:!!e.on, custom:true }));
    return true;
  } catch(e){ return false; }
}
function fillForm(){
  ['clientName','clientPlace','clientPhone','eventDates','budget','company','signoff','footerContacts'].forEach(id => { $(id).value = state[id] || ''; });
  $('companyAddr').value = state.address || '';
  $('companyContact').value = state.contact || '';
  renderServices(); if($('extraList')) renderExtras(); renderThumbs();
  const lay = document.querySelector('input[name=imgLayout][value='+JSON.stringify(state.imgLayout || 'collage')+']');
  if(lay){ lay.checked = true; lay.dispatchEvent(new Event('change')); }
  const dt = document.querySelector('input[name=docType][value='+JSON.stringify(state.docType || 'quotation')+']');
  if(dt){ dt.checked = true; dt.dispatchEvent(new Event('change')); }
  $('docNo').value = state.docNo || '';
  renderTplPick();
}
$('clearDraft').addEventListener('click', async () => {
  localStorage.removeItem('bbth-draft');
  localStorage.removeItem('bbth-draft-ts');
  try { await fetch('/api/draft', { method: 'DELETE', headers: { 'authorization': 'Bearer ' + adminToken() } }); } catch(e){}
  location.reload();
});

// ---- failed-save recovery (14 Nov) ----
// NOT a draft: normal visits still start blank. This only ever holds documents the
// app FAILED to save to history (save error, network drop, expired session, failed
// PDF creation). Entries keep the SAME allocated refNo - a retry never burns a new
// serial. Saved or explicitly discarded entries are removed. localStorage (survives
// browser restart); capped; PDF kept only when it fits, else the form state alone is
// kept and the PDF is regenerated on resume.
const RECOVERY_KEY = 'bbth-recovery-v1';
const RECOVERY_CAP = 10;
const RECOVERY_PDF_MAX = 3500000; // dataURL chars; above this keep form state only
function recoveryAll(){
  try { const a = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; }
}
function recoveryWrite(list){ try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(list)); return true; } catch(e){ return false; } }
function recoveryFname(entry){
  const rn = (entry.refNo || 'document').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  const cl = (entry.client || '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  return 'BBTH-' + rn + (cl ? '-' + cl : '') + '.pdf';
}
function downloadDataUrl(dataUrl, fname){
  const a = document.createElement('a'); a.href = dataUrl; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
}
let curRecoveryId = null;    // this form instance's recovery entry id (updated across repeated failures)
let RECOVERY_EDIT_ID = null; // set while resuming a recovered EDIT - uploadQuotation targets that record
function setRecoveryNotice(t){ try { t ? localStorage.setItem('bbth-recovery-notice', t) : localStorage.removeItem('bbth-recovery-notice'); } catch(e){} }
// Returns 'pdf' (full copy kept), 'state' (filled details kept, PDF regenerates), false (storage
// full/blocked - NOTHING kept), null (blank form - nothing worth keeping). Callers word the modal
// from this: never promise a kept copy that was not actually written.
function saveRecovery(reason){
  try {
    const refNo = (state.docNo || '').trim();
    const editId = RECOVERY_EDIT_ID || EDIT_ID || null;
    const hasContent = !!(($('clientName') && $('clientName').value || '').trim()) || (state.services || []).some(s => s.on) || (state.extras || []).some(s => s.on);
    if(!refNo && !curRecoveryId && !hasContent) return null;
    const entry = { id: refNo || curRecoveryId || ('noref-' + Date.now()), refNo, docType: state.docType || 'quotation',
      user: credGet('bbth-user') || 'admin',
      client: (($('clientName') && $('clientName').value) || state.clientName || '').trim(),
      ts: Date.now(), reason: String(reason || 'save did not complete') };
    if(editId) entry.editId = String(editId);
    entry.state = JSON.parse(JSON.stringify(state));
    let list = recoveryAll().filter(e => e.id !== entry.id && (!entry.refNo || e.refNo !== entry.refNo));
    const pdfUrl = (typeof lastGeneratedPdf !== 'undefined' && lastGeneratedPdf) ? lastGeneratedPdf.output('datauristring') : '';
    // Capacity rule: existing recovered documents are NEVER dropped automatically. If the list
    // is full or storage cannot fit this entry, this NEW document is not retained - the caller
    // then warns loudly and pushes the explicit current-tab/export path instead.
    const isNewEntry = !list.some(e => e.id === entry.id) && !recoveryAll().some(e => e.id === entry.id);
    if(isNewEntry && list.length >= RECOVERY_CAP){ renderRecoveryBar(); return false; }
    if(pdfUrl && pdfUrl.length <= RECOVERY_PDF_MAX){
      entry.pdfDataUrl = pdfUrl;
      const full = list.concat(entry).slice(-RECOVERY_CAP);
      if(recoveryWrite(full)){ curRecoveryId = entry.id; renderRecoveryBar(); return 'pdf'; }
      delete entry.pdfDataUrl;
    }
    // staged shrinking: shed stored PDF copies first (filled details survive - the PDF
    // regenerates from them), then reference images. If it still does not fit: reject, never evict.
    const statesOnly = l => l.map(e => { const c = Object.assign({}, e); delete c.pdfDataUrl; return c; });
    let shrunk = statesOnly(list); shrunk.push(entry);
    let ok = recoveryWrite(shrunk.slice(-RECOVERY_CAP));
    if(!ok){
      try { entry.state.refImages = []; } catch(e){}
      ok = recoveryWrite(shrunk.slice(-RECOVERY_CAP));
    }
    if(ok) curRecoveryId = entry.id;
    renderRecoveryBar();
    return ok ? 'state' : false;
  } catch(e){ return false; }
}
function removeRecovery(key){
  if(!key) return;
  recoveryWrite(recoveryAll().filter(e => e.refNo !== key && e.id !== key));
  renderRecoveryBar();
}
async function resumeRecovery(entry){
  try {
    if(EDIT_ID){ const st0 = $('genStatus'); if(st0) st0.textContent = 'Close this open edit first, then resume the recovered document.'; return; }
    if(!BOOTED){ await bootApp(); }
    // restore through the existing draft loader: current settings lists are kept,
    // saved selections merge back by name, company details stay server-sourced
    localStorage.setItem('bbth-draft', JSON.stringify(entry.state));
    const ok = loadDraft();
    localStorage.removeItem('bbth-draft'); localStorage.removeItem('bbth-draft-ts');
    if(ok) fillForm();
    RECOVERY_EDIT_ID = entry.editId || null;
    curRecoveryId = entry.id || entry.refNo || null;
    if(entry.refNo){
      state.docNo = entry.refNo;
      allocState = { series: docSeries(), value: entry.refNo, peek: false }; // retry reuses this number - no new serial
    } else {
      // no serial was ever burned for this document: any number visible on the stored PDF was
      // only a peek. Never auto-save it - regenerate so the number is really allocated first.
      state.docNo = ''; if($('docNo')) $('docNo').value = '';
      allocState = { series: null, value: '' };
    }
    const st = $('genStatus');
    if(entry.pdfDataUrl && entry.refNo){
      if(st) st.textContent = 'Saving ' + entry.refNo + ' to history...';
      await uploadQuotation({ output: () => entry.pdfDataUrl });
    } else {
      const msg = entry.refNo
        ? entry.refNo + ' details restored (PDF was not kept). Check the details, then tap Download PDF - it will save with the same number.'
        : 'Recovered details restored. Check them, then tap Download PDF - a fresh number is assigned on save.';
      if(st){ st.textContent = msg; st.dataset.base = msg; }
      const gb = $('generateBtn'); if(gb) gb.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch(e){ const st = $('genStatus'); if(st) st.textContent = 'Could not restore ' + (entry.refNo || 'the document') + ' - please re-enter the details.'; }
}
function renderRecoveryBar(){
  let bar = $('recoveryBar');
  const list = recoveryAll();
  if(!list.length){ if(bar) bar.remove(); setRecoveryNotice(''); return; }
  // ownership: admin sees every recovered document on this browser; others see only their own
  const me = credGet('bbth-user') || 'admin';
  const mine = (credGet('bbth-role') || 'admin') === 'admin' ? list : list.filter(e => (e.user || 'admin') === me);
  if(!mine.length){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'recoveryBar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:40;background:#fff8e6;border-top:2px solid #b8860b;padding:10px 14px;box-shadow:0 -2px 12px rgba(0,0,0,.18);font-size:14px;max-height:45vh;overflow:auto;';
    document.body.appendChild(bar);
  }
  bar.innerHTML = '';
  const h = document.createElement('div');
  h.style.cssText = 'font-weight:700;margin-bottom:6px;color:#5c4000;';
  h.textContent = (mine.length === 1 ? '1 document was NOT saved to history' : mine.length + ' documents were NOT saved to history') + ' - kept in this browser (do not clear site data before saving):';
  bar.appendChild(h);
  let rNotice = ''; try { rNotice = localStorage.getItem('bbth-recovery-notice') || ''; } catch(e){}
  if(rNotice){
    const n = document.createElement('div');
    n.style.cssText = 'color:#8a1f1f;font-weight:600;margin-bottom:6px;';
    n.textContent = rNotice;
    bar.appendChild(n);
  }
  mine.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 0;border-top:1px solid #e8d9a8;';
    const label = document.createElement('span');
    label.style.cssText = 'flex:1;min-width:200px;';
    const when = new Date(entry.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    label.textContent = (entry.refNo || '(no number yet)') + (entry.client ? ' - ' + entry.client : '') + ' - ' + when
      + (entry.editId ? ' - unsaved edit of record #' + entry.editId : '')
      + (entry.pdfDataUrl ? ' - PDF kept' : ' - details kept, PDF regenerates on save');
    row.appendChild(label);
    const mk = (txt, fn, primary) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = txt;
      b.style.cssText = 'padding:6px 12px;border-radius:8px;border:1px solid #b8860b;cursor:pointer;font-size:13px;' + (primary ? 'background:#b8860b;color:#fff;' : 'background:#fff;color:#5c4000;');
      b.addEventListener('click', fn);
      return b;
    };
    row.appendChild(mk('Save now', () => resumeRecovery(entry), true));
    if(entry.pdfDataUrl) row.appendChild(mk('Download PDF', () => downloadDataUrl(entry.pdfDataUrl, recoveryFname(entry)), false));
    row.appendChild(mk('Discard', () => { if(confirm('Discard ' + entry.refNo + '? The document will NOT be saved to history.')) removeRecovery(entry.refNo); }, false));
    bar.appendChild(row);
  });
}
// Unmissable save-failure notice (14 Nov): the old one-line status text was easy to
// miss, which is how documents were believed saved when they were not.
function showSaveFailModal(reason, persisted){
  let ov = $('saveFailOverlay');
  if(ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'saveFailOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(24,46,36,.55);display:flex;align-items:center;justify-content:center;padding:14px;';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;max-width:430px;width:100%;border-radius:12px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.25);';
  const t = document.createElement('div');
  t.style.cssText = 'font-weight:800;font-size:17px;color:#8a1f1f;margin-bottom:8px;';
  t.textContent = 'NOT saved to history';
  const b = document.createElement('div');
  b.style.cssText = 'font-size:14px;color:#333;margin-bottom:14px;line-height:1.45;';
  const where = ' (yellow bar at the bottom)';
  if(persisted === 'pdf'){
    b.textContent = reason + '. A PDF copy is kept in this browser' + where + '. Do not clear this browser\'s site data before the save succeeds.';
  } else if(persisted === 'state'){
    b.textContent = reason + '. The filled details are kept in this browser' + where + ' - the PDF will regenerate when you save. Do not clear this browser\'s site data before then.';
  } else if(persisted === false){
    b.textContent = reason + '. WARNING: this device could NOT keep a backup copy (browser storage is full or the recovery list is full). The document exists ONLY in this open tab - tap Download PDF again now, or keep this tab open and use Retry save.';
  } else {
    b.textContent = reason + '. The document is still in this open tab - do not close it before the save succeeds. Use Retry save or Download PDF again.';
  }
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  const mk = (txt, fn, primary) => {
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = txt;
    x.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid #8a1f1f;cursor:pointer;font-size:14px;' + (primary ? 'background:#8a1f1f;color:#fff;' : 'background:#fff;color:#8a1f1f;');
    x.addEventListener('click', fn);
    return x;
  };
  const kept = (persisted === 'pdf' || persisted === 'state');
  btns.appendChild(mk('Retry save', () => { ov.remove(); const p = pendingSave || ((typeof lastGeneratedPdf !== 'undefined') ? lastGeneratedPdf : null); if(p) uploadQuotation(p); }, kept));
  if(typeof lastGeneratedPdf !== 'undefined' && lastGeneratedPdf){
    // without a durable device copy, downloading the PDF is the ONLY safe action - make it primary
    btns.appendChild(mk('Download PDF again', () => { downloadDataUrl(lastGeneratedPdf.output('datauristring'), (window.lastGeneratedPdfName || 'BBTH-document.pdf')); }, !kept));
  }
  btns.appendChild(mk('Close', () => ov.remove(), false));
  card.appendChild(t); card.appendChild(b); card.appendChild(btns);
  ov.appendChild(card);
  document.body.appendChild(ov);
}



// ---- reference images ----
$('imgLabel').addEventListener('change', e => {
  $('imgLabelCustom').classList.toggle('hidden', e.target.value !== 'Custom label');
});
document.querySelectorAll('input[name=imgLayout]').forEach(r => r.addEventListener('change', e => {
  state.imgLayout = e.target.value;
  if(typeof renderLayoutPreview === 'function') renderLayoutPreview();
  document.querySelectorAll('.layout-opt').forEach(l => l.classList.toggle('sel', l.contains(e.target)));
  saveDraft();
}));

function readResized(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(Math.max(w,h) > MAX){ const s = MAX/Math.max(w,h); w = Math.round(w*s); h = Math.round(h*s); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

$('addImages').addEventListener('click', async () => {
  const files = Array.from($('imgFile').files || []);
  if(!files.length) return;
  let label = $('imgLabel').value;
  if(label === 'Custom label') label = $('imgLabelCustom').value.trim() || 'Reference';
  for(const f of files){
    try {
      const dataUrl = await readResized(f);
      state.refImages.push({ label, caption: label, img: dataUrl });
    } catch(e){ console.warn('image skip', e); }
  }
  $('imgFile').value = '';
  renderThumbs(); saveDraft();
});

// ---- shared reference-image library (step 4) ----
let IMG_LIB = null;
async function loadImgLib(force){
  if(IMG_LIB !== null && !force) { renderImgLib(); return; }
  const box = $('imgLib'); if(!box) return;
  try {
    const r = await api('/api/images');
    const d = await r.json();
    IMG_LIB = r.ok ? (d.images || []) : [];
  } catch(e){ IMG_LIB = []; }
  renderImgLib();
}
function renderImgLib(){
  const box = $('imgLib'); if(!box) return;
  if(IMG_LIB === null){ box.innerHTML = '<p class="hint">Loading...</p>'; return; }
  if(!IMG_LIB.length){ box.innerHTML = '<p class="hint">No saved images yet - photos from saved quotations appear here automatically.</p>'; return; }
  const used = new Set(state.refImages.map(im => im.img));
  box.innerHTML = '';
  IMG_LIB.forEach(im => {
    const div = document.createElement('div');
    div.className = 'thumb lib-thumb' + (used.has(im.data) ? ' sel' : '');
    div.innerHTML = '<img src="' + im.data + '" alt="" loading="lazy">'
      + '<div class="lib-tag">' + esc(im.label || 'reference') + '</div>';
    div.addEventListener('click', () => {
      const i = state.refImages.findIndex(x => x.img === im.data);
      if(i >= 0) state.refImages.splice(i, 1);
      else state.refImages.push({ label: im.label || 'Reference', caption: im.label || 'Reference', img: im.data });
      renderThumbs(); renderImgLib(); saveDraft();
    });
    box.appendChild(div);
  });
}

function renderThumbs(){
  const wrap = $('imgThumbs'); wrap.innerHTML = '';
  state.refImages.forEach((im, i) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = '<img src="'+im.img+'" alt="">'
      + '<input class="cap-in" type="text" value="'+esc(im.caption || '')+'" placeholder="Caption (shown below the photo)" data-cap="'+i+'">'
      + '<button class="small-btn danger" type="button" data-rdel="'+i+'">Remove</button>';
    wrap.appendChild(div);
  });
  renderLayoutPreview();
}

document.addEventListener('input', e => {
  if(e.target.dataset && e.target.dataset.cap !== undefined){ state.refImages[+e.target.dataset.cap].caption = e.target.value; saveDraft(); }
});
document.addEventListener('click', e => {
  if(e.target.dataset && e.target.dataset.rdel !== undefined){ state.refImages.splice(+e.target.dataset.rdel, 1); renderThumbs(); saveDraft(); }
});

// ---- summary + generate ----
function renderSummary(){
  const sel = state.services.filter(s => s.on);
  const ex = state.extras.filter(s => s.on);
  $('summary').innerHTML =
    '<b>Client:</b> '+esc(state.clientName||'-')+' ('+esc(state.clientPlace||'-')+')<br>'
    +'<b>Dates:</b> '+esc((state.eventDates||'').trim().replace(/\n+/g, ', ')||'-')+' &nbsp; <b>Budget:</b> '+esc(state.budget||'-')+'<br>'
    +'<b>Services selected:</b> '+sel.length+'<br>'
    +'<b>Reference images:</b> '+state.refImages.length+' ('+esc(state.imgLayout)+')'
    +(typeof templateName === 'function' ? '<br><b>PDF design:</b> '+esc(templateName(state.template)) : '');
}

// document type picker (Quotation / Agreement) + per-agreement wording
const AGREE_FIG = { agDate:'agDate', agTotal:'total', agAdvance:'advance', agDue:'due' };
const AGREE_FIELDS = { agMainTitle:'agreeMainTitle', agIntro:'agreeIntro', agTermsHead:'agreeTermsHead', agTerms:'agreeTerms', agSignHead:'agreeSignHead', agSignNote:'agreeSignNote' };
function prefillAgree(){
  if(!state.agree) state.agree = {};
  Object.keys(AGREE_FIELDS).forEach(id => {
    const key = AGREE_FIELDS[id];
    if(state.agree[key] === undefined || state.agree[key] === null) state.agree[key] = (BS().texts || {})[key] || '';
    $(id).value = state.agree[key] || '';
  });
  if(!state.agree.agDate){ try { state.agree.agDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }); } catch(e){ state.agree.agDate = ''; } }
  Object.keys(AGREE_FIG).forEach(id => { const el = $(id); if(el) el.value = state.agree[AGREE_FIG[id]] || ''; });
}
function syncAgreeUI(){
  const on = state.docType === 'agreement';
  $('agreeOpts').classList.toggle('hidden', !on);
  if(on) prefillAgree();
}
// short non-sequential reference numbers: BBTH/<2 random letters/digits>-<4-digit core>
// reference numbers: server-allocated serials, per document series
// q = quotations + confirmed bookings (BBTH/Q4/...), a = agreements (BBTH/A1/...)
let allocState = { series: null, value: '' };  // the auto-filled number from this session
function docSeries(){ return state.docType === 'agreement' ? 'a' : 'q'; }
async function allocateRefNo(){
  const series = docSeries();
  const r = await fetch('/api/refno', { method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() },
    body: JSON.stringify({ series }) });
  if(!r.ok) throw new Error('refno ' + r.status);
  const d = await r.json();
  allocState = { series, value: d.refNo, peek: false };
  state.docNo = d.refNo;
  if($('docNo')) $('docNo').value = d.refNo;
  saveDraft();
  return d.refNo;
}
// show the next number without using it up; the number is only taken when the PDF is made
async function peekRefNo(){
  const series = docSeries();
  const r = await fetch('/api/refno', { headers: { 'authorization': 'Bearer ' + adminToken() }, cache: 'no-store' });
  if(!r.ok) return;
  const d = await r.json();
  const q = d && d[series];
  if(!q || !q.prefix) return;
  if(state.docNo.trim() && allocState.value !== state.docNo.trim()) return; // user typed their own
  const v = q.prefix + q.next;
  allocState = { series, value: v, peek: true };
  state.docNo = v;
  if($('docNo')) $('docNo').value = v;
}
function syncOrderUI(){
  $('docNoWrap').classList.remove('hidden');
  if(EDIT_ID) return;  // editing a saved record keeps its number
  const series = docSeries();
  const cur = state.docNo.trim();
  const isOurs = cur && allocState.value === cur;
  if(!cur || (isOurs && (allocState.peek || allocState.series !== series))) peekRefNo().catch(() => {});
}
$('docNo').addEventListener('input', () => { state.docNo = $('docNo').value; saveDraft(); });

// ---- PDF template picker ----
function syncDocTypeVisibility(){
  const head = document.querySelector('.doc-pick');
  if(!head) return;
  const h = head.previousElementSibling;
  const show = !!EDIT_ID;
  head.style.display = show ? '' : 'none';
  if(h && h.tagName === 'H3') h.style.display = show ? '' : 'none';
}

function renderTplPick(){
  const wrap = $('tplPick');
  if(!wrap || typeof BBTH_TEMPLATES === 'undefined') return;
  wrap.innerHTML = '';
  // Deep 25 Oct 17:34: only these 3 designs are offered for new documents.
  // All other template definitions stay intact so existing saved quotations
  // and agreements still render in their original design.
  const TPL_OFFERED = ['sage-gold', 'blush-circle', 'pal-ivory-champagne'];
  BBTH_TEMPLATES.filter(t => TPL_OFFERED.includes(t.key)).forEach(t => {
    const { theme } = getTemplateTheme(t.key);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tpl-card' + (state.template === t.key ? ' sel' : '');
    card.dataset.tpl = t.key;
    card.innerHTML =
      '<span class="tpl-sw" style="background:'+theme.pagebg+';border-color:'+theme.maroon+'">'
      + '<i style="background:'+theme.maroon+'"></i><i style="background:'+theme.rose+'"></i><i style="background:'+theme.circle+'"></i></span>'
      + '<span class="tpl-nm">'+esc(t.name)+'</span>'
      + '<span class="tpl-tg">'+esc(t.tag)+'</span>';
    card.addEventListener('click', () => {
      state.template = t.key;
      wrap.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('sel', c.dataset.tpl === t.key));
      saveDraft();
      if(!$('previewOverlay').classList.contains('hidden')) renderPreview();
    });
    wrap.appendChild(card);
  });
}
document.querySelectorAll('input[name=docType]').forEach(r => r.addEventListener('change', () => {
  document.querySelectorAll('.doc-opt').forEach(o => o.classList.remove('sel'));
  const lab = r.closest('.doc-opt'); if(lab) lab.classList.add('sel');
  state.docType = r.value; syncAgreeUI(); syncOrderUI(); saveDraft();
}));
Object.keys(AGREE_FIG).forEach(id => { const el = $(id); if(el) el.addEventListener('input', () => { if(!state.agree) state.agree = {}; state.agree[AGREE_FIG[id]] = el.value; saveDraft(); }); });
Object.keys(AGREE_FIELDS).forEach(id => { $(id).addEventListener('input', () => { state.agree[AGREE_FIELDS[id]] = $(id).value; saveDraft(); }); });

$('generateBtn').addEventListener('click', async () => {
  const btn = $('generateBtn'), st = $('genStatus');
  btn.disabled = true; btn.textContent = 'Creating PDF...';
  try {
    if(!state.docNo.trim() || (allocState.peek && allocState.value === state.docNo.trim())){ try { await allocateRefNo(); } catch(e){} }
    await document.fonts.ready;
    const genFn = state.docType === 'agreement' ? generateAgreementPDF : generateQuotationPDF;
    await genFn(state,
      state.services.filter(s => s.on),
      state.extras.filter(s => s.on),
      state.refImages, state.imgLayout,
      m => { st.textContent = m; });
    st.textContent = 'Done! Your PDF has downloaded.';
    st.dataset.base = 'Done! Your PDF has downloaded.';
    if(lastGeneratedPdf) await uploadQuotation(lastGeneratedPdf);
  } catch(err){
    st.textContent = 'Something went wrong: ' + err.message;
    showSaveFailModal('PDF creation failed: ' + err.message, saveRecovery('PDF creation failed: ' + err.message));
  }
  btn.disabled = false; btn.textContent = 'Download PDF';
});



// ---- login gate ----
// remember-me aware credential storage: remembered sessions live in localStorage,
// non-remembered ones only in sessionStorage (cleared when the tab closes)
// ---- secure new-tab session handoff (Deep, 25 Oct 18:22) ----
// Dashboard stays open; internal destinations open in a new tab. The token never
// goes in the URL: a one-time localStorage handoff (30s TTL, delete-on-read)
// carries the session when Remember me is unticked. Remembered sessions already
// share localStorage across tabs.
function handoffWrite(){
  try {
    if(localStorage.getItem('bbth-admin-token')) return; // remembered: shared already
    const t = sessionStorage.getItem('bbth-admin-token');
    if(!t) return;
    localStorage.setItem('bbth-handoff', JSON.stringify({ token: t,
      name: sessionStorage.getItem('bbth-name') || '', role: sessionStorage.getItem('bbth-role') || '', ts: Date.now(),
      lat: (window.BBTHXTab ? BBTHXTab.currentLoginAt() : 0) }));
  } catch(e){}
}
function handoffAdopt(){
  try {
    if(sessionStorage.getItem('bbth-admin-token') || localStorage.getItem('bbth-admin-token')) return;
    const raw = localStorage.getItem('bbth-handoff');
    if(!raw) return;
    const h = JSON.parse(raw);
    if(h && h.token && (Date.now() - h.ts) < 30000){
      sessionStorage.setItem('bbth-admin-token', h.token);
      if(h.name) sessionStorage.setItem('bbth-name', h.name);
      if(h.role) sessionStorage.setItem('bbth-role', h.role);
      if(window.BBTHXTab) BBTHXTab.loginAtFrom(h.lat);
    }
    localStorage.removeItem('bbth-handoff');
  } catch(e){}
}
handoffAdopt();
// Cross-tab logout guard: gated sessions show the login gate IN PLACE (never a blind
// reload) so an unsaved quotation and a pending save-retry survive.
BBTHXTab.install(function(){ if(typeof showGate === 'function') showGate(); });
// delegated: <a data-newtab> opens in a new tab with the handoff written first
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[data-newtab]');
  if(!a) return;
  e.preventDefault();
  handoffWrite();
  window.open(a.getAttribute('href'), '_blank', 'noopener');
});
function credGet(k){ return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; }
function credSet(k, v, remember){
  // Remember me (Deep, 25 Oct): ticked = persistent until logout/site data cleared;
  // unticked = session-only, tab/browser close logs out.
  if(remember){ localStorage.setItem(k, v); sessionStorage.removeItem(k); }
  else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
}
function credClear(){ ['bbth-admin-token','bbth-user','bbth-role','bbth-name','bbth-handoff','bbth-login-at'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); }); }
function currentUser(){ return { token: credGet('bbth-admin-token'), name: credGet('bbth-name') || credGet('bbth-user'), role: credGet('bbth-role') }; }
function showChooser(){
  if(window.BBTHBell) setTimeout(window.BBTHBell.auto, 50);
  $('loginGate').classList.add('hidden');
  $('chooser').classList.remove('hidden');
  const cu = currentUser();
  const nm = cu.name || '';
  if($('dashName')) $('dashName').textContent = nm + (cu.role ? ' (' + cu.role + ')' : '');
  if($('dashHi')) $('dashHi').textContent = nm ? ('Hi, ' + nm + '!') : 'Welcome';
  const isStagingHost = /\.pages\.dev$/.test(location.hostname);
  $('chooser').querySelectorAll('[data-admin]').forEach(el => { el.style.display = (cu.role === 'admin') ? '' : 'none'; });
  ['dashLayout','dashLayoutCard'].forEach(id => { const el = $(id); if(el) el.style.display = isStagingHost ? '' : 'none'; });
  loadDashLists();
  if($('sugSend') && !$('sugSend').dataset.wired){ $('sugSend').dataset.wired='1'; $('sugSend').addEventListener('click', sugSend); }
}

async function loadDashLists(){
  const qbox = $('quoteList'), abox = $('agreeList');
  if(!qbox || !abox) return;
  let d;
  try {
    const r = await fetch('/api/quote-list', { headers: { 'authorization': 'Bearer ' + adminToken() }, cache: 'no-store' });
    if(!r.ok){ qbox.innerHTML = '<p class="hint">Could not load quotations.</p>'; abox.innerHTML = ''; return; }
    d = await r.json();
  } catch(e){ qbox.innerHTML = '<p class="hint">Could not load quotations.</p>'; abox.innerHTML = ''; return; }
  const isAdmin = (d.viewer && d.viewer.role === 'admin');
  const fmt = iso => { try { return new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric' }); } catch(e){ return ''; } };
  const row = (q, withAgree) => {
    const el = document.createElement('div'); el.className = 'dm-row';
    el.innerHTML = '<span class="dm-badge">' + (q.docType === 'agreement' ? 'Agreement' : 'Brief') + '</span>'
      + '<span class="nm">' + esc(q.client || '(no client name)') + '</span>'
      + '<span class="mt">#' + q.id + ' &middot; ' + esc(fmt(q.updatedAt)) + (q.by ? ' &middot; by ' + esc(q.by) : '') + '</span>'
      + '<span class="sp"></span>';
    // New-tab links via data-newtab (handoff keeps the session); Open + Make
    // Agreement for every logged-in role - staff edits route through admin approval.
    const open = document.createElement('a'); open.className = 'dm-act';
    open.href = '/app/?edit=' + q.id; open.textContent = 'Open'; open.setAttribute('data-newtab','1');
    el.appendChild(open);
    if(withAgree){
      const mk = document.createElement('a'); mk.className = 'dm-act';
      mk.href = '/app/?edit=' + q.id + '&as=agreement'; mk.textContent = 'Make Agreement'; mk.setAttribute('data-newtab','1');
      el.appendChild(mk);
    }
    return el;
  };
  const cq = (($('chooserSearch') && $('chooserSearch').value) || '').trim().toLowerCase();
  const matchQ = q => !cq || (q.client || '').toLowerCase().includes(cq) || String(q.id).includes(cq);
  // Deep 26 Oct: dashboard sort + type filter. Default keeps the saved order
  // (server returns latest-updated first); sort/filter never change saved data.
  const typeF = ($('dashTypeFilter') && $('dashTypeFilter').value) || 'all';
  const sortF = ($('dashSort') && $('dashSort').value) || 'newest';
  const sortRows = rows => rows.slice().sort((a, b) => {
    if(sortF === 'oldest') return String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''));
    if(sortF === 'name') return String(a.client || '').localeCompare(String(b.client || ''));
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  const quotes = typeF === 'agreement' ? [] : sortRows(d.rows.filter(q => q.docType !== 'agreement' && matchQ(q)));
  const agrees = typeF === 'quotation' ? [] : sortRows(d.rows.filter(q => q.docType === 'agreement' && matchQ(q)));
  const modQ = $('modQuotes'), modA = $('modAgree');
  if(modQ) modQ.style.display = (typeF === 'agreement') ? 'none' : '';
  if(modA) modA.style.display = (typeF === 'quotation') ? 'none' : '';
  qbox.innerHTML = quotes.length ? '' : '<p class="hint">No quotations yet - use Add New.</p>';
  quotes.forEach(q => qbox.appendChild(row(q, true)));
  abox.innerHTML = agrees.length ? '' : '<p class="hint">No agreements yet - make one from a quotation above.</p>';
  agrees.forEach(q => abox.appendChild(row(q, false)));
}
function hideChooser(){ $('chooser').classList.add('hidden'); }
{ let chsT; const cs = $('chooserSearch'); if(cs) cs.addEventListener('input', () => { clearTimeout(chsT); chsT = setTimeout(loadDashLists, 250); }); }
['dashTypeFilter','dashSort'].forEach(id => { const el = $(id); if(el && !el.dataset.wired){ el.dataset.wired='1'; el.addEventListener('change', loadDashLists); } });
function showGate(){
  $('loginGate').classList.remove('hidden');
  setTimeout(() => $('gateUser').focus(), 100);
}
async function gateLogin(){
  $('gateMsg').textContent = '';
  $('gateMsg').classList.remove('show');
  const remember = !!($('gateRemember') && $('gateRemember').checked);
  let r;
  try {
    r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('gateUser').value.trim(), password: $('gatePass').value }) });
  } catch(e){
    $('gateMsg').textContent = 'Network error - check your internet connection and try again.';
    $('gateMsg').classList.add('show');
    return;
  }
  if(r.ok){
    const d = await r.json();
    try { BBTHXTab.markLogin(remember); } catch(e){}
    credSet('bbth-admin-token', d.token, remember);
    credSet('bbth-user', d.username, remember);
    credSet('bbth-role', d.role, remember);
    credSet('bbth-name', d.name || d.username, remember);
    $('loginGate').classList.add('hidden');
    if(pendingSave){ bootApp(); const p = pendingSave; uploadQuotation(p); }
    else { showChooser(); }
    renderRecoveryBar();
    if(window.BBTHBell) setTimeout(window.BBTHBell.auto, 50); // bell: token exists only now
  } else {
    $('gateMsg').textContent = 'Wrong username or password.';
    $('gateMsg').classList.add('show');
    $('gatePass').value = '';
    $('gatePass').focus();
  }
}
['gateUser','gatePass'].forEach(id => $(id).addEventListener('input', () => { $('gateMsg').textContent = ''; $('gateMsg').classList.remove('show'); }));
$('forgotLink').addEventListener('click', () => { $('forgotBox').classList.toggle('hidden'); });
$('gateBtn').addEventListener('click', gateLogin);
$('gatePass').addEventListener('keydown', e => { if(e.key === 'Enter') gateLogin(); });
$('gatePwToggle').addEventListener('click', () => {
  const f = $('gatePass'), show = f.type === 'password';
  f.type = show ? 'text' : 'password';
  $('gateEyeOpen').style.display = show ? 'none' : '';
  $('gateEyeClosed').style.display = show ? '' : 'none';
  $('gatePwToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  $('gatePwToggle').title = show ? 'Hide password' : 'Show password';
  f.focus();
});
$('gateUser').addEventListener('keydown', e => { if(e.key === 'Enter') gateLogin(); });
$('userChip').addEventListener('click', () => {
  if(confirm('Log out?')) explicitLogout();
});

// ---- share link + WhatsApp share ----
let LAST_SAVED_ID = EDIT_ID ? +EDIT_ID : null;
function showShareRow(){
  const row = $('shareRow');
  if(!row) return;
  if(LAST_SAVED_ID){ row.classList.remove('hidden'); $('shareMsg').textContent = ''; }
  else row.classList.add('hidden');
}

// Bridge-ready handshake (APK): the bridge may be installed at onPageFinished,
// after scripts run. Run-now when present, else one-shot 'bbth-native-ready'
// listener with a bounded wait. Event availability is not auth or approval.
function bbthNativeReady(timeoutMs){
  if (typeof window.BBTHSharePDF === 'function') return Promise.resolve(true);
  return new Promise(res => {
    const to = setTimeout(() => res(false), timeoutMs);
    window.addEventListener('bbth-native-ready', () => { clearTimeout(to); res(typeof window.BBTHSharePDF === 'function'); }, { once: true });
  });
}
// Reliable native-context marker (NOT authentication): the BBTH Android WebView
// appends ' BBTHAndroid/1.0' to its user agent before load, and/or installs the
// BBTHSharePDF bridge. Inside the app a missing bridge is a bounded error -
// share controls NEVER fall through to the web public-link flow on timing alone.
function bbthIsNativeApp(){
  return navigator.userAgent.indexOf('BBTHAndroid/1.0') !== -1 || typeof window.BBTHSharePDF === 'function';
}
async function getShareUrl(){
  const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() },
    body: JSON.stringify({ id: LAST_SAVED_ID }) });
  const d = await r.json();
  if(!r.ok || !d.url) throw new Error(d.error || ('share failed ' + r.status));
  return d.url;
}
if($('shareCopy')) $('shareCopy').addEventListener('click', async () => {
  if (await bbthNativeReady(2000)) { await nativeSharePdf($('shareMsg')); return; }
  if (bbthIsNativeApp()) { $('shareMsg').textContent = 'App share is not ready yet - try again in a moment. No public link was created.'; return; }
  $('shareMsg').textContent = 'Making link...';
  try {
    const url = await getShareUrl();
    try { await navigator.clipboard.writeText(url); $('shareMsg').textContent = 'Link copied: ' + url; }
    catch(e){ window.prompt('Copy this share link:', url); $('shareMsg').textContent = ''; }
  } catch(e){ $('shareMsg').textContent = 'Could not make a share link - ' + e.message; }
});
// Filename exactly as js/pdf.js derives it for the CURRENT form state.
function currentPdfName(){
  const safe = (state.clientName || 'Client').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  if (state.docType === 'agreement') return 'BBTH-Agreement-' + safe + '.pdf';
  const ordered = typeof isOrder === 'function' ? isOrder(state) : true;
  return 'BBTH-' + (ordered ? 'Execution-Brief-' : 'Quotation-') + safe + '.pdf';
}
// Any edit after a PDF is generated makes that PDF stale: the native share path
// must never send an outdated document (same client name, changed details).
['input','change'].forEach(ev => document.addEventListener(ev, () => {
  if (window.lastGeneratedPdf) { window.lastGeneratedPdf = null; window.lastGeneratedPdfName = ''; }
}, true));
// Inside the BBTH app there is no public link to copy: the copy-link button
// becomes a private "Share PDF" action that hands the file to the app instead.
const markNativeShareBtn = () => {
  if (bbthIsNativeApp() && $('shareCopy')) {
    $('shareCopy').textContent = 'Share PDF';
    $('shareCopy').title = 'Share the PDF file directly from the app';
  }
};
markNativeShareBtn();
window.addEventListener('bbth-native-ready', markNativeShareBtn, { once: true });
// BBTH Android app path: the app injects window.BBTHSharePDF(blob, filename).
// Hand the PDF bytes to the app for native sharing and NEVER create a public
// share link on this path - including when the native call errors.
// Returns true when the native path handled the action.
async function nativeSharePdf(msgEl){
  if (typeof window.BBTHSharePDF !== 'function') return false;
  const expectedName = currentPdfName();
  if (!window.lastGeneratedPdf || window.lastGeneratedPdfName !== expectedName) {
    msgEl.textContent = 'Download the PDF once first, then share.';
    return true;
  }
  msgEl.textContent = 'Passing the PDF to the app...';
  try {
    await window.BBTHSharePDF(window.lastGeneratedPdf.output('blob'), expectedName);
    msgEl.textContent = '';
  } catch(e){
    msgEl.textContent = 'App share failed - ' + ((e && e.message) || e) + '. No public link was created.';
  }
  return true;
}
if($('shareWa')) $('shareWa').addEventListener('click', async () => {
  if (await bbthNativeReady(2000)) { await nativeSharePdf($('shareMsg')); return; }
  if (bbthIsNativeApp()) { $('shareMsg').textContent = 'App share is not ready yet - try again in a moment. No public link was created.'; return; }
  $('shareMsg').textContent = 'Making link...';
  try {
    const url = await getShareUrl();
    $('shareMsg').textContent = '';
    const label = state.docType === 'agreement' ? 'Wedding Planning Agreement' : 'Wedding Execution Brief';
    const text = 'BBTH - ' + label + (state.docNo ? ' ' + state.docNo : '') + ' for ' + (state.clientName || 'client') + ': ' + url;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  } catch(e){ $('shareMsg').textContent = 'Could not make a share link - ' + e.message; }
});

// ---- server settings + theme ----
function applyTheme(){
  const t = BS().theme || {};
  const r = document.documentElement.style;
  if(t.maroon) r.setProperty('--c-maroon', t.maroon);
  if(t.rose) r.setProperty('--c-rose', t.rose);
  if(t.pagebg) r.setProperty('--c-pagebg', t.pagebg);
  if(t.circle) r.setProperty('--c-circle', t.circle);
  if(t.band) r.setProperty('--c-band', t.band);
  if(t.ink) r.setProperty('--c-ink', t.ink);
  if(BS().fontHead) r.setProperty('--f-head', "'" + BS().fontHead + "', serif");
  if(BS().fontBody) r.setProperty('--f-body', "'" + BS().fontBody + "', sans-serif");
  const fams = [BS().fontHead, BS().fontBody].filter(Boolean)
    .filter(f => !['Playfair Display','Poppins'].includes(f));
  if(fams.length){
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + fams.map(f => 'family=' + encodeURIComponent(f).replace(/%20/g,'+') + ':ital,wght@0,400;0,500;0,600;1,400;1,500').join('&') + '&display=swap';
    document.head.appendChild(l);
  }
}
async function loadServerSettings(){
  try {
    const r = await fetch('/api/settings', { headers: { 'authorization': 'Bearer ' + adminToken() }, cache: 'no-store' });
    if(r.status === 401){ BBTHXTab.sessionDead(); showGate(); return; }
    if(!r.ok) return;
    const s = await r.json();
    if(s && typeof s === 'object' && Object.keys(s).length){
      window.BBTH_SETTINGS = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
      window.BBTH_SETTINGS.theme = Object.assign({}, DEFAULT_SETTINGS.theme, s.theme || {});
      window.BBTH_SETTINGS.texts = Object.assign({}, DEFAULT_SETTINGS.texts, s.texts || {});
      ['company','address','contact','signoff','footerContacts'].forEach(k => { if(BS()[k]) state[k] = BS()[k]; });
      applyTheme();
    }
  } catch(e){ /* offline or no settings yet - defaults apply */ }
}

// ---- quotation history (server) + edit mode ----
function adminToken(){ return credGet('bbth-admin-token'); }
let pendingSave = null;
function statusBase(){ const st = $('genStatus'); return (st && st.dataset.base) || 'Done! Your PDF has downloaded.'; }
function showSaveFail(reason, autoRetryNote, persisted){
  const st = $('genStatus');
  if(!st) return;
  st.innerHTML = '';
  st.appendChild(document.createTextNode(statusBase() + ' History save failed: ' + reason + '.' + (autoRetryNote ? ' ' + autoRetryNote : '') + ' '));
  if(pendingSave && !autoRetryNote){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'retry-save-btn'; b.textContent = 'Retry';
    b.addEventListener('click', () => {
      const st2 = $('genStatus');
      if(st2) st2.textContent = statusBase() + ' Retrying history save...';
      uploadQuotation(pendingSave);
    });
    st.appendChild(b);
  }
  showSaveFailModal(reason, persisted);
}
async function uploadQuotation(pdf){
  const token = adminToken();
  const st = $('genStatus');
  if(!token){ pendingSave = pdf; showSaveFail('you are not logged in', null, saveRecovery('you are not logged in')); return; }
  let r, reason = '';
  const editTarget = RECOVERY_EDIT_ID || EDIT_ID;
  // opened from history but doc type switched -> save as a NEW record, keep the original
  const asNew = EDIT_ID && EDIT_DOCTYPE && state.docType !== EDIT_DOCTYPE;
  // Blank-save prevention: a NEW record with no client name creates a useless
  // empty row in history (the "double entry" confusion) - block it.
  if ((!editTarget || asNew) && !(($("clientName") && $("clientName").value) || '').trim()) {
    pendingSave = pdf;
    if (st) st.textContent = statusBase() + ' Not saved to history - enter the client name before saving.';
    showSaveFailModal('Not saved to history - enter the client name, then tap Retry save', saveRecovery('not saved - client name missing'));
    return;
  }
  try {
    const dataUrl = pdf.output('datauristring');
    const payload = { data: state, pdf: dataUrl };
    // Approval-gated edits (Deep, 25 Oct): a STAFF edit to an EXISTING record is a
    // change request to the admin, not a direct write. New quotations still save directly.
    if (editTarget && !asNew && (credGet('bbth-role') || 'admin') !== 'admin') {
      try {
        const cr = await fetch('/api/changes', { method: 'POST',
          headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
          body: JSON.stringify({ type: 'quotation-edit', targetId: String(editTarget),
            summary: 'Edit to ' + (EDIT_DOCTYPE === 'agreement' ? 'agreement' : 'quotation') + ' #' + editTarget + (($("clientName").value || '').trim() ? ' - ' + ($("clientName").value || '').trim() : ''),
            payload: { data: state, pdf: dataUrl, client: ($("clientName").value || '').trim() } }) });
        if (cr.ok) {
          removeRecovery(curRecoveryId); curRecoveryId = null; if(RECOVERY_EDIT_ID) RECOVERY_EDIT_ID = null;
          pendingSave = null; LAST_SAVED_ID = null;
          if (st) st.textContent = 'Sent to the admin for approval. The record updates after the admin approves it.';
          return;
        }
        reason = 'could not send the change for approval (HTTP ' + cr.status + ')';
      } catch(e) { reason = 'network error - check your internet connection'; }
      pendingSave = pdf; showSaveFail(reason); return;
    }
    const url = (editTarget && !asNew) ? '/api/quotations/' + editTarget : '/api/quotations';
    r = await fetch(url, { method: (editTarget && !asNew) ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
      body: JSON.stringify(payload) });
  } catch(e){ pendingSave = pdf; showSaveFail('network error - check your internet connection', null, saveRecovery('network error - check your internet connection')); return; }
  if(r.ok){
    pendingSave = null;
    removeRecovery((state.docNo || '').trim());
    removeRecovery(curRecoveryId); curRecoveryId = null;
    if(RECOVERY_EDIT_ID) RECOVERY_EDIT_ID = null;
    if(editTarget && !asNew){ LAST_SAVED_ID = +editTarget; }
    else {
      // New record (fresh quotation OR Make Agreement): read the new id from the
      // POST response so auto-register can attach this document's own link.
      LAST_SAVED_ID = null;
      try { const d = await r.clone().json(); if(d && d.id) LAST_SAVED_ID = d.id; } catch(e){}
    }
    if(st) st.textContent = statusBase() + (asNew ? ' Saved as a new ' + (state.docType === 'agreement' ? 'agreement' : 'quotation') + ' in history - record #' + EDIT_ID + ' kept as-is.' : (editTarget ? ' Quotation #' + editTarget + ' updated in history.' : ' Saved to admin history.'));
    showShareRow();
    // auto-register the client (Deep, 25 Oct 18:03): full client details, the
    // document's own number (quotation number for quotations, agreement number
    // for agreements) and a direct share link - upserted, retry-safe, and the
    // register status is never downgraded.
    const cn = ($("clientName").value || "").trim(), cp = ($("clientPhone").value || "").trim();
    if (cn && LAST_SAVED_ID) {
      (async () => {
        // Inside the BBTH app no public link is ever created (APK contract):
        // the register entry carries the doc number; a share URL only outside the app.
        // No implicit public link inside the app - native UA OR hook, not hook only.
        let shareUrl = '';
        if (!(await bbthNativeReady(2000)) && !bbthIsNativeApp()) { try { shareUrl = await getShareUrl(); } catch(e) {} }
        // capture current register ids first, so the post-save pass can tell a
        // brand-new row from a pre-existing one (never downgrade existing rows)
        let preIds = null;
        try {
          const g = await fetch('/api/client-register', { headers: { authorization: 'Bearer ' + adminToken() }, cache: 'no-store' });
          const gd = await g.json(); preIds = new Set((Array.isArray(gd.rows) ? gd.rows : []).map(x => x.id));
        } catch(e){}
        await fetch("/api/client-register", { method:"POST", headers:{ "content-type":"application/json", "authorization":"Bearer " + adminToken() },
          body: JSON.stringify({
            name: cn, phone: cp,
            venue: ($("clientPlace").value || "").trim(),
            eventDates: ($("eventDates").value || "").trim(),
            doc: { id: LAST_SAVED_ID, no: state.docNo || '', kind: state.docType === 'agreement' ? 'agreement' : 'quotation', url: shareUrl }
          }) }).catch(()=>{});
        // Deep 26 Oct: "quotation bante hi uska status Quoted hoga" - the worker owns
        // identity/dedupe; this pass ONLY upgrades a row this save just created from
        // Enquiry to Quoted. Existing rows' statuses are never downgraded.
        // Amounts (Deep 26 Oct): Quoted from the quotation, Agreed/Advance from the
        // agreement - EMPTY fields only, manual register entries always win.
        try {
          if(preIds){
            const g2 = await fetch('/api/client-register', { headers: { authorization: 'Bearer ' + adminToken() }, cache: 'no-store' });
            const d2 = await g2.json();
            const rows = Array.isArray(d2.rows) ? d2.rows : [];
            const nm = cn.toLowerCase().replace(/\s+/g, ' ').trim();
            const matches = rows.filter(x => (x.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === nm);
            const row = matches.find(x => (x.phone || '') === cp) || (matches.length === 1 ? matches[0] : null);
            if(row){
              let dirty = false;
              if(!preIds.has(row.id) && (row.status || 'Enquiry') === 'Enquiry'){ row.status = 'Quoted'; dirty = true; }
              const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; };
              const blank = v => !String(v == null ? '' : v).trim();
              if(state.docType !== 'agreement'){
                if(blank(row.quoted)){
                  // quotation docs carry per-line rates, no grand total: auto-fill only
                  // when EVERY selected line is numeric - a partial sum is a wrong amount
                  const lines = (state.services || []).filter(s => s.on).concat((state.extras || []).filter(s => s.on));
                  let sum = 0, allNum = lines.length > 0;
                  lines.forEach(s => { const n = num(s.rate); if(n === null) allNum = false; else sum += n; });
                  if(allNum && sum > 0){ row.quoted = String(sum); dirty = true; }
                }
              } else {
                const ag = state.agree || {};
                if(blank(row.agreed) && num(ag.total) !== null && num(ag.total) > 0){ row.agreed = String(num(ag.total)); dirty = true; }
                if(blank(row.advance) && num(ag.advance) !== null && num(ag.advance) >= 0){ row.advance = String(num(ag.advance)); dirty = true; }
              }
              if(dirty){
                row.updatedAt = new Date().toISOString();
                await fetch('/api/client-register', { method: 'PUT', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + adminToken() }, body: JSON.stringify({ rows }) });
              }
            }
          }
        } catch(e){}
      })();
    }
    return;
  }
  reason = 'server error ' + r.status;
  try { const d = await r.json(); if(d && d.error) reason = d.error; } catch(e){}
  pendingSave = pdf;
  if(r.status === 401){
    const rc = saveRecovery('your login session expired');
    BBTHXTab.sessionDead();
    showSaveFail('your login session expired', 'Log in again and the save will retry automatically.', rc);
    showGate();
    return;
  }
  if(r.status === 413) reason = 'the PDF is too large to store (try fewer or smaller images)';
  if(r.status === 409){
    // Number conflict: a DIFFERENT document already exists in history under this number
    // (historical duplicate / reused number / newer edit saved elsewhere). The server
    // changed nothing. Keep the recovery entry and say exactly what happened.
    const dn = (state.docNo || '').trim();
    showSaveFail('a different document with this number (' + dn + ') already exists in history - this copy was NOT saved and nothing was overwritten. Check history for ' + dn + '; your document stays in this tab and the yellow bar below',
      null, saveRecovery('number conflict - a different document already has ' + dn));
    return;
  }
  showSaveFail(reason, null, saveRecovery(reason));
}
async function loadEditQuotation(){
  if(!EDIT_ID) return false;
  const token = adminToken();
  if(!token) return false;
  try {
    let r = await fetch('/api/quotations/' + EDIT_ID, { headers: { 'authorization': 'Bearer ' + token } });
    if(!r.ok){
      // Staff sessions: the upstream record API is admin/owner-scoped - use the
      // shared viewer endpoint (record data only, no PDF blob).
      const r2 = await fetch('/api/quote-view?id=' + EDIT_ID, { headers: { 'authorization': 'Bearer ' + token } });
      if(!r2.ok) return false;
      const q2 = await r2.json();
      if(!q2 || !q2.data) return false;
      Object.assign(state, q2.data);
      EDIT_DOCTYPE = q2.data.docType === 'agreement' ? 'agreement' : 'quotation';
      if(new URLSearchParams(location.search).get('as') === 'agreement' && EDIT_DOCTYPE === 'quotation'){ state.docType = 'agreement'; state.docNo = ''; state.agree = {}; state.sourceQuotationId = EDIT_ID; state.sourceQuotationNo = q2.data.docNo || ''; }
      syncAgreeUI();
      return true;
    }
    const q = await r.json();
    Object.assign(state, q.data);
    EDIT_DOCTYPE = q.data.docType === 'agreement' ? 'agreement' : 'quotation';
    if(new URLSearchParams(location.search).get('as') === 'agreement' && EDIT_DOCTYPE === 'quotation'){ state.docType = 'agreement'; state.docNo = ''; state.agree = {}; state.sourceQuotationId = EDIT_ID; state.sourceQuotationNo = q.data.docNo || ''; }
    const st = $('genStatus');
    if(st) st.textContent = 'Editing quotation #' + EDIT_ID + ' - download to save changes back.';
    return true;
  } catch(e){ return false; }
}

// ---- form text from template (admin editable) ----
function applyFormTexts(){
  const texts = BS().texts || {};
  // Staging: Extras step removed, so step nav labels are fixed here (shared D1
  // settings.texts still carries the old 5-step labels used by production).
  const STEP_NAV = {
    fStep1: '1. Client', fStep2: '2. Services', fStep4: '3. Images', fStep5: '4. PDF',
    fNext1: 'Next: Choose services', fNext2: 'Next: Reference images', fNext4: 'Next: Create PDF'
  };
  document.querySelectorAll('[data-ft]').forEach(el => {
    const v = STEP_NAV[el.dataset.ft] || texts[el.dataset.ft];
    if(v !== undefined && v !== null && String(v) !== '') el.textContent = v;
  });
  document.querySelectorAll('[data-fp]').forEach(el => {
    const v = texts[el.dataset.fp];
    if(v !== undefined && v !== null && String(v) !== '') el.placeholder = v;
  });
}

// ---- live sync: admin saves -> open form tabs update without a manual reload ----
let SYNC_BUSY = false;
async function syncFromServer(){
  if(SYNC_BUSY || !currentUser().token || $('loginGate').classList.contains('hidden') === false) return;
  SYNC_BUSY = true;
  await loadServerSettings();
  // refresh the visible company fields (client data the user typed is untouched)
  ['company','signoff','footerContacts'].forEach(id => { $(id).value = state[id] || ''; });
  $('companyAddr').value = state.address || '';
  $('companyContact').value = state.contact || '';
  applyFormTexts();
  applyTheme();
  // untouched form: also pick up service/rate edits and fresh agreement wording
  const untouched = !state.clientName.trim() && !state.services.some(sv => sv.on) && !state.refImages.length;
  if(untouched){
    await initLists();
    state.agree = {};
    if(state.docType === 'agreement'){ prefillAgree(); }
    syncAgreeUI();
  }
  SYNC_BUSY = false;
}
window.addEventListener('storage', e => { if(e.key === 'bbth-settings-ts') syncFromServer(); });
document.addEventListener('visibilitychange', () => { if(!document.hidden) syncFromServer(); });

// ---- boot ----
async function sugSend(){
  const t = ($('sugText').value || '').trim();
  const m = $('sugMsg');
  if(!t){ m.textContent = 'Type something first.'; return; }
  m.textContent = 'Sending...';
  try {
    const r = await fetch('/api/changes', { method:'POST',
      headers:{ 'content-type':'application/json', 'authorization':'Bearer ' + adminToken() },
      body: JSON.stringify({ type:'suggestion', summary: t.slice(0, 300), payload:{} }) });
    if(r.ok){ $('sugText').value=''; m.textContent = 'Sent - the admin will see it in Pending approvals.'; }
    else m.textContent = 'Could not send (HTTP ' + r.status + '). Try again.';
  } catch(e){ m.textContent = 'Network error - try again.'; }
}
async function bootApp(){
  if(window.BBTHBell) setTimeout(window.BBTHBell.auto, 50);
  $('loginGate').classList.add('hidden');
  const cu = currentUser();
  const chip = $('userChip');
  chip.textContent = cu.name ? (cu.name + (cu.role ? ' (' + cu.role + ')' : '') + ' - Log out') : 'Log out';
  chip.classList.remove('hidden');
  if(cu.role !== 'admin'){ document.querySelectorAll('a[href="/admin/"]').forEach(a => { a.style.display = 'none'; }); const ft = document.querySelector('footer'); if(ft) ft.style.display = 'none'; }
  await loadServerSettings();
  await initLists();
  applyFormTexts();
  renderTplPick();
  syncDocTypeVisibility();
  loadImgLib();
  goStep(1);
  if(EDIT_ID){
    if(await loadEditQuotation()){ fillForm(); syncAgreeUI(); }
  } else if(new URLSearchParams(location.search).get('harness') === '1'){
    // dev harness only: apply a seeded state from this browser's localStorage, never a saved draft
    try { const h = JSON.parse(localStorage.getItem('bbth-harness') || 'null'); if(h){ Object.assign(state, h); fillForm(); } } catch(e){}
    localStorage.removeItem('bbth-harness');
  } else {
    // Deep's rule: a fresh visit or refresh always starts blank - no draft restore
    try { localStorage.removeItem('bbth-draft'); localStorage.removeItem('bbth-draft-ts'); } catch(e){}
  }
  // company details always come from the server settings (drafts never carry them)
  ['company','signoff','footerContacts'].forEach(id => { $(id).value = state[id] || ''; });
  $('companyAddr').value = state.address || '';
  $('companyContact').value = state.contact || '';
  applyTheme();
  // Native share handoff from the admin history row (APK contract): the app
  // never creates a public link. READ-ONLY path: fetch the record's STORED PDF
  // and hand it to the native bridge - no generation, no ref allocation, no
  // save/upload, no register sync, no share POST, one native chooser only.
  if (EDIT_ID && new URLSearchParams(location.search).get('nativeshare') === '1') {
    const st = $('genStatus');
    const shareStored = async () => {
      try {
        if (st) st.textContent = 'Preparing the PDF to share from the app...';
        // Read-only stored-PDF endpoint; the worker enforces the SAME record-view
        // authorization as quote-view (admin and staff, non-deleted records).
        const r = await fetch('/api/quote-pdf?id=' + EDIT_ID, { headers: { authorization: 'Bearer ' + adminToken() }, cache: 'no-store' });
        if (r.status === 401) { if (st) st.textContent = 'App share needs a login on this device. No public link was created.'; return; }
        if (!r.ok) { if (st) st.textContent = 'This record has no saved PDF yet - open it, use Download PDF once, then share. No public link was created.'; return; }
        const blob = await r.blob();
        if (!blob || !blob.size) { if (st) st.textContent = 'This record has no saved PDF yet - open it, use Download PDF once, then share. No public link was created.'; return; }
        const d = state || {};
        const safe = (d.clientName || 'Client').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
        const fname = d.docType === 'agreement' ? 'BBTH-Agreement-' + safe + '.pdf'
          : 'BBTH-' + ((typeof isOrder === 'function' ? isOrder(d) : true) ? 'Execution-Brief-' : 'Quotation-') + safe + '.pdf';
        await window.BBTHSharePDF(blob, fname);
        if (st) st.textContent = '';
      } catch(e) { if (st) st.textContent = 'App share failed - ' + ((e && e.message) || e) + '. No public link was created.'; }
    };
    // Bridge-ready handshake: run now if the bridge exists, otherwise a one-shot
    // 'bbth-native-ready' listener (the APK dispatches it right after installing
    // BBTHSharePDF). Bounded wait; NEVER a public-link fallback.
    if (typeof window.BBTHSharePDF === 'function') shareStored();
    else {
      if (st) st.textContent = 'Waiting for the app...';
      const to = setTimeout(() => { if (st) st.textContent = 'App share is not available here. No public link was created.'; }, 10000);
      window.addEventListener('bbth-native-ready', () => {
        clearTimeout(to);
        if (typeof window.BBTHSharePDF === 'function') shareStored();
        else if (st) st.textContent = 'App share is not available here. No public link was created.';
      }, { once: true });
    }
  }
  BOOTED = true;
}
// EXPLICIT user logout only. In the BBTH app this must clear EVERY retained
// tab/WebView, so it hands off to the native bridge and returns; if the bridge
// is unavailable on the native UA, wait once (bounded) and otherwise show a
// bounded error - never claim an all-tabs logout with a local-only clear.
// Expiry/401/timeout paths keep using plain credClear (local-only, by design).
async function explicitLogout(){
  if (typeof window.BBTHLogoutAllTabs === 'function') { window.BBTHLogoutAllTabs(); return; }
  if (bbthIsNativeApp()) {
    const ok = await bbthNativeReady(4000);
    if (ok && typeof window.BBTHLogoutAllTabs === 'function') { window.BBTHLogoutAllTabs(); return; }
    alert('App logout is not ready yet - try again in a moment. You have NOT been logged out.');
    return;
  }
  BBTHXTab.signal(); credClear(); location.reload();
}
const doLogout = () => { if(confirm('Log out?')) explicitLogout(); };
// Deep 26 Oct: Refresh on every page. Here: re-fetch settings + service/extra lists
// WITHOUT touching the form - current selections, quantities and custom lines survive.
async function refreshListsPreserve(){
  const prevS = (state.services || []).map(s => ({ name: s.name.toLowerCase(), on: s.on, qty: s.qty, size: s.size, theme: s.theme, custom: s.custom, raw: s }));
  const prevE = (state.extras || []).map(e => ({ name: e.name.toLowerCase(), on: e.on, custom: e.custom, raw: e }));
  await initLists();
  const ps = new Map(prevS.map(x => [x.name, x])), pe = new Map(prevE.map(x => [x.name, x]));
  state.services.forEach(s => { const p = ps.get(s.name.toLowerCase()); if(p){ s.on = p.on; s.qty = p.qty; s.size = p.size; s.theme = p.theme; } });
  prevS.filter(x => x.custom && !state.services.some(s => s.name.toLowerCase() === x.name)).forEach(x => state.services.push(x.raw));
  state.extras.forEach(e => { const p = pe.get(e.name.toLowerCase()); if(p){ e.on = p.on; } });
  prevE.filter(x => x.custom && !state.extras.some(e => e.name.toLowerCase() === x.name)).forEach(x => state.extras.push(x.raw));
  renderServices(); if($('extraList')) renderExtras();
}
if($('dashRefresh')) $('dashRefresh').addEventListener('click', async () => {
  const b = $('dashRefresh'); b.disabled = true;
  try { await loadSettings(); await refreshListsPreserve(); } catch(e){}
  b.disabled = false; b.textContent = 'Refreshed'; setTimeout(() => { b.textContent = 'Refresh'; }, 2000);
});
if($('dashLogout')) $('dashLogout').addEventListener('click', doLogout);
if($('dashBurger')) $('dashBurger').addEventListener('click', () => { $('dashSide').classList.toggle('closed'); });
if($('dashSide') && window.innerWidth<=760) $('dashSide').classList.add('closed');
if($('dashSide')){
  const dashClose = document.createElement('button');
  dashClose.type = 'button'; dashClose.className = 'dash-close';
  dashClose.setAttribute('aria-label','Close menu'); dashClose.innerHTML = '&times;';
  dashClose.addEventListener('click', () => { $('dashSide').classList.add('closed'); });
  $('dashSide').appendChild(dashClose);
  document.addEventListener('click', (e) => {
    const side = $('dashSide');
    if(!side || window.innerWidth > 760 || side.classList.contains('closed')) return;
    if(side.contains(e.target)) return;
    if($('dashBurger') && $('dashBurger').contains(e.target)) return;
    side.classList.add('closed');
  });
}
if(currentUser().token){ const q = new URLSearchParams(location.search); renderRecoveryBar(); if(EDIT_ID || q.get('new') === 'quote' || q.get('new') === 'agreement'){ bootApp(); if(q.get('new') === 'agreement'){ const r = document.querySelector('input[name=docType][value="agreement"]'); if(r){ r.checked = true; r.dispatchEvent(new Event('change')); } } } else showChooser(); } else showGate();

// ---- live preview ----
let pvTimer = null;
function renderPreview(){
  const inner = $('pvInner');
  let r;
  try { r = buildPreviewPages(state, state.services.filter(s => s.on), state.extras.filter(s => s.on), state.refImages, state.imgLayout); }
  catch(e){ r = { pages: [buildCover(state)], key: state.template, agreement: false }; }
  applyTemplateVars(inner, r.key);
  inner.innerHTML = r.pages.map((h, i) => '<div class="pv-pg">' + h + '</div>').join('');
  const hd = document.querySelector('.pv-head span'); if(hd) hd.textContent = 'Live Preview - ' + (r.agreement ? 'Agreement' : 'Quotation') + ' (' + r.pages.length + ' pages)';
  const scale = Math.min(1, (document.querySelector('.pv-scroll').clientWidth - 4) / 794);
  const wrap = $('pvScale');
  wrap.style.transform = 'scale(' + scale + ')';
  wrap.style.width = (794 * scale) + 'px';
  wrap.style.height = (inner.scrollHeight * scale) + 'px';
}
$('previewBtn').addEventListener('click', () => { $('previewOverlay').classList.remove('hidden'); renderPreview(); });
$('previewClose').addEventListener('click', () => $('previewOverlay').classList.add('hidden'));
$('previewOverlay').addEventListener('click', e => { if(e.target.id === 'previewOverlay') e.target.classList.add('hidden'); });
document.addEventListener('input', () => { if(!$('previewOverlay').classList.contains('hidden')){ clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 350); } });

// boot: mark selected layout card
const initLay = document.querySelector('input[name=imgLayout]:checked');
if(initLay) initLay.dispatchEvent(new Event('change'));


// live balance in the agreement details card
function agBalUpdate(){
  const n = v => parseFloat(String(v || '').replace(/[^0-9.]/g, '')) || 0;
  const t = $('agTotal'), ad = $('agAdvance'), b = $('agBalance');
  if(!t || !ad || !b) return;
  b.value = (t.value.trim() || ad.value.trim()) ? 'Rs. ' + Math.max(0, n(t.value) - n(ad.value)).toLocaleString('en-IN') : '';
}
['agTotal','agAdvance'].forEach(id => { const el = $(id); if(el) el.addEventListener('input', agBalUpdate); });
const _pa = prefillAgree; prefillAgree = function(){ _pa.apply(this, arguments); agBalUpdate(); };
