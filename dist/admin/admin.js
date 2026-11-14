// BBTH Admin Panel
const $ = id => document.getElementById(id);
// Deep 26 Oct: register event reminders come FIRST on admin arrival - hold the bell
// login-popup until the reminder pass resolves. Set synchronously (this script loads
// before bell.js); cleared by regBootPopups/regPopNext on every exit path.
try { sessionStorage.setItem('bbthRegHold', String(Date.now())); } catch(e){}

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
function credClearAll(){ try { BBTHXTab.signal(); } catch(e){} credClear(); }

// Cross-tab logout guard (shared, js/crosstab.js): gates this tab when its session
// predates the last logout signal; re-login ordering and suspended tabs covered there.
BBTHXTab.install();
let TOKEN = credGet('bbth-admin-token');
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

// ---------- toast notifications ("Done" popups on every change) ----------
function miniToast(msg, isErr){
  let el = $('miniToast');
  if(!el){ el = document.createElement('div'); el.id = 'miniToast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.add('show');
  clearTimeout(miniToast._t);
  miniToast._t = setTimeout(()=>el.classList.remove('show'), 2200);
}
// Premium action popups (Deep 10 Nov): every confirm/alert becomes a styled
// dialog with a close button - no native browser chrome. Resolves true on the
// primary action, false on cancel / close / scrim / Escape.
function admPop(opts){
  opts = opts || {};
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.className = 'apop';
    ov.innerHTML = '<div class="apop-card" role="dialog" aria-modal="true">'
      + '<button type="button" class="apop-x" aria-label="Close">&times;</button>'
      + '<h3>' + esc(opts.title || 'Confirm') + '</h3>'
      + '<p>' + esc(opts.body || '').replace(/\n/g, '<br>') + '</p>'
      + '<div class="apop-btns">'
      + (opts.cancelText === null ? '' : '<button type="button" class="small-btn apop-cancel">' + esc(opts.cancelText || 'Cancel') + '</button>')
      + '<button type="button" class="next-btn apop-ok">' + esc(opts.okText || 'OK') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    let done = false;
    function onKey(e){ if(e.key === 'Escape') fin(false); }
    function fin(v){ if(done) return; done = true; ov.classList.remove('in'); setTimeout(() => ov.remove(), 170); document.removeEventListener('keydown', onKey); res(v); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if(e.target === ov) fin(false); });
    ov.querySelector('.apop-x').addEventListener('click', () => fin(false));
    const c = ov.querySelector('.apop-cancel'); if(c) c.addEventListener('click', () => fin(false));
    ov.querySelector('.apop-ok').addEventListener('click', () => fin(true));
  });
}
function admConfirm(body, opts){ return admPop(Object.assign({ title:'Confirm', body:body, okText:'Yes', cancelText:'Cancel' }, opts || {})); }
function admInfo(body, opts){ return admPop(Object.assign({ title:'BBTH', body:body, okText:'OK', cancelText:null }, opts || {})); }
function toast(msg, isErr){
  let ov = $('popOv');
  if(!ov){ ov = document.createElement('div'); ov.id = 'popOv'; ov.className = 'pop-ov hidden'; document.body.appendChild(ov); }
  clearTimeout(toast._t);
  ov.innerHTML = '<div class="pop-box' + (isErr ? ' err' : '') + '"><div class="pop-tick">' + (isErr ? '!' : '&#10003;') + '</div><h3></h3><p></p><button type="button" class="btn">OK</button></div>';
  ov.querySelector('h3').textContent = isErr ? 'Something went wrong' : 'Updated successfully';
  ov.querySelector('p').textContent = msg;
  ov.classList.remove('hidden');
  const close = () => ov.classList.add('hidden');
  ov.querySelector('button').addEventListener('click', close);
  ov.onclick = e => { if(e.target === ov) close(); };
  if(!isErr) toast._t = setTimeout(close, 3200);
}

// ---------- confirm modal ----------
let cmResolve = null;
function confirmModal(title, body, okLabel){
  $('cmTitle').textContent = title;
  $('cmBody').textContent = body;
  $('cmOk').textContent = okLabel || 'Delete';
  $('confirmModal').classList.remove('hidden');
  return new Promise(res => { cmResolve = res; });
}
$('cmCancel').addEventListener('click', () => { $('confirmModal').classList.add('hidden'); if(cmResolve) cmResolve(false); });
$('cmOk').addEventListener('click', () => { $('confirmModal').classList.add('hidden'); if(cmResolve) cmResolve(true); });
$('confirmModal').addEventListener('click', e => { if(e.target.id === 'confirmModal'){ $('confirmModal').classList.add('hidden'); if(cmResolve) cmResolve(false); } });

const COLOR_FIELDS = [
  ['maroon', 'Sage green (header bands, cover panel, buttons)'],
  ['rose', 'Gold accent (rules, kickers, highlights)'],
  ['pagebg', 'Page background (ivory)'],
  ['circle', 'Decorative circles'],
  ['band', 'Soft sage tint (spare accent)'],
  ['ink', 'Headings text']
];
const HEAD_FONTS = ['Playfair Display','Cormorant Garamond','Libre Baskerville','DM Serif Display','Lora'];
const BODY_FONTS = ['Poppins','Inter','Nunito','Lato','Jost'];

async function api(path, opts = {}){
  opts.headers = Object.assign({}, opts.headers, { 'authorization': 'Bearer ' + TOKEN });
  const r = await fetch(path, opts);
  if(r.status === 401){ BBTHXTab.sessionDead(); throw new Error('Session expired - log in again'); }
  return r;
}

// ---------- login ----------
let ROLE = 'admin', UNAME = 'admin', DNAME = 'admin';
async function doLogin(){
  $('loginMsg').textContent = '';
  $('loginMsg').classList.remove('show');
  const remember = !!($('admRemember') && $('admRemember').checked);
  let r;
  try {
    r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('un').value.trim(), password: $('pw').value }) });
  } catch(e){
    $('loginMsg').textContent = 'Network error - check your internet connection and try again.';
    $('loginMsg').classList.add('show');
    return;
  }
  if(r.ok){
    const d = await r.json();
    TOKEN = d.token; ROLE = d.role; UNAME = d.username; DNAME = d.name || d.username;
    try { BBTHXTab.markLogin(remember); } catch(e){}
    credSet('bbth-admin-token', TOKEN, remember);
    credSet('bbth-role', ROLE, remember);
    credSet('bbth-user', UNAME, remember);
    credSet('bbth-name', DNAME, remember);
    showPanel();
    toast('Done - signed in as ' + DNAME);
  } else {
    $('loginMsg').textContent = 'Wrong username or password.';
    $('loginMsg').classList.add('show');
    $('pw').value = '';
    $('pw').focus();
  }
}
['un','pw'].forEach(id => $(id).addEventListener('input', () => { $('loginMsg').textContent = ''; $('loginMsg').classList.remove('show'); }));
$('loginBtn').addEventListener('click', doLogin);
$('pw').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('forgotLink').addEventListener('click', () => { $('forgotBox').classList.toggle('hidden'); });
$('pwToggle').addEventListener('click', () => {
  const f = $('pw'), show = f.type === 'password';
  f.type = show ? 'text' : 'password';
  $('pwEyeOpen').style.display = show ? 'none' : '';
  $('pwEyeClosed').style.display = show ? '' : 'none';
  $('pwToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  $('pwToggle').title = show ? 'Hide password' : 'Show password';
  f.focus();
});
function logout(){
  TOKEN = '';
  credClearAll(); // clears this tab AND signals every other open BBTH tab
  location.reload();
}
// Bridge-ready handshake (APK): run-now when the bridge exists, else one-shot
// 'bbth-native-ready' listener with a bounded wait.
function bbthNativeReadyLogout(timeoutMs){
  if (typeof window.BBTHLogoutAllTabs === 'function') return Promise.resolve(true);
  return new Promise(res => {
    const to = setTimeout(() => res(false), timeoutMs);
    window.addEventListener('bbth-native-ready', () => { clearTimeout(to); res(typeof window.BBTHLogoutAllTabs === 'function'); }, { once: true });
  });
}
// EXPLICIT user logout only. In the BBTH app (UA marker ' BBTHAndroid/1.0') an
// explicit logout must clear EVERY retained tab/WebView via the native bridge;
// if it is unavailable, bounded wait then a bounded error - never claim an
// all-tabs logout with a local-only clear. The 401/expiry path above stays
// local-only by design.
async function explicitLogout(){
  if (typeof window.BBTHLogoutAllTabs === 'function') { window.BBTHLogoutAllTabs(); return; }
  if (navigator.userAgent.indexOf('BBTHAndroid/1.0') !== -1) {
    const ok = await bbthNativeReadyLogout(4000);
    if (ok) { window.BBTHLogoutAllTabs(); return; }
    await admInfo('App logout is not ready yet - try again in a moment. You have NOT been logged out.', { title:'Thoda rukiye' });
    return;
  }
  logout();
}
$('logoutBtn').addEventListener('click', explicitLogout);

// ---------- tabs ----------
const TAB_TITLES = { dashboard: 'Dashboard', history: 'Quotations', quote: 'New Quotation', template: 'PDF Template', services: 'Services & Rates', company: 'Company', users: 'Users', drafts: 'Drafts' , images: 'Image Library', agreement: 'Agreement T&C', catalogue: 'Catalogue PDF', items: 'Catalogue Editor', register: 'Clients' };
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', ev => {
  if(b.tagName === 'A') ev.preventDefault();
  document.querySelectorAll('.side-nav [data-tab]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  $('tab-' + b.dataset.tab).classList.remove('hidden');
  const dockind = b.dataset.dockind || '';
  $('pageTitle').textContent = dockind === 'agreement' ? 'Agreements' : (TAB_TITLES[b.dataset.tab] || 'Dashboard');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if(b.dataset.tab === 'template') requestAnimationFrame(() => renderPreview());
  if(b.dataset.tab === 'dashboard') refreshDashboard(true);
  if(b.dataset.tab === 'agreement') tcRender();
  if(b.dataset.tab === 'images'){ IMG_BIN = false; $('imgBinToggle').textContent = 'Open recycle bin'; loadImgAdmin(); }
  if(b.dataset.tab === 'catalogue'){ const f = $('frameCatalogue'); if(f && !f.src) f.src = f.dataset.src; }
  if(b.dataset.tab === 'register'){ const fe = $('regChartFrom'); if(fe && !fe.value){ const t0 = new Date(); fe.value = t0.getFullYear() + '-' + String(t0.getMonth()+1).padStart(2,'0') + '-' + String(t0.getDate()).padStart(2,'0'); } }
  if(b.dataset.tab === 'items'){ const f = $('frameItems'); if(f && !f.src) f.src = f.dataset.src; }
  if(b.dataset.tab === 'quote'){ const f = $('frameQuote'); if(f && !f.src) f.src = f.dataset.src; }
  if(b.dataset.tab === 'register') loadRegister();
  if(b.dataset.tab === 'history'){
    const tf = $('typeFilter'); if(tf) tf.value = dockind;
    const ht = $('histTitle'); if(ht) ht.textContent = dockind === 'agreement' ? 'Saved agreements' : 'Saved quotations';
    COMP_VIEW = false;
    loadHistory();
  }
}));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
  const t = document.querySelector(b.dataset.goto);
  if(t && !t.classList.contains('hidden')) t.click();
}));
document.querySelectorAll('[data-qa]').forEach(b => b.addEventListener('click', () => {
  const t = document.querySelector('.side-nav [data-tab="' + b.dataset.qa + '"]');
  if(t) t.click();
}));

// ---------- settings load/save ----------
async function loadSettings(){
  try {
    const r = await api('/api/settings');
    if(r.ok){
      const s = await r.json();
      if(s && Object.keys(s).length){
        settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
        settings.theme = Object.assign({}, DEFAULT_SETTINGS.theme, s.theme || {});
        settings.texts = Object.assign({}, DEFAULT_SETTINGS.texts, s.texts || {});
      }
    }
  } catch(e){}
  window.BBTH_SETTINGS = settings;
  fillAll();
  renderNotices();
  renderDashboard();
}
let toastTimer = null;
function showSavedToast(){
  const t = $('savedToast');
  if(!t) return;
  t.textContent = 'Saved. The quotation form now uses these settings.';
  t.classList.remove('hidden');
}
function hideSavedToast(){ const t = $('savedToast'); if(t) t.classList.add('hidden'); }
async function saveSettings(msgEl, what){
  const r = await api('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
  if(r.ok){
    if(msgEl) msgEl.textContent = '';
    // ping open form tabs so they reload settings immediately
    try { localStorage.setItem('bbth-settings-ts', String(Date.now())); } catch(e){}
    toast('Done - ' + (what || 'settings saved') + '. The form picks it up instantly.');
  }
  else { if(msgEl) msgEl.textContent = 'Save failed. Please try again.'; toast('Save failed - please try again', true); }
}

// ---------- fill UI ----------
function fillAll(){
  // company
  document.querySelectorAll('[data-comp]').forEach(i => { i.value = settings[i.dataset.comp] || ''; });
  // texts
  document.querySelectorAll('[data-text]').forEach(i => { i.value = settings.texts[i.dataset.text] || ''; });
  // colors
  const cr = $('colorRows'); cr.innerHTML = '';
  COLOR_FIELDS.forEach(([k, label]) => {
    const row = document.createElement('div');
    row.className = 'color-row';
    row.innerHTML = '<input type="color" value="' + (settings.theme[k] || '#000000') + '" data-color="' + k + '"><label>' + label + '</label>';
    cr.appendChild(row);
  });
  // fonts
  const fh = $('fontHead'), fb = $('fontBody');
  fh.innerHTML = HEAD_FONTS.map(f => '<option' + (settings.fontHead === f ? ' selected' : '') + '>' + f + '</option>').join('');
  fb.innerHTML = BODY_FONTS.map(f => '<option' + (settings.fontBody === f ? ' selected' : '') + '>' + f + '</option>').join('');
  renderServicesEdit(); renderOrder(); renderPreview();
}

// ---------- services / extras editors ----------
function catOptions(cur){
  const titles = (window.BBTH_SVC_GROUPS || []).filter(x => x.from === 'services').map(x => x.title).concat(['More from the catalogue']);
  return titles.map(t => '<option' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
}
function renderServicesEdit(){
  const w = $('svcEdit'); w.innerHTML = '';
  const sel = $('svcNewCat'); if(sel){ const keep = sel.value; sel.innerHTML = catOptions(keep || 'More from the catalogue'); }
  const groups = (typeof bbthGroupServices === 'function') ? bbthGroupServices(settings.services, settings.svcCat) : [{ title: '', icon: '', idx: settings.services.map((s, i) => i) }];
  groups.forEach(g => {
    if(g.title){
      const h = document.createElement('div');
      h.className = 'svc-grp-head';
      h.innerHTML = '<span>' + g.icon + '</span> ' + esc(g.title) + ' <small>' + g.idx.length + '</small>';
      w.appendChild(h);
    }
    g.idx.forEach(i => {
      const d = document.createElement('div');
      d.className = 'edit-row';
      d.innerHTML = '<input type="text" value="' + esc(settings.services[i]) + '" data-svc="' + i + '"><select class="svc-cat" data-svccat="' + i + '" title="Category">' + catOptions(g.title) + '</select><button class="small-btn danger" data-svcdel="' + i + '" type="button">Remove</button>';
      w.appendChild(d);
    });
  });
}
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if(d.svc !== undefined || d.extname !== undefined || d.extrate !== undefined || d.comp || d.text || d.color) admTyped(t);
  if(d.svc !== undefined) settings.services[+d.svc] = t.value;
  if(d.extname !== undefined) settings.extras[+d.extname].name = t.value;
  if(d.extrate !== undefined) settings.extras[+d.extrate].rate = t.value;
  if(d.comp) settings[d.comp] = t.value;
  if(d.text) settings.texts[d.text] = t.value;
  if(d.color){ settings.theme[d.color] = t.value; previewSoon(); }
  if(d.text !== undefined || d.comp) previewSoon();
});
document.addEventListener('change', e => {
  const d = e.target.dataset || {};
  if(d.svccat !== undefined){ snapAdmin(); const nm = settings.services[+d.svccat]; settings.svcCat = settings.svcCat || {}; settings.svcCat[nm] = e.target.value; renderServicesEdit(); }
});
document.addEventListener('click', e => {
  const d = e.target.dataset || {};
  if(d.svcdel !== undefined){ snapAdmin(); const nm = settings.services[+d.svcdel]; settings.services.splice(+d.svcdel, 1); if(settings.svcCat) delete settings.svcCat[nm]; renderServicesEdit(); }
});
$('svcAdd').addEventListener('click', () => { const v = $('svcNew').value.trim(); if(!v) return; snapAdmin(); settings.services.push(v); const cs = $('svcNewCat').value; if(cs){ settings.svcCat = settings.svcCat || {}; settings.svcCat[v] = cs; } $('svcNew').value = ''; renderServicesEdit(); });
$('fontHead').addEventListener('change', e => { snapAdmin(); settings.fontHead = e.target.value; previewSoon(); });
$('fontBody').addEventListener('change', e => { snapAdmin(); settings.fontBody = e.target.value; previewSoon(); });
$('saveSvc').addEventListener('click', () => saveSettings($('svcMsg'), 'services & rates saved'));
$('saveComp').addEventListener('click', () => { saveSettings($('compMsg'), 'company details & notices saved'); });
$('saveTpl').addEventListener('click', () => saveSettings($('tplMsg'), 'template saved'));
$('resetTpl').addEventListener('click', async () => {
  snapAdmin();
  settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  await saveSettings($('tplMsg'));
  fillAll();
});

// ---------- logo ----------
function fileToDataURL(file, maxW){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > maxW){ h = Math.round(h * maxW / w); w = maxW; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
$('logoSet').addEventListener('click', async () => {
  const f = ($('logoFile').files || [])[0];
  if(!f) return;
  snapAdmin();
  settings.logo = await fileToDataURL(f, 800);
  renderPreview();
});
$('logoReset').addEventListener('click', () => { snapAdmin(); settings.logo = ''; renderPreview(); toast('Done - back to BBTH logo (save the template to apply)'); });

// ---------- page order ----------
const SECTION_NAMES = { articles: 'Articles pages', extras: 'Extra Articles pages', reference: 'Reference Images pages', back: 'Thank You back page' };
function renderOrder(){
  const w = $('orderList'); w.innerHTML = '';
  settings.pageOrder.forEach((k, i) => {
    const d = document.createElement('div');
    d.className = 'order-row';
    d.innerHTML = '<b>' + (SECTION_NAMES[k] || k) + '</b>'
      + '<button data-mv="-1" data-i="' + i + '" type="button">&uarr;</button>'
      + '<button data-mv="1" data-i="' + i + '" type="button">&darr;</button>';
    w.appendChild(d);
  });
}
$('orderList').addEventListener('click', e => {
  const d = e.target.dataset || {};
  if(d.mv === undefined) return;
  const i = +d.i, j = i + (+d.mv);
  if(j < 0 || j >= settings.pageOrder.length) return;
  snapAdmin();
  const t = settings.pageOrder[i];
  settings.pageOrder[i] = settings.pageOrder[j];
  settings.pageOrder[j] = t;
  renderOrder();
});

// ---------- live preview ----------
let pvT;
function previewSoon(){ clearTimeout(pvT); pvT = setTimeout(renderPreview, 350); }
// ---------- quotation / agreement template switch ----------
let TPL_MODE = 'q';
function sampleData(){
  return { clientName: 'Dr. Farah', clientPlace: 'Tezpur, Assam', clientPhone: '9435080100',
    eventDates: '21st to 23rd December 2026', budget: 'Rs. 22.95 Lakhs',
    company: settings.company, address: settings.address, contact: settings.contact,
    signoff: settings.signoff, footerContacts: settings.footerContacts, agree: {} };
}
function sampleRows(){
  return [
    { name: 'Wedding Event Planning Package', qty: '', size: '' },
    { name: 'Royal Arrival Arch', qty: '1', size: '14 x 20', theme: 'White theme' },
    { name: 'Bride & Groom Stage Decoration', qty: '', size: '' },
    { name: 'Complete Venue Lighting', qty: '', size: '' }
  ];
}
function sampleExtras(){
  return [
    { name: 'LED screen', rate: 'Rs. 200 / sq ft (minimum 10 x 10)' },
    { name: 'DJ (including sound)', rate: 'Rs. 35,000' }
  ];
}
function setTplMode(m){
  TPL_MODE = m;
  $('tplQ').classList.toggle('sel', m === 'q');
  $('tplA').classList.toggle('sel', m === 'a');
  $('tplGroupQ').classList.toggle('hidden', m !== 'q');
  $('tplGroupA').classList.toggle('hidden', m !== 'a');
  $('testPdf').textContent = m === 'a' ? 'Download test agreement PDF' : 'Download test quotation PDF';
  $('pvHint').textContent = m === 'a' ? 'Agreement cover page with current settings.' : 'Cover page with current settings.';
  renderPreview();
}
$('tplQ').addEventListener('click', () => setTplMode('q'));
$('tplA').addEventListener('click', () => setTplMode('a'));
$('testPdf').addEventListener('click', async () => {
  const b = $('testPdf'), msg = $('testPdfMsg');
  b.disabled = true; msg.textContent = 'Building test PDF...';
  try {
    window.BBTH_SETTINGS = settings;
    await document.fonts.ready;
    const fn = TPL_MODE === 'a' ? generateAgreementPDF : generateQuotationPDF;
    await fn(sampleData(), sampleRows(), sampleExtras(), [], 'collage', m => { msg.textContent = m; });
    msg.textContent = 'Test PDF downloaded (not saved to history).';
  } catch(err){ msg.textContent = 'Failed: ' + err.message; }
  b.disabled = false;
});
let PV_FIT = true; // fit-to-width vs full size (Deep 25 Oct: clipped preview fix)
function setPvMode(fit){
  PV_FIT = fit;
  const f = $('pvFitBtn'), z = $('pvFullBtn');
  if(f) f.classList.toggle('on', fit);
  if(z) z.classList.toggle('on', !fit);
  renderPreview();
}
function renderPreview(){
  window.BBTH_SETTINGS = settings;
  // apply theme vars to this page too
  const t = settings.theme, r = document.documentElement.style;
  Object.entries(t).forEach(([k, v]) => r.setProperty('--c-' + k, v));
  r.setProperty('--f-head', "'" + settings.fontHead + "', serif");
  r.setProperty('--f-body', "'" + settings.fontBody + "', sans-serif");
  $('admPv').innerHTML = TPL_MODE === 'a' ? buildAgreeCover(sampleData()) : buildCover(sampleData());
  const wrap = $('admScale');
  const avail = document.querySelector('.pv-inline').clientWidth - 30;
  if(avail < 60) return; // tab hidden - will render when opened
  const sc = PV_FIT ? Math.min(1, avail / 794) : 1;
  wrap.style.transform = 'scale(' + sc + ')';
  wrap.style.transformOrigin = 'top left';
  wrap.style.width = (794 * sc) + 'px';
  wrap.style.height = (1123 * sc) + 'px';
}
let pvResizeT;
window.addEventListener('resize', () => { clearTimeout(pvResizeT); pvResizeT = setTimeout(() => { if(PV_FIT) renderPreview(); }, 200); });

// ---------- history ----------
let BIN_VIEW = false;
let GROUP_VIEW = true;
let COMP_VIEW = false; // completed-documents view (hidden from main list, never deleted)
// Canonical completed links: register docLinks entries and the docs string's own
// document numbers - never name/phone guessing. (Deep 31 Oct: completed docs hide from main list)
async function compLinksLoad(){
  const out = { ids: new Set(), nos: new Set(), rows: [], ok: false, statusById: {}, statusByNo: {} };
  try {
    const r = await api('/api/client-register');
    if(!r.ok) return out;
    const d = await r.json();
    out.rows = Array.isArray(d.rows) ? d.rows : [];
    out.rows.filter(x => /completed|cancelled/i.test(x && x.status || '')).forEach(x => {
      const st = /cancelled/i.test(x.status || '') ? 'Cancelled' : 'Completed';
      (Array.isArray(x.docLinks) ? x.docLinks : []).forEach(l => { if(l && l.id != null){ out.ids.add(String(l.id)); out.statusById[String(l.id)] = st; } if(l && l.no){ const n = String(l.no).toUpperCase(); out.nos.add(n); out.statusByNo[n] = st; } });
      (String(x.docs || '').toUpperCase().match(/BBTH\/[A-Z][0-9A-Z]*\/[0-9]+/g) || []).forEach(no => { out.nos.add(no); if(!out.statusByNo[no]) out.statusByNo[no] = st; });
    });
    out.ok = true;
  } catch(e){}
  return out;
}
const QDET = {}; // id -> Promise of full record (for event dates used in grouping)
function qDetail(id){
  if(!QDET[id]) QDET[id] = api('/api/quotations/' + id).then(r => r.ok ? r.json() : null).catch(() => null);
  return QDET[id];
}
function normKey(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
// Shared Create Catalogue handoff (Deep 26 Oct + menu-level picker 10 Nov):
// client details, quotation number and matching items prefill in the catalogue
// form - the same carry-over the per-quotation button always did.
async function createCatalogueFromQuote(qid, fallbackClient, qno){
  try {
    const det = await qDetail(qid); const dd = det && det.data ? det.data : {};
    const ctx = {
      client: dd.clientName || dd.client || fallbackClient || '',
      phn: dd.clientPhone || dd.phn || '',
      location: dd.clientPlace || dd.place || '',
      event: (dd.eventDates || dd.eventDate || dd.event || '').toString().replace(/\n+/g, ', '),
      qno: qno || (det && det.doc_no) || dd.docNo || dd.quotationNo || '' // list API carries doc_no; the detail API does not
    };
    // Quotation articles that match catalogue items get auto-selected in the new
    // catalogue tab; he fixes any wrong picks manually. Names only - the
    // catalogue editor matches them against its own product list, nothing is merged.
    try {
      ctx.items = (dd.services || []).concat(dd.extras || []).filter(x => x && x.on && x.name).map(x => ({ n: String(x.name), qty: x.qty ? String(x.qty) : '', size: x.size ? String(x.size) : '' })); // qty/size only when the quotation line actually has them
    } catch(e2) {}
    // one-time localStorage handoff (30s TTL, delete-on-read, same pattern as the
    // session handoff): client context never goes in the URL
    localStorage.setItem('bbth-cat-handoff', JSON.stringify(Object.assign({}, ctx, { ts: Date.now() })));
  } catch(e){}
  handoffWrite(); // carry the login session into the catalogue tab when Remember me is unticked
  // 31 Oct: same-tab navigation - window.open(_blank) can be swallowed after the
  // async handoff write (activation timing) or by popup blockers, which made
  // Create Catalogue a dead click. The handoff is already in localStorage.
  location.href = '/app/items/?from=quote';
}
// Menu-level Create Catalogue (Deep 10 Nov): pick any quotation from a dialog;
// its details prefill the catalogue form exactly like the row button.
let CATPICK_ROWS = [];
let CATPICK_MODE = 'catalogue';
async function openCatPicker(mode){
  CATPICK_MODE = mode || 'catalogue';
  const pop = $('catPick'); if(!pop) return;
  const agree = CATPICK_MODE === 'agreement';
  const h3 = pop.querySelector('h3'); if(h3) h3.textContent = agree ? 'Create Agreement' : 'Create Catalogue';
  const hint = pop.querySelector('.hint'); if(hint) hint.textContent = agree ? 'Pick a quotation to convert into an agreement, or start a blank agreement.' : 'Pick a quotation - the client details, quotation number and matching items fill in automatically.';
  const blank = $('catPickBlank'); if(blank) blank.querySelector('b').textContent = agree ? 'Start blank agreement - fill client details yourself' : 'Start blank - fill client details yourself';
  pop.classList.remove('hidden');
  requestAnimationFrame(() => pop.classList.add('in'));
  const list = $('catPickList');
  list.innerHTML = '<p class="hint">Loading quotations...</p>';
  if($('catPickQ')) $('catPickQ').value = '';
  try {
    const r = await api('/api/quotations');
    const d = await r.json();
    CATPICK_ROWS = (d.quotations || []).filter(q => q.doc_type !== 'agreement' && String(q.id) !== '900004'); // 900004 = protected draft, never offered
    renderCatPick();
  } catch(e){ list.innerHTML = '<p class="hint">Could not load quotations - try again.</p>'; }
}
function closeCatPicker(){ const pop = $('catPick'); if(!pop) return; pop.classList.remove('in'); setTimeout(() => pop.classList.add('hidden'), 170); }
function renderCatPick(){
  const q = (($('catPickQ') || {}).value || '').toLowerCase();
  const list = $('catPickList');
  const rows = CATPICK_ROWS.filter(x => !q || (String(x.client || '') + ' ' + String(x.doc_no || '') + ' #' + String(x.id)).toLowerCase().indexOf(q) >= 0);
  if(!rows.length){ list.innerHTML = '<p class="hint">No quotation found.</p>'; return; }
  list.innerHTML = rows.slice(0, 50).map(x =>
    '<button type="button" class="catpick-row" data-q="' + x.id + '" data-qno="' + esc(x.doc_no || '') + '"><b>' + esc(x.client || '(no name)') + '</b>'
    + '<span>' + esc(x.doc_no || ('#' + x.id)) + '</span></button>').join('');
}
if($('menuCreateCat')) $('menuCreateCat').addEventListener('click', () => openCatPicker('catalogue'));
if($('menuCreateAgree')) $('menuCreateAgree').addEventListener('click', () => openCatPicker('agreement'));
if($('menuCatList')) $('menuCatList').addEventListener('click', () => { location.href = '/app/items/?saved=1'; });
if($('catPickBlank')) $('catPickBlank').addEventListener('click', () => { closeCatPicker(); handoffWrite(); location.href = (CATPICK_MODE === 'agreement') ? '/app/?new=agreement' : '/app/items/'; });
if($('catPickX')) $('catPickX').addEventListener('click', closeCatPicker);
if($('catPick')) $('catPick').addEventListener('click', e => { if(e.target === $('catPick')) closeCatPicker(); });
if($('catPickQ')) $('catPickQ').addEventListener('input', renderCatPick);
if($('catPickList')) $('catPickList').addEventListener('click', e => {
  const b = e.target.closest('.catpick-row'); if(!b || !b.dataset.q) return;
  closeCatPicker();
  if(CATPICK_MODE === 'agreement'){ handoffWrite(); location.href = '/app/?edit=' + encodeURIComponent(b.dataset.q) + '&as=agreement'; return; }
  createCatalogueFromQuote(b.dataset.q, '', b.dataset.qno || '');
});
// Topbar three-dot menu (Deep 10 Nov): quick actions with an animated dropdown.
(function(){
  const kb = $('kebabBtn'), km = $('kebabMenu'); if(!kb || !km) return;
  function open(){ km.classList.remove('hidden'); requestAnimationFrame(() => km.classList.add('in')); kb.setAttribute('aria-expanded', 'true'); }
  function close(){ if(km.classList.contains('hidden')) return; km.classList.remove('in'); kb.setAttribute('aria-expanded', 'false'); setTimeout(() => km.classList.add('hidden'), 160); }
  kb.addEventListener('click', e => { e.stopPropagation(); km.classList.contains('hidden') ? open() : close(); });
  document.addEventListener('click', e => { if(!e.target.closest('.keb-wrap')) close(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
  km.addEventListener('click', e => {
    const b = e.target.closest('[data-keb]'); if(!b) return;
    const a = b.dataset.keb; close();
    if(a === 'cat') openCatPicker();
    else if(a === 'refresh') $('admRefresh').click();
    else if(a === 'logout') $('userChipTop').click();
  });
})();
function buildQRow(q, opts){
  opts = opts || {};
  const row = document.createElement('div');
  row.className = 'qrow';
  const kb = Math.round((q.pdf_bytes || 0) / 1024);
  const chip = (q.doc_type === 'agreement' ? ' <span style="background:#264a3b;color:#f2d765;font-size:10.5px;padding:2px 8px;border-radius:999px;letter-spacing:1px">AGREEMENT</span>' : '')
    + (q.doc_no ? ' <span style="background:#eee7cf;color:#264a3b;font-size:10.5px;padding:2px 8px;border-radius:999px;letter-spacing:1px">' + esc(q.doc_no) + '</span>' : '')
    + (opts.status === 'Cancelled' ? ' <span style="background:#7a3b3b;color:#fff;font-size:10.5px;padding:2px 8px;border-radius:999px;letter-spacing:1px">CANCELLED</span>'
      : opts.status === 'Completed' ? ' <span style="background:#3a5546;color:#fff;font-size:10.5px;padding:2px 8px;border-radius:999px;letter-spacing:1px">COMPLETED</span>' : '');
  row.innerHTML = '<div class="qi"><b>#' + q.id + ' - ' + esc(q.client) + '</b>' + chip
    + '<small>By: ' + esc(q.user || 'admin') + ' | Made: ' + new Date(q.created_at).toLocaleString() + (q.updated_at !== q.created_at ? ' | edited: ' + new Date(q.updated_at).toLocaleString() : '') + ' | ' + kb + ' KB' + (q.template && q.template !== 'sage-gold' ? ' | design: ' + esc(q.template) : '') + '</small></div>'
    + (BIN_VIEW
      ? '<button class="small-btn" data-res="' + q.id + '" type="button">Restore</button>'
        + (ROLE === 'admin' ? '<button class="small-btn danger" data-purge="' + q.id + '" data-c="' + esc(q.client || '') + '" type="button">Delete forever</button>' : '')
      : (ROLE === 'admin' && q.doc_type !== 'agreement' ? '<button class="small-btn" data-inv="' + q.id + '" type="button">Vyapar Export</button>' : '')
        + '<button class="small-btn" data-det="' + q.id + '" type="button">Details</button>'
        + '<button class="small-btn" data-dl="' + q.id + '" type="button">Download PDF</button>'
        + '<button class="small-btn" data-share="' + q.id + '" data-c="' + esc(q.client || '') + '" type="button">Share</button>'
        + (q.doc_type !== 'agreement'
          ? (opts.agr
            ? '<button class="small-btn" data-det="' + opts.agr.id + '" type="button" title="Agreement ' + esc(opts.agr.doc_no || ('#' + opts.agr.id)) + ' already exists for this event">View agreement</button>'
            : '<button class="small-btn" data-mkag="' + q.id + '" type="button">Create agreement</button>')
          : '')
        + '<button class="small-btn" data-mkcat="' + q.id + '" data-c="' + esc(q.client || '') + '" data-qno="' + esc(q.doc_no || '') + '" type="button" title="Catalogue form with this client\'s details, quotation number and items filled in">Create Catalogue</button>'
        + '<button class="small-btn" data-edit="' + q.id + '" type="button">Edit in form</button>'
        + '<button class="small-btn danger" data-del="' + q.id + '" data-c="' + esc(q.client || '') + '" type="button">Delete</button>');
  return row;
}
async function loadHistory(){
  try {
    const r = await api('/api/quotations' + (BIN_VIEW ? '?deleted=1' : ''));
    const d = await r.json();
    $('qCount').textContent = d.count;
    $('binHint').classList.toggle('hidden', !BIN_VIEW);
    $('binToggle').textContent = BIN_VIEW ? 'Back to quotations' : 'Recycle bin';
    $('grpToggle').textContent = GROUP_VIEW ? 'Flat list' : 'Group by client';
    $('grpToggle').style.display = BIN_VIEW ? 'none' : '';
    const w = $('qList'); w.innerHTML = '';
    if(!d.quotations.length){ w.innerHTML = '<p class="hint">' + (BIN_VIEW ? 'Recycle bin is empty.' : 'No quotations saved yet. Log in on the form and make one - it appears here.') + '</p>'; return; }
    // user filter options
    const uf = $('userFilter');
    const users = [...new Set(d.quotations.map(q => q.user || 'admin'))];
    const cur = uf.value;
    uf.innerHTML = '<option value="">All users</option>' + users.map(u => '<option' + (u === cur ? ' selected' : '') + '>' + esc(u) + '</option>').join('');
    const ufr = $('userFilterRow'); if(ufr) ufr.style.display = ROLE === 'admin' ? '' : 'none';
    uf.style.display = ROLE === 'admin' ? '' : 'none';
    const filt = uf.value;
    const tf = (BIN_VIEW || COMP_VIEW) ? '' : ($('typeFilter') ? $('typeFilter').value : '');
    const q = (($('qSearch') && $('qSearch').value) || '').trim().toLowerCase();
    const rows = d.quotations
      .filter(x => !filt || (x.user || 'admin') === filt)
      .filter(x => !tf || (x.doc_type || 'quotation') === tf)
      .filter(x => !q || (x.client || '').toLowerCase().includes(q) || (x.doc_no || '').toLowerCase().includes(q));
    // completed-clients' documents live behind the Completed toggle (view only)
    const comp = BIN_VIEW ? { ids: new Set(), nos: new Set(), rows: [], ok: false } : await compLinksLoad();
    const isComp = x => comp.ok && (comp.ids.has(String(x.id)) || (x.doc_no && comp.nos.has(String(x.doc_no).toUpperCase())));
    const nComp = rows.filter(isComp).length, nAct = rows.length - nComp;
    const ct = $('compToggle');
    if(ct){
      ct.classList.toggle('hidden', BIN_VIEW || !comp.ok);
      ct.textContent = COMP_VIEW ? 'Back to active (' + nAct + ')' : 'Completed / Cancelled (' + nComp + ')';
      ct.classList.toggle('on', COMP_VIEW);
    }
    const ch = $('compHint'); if(ch) ch.classList.toggle('hidden', !(COMP_VIEW && !BIN_VIEW));
    const shown = rows.filter(x => comp.ok ? (isComp(x) === COMP_VIEW) : true);
    $('qCount').textContent = shown.length;
    if(!shown.length){ w.innerHTML = '<p class="hint">' + (BIN_VIEW ? 'Recycle bin is empty.' : (COMP_VIEW ? 'No completed/cancelled documents yet - when a client is marked Completed or Cancelled, their documents appear here.' : 'No documents in this view.')) + '</p>'; return; }
    // one fetch per record (cached) powers event-date grouping + agreement linking
    const dets = await Promise.all(shown.map(x => qDetail(x.id)));
    const keyOf = (x, i) => normKey(x.client) + ' | ' + normKey((dets[i] && dets[i].data ? dets[i].data.eventDates : '') || '');
    // an agreement already exists for the same client + event date(s) = the app's own
    // client-file grouping; plus register docLinks naming this quotation + an agreement.
    const agrByKey = new Map();
    // agreements come from EVERY fetched doc (incl. ones the type/completed filters hide)
    const allDocs = d.quotations;
    const allDets = await Promise.all(allDocs.map(x => qDetail(x.id)));
    allDocs.forEach((x, i) => {
      if((x.doc_type || 'quotation') !== 'agreement') return;
      const k = normKey(x.client) + ' | ' + normKey((allDets[i] && allDets[i].data ? allDets[i].data.eventDates : '') || '');
      if(!agrByKey.has(k)) agrByKey.set(k, x);
    });
    const regAgr = {}; // quotation id -> agreement, from register docLinks (canonical)
    const activeAgrIds = new Set(allDocs.filter(x => (x.doc_type || '') === 'agreement').map(x => String(x.id)));
    (comp.rows || []).forEach(r => {
      const ls = (Array.isArray(r.docLinks) ? r.docLinks : []).filter(x => x && x.id != null);
      const agrs = ls.filter(x => x.kind === 'agreement' && activeAgrIds.has(String(x.id)));
      if(!agrs.length) return;
      ls.filter(x => x.kind !== 'agreement').forEach(x => { if(!regAgr[String(x.id)]) regAgr[String(x.id)] = agrs[0]; });
    });
    const statusOf = (x) => COMP_VIEW ? (comp.statusById[String(x.id)] || (x.doc_no && comp.statusByNo[String(x.doc_no).toUpperCase()]) || '') : '';
    const optsOf = (x) => {
      const base = {};
      const st = statusOf(x); if(st) base.status = st;
      if((x.doc_type || 'quotation') === 'agreement') return base;
      const i = shown.indexOf(x);
      const k = i >= 0 ? keyOf(x, i) : (normKey(x.client) + ' | ');
      const sib = agrByKey.get(k);
      const reg = regAgr[String(x.id)];
      const agr = sib || (reg ? { id: reg.id, doc_no: reg.no || '' } : null);
      if(agr) base.agr = agr;
      return base;
    };
    if(!GROUP_VIEW || BIN_VIEW){ shown.forEach((x) => w.appendChild(buildQRow(x, optsOf(x)))); return; }
    // grouped client-file view: one file per client + event date(s); purely visual, records untouched
    const groups = new Map();
    shown.forEach((x, i) => {
      const dd = dets[i] && dets[i].data ? dets[i].data : {};
      const key = normKey(x.client) + ' | ' + normKey(dd.eventDates || '');
      if(!groups.has(key)) groups.set(key, { client: x.client || '(no name)', ev: dd.eventDates || '', items: [], latest: '' });
      const g = groups.get(key);
      g.items.push(x);
      if(x.created_at > g.latest) g.latest = x.created_at;
    });
    const sorted = [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest));
    sorted.forEach(g => {
      g.items.sort((a, b) => ((a.doc_type === 'agreement') - (b.doc_type === 'agreement')) || a.created_at.localeCompare(b.created_at));
      const head = document.createElement('div');
      head.className = 'qgroup-head';
      head.innerHTML = '<b>' + esc(g.client) + '</b>'
        + (g.ev ? ' <span>' + esc(g.ev) + '</span>' : '')
        + ' <em>' + g.items.length + ' document' + (g.items.length > 1 ? 's' : '') + '</em>';
      w.appendChild(head);
      g.items.forEach(x => w.appendChild(buildQRow(x, optsOf(x))));
    });
  } catch(e){ $('qList').innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; }
}
$('qRefresh').addEventListener('click', loadHistory);
if($('compToggle')) $('compToggle').addEventListener('click', () => {
  COMP_VIEW = !COMP_VIEW;
  const tfEl = $('typeFilter');
  if(tfEl){
    if(COMP_VIEW){ tfEl.dataset.prev = tfEl.value; tfEl.value = ''; tfEl.disabled = true; }
    else { tfEl.value = tfEl.dataset.prev || 'quotation'; tfEl.disabled = false; }
  }
  loadHistory();
});
$('grpToggle').addEventListener('click', () => { GROUP_VIEW = !GROUP_VIEW; loadHistory(); });
$('userFilter').addEventListener('change', loadHistory);
$('typeFilter').addEventListener('change', loadHistory);
let qSearchT; $('qSearch').addEventListener('input', () => { clearTimeout(qSearchT); qSearchT = setTimeout(loadHistory, 250); });
$('binToggle').addEventListener('click', () => { BIN_VIEW = !BIN_VIEW; loadHistory(); });
$('qList').addEventListener('click', async e => {
  const d = e.target.dataset || {};
  if(d.dl !== undefined){
    const r = await api('/api/quotations/' + d.dl);
    const q = await r.json();
    // agreements are re-built with the CURRENT layout engine (old stored files could have overlaps);
    // the saved record is never modified. Falls back to the stored PDF if re-building fails.
    const dd0 = q.data || {};
    if(dd0.docType === 'agreement' && typeof generateAgreementPDF === 'function'){
      const btn = e.target, label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Building PDF...';
      try{
        window.BBTH_SETTINGS = settings;
        await document.fonts.ready;
        await generateAgreementPDF(dd0, (dd0.services || []).filter(s => s.on), (dd0.extras || []).filter(s => s.on), dd0.refImages || [], dd0.imgLayout || 'collage', m => { btn.textContent = m; });
        btn.disabled = false; btn.textContent = label;
        return;
      }catch(err){ console.warn('agreement rebuild failed, using stored PDF', err); }
      btn.disabled = false; btn.textContent = label;
    }
    const a = document.createElement('a');
    a.href = 'data:application/pdf;base64,' + q.pdf;
    a.download = 'BBTH-Quotation-' + (q.client || 'Client').replace(/[^a-z0-9]+/gi, '-') + '.pdf';
    a.click();
  }
  if(d.det !== undefined){
    const existing = document.getElementById('qd-' + d.det);
    if(existing){ existing.remove(); return; }
    const r = await api('/api/quotations/' + d.det);
    const q = await r.json();
    const dd = q.data || {};
    const svcs = (dd.services || []).filter(s => s.on);
    const exts = (dd.extras || []).filter(s => s.on);
    const det = document.createElement('div');
    det.className = 'qdetail';
    det.id = 'qd-' + d.det;
    det.innerHTML = '<b>Client:</b> ' + esc(dd.clientName || '-') + ' | ' + esc(dd.clientPlace || '-') + ' | ' + esc(dd.clientPhone || '-')
      + '<br><b>Event dates:</b> ' + esc((dd.eventDates || dd.eventDate || '-').toString().replace(/\n+/g, ', ')) + ' | <b>Budget:</b> ' + esc(dd.budget || '-')
      + '<br><b>Services (' + svcs.length + '):</b> ' + (svcs.map(s => esc(s.name) + (s.qty ? ' x' + esc(s.qty) : '') + (s.size ? ' [' + esc(s.size) + ' ft]' : '')).join(', ') || '-')
      + '<br><b>Extras (' + exts.length + '):</b> ' + (exts.map(s => esc(s.name) + (s.rate ? ' - ' + esc(s.rate) : '')).join(', ') || '-')
      + '<br><b>Reference images:</b> ' + ((dd.refImages || []).length) + ' (' + esc(dd.imgLayout || 'collage') + ')'
      + '<br><b>Company:</b> ' + esc(dd.company || '-');
    e.target.closest('.qrow').after(det);
    return;
  }
  if(d.inv !== undefined){
    const r = await api('/api/quotations/' + d.inv);
    const q = await r.json();
    openVyaparExport(q);
    return;
  }
  if(d.edit !== undefined){ location.href = '/app/?edit=' + d.edit; }
  if(d.mkag !== undefined){ location.href = '/app/?edit=' + d.mkag + '&as=agreement'; }
  if(d.mkcat !== undefined){ // Deep 26 Oct: Quotations -> Create Catalogue with that quotation's client context
    createCatalogueFromQuote(d.mkcat, d.c, d.qno || '');
    return;
  }

// Bridge-ready handshake (APK): run-now when BBTHSharePDF exists, else one-shot
// 'bbth-native-ready' listener with a bounded wait (installed at onPageFinished).
function bbthNativeReady(timeoutMs){
  if (typeof window.BBTHSharePDF === 'function') return Promise.resolve(true);
  return new Promise(res => {
    const to = setTimeout(() => res(false), timeoutMs);
    window.addEventListener('bbth-native-ready', () => { clearTimeout(to); res(typeof window.BBTHSharePDF === 'function'); }, { once: true });
  });
}
// Reliable native-context marker (NOT authentication): the BBTH Android WebView
// appends ' BBTHAndroid/1.0' to its UA before load. A missing hook inside the
// app is a bounded error - NEVER a fallthrough to the web public-link flow.
function bbthIsNativeApp(){
  return navigator.userAgent.indexOf('BBTHAndroid/1.0') !== -1 || typeof window.BBTHSharePDF === 'function';
}
  if(d.share !== undefined){
    const btn = e.target;
    btn.disabled = true;
    // Inside the BBTH app there is no public link: open the record's private
    // native share in the maker (stored PDF -> BBTHSharePDF, read-only).
    if (await bbthNativeReady(4000)) { location.href = '/app/?edit=' + d.share + '&nativeshare=1'; return; }
    if (bbthIsNativeApp()) { toast('App share is not ready on this device yet - try again in a moment. No public link was created.', true); btn.disabled = false; return; }
    try {
      const r = await api('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.share }) });
      const j = await r.json();
      if(!r.ok || !j.url) throw new Error(j.error || ('error ' + r.status));
      try { await navigator.clipboard.writeText(j.url); toast('Done - share link copied'); }
      catch(e2){ window.prompt('Share link for ' + (d.c || 'this record') + ':', j.url); }
      window.open('https://wa.me/?text=' + encodeURIComponent('BBTH - document for ' + (d.c || 'client') + ': ' + j.url), '_blank');
    } catch(err){ toast('Share failed - ' + err.message, true); }
    btn.disabled = false;
    return;
  }
  if(d.del !== undefined){
    const ok = await confirmModal('Move to recycle bin?', 'Record #' + d.del + ' - ' + (d.c || '') + ' will move to the recycle bin. You can restore it from there.', 'Move to bin');
    if(!ok) return;
    const r = await api('/api/quotations/' + d.del, { method: 'DELETE' });
    if(r.ok){ toast('Done - record moved to recycle bin'); loadHistory(); renderDashboard(); }
    else toast('Delete failed - please try again', true);
    return;
  }
  if(d.res !== undefined){
    const r = await api('/api/quotations/' + d.res, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restore: true }) });
    if(r.ok){ toast('Done - record restored'); loadHistory(); renderDashboard(); }
    else toast('Restore failed - please try again', true);
    return;
  }
  if(d.purge !== undefined){
    const ok = await confirmModal('Delete forever?', 'Record #' + d.purge + ' - ' + (d.c || '') + ' will be deleted PERMANENTLY. This cannot be undone.', 'Delete forever');
    if(!ok) return;
    const r = await api('/api/quotations/' + d.purge + '?hard=1', { method: 'DELETE' });
    if(r.ok){ toast('Done - record deleted permanently'); loadHistory(); }
    else toast('Delete failed - please try again', true);
    return;
  }
});

// ---------- drafts export/import ----------
$('draftExport').addEventListener('click', () => {
  const raw = localStorage.getItem('bbth-draft') || '{}';
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(raw);
  a.download = 'bbth-draft.json';
  a.click();
  $('draftMsg').textContent = 'Draft exported.';
});
$('draftImport').addEventListener('click', () => {
  const f = ($('draftFile').files || [])[0];
  if(!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      JSON.parse(fr.result);
      localStorage.setItem('bbth-draft', fr.result);
      $('draftMsg').textContent = 'Draft imported - open the form to continue it.';
    } catch(e){ $('draftMsg').textContent = 'That file is not a valid draft.'; }
  };
  fr.readAsText(f);
});

// ---------- notices (home page) ----------
function renderNotices(){
  const w = $('noticeEdit');
  if(!w) return;
  if(!Array.isArray(settings.notices)) settings.notices = [];
  w.innerHTML = '';
  if(!settings.notices.length){ w.innerHTML = '<p class="hint">No notices - the home page section stays hidden.</p>'; return; }
  settings.notices.forEach((n, i) => {
    const row = document.createElement('div');
    row.className = 'notice-row';
    row.innerHTML = '<span class="nd">' + esc(n.date || '') + '</span><span class="nt"></span><button class="small-btn danger" type="button" data-ndel="' + i + '">Remove</button>';
    row.querySelector('.nt').textContent = n.text || '';
    w.appendChild(row);
  });
}
if($('noticeAdd')) $('noticeAdd').addEventListener('click', () => {
  const v = $('noticeNew').value.trim();
  if(!v) return;
  if(!Array.isArray(settings.notices)) settings.notices = [];
  settings.notices.unshift({ text: v, date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) });
  $('noticeNew').value = '';
  renderNotices();
});
if($('noticeEdit')) $('noticeEdit').addEventListener('click', e => {
  const i = e.target.dataset && e.target.dataset.ndel;
  if(i === undefined) return;
  settings.notices.splice(+i, 1);
  renderNotices();
});

// ---------- boot ----------
function showPanel(){
  $('loginView').classList.add('hidden');
  $('panelView').classList.remove('hidden');
  if(ROLE !== 'admin'){
    document.querySelectorAll('[data-adminonly]').forEach(b => b.classList.add('hidden'));
    // admin may grant individual modules to staff (Users > Access); the server
    // enforces the same permissions on the underlying APIs.
    api('/api/whoami').then(r => r.ok ? r.json() : null).then(w => {
      if(!w || !Array.isArray(w.perms)) return;
      const has = p => w.perms.includes('*') || w.perms.includes(p);
      if(has('register')){ const b = document.querySelector('[data-tab="register"]'); if(b) b.classList.remove('hidden'); }
      if(has('catalogue')){ const b = document.querySelector('[data-tab="items"]'); if(b) b.classList.remove('hidden'); }
    }).catch(() => {});
  }
  const ini = (DNAME || 'A').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('userAvatar').textContent = ini;
  $('userNameTop').textContent = DNAME + ' (' + ROLE + ')';
  $('userChipTop').title = 'Click to log out';
  $('dashHi').textContent = 'Hi, ' + DNAME + '!';
  const now = new Date();
  $('topDate').textContent = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' - ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).toLowerCase();
  loadSettings();
  loadHistory();
  renderDashboard();
  // deferred: register helpers/REG_ROWS are declared below this call site
  setTimeout(() => { try { regBootPopups(); } catch(e){} }, 0);
  if(ROLE === 'admin') loadUsers();
  { let uSearchT; const us = $('uSearch'); if(us) us.addEventListener('input', () => { clearTimeout(uSearchT); uSearchT = setTimeout(loadUsers, 250); }); }
}
$('userChipTop').addEventListener('click', async () => { if(await admConfirm('Log out?', { okText:'Log out' })) explicitLogout(); });

// ---------- dashboard ----------
let dashBusy = false;
async function refreshDashboard(manual){
  // Deep 25 Oct: clicking Dashboard always re-fetches, with visible feedback.
  if(dashBusy) return;
  dashBusy = true;
  const btn = document.querySelector('.side-nav [data-tab="dashboard"]');
  if(btn){ btn.style.opacity = '.55'; btn.style.pointerEvents = 'none'; }
  try {
    await renderDashboard();
    if(manual) miniToast('Dashboard updated');
  } catch(e){ if(manual) miniToast('Refresh failed - please try again', true); }
  finally { dashBusy = false; if(btn){ btn.style.opacity = ''; btn.style.pointerEvents = ''; } }
}
async function renderDashboard(){
  try {
    const r = await api('/api/quotations');
    const d = await r.json();
    const qs = d.quotations || [];
    // completed/cancelled clients' documents stay out of the main activity view
    const comp = await compLinksLoad();
    const isCompDoc = x => comp.ok && (comp.ids.has(String(x.id)) || (x.doc_no && comp.nos.has(String(x.doc_no).toUpperCase())));
    const activeQs = qs.filter(x => !isCompDoc(x));
    const quotes = qs.filter(q => (q.doc_type || 'quotation') !== 'agreement');
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const thisMonth = quotes.filter(q => new Date(q.created_at) >= monthStart).length;
    const cards = [
      { n: quotes.length, l: 'Total Quotations', c: 'sc-1' },
      { n: thisMonth, l: 'This Month', c: 'sc-2' },
    ];
    const agrees = qs.filter(q => q.doc_type === 'agreement').length;
    cards.push({ n: agrees, l: 'Agreements', c: 'sc-2' });
    const mb = qs.reduce((t, q) => t + (q.pdf_bytes || 0), 0) / 1048576;
    cards.push({ n: mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(mb * 1024) + ' KB', l: 'PDFs Stored', c: 'sc-4' });
    if(ROLE === 'admin'){
      try {
        const ru = await api('/api/users');
        const du = await ru.json();
        cards.push({ n: (du.users || []).length, l: 'Panel Users', c: 'sc-3' });
      } catch(e){}
      const svc = (settings.services || []).length;
      cards.push({ n: svc, l: 'Services Live', c: 'sc-4' });
    }
    $('statGrid').innerHTML = cards.map(k => '<div class="stat-card ' + k.c + '"><div class="n">' + k.n + '</div><div class="l">' + k.l + '</div></div>').join('');
    // pending staff change requests (admin only)
    if (ROLE === 'admin') {
      try {
        const rc = await api('/api/changes');
        if (rc.ok) {
          const cj = await rc.json();
          const pend = (cj.rows || []).filter(x => x.status === 'pending');
          const card = $('chgCard');
          if (card && pend.length) {
            card.style.display = '';
            $('chgList').innerHTML = pend.map(x =>
              '<div class="chg-row" style="padding:8px 0;border-bottom:1px solid #e5ddc8">'
              + '<b>' + (x.type === 'quotation-edit' ? 'Quotation edit' : x.type === 'catalogue' ? 'Catalogue edit' : x.type === 'texts' ? 'T&C edit' : 'Suggestion') + '</b>'
              + ' - ' + (x.summary || '') + '<br><span class="hint">By ' + (x.by || '?') + ' - ' + new Date(x.createdAt).toLocaleString('en-IN') + '</span><br>'
              + '<button class="small-btn" data-chga="' + x.id + '">Approve</button> '
              + '<button class="small-btn" data-chgr="' + x.id + '">Reject</button></div>').join('');
          } else if (card) { card.style.display = 'none'; }
        }
      } catch (e) {}
    }
    // activity feed (admin only)
    if(ROLE === 'admin'){
      try {
        const ra = await api('/api/activity');
        const da = await ra.json();
        window._actFeed = da.activity || [];
        const renderAct = () => {
          const f = ($('actFilter') && $('actFilter').value) || '';
          const list = (window._actFeed || []).filter(a => !f || String(a.action || '').startsWith(f)).slice(0, 25);
          $('dashActivity').innerHTML = list.length
            ? list.map(a => '<div class="dash-row"><div><b>' + esc(a.user || '?') + '</b> <span class="act-lab">' + esc(a.action) + '</span><small>' + esc(a.detail || '') + '</small><small>' + new Date(a.ts).toLocaleString('en-IN') + '</small></div></div>').join('')
            : '<p class="hint">No activity yet.</p>';
        };
        renderAct();
        if($('actFilter') && !$('actFilter').dataset.wired){ $('actFilter').dataset.wired = '1'; $('actFilter').addEventListener('change', renderAct); }
      } catch(e){ $('dashActivity').innerHTML = '<p class="hint">Activity unavailable.</p>'; }
    }
    const rec = $('dashRecent');
    if(!activeQs.length){ rec.innerHTML = '<p class="hint">No active documents right now. Completed or cancelled events live under Quotations - Completed / Cancelled.</p>'; }
    else rec.innerHTML = activeQs.slice(0, 5).map(q =>
      '<div class="dash-row"><div><b>' + esc(q.client) + '</b>'
      + (q.doc_type === 'agreement' ? ' <span style="background:#264a3b;color:#f2d765;font-size:10px;padding:1px 7px;border-radius:999px;letter-spacing:1px">AGREEMENT</span>' : '')
      + (q.doc_no ? ' <span style="color:#8a7a3a">' + esc(q.doc_no) + '</span>' : '')
      + '<small>By ' + esc(q.user || 'admin') + ' - ' + new Date(q.created_at).toLocaleString('en-IN') + '</small></div>'
      + '<a class="small-btn" href="/app/?edit=' + q.id + '" data-newtab="1">Edit</a></div>').join('');
  } catch(e){ /* dashboard is best-effort */ }
}
ROLE = credGet('bbth-role') || 'admin';
UNAME = credGet('bbth-user') || 'admin';
DNAME = credGet('bbth-name') || UNAME;
if(TOKEN) showPanel();


// ---------- users (admin) ----------
function suggestUsername(full){
  const base = String(full || '').trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  if(!base) return '';
  const taken = new Set((window._users || []).map(u => String(u.username || '').toLowerCase()));
  if(!taken.has(base)) return base;
  for(let i = 2; i < 50; i++){ if(!taken.has(base + i)) return base + i; }
  return base + Math.floor(Math.random() * 90 + 10);
}
let uNameTouched = false;
function chosenPerms(){
  const mode = (document.querySelector('input[name="uAccess"]:checked') || {}).value;
  if(mode !== 'custom') return ['*'];
  const out = [];
  if($('uPermRegister').checked) out.push('register');
  if($('uPermCatalogue').checked) out.push('catalogue');
  return out;
}
function setPermUI(perms){
  const all = !Array.isArray(perms) || perms.includes('*');
  const radio = document.querySelector('input[name="uAccess"][value="' + (all ? 'all' : 'custom') + '"]');
  if(radio) radio.checked = true;
  $('uPermBoxes').style.display = all ? 'none' : 'flex';
  $('uPermRegister').checked = !all && perms.includes('register');
  $('uPermCatalogue').checked = !all && perms.includes('catalogue');
}
function syncAccessVis(){ const w = $('uAccessWrap'); if(w) w.style.display = $('uRole').value === 'staff' ? '' : 'none'; }
async function savePerms(username){
  try {
    const perms = $('uRole').value === 'admin' ? ['*'] : chosenPerms();
    await api('/api/staff-perms', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: username, perms }) });
    const r = await api('/api/staff-perms');
    if(r.ok){ const d = await r.json(); window._permsMap = d.perms || {}; }
  } catch(e){}
}
function resetUserForm(){
  ['uFull','uDesig','uPhone','uEmail','uNotes','uPass'].forEach(id => { $(id).value = ''; });
  $('uName').value = ''; $('uName').disabled = false; uNameTouched = false;
  $('uPass').placeholder = 'Share privately';
  $('uCreate').textContent = 'Register User'; delete $('uCreate').dataset.editing;
  setPermUI(['*']); syncAccessVis();
}
async function loadUsers(){
  if(ROLE !== 'admin') return;
  try {
    const r = await api('/api/users');
    const d = await r.json();
    const uq = (($('uSearch') && $('uSearch').value) || '').trim().toLowerCase();
    if(uq) d.users = d.users.filter(u => [u.full_name, u.username, u.designation, u.phone, u.email]
      .some(v => String(v || '').toLowerCase().includes(uq)));
    try { const pr = await api('/api/staff-perms'); if(pr.ok){ const pd = await pr.json(); window._permsMap = pd.perms || {}; } } catch(e){}
    const w = $('uList'); w.innerHTML = '';
    if(!d.users.length){ w.innerHTML = '<p class="hint">No extra users yet. The master admin login always works.</p>'; return; }
    d.users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'ucard' + (u.disabled ? ' uoff' : '');
      const meta = [];
      if(u.designation) meta.push(esc(u.designation));
      if(u.phone) meta.push('Phone: ' + esc(u.phone));
      if(u.email) meta.push('Email: ' + esc(u.email));
      meta.push(u.quotations + ' quotation' + (u.quotations === 1 ? '' : 's'));
      if(u.role !== 'admin'){
        const p = (window._permsMap || {})[u.username];
        const pl = !Array.isArray(p) || p.includes('*') ? 'All access'
          : (p.length ? p.map(x => x === 'register' ? 'Client Register' : x === 'catalogue' ? 'Catalogue Editor' : x).join(', ') : 'No extra modules');
        meta.push('Access: ' + esc(pl));
      }
      card.innerHTML = '<div class="ucard-top"><div><b style="font-size:15.5px">' + esc(u.full_name || u.username) + '</b>'
        + '<span class="urole ' + u.role + '">' + u.role + '</span>'
        + (u.disabled ? '<span class="urole" style="background:#b03030">disabled</span>' : '')
        + '<div style="font-size:12.5px;color:#7a8a6d;margin-top:2px">@' + esc(u.username) + '</div></div></div>'
        + '<div class="ucard-meta">' + meta.join(' &nbsp;|&nbsp; ') + (u.notes ? '<br>Notes: ' + esc(u.notes) : '') + '</div>'
        + '<div class="ucard-actions">'
        + '<button class="small-btn" data-uedit="' + u.id + '" type="button">Edit details</button>'
        + '<button class="small-btn" data-utoggle="' + u.id + '" data-off="' + u.disabled + '" type="button">' + (u.disabled ? 'Enable' : 'Disable') + '</button>'
        + (u.role === 'admin' ? '' : '<button class="small-btn" data-upw="' + u.id + '" type="button">Reset password</button>')
        + '<button class="small-btn danger" data-udel="' + u.id + '" type="button">Delete</button></div>';
      w.appendChild(card);
    });
    window._users = d.users;
  } catch(e){ $('uList').innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; }
}
$('uCreate').addEventListener('click', async () => {
  $('userMsg').textContent = '';
  const editId = $('uCreate').dataset.editing;
  if(editId){
    const body = { role: $('uRole').value, full_name: $('uFull').value, designation: $('uDesig').value,
      phone: $('uPhone').value, email: $('uEmail').value, notes: $('uNotes').value };
    if($('uPass').value) body.password = $('uPass').value;
    const r = await api('/api/users/' + editId, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if(r.ok){ $('userMsg').textContent = 'User updated.';
      await savePerms($('uName').value);
      toast('Done - user updated');
      resetUserForm();
      loadUsers();
    } else $('userMsg').textContent = j.error || 'Failed.';
    return;
  }
  const uname = $('uName').value.trim();
  const r = await api('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: uname, password: $('uPass').value, role: $('uRole').value,
      full_name: $('uFull').value, designation: $('uDesig').value, joined_on: '',
      phone: $('uPhone').value, email: $('uEmail').value, notes: $('uNotes').value }) });
  const d = await r.json();
  if(r.ok){ $('userMsg').textContent = 'User registered. Share the password privately - it is not stored anywhere readable.';
    await savePerms(uname);
    toast('Done - user registered');
    resetUserForm(); loadUsers(); }
  else $('userMsg').textContent = d.error || 'Failed.';
});
$('uName').addEventListener('input', () => { uNameTouched = true; });
$('uFull').addEventListener('input', () => {
  if($('uCreate').dataset.editing || uNameTouched) return;
  $('uName').value = suggestUsername($('uFull').value);
});
$('uRole').addEventListener('change', syncAccessVis);
document.querySelectorAll('input[name="uAccess"]').forEach(radio => radio.addEventListener('change', () => {
  $('uPermBoxes').style.display = (document.querySelector('input[name="uAccess"]:checked') || {}).value === 'custom' ? 'flex' : 'none';
}));
syncAccessVis();
document.addEventListener('click', async e => {
  const d = e.target.dataset || {};
  const cid = d.chga || d.chgr;
  if (!cid) return;
  const which = d.chga ? 'approve' : 'reject';
  if (d.chgr && !(await admConfirm('Reject this change? It will not be applied.', { okText:'Reject' }))) return;
  const r = await api('/api/changes/' + which + '?id=' + encodeURIComponent(cid), { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (r.ok) { toast("Done - change " + j.status); renderDashboard(); }
  else await admInfo('Could not ' + which + ': ' + (j.error || r.status), { title:'Not saved' });
});
$('uList').addEventListener('click', async e => {
  const d = e.target.dataset || {};
  if(d.utoggle !== undefined){
    await api('/api/users/' + d.utoggle, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disabled: d.off === '0' }) });
    toast('Done - user ' + (d.off === '0' ? 'disabled' : 'enabled'));
    loadUsers();
  }
  if(d.upw !== undefined){
    const u = (window._users || []).find(x => String(x.id) === String(d.upw));
    $('rpWho').textContent = u ? (u.full_name || u.username) + ' (@' + u.username + ')' : 'this user';
    $('rpPass').value = ''; $('rpPass2').value = ''; $('rpMsg').textContent = '';
    $('rpPass').type = 'password'; $('rpPass2').type = 'password';
    $('rpModal').classList.remove('hidden');
    $('rpModal').dataset.uid = d.upw;
    setTimeout(() => $('rpPass').focus(), 60);
  }
  if(d.uedit !== undefined){
    const u = (window._users || []).find(x => String(x.id) === String(d.uedit));
    if(!u) return;
    $('uFull').value = u.full_name || ''; $('uDesig').value = u.designation || '';
    $('uName').value = u.username; $('uName').disabled = true;
    $('uPass').value = ''; $('uPass').placeholder = 'Leave blank to keep current';
    $('uRole').value = u.role;
    $('uPhone').value = u.phone || ''; $('uEmail').value = u.email || ''; $('uNotes').value = u.notes || '';
    setPermUI((window._permsMap || {})[u.username]); syncAccessVis();
    uNameTouched = true;
    $('uCreate').textContent = 'Save Changes';
    $('uCreate').dataset.editing = u.id;
    window.scrollTo(0, 0);
    return;
  }
  if(d.udel !== undefined){
    const ok = await confirmModal('Delete this user?', 'Their saved quotations stay in history. The user will not be able to log in anymore.', 'Delete user');
    if(!ok) return;
    await api('/api/users/' + d.udel, { method: 'DELETE' });
    toast('Done - user deleted');
    loadUsers();
  }
});



// ---------- shared image library (admin) ----------
function resizeImageFile(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(Math.max(w,h) > MAX){ const sc = MAX/Math.max(w,h); w = Math.round(w*sc); h = Math.round(h*sc); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
$('imgUpBtn').addEventListener('click', async () => {
  const files = Array.from(($('imgUpFiles').files || []));
  if(!files.length){ $('imgLibMsg').textContent = 'Choose one or more images first.'; return; }
  const label = $('imgUpLabel').value.trim() || 'reference';
  $('imgUpBtn').disabled = true;
  let done = 0, failed = 0;
  for(const f of files){
    try {
      const dataUrl = await resizeImageFile(f);
      const r = await api('/api/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: dataUrl, label }) });
      if(r.ok) done++; else failed++;
    } catch(e){ failed++; }
  }
  $('imgUpBtn').disabled = false;
  $('imgUpFiles').value = '';
  $('imgLibMsg').textContent = failed ? done + ' uploaded, ' + failed + ' failed.' : '';
  if(done) toast('Done - ' + done + ' image' + (done === 1 ? '' : 's') + ' added to the library');
  if(failed) toast(failed + ' upload' + (failed === 1 ? '' : 's') + ' failed', true);
  IMG_BIN = false; $('imgBinToggle').textContent = 'Open recycle bin';
  loadImgAdmin();
});

let IMG_BIN = false;
async function loadImgAdmin(){
  const box = $('imgAdminList'); if(!box) return;
  box.innerHTML = '<p class="hint">Loading...</p>';
  try {
    const r = await api('/api/images' + (IMG_BIN ? '?deleted=1' : ''));
    const d = await r.json();
    const imgs = d.images || [];
    if(!imgs.length){ box.innerHTML = '<p class="hint">' + (IMG_BIN ? 'Recycle bin is empty.' : 'No images in the library yet.') + '</p>'; return; }
    box.innerHTML = '';
    imgs.forEach(im => {
      const div = document.createElement('div');
      div.className = 'thumb lib-thumb';
      if(IMG_BIN){
        div.innerHTML = '<img src="' + im.data + '" alt="" loading="lazy">'
          + '<div class="lib-tag">' + esc(im.label || 'reference') + '</div>'
          + '<button class="small-btn" type="button" data-irestore="' + im.id + '">Restore</button>'
          + '<button class="small-btn danger" type="button" data-ipurge="' + im.id + '">Delete forever</button>';
      } else {
        div.innerHTML = '<img src="' + im.data + '" alt="" loading="lazy">'
          + '<input class="cap-in" type="text" value="' + esc(im.label || '') + '" data-ilabel="' + im.id + '" placeholder="Label">'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
          + '<button class="small-btn" type="button" data-isave="' + im.id + '">Save label</button>'
          + '<label class="small-btn" style="cursor:pointer">Replace<input type="file" accept="image/*" data-ireplace="' + im.id + '" style="display:none"></label>'
          + '<button class="small-btn danger" type="button" data-idel="' + im.id + '">Remove</button></div>';
      }
      box.appendChild(div);
    });
  } catch(e){ box.innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; }
}
$('imgBinToggle').addEventListener('click', () => {
  IMG_BIN = !IMG_BIN;
  $('imgBinToggle').textContent = IMG_BIN ? 'Back to library' : 'Open recycle bin';
  loadImgAdmin();
});
$('imgAdminList').addEventListener('click', async e => {
  const d = e.target.dataset || {};
  if(d.isave !== undefined){
    const inp = document.querySelector('input[data-ilabel="' + d.isave + '"]');
    const r = await api('/api/images/' + d.isave, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: inp.value }) });
    if(r.ok) toast('Done - label saved'); else toast('Save failed', true);
  }
  if(d.idel !== undefined){
    const ok = await confirmModal('Remove this image?', 'It moves to the recycle bin and disappears from the form picker. Quotations already saved keep their copy.', 'Remove image');
    if(!ok) return;
    const r = await api('/api/images/' + d.idel, { method: 'DELETE' });
    if(r.ok){ toast('Done - image moved to recycle bin'); loadImgAdmin(); } else toast('Remove failed', true);
  }
  if(d.irestore !== undefined){
    const r = await api('/api/images/' + d.irestore, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restore: true }) });
    if(r.ok){ toast('Done - image restored'); loadImgAdmin(); } else toast('Restore failed', true);
  }
  if(d.ipurge !== undefined){
    const ok = await confirmModal('Delete this image forever?', 'This cannot be undone. Quotations already saved keep their own copy.', 'Delete forever');
    if(!ok) return;
    const r = await api('/api/images/' + d.ipurge + '?hard=1', { method: 'DELETE' });
    if(r.ok){ toast('Done - image deleted forever'); loadImgAdmin(); } else toast('Delete failed', true);
  }
});
$('imgAdminList').addEventListener('change', async e => {
  const d = e.target.dataset || {};
  if(d.ireplace !== undefined && e.target.files && e.target.files[0]){
    const dataUrl = await resizeImageFile(e.target.files[0]);
    const r = await api('/api/images/' + d.ireplace, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) });
    if(r.ok){ toast('Done - image replaced'); loadImgAdmin(); } else toast('Replace failed', true);
  }
});

// ---------- reset password modal ----------
function rpClose(){ $('rpModal').classList.add('hidden'); delete $('rpModal').dataset.uid; }
$('rpCancel').addEventListener('click', rpClose);
$('rpModal').addEventListener('click', e => { if(e.target.id === 'rpModal') rpClose(); });
$('rpShow').addEventListener('click', () => {
  const show = $('rpPass').type === 'password';
  $('rpPass').type = show ? 'text' : 'password';
  $('rpPass2').type = show ? 'text' : 'password';
  $('rpShow').textContent = show ? 'Hide' : 'Show';
});
$('rpSave').addEventListener('click', async () => {
  const uid = $('rpModal').dataset.uid;
  const p1 = $('rpPass').value, p2 = $('rpPass2').value;
  $('rpMsg').textContent = '';
  if(p1.length < 6){ $('rpMsg').textContent = 'Password must be at least 6 characters.'; return; }
  if(p1 !== p2){ $('rpMsg').textContent = 'The two passwords do not match.'; return; }
  $('rpSave').disabled = true;
  try {
    const r = await api('/api/users/' + uid, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: p1 }) });
    const j = await r.json();
    if(r.ok){ rpClose(); toast('Done - password reset. Share it privately with the user.'); }
    else $('rpMsg').textContent = j.error || 'Failed.';
  } catch(e){ $('rpMsg').textContent = 'Network error - try again.'; }
  $('rpSave').disabled = false;
});
$('rpPass2').addEventListener('keydown', e => { if(e.key === 'Enter') $('rpSave').click(); });

// ---------- vyapar export (admin) ----------
function invNum(v){ const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g,'')); return isFinite(n) ? n : null; }
let VX_QUOTATION = null;
function invRowHtml(it){
  const row = document.createElement('div');
  row.className = 'invrow';
  row.innerHTML = '<input type="text" placeholder="Article / service" value="' + esc(it.name||'') + '">'
    + '<input type="text" placeholder="Size (ft)" value="' + esc(it.size||'') + '">'
    + '<input type="text" placeholder="Qty" value="' + esc(it.qty||'') + '">'
    + '<input type="text" placeholder="Rate" value="' + esc(it.rate||'') + '">'
    + '<button class="small-btn danger" type="button">x</button>';
  row.querySelector('button').addEventListener('click', () => { row.remove(); updateInvTotal(); });
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateInvTotal));
  return row;
}
function readInvItems(){
  return [...$('invItems').children].map(row => {
    const i = row.querySelectorAll('input');
    return { name: i[0].value, size: i[1].value, qty: i[2].value, rate: i[3].value };
  }).filter(it => it.name.trim());
}
function vxAmount(it){ const q = invNum(it.qty), r = invNum(it.rate); return (q !== null && r !== null) ? q * r : null; }
function vxTotal(items){ let t = 0, any = false; items.forEach(it => { const a = vxAmount(it); if(a !== null){ t += a; any = true; } }); return any ? t : null; }
function updateInvTotal(){
  const t = vxTotal(readInvItems());
  $('invTotal').textContent = t !== null ? 'Total: Rs. ' + t.toLocaleString('en-IN') : '';
}
function openVyaparExport(quotation){
  VX_QUOTATION = quotation;
  const dd = quotation.data || {};
  $('invTitle').textContent = 'Export for Vyapar (Quotation #' + quotation.id + ')';
  $('invNo').value = 'BBTH/' + new Date().getFullYear() + '/' + String(quotation.id).padStart(4, '0');
  $('invDate').value = new Date().toISOString().slice(0, 10);
  $('invClient').value = dd.clientName || '';
  $('invPlace').value = dd.clientPlace || '';
  $('invPhone').value = dd.clientPhone || '';
  $('invItems').innerHTML = '';
  const items = [];
  (dd.services || []).filter(s => s.on).forEach(s => items.push({ name: s.name, size: s.size || '', qty: s.qty || '1', rate: s.rate || '' }));
  (dd.extras || []).filter(s => s.on).forEach(s => items.push({ name: s.name, size: '', qty: s.qty || '1', rate: s.rate || '' }));
  if(!items.length) items.push({ name: '', size: '', qty: '1', rate: '' });
  items.forEach(it => $('invItems').appendChild(invRowHtml(it)));
  updateInvTotal();
  $('invMsg').textContent = '';
  $('invModal').classList.remove('hidden');
  window.scrollTo(0, 0);
}
$('invAddRow').addEventListener('click', () => { $('invItems').appendChild(invRowHtml({ qty: '1' })); updateInvTotal(); });
$('invCancel').addEventListener('click', () => $('invModal').classList.add('hidden'));

function vxData(){
  return {
    no: $('invNo').value.trim(), date: $('invDate').value,
    party: $('invClient').value.trim(), place: $('invPlace').value.trim(), phone: $('invPhone').value.trim(),
    items: readInvItems()
  };
}
function csvCell(v){ v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
$('invCsv').addEventListener('click', () => {
  const d = vxData();
  if(!d.party){ $('invMsg').textContent = 'Party Name is required.'; return; }
  const lines = [['Invoice No','Invoice Date','Party Name','Place','Contact','Item Name','Size (Ft)','Qty','Unit','Rate','Amount'].join(',')];
  d.items.forEach(it => {
    const a = vxAmount(it);
    lines.push([d.no, d.date, d.party, d.place, d.phone, it.name, it.size, it.qty, 'SERVICE', it.rate, a !== null ? a : ''].map(csvCell).join(','));
  });
  const t = vxTotal(d.items);
  if(t !== null) lines.push(['','','','','','TOTAL','','','','',t].map(csvCell).join(','));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Vyapar-Sale-' + d.no.replace(/[^a-z0-9]+/gi, '-') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  $('invMsg').textContent = 'CSV downloaded. In Vyapar: Bulk Upload / Import Sale -> upload this file -> auto-map columns.';
});
$('invCopy').addEventListener('click', async () => {
  const d = vxData();
  const rows = ['Item\tQty\tRate\tAmount'];
  d.items.forEach(it => { const a = vxAmount(it); rows.push([it.name, it.qty, it.rate, a !== null ? a : ''].join('\t')); });
  const t = vxTotal(d.items);
  const text = 'SALE ENTRY (Vyapar)\nInvoice No: ' + d.no + '\nDate: ' + d.date
    + '\nParty: ' + d.party + (d.place ? ' (' + d.place + ')' : '') + (d.phone ? ' | ' + d.phone : '')
    + '\n\n' + rows.join('\n')
    + (t !== null ? '\nTOTAL\t\t\t' + t : '')
    + '\n\nNo GST - BBTH (unregistered)';
  try { await navigator.clipboard.writeText(text); $('invMsg').textContent = 'Copied - paste into Vyapar or Excel.'; }
  catch { $('invMsg').textContent = 'Copy failed - select and copy manually.'; }
});


// ---------- Agreement T&C editor ----------
let TC_LINES = [];
function tcRender(){
  const t = settings.texts || {};
  if(!tcRender.loaded){ TC_LINES = String(t.agreeTerms || '').split('\n').map(x => x.trim()).filter(Boolean); tcRender.loaded = true; }
  $('tcHead').value = t.agreeTermsHead || '';
  $('tcClosing').value = t.agreeTermsClosing || '';
  const box = $('tcList'); box.innerHTML = '';
  TC_LINES.forEach((line, i) => {
    const row = document.createElement('div'); row.className = 'tc-row';
    row.innerHTML = '<span class="tc-n">' + (i + 1) + '</span><textarea rows="3"></textarea><div class="tc-btns"><button type="button" data-a="up" title="Move up">&#9650;</button><button type="button" data-a="dn" title="Move down">&#9660;</button><button type="button" data-a="del" title="Delete">&#10005;</button></div>';
    const ta = row.querySelector('textarea'); ta.value = line; ta.setAttribute('data-tcline', i);
    ta.addEventListener('input', () => { admTyped(ta); TC_LINES[i] = ta.value; });
    row.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      if(a === 'del'){ if(!(await admConfirm('Delete clause ' + (i + 1) + '?', { okText:'Delete' }))) return; snapAdmin(); TC_LINES.splice(i, 1); }
      else if(a === 'up' && i > 0){ snapAdmin(); [TC_LINES[i-1], TC_LINES[i]] = [TC_LINES[i], TC_LINES[i-1]]; }
      else if(a === 'dn' && i < TC_LINES.length - 1){ snapAdmin(); [TC_LINES[i+1], TC_LINES[i]] = [TC_LINES[i], TC_LINES[i+1]]; }
      tcRender();
    }));
    box.appendChild(row);
  });
}
$('tcAdd').addEventListener('click', () => { snapAdmin(); TC_LINES.push(''); tcRender(); const a = $('tcList').querySelectorAll('textarea'); if(a.length) a[a.length-1].focus(); });
$('tcSave').addEventListener('click', async () => {
  const lines = TC_LINES.map(x => String(x).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  if(!lines.length){ toast('Add at least one clause first', true); return; }
  settings.texts.agreeTerms = lines.join('\n');
  settings.texts.agreeTermsHead = $('tcHead').value.trim() || settings.texts.agreeTermsHead;
  settings.texts.agreeTermsClosing = $('tcClosing').value.trim();
  TC_LINES = lines;
  const r = await api('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
  if(r.ok){ try { localStorage.setItem('bbth-settings-ts', String(Date.now())); } catch(e){} tcRender(); $('tcModal').classList.remove('hidden'); }
  else toast('Save failed - please try again', true);
});
$('tcOk').addEventListener('click', () => $('tcModal').classList.add('hidden'));


// ---------- register attention strip + popups (Deep 26 Oct 12:28-12:31) ----------
// (a) day before FIRST event date: "kal yeh event hai, are you ready?"
// (b) after LAST event date: "woh complete hua ki nahi?" - admin answers
// explicitly; nothing automatic. Strip chips compute from recorded rows only.
const regTerminal = r => /completed|cancelled/i.test((r && r.status) || '');
function regDatesOf(r){ return regParseDates(r.eventDates || '').slice().sort((a, b) => a - b); }
function regFirstFutureOrNext(r){
  const ds = regDatesOf(r); if(!ds.length) return null;
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const fut = ds.filter(t => t >= t0.getTime());
  return fut.length ? fut[0] : null;
}
function regLastDate(r){ const ds = regDatesOf(r); return ds.length ? ds[ds.length - 1] : null; }
function regDayKey(ts){ const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }
let REG_CHIP = null; // active attention-chip filter
function regChipPred(r){
  const t0 = new Date(); t0.setHours(0,0,0,0); const t = t0.getTime();
  const day = 86400000;
  if(REG_CHIP === 'events7'){ const f = regFirstFutureOrNext(r); return !regTerminal(r) && f !== null && f < t + 7*day; }
  if(REG_CHIP === 'baldue'){ const bal = regBalanceOf(r); if(regTerminal(r) || bal === '' || bal <= 0) return false;
    const f = regFirstFutureOrNext(r); const last = regLastDate(r);
    if(f !== null) return f < t + 3*day; // event within 3 days -> due is near/past (due = first-2d)
    return last !== null && last < t;     // event over, balance still open
  }
  if(REG_CHIP === 'pastopen'){ const l = regLastDate(r); return !regTerminal(r) && l !== null && l < t; }
  return true;
}
function renderRegStrip(){
  const el = $('regStrip'); if(!el) return;
  const chips = [
    { k:'events7', label: n => n + ' event' + (n===1?'':'s') + ' in next 7 days' },
    { k:'baldue',  label: n => n + ' with balance due near event' },
    { k:'pastopen',label: n => n + ' past event' + (n===1?'':'s') + ' not closed' },
  ];
  const saved = REG_CHIP;
  let html = '';
  chips.forEach(c => {
    REG_CHIP = c.k;
    const n = REG_ROWS.filter(regChipPred).length;
    const on = saved === c.k;
    html += '<button type="button" class="small-btn" data-regchip="' + c.k + '" style="'
      + (on ? 'background:#264a3b;color:#fff;' : 'background:#f2f5ec;color:#264a3b;border:1.5px solid #264a3b;') + 'border-radius:999px">'
      + c.label(n) + (on ? ' \u00d7' : '') + '</button>';
  });
  REG_CHIP = saved;
  el.innerHTML = html;
}
$('regStrip').addEventListener('click', ev => {
  const b = ev.target.closest('[data-regchip]'); if(!b) return;
  REG_CHIP = (REG_CHIP === b.dataset.regchip) ? null : b.dataset.regchip;
  renderRegSheet();
});

// popups: queue of rows; dismissal remembered per row+day so it asks once a day
function regPopQueue(){
  const t0 = new Date(); t0.setHours(0,0,0,0); const t = t0.getTime(); const day = 86400000;
  const dismissed = JSON.parse(localStorage.getItem('bbth-regpop') || '{}');
  const today = regDayKey(t);
  const q = [];
  REG_ROWS.forEach(r => {
    if(regTerminal(r)) return;
    const key = r.id + '|' + today;
    if(dismissed[key]) return;
    const f = regFirstFutureOrNext(r), l = regLastDate(r);
    if(f !== null && f >= t + day && f < t + 2*day) q.push({ r: r, kind: 'ready' });
    else if(l !== null && l < t) q.push({ r: r, kind: 'done' });
  });
  return q;
}
function regPopDismiss(id){ const d = JSON.parse(localStorage.getItem('bbth-regpop') || '{}'); d[id + '|' + regDayKey(new Date().setHours(0,0,0,0))] = 1; localStorage.setItem('bbth-regpop', JSON.stringify(d)); }
function regPopNext(queue){
  const pop = $('regPop');
  if(!queue.length){ pop.classList.add('hidden'); try { sessionStorage.removeItem('bbthRegHold'); } catch(e){} return; }
  const { r, kind } = queue[0];
  const fmtD = ts => new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  const dates = regDatesOf(r).map(fmtD).join(', ');
  $('regPopTitle').textContent = kind === 'ready' ? 'Kal event hai - ready?' : 'Event complete hua?';
  $('regPopBody').textContent = kind === 'ready'
    ? 'Kal ' + (r.name || 'client') + ' ka event hai (' + (r.eventDates || dates) + (r.venue ? ', ' + r.venue : '') + '). Are you ready?'
    : (r.name || 'Client') + "'s event (" + (r.eventDates || dates) + ") is over. Mark it as completed?";
  $('regPopSub').textContent = 'Status: ' + (r.status || 'Enquiry') + ' - only you can change it; nothing changes automatically.';
  const btns = $('regPopBtns'); btns.innerHTML = '';
  const mk = (label, primary, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'flex:1;padding:10px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;border:1.5px solid #264a3b;' + (primary ? 'background:#264a3b;color:#fff' : 'background:#fff;color:#264a3b');
    b.addEventListener('click', fn); btns.appendChild(b); };
  if(kind === 'ready'){
    mk('Ready', true, () => { regPopDismiss(r.id); queue.shift(); regPopNext(queue); });
    mk('Not yet', false, () => { regPopDismiss(r.id); queue.shift(); regPopNext(queue); });
  } else {
    mk('Haan - mark Completed', true, async () => {
      const row = REG_ROWS.find(x => x.id === r.id);
      if(row){ snapAdmin(); row.status = 'Completed'; row.updatedAt = new Date().toISOString();
        try { await regPersist('Marked Completed: ' + (row.name || '')); } catch(e){ if(e && e.message === 'conflict') { /* regPersist already showed the drift message */ } else toast('Save failed - check the sheet', true); } }
      regPopDismiss(r.id); queue.shift(); regPopNext(queue);
    });
    mk('Not now', false, () => { regPopDismiss(r.id); queue.shift(); regPopNext(queue); });
  }
  pop.classList.remove('hidden');
}
async function regBootPopups(){
  const release = () => { try { sessionStorage.removeItem('bbthRegHold'); } catch(e){} };
  if(ROLE !== 'admin'){ release(); return; } // Deep: "admin ko popup" - admin only
  if(sessionStorage.getItem('bbthRegPopRan')){ release(); return; } // once per session: no remount on reload
  sessionStorage.setItem('bbthRegPopRan', '1');
  try {
    if(!REG_ROWS.length){ const r = await api('/api/client-register'); if(r.ok){ const d = await r.json(); REG_ROWS = Array.isArray(d.rows) ? d.rows : []; REG_BASE = regCanon(REG_ROWS); } }
  } catch(e){ release(); return; }
  const q = regPopQueue();
  if(!q.length){ release(); return; }
  // Deep 26 Oct: these reminders come FIRST on admin arrival; the bell popup is
  // held (bbthRegHold) until this queue drains - never stacked, never duplicated.
  regPopNext(q);
}

// ---------- client register (admin only; stored server-side, admin-checked) ----------
let REG_ROWS = [];
// Deep 13 Nov: compare-and-swap base snapshot - the register rows exactly as this
// session last fetched them from the server. regPersist refuses a whole-rows PUT
// when the server has moved on (another tab/device/session saved in between), so a
// stale save can never silently resurrect deletes or clobber concurrent edits.
let REG_BASE = '[]';
function regCanon(rows){ return JSON.stringify(Array.isArray(rows) ? rows : []); }
function regParseDates(s){
  // pull dd/mm/yyyy or dd-mm-yyyy tokens out of free text like "05-06/12/2026" or "24/10/2026"
  const out = [];
  const re = /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/g; let m;
  while((m = re.exec(s))){ out.push(new Date(+m[3], +m[2] - 1, +m[1]).getTime()); }
  // handle "05-06/12/2026" style: a leading day before the full date shares its month/year
  const lead = /^(\d{1,2})\s*-\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.exec((s || '').trim());
  if(lead && out.length){ out.push(new Date(new Date(out[0]).getFullYear(), new Date(out[0]).getMonth(), +lead[1]).getTime()); }
  return out;
}
function regSort(rows){
  const today = new Date(); today.setHours(0,0,0,0);
  const t0 = today.getTime();
  const done = r => /completed|cancelled/i.test(r && r.status || '');
  return rows.slice().sort((a, b) => {
    const da = regParseDates(a.eventDates || ''), db = regParseDates(b.eventDates || '');
    const fa = da.filter(t => t >= t0), fb = db.filter(t => t >= t0);
    const ka = fa.length ? Math.min.apply(null, fa) : (da.length ? -Math.max.apply(null, da) : -Infinity);
    const kb = fb.length ? Math.min.apply(null, fb) : (db.length ? -Math.max.apply(null, db) : -Infinity);
    // Deep 25 Oct 17:59: whichever booking needs handling first goes on top -
    // today first, then tomorrow, then later dates; past and undated below;
    // completed/cancelled need no handling, so they sink to the bottom.
    const ca = done(a) ? 3 : (fa.length ? 0 : (da.length ? 1 : 2));
    const cb = done(b) ? 3 : (fb.length ? 0 : (db.length ? 1 : 2));
    if(ca !== cb) return ca - cb;
    if(ca === 0) return ka - kb;          // upcoming: nearest first
    if(ca === 1) return ka - kb;          // past: most recent first (keys are negative)
    return (a.name || '').localeCompare(b.name || '');
  });
}
function regDocsHtml(r){
  const links = Array.isArray(r.docLinks) ? r.docLinks.filter(x => x && (x.no || x.url)) : [];
  if(!links.length) return esc(r.docs || '');
  return links.map(x => {
    const label = esc(x.no || (x.kind === 'agreement' ? 'Agreement' : 'Quotation'));
    const tag = x.kind === 'agreement' ? ' (agr)' : '';
    return x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + label + '</a>' + tag : label + tag;
  }).join('<br>');
}
// Display-only phone normalization (Deep 26 Oct: "ph no format same"). Stored values are NEVER rewritten;
// international numbers keep their own country code; unrecognized shapes display exactly as saved.
function fmtPhone(p){
  p = (p == null ? '' : String(p)).trim(); if(!p) return '';
  const hasPlus = p.charAt(0) === '+';
  const d = p.replace(/[^0-9]/g, '');
  if(hasPlus) return '+' + d; // already international - just strip spaces/dashes
  if(/^[6-9][0-9]{9}$/.test(d)) return '+91 ' + d; // Indian 10-digit mobile
  if(/^91[6-9][0-9]{9}$/.test(d)) return '+91 ' + d.slice(2); // 91-prefixed, no plus
  // 0-prefixed values are ambiguous (0+mobile vs STD landline) - left as saved, no guessing.
  return p; // unknown shape (landline, short, other country) - show as saved, no guessing
}
function regNum(v){ if(v === '' || v == null) return ''; const n = +v; return isNaN(n) ? '' : n; }
function regBalanceOf(r){ const a = regNum(r.agreed), adv = regNum(r.advance); if(a === '' || adv === '') return ''; return a - adv; }
function regDueOf(r){ const ds = regParseDates(r.eventDates || ''); if(!ds.length) return ''; const d = new Date(Math.min.apply(null, ds)); d.setDate(d.getDate() - 2); return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
// Automatic payment status from recorded amounts; manual override always wins; missing amounts are NEVER Paid. (Deep 26 Oct)
function regPayStatus(r){
  const ov = (r && r.payOverride || '').trim();
  if(ov) return ov;
  if(/cancelled/i.test((r && r.status) || '')) return ''; // cancelled bookings carry no payment status
  const a = regNum(r.agreed), adv = regNum(r.advance);
  if(a === '' || adv === '') return ''; // amounts missing -> blank, never Paid
  if(a === 0 && adv === 0) return 'No charge';
  if(adv === 0) return 'Not Paid';
  if(adv < a) return 'Partial';
  if(adv === a) return 'Paid';
  return 'Review (overpaid)';
}
function regRefreshAuto(){ const r = { agreed: $('regAgreed').value, advance: $('regAdvance').value, eventDates: $('regDates').value };
  const b = regBalanceOf(r); $('regBalance').value = b === '' ? '' : ('\u20B9' + Number(b).toLocaleString('en-IN'));
  $('regDue').value = regDueOf(r); }
// Deep 31 Oct: Clients tab splits into Upcoming (category-wise) / Create client / Completed.
// Completed & Cancelled clients leave the active list automatically - view only, never deleted.
let REG_SUB = 'upcoming';
// Deep 13 Nov: register status vocabulary is fixed, but Deep can set a literal status
// (e.g. "Quotated"). Keep such a literal visible and round-trippable - never let the UI
// silently fall back to Enquiry and wipe it on the next save.
const REG_STD_STATUS = ['Enquiry','Quoted','Confirmed','Scheduled','Completed','Cancelled'];
function regStatusOptionsHtml(cur){
  const cur2 = cur || 'Enquiry';
  const list = REG_STD_STATUS.indexOf(cur2) >= 0 ? REG_STD_STATUS : REG_STD_STATUS.concat([cur2]);
  return list.map(o => '<option' + (o === cur2 ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
}
function regSyncStatusSelect(cur){
  const sel = $('regStatus'); if(!sel) return;
  Array.from(sel.options).forEach(o => { if(REG_STD_STATUS.indexOf(o.value) < 0) o.remove(); });
  const cur2 = cur || 'Enquiry';
  if(REG_STD_STATUS.indexOf(cur2) < 0) sel.add(new Option(cur2, cur2));
  sel.value = cur2;
}
function regTerm(r){ return /completed|cancelled/i.test(r && r.status || ''); }
function regSubGo(sub){
  REG_SUB = sub;
  document.querySelectorAll('[data-regsub]').forEach(x => x.classList.toggle('active', x.dataset.regsub === sub));
  const pc = $('regPaneCreate'), pl = $('regPaneList');
  if(pc) pc.hidden = sub !== 'create';
  if(pl) pl.hidden = sub === 'create';
  if(sub !== 'create') renderRegSheet();
}
document.querySelectorAll('[data-regsub]').forEach(b => b.addEventListener('click', () => regSubGo(b.dataset.regsub)));
function renderRegSheet(){
  const w = $('regSheetWrap');
  renderRegStrip();
  const strip = $('regStrip'); if(strip) strip.style.display = REG_SUB === 'completed' ? 'none' : 'flex';
  const rq = (($('regSearch') && $('regSearch').value) || '').trim().toLowerCase();
  const searched = REG_ROWS.filter(regChipPred).filter(r => !rq || [r.name, r.phone, r.eventType, r.eventDates, r.venue, r.docs, r.status, r.notes]
    .some(v => String(v || '').toLowerCase().includes(rq)));
  const nUp = searched.filter(r => !regTerm(r)).length, nDone = searched.filter(regTerm).length;
  if($('regNUp')) $('regNUp').textContent = nUp;
  if($('regNDone')) $('regNDone').textContent = nDone;
  const base = searched.filter(r => REG_SUB === 'completed' ? regTerm(r) : !regTerm(r));
  const sortBy = (($('regSortBy') || {}).value) || 'event';
  const rows = sortBy === 'name' ? base.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    : sortBy === 'updated' ? base.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    : regSort(base);
  if(!rows.length){
    w.innerHTML = '<p class="hint">' + (REG_SUB === 'completed'
      ? 'No completed/cancelled clients yet - mark a client Completed or Cancelled in the sheet and they move here automatically.'
      : (REG_ROWS.length ? 'Nothing matches this search/filter.' : 'No upcoming clients - add the first one from Create client.')) + '</p>';
    return;
  }
  const money = v => (v === '' || v == null || isNaN(+v)) ? '' : ('\u20B9' + Number(v).toLocaleString('en-IN'));
  let html = '<div class="reg-scroll"><table class="reg-table"><thead><tr><th>#</th><th>Name</th><th>Type</th><th>Phone</th><th>Event date(s)</th><th>Venue</th><th>Doc no(s)</th><th>Status</th><th>Quoted</th><th>Agreed</th><th>Advance</th><th>Balance</th><th>Payment</th><th>Due date</th><th>Notes</th><th>Updated</th><th></th></tr></thead><tbody>';
  // category-wise grouping for the Upcoming view (Confirmed, Scheduled, Quoted, Enquiry, then others)
  const REG_ORDER = ['Confirmed', 'Scheduled', 'Quoted', 'Enquiry'];
  let gLast = null, gN = 0;
  const gKey = r => REG_SUB === 'completed' ? 'Completed / Cancelled' : (r.status || 'Enquiry');
  const gSorted = REG_SUB === 'completed' ? rows : rows.slice().sort((a, b) => {
    const ia = REG_ORDER.indexOf(gKey(a)), ib = REG_ORDER.indexOf(gKey(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  (REG_SUB === 'completed' ? rows : gSorted).forEach((r) => {
    const gk = gKey(r), i = gN++;
    if(gk !== gLast){
      gLast = gk;
      const cnt = (REG_SUB === 'completed' ? rows : gSorted).filter(x => gKey(x) === gk).length;
      html += '<tr class="reg-grp"><td colspan="17">' + esc(gk) + ' <span class="reg-grp-n">' + cnt + '</span></td></tr>';
    }
    const bal = regBalanceOf(r), due = regDueOf(r);
    html += '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.eventType || '') + '</td><td>' + esc(fmtPhone(r.phone)) + '</td><td>' + (r.eventDates ? esc(r.eventDates) : '<span class="reg-nodate">date not set</span>') + '</td><td>' + esc(r.venue || '') + '</td><td>' + regDocsHtml(r) + '</td><td><select class="pick reg-stpick" data-regstatus="' + r.id + '">' + regStatusOptionsHtml(r.status) + '</select></td>'
      + '<td>' + money(r.quoted) + '</td><td>' + money(r.agreed) + '</td><td>' + money(r.advance) + '</td><td><b>' + (bal === '' ? '' : money(bal)) + '</b></td><td>' + esc(regPayStatus(r)) + '</td><td>' + esc(due) + '</td>'
      + '<td>' + esc(r.notes || '') + '</td><td>' + (r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '') + '</td>'
      + '<td class="reg-act">'
      + ((/enquiry|quoted/i.test(r.status || 'Enquiry') && Array.isArray(r.docLinks) && r.docLinks.some(x => x && x.kind === 'agreement'))
          ? '<button class="small-btn" type="button" data-regconfirm="' + r.id + '" title="Agreement linked - booking pakki?">Mark Confirmed?</button>' : '')
      + '<button class="small-btn" type="button" data-regedit="' + r.id + '">Edit</button><button class="small-btn" type="button" data-regdel="' + r.id + '">Delete</button>'
      + '</td></tr>';
  });
  w.innerHTML = html + '</tbody></table></div>';
}
async function loadRegister(){
  const w = $('regSheetWrap'); w.innerHTML = '<p class="hint">Loading...</p>';
  try {
    const r = await api('/api/client-register');
    if(!r.ok){ w.innerHTML = '<p class="hint">Could not load the register (HTTP ' + r.status + ').</p>'; return; }
    const d = await r.json();
    REG_ROWS = Array.isArray(d.rows) ? d.rows : [];
    REG_BASE = regCanon(REG_ROWS);
    renderRegSheet();
  } catch(e){ w.innerHTML = '<p class="hint">Could not load the register.</p>'; }
}
async function regPersist(msg){
  // Deep 13 Nov: fail-closed compare-and-swap. Re-read the register first; only PUT
  // when the server still holds exactly what this session based its edit on. On any
  // drift (or a failed verification read) never write blindly - refresh and report.
  let fr;
  try { fr = await api('/api/client-register'); } catch(e){ throw new Error('verify-network'); }
  if(!fr || !fr.ok) throw new Error('verify-http-' + (fr ? fr.status : 'none'));
  const fd = await fr.json();
  const cur = Array.isArray(fd.rows) ? fd.rows : [];
  if(regCanon(cur) !== REG_BASE){
    try { const m = $('regMsg'); if(m) m.textContent = 'Register changed elsewhere just now - list refreshed; try again.'; } catch(e){}
    loadRegister();
    throw new Error('conflict');
  }
  const r = await api('/api/client-register', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: REG_ROWS }) });
  if(!r.ok) throw new Error('save failed');
  REG_BASE = regCanon(REG_ROWS);
  renderRegSheet();
  if(msg) $('regMsg').textContent = msg;
  setTimeout(() => { const m = $('regMsg'); if(m) m.textContent = ''; }, 3000);
}
// Deep 26 Oct: inline status change straight from the register list (no full form).
// Fresh read-modify-write so a concurrent edit elsewhere is never clobbered;
// ONLY the status field changes - amounts/payment/facts stay exactly as saved.
$('regSheetWrap').addEventListener('change', async ev => {
  const sel = ev.target.closest && ev.target.closest('[data-regstatus]'); if(!sel) return;
  const id = sel.dataset.regstatus, next = sel.value;
  const prev = (REG_ROWS.find(x => x.id === id) || {}).status || 'Enquiry';
  if(next === prev) return;
  if((next === 'Cancelled' || next === 'Completed') && !(await admConfirm('Mark as ' + next + '? The list will update right away.', { okText:'Yes, mark ' + next.toLowerCase() }))){ sel.value = prev; return; }
  sel.disabled = true;
  try {
    const r = await api('/api/client-register'); const d = await r.json();
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const row = rows.find(x => x.id === id);
    if(!row){ $('regMsg').textContent = 'That entry is gone - refreshing the list.'; loadRegister(); return; }
    row.status = next; row.updatedAt = new Date().toISOString();
    const pr = await api('/api/client-register', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) });
    if(pr.status === 409){ $('regMsg').textContent = 'Register changed elsewhere just now - refreshing; try again.'; loadRegister(); return; }
    if(!pr.ok) throw new Error('save failed');
    REG_ROWS = rows; REG_BASE = regCanon(rows); renderRegSheet();
    $('regMsg').textContent = 'Status updated: ' + (row.name || '') + ' -> ' + next;
    setTimeout(() => { const m = $('regMsg'); if(m) m.textContent = ''; }, 3000);
  } catch(e){ sel.disabled = false; sel.value = prev; $('regMsg').textContent = 'Status change could not be saved.'; }
});

// Deep 31 Oct: Refresh button reloads the WHOLE site (latest code + data). No cache
// clear, no logout (session lives in sessionStorage), no data reset. Warns first when
// a form on screen holds unsaved input, so work is never silently thrown away.
function admDirtyCheck(){
  // register create/edit form
  const regDirty = ['regName','regPhone','regDates','regVenue','regDocs','regNotes','regQuoted','regAgreed','regAdvance']
    .some(id => { const el = $(id); return el && String(el.value || '').trim() !== ''; });
  if(regDirty) return 'Client form';
  // in-panel quotation iframe (same-origin): any filled text input
  try {
    const f = $('frameQuote');
    if(f && f.contentDocument && !f.closest('.tab-panel').classList.contains('hidden')){
      const d = f.contentDocument;
      const dirty = [...d.querySelectorAll('input[type=text],input[type=tel],input[type=number],textarea')]
        .some(el => String(el.value || '').trim() !== '');
      if(dirty) return 'Quotation form';
    }
  } catch(e){}
  return '';
}
if($('admRefresh')) $('admRefresh').addEventListener('click', async () => {
  const dirty = admDirtyCheck();
  if(dirty && !(await admConfirm(dirty + ' has unsaved changes - they will be lost if the site refreshes. Refresh anyway?', { okText:'Refresh' }))) return;
  const b = $('admRefresh');
  if(b){ b.classList.add('spinning'); b.disabled = true; }
  sessionStorage.setItem('bbth-refreshed', '1');
  admRefreshOverlay(true);
  setTimeout(() => location.reload(), 420);
});
// Visible refresh state (Deep 10 Nov): the reload itself wipes the DOM, so the
// overlay covers the gap and the next load confirms with a toast.
function admRefreshOverlay(on){
  let ov = $('admRefreshOv');
  if(!ov){ ov = document.createElement('div'); ov.id = 'admRefreshOv'; ov.innerHTML = '<div class="upd-box"><div class="upd-spin"></div><b>Refreshing...</b><span>Loading the latest data</span></div>'; document.body.appendChild(ov); }
  ov.classList.toggle('on', !!on);
}
if(sessionStorage.getItem('bbth-refreshed')){ sessionStorage.removeItem('bbth-refreshed'); setTimeout(() => toast('Done - latest data loaded'), 600); }

let regSearchT; $('regSearch').addEventListener('input', () => { clearTimeout(regSearchT); regSearchT = setTimeout(renderRegSheet, 200); });
if($('regSortBy')) $('regSortBy').addEventListener('change', renderRegSheet);

// Autofill assist (Deep 26 Oct): typing a client name that matches a saved
// quotation offers one-click fill. Fills EMPTY fields only; admin reviews.
let REG_QUOTES = null;
async function regQuotesCache(){
  if(REG_QUOTES) return REG_QUOTES;
  try { const r = await api('/api/quotations'); if(r.ok){ const d = await r.json(); REG_QUOTES = d.quotations || []; } } catch(e){}
  return REG_QUOTES || [];
}
let regNameT;
$('regName').addEventListener('input', () => {
  clearTimeout(regNameT);
  regNameT = setTimeout(async () => {
    const sug = $('regSuggest'); if(!sug) return;
    sug.innerHTML = '';
    if($('regId').value) return; // editing existing - no assist
    const nm = $('regName').value.trim().toLowerCase(); if(nm.length < 3) return;
    const qs = await regQuotesCache();
    const hit = qs.find(q => (q.client || '').trim().toLowerCase() === nm) || qs.find(q => (q.client || '').trim().toLowerCase().startsWith(nm));
    if(!hit) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'small-btn';
    b.textContent = 'Fill from ' + (hit.doc_no || ('quotation #' + hit.id));
    b.title = 'Fills empty fields only - phone, venue, event dates, doc no';
    b.addEventListener('click', async () => {
      try {
        const det = await qDetail(hit.id); const dd = det && det.data ? det.data : {};
        const dPhn = dd.clientPhone || dd.phn || '', dPlace = dd.clientPlace || dd.place || '', dEv = dd.eventDates || dd.eventDate || dd.event || '';
        if(!$('regPhone').value && dPhn) $('regPhone').value = dPhn;
        if(!$('regVenue').value && dPlace) $('regVenue').value = dPlace;
        if(!$('regDates').value && dEv) $('regDates').value = dEv.toString().replace(/\n+/g, ', ');
        if(!$('regDocs').value && hit.doc_no) $('regDocs').value = hit.doc_no;
        if($('regStatus').value === 'Enquiry' && hit.doc_no) $('regStatus').value = 'Quoted'; // established upgrade rule only
        regRefreshAuto();
        $('regMsg').textContent = 'Filled from ' + (hit.doc_no || 'quotation') + ' - check and save.';
      } catch(e){ $('regMsg').textContent = 'Could not load that quotation.'; }
    });
    sug.appendChild(b);
  }, 300);
});
$('regSave').addEventListener('click', async () => {
  const name = $('regName').value.trim();
  if(!name){ $('regMsg').textContent = 'Client name is required.'; return; }
  const id = $('regId').value;
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const ph = $('regPhone').value.trim();
  // Same phone + same name: clearly the same client - block the duplicate.
  const phoneDup = ph ? REG_ROWS.find(r => r.id !== id && r.phone && String(r.phone).trim() === ph) : null;
  if (phoneDup && norm(phoneDup.name) === norm(name)) {
    $('regMsg').textContent = 'Already registered as "' + phoneDup.name + '" (' + (phoneDup.status || 'Enquiry') + ') - open that entry from the sheet to update it.';
    return;
  }
  // Same phone, different name: shared family/business phone - confirm before adding a second client on it.
  if (phoneDup && !(await admConfirm('This phone is already saved under "' + phoneDup.name + '". Add "' + name + '" as a separate client on the same phone?', { okText:'Add separately' }))) return;
  // Same name: block only when phones do not contradict; if both phones differ, ask (same-name clients may be different people).
  const nameDup = REG_ROWS.find(r => r.id !== id && norm(r.name) === norm(name));
  if (nameDup) {
    const exPh = String(nameDup.phone || '').trim();
    if (!ph || !exPh || ph === exPh) {
      $('regMsg').textContent = 'Already registered as "' + nameDup.name + '" (' + (nameDup.status || 'Enquiry') + ') - open that entry from the sheet to update it.';
      return;
    }
    if (!(await admConfirm('A client named "' + nameDup.name + '" already exists with a different phone (' + exPh + '). Add "' + name + '" as a separate client?', { okText:'Add separately' }))) return;
  }
  snapAdmin();
  const row = {
    id: id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    name,
    phone: $('regPhone').value.trim(),
    eventType: $('regType').value.trim(),
    eventDates: $('regDates').value.trim(),
    venue: $('regVenue').value.trim(),
    docs: $('regDocs').value.trim(),
    status: $('regStatus').value,
    quoted: $('regQuoted').value.trim(),
    agreed: $('regAgreed').value.trim(),
    advance: $('regAdvance').value.trim(),
    payOverride: $('regPayOv').value,
    notes: $('regNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };
  if(id){ const i = REG_ROWS.findIndex(r => r.id === id); if(i >= 0) REG_ROWS[i] = row; else REG_ROWS.push(row); }
  else REG_ROWS.push(row);
  const btn = $('regSave'); btn.disabled = true;
  try {
    await regPersist('Saved - sheet updated.'); $('regClear').click();
    regSubGo(regTerm(row) ? 'completed' : 'upcoming'); // land on the list where the entry now lives
  }
  catch(e){ if(!(e && e.message === 'conflict')) $('regMsg').textContent = 'Save failed - please try again.'; }
  finally { btn.disabled = false; }
});
$('regClear').addEventListener('click', () => {
  $('regId').value = ''; ['regName','regPhone','regType','regDates','regVenue','regDocs','regNotes','regQuoted','regAgreed','regAdvance','regBalance','regDue'].forEach(k => { $(k).value = ''; });
  regSyncStatusSelect('Enquiry'); $('regPayOv').selectedIndex = 0; $('regMsg').textContent = '';
});
$('regSheetWrap').addEventListener('click', async (ev) => {
  const cf = ev.target.closest('[data-regconfirm]'), ed = ev.target.closest('[data-regedit]'), del = ev.target.closest('[data-regdel]');
  if(cf){
    const r = REG_ROWS.find(x => x.id === cf.dataset.regconfirm); if(!r) return;
    // Deep 26 Oct: document existence alone never proves booking - admin confirms.
    if(!(await admConfirm('Mark "' + r.name + '" as Confirmed (booking final)?', { okText:'Mark Confirmed' }))) return;
    snapAdmin(); r.status = 'Confirmed'; r.updatedAt = new Date().toISOString();
    try { await regPersist('Marked Confirmed: ' + (r.name || '')); } catch(e){ if(!(e && e.message === 'conflict')) $('regMsg').textContent = 'Save failed - please try again.'; }
    return;
  }
  if(ed){
    const r = REG_ROWS.find(x => x.id === ed.dataset.regedit); if(!r) return;
    $('regId').value = r.id; $('regName').value = r.name || ''; $('regPhone').value = r.phone || '';
    $('regType').value = r.eventType || ''; $('regDates').value = r.eventDates || ''; $('regVenue').value = r.venue || ''; $('regDocs').value = r.docs || '';
    regSyncStatusSelect(r.status); $('regNotes').value = r.notes || '';
    $('regQuoted').value = r.quoted || ''; $('regAgreed').value = r.agreed || ''; $('regAdvance').value = r.advance || ''; regRefreshAuto(); $('regPayOv').value = r.payOverride || '';
    regSubGo('create');
    window.scrollTo({ top: 0, behavior: 'smooth' }); $('regMsg').textContent = 'Editing "' + r.name + '" - press Save entry to update.';
  } else if(del){
    const r = REG_ROWS.find(x => x.id === del.dataset.regdel); if(!r) return;
    if(!(await admConfirm('Delete entry for "' + r.name + '"?', { okText:'Delete' }))) return;
    snapAdmin();
    REG_ROWS = REG_ROWS.filter(x => x.id !== r.id);
    try { await regPersist('Deleted.'); } catch(e){ if(!(e && e.message === 'conflict')){ $('regMsg').textContent = 'Delete could not be saved.'; loadRegister(); } }
  }
});


['regAgreed','regAdvance','regDates'].forEach(k => { const el = $(k); if(el){ el.addEventListener('input', regRefreshAuto); } });

// Client Register -> Excel: amounts stay numeric, Balance is a live Excel formula, Payment is computed text. (Deep 26 Oct)
// Spreadsheet formula-injection guard: user-entered text (names, phones, notes...) must never open as a formula.
function regSafeTxt(v){ v = (v == null ? '' : String(v)); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function regCsvCell(v){ v = regSafeTxt(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function regCsvNum(v){ const n = regNum(v); return n === '' ? '' : String(n); }
function regExportCsv(){
  if(!REG_ROWS.length){ $('regMsg').textContent = 'Nothing to export.'; return; }
  const head = ['#','Name','Type','Phone','Event date(s)','Venue','Doc no(s)','Status','Quoted','Agreed','Advance','Balance','Payment','Due date','Notes','Updated'];
  const lines = [head.map(regCsvCell).join(',')];
  REG_ROWS.forEach((r, i) => {
    const row = i + 2; // Excel row (header is row 1)
    const a = regCsvNum(r.agreed), adv = regCsvNum(r.advance);
    const bal = (a !== '' && adv !== '') ? ('=J' + row + '-K' + row) : ''; // live formula Agreed - Advance
    const docs = (Array.isArray(r.docLinks) ? r.docLinks.map(x => x && x.no).filter(Boolean).join(' / ') : '') || r.docs || '';
    lines.push([i + 1, r.name || '', r.eventType || '', fmtPhone(r.phone), r.eventDates || '', r.venue || '', docs, r.status || '', regCsvNum(r.quoted), a, adv, bal, regPayStatus(r), regDueOf(r), r.notes || '', r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : ''].map(regCsvCell).join(','));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const aEl = document.createElement('a');
  aEl.href = URL.createObjectURL(blob);
  aEl.download = 'bbth-client-register-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(aEl.href), 5000);
}
function regExportXlsx(){
  if(!REG_ROWS.length){ $('regMsg').textContent = 'Nothing to export.'; return; }
  const head = ['#','Name','Type','Phone','Event date(s)','Venue','Doc no(s)','Status','Quoted','Agreed','Advance','Balance','Payment','Due date','Notes','Updated'];
  const aoa = [head];
  REG_ROWS.forEach((r, i) => {
    const docs = (Array.isArray(r.docLinks) ? r.docLinks.map(x => x && x.no).filter(Boolean).join(' / ') : '') || r.docs || '';
    aoa.push([i + 1, r.name || '', r.eventType || '', fmtPhone(r.phone), r.eventDates || '', r.venue || '', docs, r.status || '', regNum(r.quoted), regNum(r.agreed), regNum(r.advance), '', regPayStatus(r), regDueOf(r), r.notes || '', r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : ''].map(v => v === undefined ? '' : v));
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // xlsx safety: SheetJS auto-converts strings starting with '=' into formula cells - force those back to plain text so user text (and +91 phones) display exactly as saved.
  Object.keys(ws).forEach(k => { if(k.charAt(0) === '!') return; const c = ws[k]; if(c && c.f){ ws[k] = { t: 's', v: '=' + c.f }; } });
  REG_ROWS.forEach((r, i) => {
    const a = regNum(r.agreed), adv = regNum(r.advance);
    if(a === '' || adv === '') return; // missing amounts: blank balance, never a formula over empty cells
    const cell = XLSX.utils.encode_cell({ r: i + 1, c: 11 }); // column L (Balance)
    ws[cell] = { t: 'n', f: 'J' + (i + 2) + '-K' + (i + 2) }; // live formula Agreed - Advance
  });
  ws['!cols'] = [{wch:4},{wch:22},{wch:12},{wch:14},{wch:16},{wch:18},{wch:22},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:16},{wch:12},{wch:28},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Client Register');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const aEl = document.createElement('a');
  aEl.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  aEl.download = 'bbth-client-register-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(aEl.href), 5000);
}
$('regExport').addEventListener('click', regExportXlsx);
$('regExportCsv').addEventListener('click', regExportCsv);

// Client Register -> Booking Chart xlsx (Deep 10 Nov): EXACT chart layout he showed -
// columns No., Date, Venue / Location, Function, Setup / Scope. No budget/agreement/payment/doc
// fields at all. Styled like his chart: dark-green BBTH title band, gold divider, green header
// row, same-date groups sharing one pastel fill.
function regOrdDate(s){
  const MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ord=n=>{const v=n%100;return n+((v>=11&&v<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));};
  return String(s||'').replace(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,(m,d,mo,y)=>ord(+d)+' '+MON[+mo-1]+' '+y);
}
// SheetJS cannot embed images; post-process the xlsx zip (JSZip) to drop the
// BBTH arch logo into the title band, anchored over the two header rows.
async function xlsxEmbedChartLogo(out){
  try{
    const zip = await JSZip.loadAsync(out);
    const png = await (await fetch('/assets/logo-lockup.png?v=6')).arrayBuffer();
    zip.file('xl/media/image1.png', png);
    let ct = await zip.file('[Content_Types].xml').async('string');
    if(ct.indexOf('Extension="png"')<0) ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    zip.file('[Content_Types].xml', ct);
    const RELNS='http://schemas.openxmlformats.org/package/2006/relationships';
    const DRAW='http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
    const IMG='http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
    let rels = null;
    const relsPart = zip.file('xl/worksheets/_rels/sheet1.xml.rels');
    if(relsPart) rels = await relsPart.async('string');
    rels = rels
      ? rels.replace('</Relationships>', '<Relationship Id="rIdDrawing1" Type="'+DRAW+'" Target="../drawings/drawing1.xml"/></Relationships>')
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="'+RELNS+'"><Relationship Id="rIdDrawing1" Type="'+DRAW+'" Target="../drawings/drawing1.xml"/></Relationships>';
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', rels);
    let sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    if(sheet.indexOf('xmlns:r')<0) sheet = sheet.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    sheet = sheet.replace('</worksheet>', '<drawing r:id="rIdDrawing1"/></worksheet>');
    zip.file('xl/worksheets/sheet1.xml', sheet);
    const emu = px => Math.round(px*9525);
    zip.file('xl/drawings/drawing1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>'+emu(10)+'</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>'+emu(4)+'</xdr:rowOff></xdr:from>'
      + '<xdr:ext cx="'+emu(46)+'" cy="'+emu(60)+'"/>'
      + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="BBTH logo"/><xdr:cNvPicPr/></xdr:nvPicPr>'
      + '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
      + '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>'
      + '<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>');
    zip.file('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="'+RELNS+'"><Relationship Id="rId1" Type="'+IMG+'" Target="../media/image1.png"/></Relationships>');
    return await zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
  }catch(e){ return out; } // logo is branding, not data - the export still works without it
}
async function regExportChart(){
  if(!REG_ROWS.length){ $('regMsg').textContent='Nothing to export.'; return; }
  // Deep 10 Nov: default aaj se aage; From/To selection limits the chart. A booking
  // matches when ANY of its event dates falls in range; its full date text is kept.
  // 'Today' is the admin's local day (Asia/Calcutta), computed at export time.
  const today = new Date(); today.setHours(0,0,0,0);
  const fromEl = $('regChartFrom');
  if(fromEl && !fromEl.value){ const t0 = new Date(); fromEl.value = t0.getFullYear() + '-' + String(t0.getMonth()+1).padStart(2,'0') + '-' + String(t0.getDate()).padStart(2,'0'); } // show the active 'from today' default instead of a hidden blank
  const fromV = ($('regChartFrom') || {}).value || '', toV = ($('regChartTo') || {}).value || '';
  const fromT = fromV ? new Date(fromV + 'T00:00:00').getTime() : today.getTime();
  const toT = toV ? new Date(toV + 'T23:59:59').getTime() : Infinity;
  const rows=REG_ROWS.filter(r=>{
    if(regTerm(r)) return false; // Deep 10 Nov voice: completed/cancelled never go into the download; records stay in the register
    const ds=regParseDates(r.eventDates||'');
    if(!ds.length) return false; // no parseable date - cannot place in a date-ranged chart
    return ds.some(t=>t>=fromT && t<=toT);
  }).sort((a,b)=>{
    const da=regParseDates(a.eventDates||''), db=regParseDates(b.eventDates||'');
    const ka=da.length?Math.min.apply(null,da):Infinity, kb=db.length?Math.min.apply(null,db):Infinity;
    if(ka!==kb) return ka-kb;
    return String(a.venue||'').localeCompare(String(b.venue||''));
  });
  const fmtD = t => { const d=new Date(t); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); };
  const rangeNote = (fromV || toV)
    ? (' (' + (fromV?fmtD(new Date(fromV+'T00:00:00').getTime()):fmtD(today.getTime())) + ' - ' + (toV?fmtD(new Date(toV+'T00:00:00').getTime()):'onwards') + ')')
    : '';
  if(!rows.length){ $('regMsg').textContent='No bookings in this date range.'; return; }
  const MONS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const seen=[];
  rows.forEach(r=>{ regParseDates(r.eventDates||'').forEach(t=>{ const d=new Date(t); const k=d.getFullYear()+'-'+d.getMonth(); if(!seen.some(x=>x.k===k)) seen.push({k,y:d.getFullYear(),m:d.getMonth()}); }); });
  seen.sort((a,b)=>a.y-b.y||a.m-b.m);
  let span='';
  if(seen.length){
    const yrs=[...new Set(seen.map(x=>x.y))];
    span = yrs.length===1 ? (' - '+seen.map(x=>MONS[x.m]).join(' & ')+' '+yrs[0]) : (' - '+seen.map(x=>MONS[x.m]+' '+x.y).join(' & '));
  }
  const GREEN='FF1E3D2F', GOLD='FFC9A227', WHITE='FFFFFFFF';
  const PASTELS=['FFFFFFFF','FFE7F2E4','FFFCE8D5','FFE4EDF7','FFF1E6F5','FFFBE7EE','FFFFF7D1','FFE0F2EE'];
  const border={top:{style:'thin',color:{rgb:'FFCFC6B4'}},bottom:{style:'thin',color:{rgb:'FFCFC6B4'}},left:{style:'thin',color:{rgb:'FFCFC6B4'}},right:{style:'thin',color:{rgb:'FFCFC6B4'}}};
  const dateKey=r=>{const ds=regParseDates(r.eventDates||'');return ds.length?String(Math.min.apply(null,ds)):'zz'+String(r.venue||'');};
  const ws=XLSX.utils.aoa_to_sheet([['BBTH WEDDING PLANNER'],['Booking Chart'+span+rangeNote],[],['No.','Date','Venue / Location','Function','Setup / Scope']]);
  ws['A1'].s={fill:{fgColor:{rgb:GREEN}},font:{bold:true,sz:18,color:{rgb:WHITE}},alignment:{horizontal:'center',vertical:'center'}};
  ws['A2'].s={fill:{fgColor:{rgb:GREEN}},font:{sz:12.5,color:{rgb:WHITE}},alignment:{horizontal:'center',vertical:'center'}};
  ['B1','C1','D1','E1','B2','C2','D2','E2'].forEach(a=>{ ws[a]={t:'s',v:'',s:{fill:{fgColor:{rgb:GREEN}}}}; });
  ['A3','B3','C3','D3','E3'].forEach(a=>{ ws[a]={t:'s',v:'',s:{fill:{fgColor:{rgb:GOLD}}}}; });
  ['A4','B4','C4','D4','E4'].forEach(a=>{ ws[a].s={fill:{fgColor:{rgb:GREEN}},font:{bold:true,sz:11.5,color:{rgb:WHITE}},border,alignment:{horizontal:'center',vertical:'center'}}; });
  const grpColor={}; let gi=0;
  rows.forEach(r=>{ const k=dateKey(r); if(!(k in grpColor)){ grpColor[k]=PASTELS[gi%PASTELS.length]; gi++; } });
  rows.forEach((r,i)=>{
    const fill=grpColor[dateKey(r)];
    const vals=[i+1, regOrdDate(r.eventDates), r.venue||'', r.eventType||'', r.notes||''];
    vals.forEach((v,c)=>{
      const cell=XLSX.utils.encode_cell({r:4+i,c});
      ws[cell]={t:(typeof v==='number'?'n':'s'), v, s:{fill:{fgColor:{rgb:fill}},border,font:{sz:10.5},alignment:{vertical:'center',wrapText:c>0,horizontal:c===0?'center':'left'}}};
    });
  });
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}];
  ws['!ref']='A1:E'+(4+rows.length); // cells beyond !ref are dropped on write
  // one printed A4 portrait page wide: total ~90 char-units + narrow margins, explicit
  // row heights so wrapped multi-date rows never overlap.
  ws['!margins']={left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.2,footer:0.2};
  ws['!cols']=[{wch:5},{wch:19},{wch:30},{wch:20},{wch:16}];
  const rh=[{hpt:30},{hpt:18},{hpt:5},{hpt:20}];
  rows.forEach((r,i)=>{ const long=(String(r.eventDates||'').length>22||String(r.venue||'').length>30); rh.push({hpt:long?30:18}); });
  ws['!rows']=rh;
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Booking Chart');
  $('regMsg').textContent='Preparing booking chart...';
  const out=await xlsxEmbedChartLogo(XLSX.write(wb,{type:'array',bookType:'xlsx'}));
  $('regMsg').textContent='';
  const aEl=document.createElement('a');
  aEl.href=URL.createObjectURL(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  aEl.download='bbth-booking-chart-'+new Date().toISOString().slice(0,10)+'.xlsx';
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(()=>URL.revokeObjectURL(aEl.href),5000);
}
$('regExportChart').addEventListener('click', regExportChart);


// ---------- unlimited undo/redo for template + register editors (Deep 25 Oct 18:23) ----------
const UNDO2 = { past: [], future: [], pendKey: null, pendSnap: null };
function adminSnapNow(){ return { settings: JSON.parse(JSON.stringify(settings)), tc: TC_LINES.slice(), reg: JSON.parse(JSON.stringify(REG_ROWS)) }; }
function admKey(t){
  const d = (t && t.dataset) || {};
  if(d.text) return 't:' + d.text;
  if(d.comp) return 'c:' + d.comp;
  if(d.svc !== undefined) return 's:' + d.svc;
  if(d.extname !== undefined) return 'en:' + d.extname;
  if(d.extrate !== undefined) return 'er:' + d.extrate;
  if(d.color) return 'col:' + d.color;
  if(d.tcline !== undefined) return 'tc:' + d.tcline;
  return null;
}
function snapAdmin(){ UNDO2.past.push(adminSnapNow()); /* Deep 26 Oct: unlimited undo - no step cap */ UNDO2.future.length = 0; updUndo2(); }
function admTyped(t){
  const key = admKey(t);
  if(key === null || UNDO2.pendKey !== key || !UNDO2.pendSnap) return;
  UNDO2.past.push(UNDO2.pendSnap); /* Deep 26 Oct: unlimited undo - no step cap */
  UNDO2.future.length = 0; UNDO2.pendSnap = null; updUndo2();
}
document.addEventListener('focusin', e => {
  const key = admKey(e.target);
  if(key !== null){ UNDO2.pendKey = key; UNDO2.pendSnap = adminSnapNow(); }
}, true);
async function admRestore(s, label){
  const regChanged = JSON.stringify(s.reg) !== JSON.stringify(REG_ROWS);
  settings = JSON.parse(JSON.stringify(s.settings));
  TC_LINES = s.tc.slice();
  REG_ROWS = JSON.parse(JSON.stringify(s.reg));
  fillAll();
  if($('tab-agreement') && !$('tab-agreement').classList.contains('hidden')) tcRender();
  renderRegSheet();
  if(regChanged){ try { await regPersist(); } catch(e){ if(!(e && e.message === 'conflict')) toast('Sheet sync failed after undo - check the register', true); } }
  admFlash(label);
}
async function doUndo2(){
  const e0 = UNDO2.past.pop(); if(!e0) return;
  UNDO2.future.push(adminSnapNow());
  await admRestore(e0, 'Undone' + (UNDO2.past.length ? ' - ' + UNDO2.past.length + ' more step' + (UNDO2.past.length === 1 ? '' : 's') + ' to undo' : ''));
  updUndo2();
}
async function doRedo2(){
  const e0 = UNDO2.future.pop(); if(!e0) return;
  UNDO2.past.push(adminSnapNow());
  await admRestore(e0, 'Redone');
  updUndo2();
}
function admFlash(msg){
  let p = document.getElementById('admUndoPill');
  if(!p){
    p = document.createElement('div'); p.id = 'admUndoPill';
    p.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#264a3b;color:#fff;padding:9px 18px;border-radius:999px;font-size:13.5px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;transition:opacity .3s';
    document.body.appendChild(p);
  }
  p.textContent = msg; p.style.opacity = '1';
  clearTimeout(admFlash._t);
  admFlash._t = setTimeout(() => { p.style.opacity = '0'; }, 2600);
}
function updUndo2(){
  document.querySelectorAll('.adm-u').forEach(x => { x.disabled = !UNDO2.past.length; });
  document.querySelectorAll('.adm-r').forEach(x => { x.disabled = !UNDO2.future.length; });
}
function injectUndoBar(panelId){
  const p = $(panelId); if(!p || p.querySelector('.adm-undo-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'adm-undo-bar';
  bar.style.cssText = 'display:flex;gap:8px;margin:0 0 10px';
  bar.innerHTML = '<button type="button" class="small-btn adm-u" disabled>&#8617; Undo</button><button type="button" class="small-btn adm-r" disabled>&#8618; Redo</button>';
  bar.querySelector('.adm-u').addEventListener('click', doUndo2);
  bar.querySelector('.adm-r').addEventListener('click', doRedo2);
  p.insertBefore(bar, p.firstChild);
}
injectUndoBar('tab-template'); injectUndoBar('tab-register'); injectUndoBar('tab-agreement'); injectUndoBar('tab-services'); injectUndoBar('tab-company');

// ---------- post-save version history (Deep 25 Oct 18:23: bring back an old saved version) ----------
function injectVersionBar(panelId, listPath, getPath, restorePath, afterRestore, label, livePath, diffFn){
  const p = $(panelId); if(!p || p.querySelector('.adm-ver-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'adm-ver-bar';
  bar.style.cssText = 'display:flex;gap:8px;margin:0 0 12px;align-items:center;flex-wrap:wrap';
  bar.innerHTML = '<select class="adm-ver-list" style="min-width:280px;padding:7px 10px;border:1px solid #d8dfd2;border-radius:9px;font-size:13px"></select>'
    + '<button type="button" class="small-btn adm-ver-restore">Restore old saved version</button>';
  const anchor = p.querySelector('.adm-undo-bar');
  p.insertBefore(bar, anchor ? anchor.nextSibling : p.firstChild);
  const sel = bar.querySelector('.adm-ver-list');
  let liveAtLoad = null;
  // Version history is admin-only. api() logs the user out on ANY 401, which
  // would kick staff out of the whole panel - probe quietly instead.
  const quiet = (p) => fetch(p, { headers: { 'authorization': 'Bearer ' + TOKEN } });
  const load = async () => {
    try {
      const r = await quiet(listPath);
      if(!r.ok){ bar.style.display = 'none'; return; } // not permitted for this role
      const d = await r.json();
      sel.innerHTML = '<option value="">' + label + ': bring back an old saved version (last 25 saves kept)...</option>'
        + (d.versions || []).map(v => '<option value="' + v.i + '">' + esc(new Date(v.at).toLocaleString('en-IN')) + ' - saved by ' + esc(v.by || '?') + '</option>').join('');
      if(livePath){ const lr = await quiet(livePath); liveAtLoad = lr.ok ? await lr.text() : null; }
    } catch(e) {}
  };
  load();
  sel.addEventListener('focus', load);
  bar.querySelector('.adm-ver-restore').addEventListener('click', async () => {
    if(sel.value === ''){ toast('Pick a saved version first', true); return; }
    const r = await quiet(getPath + '?i=' + sel.value);
    if(!r.ok){ toast('Could not load that version', true); return; }
    const d = await r.json();
    // stale guard: if the live data changed since this list was loaded, someone
    // saved in between - refuse silently rolling their work back.
    let liveParsed = null;
    if(livePath){
      const now = await quiet(livePath);
      const nowTxt = now.ok ? await now.text() : null;
      if(liveAtLoad !== null && nowTxt !== liveAtLoad){
        toast(label + ' changed since this list was loaded - someone saved in between. The list has been refreshed - review before restoring.', true);
        if(label === 'Register') loadRegister();
        load();
        return;
      }
      try { liveParsed = JSON.parse(nowTxt); } catch(e) {}
    }
    const diff = diffFn ? diffFn(d.value, liveParsed) : '';
    if(!(await admConfirm('Bring back the version "' + sel.options[sel.selectedIndex].text + '"?\n\n' + diff + '\nThe CURRENT state will also stay recoverable in this list (last 25 saves kept).', { okText:'Restore' }))) return;
    // Server-side atomic guard: the worker rejects the restore if the live
    // value changed after our review, even if a save lands while this confirm
    // was open (client refetch alone is TOCTOU).
    const rr = await fetch(restorePath, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ i: parseInt(sel.value, 10), base: liveParsed !== null ? JSON.stringify(liveParsed) : null }) });
    if(rr.status === 409){ toast(label + ' changed since this list was loaded - someone saved in between. The list has been refreshed - review before restoring.', true); if(label === 'Register') loadRegister(); load(); return; }
    if(!rr.ok){ toast('Restore failed', true); return; }
    const rd = await rr.json();
    await afterRestore(rd);
    toast(label + ' restored. The previous state stays in this list.');
    load();
  });
}
function diffRegRows(value, liveParsed){
  const oldRows = (value && value.rows) || [];
  const curRows = (liveParsed && liveParsed.rows) || REG_ROWS;
  const cur = new Map(curRows.map(r => [r.id, r]));
  const old = new Map(oldRows.map(r => [r.id, r]));
  const addBack = oldRows.filter(r => !cur.has(r.id)).map(r => r.name || r.id);
  const remove = curRows.filter(r => !old.has(r.id)).map(r => r.name || r.id);
  const changed = oldRows.filter(r => cur.has(r.id) && JSON.stringify(cur.get(r.id)) !== JSON.stringify(r)).map(r => r.name || r.id);
  const L = [];
  if(addBack.length) L.push('Adds back ' + addBack.length + ' removed entr' + (addBack.length === 1 ? 'y' : 'ies') + ': ' + addBack.slice(0, 5).join(', ') + (addBack.length > 5 ? '...' : ''));
  if(remove.length) L.push('Removes ' + remove.length + ' later entr' + (remove.length === 1 ? 'y' : 'ies') + ': ' + remove.slice(0, 5).join(', ') + (remove.length > 5 ? '...' : ''));
  if(changed.length) L.push('Reverts edits on ' + changed.length + ' entr' + (changed.length === 1 ? 'y' : 'ies') + ': ' + changed.slice(0, 5).join(', ') + (changed.length > 5 ? '...' : ''));
  return L.length ? L.join('\n') : 'No difference from the current sheet.';
}
function diffSettings(value, liveParsed){
  const v = value || {};
  const cur = liveParsed || settings;
  const keys = new Set(Object.keys(cur).concat(Object.keys(v)));
  const n = [...keys].filter(k => JSON.stringify(cur[k]) !== JSON.stringify(v[k])).length;
  return n ? ('Changes ' + n + ' settings section' + (n === 1 ? '' : 's') + ' back to that save.') : 'No difference from the current settings.';
}
injectVersionBar('tab-register', '/api/client-register/history', '/api/client-register/history-get', '/api/client-register/restore', async (rd) => {
  REG_ROWS = (rd.value && rd.value.rows) || [];
  renderRegSheet();
}, 'Register', '/api/client-register', diffRegRows);
injectVersionBar('tab-template', '/api/settings/versions', '/api/settings/version-get', '/api/settings/restore', async (rd) => {
  settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), rd.value || {});
  fillAll();
}, 'Template', '/api/settings', diffSettings);
window.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey)) return;
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const k = (e.key || '').toLowerCase();
  if(k === 'z' && !e.shiftKey){ e.preventDefault(); doUndo2(); }
  else if(k === 'y' || (k === 'z' && e.shiftKey)){ e.preventDefault(); doRedo2(); }
});

// v18: deep link /admin/#<tab> (e.g. staff portal "Manage Users" -> #users)
(function(){
  function openHashTab(){
    const h = (location.hash || '').slice(1); if(!h) return false;
    const b = document.querySelector('.side-nav [data-tab="' + h + '"]') || document.querySelector('[data-tab="' + h + '"]');
    if(b){ b.click(); return true; }
    return false;
  }
  let tries = 0;
  const t = setInterval(function(){ if(openHashTab() || ++tries > 40) clearInterval(t); }, 250);
  window.addEventListener('hashchange', openHashTab);
})();
