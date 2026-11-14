/* BBTH modern UI - additive behaviours (preview).
   Only touches the admin shell nav: turns the sidebar into a drawer behind a
   menu button and clarifies tab labels. No data, API or PDF logic touched. */
(function () {
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var side = document.querySelector('.side');
    var topbar = document.querySelector('.topbar');
    if (!side || !topbar) return; // only the admin shell

    // 1) Menu button at the left of the top bar
    var btn = document.createElement('button');
    btn.id = 'menuBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Menu');
    btn.title = 'Menu - all tabs are here';
    btn.innerHTML = '<span class="mb-bar"></span><span class="mb-bar"></span><span class="mb-bar"></span>';
    topbar.insertBefore(btn, topbar.firstChild);

    // 2) Scrim behind the drawer
    var scrim = document.createElement('div');
    scrim.id = 'menuScrim';
    document.body.appendChild(scrim);

    function openMenu(){
      document.body.classList.add('menu-open');
      // on phone the drawer covers the top bar - lift the button above it so it
      // stays visible as a close (X) control; desktop sidebar never covers it
      if (!window.matchMedia('(min-width: 900px)').matches){
        btn.dataset.floating = '1';
        document.body.appendChild(btn);
      }
    }
    function closeMenu(){
      document.body.classList.remove('menu-open');
      if (btn.dataset.floating){ delete btn.dataset.floating; topbar.insertBefore(btn, topbar.firstChild); }
    }
    // Web/desktop: menu shown by default; the menu button hides it (Deep 31 Oct).
    if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) openMenu();
    btn.addEventListener('click', function () {
      document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
    });
    scrim.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e){ if (e.key === 'Escape') closeMenu(); });

    var labels = {
      dashboard: 'Home',
      quote: 'New Quotation',
      history: 'Quotation List',
      'history:agreement': 'Agreement List',
      template: 'PDF Template',
      agreement: 'Agreement T&C',
      services: 'Services & Rates',
      company: 'Company',
      items: 'Catalogue Items',
      register: 'Clients',
      images: 'Photo Library',
      users: 'Staff Users'
    };

    function labelOf(b) {
      var t = b.getAttribute('data-tab');
      var k = b.getAttribute('data-dockind');
      return labels[t + ':' + k] || labels[t] || null;
    }

    // 3) Close the drawer after picking a tab (listener is additive; admin.js still does the switching)
    side.querySelector('.side-nav').addEventListener('click', function (e) {
      var b = e.target.closest('.step-btn');
      if (!b) return;
      if (!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches)) closeMenu();
      var lab = labelOf(b);
      var h1 = document.getElementById('pageTitle');
      if (h1 && lab) setTimeout(function(){ h1.textContent = lab; }, 30);
    });

    // 4) Clearer tab names so every staff member knows where to go (icons unchanged)
    var icons = {"dashboard": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V21h14V9.5\"/></svg>", "history": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M14 3v5h5\"/><path d=\"M9 12h7M9 16h7\"/></svg>", "template": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M8 8h8M8 12h8M8 16h5\"/></svg>", "agreement": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z\"/><path d=\"M9 12l2 2 4-4\"/></svg>", "services": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1\"/></svg>", "company": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 21V5l8-2v18\"/><path d=\"M12 21h8V9l-8-2\"/><path d=\"M7 8h1M7 12h1M7 16h1M16 12h1M16 16h1\"/></svg>", "items": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/></svg>", "register": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2\"/><path d=\"M9 10h6M9 14h6M9 18h4\"/></svg>", "images": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M4 18l5-4 4 3 3-2 4 3\"/></svg>", "users": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20c0-3.5 2.5-5.5 6-5.5s6 2 6 5.5\"/><circle cx=\"17\" cy=\"9\" r=\"2.2\"/><path d=\"M15.5 14.7c2.8.3 5 2 5 5.3\"/></svg>"};
    icons['quote'] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/></svg>';
    icons['history:quotation'] = icons['history'];

    // Grouped arrow menu (Deep 10 Nov voice spec: simpler menu bar, arrow-mark
    // expandable shortcut groups). Dashboard stays a plain shortcut; the rest
    // sit under collapsible groups. Original buttons keep working unchanged.
    var NAV_GROUPS = [
      { t: 'Quotation', tabs: ['quote', 'history:quotation'] },
      { t: 'Agreement', tabs: ['create-agreement', 'history:agreement'] },
      { t: 'Catalogue', tabs: ['create-catalogue', 'catlist', 'items', 'images'] },
      { t: 'Clients', tabs: ['register'] },
      { t: 'Settings', tabs: ['template', 'agreement', 'services', 'company', 'users'] }
    ];
    function tabKey(b) { return b.id === 'menuCreateCat' ? 'create-catalogue' : b.id === 'menuCatList' ? 'catlist' : b.getAttribute('data-tab') + (b.getAttribute('data-dockind') ? ':' + b.getAttribute('data-dockind') : ''); }
    var nav = side.querySelector('.side-nav');
    NAV_GROUPS.forEach(function (g) {
      var members = g.tabs.map(function (k) { return nav.querySelector(k === 'create-catalogue' ? '#menuCreateCat' : k === 'create-agreement' ? '#menuCreateAgree' : k === 'catlist' ? '#menuCatList' : '.step-btn[data-tab="' + k.split(':')[0] + '"]' + (k.indexOf(':') > -1 ? '[data-dockind="' + k.split(':')[1] + '"]' : '')); }).filter(Boolean);
      if (!members.length) return;
      var grp = document.createElement('div');
      grp.className = 'nav-grp';
      var head = document.createElement('button');
      head.type = 'button'; head.className = 'nav-grp-h';
      head.innerHTML = '<span>' + g.t + '</span><span class="nav-arrow">&#9656;</span>';
      var body = document.createElement('div');
      body.className = 'nav-grp-b';
      nav.appendChild(grp); // groups render in NAV_GROUPS order (Dashboard stays on top)
      grp.appendChild(head); grp.appendChild(body);
      members.forEach(function (m) { body.appendChild(m); });
      if (members.some(function (m) { return m.classList.contains('active'); })) grp.classList.add('open');
      head.addEventListener('click', function () { grp.classList.toggle('open'); });
    });
    // a group with no visible buttons (permissions) hides itself
    function refreshGroups() {
      nav.querySelectorAll('.nav-grp').forEach(function (g) {
        var anyVisible = [].some.call(g.querySelectorAll('.step-btn'), function (b) { return !b.classList.contains('hidden') && b.style.display !== 'none'; });
        var want = anyVisible ? '' : 'none';
        if (g.style.display !== want) g.style.display = want;
      });
    }
    new MutationObserver(refreshGroups).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    refreshGroups();
    // clicking a tab keeps its group open
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('.step-btn'); if (!b) return;
      var g = b.closest('.nav-grp'); if (g && !g.classList.contains('open')) g.classList.add('open');
    });
    // Sub-option labels under each group (Deep 10 Nov: Agreement > New Agreement / List,
    // Quotation > New / List). The group header carries the parent name.
    [['menuCreateCat', 'New Catalogue'], ['menuCreateAgree', 'New Agreement'], ['menuCatList', 'Catalogue List']].forEach(function (pair) {
      var b = document.getElementById(pair[0]); if (!b) return;
      var icon = b.querySelector('i');
      var ik = pair[0] === 'menuCatList' ? 'history' : pair[0] === 'menuCreateCat' ? 'items' : 'quote';
      if (!icon) { icon = document.createElement('i'); }
      if (icons[ik]) icon.innerHTML = icons[ik];
      icon.style.cssText = 'font-style:normal;width:20px;height:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center';
      var svg = icon.querySelector('svg');
      if (svg) { svg.setAttribute('width','19'); svg.setAttribute('height','19'); }
      b.textContent = '';
      b.appendChild(icon);
      b.appendChild(document.createTextNode(' '));
      b.appendChild(document.createTextNode(pair[1]));
    });
    icons['history:agreement'] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13l2 2 4-4"/></svg>';
    side.querySelectorAll('.side-nav .step-btn').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      var lab = labelOf(b);
      if (!lab) return;
      var icon = b.querySelector('i');
      if (!icon) { icon = document.createElement('i'); }
      var ik = b.getAttribute('data-dockind') ? t + ':' + b.getAttribute('data-dockind') : t;
      if (icons[ik]) icon.innerHTML = icons[ik];
      icon.style.cssText = 'font-style:normal;width:20px;height:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center';
      var svg = icon.querySelector('svg');
      if (svg) { svg.setAttribute('width','19'); svg.setAttribute('height','19'); }
      b.textContent = '';
      b.appendChild(icon);
      b.appendChild(document.createTextNode(' '));
      b.appendChild(document.createTextNode(lab));
    });

    // 4b) Initial page title matches the menu label ("Home", not "Dashboard")
    var h1init = document.getElementById('pageTitle');
    if (h1init && h1init.textContent === 'Dashboard') h1init.textContent = 'Home';

    // 5) Drawer heading hint
    var nav = side.querySelector('.side-nav');
    if (nav && !nav.querySelector('.menu-hint')) {
      var hint = document.createElement('div');
      hint.className = 'menu-hint';
      hint.style.cssText = 'font-size:11px;letter-spacing:1.5px;color:#9fb8a5;padding:2px 12px 8px;text-transform:uppercase';
      hint.textContent = 'Menu';
      nav.insertBefore(hint, nav.firstChild);
    }
  });
})();
