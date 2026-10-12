"""Offline DOM fixture only. No browser network/API bridge or live server.
Development verification requires Python and Playwright; neither is a runtime dependency.
"""
from pathlib import Path
from datetime import datetime, timezone
import json, re, hashlib
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
out=root/'evidence'/'runs'/('ui-fixture-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
out.mkdir(parents=True)
html=(root/'web/index.html').read_text()
html=re.sub(r'<link[^>]+>|<script[^>]*>.*?</script>','',html,flags=re.S)
css=(root/'web/styles.css').read_text()
source=(root/'web/session.mjs').read_text().replace('export class','class')+'\n'+re.sub(r"^import .*?from './session.mjs';\s*",'',(root/'web/app.js').read_text(),flags=re.M)
fixture=r'''
(()=>{
let n=0; if(!crypto.randomUUID)crypto.randomUUID=()=>('fixture-request-'+(++n).toString().padStart(10,'0'));
const head='a'.repeat(64),rows=[];
for(let i=0;i<28;i++)rows.push({id:(i+1).toString(16).padStart(32,'0'),message_id:(i+1).toString(16).padStart(32,'0'),from:'user@local.test',to:['postmaster@local.test'],subject:'Offline fixture '+i,body:'Synthetic UI fixture',created:1791316800000+i,folder:'INBOX',mailbox:'postmaster@local.test',bytes:20,attachments:[]});
window.fixtureRequests=[];
window.fetch=async(url,options={})=>{
 const u=new URL(url,'http://127.0.0.1:8787'),token=(options.headers?.Authorization||'').slice(7);let actor;
 if(token==='synthetic-operator-token')actor='postmaster@local.test';if(token==='synthetic-user-token')actor='user@local.test';
 const body=options.body?JSON.parse(options.body):{};let data={},status=200;
 const me={address:actor,role:actor==='postmaster@local.test'?'operator':'user',balance:100,quota:8388608,daily:20,used_today:0,used_bytes:560,accept:true,blocked:[],stamps:[]};
 window.fixtureRequests.push({route:u.pathname,method:options.method||'GET'});
 if(!actor){status=401;data={error:'AUTH'}}
 else if(u.pathname==='/api/me')data=me;
 else if(u.pathname==='/api/ledger')data={chain_id:'synthetic-ui-fixture',head:{hash:head,header:{height:4}},issued:1200,burned:0,reserved:0,sponsor:{balance:1000,daily:0},blocks:[]};
 else if(u.pathname==='/api/mailbox-page'){
  const folder=u.searchParams.get('folder')||'INBOX',limit=Number(u.searchParams.get('limit')||25),before=u.searchParams.get('before'),found=rows.filter(m=>m.mailbox===actor&&m.folder===folder).slice().reverse(),start=before?found.findIndex(m=>m.id===before)+1:0,selected=found.slice(start,start+limit);
  data={folder,total:found.length,start,limit,head,messages:selected,next_before:start+selected.length<found.length?selected.at(-1).id:null};
 }else if(u.pathname==='/api/quote')data={cost:body.to.length,to:body.to,payer:actor};
 else if(u.pathname==='/api/send'){
  const id=(++n+1000).toString(16).padStart(32,'0'),base={...body,from:actor,message_id:id,created:1791316800000,bytes:30};
  rows.push({...base,id,mailbox:actor,folder:'Sent'});rows.push({...base,id:(n+2000).toString(16).padStart(32,'0'),mailbox:body.to[0],folder:'INBOX'});data={block_height:5,replayed:false};
 }else if(/^\/api\/messages\/[a-f0-9]+$/.test(u.pathname)){data=rows.find(m=>m.id===u.pathname.split('/').at(-1)&&m.mailbox===actor);if(!data){data={error:'NOT_FOUND'};status=404}}
 else if(u.pathname==='/api/parents')data={parents:[{parent_id:'P08',name:'Local transport',status:'FIXTURE_ONLY',detail:'This is an offline interface test.'}]};
 else if(u.pathname==='/api/directory')data={mailboxes:[{address:actor,role:me.role}],aliases:{}};
 else {status=404;data={error:'UNHANDLED_FIXTURE_ROUTE'}}
 return {ok:status===200,status,json:async()=>structuredClone(data)};
};})();
'''
checks=[];blocked=[];errors=[]
def check(name,condition):
 checks.append({'check':name,'outcome':'PASS' if condition else 'FAIL'})
 if not condition: raise AssertionError(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1000})
 def deny(route): blocked.append(route.request.url);route.abort()
 context.route('**/*',deny)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 try:
  page.set_content(html);page.add_style_tag(content=css);page.evaluate(fixture);page.evaluate(source)
  page.evaluate("document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;bottom:0;left:0;background:#202225;color:white;padding:6px;z-index:9999;font:12px monospace\">OFFLINE DOM FIXTURE · NOT A LIVE BROWSER DELIVERY</div>')")
  page.fill('#token','synthetic-operator-token');page.click('#login-form button');page.wait_for_selector('.mail-row')
  check('operator fixture login',page.locator('#identity').inner_text().startswith('postmaster@local.test'))
  check('first bounded page renders 25 rows',page.locator('.mail-row').count()==25)
  page.click('#older');check('older page shows remaining 3 records',page.locator('.mail-row').count()==3)
  page.click('#newer');check('newer page returns to first 25 records',page.locator('.mail-row').count()==25)
  page.click('#compose-open');page.fill('#subject','Continuation fixture');page.fill('#body','<img src="https://example.invalid/x" onerror="window.fixtureExecuted=true">\nRender this as text.');page.click('#quote');check('postage quote uses the fixture adapter','1 local credits' in page.locator('#quote-result').inner_text())
  page.click('#send');page.click('[data-page="Sent"]');page.wait_for_selector('.mail-row');check('compose and Sent UI transitions',page.locator('.mail-row').count()==1)
  page.screenshot(path=str(out/'UI_SENT_FIXTURE.png'),full_page=True)
  page.click('.mail-row');check('reader shows literal active-content text','<img src=' in page.locator('#reader-body').inner_text() and page.locator('#reader-body img').count()==0)
  page.click('#reader-close');page.click('#logout');check('logout clears prior message content',page.locator('#reader-body').inner_text()=='' and page.locator('#content').inner_text()=='')
  page.fill('#token','synthetic-user-token');page.click('#login-form button');page.click('[data-page="INBOX"]');page.wait_for_selector('.mail-row');page.click('.mail-row');check('recipient fixture reads the composed body','Render this as text.' in page.locator('#reader-body').inner_text());page.click('#reader-close')
  page.set_viewport_size({'width':390,'height':844});check('mobile document has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'));page.screenshot(path=str(out/'UI_MOBILE_FIXTURE.png'),full_page=True)
  check('no browser network or active-content execution',not blocked and not page.evaluate('Boolean(window.fixtureExecuted)'))
  check('no JavaScript page errors',not errors)
 finally:
  result={'kind':'OFFLINE_DOM_FIXTURE_ONLY','status':'PASS' if len(checks)==12 and all(x['outcome']=='PASS' for x in checks) else 'FAIL','checks':checks,'page_errors':errors,'blocked_network_requests':blocked,'environment':{'browser':browser.version,'origin':'about:blank','renderer':'Chromium with managed policies unchanged'},'limitations':['Mock responses only: no browser HTTP delivery, CSP, secure-context or Windows acceptance is established.','Packaged JS is evaluated with its module import replaced by the same session-module source in memory.','No browser network bridge, proxy, policy bypass or runtime server is used.'],'source_sha256':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['web/app.js','web/session.mjs','web/index.html','web/styles.css']}}
  (out/'SUMMARY.json').write_text(json.dumps(result,indent=2));browser.close()
print(json.dumps(result,indent=2));print('Evidence:',out)
