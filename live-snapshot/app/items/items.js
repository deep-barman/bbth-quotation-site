// BBTH Essential Items - selection catalogue + letterhead PDF output.
// DRAFT fixture data (fixture-catalogue.json, local file - NOT D1). No writes anywhere.
// Output: ONLY selected items, with photo slot, qty, colour, size - per Deep 12:43-12:44.
// Letterhead: exact existing Brief/Agreement inner-page format via js/pdf.js builders.
(function(){
  function token(){ return sessionStorage.getItem('bbth-admin-token') || localStorage.getItem('bbth-admin-token') || ''; }
  async function loadBrand(){
    try{
      const r = await fetch('/api/settings', { headers: { 'authorization': 'Bearer ' + token() }, cache: 'no-store' });
      if(!r.ok) return;
      const s = await r.json();
      if(s && typeof s === 'object' && Object.keys(s).length && window.BBTH_SETTINGS){
        window.BBTH_SETTINGS = Object.assign(window.BBTH_SETTINGS, s);
        if(s.texts) window.BBTH_SETTINGS.texts = Object.assign({}, s.texts);
        const tg = document.querySelector('.tg-ui');
        if(tg && window.BBTH_SETTINGS.texts && window.BBTH_SETTINGS.texts.tagline) tg.textContent = window.BBTH_SETTINGS.texts.tagline;
      }
    }catch(e){ /* defaults apply */ }
  }
  loadBrand();
  const SHARED_OK = true; // photo API is same-origin on every host now (staging + production)
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

  // Cross-tab logout guard (shared, /js/crosstab.js). Adopt first so a handoff from a
  // post-logout session carries its fresh login time, THEN check the signal.
  handoffAdopt();
  if(BBTHXTab.install()) return;
  const main = document.getElementById('main');
  if(!token()){
    main.innerHTML = '<div class="gate"><img src="/assets/logo-lockup-dark.png?v=6" alt="BBTH"><h2>Login required</h2><p>This tool is private. Log in from the staff portal first.</p><a class="btn-solid" href="/app/">Go to login</a></div>';
    return;
  }
  const sel = new Map(); // key -> {name, cat, group, qty, colour, size}
  let autoNames = []; // quotation line-item names from the Create Catalogue handoff
  const sheet = { client:'', phn:'', location:'', event:'', qno:'' };
  // Deep 26 Oct: Create Catalogue from a quotation row carries that quotation's client
  // context via a one-time localStorage handoff (30s TTL, delete-on-read) - never the URL.
  try {
    if(new URLSearchParams(location.search).get('from') === 'quote'){
      const raw = localStorage.getItem('bbth-cat-handoff');
      if(raw){
        const h = JSON.parse(raw);
        if(h && (Date.now() - (h.ts || 0)) < 30000){
          sheet.client = h.client || ''; sheet.phn = h.phn || '';
          sheet.location = h.location || ''; sheet.event = h.event || '';
          sheet.qno = h.qno || ''; // quotation number carries through to the catalogue letterhead
          if(Array.isArray(h.items)) autoNames = h.items.map(x => (x && typeof x === 'object') ? { n: String(x.n || ''), qty: x.qty || '', size: x.size || '' } : { n: String(x), qty: '', size: '' });
        }
        localStorage.removeItem('bbth-cat-handoff');
      }
    }
  } catch(e){}
  let searchQ = '';
  let sortMode = 'default'; // Deep 26 Oct: sort option in catalogue picker
  let DATA = null;

  window.ItemsStore.loadCatalogue().then(({data})=>{ DATA=data; autoSelectFromQuote(); render(); });
  // cross-device freshness: when another device saved catalogue changes, reload
  // quietly (selections are kept - they are keyed by item name). Focus/visibility
  // driven, throttled to one check per minute - no background polling timer.
  if(window.ItemsStore.startFocusRefresh) window.ItemsStore.startFocusRefresh(()=>{
    window.ItemsStore.loadCatalogue().then(({data})=>{ DATA = data; render(); });
  });

  function escH(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function key(cat,n){ return cat+'|'+n; }
  function normN(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }

  // 31 Oct: reliable PDF delivery - busy state, visible build errors, tap-to-open
  // fallback (phones can silently drop programmatic downloads), native share in the APK.
  function pdfNote(html, isErr){
    let n = document.getElementById('pdfReadyNote');
    if(!n){ n = document.createElement('div'); n.id = 'pdfReadyNote';
      n.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:60;color:#fff;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      document.body.appendChild(n); }
    n.style.background = isErr ? '#8a2f2f' : '#264a3b';
    n.innerHTML = html + ' <button type="button" id="pdfReadyX" style="float:right;background:none;border:0;color:#fff;font-size:16px;cursor:pointer">&times;</button>';
    n.querySelector('#pdfReadyX').addEventListener('click', ()=>n.remove());
    clearTimeout(pdfNote._t); pdfNote._t = setTimeout(()=>{ const m = document.getElementById('pdfReadyNote'); if(m) m.remove(); }, isErr ? 15000 : 45000);
  }
  // 31 Oct (phone fix): live progress on the busy button - a full-catalogue
  // build on a phone takes minutes, and a frozen label reads as a hang.
  let pdfProgress = () => {};
  function reportPdf(t){ try { pdfProgress(t); } catch(e){} }
  // 31 Oct (phone fix): bounded page render. html2canvas cannot be cancelled, so a
  // stall is raced against a timeout; on a render stall the loop ABORTS with an
  // honest error - we never start a second render while one is stuck, and the
  // clone DOM html2canvas left behind is removed so memory stays bounded.
  function cleanupH2cClones(){ try { document.querySelectorAll('.html2canvas-container').forEach(n => n.remove()); } catch(e){} }
  async function renderPageCanvas(el, pageNo, total){
    const imgs = Array.prototype.slice.call(el.querySelectorAll('img'));
    const decodeWait = Promise.all(imgs.map(im => (im.complete && im.naturalWidth) ? 1 : im.decode().catch(() => 0)));
    // photos: wait up to 20s, then proceed anyway - html2canvas applies its own image timeout
    await Promise.race([ decodeWait, new Promise(res => setTimeout(res, 20000)) ]);
    cleanupH2cClones(); // drop stale clone DOM from any earlier attempt before rendering
    const render = html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#f6f4ea', logging:false });
    const giveUp = new Promise((_, rej) => setTimeout(() => rej(new Error('Page ' + pageNo + ' of ' + total + ' did not finish rendering. Nothing was downloaded - please tap Download PDF again to retry.')), 120000));
    try { return await Promise.race([render, giveUp]); }
    catch(e){ cleanupH2cClones(); throw e; }
  }
  async function savePdf(pdf, name){
    reportPdf('Finishing PDF\u2026');
    const blob = pdf.output('blob');
    if(window.BBTHSharePDF){ try { await window.BBTHSharePDF(blob, name); pdfNote('PDF shared: ' + escH(name), false); return; } catch(e){ /* fall through to browser download */ } }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    pdfNote('PDF ready - if the download did not start, <a href="' + url + '" target="_blank" rel="noopener" style="color:#ffe9a8">tap here to open ' + escH(name) + '</a>.', false);
    setTimeout(()=>URL.revokeObjectURL(url), 120000);
  }
  // auto-select a quotation article only when it matches EXACTLY ONE catalogue item
  // (normalized name). Ambiguous or unmatched names stay unticked - never a silent wrong pick.
  let unmatchedAuto = [];
  // Deep 26 Oct 14:10: auto-fill must tick the PHYSICAL catalogue articles, not the
  // quotation's own Services/Extras entries (those two categories come from the services
  // fixture and are excluded here). A line matches when its normalized name equals exactly
  // one catalogue item, or when one multi-word catalogue item's full name sits inside the
  // line's words (e.g. "Round Table Setup" -> "Round Table"). Anything ambiguous or absent
  // is reported under the selection for manual picking - never a silent wrong tick.
  function autoSelectFromQuote(){
    unmatchedAuto = [];
    if(!autoNames.length || !DATA || !Array.isArray(DATA.categories)) return;
    const byName = {};
    const pool = [];
    DATA.categories.forEach(cat => {
      if(cat.name === 'Services' || cat.name === 'Extras') return;
      (cat.items||[]).forEach(it => {
        if(!it || !it.n) return;
        const nk = normN(it.n); (byName[nk] = byName[nk] || []).push({ cat: cat.name, it });
        pool.push({ cat: cat.name, it, nk, t: nk.split(' ') });
      });
    });
    autoNames.forEach(entry => {
      const nm = entry.n, nn = normN(nm), ntok = nn.split(' ');
      let m = byName[nn] || [];
      if(m.length !== 1){
        m = pool.filter(p => p.t.length >= 2 && p.t.every(w => ntok.includes(w)));
      }
      if(m.length === 1){
        const c = m[0], k = key(c.cat, c.it.n);
        if(!sel.has(k)) sel.set(k, { name: c.it.n, cat: c.cat, group: c.it.g || 'c', qty: entry.qty, colour: '', size: entry.size }); // quotation qty/size carried; colour has no source
      } else {
        unmatchedAuto.push(nm);
      }
    });
  }

  function flagsHtml(it){
    let out='';
    (it.f||[]).forEach(f=>{
      if(f.indexOf('pm:')===0) out+='<span class="bdg pm" title="'+escH(f)+'">match?</span>';
      else if(f==='unreadable') out+='<span class="bdg u" title="Unclear on sheet - asked Deep">?</span>';
      else if(f==='asked Deep') out+='<span class="bdg u" title="Asked Deep">?</span>';
      else if(f.indexOf('name/photo mismatch')===0) out+='<span class="bdg u" title="'+escH(f)+'">!</span>';
    });
    return out;
  }

  function render(){
    // grouping UI removed per Deep 13:13 - sirf ordinary categories
    let html='<div class="sheetbar"><div class="shf"><label>Client <small>(optional)</small></label><input id="shClient" value="'+escH(sheet.client)+'" placeholder="Client name"></div>'
      +'<div class="shf"><label>Phn No. <small>(optional)</small></label><input id="shPhn" value="'+escH(sheet.phn)+'"></div>'
      +'<div class="shf"><label>Venue</label><input id="shLoc" value="'+escH(sheet.location)+'" placeholder="Venue / location"></div>'
      +'<div class="shf"><label>Event date(s)</label><input id="shEvent" value="'+escH(sheet.event)+'" placeholder="e.g. 25 Dec, 26 Dec 2026"></div></div>';

    html+='<div class="searchbar" style="display:flex;gap:8px;align-items:center"><input id="q" type="search" placeholder="Search all items..." value="'+escH(searchQ)+'" style="flex:1">'
      +'<select id="sortSel" style="padding:7px 8px;border:1.5px solid #cfd8c9;border-radius:9px;font:inherit;font-size:13px;background:#fff">'
      +'<option value="default"'+(sortMode==='default'?' selected':'')+'>Default order</option>'
      +'<option value="az"'+(sortMode==='az'?' selected':'')+'>Name A-Z</option>'
      +'<option value="za"'+(sortMode==='za'?' selected':'')+'>Name Z-A</option></select>'
      +'<button id="selAllGlobal" type="button" style="padding:7px 10px;border:1.5px solid #cfd8c9;border-radius:9px;background:#fff;font:inherit;font-size:13px;white-space:nowrap;cursor:pointer">'+((DATA.categories.reduce((n,c)=>n+c.items.length,0)>0 && sel.size>=DATA.categories.reduce((n,c)=>n+c.items.length,0))?'Clear whole catalogue':'Select whole catalogue')+'</button></div>';

    let poolHtml='';
    const jumpCats=[];
    const q=searchQ.trim().toLowerCase();
    DATA.categories.forEach(cat=>{
      let items = q ? cat.items.filter(it=>it.n.toLowerCase().includes(q)) : cat.items;
      if(sortMode!=='default') items = items.slice().sort((a,b)=> sortMode==='az' ? a.n.localeCompare(b.n) : b.n.localeCompare(a.n));
      if(!items.length) return;
      const visItems=items;
      const allOn=visItems.length>0 && visItems.every(it=>sel.has(key(cat.name,it.n)));
      jumpCats.push(cat.name);
      poolHtml+='<div class="cat" data-catblock="'+escH(cat.name)+'"><h3>'+escH(cat.name)+'<button class="selall" data-cat="'+escH(cat.name)+'">'+(allOn?'Clear all':'Select all')+'</button></h3><div class="pgrid">'
        + items.map(it=>{
            const k=key(cat.name,it.n);
            // Deep 10 Nov 17:28 + 17:38 voice: grid-level photo cards - big photo, smaller name
            return '<button class="pcard'+(sel.has(k)?' on':'')+'" data-k="'+escH(k)+'"><span class="pph"></span><span class="pnm">'+escH(it.n).replace(/\//g,'/<wbr>')+'</span></button>'; // Deep 26 Oct 14:10: match?/?//* tags removed from view; flags stay in data
          }).join('')
        +'</div></div>';
    });
    // mobile quick-jump (Deep 26 Oct): compact sticky bar - category dropdown + Selected Items shortcut; shown only <=640px by CSS
    const jump = jumpCats.length>3 ? '<div class="catjump"><select class="cj-sel" aria-label="Jump to category"><option value="">Jump to category&hellip;</option>'+jumpCats.map(n=>'<option value="'+escH(n)+'">'+escH(n)+'</option>').join('')+'</select><button type="button" class="cj-out">Selected Items (<span class="cj-n">'+sel.size+'</span>)</button></div>' : '';
    // literal "undefined" fix: render the pool note only when the data actually has one
    html+='<div class="cols"><div class="pool">'+jump+poolHtml+(DATA.note?'<div class="note">'+escH(DATA.note)+'</div>':'')+'</div>';

    html+='<div class="outwrap"><div class="outhead"><h2>Selected Items (<span id="selN">'+sel.size+'</span>)</h2>'
      +'<p class="outsub">Only the selected items will appear in the PDF - with photo, qty, colour and size.</p>'
      +(unmatchedAuto.length ? '<p class="outsub" style="color:#8a6d1f"><b>No clear catalogue match - pick manually:</b> '+escH(unmatchedAuto.join(', '))+'</p>' : '')
      +'</div><div id="outlist">';
    if(!sel.size){ html+='<p class="empty">No items selected - click items on the left.</p>'; }
    sel.forEach((v,k)=>{
      html+='<div class="outrow">'
        +'<div class="ph" data-k="'+escH(k)+'">photo</div>'
        +'<div class="mid"><div class="nm">'+escH(v.name)+'</div><div class="gc">'+escH(v.cat)+'</div></div>'
        +'<button class="rm" data-k="'+escH(k)+'" title="Remove">x</button>'
        +'<div class="flds"><input class="in q" placeholder="Qty" value="'+escH(v.qty||'')+'" data-k="'+escH(k)+'" data-f="qty">'
        +'<input class="in c" placeholder="Colour" value="'+escH(v.colour||'')+'" data-k="'+escH(k)+'" data-f="colour">'
        +'<input class="in s" placeholder="Size" value="'+escH(v.size||'')+'" data-k="'+escH(k)+'" data-f="size"></div></div>';
    });
    html+='</div><div class="shf" style="margin:10px 0 6px"><label>PDF design</label><select id="pdfTpl" class="in" style="width:100%;padding:10px">'
      +'<option value="grid">Grid Cards (modern, photo cards)</option>'
      +'<option value="table">Classic Table (letterhead)</option>'
      +'<option value="list">Compact List (names only, dense)</option>'
      +'<option value="tick">Tick Sheet (checkbox + photo + Qty)</option></select></div>'
      +'<button id="btnPdf" class="btn-solid big" '+(sel.size?'':'disabled')+'>Download PDF</button>'
      +'<p class="pdfnote">Same letterhead as the Quotation/Agreement PDF. Photos uploaded in the Catalogue Editor appear here and in the PDF ('+(SHARED_OK?'saved on the site - same on every device':'saved on this device only')+').</p></div></div>';
    main.innerHTML=html;

    ['shClient','shPhn','shLoc','shEvent'].forEach((id,i)=>{
      const f=['client','phn','location','event'][i];
      document.getElementById(id).addEventListener('input',e=>{ sheet[f]=e.target.value; });
    });

    main.querySelectorAll('.selall').forEach(b=>b.addEventListener('click',()=>{
      const catName=b.dataset.cat;
      const cat=DATA.categories.find(c=>c.name===catName);
      if(!cat) return;
      const qv=searchQ.trim().toLowerCase();
      const vis=qv?cat.items.filter(it=>it.n.toLowerCase().includes(qv)):cat.items;
      const allOn=vis.length>0 && vis.every(it=>sel.has(key(catName,it.n)));
      vis.forEach(it=>{
        const k=key(catName,it.n);
        if(allOn) sel.delete(k);
        else if(!sel.has(k)) sel.set(k,{name:it.n, cat:catName, group:it.g||'c', qty:'', colour:'', size:''});
      });
      render();
    }));
    const cjSel=main.querySelector('.cj-sel');
    if(cjSel) cjSel.addEventListener('change',()=>{
      const n=cjSel.value; cjSel.value='';
      const t=[...main.querySelectorAll('.cat')].find(el=>el.dataset.catblock===n);
      if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
    });
    const cjOut=main.querySelector('.cj-out');
    if(cjOut) cjOut.addEventListener('click',()=>{
      const t=main.querySelector('.outwrap');
      if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
    });
    const gall = document.getElementById('selAllGlobal');
    if(gall) gall.addEventListener('click', ()=>{
      const total = DATA.categories.reduce((n,c)=>n+c.items.length,0);
      if(total > 0 && sel.size >= total){ sel.clear(); }
      else DATA.categories.forEach(cat=>cat.items.forEach(it=>{ const k = key(cat.name, it.n); if(!sel.has(k)) sel.set(k, { name: it.n, cat: cat.name, group: it.g||'c', qty:'', colour:'', size:'' }); }));
      render();
    });
    main.querySelectorAll('.pcard').forEach(b=>b.addEventListener('click',()=>{
      const k=b.dataset.k;
      if(sel.has(k)) sel.delete(k);
      else {
        const cat=k.split('|')[0], n=k.slice(cat.length+1);
        const it=(DATA.categories.find(c=>c.name===cat)||{items:[]}).items.find(x=>x.n===n)||{};
        sel.set(k,{name:n, cat:cat, group:it.g||'c', qty:'', colour:'', size:''});
      }
      render();
    }));
    main.querySelectorAll('.in').forEach(i=>i.addEventListener('input',()=>{ const v=sel.get(i.dataset.k); if(v) v[i.dataset.f]=i.value; }));
    main.querySelectorAll('.rm').forEach(b=>b.addEventListener('click',()=>{ sel.delete(b.dataset.k); render(); }));
    const qEl=document.getElementById('q');
    if(qEl){ let qt=null; qEl.addEventListener('input',()=>{ clearTimeout(qt); qt=setTimeout(()=>{ searchQ=qEl.value; render(); const nq=document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length,nq.value.length); },250); }); }
    const sEl = document.getElementById('sortSel');
    if(sEl){ sEl.addEventListener('change',()=>{ sortMode = sEl.value; render(); }); }
    // Deep 26 Oct: refresh pulls the latest catalogue; current selection + client fields stay
    const rf = document.getElementById('btnRefresh');
    if(rf) rf.addEventListener('click', () => {
      rf.disabled = true;
      window.ItemsStore.loadCatalogue().then(({data}) => {
        DATA = data; render();
        rf.disabled = false; rf.textContent = 'Refreshed'; setTimeout(() => { rf.textContent = 'Refresh'; }, 2000);
      }).catch(() => { rf.disabled = false; });
    });
    document.getElementById('btnPdf').addEventListener('click', async (ev)=>{
      const b = ev.currentTarget;
      if(b.disabled) return;
      b.disabled = true; const label = b.textContent; b.textContent = 'Building PDF\u2026';
      let lastAt = Date.now(), warned = false;
      pdfProgress = (t) => { lastAt = Date.now(); b.textContent = t; };
      // honest watchdog: the build keeps running; if a phase stalls >90s we
      // say so instead of looking frozen - the button only resets when the
      // work actually settles.
      const watchdog = setInterval(()=>{
        if(!warned && Date.now() - lastAt > 90000){ warned = true;
          pdfNote('Still working - a full catalogue with photos can take several minutes on a phone. Keep the app open and the screen on.', false); }
      }, 15000);
      try { await buildPdf(); }
      catch(e){ pdfNote('Could not build the PDF: ' + escH((e && e.message) || String(e)), true); }
      clearInterval(watchdog); pdfProgress = () => {};
      b.textContent = label; b.disabled = false;
    });
    // fill selected-item photos from local store (async)
    sel.forEach((v,k)=>{
      window.ItemsStore.getPhoto(k).then(b=>{
        if(!b) return;
        const el=main.querySelector('.ph[data-k="'+CSS.escape(k)+'"]');
        if(el) el.innerHTML='<img src="'+URL.createObjectURL(b)+'" style="width:100%;height:100%;object-fit:contain;background:#faf7ef;border-radius:7px">';
      }).catch(()=>{});
    });
    loadPickerThumbs();
  }

  // Selection-time photo previews (Deep 10 Nov 17:28 "catalogue banate huwe preview
  // dekh kar select kar sake"): every picker chip gets its item photo. Same lazy
  // pattern as the Catalogue Editor - cached object URLs restore instantly on
  // re-render; the rest load as they scroll near the viewport.
  const pickerPhotoCache = {};
  function loadPickerThumbs(){
    // observe the CARD (its .pph thumb has no photo until one lands)
    const thumbs=[...main.querySelectorAll('.pcard[data-k]')];
    const fill=(card,url)=>{ const el=card.querySelector('.pph'); if(!el) return; el.innerHTML='<img src="'+url+'" alt="">'; el.classList.add('ld'); };
    const loadOne=async(chip)=>{
      const k=chip.dataset.k;
      if(!k || chip.dataset.tried) return;
      chip.dataset.tried='1';
      if(!(await window.ItemsStore.hasAnyPhotoHint(k))) return;
      try {
        const b=await Promise.race([ window.ItemsStore.getThumb(k), new Promise(res=>setTimeout(()=>res(null),8000)) ]);
        if(!b) return;
        pickerPhotoCache[k]=pickerPhotoCache[k]||URL.createObjectURL(b);
        if(document.contains(chip)) fill(chip, pickerPhotoCache[k]);
      } catch(e){}
    };
    thumbs.forEach(el=>{ if(pickerPhotoCache[el.dataset.k]) fill(el, pickerPhotoCache[el.dataset.k]); });
    // small parallel pool: 100+ simultaneous server fetches froze the page
    const queue=[]; let active=0;
    const pump=()=>{
      while(active<4 && queue.length){ const chip=queue.shift(); active++; loadOne(chip).finally(()=>{ active--; pump(); }); }
    };
    // Visibility sweep instead of IntersectionObserver: the IO callback stalled
    // in practice (visible cards stayed untried), so a timer scans for cards
    // near the viewport and queues them. getPhoto gets an 8s race so one hung
    // read can never wedge the pool.
    const sweep=()=>{
      if(!document.contains(main)) { clearInterval(sweepT); return; }
      let any=false;
      const cards=main.querySelectorAll('.pcard[data-k]');
      for(const c of cards){
        if(c.dataset.tried || c.dataset.qd) continue;
        const r=c.getBoundingClientRect();
        if(r.top < innerHeight+600 && r.bottom > -600){ c.dataset.qd='1'; queue.push(c); any=true; }
      }
      if(any) pump();
    };
    const sweepT=setInterval(sweep, 800);
    sweep();
  }

  // ---- modern catalogue PDF templates: grid cards + compact list ----
  function metaLine(){
    var parts = '';
    if(sheet.client || sheet.phn) parts += '<span><b>' + esc(sheet.client||'') + '</b>' + (sheet.phn ? ' &middot; ' + esc(sheet.phn) : '') + '</span>';
    parts += '<span>Venue: ' + (sheet.location ? '<b>' + esc(sheet.location) + '</b>' : '<span class="cg-line"></span>') + '</span>';
    parts += '<span>Event date(s): ' + (sheet.event ? '<b>' + esc(sheet.event) + '</b>' : '<span class="cg-line"></span>') + '</span>';
    return '<div class="cg-meta">' + parts + '</div>';
  }
  function slimHead(){
    return '<div class="cg-head"><img src="/assets/logo-lockup.png?v=6" alt="BBTH">'
      + '<div><div class="cg-t">' + esc((window.BBTH_SETTINGS&&window.BBTH_SETTINGS.company)||'BBTH') + '</div><div class="cg-s">ITEM CATALOGUE</div></div></div>'
      + '<div class="cg-rule"></div>';
  }
  function slimFoot(d){
    return '<div class="p-foot"><div class="footline"></div>'
      + '<div class="fl">' + esc(d.company) + '<br><span class="co">' + esc(d.address) + '</span></div>'
      + '<div class="fr">' + esc(d.contact) + '</div></div>';
  }
  async function buildModernPdf(tpl, d, rows, stage){
    // stream: category bands + grid rows (3 cards) or compact list rows
    const stream = [];
    let i = 0;
    while(i < rows.length){
      const r = rows[i];
      if(r.catHead){
        stream.push({ band: r.catHead });
        i++;
        if(tpl === 'grid'){
          let cards = [];
          let catChips = [];
          while(i < rows.length && !rows[i].catHead && !rows[i].spacer){
            if(rows[i].img) cards.push(rows[i]); else catChips.push(rows[i]);
            i++;
          }
          // 31 Oct category fix: group photo cards then no-photo chips from THIS
          // category only. The old code re-collected chips from the whole accumulated
          // stream, so every category's no-photo items drifted into later categories
          // and their own bands rendered empty (Deep's "category mismatch").
          for(let c = 0; c < cards.length; c += 4) stream.push({ cards: cards.slice(c, c + 4) });
          for(let c = 0; c < catChips.length; c += 5) stream.push({ chips: catChips.slice(c, c + 5) });
        } else {
          while(i < rows.length && !rows[i].catHead && !rows[i].spacer){ stream.push({ li: rows[i] }); i++; }
        }
      } else { i++; }
    }
    // renumber every product row in FINAL display order (Deep 26 Oct: Sl No on every
    // selected product - photo cards, chips and list rows share one running sequence)
    let n = 0;
    stream.forEach(x => {
      if(x.li){ n++; x.li = Object.assign({ _n: n }, x.li); }
      if(x.cards) x.cards = x.cards.map(c => Object.assign({ _n: ++n }, c));
      if(x.chips) x.chips = x.chips.map(c => Object.assign({ _n: ++n }, c));
    });
    function rowHtml(x){
      if(x.band) return '<div class="cg-band">' + esc(x.band) + '</div>';
      if(x.cards) return '<div class="cg-row">' + x.cards.map(c =>
        '<div class="cg-card"><div class="cg-ph"><img src="' + c.img + '"></div><div class="cg-nm"><span class="cg-num">' + c._n + '.</span> ' + esc(c.name) + '</div>' + (c.qty ? '<div class="cg-qt">Qty: ' + esc(c.qty) + '</div>' : '') + '</div>').join('') + '</div>';
      if(x.chips) return '<div class="cg-row" style="grid-template-columns:repeat(5,1fr)">' + x.chips.map(c =>
        '<div class="cg-chip"><span class="cg-num">' + c._n + '.</span> ' + esc(c.name) + (c.qty ? ' <span class="cg-q">' + esc(c.qty) + '</span>' : '') + '</div>').join('') + '</div>';
      if(tpl === 'tick') return '<div class="tk-row"><span class="tk-box"></span>'
        + '<span class="tk-ph">' + (x.li.img ? '<img src="' + x.li.img + '">' : '') + '</span>'
        + '<span class="tk-nm">' + esc(x.li.name) + '</span>'
        + '<span class="tk-q">Qty: <span class="tk-line"></span></span></div>';
      return '<div class="cl-row"><span class="cl-n">' + x.li._n + '.</span><span class="cl-nm">' + esc(x.li.name) + '</span>'
        + '<span class="cl-d">' + [x.li.qty, x.li.colour, x.li.size].filter(Boolean).map(esc).join(' &middot; ') + '</span></div>';
    }
    let pages = paginateMeasured({
      head: slimHead(),
      firstBlock: metaLine(),
      wrapOpen: () => '<div class="cg-wrap">',
      wrapClose: '</div>',
      rowsSel: '.cg-wrap',
      bottomSel: '.cg-wrap',
      row: rowHtml,
      items: stream,
      foot: slimFoot(d)
    });
    // keep a band with its first row
    for(let pass = 0; pass < 12; pass++){
      let fixed = true;
      for(let pi = 0; pi < pages.length; pi++){
        const doc = new DOMParser().parseFromString(pages[pi], 'text/html');
        const els = [...doc.querySelectorAll('.cg-wrap > div')];
        if(els.length && els[els.length - 1].classList.contains('cg-band')){
          const bn = els[els.length - 1].textContent.trim();
          const at = stream.findIndex(x => x.band === bn);
          if(at >= 0){ stream.splice(at, 0, { spacer: true }); fixed = false; break; }
        }
      }
      if(fixed) break;
      pages = paginateMeasured({
        head: slimHead(), firstBlock: metaLine(),
        wrapOpen: () => '<div class="cg-wrap">', wrapClose: '</div>',
        rowsSel: '.cg-wrap', bottomSel: '.cg-wrap',
        row: (x) => x.spacer ? '<div class="cg-spacer"></div>' : rowHtml(x),
        items: stream, foot: slimFoot(d)
      });
    }
    stage.innerHTML = pages.join('');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true });
    const els = stage.querySelectorAll('.p-page');
    for(let k = 0; k < els.length; k++){
      reportPdf('Building page ' + (k+1) + '/' + els.length + '\u2026');
      const canvas = await renderPageCanvas(els[k], k+1, els.length);
      if(k > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    }
    stage.innerHTML = ''; clearTemplateVars(stage);
    const safe = (sheet.client || 'Catalogue').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    await savePdf(pdf, 'BBTH-Catalogue-' + safe + '.pdf');
    recordHistory('BBTH-Catalogue-' + safe + '.pdf');
  }

  // Saved catalogues (Deep 10 Nov: show every catalogue; English-only copy).
  // Durable: saved on the site via /api/catalogue-history (shared D1, same staff
  // login) - the same list appears on every device. localStorage is only an
  // offline mirror, never the store of record.
  let histCache = null; // null = not loaded yet
  async function histApi(method, id, body){
    const r = await fetch('/api/catalogue-history' + (id ? '?id=' + encodeURIComponent(id) : ''), {
      method: method, headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' },
      body: body ? JSON.stringify({ data: body }) : undefined });
    if(!r.ok) throw new Error('hist ' + r.status);
    return r.json();
  }
  function histLocal(){ try { return JSON.parse(localStorage.getItem('bbth-cat-history') || '[]'); } catch(e){ return []; } }
  async function histLoad(force){
    if(histCache && !force) return histCache;
    try {
      const j = await histApi('GET');
      histCache = (j.rows || []).map(r => { try { const d = JSON.parse(r.data); d._id = r.id; d.ts = d.ts || Date.parse(r.created_at) || Date.now(); return d; } catch(e){ return null; } }).filter(Boolean);
      try { localStorage.setItem('bbth-cat-history', JSON.stringify(histCache)); } catch(e){}
    } catch(e){ histCache = histLocal(); } // offline mirror fallback
    return histCache;
  }
  async function recordHistory(name){
    const entry = { ts: Date.now(), name: name, client: sheet.client, phn: sheet.phn, location: sheet.location, event: sheet.event, qno: sheet.qno,
      tpl: (document.getElementById('pdfTpl') || {}).value || '',
      items: [...sel.values()].map(v => ({ n: v.name, cat: v.cat, qty: v.qty || '', colour: v.colour || '', size: v.size || '' })) };
    try {
      await histApi('POST', null, entry);
      histCache = null;
    } catch(e){ entry._local = true; const h = histLocal(); h.unshift(entry); try { localStorage.setItem('bbth-cat-history', JSON.stringify(h.slice(0, 50))); } catch(e2){} histCache = null;
      pdfNote('PDF downloaded, but saving to the site failed - this entry is kept on this device only.', true); }
    renderHistBadge();
  }
  async function renderHistBadge(){
    const b = document.getElementById('btnSaved'); if(!b) return;
    const h = await histLoad();
    b.textContent = h.length ? ('Saved catalogues (' + h.length + ')') : 'Saved catalogues';
  }
  async function openHist(){
    const pop = document.getElementById('catHist'); if(!pop) return;
    pop.classList.remove('hidden');
    requestAnimationFrame(() => pop.classList.add('in'));
    const list = document.getElementById('catHistList');
    list.innerHTML = '<p class="hint">Loading...</p>';
    const h = await histLoad(true);
    if(!h.length){ list.innerHTML = '<p class="hint">No catalogue saved yet. Download a PDF and it will be saved here automatically.</p>'; return; }
    list.innerHTML = h.map((e, i) =>
      '<div class="cathist-row"><div class="chr-t"><b>' + escH(e.client || 'Catalogue') + '</b>'
      + '<span>' + new Date(e.ts).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }) + (e.qno ? ' &middot; ' + escH(e.qno) : '') + ' &middot; ' + (e.items || []).length + ' items' + (e._local ? ' &middot; <i>this device only</i>' : '') + '</span></div>'
      + '<div class="chr-a"><button type="button" class="small-btn" data-hopen="' + i + '">Open</button>'
      + '<button type="button" class="small-btn danger" data-hdel="' + i + '">Delete</button></div></div>').join('');
  }
  function closeHist(){ const pop = document.getElementById('catHist'); if(!pop) return; pop.classList.remove('in'); setTimeout(() => pop.classList.add('hidden'), 170); }
  function restoreHist(i){
    const e = (histCache || [])[i]; if(!e || !DATA) return;
    sheet.client = e.client || ''; sheet.phn = e.phn || ''; sheet.location = e.location || ''; sheet.event = e.event || ''; sheet.qno = e.qno || '';
    if(e.tpl){ const t = document.getElementById('pdfTpl'); if(t) t.value = e.tpl; }
    sel.clear();
    (e.items || []).forEach(v => { if(v && v.n && v.cat) sel.set(key(v.cat, v.n), { name: v.n, cat: v.cat, group: 'c', qty: v.qty || '', colour: v.colour || '', size: v.size || '' }); });
    closeHist();
    render();
    pdfNote('Catalogue "' + escH(e.client || 'Catalogue') + '" opened - details and items are filled in again.', false);
  }
  (function(){
    const b = document.getElementById('btnSaved'); if(b) b.addEventListener('click', openHist);
    // Deep link from the admin menu "Catalogue List": open the saved-catalogues list.
    try { if(new URLSearchParams(location.search).get('saved') === '1') setTimeout(openHist, 350); } catch(e){}
    const x = document.getElementById('catHistX'); if(x) x.addEventListener('click', closeHist);
    const pop = document.getElementById('catHist'); if(pop) pop.addEventListener('click', ev => { if(ev.target === pop) closeHist(); });
    const list = document.getElementById('catHistList');
    if(list) list.addEventListener('click', async ev => {
      const o = ev.target.closest('[data-hopen]'), d = ev.target.closest('[data-hdel]');
      if(o){ restoreHist(parseInt(o.dataset.hopen, 10)); return; }
      if(d){
        const h = histCache || []; const e = h[parseInt(d.dataset.hdel, 10)]; if(!e) return;
        try { if(e._id) await histApi('DELETE', e._id); } catch(e2){}
        h.splice(parseInt(d.dataset.hdel, 10), 1);
        try { localStorage.setItem('bbth-cat-history', JSON.stringify(h)); } catch(e2){}
        histCache = h; openHist(); renderHistBadge();
      }
    });
    renderHistBadge();
  })();

  // ---- PDF: exact Brief/Agreement inner-page letterhead via js/pdf.js ----
  async function buildPdf(){
    if(!sel.size) return;
    const _bs = window.BBTH_SETTINGS || {};
    const d = { company:_bs.company||'BBTH', address:_bs.address||'Guwahati, Assam - 781035', contact:_bs.contact||'7002779886',
      footerContacts:_bs.footerContacts||_bs.contact||'7002779886', signoff:_bs.signoff||'A Sikdar', clientName:sheet.client||'', clientPlace:sheet.location||'',
      clientPhone:sheet.phn||'', eventDates:sheet.event||'', template:'sage-gold', docNo:sheet.qno||'' };
    const stage = document.getElementById('pdfStage');
    const pdfTpl = (document.getElementById('pdfTpl')||{}).value || 'table';
    applyTemplateVars(stage,'sage-gold'); applyTemplateVars(pdfMeasureHost(),'sage-gold');

    // flatten selected items grouped by category, with category header rows
    const rows=[];
    DATA.categories.forEach(cat=>{
      const inCat=[...sel.entries()].filter(([k,v])=>v.cat===cat.name);
      if(!inCat.length) return;
      rows.push({catHead:cat.name});
      inCat.forEach(([k,v])=>rows.push(v));
    });
    // attach locally stored photos (IndexedDB) as data URLs
    async function blobUrl(k){ const b=await window.ItemsStore.getPhoto(k).catch(()=>null); if(!b) return null;
      return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); }); }
    // load photos in a small parallel pool: a serial fetch per item turned a
    // 394-item build into many minutes of network waiting on a phone.
    const photoRows = rows.filter(r=>!r.catHead && !r.spacer);
    if(photoRows.length) reportPdf('Loading photos 0/' + photoRows.length + '\u2026');
    let nextPh = 0, donePh = 0;
    async function photoWorker(){
      while(nextPh < photoRows.length){
        const r = photoRows[nextPh++];
        r.img = await blobUrl(r.cat+'|'+r.name);
        donePh++;
        if(donePh % 5 === 0 || donePh === photoRows.length) reportPdf('Loading photos ' + donePh + '/' + photoRows.length + '\u2026');
      }
    }
    await Promise.all(Array.from({length: Math.min(6, photoRows.length)}, () => photoWorker()));

    if(pdfTpl === 'grid' || pdfTpl === 'list' || pdfTpl === 'tick'){
      return buildModernPdf(pdfTpl, d, rows, stage);
    }
    function makePages(rows){
      return paginateMeasured({
      head: innerHead('', 'Catalogue'),
      firstBlock: (function(){
        var cards = '';
        if(sheet.client || sheet.phn) cards += '<div class="icard"><div class="icbar"></div><div class="iclabel">CLIENT</div><div class="txt">' + (sheet.client?esc(sheet.client):'') + (sheet.phn?((sheet.client?'<br>':'')+'Phn: '+esc(sheet.phn)):'') + '</div></div>';
        if(sheet.location) cards += '<div class="icard"><div class="icbar"></div><div class="iclabel">VENUE</div><div class="txt">' + esc(sheet.location) + '</div></div>';
        if(sheet.event) cards += '<div class="icard"><div class="icbar"></div><div class="iclabel">EVENT</div><div class="txt">Date(s): ' + sheet.event.split(',').map(x=>esc(x.trim())).filter(Boolean).join('<br>') + '</div></div>';
        return cards ? '<div class="cards">' + cards + '</div>' : '';
      })(),
      wrapOpen: (first)=>'<table'+(first?'':' style="margin-top:92px"')+'><thead><tr><th style="width:40px">No.</th><th style="width:80px">Photo</th><th>Item</th><th style="width:95px">Category</th><th style="width:55px">Qty</th><th style="width:72px">Colour</th><th style="width:72px">Size</th></tr></thead><tbody data-rows>',
      wrapClose: '</tbody></table>',
      rowsSel: '[data-rows]',
      bottomSel: 'table',
      row: (r,i)=> r.catHead
        ? '<tr class="catrow"><td colspan="7">'+esc(r.catHead)+'</td></tr>'
        : (r.spacer
          ? '<tr class="spacerrow"><td colspan="7"></td></tr>'
          : '<tr><td><span class="numc">' + rows.slice(0, i+1).filter(x=>!x.catHead&&!x.spacer).length + '</span></td><td>'+(r.img?'<img class="phimg" src="'+r.img+'">':'')+'</td><td>'+esc(r.name)+'</td><td class="catcell">'+esc(r.cat)+'</td><td>'+esc(r.qty||'')+'</td><td>'+esc(r.colour||'')+'</td><td>'+esc(r.size||'')+'</td></tr>'),
      items: rows,
      foot: innerFoot(d)
      });
    }

    // keep a category header with its items: if one lands as the last row of a
    // page, insert a spacer row before it and repaginate (converges in a few passes)
    let pages = makePages(rows);
    for(let pass=0; pass<12; pass++){
      let orphan=null;
      for(let pi=0; pi<pages.length; pi++){
        const doc=new DOMParser().parseFromString(pages[pi],'text/html');
        const trs=[...doc.querySelectorAll('tbody tr')];
        if(trs.length && trs[trs.length-1].classList.contains('catrow')){
          orphan=trs[trs.length-1].textContent.trim(); break;
        }
      }
      if(!orphan) break;
      const at=rows.findIndex(r=>r.catHead===orphan);
      if(at<0) break;
      rows.splice(at,0,{spacer:true});
      pages=makePages(rows);
    }
    stage.innerHTML = pages.join('');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true });
    const els = stage.querySelectorAll('.p-page');
    for(let i=0;i<els.length;i++){
      reportPdf('Building page ' + (i+1) + '/' + els.length + '\u2026');
      const canvas = await renderPageCanvas(els[i], i+1, els.length);
      if(i>0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.9),'JPEG',0,0,210,297);
    }
    stage.innerHTML=''; clearTemplateVars(stage);
    const safe=(sheet.client||'Catalogue').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
    await savePdf(pdf, 'BBTH-Catalogue-' + safe + '.pdf');
    recordHistory('BBTH-Catalogue-' + safe + '.pdf');
  }
})();

// v24b cache-bump: fresh asset key after namespace poisoning
