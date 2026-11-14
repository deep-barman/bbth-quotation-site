# LOCAL TESTING ONLY - every credential and seed in this script is a
# throwaway local test value. Never seed these into a production database.
import json, urllib.request, urllib.error, base64
B = 'http://127.0.0.1:8788'
results = []
def call(method, path, body=None, token=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    h = {'content-type': 'application/json'}
    if token: h['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            b = r.read()
            return r.status, (b if raw else json.loads(b))
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b)
        except Exception: return e.code, b[:100]
def check(name, cond, extra=''):
    results.append(('PASS' if cond else 'FAIL', name, extra))

# 1 login
s, d = call('POST', '/api/login', {'username':'admin','password':'SmokeTest!234'})
check('login admin ok', s == 200 and d.get('token') and d.get('role') == 'admin', f'{s}')
TOK = d.get('token','')
s, d = call('POST', '/api/login', {'username':'admin','password':'wrong'})
check('login bad pw -> 401', s == 401, f'{s}')
# 2 whoami
s, d = call('GET', '/api/whoami', token=TOK)
check('whoami admin', s == 200 and d.get('role') == 'admin', f'{s} {str(d)[:60]}')
# 3 settings GET/PUT
s, d = call('GET', '/api/settings', token=TOK)
check('settings GET', s == 200 and d.get('company') == 'BBTH Smoke Test', f'{s}')
d['address'] = '2 New Lane'
s, d2 = call('PUT', '/api/settings', d, token=TOK)
s2, d3 = call('GET', '/api/settings', token=TOK)
check('settings PUT + readback', s == 200 and d3.get('address') == '2 New Lane', f'{s}')
s, d = call('GET', '/api/settings')
check('settings GET no-auth -> 401', s == 401, f'{s}')
# 4 users CRUD
s, d = call('POST', '/api/users', {'username':'staff1','password':'staffpass1','role':'staff'}, token=TOK)
check('users create', s == 200 and d.get('ok'), f'{s} {str(d)[:60]}')
s, d = call('POST', '/api/users', {'username':'staff1','password':'staffpass1'}, token=TOK)
check('users dupe rejected', s == 400, f'{s}')
s, d = call('POST', '/api/login', {'username':'staff1','password':'staffpass1'})
STOK = d.get('token','')
check('staff login', s == 200 and d.get('role') == 'staff', f'{s}')
s, d = call('GET', '/api/users', token=STOK)
check('users list staff -> 403', s == 403, f'{s}')
s, d = call('GET', '/api/users', token=TOK)
uid = d.get('users',[{}])[0].get('id')
check('users list admin', s == 200 and uid, f'{s}')
s, d = call('PUT', f'/api/users/{uid}', {'disabled': True}, token=TOK)
s2, d2 = call('POST', '/api/login', {'username':'staff1','password':'staffpass1'})
check('users disable blocks login', s == 200 and s2 == 401, f'{s},{s2}')
call('PUT', f'/api/users/{uid}', {'disabled': False}, token=TOK)
# 5 change-password
s, d = call('POST', '/api/change-password', {'current':'wrong','next':'NewPass!23456'}, token=TOK)
check('changepw wrong current -> 400', s == 400, f'{s} {str(d)[:60]}')
s, d = call('POST', '/api/change-password', {'current':'SmokeTest!234','next':'NewPass!234'}, token=TOK)
check('changepw ok', s == 200 and d.get('ok'), f'{s} {str(d)[:80]}')
s, d = call('POST', '/api/login', {'username':'admin','password':'NewPass!234'})
check('login with new pw', s == 200 and d.get('token'), f'{s}')
TOK = d.get('token', TOK)
# 6 refno
s, d = call('GET', '/api/refno', token=TOK)
check('refno GET', s == 200 and d.get('q',{}).get('next') == 100, f'{s} {str(d)[:60]}')
s, d = call('POST', '/api/refno', {'series':'q'}, token=TOK)
check('refno alloc', s == 200 and d.get('refNo') == 'BBTH-100' and d.get('next') == 101, f'{s} {str(d)[:80]}')
# 7 quotations
pdf64 = 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-1.4 fake').decode()
s, d = call('POST', '/api/quotations', {'data':{'clientName':'Test Client','docType':'quotation','docNo':'BBTH-100','template':'sage-gold'}, 'pdf': pdf64}, token=TOK)
QID = d.get('id')
check('quotations POST', s == 200 and QID, f'{s} {str(d)[:60]}')
s, d = call('GET', '/api/quotations', token=TOK)
q0 = (d.get('quotations') or [{}])[0]
check('quotations list fields', s == 200 and d.get('count') == 1 and q0.get('doc_no') == 'BBTH-100' and q0.get('doc_type') == 'quotation' and q0.get('template') == 'sage-gold' and q0.get('pdf_bytes'), f'{s} {str(q0)[:120]}')
s, d = call('GET', f'/api/quotations/{QID}', token=TOK)
check('quotations detail', s == 200 and d.get('data',{}).get('clientName') == 'Test Client' and d.get('pdf'), f'{s}')
s, d = call('PUT', f'/api/quotations/{QID}', {'data':{'clientName':'Client Two','docType':'quotation'}}, token=TOK)
s2, d2 = call('GET', f'/api/quotations/{QID}', token=TOK)
check('quotations PUT', s == 200 and d2.get('client') == 'Client Two', f'{s},{s2}')
s, d = call('DELETE', f'/api/quotations/{QID}', token=TOK)
s2, d2 = call('GET', '/api/quotations', token=TOK)
s3, d3 = call('GET', '/api/quotations?deleted=1', token=TOK)
check('quotations soft delete + bin view', s == 200 and d2.get('count') == 0 and d3.get('count') == 1, f'{s},{d2.get("count")},{d3.get("count")}')
s, d = call('PATCH', f'/api/quotations/{QID}', {'restore': True}, token=TOK)
s2, d2 = call('GET', '/api/quotations', token=TOK)
check('quotations restore', s == 200 and d2.get('count') == 1, f'{s}')
s, d = call('DELETE', f'/api/quotations/{QID}?hard=1', token=TOK)
s2, d2 = call('GET', '/api/quotations?deleted=1', token=TOK)
check('quotations purge', s == 200 and d2.get('count') == 0, f'{s}')
# 8 images
img64 = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xd9').decode()
s, d = call('POST', '/api/images', {'data': img64, 'label': 'test img'}, token=TOK)
IID = d.get('id')
check('images POST', s == 200 and IID, f'{s} {str(d)[:50]}')
s, d = call('GET', '/api/images', token=TOK)
check('images GET', s == 200 and len(d.get('images',[])) == 1 and d['images'][0].get('label') == 'test img', f'{s}')
s, d = call('PATCH', f'/api/images/{IID}', {'label':'renamed'}, token=TOK)
s2, d2 = call('GET', '/api/images', token=TOK)
check('images PATCH label', s == 200 and d2['images'][0].get('label') == 'renamed', f'{s}')
s, d = call('DELETE', f'/api/images/{IID}', token=TOK)
s2, d2 = call('GET', '/api/images?deleted=1', token=TOK)
check('images soft delete + bin', s == 200 and len(d2.get('images',[])) == 1, f'{s}')
s, d = call('PATCH', f'/api/images/{IID}', {'restore': True}, token=TOK)
s, d = call('DELETE', f'/api/images/{IID}?hard=1', token=TOK)
s2, d2 = call('GET', '/api/images?deleted=1', token=TOK)
check('images restore + purge', s == 200 and len(d2.get('images',[])) == 0, f'{s}')
# 9 draft
s, d = call('PUT', '/api/draft', {'form':{'a':1}}, token=TOK)
s2, d2 = call('GET', '/api/draft', token=TOK)
check('draft PUT+GET', s == 200 and s2 == 200 and d2.get('draft',{}).get('form',{}).get('a') == 1 and d2.get('updated_at'), f'{s},{s2}')
s, d = call('DELETE', '/api/draft', token=TOK)
s2, d2 = call('GET', '/api/draft', token=TOK)
check('draft DELETE', s == 200 and d2.get('draft') is None, f'{s}')
# 10 activity
s, d = call('GET', '/api/activity', token=STOK)
check('activity staff -> 401/403', s in (401,403), f'{s}')
s, d = call('GET', '/api/activity', token=TOK)
check('activity admin', s == 200 and any('password' in str(a.get('action','')) for a in d.get('activity',[])), f'{s} rows={len(d.get("activity",[]))}')
# 11 share
s, d = call('POST', '/api/quotations', {'data':{'clientName':'Share Client','docType':'quotation'}, 'pdf': pdf64}, token=TOK)
SID = d.get('id')
s, d = call('POST', '/api/share', {'id': SID}, token=TOK)
share_url = d.get('url','')
check('share POST', s == 200 and '/s/' in share_url, f'{s} {share_url}')
tok_part = share_url.split('/s/')[-1]
s, d = call('GET', '/s/' + tok_part, raw=True)
check('share public view', s == 200 and b'application/pdf' in d, f'{s}')
# 12 catalogue svc/extra
s, d = call('POST', '/api/catalogue', {'kind':'service','name':'Service B'}, token=TOK)
check('catalogue add service', s == 200 and d.get('ok') and not d.get('already'), f'{s} {str(d)[:50]}')
s, d = call('POST', '/api/catalogue', {'kind':'service','name':'Service B'}, token=TOK)
check('catalogue dupe -> already', s == 200 and d.get('already') == True, f'{s}')
s, d = call('POST', '/api/catalogue', {'kind':'extra','name':'Extra B','rate':'250'}, token=TOK)
s2, d2 = call('GET', '/api/settings', token=TOK)
check('catalogue extra in settings', s == 200 and any(e.get('name') == 'Extra B' for e in d2.get('extras',[])), f'{s}')
# 13 catalogue-history
s, d = call('POST', '/api/catalogue-history', {'data':{'ts':1,'name':'Cat A','items':[]}}, token=TOK)
check('catalogue-history POST', s == 200 and d.get('ok'), f'{s}')
s, d = call('GET', '/api/catalogue-history', token=TOK)
rows = d.get('rows',[])
check('catalogue-history GET', s == 200 and len(rows) == 1 and json.loads(rows[0]['data']).get('name') == 'Cat A', f'{s}')
s, d = call('DELETE', '/api/catalogue-history?id=' + str(rows[0]['id']), token=TOK)
s2, d2 = call('GET', '/api/catalogue-history', token=TOK)
check('catalogue-history DELETE', s == 200 and len(d2.get('rows',[])) == 0, f'{s}')
# 14 items-catalogue
draft = {'basev':3,'data':{'categories':[{'name':'Props','items':[{'n':'Item A','g':'c'}]}]},'deleted':[],'deletedCats':[],'renames':{},'hidden':[],'photoV':{},'bin':None}
s, d = call('PUT', '/api/items-catalogue', draft, token=TOK)
s2, d2 = call('GET', '/api/items-catalogue')
d2d = d2.get('draft',{})
check('items-catalogue PUT+GET (no-auth read)', s == 200 and s2 == 200 and d2d.get('data',{}).get('categories',[{}])[0].get('items',[{}])[0].get('n') == 'Item A', f'{s},{s2}')
s, d = call('PUT', '/api/items-catalogue/photo', {'k':'Props|Item A','data':img64}, token=TOK)
s2, d2 = call('GET', '/api/items-catalogue/photo?k=Props%7CItem%20A')
check('photo PUT+GET', s == 200 and d2.get('photo') == img64, f'{s},{s2}')
s, d = call('GET', '/api/items-catalogue/photos-index')
check('photos-index lists key', s == 200 and d.get('count') == 1 and d.get('keys') == ['Props|Item A'], f'{s} {str(d)[:90]}')
d3 = json.loads(json.dumps(draft)); d3['photoV'] = {'Props|Item A':'__del__'}
s, d = call('PUT', '/api/items-catalogue', d3, token=TOK)
s2, d4 = call('GET', '/api/items-catalogue/photos-index')
check('photos-index excludes tombstoned', s == 200 and s2 == 200 and d4.get('count') == 0, f'{s},{s2} {str(d4)[:80]}')
s, d = call('PUT', '/api/items-catalogue', draft, token=TOK)
s2, d4 = call('GET', '/api/items-catalogue/photos-index')
check('photos-index restored after untombstone', s == 200 and s2 == 200 and d4.get('count') == 1, f'{s},{s2} {str(d4)[:80]}')
s, d = call('DELETE', '/api/items-catalogue/photo?k=Props%7CItem%20A', token=TOK)
s2, d2 = call('GET', '/api/items-catalogue/photo?k=Props%7CItem%20A')
check('photo DELETE', s == 200 and d2.get('photo') is None, f'{s}')
s, d = call('GET', '/api/items-catalogue/photos-index')
check('photos-index empty after delete', s == 200 and d.get('count') == 0 and d.get('keys') == [], f'{s} {str(d)[:90]}')
s, d = call('POST', '/api/items-catalogue/photos-index', {'x':1})
check('photos-index rejects POST', s == 405, f'{s}')
# 15 quote-list/view/pdf
s, d = call('GET', '/api/quote-list', token=TOK)
check('quote-list', s == 200 and isinstance(d.get('quotations') or d.get('rows') or d, (list,dict)), f'{s} {str(d)[:80]}')
s, d = call('GET', f'/api/quote-view?id={SID}', token=STOK if STOK else TOK)
check('quote-view', s == 200 and d.get('data') is not None, f'{s} {str(d)[:80]}')
s, d = call('GET', f'/api/quote-pdf?id={SID}', token=TOK, raw=True)
check('quote-pdf', s == 200 and d[:5] == b'%PDF-', f'{s}')
# 16 404
s, d = call('GET', '/api/nonexistent', token=TOK)
check('unknown api -> 404', s == 404, f'{s}')

fails = [r for r in results if r[0] == 'FAIL']
for r in results: print(*r)
print(f'\n{len(results)-len(fails)}/{len(results)} passed')
