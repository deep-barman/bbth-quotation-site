/* BBTH Layout Designer - venue outline map. Client-side only, no server writes. */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

// ---- auth (same storage keys as the quotation app) ----
function credGet(k){ return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; }
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

// Cross-tab logout guard (shared, /js/crosstab.js): adopt first (fresh login time from a
// post-logout handoff), then gate when this session predates the last logout signal.
handoffAdopt();
if(BBTHXTab.install()) return;
if(!credGet('bbth-admin-token')){ $('needLogin').classList.remove('hidden'); return; }
$('layMain').classList.remove('hidden');

// ---- element library (wedding venue items) ----
const TYPES = {
  entry:    {label:'Entry Gate',    w:12, h:2,  kind:'entry'},
  walkway:  {label:'Walkway',       w:30, h:6,  kind:'rect', fill:'#ded7c3'},
  stage:    {label:'Main Stage',    w:30, h:20, kind:'rect', fill:'#2b2b2b', ink:'#ffffff'},
  mandap:   {label:'Mandap',        w:20, h:20, kind:'rect', fill:'#264a3b', ink:'#ffffff'},
  chairs:   {label:'Chairs',        w:22, h:16, kind:'chairs', n:40, chw:1.5},
  rtable:   {label:'Round Table',   w:10, h:10, kind:'rtable', n:6},
  ltable:   {label:'Long Table',    w:16, h:4,  kind:'rect', fill:'#e08a3c'},
  food:     {label:'Food Counter',  w:24, h:6,  kind:'rect', fill:'#f2c14e'},
  starter:  {label:'Starter Counter', w:9, h:9, kind:'circle', fill:'#f2c14e'},
  gazebo:   {label:'Gazebo',        w:8,  h:8,  kind:'rect', fill:'#f2c14e'},
  kitchen:  {label:'Kitchen / Prep', w:24, h:14, kind:'rect', fill:'#8a8f98', ink:'#ffffff'},
  dj:       {label:'DJ / Sound',    w:10, h:8,  kind:'rect', fill:'#4d4a68', ink:'#ffffff'},
  parking:  {label:'Parking',       w:40, h:20, kind:'parking', n:8},
  zone:     {label:'Zone',          w:20, h:12, kind:'rect', fill:'#c4574e', ink:'#ffffff', pickColor:true},
  custom:   {label:'Custom Item',   w:12, h:8,  kind:'rect', fill:'#4d7a5f', ink:'#ffffff', pickColor:true}
};

// ---- state ----
const S = { client:'', date:'', shape:'rect', vw:320, vd:200, ew:80, ed:80, els:[], sel:null, seq:1 };
const DRAFT = 'bbth-layout-draft-v1';
function saveDraft(){ try{ localStorage.setItem(DRAFT, JSON.stringify({client:S.client,date:S.date,shape:S.shape,vw:S.vw,vd:S.vd,ew:S.ew,ed:S.ed,els:S.els,seq:S.seq})); }catch(e){} }
function loadDraft(){ try{ const d = JSON.parse(localStorage.getItem(DRAFT)||'null'); if(d){ Object.assign(S,d); } }catch(e){} }

// ---- geometry ----
const MARGIN = 46; // ft-space margin for dimension lines
function bounds(){ // total bounds in ft
  if(S.shape === 'lshape') return { w:S.vw, h:S.vd + S.ed };
  return { w:S.vw, h:S.vd };
}
function boundaryPath(){
  if(S.shape === 'lshape'){
    const x0 = S.vw - S.ew; // extension at top-right
    return `M0,${S.ed} L${x0},${S.ed} L${x0},0 L${S.vw},0 L${S.vw},${S.ed + S.vd} L0,${S.ed + S.vd} Z`;
  }
  return `M0,0 L${S.vw},0 L${S.vw},${S.vd} L0,${S.vd} Z`;
}
function insideVenue(x, y, w, h){
  const inRect = (rx, ry, rw, rh) => x >= rx && y >= ry && x + w <= rx + rw && y + h <= ry + rh;
  if(S.shape === 'lshape'){
    return inRect(0, S.ed, S.vw, S.vd) || inRect(S.vw - S.ew, 0, S.ew, S.ed);
  }
  return inRect(0, 0, S.vw, S.vd);
}
function clampEl(el){
  const b = bounds();
  el.x = Math.max(0, Math.min(el.x, b.w - el.w));
  el.y = Math.max(0, Math.min(el.y, b.h - el.h));
}

// ---- svg helpers ----
const svg = $('map');
function mk(tag, attrs, parent){ const n = document.createElementNS(NS, tag); for(const k in attrs) n.setAttribute(k, attrs[k]); (parent||svg).appendChild(n); return n; }
function txt(parent, x, y, str, size, fill, anchor, weight, rotate){
  const t = mk('text', {x, y, 'font-size': size, fill, 'text-anchor': anchor||'middle', 'font-weight': weight||500, 'font-family': "'Poppins', 'Segoe UI', sans-serif"}, parent);
  if(rotate) t.setAttribute('transform', `rotate(${rotate} ${x} ${y})`);
  t.textContent = str; return t;
}

// ---- render ----
function render(){
  const b = bounds();
  S.els.forEach((el, i) => { el.num = i + 1; });
  const legRows = Math.ceil(S.els.length / 2);
  const legH = S.els.length ? 14 + legRows * 9 : 0;
  const vbW = b.w + MARGIN * 2, vbH = b.h + MARGIN * 2 + legH;
  svg.setAttribute('viewBox', `${-MARGIN} ${-MARGIN} ${vbW} ${vbH}`);
  const avail = Math.min(document.querySelector('.canvas-wrap').clientWidth - 30, 1000);
  svg.style.width = avail + 'px';
  svg.style.height = (avail * vbH / vbW) + 'px';
  svg.innerHTML = '';

  // venue boundary
  mk('path', {d: boundaryPath(), fill:'#fffdf6', stroke:'#b09a55', 'stroke-width':1.4});
  // total area text inside
  const sqft = S.shape==='lshape' ? S.vw*S.vd + S.ew*S.ed : S.vw*S.vd;
  $('outSqft').textContent = sqft.toLocaleString('en-IN');

  // dimension lines
  dimLineH(0, S.vw, b.h + 14, `${S.vw} Ft`);
  dimLineV(b.w + 14, 0, b.h, `${b.h} Ft`);
  if(S.shape === 'lshape'){
    dimLineH(0, S.vw - S.ew, S.ed - 14, `${S.vw - S.ew} Ft`);
    dimLineH(S.vw - S.ew, S.vw, -14, `${S.ew} Ft`);
    dimLineV(S.vw - S.ew - 14, 0, S.ed, `${S.ed} Ft`);
  }

  // elements
  for(const el of S.els) drawEl(el);

  // keyed legend below the map (renders into the PDF too)
  if(S.els.length){
    const ly = b.h + MARGIN - 8;
    txt(null, -MARGIN + 6, ly - 3, 'Legend', 8, '#264a3b', 'start', 600);
    const colW = (b.w + MARGIN) / 2;
    S.els.forEach((el, i) => {
      const col = Math.floor(i / legRows), row = i % legRows;
      const x0 = -MARGIN + 6 + col * colW, y0 = ly + 6 + row * 9;
      mk('circle', {cx: x0 + 3, cy: y0 - 2.4, r: 3, fill:'#ffffff', stroke:'#223c31', 'stroke-width':.5});
      txt(null, x0 + 3, y0 - 0.6, String(el.num), 4.4, '#223c31', 'middle', 600);
      const extra = (el.kind==='chairs'||el.kind==='parking') ? ` - ${el.n} ${el.kind==='chairs'?'chairs':'cars'}` : '';
      txt(null, x0 + 8.5, y0, `${el.label} - ${el.w} x ${el.h} ft${extra}`, 6.2, '#223c31', 'start', 500);
    });
  }
}
function dimLineH(x0, x1, y, label){
  mk('line', {x1:x0, y1:y, x2:x1, y2:y, stroke:'#555', 'stroke-width':.6, 'stroke-dasharray':'3 2'});
  mk('line', {x1:x0, y1:y-3, x2:x0, y2:y+3, stroke:'#555', 'stroke-width':.6});
  mk('line', {x1:x1, y1:y-3, x2:x1, y2:y+3, stroke:'#555', 'stroke-width':.6});
  txt(null, (x0+x1)/2, y-4, label, 8, '#333', 'middle', 600);
}
function dimLineV(x, y0, y1, label){
  mk('line', {x1:x, y1:y0, x2:x, y2:y1, stroke:'#555', 'stroke-width':.6, 'stroke-dasharray':'3 2'});
  mk('line', {x1:x-3, y1:y0, x2:x+3, y2:y0, stroke:'#555', 'stroke-width':.6});
  mk('line', {x1:x-3, y1:y1, x2:x+3, y2:y1, stroke:'#555', 'stroke-width':.6});
  txt(null, x+5, (y0+y1)/2, label, 8, '#333', 'middle', 600, -90);
}

// ---- element drawing ----
function drawEl(el){
  const g = mk('g', {class:'el' + (S.sel === el.id ? ' sel' : ''), 'data-id': el.id});
  const cx = el.x + el.w/2, cy = el.y + el.h/2;
  const fill = el.fill || '#c4574e';
  const ink = el.ink || (isLight(fill) ? '#223c31' : '#ffffff');

  if(el.kind === 'circle' || el.kind === 'rtable'){
    const r = Math.min(el.w, el.h)/2;
    mk('circle', {cx, cy, r, fill, opacity:.9}, g);
    mk('circle', {cx, cy, r, fill:'none', stroke:'rgba(0,0,0,.25)', 'stroke-width':.5}, g);
  } else if(el.kind === 'entry'){
    mk('rect', {x:el.x, y:el.y, width:el.w, height:el.h, fill:'#b09a55', rx:.5}, g);
    // chevrons
    for(let i=0;i<Math.floor(el.w/3);i++){
      mk('path', {d:`M${el.x+i*3+1},${el.y+el.h*0.7} l1,-${el.h*0.4} l1,${el.h*0.4}`, stroke:'#fffdf6', 'stroke-width':.5, fill:'none'}, g);
    }
  } else {
    mk('rect', {x:el.x, y:el.y, width:el.w, height:el.h, fill, opacity:.92, rx:.8}, g);
    mk('rect', {x:el.x, y:el.y, width:el.w, height:el.h, fill:'none', stroke:'rgba(0,0,0,.25)', 'stroke-width':.5, rx:.8}, g);
  }

  // kind-specific contents
  if(el.kind === 'chairs'){
    const n = el.n || 40, chw = el.chw || 1.5;
    const cols = Math.max(1, Math.floor(el.w / (chw + 1.2)));
    const rows = Math.ceil(n / cols);
    const gapX = el.w / cols, gapY = Math.min(chw + 1.4, el.h / Math.max(rows,1));
    let drawn = 0;
    for(let r=0; r<rows && drawn<n; r++){
      for(let c=0; c<cols && drawn<n; c++){
        mk('rect', {x: el.x + c*gapX + (gapX-chw)/2, y: el.y + r*gapY + .6, width: chw, height: chw, fill:'none', stroke:'#223c31', 'stroke-width':.45}, g);
        drawn++;
      }
    }
  }
  if(el.kind === 'parking'){
    const n = el.n || 8;
    const cols = Math.max(1, Math.floor(el.w / 9));
    const rows = Math.ceil(n / cols);
    const cw = el.w / cols, ch2 = el.h / rows;
    let drawn = 0;
    for(let r=0; r<rows && drawn<n; r++){
      for(let c=0; c<cols && drawn<n; c++){
        // simple car silhouette: body + roof
        const x0 = el.x + c*cw + cw*0.12, y0 = el.y + r*ch2 + ch2*0.2, w8 = cw*0.76, h8 = ch2*0.6;
        mk('rect', {x:x0, y:y0, width:w8, height:h8, rx:h8*0.28, fill:'#3c4048'}, g);
        mk('rect', {x:x0+w8*0.2, y:y0+h8*0.18, width:w8*0.6, height:h8*0.5, rx:h8*0.15, fill:'#6a707c'}, g);
        drawn++;
      }
    }
  }
  if(el.kind === 'rtable'){
    const n = el.n || 6, r = Math.min(el.w, el.h)/2, cr = (el.chw||1.5)/2;
    for(let i=0;i<n;i++){
      const a = (Math.PI*2*i)/n - Math.PI/2;
      mk('circle', {cx: cx + Math.cos(a)*(r + cr + 0.6), cy: cy + Math.sin(a)*(r + cr + 0.6), r: cr, fill:'none', stroke:'#223c31', 'stroke-width':.45}, g);
    }
  }

  // number badge (always; the keyed legend below the map carries name + size)
  const badgeR = 3.2;
  mk('circle', {cx: el.x + badgeR + 1, cy: el.y + badgeR + 1, r: badgeR, fill:'#ffffff', stroke:'#223c31', 'stroke-width':.5}, g);
  txt(g, el.x + badgeR + 1, el.y + badgeR + 2.6, String(el.num), 4.6, '#223c31', 'middle', 600);

  // in-block label only when it fits comfortably inside
  const fitFs = s => (el.w * 0.92) / (Math.max(1, s.length) * 0.60);
  const dims = `${el.w} x ${el.h} ft`;
  const fs = Math.max(5, Math.min(10, el.w / 8, el.h / 3));
  const fIn = Math.min(fs, fitFs(el.label));
  if(el.h >= 9 && el.w >= 14 && fIn >= 2.6){
    txt(g, cx, cy, el.label, fIn, ink, 'middle', 600);
    const fD = Math.min(fIn * 0.8, fitFs(dims));
    txt(g, cx, cy + fIn + 2, dims, fD, ink, 'middle', 400);
    if(el.kind==='chairs'||el.kind==='parking') txt(g, cx, cy + fIn + fD + 4, `${el.n} ${el.kind==='chairs'?'chairs':'cars'}`, fD * 0.95, ink, 'middle', 400);
  }

  // selection ring (inline visibility so standalone SVG export hides it too)
  mk('rect', {class:'selring', x: el.x-1.2, y: el.y-1.2, width: el.w+2.4, height: el.h+2.4, fill:'none', stroke:'#c9a227', 'stroke-width':1, 'stroke-dasharray':'3 2', rx:1, visibility: S.sel === el.id ? 'visible' : 'hidden'}, g);
}
function isLight(hex){
  const m = /^#([0-9a-f]{6})$/i.exec(hex||''); if(!m) return true;
  const v = parseInt(m[1],16), r=v>>16, g=(v>>8)&255, b=v&255;
  return (0.299*r + 0.587*g + 0.114*b) > 150;
}

// ---- add with auto-placement (one click places whole configured block) ----
function overlaps(a, b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function findSpot(w, h){
  const b = bounds();
  for(let y = 0; y + h <= b.h; y += 4){
    for(let x = 0; x + w <= b.w; x += 4){
      if(!insideVenue(x, y, w, h)) continue;
      const cand = {x, y, w, h};
      if(!S.els.some(e => overlaps(cand, e))) return {x, y};
    }
  }
  return {x: Math.max(0,(b.w-w)/2), y: Math.max(0,(b.h-h)/2)}; // fallback center
}
function addEl(type){
  const t = TYPES[type]; if(!t) return;
  const el = { id:'e' + (S.seq++), type, kind:t.kind, label:t.label, w:t.w, h:t.h, fill:t.fill, ink:t.ink };
  if(t.n) el.n = t.n;
  if(t.chw) el.chw = t.chw;
  const spot = findSpotAnchored(el.w, el.h, currentAnchor());
  if(!spot){ toast('No free space for this size - remove something or shrink the item.'); return; }
  el.x = spot.x; el.y = spot.y;
  clampEl(el);
  S.els.push(el); S.sel = el.id;
  render(); syncProps(); saveDraft();
}

// ---- palette ----
function buildPalette(){
  const pal = $('palette'); pal.innerHTML = '';
  for(const key in TYPES){
    const t = TYPES[key];
    const b = document.createElement('button');
    b.innerHTML = (t.fill ? `<span class="sw" style="background:${t.fill}"></span>` : '') + t.label;
    b.onclick = () => addEl(key);
    pal.appendChild(b);
  }
}

// ---- props panel ----
function selEl(){ return S.els.find(e => e.id === S.sel) || null; }
function syncProps(){
  const el = selEl();
  $('propsNone').classList.toggle('hidden', !!el);
  $('propsForm').classList.toggle('hidden', !el);
  if(!el) return;
  $('pLabel').value = el.label;
  $('pW').value = el.w; $('pH').value = el.h;
  $('pColor').value = el.fill || '#c4574e';
  const hasN = el.kind==='chairs' || el.kind==='rtable' || el.kind==='parking';
  $('pCountWrap').classList.toggle('hidden', !hasN);
  if(hasN){ $('pCount').value = el.n || 1; $('pCountLabel').textContent = el.kind==='parking' ? 'Cars' : 'Chairs'; }
  $('pChwWrap').classList.toggle('hidden', el.kind!=='chairs');
  if(el.kind==='chairs') $('pChw').value = el.chw || 1.5;
}
function bindProps(){
  $('pLabel').addEventListener('input', e => { const el=selEl(); if(el){ el.label = e.target.value; render(); saveDraft(); }});
  $('pW').addEventListener('input', e => { const el=selEl(); if(el){ el.w = Math.max(1, +e.target.value||1); clampEl(el); render(); saveDraft(); }});
  $('pH').addEventListener('input', e => { const el=selEl(); if(el){ el.h = Math.max(1, +e.target.value||1); clampEl(el); render(); saveDraft(); }});
  $('pCount').addEventListener('input', e => { const el=selEl(); if(el){ el.n = Math.max(0, +e.target.value||0); render(); saveDraft(); }});
  $('pChw').addEventListener('input', e => { const el=selEl(); if(el){ el.chw = Math.max(0.5, +e.target.value||1.5); render(); saveDraft(); }});
  $('pColor').addEventListener('input', e => { const el=selEl(); if(el){ el.fill = e.target.value; el.ink = isLight(el.fill) ? '#223c31' : '#ffffff'; render(); saveDraft(); }});
  $('pDel').addEventListener('click', () => { S.els = S.els.filter(e => e.id !== S.sel); S.sel = null; render(); syncProps(); saveDraft(); });
}

// ---- drag ----
let drag = null;
function ftFromEvt(e){
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return {x: p.x, y: p.y};
}
svg.addEventListener('pointerdown', e => {
  const g = e.target.closest('.el');
  if(!g){ S.sel = null; render(); syncProps(); return; }
  const el = S.els.find(x => x.id === g.dataset.id); if(!el) return;
  S.sel = el.id;
  const p = ftFromEvt(e);
  drag = { el, dx: p.x - el.x, dy: p.y - el.y };
  try{ svg.setPointerCapture(e.pointerId); }catch(_){/* synthetic events have no active pointer */}
  render(); syncProps();
});
svg.addEventListener('pointermove', e => {
  if(!drag) return;
  const p = ftFromEvt(e);
  drag.el.x = Math.round((p.x - drag.dx) * 2) / 2;
  drag.el.y = Math.round((p.y - drag.dy) * 2) / 2;
  clampEl(drag.el);
  render();
});
svg.addEventListener('pointerup', () => { if(drag){ drag = null; saveDraft(); } });

// ---- PDF export ----
async function exportPDF(){
  const btn = $('btnPdf'); btn.disabled = true; btn.textContent = 'Making PDF...';
  try{
    const keepSel = S.sel; S.sel = null; render();   // no selection ring in the export
    try { await doExport(); } finally { S.sel = keepSel; render(); }
  } finally { btn.disabled = false; btn.textContent = 'Download PDF'; }
}
async function doExport(){
    // rasterize the SVG map directly (html2canvas cannot render inline SVG)
    const vb = svg.getAttribute('viewBox');   // includes the legend area
    const vbH = parseFloat(vb.split(' ')[3]);
    const b = bounds();
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('viewBox', vb);
    const scale = 3;
    const pxW = Math.round((b.w + MARGIN*2) * scale), pxH = Math.round(vbH * scale);
    clone.setAttribute('width', pxW); clone.setAttribute('height', pxH);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'}));
    const im = await loadImg(url);
    URL.revokeObjectURL(url);
    const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(im, 0, 0, pxW, pxH);
    const img = cv.toDataURL('image/jpeg', 0.92);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
    const PW = 297, PH = 210;
    pdf.setFillColor(38,74,59); pdf.rect(0, 0, PW, 26, 'F');
    try{
      const logo = await loadImg('/assets/logo-lockup.png?v=6');
      const lh = 16, lw = logo.width * lh / logo.height;
      const lc = document.createElement('canvas');
      lc.height = 128; lc.width = Math.round(logo.width * 128 / logo.height);
      const lctx = lc.getContext('2d');
      lctx.fillStyle = '#264a3b'; lctx.fillRect(0, 0, lc.width, lc.height);
      lctx.drawImage(logo, 0, 0, lc.width, lc.height);
      pdf.addImage(lc.toDataURL('image/jpeg', 0.9), 'JPEG', 10, 5, lw, lh);
    }catch(e){}
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(15);
    pdf.text('Venue Layout', PW-12, 12, {align:'right'});
    pdf.setFont('helvetica','normal'); pdf.setFontSize(10);
    const client = S.client || 'Client name';
    const dt = S.date || '';
    pdf.text(client + (dt ? '  -  ' + dt : ''), PW-12, 19, {align:'right'});
    const margin = 12, top = 32, bottom = 14;
    const availW = PW - margin*2, availH = PH - top - bottom;
    const sc = Math.min(availW / cv.width, availH / cv.height);
    const dw = cv.width * sc, dh = cv.height * sc;
    pdf.addImage(img, 'JPEG', (PW-dw)/2, top, dw, dh);
    const S0 = (typeof DEFAULT_SETTINGS !== 'undefined') ? DEFAULT_SETTINGS : {};
    pdf.setTextColor(110,120,112); pdf.setFontSize(8.5);
    const ft1 = (S0.company || 'BBTH') + (S0.contact ? '  -  ' + S0.contact : '');
    pdf.text(ft1, PW/2, PH-7, {align:'center'});
    pdf.save('BBTH-Venue-Layout-' + (client.replace(/\s+/g,'-') || 'draft') + '.pdf');
}
function loadImg(src){
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

// ---- wiring ----
function num(id, fallback){ const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : fallback; }
function readSheet(){
  S.client = $('inClient').value.trim();
  S.date = $('inDate').value;
  S.shape = $('inShape').value;
  S.vw = num('inVW', 320); S.vd = num('inVD', 200);
  S.ew = num('inEW', 80); S.ed = num('inED', 80);
  $('extFields').classList.toggle('hidden', S.shape !== 'lshape');
  for(const el of S.els) clampEl(el);
  render(); saveDraft();
}
function currentAnchor(){ return ($('inPlace') && $('inPlace').value) || 'auto'; }
function anchorStart(w, h, anchor){
  // user-chosen direction/place anchor: search starts near that zone
  const b = bounds();
  const ax = {left:0, center:(b.w-w)/2, right:b.w-w};
  const ay = {top:0, middle:(b.h-h)/2, bottom:b.h-h};
  const map = {
    'top-left':[ax.left,ay.top], 'top':[ax.center,ay.top], 'top-right':[ax.right,ay.top],
    'left':[ax.left,ay.middle], 'center':[ax.center,ay.middle], 'right':[ax.right,ay.middle],
    'bottom-left':[ax.left,ay.bottom], 'bottom':[ax.center,ay.bottom], 'bottom-right':[ax.right,ay.bottom]
  };
  return map[anchor] || null;
}
function findSpotAnchored(w, h, anchor){
  const b = bounds();
  const start = anchorStart(w, h, anchor) || [(b.w - w) / 2, (b.h - h) / 2];
  let best = null, bestD = Infinity;
  for(let y = 0; y + h <= b.h; y += 2){
    for(let x = 0; x + w <= b.w; x += 2){
      if(!insideVenue(x, y, w, h)) continue;
      const cand = {x, y, w, h};
      if(S.els.some(e => overlaps(cand, e))) continue;
      const d = (x - start[0]) * (x - start[0]) + (y - start[1]) * (y - start[1]);
      if(d < bestD){ bestD = d; best = {x, y}; }
    }
  }
  return best;
}
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4000);
}

loadDraft();
buildPalette(); bindProps();
$('inClient').value = S.client; $('inDate').value = S.date; $('inShape').value = S.shape;
$('inVW').value = S.vw; $('inVD').value = S.vd; $('inEW').value = S.ew; $('inED').value = S.ed;
$('extFields').classList.toggle('hidden', S.shape !== 'lshape');
['inClient','inDate','inShape','inVW','inVD','inEW','inED'].forEach(id => $(id).addEventListener('input', readSheet));
$('btnPdf').addEventListener('click', exportPDF);
$('btnClear').addEventListener('click', () => { if(confirm('Clear all elements?')){ S.els = []; S.sel = null; render(); syncProps(); saveDraft(); } });
window.addEventListener('resize', render);
render(); syncProps();
})();
