// Service categories - ONE list shared by the home page, the quotation form and the admin panel.
// Anything not listed here falls into "More from the catalogue", so nothing can ever go missing.
window.BBTH_SVC_GROUPS = [
      { icon: '&#128203;', title: 'Planning & Guest Setup', from: 'services', match: ['Wedding Event Planning Package','Walkway Setup','Entry Signage Boards','Name Tags','Welcome & Starter Counter Setup','Round Table Setup','Royal Table Setup','High Table','VIP Couche','Chair Arrangement','Gazebos','Glass-Top Centre Tables','Glass Item For Table Decoration'] },
      { icon: '&#127881;', title: 'Stage, Mandap & Entry', from: 'services', match: ['Bride & Groom Stage Decoration','Stage Backdrop','Stage Hangings','Bridal Sofa','Music Stage','Mandap Setup','Royal Arrival Arch','Royal Snap Lounge'] },
      { icon: '&#127802;', title: 'Decor & Florals', from: 'services', match: ['Reception Area Decoration','VIP Lounge Decoration','Theme Based Reception Decoration','Theme Based Wedding Reception Decoration','Floral Decoration','Banana Tree Decoration','Natural Leaves','Decorative Props','Ganesha Idol','Royal Greetings Mirror','Juroon','Mehendi Backdrop'] },
      { icon: '&#127860;', title: 'Dining & Flooring', from: 'services', match: ['Semi-Open Dining Setup','Dining Area With Umbrellas And Side Masking','Kitchen Waterproofing','Grass Carpeting','Printed Carpeting (Dining Area)','3D Passage Carpeting','Stage Carpet','Royal Carpeting'] },
      { icon: '&#128161;', title: 'Lighting & Essentials', from: 'services', match: ['Complete Venue Lighting','Candle Setup','Generator (Power Backup)','Commercial Cooler'] }
];
// split a list of service names into [{title, icon, idx:[original indexes]}], plus a final "More" bucket
window.bbthGroupServices = function(names, cat){
  cat = cat || (window.BBTH_SETTINGS && window.BBTH_SETTINGS.svcCat) || {};
  const used = new Set(), out = [];
  window.BBTH_SVC_GROUPS.filter(g => g.from === 'services').forEach(g => {
    const idx = [];
    names.forEach((n, i) => { if(used.has(i)) return; if(cat[n] ? cat[n] === g.title : g.match.includes(n)){ idx.push(i); used.add(i); } });
    if(idx.length) out.push({ title: g.title, icon: g.icon, idx: idx });
  });
  const rest = [];
  names.forEach((n, i) => { if(!used.has(i)) rest.push(i); });
  if(rest.length) out.push({ title: 'More from the catalogue', icon: '&#10024;', idx: rest });
  return out;
};
