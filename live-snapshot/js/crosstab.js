/* BBTH cross-tab logout guard (candidate, 26 Oct) - shared by every auth-bearing page.
   A logout (explicit, or a 401 = session dead server-side) writes a TIMESTAMPED signal
   in localStorage. Every page compares the signal against ITS OWN login time:
     signal newer than this tab's login -> this session predates the logout -> gate it.
   A fresh login stamps a fresh login time, so re-login after a logout is unaffected
   (ordering-safe); the signal is never deleted.
   Suspended tabs that miss the storage event re-check on visibilitychange/focus/pageshow
   and at load. Gating NEVER blindly reloads a tab with unsaved input: auth keys are
   cleared and a blocking notice is shown instead, so on-screen work is not destroyed. */
(function(){
'use strict';
const SIGNAL = 'bbth-logout', LOGIN_AT = 'bbth-login-at';
const CREDS = ['bbth-admin-token','bbth-user','bbth-role','bbth-name','bbth-handoff'];
let dirty = false, gated = false, onGatedFn = null;

// On the remembered (localStorage) path the token and login time are SHARED across tabs,
// and a logging-out tab deletes them - so each tab snapshots its login time into its own
// sessionStorage at load. Gate decisions then survive the shared keys being wiped.
function snapshotLoginAt(){
  try {
    if(sessionStorage.getItem('bbth-admin-token')) return; // session token: login time already here
    if(localStorage.getItem('bbth-admin-token'))
      sessionStorage.setItem(LOGIN_AT, localStorage.getItem(LOGIN_AT) || '0');
  } catch(e){}
}
function loginAt(){
  try {
    let v = parseInt(sessionStorage.getItem(LOGIN_AT) || '', 10);
    if(!isNaN(v)) return v;
    v = parseInt(localStorage.getItem(LOGIN_AT) || '', 10);
    if(!isNaN(v)) return v;
  } catch(e){}
  return null; // never logged in here: the page's own gate handles it
}
function signalTs(){
  let v = 0;
  try { v = parseInt(localStorage.getItem(SIGNAL) || '0', 10); } catch(e){}
  return isNaN(v) ? 0 : v;
}
function clearAuth(){
  CREDS.concat([LOGIN_AT]).forEach(k => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch(e){} });
}
function overlay(){
  if(document.getElementById('bbthXtabGate')) return;
  const d = document.createElement('div');
  d.id = 'bbthXtabGate';
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,24,20,.72);display:flex;align-items:center;justify-content:center;padding:24px';
  d.innerHTML = '<div style="background:#fffdf8;max-width:420px;width:100%;border-radius:14px;padding:28px 26px;text-align:center;font-family:Poppins,system-ui,sans-serif;color:#2b2b2b;box-shadow:0 18px 60px rgba(0,0,0,.35)">'
    + '<h2 style="margin:0 0 10px;font-size:20px">Logged out</h2>'
    + '<p style="margin:0 0 8px;font-size:14px;line-height:1.55">You were logged out in another tab, or your session expired.</p>'
    + '<p style="margin:0 0 18px;font-size:13px;line-height:1.55;color:#6a6558">Unsaved changes on this page are still here - copy anything you need. Nothing can be saved until you log in again.</p>'
    + '<button id="bbthXtabGo" style="background:#264a3b;color:#fff;border:0;border-radius:9px;padding:11px 22px;font-size:14px;cursor:pointer;font-family:inherit">Log in again</button></div>';
  document.body.appendChild(d);
  d.querySelector('#bbthXtabGo').addEventListener('click', () => location.reload());
}
function gate(){
  if(gated) return true;
  gated = true;
  clearAuth();
  if(onGatedFn){ try { onGatedFn(); } catch(e){} return true; }
  if(dirty) overlay(); else location.reload();
  return true;
}
function check(){
  if(gated) return true;
  const la = loginAt();
  if(la === null) return false;
  if(signalTs() > la) return gate();
  return false;
}
window.BBTHXTab = {
  // call on successful login; stores the login time next to the token it belongs to
  markLogin(remember){
    const now = String(Date.now());
    try {
      if(remember){ localStorage.setItem(LOGIN_AT, now); sessionStorage.removeItem(LOGIN_AT); }
      else { sessionStorage.setItem(LOGIN_AT, now); localStorage.removeItem(LOGIN_AT); }
    } catch(e){}
  },
  // handoff adoption: the new tab inherits the SOURCE session's login time, not "now"
  loginAtFrom(src){ try { sessionStorage.setItem(LOGIN_AT, String(src || 0)); localStorage.removeItem(LOGIN_AT); } catch(e){} },
  currentLoginAt(){
    try { return parseInt(sessionStorage.getItem(LOGIN_AT) || localStorage.getItem(LOGIN_AT) || '0', 10) || 0; } catch(e){ return 0; }
  },
  signal(){ try { localStorage.setItem(SIGNAL, String(Date.now())); } catch(e){} },
  sessionDead(){ this.signal(); check(); }, // 401: dead server-side -> gate self + every other tab
  clearAuth,
  markClean(){ dirty = false; },
  isGated(){ return gated; },
  // returns true when this tab is already gated (caller should stop booting)
  install(onGated){
    onGatedFn = (typeof onGated === 'function') ? onGated : null;
    document.addEventListener('input', () => { dirty = true; }, true);
    window.addEventListener('storage', e => { if(e.key === SIGNAL && e.newValue) check(); });
    document.addEventListener('visibilitychange', () => { if(!document.hidden) check(); });
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    snapshotLoginAt(); // BEFORE any check: pin this tab's login time against shared-key wipes
    return check(); // load-time
  }
};
})();
