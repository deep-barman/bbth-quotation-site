// BBTH PDF design templates - chosen per document in the form (step 5).
// The first entry always follows the admin panel's theme (the master design);
// the rest are fixed presets so staff can pick a different look per quotation.
const BBTH_TEMPLATES = [
  { key: 'sage-gold', name: 'Sage & Gold', tag: 'The BBTH master design - split dark green panel', layout: 'arch', theme: null },
  { key: 'pal-ivory-champagne', name: 'Ivory + Champagne Gold', tag: 'Timeless luxury - warm ivory pages, champagne gold frame', layout: 'ivory', palette: true,
    theme: { maroon:'#6a5836',rose:'#b59a64',pagebg:'#f9f5eb',circle:'#efe5c9',band:'#f3ecd6',ink:'#33291a' } },
  { key: 'pal-maroon-gold', name: 'Maroon + Antique Gold', tag: 'Royal, traditional and grand - deep maroon crest, antique gold', layout: 'crest', palette: true,
    theme: { maroon:'#631c2e',rose:'#a8842c',pagebg:'#f9f2e7',circle:'#f0dfc6',band:'#f4e7d3',ink:'#33101d' } },
  { key: 'pal-sage-white', name: 'Sage Green + White + Gold', tag: 'Fresh and natural - sage green, white, gold', layout: 'minimal', palette: true,
    theme: { maroon:'#4f6b4c',rose:'#bf9b30',pagebg:'#fbfcf8',circle:'#e4ebd8',band:'#edf1e3',ink:'#24331f' } },
  { key: 'pal-dusty-rose', name: 'Dusty Rose + Blush + Champagne', tag: 'Romantic and dreamy - dusty rose, blush pink, champagne', layout: 'blush', palette: true,
    theme: { maroon:'#8e4a5d',rose:'#bd8a70',pagebg:'#fbf1f2',circle:'#f4dbdf',band:'#f7e3e6',ink:'#3f2029' } },
  { key: 'pal-black-gold', name: 'Black + Gold', tag: 'Bold, dramatic and glamorous - full black, rich gold frame', layout: 'noir', palette: true,
    theme: { maroon:'#151515',rose:'#d5af63',pagebg:'#f7f4ec',circle:'#eae4d3',band:'#f0ead9',ink:'#1a1a1a' } },
  { key: 'pal-rust-terracotta', name: 'Rust Orange + Terracotta + Peach', tag: 'Warm, earthy and distinctive - rust, terracotta, peach', layout: 'spine', palette: true,
    theme: { maroon:'#8a3b1e',rose:'#c27e62',pagebg:'#fcf1e6',circle:'#f5d8c2',band:'#f8e3d1',ink:'#3e1f12' } },
  { key: 'pal-emerald-ivory', name: 'Emerald Green + Ivory + Gold', tag: 'Rich, regal and premium - emerald green, ivory, gold', layout: 'band', palette: true,
    theme: { maroon:'#055c44',rose:'#c9a227',pagebg:'#f8f5ea',circle:'#e6ead6',band:'#eff0dc',ink:'#173528' } },
  { key: 'pal-powder-blue', name: 'Powder Blue + Silver + White', tag: 'Soft, modern and graceful - powder blue, silver, white', layout: 'dream', palette: true,
    theme: { maroon:'#3f6a94',rose:'#9aa5b1',pagebg:'#f7fafd',circle:'#dfeaf6',band:'#e8f0f8',ink:'#1d3047' },
    fonts: { head: 'Poppins' } },
  { key: 'gen-teal-corner', name: 'Deep Teal + Ivory', tag: 'Diagonal split, corner crest, editorial rows', layout: 'g1', palette: true,
    theme: { maroon:'#0b4f46',rose:'#c9a55e',pagebg:'#f4f5ee',circle:'#e6ead6',band:'#e9ecdc',ink:'#173528' } },
  { key: 'gen-wine-band', name: 'Wine + Antique Gold', tag: 'Grand top band, hero crest, light body', layout: 'g2', palette: true,
    theme: { maroon:'#6e1f33',rose:'#d4a95c',pagebg:'#faf2ee',circle:'#f2ddd2',band:'#f5e4dc',ink:'#3d1420' } },
  { key: 'gen-bronze-rail', name: 'Ivory + Bronze Rail', tag: 'Full-height bronze side rail, classic type', layout: 'g3', palette: true,
    theme: { maroon:'#6a5836',rose:'#b28a4a',pagebg:'#faf5e8',circle:'#efe5c9',band:'#f3ecd6',ink:'#33291a' } },
  { key: 'gen-rosewood-pillar', name: 'Rosewood + Blush Pillars', tag: 'Twin pillar rules, centred formal stack', layout: 'g4', palette: true,
    theme: { maroon:'#572a3a',rose:'#c48a7a',pagebg:'#faf0ee',circle:'#f2dcd8',band:'#f6e6e2',ink:'#3a1d28' } },
  { key: 'gen-navy-arch', name: 'Navy + Ice Blue Arch', tag: 'Giant line-art arch, midnight blue', layout: 'g5', palette: true,
    theme: { maroon:'#22345c',rose:'#a9c7ea',pagebg:'#f4f7fb',circle:'#dde6f2',band:'#e6edf6',ink:'#16233f' } },
  { key: 'gen-champagne-ticket', name: 'Champagne + Gold Ticket', tag: 'Vintage ticket layout, dashed rules, centred crest', layout: 'g7', palette: true,
    theme: { maroon:'#6a5836',rose:'#b59a55',pagebg:'#f7f1e3',circle:'#efe5c9',band:'#f3ecd6',ink:'#33291a' } },
  { key: 'gen-rust-sunrise', name: 'Burnt Rust Sunrise', tag: 'Concentric rising arcs, warm dark field, hero crest', layout: 'g8', palette: true,
    theme: { maroon:'#7a3a1e',rose:'#e8b273',pagebg:'#fcf1e6',circle:'#f5d8c2',band:'#f8e3d1',ink:'#3e1f12' } },
  { key: 'gen-ice-grid', name: 'Ice Blue + Grid', tag: 'Blueprint grid, circle crest, bold sans', layout: 'g9', palette: true,
    theme: { maroon:'#2e4a66',rose:'#8fb2d9',pagebg:'#f4f7fa',circle:'#dfeaf6',band:'#e8f0f8',ink:'#1d3047' }, fonts: { head: 'Poppins' } },
  { key: 'gen-olive-frame', name: 'Olive + Offset Frame', tag: 'Thick offset frame, corner crest, italic type', layout: 'g10', palette: true,
    theme: { maroon:'#3a4a2e',rose:'#8a9a5e',pagebg:'#f2f4ea',circle:'#e4ebd8',band:'#edf1e3',ink:'#24331f' } },
  { key: 'gen-black-band', name: 'Ebony Band + Bronze', tag: 'Floating black band across centre, bronze crest', layout: 'g11', palette: true,
    theme: { maroon:'#151515',rose:'#c9a55e',pagebg:'#faf7f0',circle:'#eae4d3',band:'#f0ead9',ink:'#1a1a1a' } },
  { key: 'gen-forest-split', name: 'Forest + Ivory Columns', tag: 'Wide deep-green column, vertical title, crest', layout: 'g12', palette: true,
    theme: { maroon:'#174734',rose:'#d8b56a',pagebg:'#f5f2e8',circle:'#e6ead6',band:'#eff0dc',ink:'#173528' } },
  { key: 'gen-mint-poster', name: 'Mint + Forest Poster', tag: 'Huge thin type, fresh green, corner logo', layout: 'g6', palette: true,
    theme: { maroon:'#1d4a3c',rose:'#5e9c84',pagebg:'#f6faf7',circle:'#ddeee4',band:'#e8f3ec',ink:'#143328' } },
  { key: 'gen-plum-diagonal', name: 'Plum + Rose Gold Ribbons', tag: 'Diagonal ribbons on deep plum, hero crest', layout: 'g13', palette: true,
    theme: { maroon:'#46203c',rose:'#d4b06a',pagebg:'#f9eef4',circle:'#eed8e4',band:'#f4e2ec',ink:'#2e1226' } },
  { key: 'gen-slate-corners', name: 'Slate Night + Champagne', tag: 'Corner-bracket frame, centred formal stack', layout: 'g14', palette: true,
    theme: { maroon:'#232c38',rose:'#c9b083',pagebg:'#f2f4f7',circle:'#dde2ea',band:'#e8ecf2',ink:'#141a22' } },
  { key: 'gen-mauve-monogram', name: 'Mauve Monogram Field', tag: 'Repeating BBTH watermark, soft mauve, italic type', layout: 'g15', palette: true,
    theme: { maroon:'#5e2f42',rose:'#b87a90',pagebg:'#f6ecef',circle:'#ecd8de',band:'#f2e2e7',ink:'#3a1a28' } },
  { key: 'gen-steel-ampersand', name: 'Steel Blue Ampersand', tag: 'Giant & watermark, editorial split layout', layout: 'g16', palette: true,
    theme: { maroon:'#2b3a55',rose:'#8298bd',pagebg:'#edf1f7',circle:'#d8e0ec',band:'#e2e9f2',ink:'#1a2438' } },
  { key: 'gen-mustard-index', name: 'Mustard Side Index', tag: 'Narrow deep index column, vertical label, warm cream', layout: 'g17', palette: true,
    theme: { maroon:'#7a5a10',rose:'#b08a20',pagebg:'#faf2dc',circle:'#f0e2b8',band:'#f5ead0',ink:'#45350c' } },
  { key: 'gen-petrol-arches', name: 'Petrol Triple Arch', tag: 'Three standing line arches, deep blue-green', layout: 'g18', palette: true,
    theme: { maroon:'#12454f',rose:'#8fc7bd',pagebg:'#eef4f3',circle:'#d6e6e3',band:'#e3efed',ink:'#0c343c' } },
  { key: 'gen-cocoa-marquee', name: 'Cocoa Marquee Type', tag: 'Huge spaced display type, crest at base', layout: 'g19', palette: true,
    theme: { maroon:'#33241a',rose:'#d8a86a',pagebg:'#f5ede2',circle:'#e8d8c2',band:'#efe4d2',ink:'#241a12' } },
  { key: 'gen-brick-steps', name: 'Terracotta Numbered Steps', tag: 'Numbered meta steps, editorial split, warm blush', layout: 'g20', palette: true,
    theme: { maroon:'#5e2a1c',rose:'#c0785a',pagebg:'#f5e6de',circle:'#ecd2c6',band:'#f2dcd2',ink:'#3a1a10' } },
  { key: 'gen-graphite-rays', name: 'Graphite Sunburst', tag: 'Radiating line burst from base, crest centre', layout: 'g21', palette: true,
    theme: { maroon:'#2f3a44',rose:'#c9b07a',pagebg:'#f0f2f4',circle:'#dde1e6',band:'#e7eaee',ink:'#1c232a' } },
  { key: 'gen-lavender-band', name: 'Lavender Base Band', tag: 'Light top, deep lavender base band with meta', layout: 'g22', palette: true,
    theme: { maroon:'#5e4a72',rose:'#9a7ab8',pagebg:'#f2eff5',circle:'#e2daeA',band:'#eae4f0',ink:'#3a2a4a' } },
  { key: 'gen-midnight-orbit', name: 'Midnight Orbit Ring', tag: 'Thin gold orbit ring on near-black midnight', layout: 'g23', palette: true,
    theme: { maroon:'#101828',rose:'#c9b07a',pagebg:'#eef0f4',circle:'#d9dee6',band:'#e5e8ee',ink:'#0a1018' } },
  { key: 'gen-coral-stack', name: 'Coral Type Stack', tag: 'Huge stacked serif type, crest at base-right', layout: 'g24', palette: true,
    theme: { maroon:'#7a2a18',rose:'#d96a4a',pagebg:'#fdf0ea',circle:'#f8dcd2',band:'#fae6dd',ink:'#4a1808' } },
  { key: 'gen-gallery-frame', name: 'Gallery Mono Frame', tag: 'Double hairline frame, monochrome gallery look', layout: 'g25', palette: true,
    theme: { maroon:'#232323',rose:'#6a6a64',pagebg:'#f4f4f2',circle:'#e2e2de',band:'#eaeae6',ink:'#101010' } },
  { key: 'gen-hunter-panel', name: 'Hunter Side Panel', tag: 'Narrow deep-green right panel on ivory field', layout: 'g26', palette: true,
    theme: { maroon:'#1e3d2f',rose:'#4a7a5e',pagebg:'#f7f2e6',circle:'#e9e2cc',band:'#f0e9d8',ink:'#14231b' } },
  { key: 'gen-periwinkle-stripes', name: 'Periwinkle Pinstripes', tag: 'Diagonal pinstripe bands, soft violet-blue', layout: 'g27', palette: true,
    theme: { maroon:'#3a3a6a',rose:'#8a8fc7',pagebg:'#eef0fa',circle:'#dcdffa',band:'#e4e7f6',ink:'#23234a' } },
  { key: 'gen-sand-dots', name: 'Sand Halftone Dots', tag: 'Halftone dot field, bold sans, warm sand', layout: 'g28', palette: true,
    theme: { maroon:'#4a3f33',rose:'#b0956a',pagebg:'#efe9e0',circle:'#e0d5c4',band:'#e7dfd2',ink:'#2e2618' }, fonts: { head: 'Poppins' } },
  { key: 'gen-royal-vee', name: 'Royal Purple Chevron', tag: 'Converging chevron lines, royal purple', layout: 'g29', palette: true,
    theme: { maroon:'#35204a',rose:'#b79ad9',pagebg:'#f4eef9',circle:'#e4d8f0',band:'#ece2f6',ink:'#281838' } },
  { key: 'gen-copper-bottom', name: 'Copper Anchor Base', tag: 'Crest top, title anchored huge at base', layout: 'g30', palette: true,
    theme: { maroon:'#4a2c14',rose:'#b06a3a',pagebg:'#fbf5ec',circle:'#f0e2ce',band:'#f6ecdc',ink:'#2e1a08' } },
  { key: 'gen-stone-quarters', name: 'Stone Quarter Lines', tag: 'Crosshair quarter lines, warm stone', layout: 'g31', palette: true,
    theme: { maroon:'#3a342a',rose:'#a88a5a',pagebg:'#f0ede8',circle:'#e2dccf',band:'#e9e4da',ink:'#23201a' } },
  { key: 'gen-aubergine-cross', name: 'Aubergine Cross Lines', tag: 'Full-page diagonal cross, dark aubergine', layout: 'g32', palette: true,
    theme: { maroon:'#1c1420',rose:'#c78aa8',pagebg:'#f6eef2',circle:'#ead8e0',band:'#f0e4ea',ink:'#120c16' } },
  { key: 'gen-zen-minimal', name: 'Zen White Minimal', tag: 'Airy white, huge centred type, tiny gold accent', layout: 'g33', palette: true,
    theme: { maroon:'#1a1a1a',rose:'#b08a3a',pagebg:'#fcfcfa',circle:'#eeeee9',band:'#f4f4f0',ink:'#0a0a0a' } },
  { key: 'gen-rose-thickframe', name: 'Rose Gallery Frame', tag: 'Thick dusty-rose frame, formal centred', layout: 'g34', palette: true,
    theme: { maroon:'#5e1f2e',rose:'#b34a5e',pagebg:'#fdf6f7',circle:'#f6e2e6',band:'#f9ecee',ink:'#3a0f1a' } },
  { key: 'gen-spruce-strip', name: 'Spruce Edge Strip', tag: 'Thin deep-spruce edge strip, soft grey-green', layout: 'g35', palette: true,
    theme: { maroon:'#2e4a44',rose:'#5e8a7e',pagebg:'#eef1f0',circle:'#dae2df',band:'#e4eae8',ink:'#14201d' } },
  { key: 'gen-lavender-archwin', name: 'Lavender Arch Window', tag: 'Double arch window line, soft lavender', layout: 'g36', palette: true,
    theme: { maroon:'#3a2444',rose:'#8a6a9a',pagebg:'#efeaf2',circle:'#e0d6e6',band:'#e7e0ec',ink:'#241430' } },
  { key: 'gen-indigo-sidetitle', name: 'Indigo Side Title', tag: 'Vertical title right edge, deep indigo', layout: 'g37', palette: true,
    theme: { maroon:'#1e1e3e',rose:'#9a8fd0',pagebg:'#eeeef6',circle:'#dadaea',band:'#e4e4f0',ink:'#14142e' } },
  { key: 'gen-glacier-ring', name: 'Glacier Corner Ring', tag: 'Corner rings lower-left, right-aligned editorial', layout: 'g38', palette: true,
    theme: { maroon:'#2a3646',rose:'#7a9ab0',pagebg:'#f2f4f6',circle:'#e0e6ea',band:'#e8edf0',ink:'#16202c' } },
  { key: 'gen-spruce-seam', name: 'Spruce + Ivory Seam', tag: 'Half dark half ivory, content across the seam', layout: 'g39', palette: true,
    theme: { maroon:'#1e3a30',rose:'#c9a55e',pagebg:'#f5efe2',circle:'#e8dfc6',band:'#eee7d4',ink:'#12241c' } },
  { key: 'gen-sapphire-u', name: 'Sapphire U-Line', tag: 'U-shaped line rising from base, deep sapphire', layout: 'g40', palette: true,
    theme: { maroon:'#16294e',rose:'#8ab0d9',pagebg:'#edf2f9',circle:'#d8e2f0',band:'#e3ebf5',ink:'#0e1c38' } },
  { key: 'gen-skyfall-arcs', name: 'Skyfall Arcs', tag: 'Concentric arcs descending from top, light sky', layout: 'g41', palette: true,
    theme: { maroon:'#23405c',rose:'#8ab0cc',pagebg:'#eef4f8',circle:'#dae7f0',band:'#e4eef4',ink:'#142c44' } },
  { key: 'ivory-arch', name: 'Ivory Arch', tag: 'Cream with gold frame and arch - classic formal', layout: 'ivory',
    theme: { maroon: '#264a3b', rose: '#c9a227', pagebg: '#f8f3e4', circle: '#efe7cd', band: '#f2ebd6', ink: '#33301f' } },
  { key: 'blush-circle', name: 'Blush Circle', tag: 'Soft pink with circle motifs - romantic', layout: 'blush',
    theme: { maroon: '#7f2d3e', rose: '#b76e79', pagebg: '#f5dee2', circle: '#eccbd2', band: '#f2d6db', ink: '#3d1e26' } },
  { key: 'minimal-white', name: 'Minimal White', tag: 'Clean white, thin type - modern minimal', layout: 'minimal',
    theme: { maroon: '#111111', rose: '#c9a227', pagebg: '#fdfcf8', circle: '#f1eee2', band: '#f5f3ea', ink: '#161616' } },
  { key: 'royal-band', name: 'Royal Navy Band', tag: 'Grand full-width navy band, gold crest arch - formal letterhead style', layout: 'band', palette: true,
    theme: { maroon:'#16294d',rose:'#c9a227',pagebg:'#f6f3ea',circle:'#dfe3ee',band:'#e8eaf2',ink:'#1a2440' } },
  { key: 'mocha-spine', name: 'Mocha Spine', tag: 'Editorial mocha spine strip with vertical lettering, champagne gold - modern magazine style', layout: 'spine', palette: true,
    theme: { maroon:'#4a3325',rose:'#c8a96a',pagebg:'#f8f3ea',circle:'#eee0c8',band:'#f0e6d2',ink:'#33241a' } },
  { key: 'aubergine-crest', name: 'Aubergine Crest', tag: 'Centred royal crest with gold rules top and bottom, antique gold - certificate style', layout: 'crest', palette: true,
    theme: { maroon:'#47203f',rose:'#b8923a',pagebg:'#f9f4ee',circle:'#eedde8',band:'#f2e6ee',ink:'#33122c' } }
];
const BBTH_DEFAULT_TEMPLATE = 'sage-gold';

function getTemplateTheme(key){
  const t = BBTH_TEMPLATES.find(x => x.key === key) || BBTH_TEMPLATES[0];
  if(t.theme) return { theme: t.theme, fonts: t.fonts || null };
  const s = (window.BBTH_SETTINGS || {});
  return { theme: Object.assign({}, (window.DEFAULT_SETTINGS ? DEFAULT_SETTINGS.theme : {}), s.theme || {}),
           fonts: { head: s.fontHead, body: s.fontBody } };
}
function getTemplateLayout(key){
  const t = BBTH_TEMPLATES.find(x => x.key === key) || BBTH_TEMPLATES[0];
  return t.layout || 'arch';
}
function templateName(key){
  const t = BBTH_TEMPLATES.find(x => x.key === key);
  return t ? t.name : BBTH_TEMPLATES[0].name;
}
// apply a template's look to one container (PDF stage, preview panes)
function applyTemplateVars(el, key){
  if(!el) return;
  const { theme, fonts } = getTemplateTheme(key);
  const map = { maroon: '--c-maroon', rose: '--c-rose', pagebg: '--c-pagebg', circle: '--c-circle', band: '--c-band', ink: '--c-ink' };
  Object.keys(map).forEach(k => { if(theme[k]) el.style.setProperty(map[k], theme[k]); });
  const mixc = (hex, to, p) => { const n = parseInt(String(hex).replace('#',''), 16); if(isNaN(n)) return hex; const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (to - v) * p)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
  if(theme.maroon){ el.style.setProperty('--c-maroon-l', mixc(theme.maroon, 255, 0.12)); el.style.setProperty('--c-maroon-d', mixc(theme.maroon, 0, 0.22)); }
  else { el.style.removeProperty('--c-maroon-l'); el.style.removeProperty('--c-maroon-d'); }
  const dv = { '--c-ink-m': [theme.ink, 255, 0.32], '--c-rose-1': [theme.rose, 255, 0.45], '--c-rose-2': [theme.rose, 255, 0.6], '--c-pagebg-l': [theme.pagebg, 255, 0.45] };
  Object.keys(dv).forEach(k => { const a = dv[k]; if(a[0]) el.style.setProperty(k, mixc(a[0], a[1], a[2])); else el.style.removeProperty(k); });
  if(fonts && fonts.head) el.style.setProperty('--f-head', "'" + fonts.head + "', serif");
  if(fonts && fonts.body) el.style.setProperty('--f-body', "'" + fonts.body + "', sans-serif");
  el.dataset.template = key || BBTH_DEFAULT_TEMPLATE;
  (el.classList && el.classList.remove) && ['lay-arch','lay-ivory','lay-blush','lay-minimal','lay-band','lay-spine','lay-crest','lay-dream','lay-noir'].forEach(c => el.classList.remove(c));
  if(el.classList) el.classList.add('lay-' + getTemplateLayout(key));
}
function clearTemplateVars(el){
  if(!el) return;
  ['--c-maroon','--c-rose','--c-pagebg','--c-circle','--c-band','--c-ink','--f-head','--f-body'].forEach(v => el.style.removeProperty(v));
}
