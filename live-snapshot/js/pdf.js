// BBTH Quotation Maker - PDF page construction + generation
function S(){ return window.BBTH_SETTINGS || {}; }
function T(key){
  const t = (S().texts) || {};
  let v = t[key];
  if(v === undefined || v === null || v === '') v = (typeof DEFAULT_SETTINGS !== 'undefined' ? DEFAULT_SETTINGS.texts[key] : '') || '';
  return v;
}
// per-agreement wording overrides (state.agree, set on the form's step 5) fall back to template texts
function A(d, key){
  const ov = (d && d.agree) || {};
  if(ov[key] !== undefined && ov[key] !== null && String(ov[key]).trim() !== '') return ov[key];
  return T(key);
}

function logoSrc(kind){
  const custom = S().logo;
  if(custom) return custom;
  return kind === 'alpha' ? '/assets/logo-alpha.png?v=6' : '/assets/logo-white.png?v=6';
}
function isOrder(d){ return true; }  // every quotation uses the Wedding Execution Brief format
function esc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function eventLines(d){
  // typed free text wins; legacy ISO date falls back to the old formatting
  const raw = (d.eventDates !== undefined && d.eventDates !== null && String(d.eventDates).trim() !== '')
    ? String(d.eventDates) : (d.eventDate ? fmtDate(d.eventDate) : '');
  return raw.split('\n').map(x => x.trim()).filter(Boolean);
}
function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return esc(iso);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = d.getDate();
  const ord = (day%10===1&&day!==11)?'st':(day%10===2&&day!==12)?'nd':(day%10===3&&day!==13)?'rd':'th';
  return day + ord + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

// --- shiny metallic gold text: rendered as an SVG data-URI image with a multi-stop
// vertical gradient (dark base -> bright highlight -> dark base) so it reads as
// polished metal in the PDF. html2canvas cannot do background-clip:text gradients.
function goldTxt(txt, opt){
  opt = opt || {};
  const size = opt.size || 14;
  const weight = opt.weight || 700;
  const ls = opt.ls || 0;
  const onDark = opt.on !== 'light';   // 'dark' = text sits on sage, 'light' = on ivory/white
  const plain = String(txt || '').replace(/&nbsp;?/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const m = document.createElement('canvas').getContext('2d');
  m.font = (opt.italic ? 'italic ' : '') + weight + ' ' + size + 'px sans-serif';
  const w = Math.ceil(m.measureText(plain).width + ls * plain.length * 0.95) + 6;
  const h = Math.ceil(size * 1.45);
  const base = Math.ceil(size * 1.12);
  const xEsc = plain.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // shiny metallic multi-stop gradients tuned per background so small text stays readable:
  // on ivory: no near-white stops (they vanish on cream); on sage: no deep-bronze stops (they sink into green)
  const stops = opt.stops ? opt.stops : (onDark
    ? '<stop offset="0" stop-color="#a8801c"/><stop offset="0.22" stop-color="#d9b13b"/><stop offset="0.40" stop-color="#f6e27a"/><stop offset="0.50" stop-color="#fffbe6"/><stop offset="0.60" stop-color="#f2d765"/><stop offset="0.78" stop-color="#d4af37"/><stop offset="1" stop-color="#a8801c"/>'
    : '<stop offset="0" stop-color="#6f4e0d"/><stop offset="0.22" stop-color="#a8801c"/><stop offset="0.40" stop-color="#cfa42e"/><stop offset="0.50" stop-color="#e3bd4a"/><stop offset="0.60" stop-color="#c39a28"/><stop offset="0.78" stop-color="#97721a"/><stop offset="1" stop-color="#6f4e0d"/>');
  const stroke = opt.stroke || (onDark ? 'rgba(30,45,20,0.35)' : 'rgba(90,60,5,0.30)');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' + stops + '</linearGradient></defs>'
    + '<text x="' + (w/2) + '" y="' + base + '" text-anchor="middle" fill="url(#g)" '
    + 'stroke="' + stroke + '" stroke-width="0.6" paint-order="stroke" '
    + 'font-family="sans-serif" font-size="' + size + '" font-weight="' + weight + '"' + (opt.italic ? ' font-style="italic"' : '')
    + (ls ? ' letter-spacing="' + ls + '"' : '') + '>' + xEsc + '</text></svg>';
  return '<img class="gtxt" width="' + w + '" height="' + h + '" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '" alt="">';
}

// brand tagline (English | Assamese). HTML text so the Assamese script uses the loaded Noto Sans Bengali web font.
function taglineHtml(cls, stack){
  const parts = String(T('tagline') || '').split('|').map(x => x.trim()).filter(Boolean);
  if(!parts.length) return '';
  const spans = parts.map((x, i) => '<span class="' + (i === 0 ? 'tg-en' : 'tg-as') + '">' + esc(x) + '</span>');
  return '<div class="tagln ' + cls + (stack ? ' stack' : '') + '">' + spans.join(stack ? '' : '<span class="tg-bar">|</span>') + '</div>';
}
async function loadTaglineFonts(){
  try{
    if(document.fonts && document.fonts.load){
      const t = String(T('tagline') || 'x');
      await Promise.all([document.fonts.load('italic 500 16px "Playfair Display"', t), document.fonts.load('500 16px "Noto Sans Bengali"', t)]);
    }
  }catch(e){}
}

const SILVER_STOPS = '<stop offset="0" stop-color="#5d6b7a"/><stop offset="0.22" stop-color="#8b98a6"/><stop offset="0.42" stop-color="#c3ccd6"/><stop offset="0.50" stop-color="#f2f5f8"/><stop offset="0.58" stop-color="#c3ccd6"/><stop offset="0.78" stop-color="#8b98a6"/><stop offset="1" stop-color="#5d6b7a"/>';
function silverTxt(txt, opt){ opt = Object.assign({}, opt || {}, { stops: SILVER_STOPS, stroke: 'rgba(40,55,70,0.30)' }); return goldTxt(txt, opt); }

function diamonds(n){
  n = n || 5;
  let out = '<div class="dias">';
  for(let i = 0; i < n; i++) out += '<span class="dia"></span>';
  return out + '</div>';
}

function archFrame(imgCls, tagHtml){
  return '<div class="arch"><img class="archlk archlk-l" src="/assets/logo-lockup.png?v=6" width="92" height="120" alt="BBTH"><img class="archlk archlk-d" src="/assets/logo-lockup-dark.png?v=6" width="92" height="120" alt="BBTH"></div>';
}


// ---- layout covers: faithful recreations of the BBTH sample designs ----
function covClientLines(d){
  return (d.clientName ? '<div class="cname">' + esc(d.clientName) + '</div>' : '')
    + (d.clientPlace ? '<div class="cline">' + esc(d.clientPlace) + (d.clientPhone ? ' | ' + esc(d.clientPhone) : '') + '</div>' : (d.clientPhone ? '<div class="cline">' + esc(d.clientPhone) + '</div>' : ''))
    + (eventLines(d).length ? '<div class="cline">' + esc(eventLines(d).join(', ')) + '</div>' : '');
}
function buildCoverIvory(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-ivory">'
    + '<div class="civ-f1"></div><div class="civ-f2"></div>'
    + (ag ? '<div class="civ-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="civ-kicker">' + goldTxt(tx.kick, { size: 13, ls: 6 }) + '</div>'
    + '<div class="civ-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="civ-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="civ-sub">' + esc(tx.sub) + '</div>'
    + '<div class="civ-love">' + goldTxt(ag ? 'WITH TRUST' : 'WITH LOVE', { size: 11, ls: 6 }) + '</div>'
    + '<div class="civ-card">' + (ag ? agreeCardInner(d)
      : '<div class="civ-lab">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'), { size: 11.5, ls: 3, on: 'light' }) + '</div>' + covClientLines(d)) + '</div>'
    + (!ag && d.budget ? '<div class="civ-budget">' + esc(T('lblBudget')) + '&nbsp;&nbsp;' + esc(d.budget) + '</div>' : '')
    + '<div class="civ-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '<br>' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildCoverBlush(d, ag){
  const tx = coverTexts(d, ag);
  let dots = '';
  for(let i = 0; i < 8; i++) dots += '<div class="cbl-dot" style="transform: rotate(' + (i * 45) + 'deg) translateY(-252px)"></div>';
  return '<div class="p-page p-cover cov-blush">'
    + '<div class="cbl-blob b1"></div><div class="cbl-blob b2"></div><div class="cbl-blob b3"></div><div class="cbl-blob b4"></div>'
    + '<div class="cbl-kicker">' + goldTxt('', { size: 12, ls: 6 }) + '</div>'
    + (ag ? '<div class="cbl-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="cbl-ring">' + dots + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="cbl-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="cbl-sub">' + esc(tx.sub) + '</div>'
    + '<div class="cbl-card">' + (ag ? '<div class="cbl-col cbl-col-ag">' + agreeCardInner(d) + '</div>'
      : '<div class="cbl-col"><div class="cbl-lab">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'), { size: 11, ls: 2.5, on: 'light' }) + '</div>' + covClientLines(d) + '</div>'
      + '<div class="cbl-col"><div class="cbl-lab">' + goldTxt(T('lblDate'), { size: 11, ls: 2.5, on: 'light' }) + '</div><div class="cline">' + esc(eventLines(d).join(', ')) + '</div>'
      + (d.budget ? '<div class="cbl-lab" style="margin-top:12px">' + goldTxt(T('lblBudget'), { size: 11, ls: 2.5, on: 'light' }) + '</div><div class="cline"><b>' + esc(d.budget) + '</b></div>' : '') + '</div>')
    + '</div>'
    + '<div class="cbl-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '<br>' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildCoverMinimal(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-min">'
    + '<div class="cmn-ring r1"></div><div class="cmn-ring r2"></div>'
    + '<div class="cmn-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + (ag ? '<div class="cmn-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="cmn-kicker">' + goldTxt(ag ? tx.kick : T('ordKicker'), { size: 12, ls: 5 }) + '</div>'
    + '<div class="cmn-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="cmn-bar"></div>'
    + '<div class="cmn-sub">' + esc(tx.sub) + '</div>'
    + '<div class="cmn-info">' + (ag ? '<div class="cmn-cell cmn-cell-ag">' + agreeCardInner(d) + '</div>'
      : '<div class="cmn-cell"><div class="cmn-lab">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'), { size: 10.5, ls: 2.5 }) + '</div>' + covClientLines(d) + '</div>'
      + '<div class="cmn-cell"><div class="cmn-lab">' + goldTxt(T('lblDate'), { size: 10.5, ls: 2.5 }) + '</div><div class="cline">' + esc(eventLines(d).join(', ')) + '</div></div>'
      + (d.budget ? '<div class="cmn-cell"><div class="cmn-lab">' + goldTxt(T('lblBudget'), { size: 10.5, ls: 2.5 }) + '</div><div class="cline"><b>' + esc(d.budget) + '</b></div></div>' : ''))
    + '</div>'
    + '<div class="cmn-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- layout back pages ----
function buildBackIvory(d){
  return '<div class="p-page p-back bck-ivory">'
    + '<div class="civ-f1"></div><div class="civ-f2"></div>'
    + '<div class="biv-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="biv-thanks">' + esc(T('thanksTitle')) + '</div>'
    + diamonds(1)
    + '<div class="biv-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="biv-card">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackBlush(d){
  return '<div class="p-page p-back bck-blush">'
    + '<div class="cbl-blob b1"></div><div class="cbl-blob b2"></div><div class="cbl-blob b5"></div>'
    + '<div class="bbl-ring">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="bbl-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="bbl-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bbl-band">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackMinimal(d){
  return '<div class="p-page p-back bck-min">'
    + '<div class="cmn-ring r3"></div>'
    + '<div class="cmn-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="cmn-kicker">' + goldTxt('WEDDING PLANNING', { size: 12, ls: 5 }) + '</div>'
    + '<div class="bmn-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="cmn-bar"></div>'
    + '<div class="bmn-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bmn-rule"></div>'
    + '<div class="bmn-co">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

function buildCover(d){
  const lay = (typeof getTemplateLayout === 'function') ? getTemplateLayout(d.template) : 'arch';
  if(lay && lay[0] === 'g') return buildCoverGen(d, false, lay);
  if(lay === 'ivory') return buildCoverCert(d, false);
  if(lay === 'blush') return buildCoverGarden(d, false);
  if(lay === 'minimal') return buildCoverPoster(d, false);
  if(lay === 'band') return buildCoverRegal(d, false);
  if(lay === 'spine') return buildCoverEditorial(d, false);
  if(lay === 'crest') return buildCoverRoyal(d, false);
  if(lay === 'dream') return buildCoverSwiss(d, false);
  if(lay === 'noir') return buildCoverNoir(d, false);
  return '<div class="p-page p-cover">'
    + '<div class="cv-left">'
    +   '<div class="cv-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   diamonds(5)
    +   '<div class="cv-brand">' + goldTxt(T('coverTagline'), { size: 9.5, ls: 1.6 }) + '</div>'
    +   '<div class="cv-leftfoot"><div>' + esc(d.address) + '</div><div>' + esc(d.footerContacts) + '</div></div>'
    + '</div>'
    + '<div class="cv-right">'
    +   (d.docNo ? '<div class="cv-no">' + goldTxt(T('ordNoLabel') + d.docNo, { size: 13.5, ls: 4, on: 'light' }) + '</div>' : '<div class="cv-no"></div>')
    +   '<div class="cv-title' + (isOrder(d) ? ' cv-title-ord' : '') + '">' + esc(isOrder(d) ? T('ordCoverTitle') : T('coverTitle')) + '</div>'
    +   '<div class="gbar cv-bar"></div>'
    +   '<div class="cv-sub">' + esc(isOrder(d) ? T('ordCoverSub') : T('coverSubtitle')) + '</div>'
    +   '<div class="cv-card"><div class="cv-cardbar"></div>'
    +     '<div class="cv-kicker">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('coverCardLabel'), { size: 12.5, ls: 3, on: 'light' }) + '</div>'
    +     (d.clientName ? '<div class="cname">' + esc(d.clientName) + '</div>' : '')
    +     (d.clientPlace ? '<div class="cline">' + esc(d.clientPlace) + '</div>' : '')
    +     (d.clientPhone ? '<div class="cline">' + esc(T('lblContact')) + ': ' + esc(d.clientPhone) + '</div>' : '')
    +     (eventLines(d).length ? '<div class="cline">' + esc(T('lblDate')) + ': ' + esc(eventLines(d).join(', ')) + '</div>' : '')
    +     (d.budget ? '<div class="pill">' + goldTxt(T('lblBudget').toUpperCase() + '   ' + d.budget, { size: 14, weight: 700, ls: 2 }) + '</div>' : '')
    +   '</div>'
    + '</div>'
    + '</div>';
}

function innerHead(kicker, title){
  // the small gold kicker line was removed permanently (client request) - the
  // parameter stays so existing call sites are untouched
  return '<div class="band"><div class="bcirc" style="right:-90px;top:-130px;width:320px;height:320px"></div>'
    + '<div class="bcirc" style="left:200px;bottom:-190px;width:260px;height:260px"></div></div>'
    + '<div class="head">'
    + '<img class="archlk archlk-l" src="/assets/logo-lockup.png?v=6" width="92" height="120" alt="BBTH"><img class="archlk archlk-d" src="/assets/logo-lockup-dark.png?v=6" width="92" height="120" alt="BBTH">'
    + '<div class="headtxt"><div class="ptitle">' + title + '</div>'
    + '<div class="gbar prule"></div></div>'
    + '</div><div class="bandline"></div>';
}

function infoCards(d){
  return '<div class="cards">'
    + '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(T('cardPreparedBy'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.contact) + '</div></div>'
    + ((d.clientName || d.clientPlace || d.clientPhone) ? '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + esc(d.clientName) + (d.clientPlace ? '<br>' + esc(d.clientPlace) : '') + (d.clientPhone ? '<br>' + esc(T('lblContact')) + ': ' + esc(d.clientPhone) : '') + '</div></div>' : '')
    + '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(T('cardDateBudget'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + eventLines(d).map(esc).join('<br>') + (((d.agree || {}).agDate || '').trim() ? '<br>' + esc(T('agreeDateLabel')) + ': ' + esc(d.agree.agDate) : '') + (d.budget ? '<br>' + esc(T('lblBudget')) + ': ' + esc(d.budget) : '') + '</div></div>'
    + '</div>';
}

function innerFoot(d){
  return '<div class="p-foot"><div class="footline"></div>'
    + '<div class="fl">' + esc(T('lblBestRegards')) + ' ' + esc(d.signoff) + '<br><span class="co">' + esc(d.company) + '</span></div>'
    + '<div class="fr">' + goldTxt(d.contact + '   |   ' + d.address, { size: 13, weight: 600, ls: 1, on: 'light' }) + '</div></div>';
}


// ---- measured pagination: rows are placed against the REAL footer position in a
// hidden offscreen page, so content never runs into the footer - whatever does not
// fit moves to the next page. Works for table rows and term items alike. ----
function pdfMeasureHost(){
  let h = document.getElementById('pdfMeasure');
  if(!h){
    h = document.createElement('div');
    h.id = 'pdfMeasure';
    h.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(h);
  }
  return h;
}

// cfg: head, firstBlock, wrapOpen(first), wrapClose, rowsSel, bottomSel,
//      row(item, globalIdx), items, foot, lastTail
function paginateMeasured(cfg){
  const host = pdfMeasureHost();
  const GAP = 14;
  const chunks = [];
  let idx = 0, first = true;
  function pageHtml(c){
    return '<div class="p-page p-inner">' + cfg.head
      + (c.first ? (cfg.firstBlock || '') : '')
      + cfg.wrapOpen(c.first)
      + cfg.items.slice(c.start, c.end).map((r, i) => cfg.row(r, c.start + i)).join('')
      + cfg.wrapClose
      + (c.last && cfg.lastTail ? cfg.lastTail : '')
      + cfg.foot + '</div>';
  }
  while(idx < cfg.items.length){
    const c = { start: idx, end: idx, first: first, last: false };
    const el = document.createElement('div');
    el.innerHTML = pageHtml(c);
    const page = el.firstChild;
    host.appendChild(page);
    const container = page.querySelector(cfg.rowsSel);
    const bottomEl = page.querySelector(cfg.bottomSel);
    const foot = page.querySelector('.p-foot');
    const limit = foot.offsetTop - GAP;
    while(idx < cfg.items.length){
      container.insertAdjacentHTML('beforeend', cfg.row(cfg.items[idx], idx));
      if(bottomEl.offsetTop + bottomEl.offsetHeight > limit){
        container.lastElementChild.remove();
        break;
      }
      idx++;
    }
    if(idx === c.start){ idx++; } // one oversized row still gets kept - never drop data
    c.end = idx;
    host.removeChild(page);
    chunks.push(c);
    first = false;
  }
  if(chunks.length) chunks[chunks.length - 1].last = true;
  // the last-page tail (e.g. the extras note) needs room too - shrink the last page until it fits
  if(cfg.lastTail && chunks.length){
    let guard = 0;
    while(guard++ < 60){
      const c = chunks[chunks.length - 1];
      const el = document.createElement('div');
      el.innerHTML = pageHtml(c);
      const page = el.firstChild;
      host.appendChild(page);
      const tail = page.querySelector('[data-tail]');
      const bottomEl = tail || page.querySelector(cfg.bottomSel);
      const foot = page.querySelector('.p-foot');
      const fits = bottomEl.offsetTop + bottomEl.offsetHeight <= foot.offsetTop - GAP;
      host.removeChild(page);
      if(fits || c.end - c.start <= 1) break;
      chunks.push({ start: c.end - 1, end: c.end, first: false, last: true });
      c.end = c.end - 1;
      c.last = false;
    }
  }
  host.innerHTML = '';
  return chunks.map(pageHtml);
}

function articleRows(rows, startIdx, showTheme){
  let out = '';
  rows.forEach((r,i) => {
    out += '<tr><td><span class="numc">' + (startIdx+i+1) + '</span></td><td>' + esc(r.name) + '</td>' + (showTheme ? '<td>' + esc(r.theme||'') + '</td>' : '') + '<td>' + esc(r.size||'') + '</td><td>' + esc(r.qty||'') + '</td></tr>';
  });
  return out;
}

// the quotation's closing tax note (Deep, 7 Nov 2026): one professional sentence at the
// end of every quotation - never on the cover, never tied to the Budget field.
const GST_END_NOTE = 'Note: All quoted amounts are exclusive of GST.';
function gstEndNoteHtml(){
  return '<div class="note gst-end-note" data-tail>' + goldTxt(GST_END_NOTE, { size: 14, weight: 700, italic: true, on: 'light' }) + '</div>';
}

function buildArticlesPages(d, rows, gstTail){
  if(rows.length === 0) return [];
  const showTheme = rows.some(r => (r.theme || '').trim() !== '');
  const themeHead = showTheme ? '<th style="width:130px">' + esc(T('tblTheme')) + '</th>' : '';
  return paginateMeasured({
    head: innerHead(esc(isOrder(d) ? T('ordKicker') : T('articlesKicker')), esc(T('articlesTitle'))),
    firstBlock: infoCards(d),
    wrapOpen: (first) => '<table' + (first ? '' : ' style="margin-top:92px"') + '><thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblArticle')) + '</th>' + themeHead + '<th style="width:110px">' + esc(T('tblSize')) + '</th><th style="width:80px">' + esc(T('tblQty')) + '</th></tr></thead><tbody data-rows>',
    wrapClose: '</tbody></table>',
    rowsSel: '[data-rows]',
    bottomSel: 'table',
    row: (r, i) => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td>' + (showTheme ? '<td>' + esc(r.theme||'') + '</td>' : '') + '<td>' + esc(r.size||'') + '</td><td>' + esc(r.qty||'') + '</td></tr>',
    items: rows,
    foot: innerFoot(d),
    lastTail: gstTail ? gstEndNoteHtml() : ''
  });
}

function buildExtrasPages(d, rows){
  if(rows.length === 0) return [];
  return paginateMeasured({
    head: innerHead(T('extrasKicker'), esc(T('extrasTitle'))),
    firstBlock: infoCards(d),
    wrapOpen: (first) => '<table' + (first ? '' : ' style="margin-top:92px"') + '><thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblService')) + '</th><th style="width:330px">' + esc(T('tblRate')) + '</th></tr></thead><tbody data-rows>',
    wrapClose: '</tbody></table>',
    rowsSel: '[data-rows]',
    bottomSel: 'table',
    row: (r, i) => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td><td>' + esc(r.rate||'') + '</td></tr>',
    items: rows,
    foot: innerFoot(d),
    lastTail: (T('extrasNote') ? '<div class="note" data-tail>' + goldTxt(T('extrasNote'), { size: 14, weight: 700, italic: true, on: 'light' }) + '</div>' : '') + gstEndNoteHtml()
  });
}

// the reference-images disclaimer: always printed under the photos (admin can reword it, never remove it)
function refNoteHtml(){
  return '<div class="ref-note">' + goldTxt(T('refNote'), { size: 14, weight: 600, italic: true, on: 'light' }) + '</div>';
}

const REF_CONF = {
  collage: { per: 5, cls: 'ref-collage' },
  '3up':   { per: 3, cls: 'ref-3up' },
  '2up':   { per: 4, cls: 'ref-2up' },
  grid:    { per: 6, cls: 'ref-grid4' },
  n4:      { per: 4, cls: 'ref-n' },
  n5:      { per: 5, cls: 'ref-n' },
  n6:      { per: 6, cls: 'ref-n' }
};

function buildRefPages(d, images, layout){
  const pages = [];
  if(!images || images.length === 0) return pages;
  const conf = REF_CONF[layout] || REF_CONF.collage;
  for(let i = 0; i < images.length; i += conf.per){
    const chunk = images.slice(i, i + conf.per);
    const gcls = conf.cls === 'ref-n' ? 'ref-n n' + chunk.length : conf.cls;
    let cells = '';
    chunk.forEach(im => {
      cells += '<div class="cell"><img class="ph" src="' + im.img + '"><div class="cap">' + esc(im.caption || im.label || '') + '</div></div>';
    });
    pages.push('<div class="p-page p-inner">' + innerHead(esc(T('refKicker')), esc(T('refTitle')))
      + '<div class="ref-grid ' + gcls + '">' + cells + '</div>'
      + refNoteHtml()
      + innerFoot(d) + '</div>');
  }
  return pages;
}

// quotations must carry the GST note exactly once, at the end - even when there
// are no article/extra rows (reference-only or otherwise empty quotations).
function ensureGstNote(pages){
  if(pages.join('').includes('gst-end-note')) return pages;
  const note = gstEndNoteHtml();
  for(let i = pages.length - 1; i >= 0; i--){
    if(pages[i].includes('p-inner')){
      const fi = pages[i].lastIndexOf('<div class="p-foot"');
      if(fi > -1){ pages[i] = pages[i].slice(0, fi) + note + pages[i].slice(fi); return pages; }
    }
  }
  const last = pages.length - 1;
  const ci = pages[last].lastIndexOf('</div>');
  pages[last] = pages[last].slice(0, ci) + note + pages[last].slice(ci);
  return pages;
}

function buildBack(d){
  const lay = (typeof getTemplateLayout === 'function') ? getTemplateLayout(d.template) : 'arch';
  if(lay && lay[0] === 'g') return buildBackGen(d, lay);
  if(lay === 'ivory') return buildBackCert(d);
  if(lay === 'blush') return buildBackGarden(d);
  if(lay === 'minimal') return buildBackPoster(d);
  if(lay === 'band') return buildBackRegal(d);
  if(lay === 'spine') return buildBackEditorial(d);
  if(lay === 'crest') return buildBackRoyal(d);
  if(lay === 'dream') return buildBackSwiss(d);
  if(lay === 'noir') return buildBackNoir(d);
  return '<div class="p-page p-back">'
    + '<div class="bcirc" style="left:-120px;top:-110px;width:380px;height:380px"></div>'
    + '<div class="bcirc" style="right:-140px;bottom:130px;width:320px;height:320px"></div>'
    + '<div class="bk-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="bk-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="gbar bk-bar"></div>'
    + '<div class="bk-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + diamonds(5)
    + '<div class="bk-lines">'
    +   goldTxt(d.company, { size: 16, weight: 700, ls: 2 })
    +   goldTxt(d.address, { size: 13, weight: 500, ls: 2 })
    +   goldTxt(T('lblContact') + ': ' + d.footerContacts, { size: 13, weight: 500, ls: 1 })
    + '</div>'
    + '</div>';
}


// agreement cover: same layout as the quotation cover, agreement wording
// agreement pages: signature space for BOTH parties sits inside the footer, so the measured
// pagination always keeps it clear of the content
function agreeFoot(d, strip){
  if(!strip) return innerFoot(d);
  return '<div class="p-foot ag"><div class="ag-sigs">'
    + '<div class="ag-sig"><div class="ag-sigline"></div><div class="ag-siglab"><b>' + esc(A(d, 'agreeSignPlanner')) + '</b></div></div>'
    + '<div class="ag-sig"><div class="ag-sigline"></div><div class="ag-siglab"><b>' + esc(A(d, 'agreeSignClient')) + '</b>' + (d.clientName ? ' - ' + esc(d.clientName) : '') + '</div></div>'
    + '</div><div class="ag-frow"><div class="footline"></div>'
    + '<div class="fl">' + esc(T('lblBestRegards')) + ' ' + esc(d.signoff) + '<br><span class="co">' + esc(d.company) + '</span></div>'
    + '<div class="fr">' + goldTxt(d.contact + '   |   ' + d.address, { size: 13, weight: 600, ls: 1, on: 'light' }) + '</div></div></div>';
}

function buildAgreeCover(d){
  const lay = getTemplateLayout(d.template);
  if(lay[0] === 'g') return buildCoverGen(d, true, lay);
  if(lay === 'ivory') return buildCoverCert(d, true);
  if(lay === 'blush') return buildCoverGarden(d, true);
  if(lay === 'minimal') return buildCoverPoster(d, true);
  if(lay === 'band') return buildCoverRegal(d, true);
  if(lay === 'spine') return buildCoverEditorial(d, true);
  if(lay === 'crest') return buildCoverRoyal(d, true);
  if(lay === 'dream') return buildCoverSwiss(d, true);
  if(lay === 'noir') return buildCoverNoir(d, true);
  return '<div class="p-page p-cover">'
    + '<div class="cv-left">'
    +   '<div class="cv-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   diamonds(5)
    +   '<div class="cv-brand">' + goldTxt(T('coverTagline'), { size: 9.5, ls: 1.6 }) + '</div>'
    +   '<div class="cv-leftfoot"><div>' + esc(d.address) + '</div><div>' + esc(d.footerContacts) + '</div></div>'
    + '</div>'
    + '<div class="cv-right">'
    +   '<div class="cv-no">' + goldTxt(d.docNo ? T('agreeNoLabel') + d.docNo : A(d, 'agreeCoverNo'), { size: 13.5, ls: 4, on: 'light' }) + '</div>'
    +   '<div class="cv-title cv-title-sm">' + esc(A(d, 'agreeMainTitle')) + '</div>'
    +   '<div class="gbar cv-bar"></div>'
    +   '<div class="cv-sub">' + esc(A(d, 'agreeCoverSubtitle')) + '</div>'
    +   '<div class="cv-card"><div class="cv-cardbar"></div>'
    +     '<div class="cv-kicker">' + goldTxt(T('agreeClient'), { size: 12.5, ls: 3, on: 'light' }) + '</div>'
    +     (d.clientName ? '<div class="cname">' + esc(d.clientName) + '</div>' : '')
    +     (d.clientPlace ? '<div class="cline">' + esc(d.clientPlace) + '</div>' : '')
    +     (d.clientPhone ? '<div class="cline">' + esc(T('lblContact')) + ': ' + esc(d.clientPhone) + '</div>' : '')
    +     (eventLines(d).length ? '<div class="cline">' + esc(T('lblDate')) + ': ' + esc(eventLines(d).join(', ')) + '</div>' : '')
    +     (d.budget ? '<div class="pill">' + goldTxt(T('lblBudget').toUpperCase() + '   ' + d.budget, { size: 14, weight: 700, ls: 2 }) + '</div>' + (T('gstNote') ? '<div class="gst-note">' + esc(T('gstNote')) + '</div>' : '') : '')
    +   '</div>'
    + '</div>'
    + '</div>';
}

// ================= Agreement ("Wedding Planning Agreement") =================
function agreeCards(d){
  return '<div class="cards">'
    + '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(T('agreePlanner'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + esc(d.company).toUpperCase() + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.contact) + '</div></div>'
    + ((d.clientName || d.clientPlace || d.clientPhone) ? '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(T('agreeClient'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + esc(d.clientName) + (d.clientPlace ? '<br>' + esc(d.clientPlace) : '') + (d.clientPhone ? '<br>' + esc(T('lblContact')) + ': ' + esc(d.clientPhone) : '') + '</div></div>' : '')
    + '<div class="icard"><div class="icbar"></div><div class="iclabel">' + goldTxt(T('agreeDateBudget'), { size: 11.5, ls: 2, on: 'light' }) + '</div><div class="txt">' + eventLines(d).map(esc).join('<br>') + (d.budget ? '<br>' + esc(T('lblBudget')) + ': ' + esc(d.budget) + (T('gstNote') ? ' ' + esc(T('gstNote')) : '') : '') + '</div></div>'
    + '</div>';
}

function agreeHeading(txt){
  return '<div class="ag-h"><span>' + esc(txt) + '</span><div class="gbar ag-hbar"></div></div>';
}

function agreeItemLine(r, isExtra){
  let t = esc(r.name);
  if(isExtra){ if(r.rate) t += ' - ' + esc(r.rate); }
  else {
    const bits = [];
    if(r.qty) bits.push('Qty: ' + esc(r.qty));
    if(r.size) bits.push('Size: ' + esc(r.size) + ' ft');
    if(bits.length) t += ' <span class="ag-meta">(' + bits.join(', ') + ')</span>';
  }
  return '<div class="ag-item"><span class="dia ag-dia"></span><span class="ag-txt">' + t + '</span></div>';
}

// intro paragraph under the band on the first agreement page: "made on {date} between {planner} and {client}"
function agreeIntroBlock(d){
  const tpl = String(A(d, 'agreeIntro') || '');
  if(!tpl.trim()) return '';
  const filled = esc(tpl)
    .replace(/\{agreedate\}/g, esc(((d.agree || {}).agDate || '').trim() || '_______________'))
    .replace(/\{date\}/g, esc(eventLines(d).join(', ') || '_______________'))
    .replace(/\{planner\}/g, esc(d.signoff || d.company))
    .replace(/\{address\}/g, esc(d.address))
    .replace(/\{client\}/g, esc(d.clientName || '_______________'))
    .replace(/\{place\}/g, esc(d.clientPlace || '_______________'));
  return '<div class="ag-intro">' + filled + '</div>';
}

function buildAgreeArticlesPages(d, rows){
  if(rows.length === 0) return [];
  const showTheme = rows.some(r => (r.theme || '').trim() !== '');
  const themeHead = showTheme ? '<th style="width:130px">' + esc(T('tblTheme')) + '</th>' : '';
  return paginateMeasured({
    head: innerHead(esc(A(d, 'agreeKicker')), esc(T('agreeArticles'))),
    firstBlock: agreeIntroBlock(d) + '<div class="ag-parties">' + goldTxt(T('agreeParties'), { size: 12, ls: 3, on: 'light' }) + '</div>' + agreeCards(d),
    wrapOpen: (first) => '<table' + (first ? '' : ' style="margin-top:92px"') + '><thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblArticle')) + '</th>' + themeHead + '<th style="width:110px">' + esc(T('tblSize')) + '</th><th style="width:80px">' + esc(T('tblQty')) + '</th></tr></thead><tbody data-rows>',
    wrapClose: '</tbody></table>',
    rowsSel: '[data-rows]',
    bottomSel: 'table',
    row: (r, i) => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td>' + (showTheme ? '<td>' + esc(r.theme||'') + '</td>' : '') + '<td>' + esc(r.size||'') + '</td><td>' + esc(r.qty||'') + '</td></tr>',
    items: rows,
    foot: agreeFoot(d)
  });
}

function buildAgreeExtrasPages(d, rows){
  if(rows.length === 0) return [];
  return paginateMeasured({
    head: innerHead(esc(A(d, 'agreeKicker')), esc(A(d, 'agreeExtrasTitle'))),
    firstBlock: agreeCards(d),
    wrapOpen: (first) => '<table' + (first ? '' : ' style="margin-top:92px"') + '><thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblService')) + '</th><th style="width:330px">' + esc(T('tblRate')) + '</th></tr></thead><tbody data-rows>',
    wrapClose: '</tbody></table>',
    rowsSel: '[data-rows]',
    bottomSel: 'table',
    row: (r, i) => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td><td>' + esc(r.rate||'') + '</td></tr>',
    items: rows,
    foot: agreeFoot(d),
    lastTail: T('extrasNote') ? '<div class="note" data-tail>' + goldTxt(T('extrasNote'), { size: 14, weight: 700, italic: true, on: 'light' }) + '</div>' : ''
  });
}

function buildAgreeRefPages(d, images, layout){
  const pages = [];
  if(!images || images.length === 0) return pages;
  const conf = REF_CONF[layout] || REF_CONF.collage;
  for(let i = 0; i < images.length; i += conf.per){
    const chunk = images.slice(i, i + conf.per);
    const gcls = conf.cls === 'ref-n' ? 'ref-n n' + chunk.length : conf.cls;
    let cells = '';
    chunk.forEach(im => {
      cells += '<div class="cell"><img class="ph" src="' + im.img + '"><div class="cap">' + esc(im.caption || im.label || '') + '</div></div>';
    });
    pages.push('<div class="p-page p-inner ag-doc ag-refpg">' + innerHead(esc(A(d, 'agreeKicker')), esc(T('refTitle')))
      + '<div class="ref-grid ' + gcls + '">' + cells + '</div>'
      + refNoteHtml()
      + agreeFoot(d, i + conf.per >= images.length) + '</div>');
  }
  return pages;
}

// numbered Terms & Conditions pages; one term per line in the template text, numbering continues across pages
// ---- agreement payment figures for the {total} {advance} {balance} {duedate} placeholders in the terms ----
function agMoneyNum(v){
  const s = String(v == null ? '' : v).replace(/[,\s]/g, '').replace(/^(rs\.?|inr|\u20b9)/i, '');
  return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
}
function agMoneyFmt(n){
  const neg = n < 0; n = Math.abs(n);
  let [i, f] = n.toFixed(2).split('.');
  let last = i.slice(-3), rest = i.slice(0, -3);
  if(rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
  return (neg ? '-' : '') + 'Rs. ' + rest + last + (parseInt(f, 10) ? '.' + f : '');
}
function agMoneyShow(v){
  if(v == null || String(v).trim() === '') return '__________';
  const n = agMoneyNum(v);
  return n === null ? String(v).trim() : agMoneyFmt(n);
}
const AG_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function agParseFirstDate(d){
  const first = eventLines(d).join(' ');
  let m = first.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if(m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = first.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if(m){ const mi = AG_MONTHS.findIndex(x => x.slice(0, 3) === m[2].toLowerCase().slice(0, 3)); if(mi >= 0) return new Date(+m[3], mi, +m[1]); }
  m = first.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if(m){ const mi = AG_MONTHS.findIndex(x => x.slice(0, 3) === m[1].toLowerCase().slice(0, 3)); if(mi >= 0) return new Date(+m[3], mi, +m[2]); }
  return null;
}
function agDueText(d){
  const ov = ((d.agree || {}).due || '').trim();
  if(ov) return ov;
  const dt = agParseFirstDate(d);
  if(!dt || isNaN(dt)) return '__________';
  dt.setDate(dt.getDate() - 2);
  return dt.getDate() + ' ' + AG_MONTHS[dt.getMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + dt.getFullYear();
}
function agFill(txt, d){
  const a = d.agree || {};
  const t = agMoneyNum(a.total), ad = agMoneyNum(a.advance);
  const bal = (t !== null && ad !== null) ? agMoneyFmt(Math.max(t - ad, 0)) : '__________';
  return String(txt)
    .replace(/\{total\}/g, agMoneyShow(a.total))
    .replace(/\{advance\}/g, agMoneyShow(a.advance))
    .replace(/\{balance\}/g, bal)
    .replace(/\{duedate\}/g, agDueText(d));
}

function buildAgreeTermsPages(d){
  const terms = agFill(A(d, 'agreeTerms') || '', d).split('\n').map(t => t.trim()).filter(Boolean);
  const closing = agFill(A(d, 'agreeTermsClosing') || '', d).trim();
  if(!terms.length) return [];
  return paginateMeasured({
    head: innerHead(esc(A(d, 'agreeKicker')), esc(A(d, 'agreeTermsHead'))),
    wrapOpen: () => '<div class="term-list">',
    wrapClose: '</div>',
    rowsSel: '.term-list',
    bottomSel: '.term-list',
    row: (t, i) => '<div class="term-item"><span class="numc">' + (i+1) + '</span><span class="term-txt">' + esc(t) + '</span></div>',
    items: terms,
    foot: agreeFoot(d),
    lastTail: closing ? '<div class="term-closing" data-tail>' + esc(closing) + '</div>' : ''
  });
}

// final signatures page: planner + client columns with signature/name/date/place lines, then witness lines
function agreeSignBlock(d){
  const col = (labelKey, name) =>
    '<div class="sign-col"><div class="sign-collab">' + goldTxt(A(d, labelKey), { size: 12.5, ls: 2, on: 'light' }) + '</div>'
    + '<div class="sig-space"></div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabSignature')) + '</span><span class="sig-fill"></span></div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabName')) + '</span><span class="sig-fill">' + esc(name || '') + '</span></div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabDate')) + '</span><span class="sig-fill"></span></div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabPlace')) + '</span><span class="sig-fill"></span></div>'
    + '</div>';
  const wit = n =>
    '<div class="wit-row"><div class="wit-lab">' + goldTxt(A(d, 'agreeWitness') + ' ' + n, { size: 11.5, ls: 2, on: 'light' }) + '</div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabName')) + '</span><span class="sig-fill"></span></div>'
    + '<div class="sig-line"><span class="sig-lab">' + esc(T('sigLabSignature')) + '</span><span class="sig-fill"></span></div></div>';
  const note = String(A(d, 'agreeSignNote') || '').trim();
  return (note ? '<div class="ag-intro" style="margin-top:22px">' + esc(note) + '</div>' : '')
    + '<div class="sign-grid">' + col('agreeSignPlanner', d.signoff || d.company) + col('agreeSignClient', d.clientName) + '</div>'
    + '<!--W-->' + '<div class="wit-grid">' + wit(1) + wit(2) + '</div>';
}


// ---- continuous flow for the agreement: sections follow each other on the same page, so no
// half-empty pages. units: {g:group, sec:title, html|row(i)}; groups: raw | art | ext | terms
const AGT = 76; // gap under the (compact) agreement header band
function flowPages(d, units, theadFor, titleFor, kicker, stripLast){
  const host = pdfMeasureHost(), GAP = 14, pages = [];
  const cnt = {}; units.forEach(u => { if(u.row){ cnt[u.g] = (cnt[u.g] || 0); u.n = cnt[u.g]++; } });
  const isSign = u => u.sign;
  function render(list, pageFirstDoc){
    let out = '', i = 0, gi = 0, prevG = null, open = '', close = '';
    const flush = () => { out += close; close = ''; };
    list.forEach((u, k) => {
      if(u.g !== prevG){
        flush(); gi = 0; prevG = u.g;
        const atTop = (k === 0);
        const sec = (!atTop && u.sec) ? '<div class="flow-sec">' + goldTxt(u.sec, { size: 15, ls: 3, on: 'light' }) + '</div>' : '';
        if(u.g === 'art' || u.g === 'ext'){
          out += sec + '<table style="margin-top:' + (atTop ? (pageFirstDoc ? 0 : AGT) : 14) + 'px">' + theadFor(u.g) + '<tbody>'; close = '</tbody></table>';
        } else if(u.g === 'terms'){
          out += sec + '<div class="term-list" style="margin-top:' + (atTop ? AGT + 4 : 8) + 'px">'; close = '</div>';
        }
      }
      if(u.g === 'raw'){ out += (k === 0 && u.pad ? '<div style="height:' + (AGT + 4) + 'px"></div>' : '') + u.html; }
      else { out += u.row(u.n); }
    });
    flush();
    return out;
  }
  // Deep 10 Nov formatting: every agreement page carries the planner+client signature
  // strip in the footer, so no terms/articles page is left without a signing area.
  const footFor = () => agreeFoot(d, true);
  const pageHtml = (list, first) => '<div class="p-page p-inner ag-doc">' + innerHead(esc(kicker), esc(titleFor(list[0].sec)))
    + '<div data-flow>' + render(list, first) + '</div>' + footFor(list) + '</div>';
  let idx = 0, first = true;
  while(idx < units.length){
    const list = [];
    while(idx < units.length){
      list.push(units[idx]);
      const el = document.createElement('div');
      el.innerHTML = pageHtml(list, first);
      const page = el.firstChild;
      host.appendChild(page);
      const flowEl = page.querySelector('[data-flow]');
      const last = flowEl.lastElementChild;
      const foot = page.querySelector('.p-foot');
      const over = last.offsetTop + last.offsetHeight > foot.offsetTop - GAP;
      host.removeChild(page);
      if(over && list.length > 1){ const gone = list.pop(); if(gone.keepPrev && list.length > 1){ list.pop(); idx--; } break; }
      idx++;
    }
    pages.push(pageHtml(list, first));
    first = false;
  }
  host.innerHTML = '';
  return pages;
}

function agreeFlowA(d, mainRows, extraRows){
  const showTheme = mainRows.some(r => (r.theme || '').trim() !== '');
  const themeHead = showTheme ? '<th style="width:130px">' + esc(T('tblTheme')) + '</th>' : '';
  const theads = {
    art: '<thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblArticle')) + '</th>' + themeHead + '<th style="width:110px">' + esc(T('tblSize')) + '</th><th style="width:80px">' + esc(T('tblQty')) + '</th></tr></thead>',
    ext: '<thead><tr><th style="width:56px">' + esc(T('tblNo')) + '</th><th>' + esc(T('tblService')) + '</th><th style="width:330px">' + esc(T('tblRate')) + '</th></tr></thead>'
  };
  const units = [];
  const tA = T('agreeArticles'), tE = A(d, 'agreeExtrasTitle');
  units.push({ g: 'raw', sec: tA, html: agreeIntroBlock(d) + '<div class="ag-parties">' + goldTxt(T('agreeParties'), { size: 12, ls: 3, on: 'light' }) + '</div>' + agreeCards(d) });
  mainRows.forEach(r => units.push({ g: 'art', sec: tA, row: i => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td>' + (showTheme ? '<td>' + esc(r.theme||'') + '</td>' : '') + '<td>' + esc(r.size||'') + '</td><td>' + esc(r.qty||'') + '</td></tr>' }));
  extraRows.forEach(r => units.push({ g: 'ext', sec: tE, row: i => '<tr><td><span class="numc">' + (i+1) + '</span></td><td>' + esc(r.name) + '</td><td>' + esc(r.rate||'') + '</td></tr>' }));
  if(extraRows.length && T('extrasNote')) units.push({ g: 'raw', pad: true, keepPrev: true, sec: tE, html: '<div class="note">' + goldTxt(T('extrasNote'), { size: 14, weight: 700, italic: true, on: 'light' }) + '</div>' });
  return flowPages(d, units, g => theads[g], x => x, A(d, 'agreeKicker'), true);
}

function agreeFlowB(d){
  const terms = agFill(A(d, 'agreeTerms') || '', d).split('\n').map(t => t.trim()).filter(Boolean);
  const closing = agFill(A(d, 'agreeTermsClosing') || '', d).trim();
  const tT = A(d, 'agreeTermsHead');
  const units = [];
  terms.forEach(t => units.push({ g: 'terms', sec: tT, row: i => '<div class="term-item"><span class="numc">' + (i+1) + '</span><span class="term-txt">' + esc(t) + '</span></div>' }));
  if(closing) units.push({ g: 'raw', pad: true, sec: tT, html: '<div class="term-closing">' + esc(closing) + '</div>' });
  // The closing above is the single signing declaration - the sign note repeats it, so it is not rendered.
  const sb = agreeSignBlock(d).split('<!--W-->');
  units.push({ g: 'raw', pad: true, sec: A(d, 'agreeSignHead'), html: '<div class="flow-sigs"><div class="ag-sig"><div class="ag-sigline"></div><div class="ag-siglab"><b>' + esc(A(d, 'agreeSignPlanner')) + '</b></div></div><div class="ag-sig"><div class="ag-sigline"></div><div class="ag-siglab"><b>' + esc(A(d, 'agreeSignClient')) + '</b>' + (d.clientName ? ' - ' + esc(d.clientName) : '') + '</div></div></div>' });
  units.push({ g: 'raw', pad: true, sec: A(d, 'agreeSignHead'), sign: true, html: sb[1] });
  return flowPages(d, units, () => '', x => x, A(d, 'agreeKicker'));
}

// live preview: the same pages the PDF will contain, as HTML (no download)
function buildPreviewPages(d, mainRows, extraRows, refImages, imgLayout){
  if(d.docType === 'agreement'){
    const agKey = (/^(pal-|royal-|mocha-|aubergine-)/.test(d.template || '')) ? d.template : 'sage-gold';
    const host = pdfMeasureHost();
    applyTemplateVars(host, agKey); agLay(host);
    const pages = [buildAgreeCover(d)];
    pages.push(...agreeFlowA(d, mainRows, extraRows));
    pages.push(...buildAgreeRefPages(d, refImages, imgLayout));
    pages.push(...agreeFlowB(d));
    pages.push(buildBack(d));
    return { pages: pages, key: agKey, agreement: true };
  }
  applyTemplateVars(pdfMeasureHost(), d.template);
  const builders = {
    articles: () => buildArticlesPages(d, mainRows, !(extraRows && extraRows.length)),
    extras: () => buildExtrasPages(d, extraRows),
    reference: () => buildRefPages(d, refImages, imgLayout),
    back: () => [buildBack(d)]
  };
  const order = (S().pageOrder && S().pageOrder.length ? S().pageOrder : ['articles','extras','reference','back']);
  const pages = [buildCover(d)];
  order.forEach(k => { if(builders[k]) pages.push(...builders[k]()); });
  ensureGstNote(pages);
  return { pages: pages, key: d.template, agreement: false };
}

async function generateAgreementPDF(d, mainRows, extraRows, refImages, imgLayout, statusCb){
  await loadTaglineFonts();
  const stage = document.getElementById('pdfStage');
  // agreement format is frozen for now - always render it in the master design
  const pgBg = (typeof getTemplateTheme === 'function' ? (getTemplateTheme('sage-gold').theme || {}).pagebg : null) || '#f6f4ea';
  const agKey = (/^(pal-|royal-|mocha-|aubergine-)/.test(d.template || '')) ? d.template : 'sage-gold';
  const pgBg2 = (typeof getTemplateTheme === 'function' ? (getTemplateTheme(agKey).theme || {}).pagebg : null) || pgBg;
  [stage, pdfMeasureHost()].forEach(el => { if(typeof applyTemplateVars === 'function'){ applyTemplateVars(el, agKey); agLay(el); } });
  const pages = [buildAgreeCover(d)];
  pages.push(...agreeFlowA(d, mainRows, extraRows));
  pages.push(...buildAgreeRefPages(d, refImages, imgLayout));
  pages.push(...agreeFlowB(d));
  pages.push(buildBack(d));
  stage.innerHTML = pages.join('');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const els = stage.querySelectorAll('.p-page');
  for(let i = 0; i < els.length; i++){
    if(statusCb) statusCb('Page ' + (i+1) + ' of ' + els.length + ' rendering...');
    await Promise.all(Array.prototype.map.call(els[i].querySelectorAll('img'), im => (im.complete && im.naturalWidth) ? 1 : im.decode().catch(function(){ return 0; })));
    const canvas = await html2canvas(els[i], { scale: 2, useCORS: true, backgroundColor: pgBg2, logging: false });
    const img = canvas.toDataURL('image/jpeg', 0.9);
    if(i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
  }
  stage.innerHTML = '';
  if(typeof clearTemplateVars === 'function') clearTemplateVars(stage);
  const safe = (d.clientName || 'Client').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const agrFname = 'BBTH-Agreement-' + safe + '.pdf';
  pdf.save(agrFname);
  window.lastGeneratedPdf = pdf;
  window.lastGeneratedPdfName = agrFname;
}

async function generateQuotationPDF(d, mainRows, extraRows, refImages, imgLayout, statusCb){
  await loadTaglineFonts();
  const stage = document.getElementById('pdfStage');
  const pgBg = (typeof getTemplateTheme === 'function' ? (getTemplateTheme(d.template).theme || {}).pagebg : null) || '#f6f4ea';
  if(typeof applyTemplateVars === 'function') applyTemplateVars(stage, d.template);
  if(typeof applyTemplateVars === 'function') applyTemplateVars(pdfMeasureHost(), d.template);
  const builders = {
    articles: () => buildArticlesPages(d, mainRows, !(extraRows && extraRows.length)),
    extras: () => buildExtrasPages(d, extraRows),
    reference: () => buildRefPages(d, refImages, imgLayout),
    back: () => [buildBack(d)]
  };
  const order = (S().pageOrder && S().pageOrder.length ? S().pageOrder : ['articles','extras','reference','back']);
  const pages = [buildCover(d)];
  order.forEach(k => { if(builders[k]) pages.push(...builders[k]()); });
  ensureGstNote(pages);
  stage.innerHTML = pages.join('');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const els = stage.querySelectorAll('.p-page');
  for(let i = 0; i < els.length; i++){
    if(statusCb) statusCb('Page ' + (i+1) + ' of ' + els.length + ' rendering...');
    // wait for gold-text SVG images to finish decoding so html2canvas never races them
    await Promise.all(Array.prototype.map.call(els[i].querySelectorAll('img'), im => (im.complete && im.naturalWidth) ? 1 : im.decode().catch(function(){ return 0; })));
    const canvas = await html2canvas(els[i], { scale: 2, useCORS: true, backgroundColor: pgBg, logging: false });
    const img = canvas.toDataURL('image/jpeg', 0.9);
    if(i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
  }
  stage.innerHTML = '';
  if(typeof clearTemplateVars === 'function') clearTemplateVars(stage);
  const safe = (d.clientName || 'Client').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const quoFname = 'BBTH-' + (isOrder(d) ? 'Execution-Brief-' : 'Quotation-') + safe + '.pdf';
  pdf.save(quoFname);
  window.lastGeneratedPdf = pdf;
  window.lastGeneratedPdfName = quoFname;
}

// agreement inner pages always use the arch layout (template colours still apply)
function agLay(el){
  const l = getTemplateLayout(el.dataset.template);
  if(l !== 'arch') return;
  el.classList.remove('lay-ivory','lay-blush','lay-minimal'); el.classList.add('lay-arch');
}

// ================= Extra layouts: band, spine, crest (own designs, not recolours) =================
function agreeCardInner(d){
  return '<div class="cv-kicker">' + goldTxt(T('agreeClient'), { size: 12.5, ls: 3, on: 'light' }) + '</div>'
    + (d.clientName ? '<div class="cname">' + esc(d.clientName) + '</div>' : '')
    + (d.clientPlace ? '<div class="cline">' + esc(d.clientPlace) + '</div>' : '')
    + (d.clientPhone ? '<div class="cline">' + esc(T('lblContact')) + ': ' + esc(d.clientPhone) + '</div>' : '')
    + (eventLines(d).length ? '<div class="cline">' + esc(T('lblDate')) + ': ' + esc(eventLines(d).join(', ')) + '</div>' : '')
    + (d.budget ? '<div class="pill">' + goldTxt(T('lblBudget').toUpperCase() + '   ' + d.budget, { size: 14, weight: 700, ls: 2 }) + '</div>' + (T('gstNote') ? '<div class="gst-note">' + esc(T('gstNote')) + '</div>' : '') : '');
}
function quoteCardInner(d){
  return '<div class="cv-kicker">' + goldTxt(isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'), { size: 12.5, ls: 3, on: 'light' }) + '</div>'
    + covClientLines(d)
    + (d.budget ? '<div class="pill">' + goldTxt(T('lblBudget').toUpperCase() + '   ' + d.budget, { size: 14, weight: 700, ls: 2 }) + '</div>' : '');
}
function coverTexts(d, ag){
  return ag
    ? { kick: 'WEDDING PLANNING', title: A(d, 'agreeMainTitle'), sub: A(d, 'agreeCoverSubtitle') }
    : { kick: 'WEDDING PLANNING', title: isOrder(d) ? T('ordCoverTitle') : T('coverTitle'), sub: isOrder(d) ? T('ordCoverSub') : T('coverSubtitle') };
}
function coverNoLine(d){
  return goldTxt(d.docNo ? T('agreeNoLabel') + d.docNo : A(d, 'agreeCoverNo'), { size: 13, ls: 4, on: 'light' });
}

// ---- band: grand full-width colour band with the crest arch ----
function buildCoverBand(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-band">'
    + '<div class="cbd-band"><div class="bcirc" style="right:-100px;top:-140px;width:340px;height:340px"></div><div class="bcirc" style="left:-120px;bottom:-160px;width:300px;height:300px"></div>'
    + '<div class="cbd-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + diamonds(5) + '</div>'
    + '<div class="gbar cbd-edge"></div>'
    + (ag ? '<div class="cbd-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="cbd-kicker">' + goldTxt(tx.kick, { size: 12.5, ls: 6 }) + '</div>'
    + '<div class="cbd-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="gbar cbd-bar"></div>'
    + '<div class="cbd-sub">' + esc(tx.sub) + '</div>'
    + '<div class="cbd-card">' + (ag ? agreeCardInner(d) : quoteCardInner(d)) + '</div>'
    + '<div class="cbd-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackBand(d){
  return '<div class="p-page p-back bck-band">'
    + '<div class="bbd-top"><div class="bcirc" style="right:-90px;top:-120px;width:300px;height:300px"></div><div class="bcirc" style="left:-110px;bottom:-140px;width:280px;height:280px"></div><div class="bbd-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div></div>'
    + '<div class="gbar cbd-edge"></div>'
    + '<div class="bbd-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="bbd-dias">' + diamonds(1) + '</div>'
    + '<div class="bbd-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bbd-co">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- spine: editorial colour spine with vertical lettering ----
function buildCoverSpine(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-spine">'
    + '<div class="csp-spine"><div class="csp-dt">' + diamonds(3) + '</div><div class="csp-vert">' + esc(d.company).toUpperCase() + '</div><div class="csp-db">' + diamonds(3) + '</div></div>'
    + '<div class="csp-main">'
    + '<div class="csp-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + (ag ? '<div class="csp-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="csp-kicker">' + goldTxt(tx.kick, { size: 12, ls: 5 }) + '</div>'
    + '<div class="csp-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="gbar csp-bar"></div>'
    + '<div class="csp-sub">' + esc(tx.sub) + '</div>'
    + '<div class="csp-card">' + (ag ? agreeCardInner(d) : quoteCardInner(d)) + '</div>'
    + '<div class="csp-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div></div>';
}
function buildBackSpine(d){
  return '<div class="p-page p-back bck-spine">'
    + '<div class="bsp-spine"><div class="csp-vert">' + esc(d.company).toUpperCase() + '</div></div>'
    + '<div class="bsp-main">'
    + '<div class="bsp-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="bsp-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="gbar bsp-bar"></div>'
    + '<div class="bsp-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bsp-co">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div></div>';
}

// ---- crest: centred royal crest between double gold rules ----
function buildCoverCrest(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-crest">'
    + '<div class="ccr-rt"></div><div class="ccr-rb"></div>'
    + '<div class="ccr-kicker">' + goldTxt(tx.kick, { size: 12.5, ls: 6 }) + '</div>'
    + (ag ? '<div class="ccr-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="ccr-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="ccr-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="ccr-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="ccr-sub">' + esc(tx.sub) + '</div>'
    + '<div class="ccr-card"><div class="ccr-cardin">' + (ag ? agreeCardInner(d) : quoteCardInner(d)) + '</div></div>'
    + '<div class="ccr-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackCrest(d){
  return '<div class="p-page p-back bck-crest">'
    + '<div class="ccr-rt"></div><div class="ccr-rb"></div>'
    + '<div class="bcr-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="bcr-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="ccr-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="bcr-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bcr-co">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- dream: soft rounded modern panel (powder blue + silver family) ----
function buildCoverDream(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-dream">'
    + '<div class="cdr-panel"></div>'
    + '<div class="cdr-kicker">' + silverTxt(tx.kick, { size: 12, ls: 6 }) + '</div>'
    + '<div class="cdr-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + (ag ? '<div class="cdr-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="cdr-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="gbar cdr-bar"></div>'
    + '<div class="cdr-sub">' + esc(tx.sub) + '</div>'
    + '<div class="cdr-card">' + (ag ? agreeCardInner(d) : quoteCardInner(d)) + '</div>'
    + '<div class="cdr-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackDream(d){
  return '<div class="p-page p-back bck-dream">'
    + '<div class="cdr-panel"></div>'
    + '<div class="bdr-arch">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="bdr-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="gbar bdr-bar"></div>'
    + '<div class="bdr-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="bdr-co">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ================= 8 design languages v3 (Deep 4:55 PM) =================
// hero lockup everywhere, zero filled boxes/plaques/cards, full-bleed art, mixed orientations.
function metaLines(d){
  return { name: d.clientName || '', place: d.clientPlace || '', phone: d.clientPhone ? (T('lblContact') + ': ' + d.clientPhone) : '',
           date: eventLines(d).length ? (T('lblDate') + ': ' + eventLines(d).join(', ')) : '', budget: d.budget || '' };
}
function gstLine(d, cls){
  return '';
}
function heroMetaCenter(d, ag, p){
  const m = metaLines(d);
  return '<div class="' + p + '-meta">'
    + '<div class="' + p + '-mrule"></div>'
    + '<div class="' + p + '-mlab">' + goldTxt(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor')), { size: 11, ls: 4 }) + '</div>'
    + '<div class="' + p + '-mname">' + esc(m.name) + '</div>'
    + '<div class="' + p + '-mline">' + [m.place, m.phone, m.date].filter(Boolean).map(esc).join(' &nbsp;&middot;&nbsp; ') + '</div>'
    + (m.budget ? '<div class="' + p + '-mbud">' + goldTxt(T('lblBudget').toUpperCase() + '  ·  ' + m.budget, { size: 13.5, weight: 700, ls: 2 }) + '</div>' + gstLine(d, p + '-mgst') : '')
    + '<div class="' + p + '-mrule"></div>'
    + '</div>';
}
function heroCols(d, ag, p){
  const m = metaLines(d);
  return '<div class="' + p + '-grid">'
    + '<div class="' + p + '-col"><div class="' + p + '-lab">' + esc(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'))) + '</div><div class="' + p + '-val"><b>' + esc(m.name) + '</b>' + (m.place ? '<br>' + esc(m.place) : '') + (m.phone ? '<br>' + esc(m.phone) : '') + '</div></div>'
    + '<div class="' + p + '-col"><div class="' + p + '-lab">' + esc(T('lblDate')) + '</div><div class="' + p + '-val">' + esc(eventLines(d).join(', ')) + '</div></div>'
    + (m.budget ? '<div class="' + p + '-col"><div class="' + p + '-lab">' + esc(T('lblBudget')) + '</div><div class="' + p + '-val"><b>' + esc(m.budget) + '</b>' + '</div></div>' : '')
    + '</div>';
}
function refText(d, ag){
  return ag ? (d.docNo ? T('agreeNoLabel') + d.docNo : A(d, 'agreeCoverNo')) : (d.docNo ? T('ordNoLabel') + d.docNo : '');
}

// ---- 1. GILDED FRAME (ivory + champagne): fine gold line-art frame, hero lockup ----
function buildCoverCert(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-ivory">'
    + '<div class="gfr-glow"></div><div class="gfr-o1"></div><div class="gfr-o2"></div>'
    + '<div class="gfr-cn tl"></div><div class="gfr-cn tr"></div><div class="gfr-cn bl"></div><div class="gfr-cn br"></div>'
    + '<div class="gfr-kicker">' + goldTxt(tx.kick, { size: 11, ls: 8 }) + '</div>'
    + '<div class="gfr-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + (ag ? '<div class="gfr-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="gfr-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="ccr-orn gfr-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="gfr-sub">' + esc(tx.sub) + '</div>'
    + heroMetaCenter(d, ag, 'gfr')
    + '<div class="gfr-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackCert(d){
  return '<div class="p-page p-back bck-ivory">'
    + '<div class="gfr-glow"></div><div class="gfr-o1"></div><div class="gfr-o2"></div>'
    + '<div class="gfr-cn tl"></div><div class="gfr-cn tr"></div><div class="gfr-cn bl"></div><div class="gfr-cn br"></div>'
    + '<div class="gfr-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="gfr-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="ccr-orn gfr-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="gfr-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="gfr-brule"></div>'
    + '<div class="gfr-bco">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- 2. DARK HORIZON (maroon + antique gold): horizontal split, hero lockup ----
function buildCoverRoyal(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-crest">'
    + '<div class="dkh-glow"></div>'
    + '<div class="dkh-cn tl"></div><div class="dkh-cn tr"></div><div class="dkh-cn bl"></div><div class="dkh-cn br"></div>'
    + '<div class="dkh-kicker">' + goldTxt(tx.kick, { size: 11.5, ls: 9 }) + '</div>'
    + '<div class="dkh-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="dkh-sep"><i></i><span class="dia"></span><i></i></div>'
    + (ag ? '<div class="dkh-no">' + goldTxt(refText(d, true), { size: 13, ls: 4 }) + '</div>' : '')
    + '<div class="dkh-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="dkh-sub">' + esc(tx.sub) + '</div>'
    + heroMetaCenter(d, ag, 'dkh')
    + '<div class="dkh-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackRoyal(d){
  return '<div class="p-page p-back bck-crest">'
    + '<div class="dkh-glow"></div>'
    + '<div class="dkh-cn tl"></div><div class="dkh-cn tr"></div><div class="dkh-cn bl"></div><div class="dkh-cn br"></div>'
    + '<div class="dkh-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="dkh-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="dkh-sep"><i></i><span class="dia"></span><i></i></div>'
    + '<div class="dkh-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="dkh-bco">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- 3. VERTICAL SPLIT (sage + white): full-height colour panel with hero lockup ----
function buildCoverPoster(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-min">'
    + '<div class="vsp-panel"><div class="vsp-tex"></div>'
    +   '<div class="vsp-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   '<div class="vsp-edge"></div>'
    +   (refText(d, ag) ? '<div class="vsp-ref">' + esc(refText(d, ag)) + '</div>' : '')
    + '</div>'
    + '<div class="vsp-main">'
    +   '<div class="vsp-kicker">' + goldTxt(tx.kick, { size: 11, ls: 6 }) + '</div>'
    +   '<div class="vsp-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    +   '<div class="vsp-rule"></div>'
    +   '<div class="vsp-sub">' + esc(tx.sub) + '</div>'
    +   heroCols(d, ag, 'vsp')
    +   '<div class="vsp-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>'
    + '</div>';
}
function buildBackPoster(d){
  return '<div class="p-page p-back bck-min">'
    + '<div class="vsp-panel vsp-pright"><div class="vsp-tex"></div>'
    +   '<div class="vsp-logo vsp-blog">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   '<div class="vsp-edge vsp-eleft"></div>'
    + '</div>'
    + '<div class="vsp-main vsp-mback">'
    +   '<div class="vsp-thanks">' + esc(T('thanksTitle')) + '</div>'
    +   '<div class="vsp-rule"></div>'
    +   '<div class="vsp-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    +   '<div class="vsp-bco">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>'
    + '</div>';
}

// ---- 4. ROMANTIC HALO (dusty rose): concentric line circles around hero lockup ----
function buildCoverGarden(d, ag){
  const tx = coverTexts(d, ag), m = metaLines(d);
  let dots = '';
  for(let i = 0; i < 12; i++) dots += '<div class="rhl-dot" style="transform: rotate(' + (i * 30) + 'deg) translateY(-238px)"></div>';
  return '<div class="p-page p-cover cov-blush">'
    + '<div class="rhl-halo"><div class="rhl-c1"></div><div class="rhl-c2"></div><div class="rhl-c3"></div>' + dots
    +   '<div class="rhl-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '</div>'
    + '<div class="rhl-kicker">' + goldTxt(tx.kick, { size: 11.5, ls: 7 }) + '</div>'
    + (ag ? '<div class="rhl-no">' + coverNoLine(d) + '</div>' : '')
    + '<div class="rhl-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="rhl-dots"><span></span><span></span><span></span></div>'
    + '<div class="rhl-sub">' + esc(tx.sub) + '</div>'
    + '<div class="rhl-meta">'
    +   '<div class="rhl-col"><div class="rhl-lab">' + esc(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'))) + '</div><div class="rhl-name">' + esc(m.name) + '</div><div class="rhl-val">' + [m.place, m.phone].filter(Boolean).map(esc).join('<br>') + '</div></div>'
    +   '<div class="rhl-col"><div class="rhl-lab">' + esc(T('cardDateBudget')) + '</div><div class="rhl-val">' + esc(eventLines(d).join(', ')) + (m.budget ? '<br><b>' + esc(T('lblBudget')) + ': ' + esc(m.budget) + '</b>' : '') + '</div></div>'
    + '</div>'
    + '<div class="rhl-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackGarden(d){
  return '<div class="p-page p-back bck-blush">'
    + '<div class="rhl-halo rhl-bhalo"><div class="rhl-c1"></div><div class="rhl-c2"></div><div class="rhl-c3"></div>'
    +   '<div class="rhl-logo rhl-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '</div>'
    + '<div class="rhl-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="rhl-dots"><span></span><span></span><span></span></div>'
    + '<div class="rhl-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="rhl-bco">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- 5. NOIR DECO (black + gold): stepped line corners, hero gold lockup ----
function buildCoverNoir(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-noir">'
    + '<div class="nr2-glow"></div><div class="cno-f1"></div><div class="cno-f2"></div>'
    + '<div class="nr2-kicker">' + goldTxt(tx.kick, { size: 11.5, ls: 8 }) + '</div>'
    + '<div class="nr2-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + (ag ? '<div class="nr2-no">' + goldTxt(refText(d, true), { size: 13, ls: 4 }) + '</div>' : '')
    + '<div class="nr2-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="ccr-orn nr2-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="nr2-sub">' + esc(tx.sub) + '</div>'
    + heroMetaCenter(d, ag, 'nr2')
    + '<div class="nr2-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackNoir(d){
  return '<div class="p-page p-back bck-noir">'
    + '<div class="nr2-glow"></div><div class="cno-f1"></div><div class="cno-f2"></div>'
    + '<div class="nr2-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="nr2-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="ccr-orn nr2-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="nr2-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="nr2-brule"></div>'
    + '<div class="nr2-bco">' + esc(d.company) + '<br>' + esc(d.address) + '<br>' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- 6. EDITORIAL (rust + terracotta): lockup IS the masthead, huge italic headline ----
function buildCoverEditorial(d, ag){
  const tx = coverTexts(d, ag), m = metaLines(d);
  return '<div class="p-page p-cover cov-spine">'
    + '<div class="emg-glow"></div>'
    + '<div class="emg-mast">'
    +   '<div class="emg-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   '<div class="emg-rule"></div>'
    +   '<div class="emg-refline"><span>' + esc(d.company).toUpperCase() + '</span><span>' + esc(refText(d, ag)) + '</span></div>'
    +   '<div class="emg-rule emg-rule2"></div>'
    + '</div>'
    + '<div class="emg-kicker">' + esc(tx.kick) + '</div>'
    + '<div class="emg-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="emg-stand">' + esc(tx.sub) + '</div>'
    + '<div class="emg-grid">'
    +   '<div class="emg-col"><div class="emg-lab">' + esc(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'))) + '</div><div class="emg-val"><b>' + esc(m.name) + '</b>' + (m.place ? '<br>' + esc(m.place) : '') + (m.phone ? '<br>' + esc(m.phone) : '') + '</div></div>'
    +   '<div class="emg-col"><div class="emg-lab">' + esc(T('lblDate')) + '</div><div class="emg-val">' + esc(eventLines(d).join(', ')) + '</div></div>'
    +   (m.budget ? '<div class="emg-col"><div class="emg-lab">' + esc(T('lblBudget')) + '</div><div class="emg-val"><b>' + esc(m.budget) + '</b>' + '</div></div>' : '')
    + '</div>'
    + '<div class="emg-vert">' + esc(d.company).toUpperCase() + '</div>'
    + '<div class="emg-foot"><span>' + esc(d.address) + '</span><span>' + esc(d.footerContacts) + '</span></div>'
    + '</div>';
}
function buildBackEditorial(d){
  return '<div class="p-page p-back bck-spine">'
    + '<div class="emg-glow"></div>'
    + '<div class="emg-mast">'
    +   '<div class="emg-logo emg-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   '<div class="emg-rule"></div>'
    +   '<div class="emg-refline"><span>' + esc(d.company).toUpperCase() + '</span><span>' + esc(d.footerContacts) + '</span></div>'
    +   '<div class="emg-rule emg-rule2"></div>'
    + '</div>'
    + '<div class="emg-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="emg-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="emg-brule"></div>'
    + '<div class="emg-bco">' + esc(d.address) + '</div>'
    + '<div class="emg-vert">' + esc(d.company).toUpperCase() + '</div>'
    + '</div>';
}

// ---- 7. ARCH LINE (emerald + ivory): giant gold line-art arch with hero lockup ----
function buildCoverRegal(d, ag){
  const tx = coverTexts(d, ag), m = metaLines(d);
  return '<div class="p-page p-cover cov-band">'
    + '<div class="aln-glow"></div>'
    + '<div class="aln-kicker">' + goldTxt(tx.kick, { size: 11, ls: 9 }) + '</div>'
    + '<div class="aln-arch"><div class="aln-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div></div>'
    + (ag ? '<div class="aln-no">' + goldTxt(refText(d, true), { size: 13, ls: 4 }) + '</div>' : '')
    + '<div class="aln-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    + '<div class="ccr-orn aln-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="aln-sub">' + esc(tx.sub) + '</div>'
    + '<div class="aln-meta">'
    +   '<div class="aln-mrule"></div>'
    +   '<div class="aln-mname">' + esc(m.name) + (m.place ? ' &nbsp;&middot;&nbsp; ' + esc(m.place) : '') + '</div>'
    +   '<div class="aln-mline">' + [m.phone, m.date].filter(Boolean).map(esc).join(' &nbsp;&middot;&nbsp; ') + '</div>'
    +   (m.budget ? '<div class="aln-mbud">' + goldTxt(T('lblBudget').toUpperCase() + '  ·  ' + m.budget, { size: 13.5, weight: 700, ls: 2 }) + '</div>' + gstLine(d, 'aln-mgst') : '')
    + '</div>'
    + '<div class="aln-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}
function buildBackRegal(d){
  return '<div class="p-page p-back bck-band">'
    + '<div class="aln-glow"></div>'
    + '<div class="aln-arch aln-barch"><div class="aln-logo aln-blogo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div></div>'
    + '<div class="aln-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="ccr-orn aln-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
    + '<div class="aln-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="aln-bco">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div>';
}

// ---- 8. SWISS GRID (powder blue + silver): sans bold, outlined geometry, hero lockup ----
function buildCoverSwiss(d, ag){
  const tx = coverTexts(d, ag);
  return '<div class="p-page p-cover cov-dream">'
    + '<div class="swg-sq1"></div><div class="swg-sq2"></div><div class="swg-sq3"></div>'
    + '<div class="swg-top"><div class="swg-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    +   (ag ? '<div class="swg-no">' + esc(refText(d, true)) + '</div>' : '<div class="swg-no">' + silverTxt(tx.kick, { size: 11, ls: 6 }) + '</div>')
    + '</div>'
    + '<div class="swg-body">'
    +   (ag ? '<div class="swg-kick">' + silverTxt(tx.kick, { size: 11, ls: 6 }) + '</div>' : '')
    +   '<div class="swg-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
    +   '<div class="swg-rule"></div>'
    +   '<div class="swg-sub">' + esc(tx.sub) + '</div>'
    +   heroCols(d, ag, 'swg')
    + '</div>'
    + '<div class="swg-foot"><span>' + esc(d.company) + '</span><span>' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</span></div>'
    + '</div>';
}
function buildBackSwiss(d){
  return '<div class="p-page p-back bck-dream">'
    + '<div class="swg-sq2"></div><div class="swg-sq4"></div>'
    + '<div class="swg-top"><div class="swg-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div></div>'
    + '<div class="swg-body">'
    +   '<div class="swg-thanks">' + esc(T('thanksTitle')) + '</div>'
    +   '<div class="swg-rule"></div>'
    +   '<div class="swg-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '</div>'
    + '<div class="swg-foot"><span>' + esc(d.company) + '</span><span>' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</span></div>'
    + '</div>';
}

// ================= GEN series (Deep 5:17 PM: 20-50 unique designs) =================
// spec per layout key: skeleton + palette. Hero lockup, no filled boxes, full-bleed art.
const GEN_SPECS = {
  g1: { sk: 'corner',    dark: true,  pal: { bg:'#0b4f46', bg2:'#0e5f53', ink:'#f2ead6', acc:'#c9a55e', acc2:'#8a7a4a', mut:'#b8c8bd', dink:'#173528' } },
  g2: { sk: 'topband',   dark: true,  pal: { bg:'#6e1f33', bg2:'#511628', ink:'#f5e9da', acc:'#d4a95c', acc2:'#a8842c', mut:'#c8a9a2', dink:'#3d1420' } },
  g3: { sk: 'rail',      dark: false, pal: { bg:'#f6f0e2', bg2:'#efe4cc', ink:'#4a3524', acc:'#b28a4a', acc2:'#8a6a34', mut:'#8a7a5c', dink:'#4a3524' } },
  g4: { sk: 'pillar',    dark: false, pal: { bg:'#faf0ee', bg2:'#f3e2de', ink:'#572a3a', acc:'#c48a7a', acc2:'#a86458', mut:'#9a7a72', dink:'#572a3a' } },
  g5: { sk: 'bigarch',   dark: true,  pal: { bg:'#22345c', bg2:'#16233f', ink:'#eef3fa', acc:'#a9c7ea', acc2:'#7d9cc0', mut:'#93a7c4', dink:'#22345c' } },
  g6: { sk: 'posterbot', dark: false, pal: { bg:'#eef5ef', bg2:'#e2eee6', ink:'#1d4a3c', acc:'#5e9c84', acc2:'#88b8a4', mut:'#6a857a', dink:'#1d4a3c' } }
};
function gPal(lay){ return GEN_SPECS[lay].pal; }
function gRoot(lay, kind){
  const s = GEN_SPECS[lay], p = s.pal;
  return '<div class="p-page ' + (kind === 'back' ? 'p-back' : 'p-cover') + ' gk-' + s.sk + (s.dark ? '' : ' sk-light') + '" style="--bg:' + p.bg + ';--bg2:' + p.bg2 + ';--ink:' + p.ink + ';--acc:' + p.acc + ';--acc2:' + p.acc2 + ';--mut:' + p.mut + ';--dink:' + p.dink + '">';
}
function gKick(d, ag, tx){
  const r = refText(d, ag);
  return esc(tx.kick) + (ag && r ? ' &nbsp;&middot;&nbsp; ' + esc(r) : '');
}
function gMetaCols(d, ag){
  const m = metaLines(d);
  return '<div class="gm-grid">'
    + '<div class="gm-col"><div class="gm-lab">' + esc(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'))) + '</div><div class="gm-val"><b>' + esc(m.name) + '</b>' + (m.place ? '<br>' + esc(m.place) : '') + (m.phone ? '<br>' + esc(m.phone) : '') + '</div></div>'
    + '<div class="gm-col"><div class="gm-lab">' + esc(T('lblDate')) + '</div><div class="gm-val">' + esc(eventLines(d).join(', ')) + '</div></div>'
    + (m.budget ? '<div class="gm-col"><div class="gm-lab">' + esc(T('lblBudget')) + '</div><div class="gm-val"><b>' + esc(m.budget) + '</b>' + (ag && T('gstNote') ? '<br><span class="gm-gst">' + esc(T('gstNote')) + '</span>' : '') + '</div></div>' : '')
    + '</div>';
}
function gMetaCenter(d, ag){
  const m = metaLines(d);
  return '<div class="gm-cen"><div class="gm-hr"></div>'
    + '<div class="gm-lab">' + esc(ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor'))) + '</div>'
    + '<div class="gm-name">' + esc(m.name) + '</div>'
    + '<div class="gm-line">' + [m.place, m.phone, m.date].filter(Boolean).map(esc).join(' &nbsp;&middot;&nbsp; ') + '</div>'
    + (m.budget ? '<div class="gm-bud">' + esc(T('lblBudget')) + ': ' + esc(m.budget) + (ag && T('gstNote') ? ' <span class="gm-gst">' + esc(T('gstNote')) + '</span>' : '') + '</div>' : '')
    + '<div class="gm-hr"></div></div>';
}
function buildCoverGen(d, ag, lay){
  const tx = coverTexts(d, ag), sk = GEN_SPECS[lay].sk, K = gKick(d, ag, tx);
  const logo = archFrame('', taglineHtml('tg-arch', true));
  let h = gRoot(lay, 'cover');
  if(sk === 'corner'){
    h += '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'topband'){
    h += '<div class="gk-band"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-hr"></div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot"><span>' + esc(d.company) + '</span><span>' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</span></div>';
  } else if(sk === 'rail'){
    h += '<div class="gk-rrail"></div><div class="gk-vert">' + esc(d.company).toUpperCase() + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'pillar'){
    h += '<div class="gk-pl"></div><div class="gk-pr"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'bigarch'){
    h += '<div class="gk-a1"></div><div class="gk-a2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'posterbot'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-hr"></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'ticket'){
    h += '<div class="gk-toprow"><span>' + K + '</span><span>' + esc(d.company).toUpperCase() + '</span></div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-dsh"></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'sunrise'){
    h += '<div class="gk-arc1"></div><div class="gk-arc2"></div><div class="gk-arc3"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'checker'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-circ"></div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'offframe'){
    h += '<div class="gk-fT"></div><div class="gk-fL"></div><div class="gk-fB"></div><div class="gk-fR"></div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'cband'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-band"></div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'duocols'){
    const m = metaLines(d);
    h += '<div class="gk-col"></div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-vtitle">' + esc(tx.title) + '</div>'
      + '<div class="gk-right">'
      +   '<div class="gk-kick">' + K + '</div>'
      +   '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      +   gMetaRows(d, ag)
      + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'diagband'){
    h += '<div class="gk-db1"></div><div class="gk-db2"></div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'corners'){
    h += '<div class="gk-c1"></div><div class="gk-c2"></div><div class="gk-c3"></div><div class="gk-c4"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'monogram'){
    let wm = '';
    for(let r = 0; r < 11; r++){ let row = ''; for(let c = 0; c < 7; c++){ row += '<span>BBTH</span>'; } wm += '<div class="gk-wmrow"' + (r % 2 ? ' style="margin-left:70px"' : '') + '>' + row + '</div>'; }
    h += '<div class="gk-wm">' + wm + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'initial'){
    h += '<div class="gk-amp">&amp;</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-hr"></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'sideindex'){
    h += '<div class="gk-idx"><div class="gk-idxv">' + esc(d.company).toUpperCase() + '</div><div class="gk-idxd"></div></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'archtrio'){
    h += '<div class="gk-at1"></div><div class="gk-at2"></div><div class="gk-at3"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'marquee'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'steps'){
    const m2 = metaLines(d);
    const steps = [[T('lblDate'), eventLines(d).join(', ')], [ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor')), m2.name + (m2.place ? ', ' + m2.place : '')], [T('lblContact'), d.clientPhone || ''], m2.budget ? [T('lblBudget'), m2.budget + (ag && T('gstNote') ? ' ' + T('gstNote') : '')] : null].filter(Boolean);
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-steps">' + steps.map(function(s, i){ return '<div class="gk-step"><div class="gk-snum">0' + (i + 1) + '</div><div><div class="gm-lab">' + esc(s[0]) + '</div><div class="gk-sval">' + esc(s[1]) + '</div></div></div>'; }).join('') + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'sunburst'){
    let rays = '';
    for(let i = 0; i < 25; i++){ rays += '<div class="gk-ray" style="transform:rotate(' + (i * 7.5 - 90) + 'deg)"></div>'; }
    h += '<div class="gk-rays">' + rays + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'botband'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-bband2"></div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'orbit'){
    h += '<div class="gk-orb"></div><div class="gk-orb2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'stacked'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-hr"></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'frame2'){
    h += '<div class="gk-fr1"></div><div class="gk-fr2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'sidebar-r'){
    h += '<div class="gk-sb"><div class="gk-sbv">' + esc(d.company).toUpperCase() + '</div></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'stripes'){
    h += '<div class="gk-st1"></div><div class="gk-st2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'dots'){
    h += '<div class="gk-dotf"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-hr"></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'vee'){
    h += '<div class="gk-v1"></div><div class="gk-v2"></div><div class="gk-v3"></div><div class="gk-v4"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'bigbottom'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'quarters'){
    h += '<div class="gk-qv"></div><div class="gk-qh"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'crossband'){
    h += '<div class="gk-x1"></div><div class="gk-x2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'zen'){
    h += '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'thickframe'){
    h += '<div class="gk-tf1"></div><div class="gk-tf2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="ccr-orn gk-orn"><i class="l1"></i><span class="dia"></span><i class="l2"></i></div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'leftstrip'){
    h += '<div class="gk-ls"></div><div class="gk-lsd"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCols(d, ag)
      + '<div class="gk-foot">' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'archwin'){
    h += '<div class="gk-aw1"></div><div class="gk-aw2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'sidetitle'){
    h += '<div class="gk-vt">' + esc(tx.title) + '</div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'ringcorner'){
    h += '<div class="gk-rc1"></div><div class="gk-rc2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'dualtone'){
    h += '<div class="gk-dth"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + '<div class="gk-meta">' + gMetaRows(d, ag) + '</div>'
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  } else if(sk === 'ushape'){
    h += '<div class="gk-u1"></div><div class="gk-u2"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.footerContacts) + '</div>';
  } else if(sk === 'arctop'){
    h += '<div class="gk-ta1"></div><div class="gk-ta2"></div><div class="gk-ta3"></div>'
      + '<div class="gk-kick">' + K + '</div>'
      + '<div class="gk-logo">' + logo + '</div>'
      + '<div class="gk-title' + (ag ? ' ag' : '') + '">' + esc(tx.title) + '</div>'
      + '<div class="gk-sub">' + esc(tx.sub) + '</div>'
      + gMetaCenter(d, ag)
      + '<div class="gk-foot">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + '</div>';
  }
  return h + '</div>';
}
function gMetaRows(d, ag){
  const m = metaLines(d);
  const rows = [[ag ? T('agreeClient') : (isOrder(d) ? T('ordOrderedBy') : T('cardPreparedFor')), m.name + (m.place ? ' · ' + m.place : '')],
    [T('lblContact'), d.clientPhone || ''], [T('lblDate'), eventLines(d).join(', ')],
    m.budget ? [T('lblBudget'), m.budget + (ag && T('gstNote') ? ' ' + T('gstNote') : '')] : null].filter(Boolean);
  return rows.map(r => '<div class="gm-row"><span class="gm-rlab">' + esc(r[0]) + '</span><span class="gm-rval">' + esc(r[1]) + '</span></div>').join('');
}
function buildBackGen(d, lay){
  const s = GEN_SPECS[lay];
  return gRoot(lay, 'back')
    + (s.sk === 'corner' ? '<div class="gk-cornerbg"></div>' : '')
    + (s.sk === 'topband' ? '<div class="gk-band gk-bband"></div>' : '')
    + (s.sk === 'rail' ? '<div class="gk-rrail"></div>' : '')
    + (s.sk === 'pillar' ? '<div class="gk-pl"></div><div class="gk-pr"></div>' : '')
    + (s.sk === 'bigarch' ? '<div class="gk-a1 gk-ba1"></div><div class="gk-a2 gk-ba2"></div>' : '')
    + (s.sk === 'diagband' ? '<div class="gk-db1"></div><div class="gk-db2"></div>' : '')
    + (s.sk === 'corners' ? '<div class="gk-c1"></div><div class="gk-c2"></div><div class="gk-c3"></div><div class="gk-c4"></div>' : '')
    + (s.sk === 'sideindex' ? '<div class="gk-idx"><div class="gk-idxv">' + esc(d.company).toUpperCase() + '</div></div>' : '')
    + (s.sk === 'archtrio' ? '<div class="gk-at2"></div>' : '')
    + (s.sk === 'botband' ? '<div class="gk-bband2"></div>' : '')
    + (s.sk === 'orbit' ? '<div class="gk-orb"></div>' : '')
    + (s.sk === 'frame2' ? '<div class="gk-fr1"></div><div class="gk-fr2"></div>' : '')
    + (s.sk === 'sidebar-r' ? '<div class="gk-sb"><div class="gk-sbv">' + esc(d.company).toUpperCase() + '</div></div>' : '')
    + (s.sk === 'stripes' ? '<div class="gk-st1"></div><div class="gk-st2"></div>' : '')
    + (s.sk === 'vee' ? '<div class="gk-v1"></div><div class="gk-v2"></div>' : '')
    + (s.sk === 'quarters' ? '<div class="gk-qv"></div><div class="gk-qh"></div>' : '')
    + (s.sk === 'crossband' ? '<div class="gk-x1"></div><div class="gk-x2"></div>' : '')
    + (s.sk === 'thickframe' ? '<div class="gk-tf1"></div><div class="gk-tf2"></div>' : '')
    + (s.sk === 'leftstrip' ? '<div class="gk-ls"></div>' : '')
    + (s.sk === 'dualtone' ? '<div class="gk-dth"></div>' : '')
    + (s.sk === 'ushape' ? '<div class="gk-u1"></div>' : '')
    + '<div class="gkb-wrap">'
    + '<div class="gkb-logo">' + archFrame('', taglineHtml('tg-arch', true)) + '</div>'
    + '<div class="gkb-thanks">' + esc(T('thanksTitle')) + '</div>'
    + '<div class="gkb-hr"></div>'
    + '<div class="gkb-msg">' + esc(T('thanksMsg')).replace(/\{company\}/g, esc(d.company)).replace(/\n/g, '<br>') + '</div>'
    + '<div class="gkb-co">' + esc(d.company) + ' &nbsp;|&nbsp; ' + esc(d.address) + ' &nbsp;|&nbsp; ' + esc(T('lblContact')) + ': ' + esc(d.footerContacts) + '</div>'
    + '</div></div>';
}

// ---- GEN batch 2 (g7-g12) ----
Object.assign(GEN_SPECS, {
  g7: { sk: 'ticket',    dark: false, pal: { bg:'#f7f1e3', bg2:'#f7f1e3', ink:'#4a3a1e', acc:'#b59a55', acc2:'#8a7440', mut:'#8a7c5c', dink:'#4a3a1e' } },
  g8: { sk: 'sunrise',   dark: true,  pal: { bg:'#7a3a1c', bg2:'#5c2c14', ink:'#f7ead9', acc:'#e8b273', acc2:'#c98a54', mut:'#d9b598', dink:'#5c2c14' } },
  g9: { sk: 'checker',   dark: false, pal: { bg:'#f4f7fa', bg2:'#f4f7fa', ink:'#2e4a66', acc:'#8fb2d9', acc2:'#6a8fb8', mut:'#7a8ea3', dink:'#2e4a66', grid:'rgba(143,178,217,.30)' } },
  g10:{ sk: 'offframe',  dark: false, pal: { bg:'#f2f4ea', bg2:'#f2f4ea', ink:'#3a4a2e', acc:'#8a9a5e', acc2:'#6b7d47', mut:'#7d8a6b', dink:'#3a4a2e' } },
  g11:{ sk: 'cband',     dark: false, pal: { bg:'#faf7f0', bg2:'#151515', ink:'#f2ead6', acc:'#c9a55e', acc2:'#8a7440', mut:'#b9ac8e', dink:'#1a1a1a' } },
  g12:{ sk: 'duocols',   dark: true,  pal: { bg:'#f5f2e8', bg2:'#174734', ink:'#f0e9d6', acc:'#d8b56a', acc2:'#0f3527', mut:'#8a8268', dink:'#2c3a2e' } }
});

// ---- GEN batch 3 (g13-g21) ----
Object.assign(GEN_SPECS, {
  g13:{ sk:'diagband',  dark:true,  pal:{ bg:'#46203c', bg2:'#371931', ink:'#f5e3ec', acc:'#d4b06a', acc2:'#b07a92', mut:'#c09aae', dink:'#46203c' } },
  g14:{ sk:'corners',   dark:true,  pal:{ bg:'#232c38', bg2:'#1a212b', ink:'#eef1f5', acc:'#c9b083', acc2:'#8fa0b5', mut:'#8a99ac', dink:'#232c38' } },
  g15:{ sk:'monogram',  dark:false, pal:{ bg:'#f6ecef', bg2:'#f6ecef', ink:'#5e2f42', acc:'#b87a90', acc2:'#96566e', mut:'#a8888f', dink:'#5e2f42' } },
  g16:{ sk:'initial',   dark:false, pal:{ bg:'#edf1f7', bg2:'#edf1f7', ink:'#2b3a55', acc:'#8298bd', acc2:'#5e7396', mut:'#7c8aa0', dink:'#2b3a55' } },
  g17:{ sk:'sideindex', dark:false, pal:{ bg:'#faf2dc', bg2:'#7a5a10', ink:'#45350c', acc:'#b08a20', acc2:'#8a6a14', mut:'#9a8a5c', dink:'#45350c' } },
  g18:{ sk:'archtrio',  dark:true,  pal:{ bg:'#12454f', bg2:'#0c343c', ink:'#e8f2f0', acc:'#8fc7bd', acc2:'#5e9a90', mut:'#7fa8a2', dink:'#12454f' } },
  g19:{ sk:'marquee',   dark:true,  pal:{ bg:'#33241a', bg2:'#241a12', ink:'#f0e2d0', acc:'#d8a86a', acc2:'#a87a48', mut:'#b89a7c', dink:'#33241a' } },
  g20:{ sk:'steps',     dark:false, pal:{ bg:'#f5e6de', bg2:'#f5e6de', ink:'#5e2a1c', acc:'#c0785a', acc2:'#9a5238', mut:'#b08a78', dink:'#5e2a1c' } },
  g21:{ sk:'sunburst',  dark:true,  pal:{ bg:'#2f3a44', bg2:'#232b33', ink:'#e8ecf0', acc:'#c9b07a', acc2:'#97a4b0', mut:'#8a97a3', dink:'#2f3a44' } }
});

// ---- GEN batch 4 (g22-g27) ----
Object.assign(GEN_SPECS, {
  g22:{ sk:'botband',   dark:false, pal:{ bg:'#f2eff5', bg2:'#5e4a72', ink:'#3a2a4a', acc:'#9a7ab8', acc2:'#6e4a8a', mut:'#8a7a99', dink:'#3a2a4a' } },
  g23:{ sk:'orbit',     dark:true,  pal:{ bg:'#101828', bg2:'#0a1018', ink:'#e8ecf2', acc:'#c9b07a', acc2:'#8a94a8', mut:'#7c8899', dink:'#101828' } },
  g24:{ sk:'stacked',   dark:false, pal:{ bg:'#fdf0ea', bg2:'#fdf0ea', ink:'#7a2a18', acc:'#d96a4a', acc2:'#b04a30', mut:'#b08a7c', dink:'#7a2a18' } },
  g25:{ sk:'frame2',    dark:false, pal:{ bg:'#f4f4f2', bg2:'#f4f4f2', ink:'#232323', acc:'#3a3a3a', acc2:'#6a6a64', mut:'#8a8a84', dink:'#232323' } },
  g26:{ sk:'sidebar-r', dark:false, pal:{ bg:'#f7f2e6', bg2:'#1e3d2f', ink:'#2c3a2e', acc:'#4a7a5e', acc2:'#1e3d2f', mut:'#8a8a70', dink:'#2c3a2e' } },
  g27:{ sk:'stripes',   dark:false, pal:{ bg:'#eef0fa', bg2:'#eef0fa', ink:'#3a3a6a', acc:'#8a8fc7', acc2:'#5a5e9a', mut:'#8a8ea8', dink:'#3a3a6a' } }
});

// ---- GEN batch 5 (g28-g33) ----
Object.assign(GEN_SPECS, {
  g28:{ sk:'dots',      dark:false, pal:{ bg:'#efe9e0', bg2:'#efe9e0', ink:'#4a3f33', acc:'#b0956a', acc2:'#8a7350', mut:'#9a8d7a', dink:'#4a3f33' } },
  g29:{ sk:'vee',       dark:true,  pal:{ bg:'#35204a', bg2:'#281838', ink:'#efe4f7', acc:'#b79ad9', acc2:'#8a6ab0', mut:'#a68ec0', dink:'#35204a' } },
  g30:{ sk:'bigbottom', dark:false, pal:{ bg:'#fbf5ec', bg2:'#fbf5ec', ink:'#4a2c14', acc:'#b06a3a', acc2:'#8a5228', mut:'#a88a70', dink:'#4a2c14' } },
  g31:{ sk:'quarters',  dark:false, pal:{ bg:'#f0ede8', bg2:'#f0ede8', ink:'#3a342a', acc:'#a88a5a', acc2:'#7a6a4c', mut:'#948a76', dink:'#3a342a' } },
  g32:{ sk:'crossband', dark:true,  pal:{ bg:'#1c1420', bg2:'#120c16', ink:'#f0e4ec', acc:'#c78aa8', acc2:'#8a5a74', mut:'#a08a9a', dink:'#1c1420' } },
  g33:{ sk:'zen',       dark:false, pal:{ bg:'#fcfcfa', bg2:'#fcfcfa', ink:'#1a1a1a', acc:'#b08a3a', acc2:'#8a6a2a', mut:'#9a9a94', dink:'#1a1a1a' } }
});

// ---- GEN batch 6 (g34-g41) ----
Object.assign(GEN_SPECS, {
  g34:{ sk:'thickframe', dark:false, pal:{ bg:'#fdf6f7', bg2:'#b34a5e', ink:'#5e1f2e', acc:'#b34a5e', acc2:'#8a2f42', mut:'#b08a92', dink:'#5e1f2e' } },
  g35:{ sk:'leftstrip',  dark:false, pal:{ bg:'#eef1f0', bg2:'#2e4a44', ink:'#1e302c', acc:'#5e8a7e', acc2:'#3a5a50', mut:'#7a8a84', dink:'#1e302c' } },
  g36:{ sk:'archwin',    dark:false, pal:{ bg:'#efeaf2', bg2:'#efeaf2', ink:'#3a2444', acc:'#8a6a9a', acc2:'#6a4a7a', mut:'#9488a0', dink:'#3a2444' } },
  g37:{ sk:'sidetitle',  dark:true,  pal:{ bg:'#1e1e3e', bg2:'#14142e', ink:'#e8e8f4', acc:'#9a8fd0', acc2:'#6a5fa8', mut:'#8a86a8', dink:'#1e1e3e' } },
  g38:{ sk:'ringcorner', dark:false, pal:{ bg:'#f2f4f6', bg2:'#f2f4f6', ink:'#2a3646', acc:'#7a9ab0', acc2:'#54708a', mut:'#8494a4', dink:'#2a3646' } },
  g39:{ sk:'dualtone',   dark:true,  pal:{ bg:'#f5efe2', bg2:'#1e3a30', ink:'#f0e8d4', acc:'#c9a55e', acc2:'#8a6a34', mut:'#9a9280', dink:'#2e3a30' } },
  g40:{ sk:'ushape',     dark:true,  pal:{ bg:'#16294e', bg2:'#0e1c38', ink:'#e8eef7', acc:'#8ab0d9', acc2:'#5e82b0', mut:'#7c90ac', dink:'#16294e' } },
  g41:{ sk:'arctop',     dark:false, pal:{ bg:'#eef4f8', bg2:'#eef4f8', ink:'#23405c', acc:'#8ab0cc', acc2:'#5a82a4', mut:'#7c90a4', dink:'#23405c' } }
});
