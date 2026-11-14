/* Installed-app update notice (Deep 10 Nov): after a release, the NEXT app open
   shows a brief "updating" state and reloads once - never on every launch.
   /version.json carries the release id; bump it with every deploy. */
(function () {
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    fetch('/version.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.v) return;
      var seen = localStorage.getItem('bbth-app-v');
      if (seen === j.v) return; // same release - nothing to do
      if (seen === null) { localStorage.setItem('bbth-app-v', j.v); return; } // first ever open: already latest
      localStorage.setItem('bbth-app-v', j.v);
      if (sessionStorage.getItem('bbth-app-v-tried') === j.v) return; // already reloaded for this release - never loop
      sessionStorage.setItem('bbth-app-v-tried', j.v);
      var ov = document.createElement('div');
      ov.id = 'appUpdOv';
      ov.innerHTML = '<div class="upd-box"><div class="upd-spin"></div><b>Updating BBTH app...</b><span>Loading the latest version</span></div>';
      document.body.appendChild(ov);
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function () {});
  });
})();
