// "Change password" for the logged-in user (admin or staff). Loaded on the form and the admin panel.
(function(){
  function tok(){ return sessionStorage.getItem('bbth-admin-token') || localStorage.getItem('bbth-admin-token') || ''; }
  var css = '#pwOv{position:fixed;inset:0;background:rgba(20,40,30,.55);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px}'
   + '#pwOv.show{display:flex}#pwBox{background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px 20px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:Poppins,sans-serif;color:#223c31}'
   + '#pwBox h3{margin:0 0 4px;font-family:"Playfair Display",serif;font-size:22px;color:#264a3b}#pwBox p.s{margin:0 0 14px;font-size:13px;color:#667}'
   + '#pwBox label{display:block;font-size:13px;margin:10px 0 4px;font-weight:500}#pwBox input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:2px solid #dde5d0;border-radius:10px;font-family:inherit}'
   + '#pwBox input:focus{outline:none;border-color:#c9a227}#pwMsg{min-height:20px;margin:10px 0 0;font-size:13.5px}#pwMsg.err{color:#b3261e}#pwMsg.ok{color:#1f6b45}'
   + '#pwBox .row{display:flex;gap:10px;margin-top:14px}#pwBox button{flex:1;padding:12px;border-radius:10px;border:none;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit}'
   + '#pwSave{background:linear-gradient(120deg,#264a3b,#35604c);color:#fff}#pwCancel{background:#eef2e5;color:#264a3b}'
   + '#pwOpen{background:none;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:5px 13px;font-size:12.5px;cursor:pointer;font-family:inherit}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var ov = document.createElement('div'); ov.id = 'pwOv';
  ov.innerHTML = '<div id="pwBox" role="dialog" aria-modal="true"><h3>Change password</h3><p class="s">Enter your current password, then choose a new one (at least 8 characters). Other devices will be signed out.</p>'
   + '<label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password">'
   + '<label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password">'
   + '<label for="pwNew2">Confirm new password</label><input id="pwNew2" type="password" autocomplete="new-password">'
   + '<div id="pwMsg"></div><div class="row"><button id="pwCancel" type="button">Close</button><button id="pwSave" type="button">Save password</button></div></div>';
  document.body.appendChild(ov);
  function $(id){ return document.getElementById(id); }
  function msg(t, kind){ var m = $('pwMsg'); m.textContent = t; m.className = kind || ''; }
  function open(){ ['pwCur','pwNew','pwNew2'].forEach(function(i){ $(i).value=''; }); msg(''); ov.classList.add('show'); setTimeout(function(){ $('pwCur').focus(); }, 50); }
  function close(){ ov.classList.remove('show'); }
  $('pwCancel').addEventListener('click', close);
  ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
  $('pwSave').addEventListener('click', async function(){
    var cur = $('pwCur').value, n1 = $('pwNew').value, n2 = $('pwNew2').value;
    if(!cur){ msg('Enter your current password.', 'err'); return; }
    if(n1.length < 8){ msg('New password must be at least 8 characters.', 'err'); return; }
    if(n1 !== n2){ msg('The two new passwords do not match.', 'err'); return; }
    if(n1 === cur){ msg('New password must be different from the current one.', 'err'); return; }
    var b = $('pwSave'); b.disabled = true; msg('Saving...');
    try {
      var r = await fetch('/api/change-password', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok() }, body: JSON.stringify({ current: cur, next: n1 }) });
      var d = {}; try { d = await r.json(); } catch(e){}
      if(r.ok){ msg('Password changed. Use the new password next time you log in.', 'ok'); ['pwCur','pwNew','pwNew2'].forEach(function(i){ $(i).value=''; }); }
      else if(r.status === 401){ msg('Your login expired. Please log in again.', 'err'); }
      else msg(d.error || 'Could not change the password.', 'err');
    } catch(e){ msg('Network error - check your internet connection.', 'err'); }
    b.disabled = false;
  });
  var btn = document.createElement('button'); btn.id = 'pwOpen'; btn.type = 'button'; btn.textContent = 'Change password';
  btn.addEventListener('click', open);
  var lo = document.getElementById('logoutBtn');
  if(lo){ lo.parentNode.insertBefore(btn, lo); btn.style.cssText = 'display:block;width:100%;margin:0 0 8px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-size:14px;cursor:pointer;font-family:inherit'; }
  else {
    var chip = document.getElementById('userChip');
    if(chip){ chip.parentNode.insertBefore(btn, chip.nextSibling); btn.style.display = 'none';
      setInterval(function(){ btn.style.display = tok() ? '' : 'none'; }, 800); }
  }
})();
