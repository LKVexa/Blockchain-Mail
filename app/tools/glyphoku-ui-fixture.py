"""Optional offline/mock UI fixture. Requires separately provided Python Playwright,
a headed display and CHROMIUM_PATH. NEVER navigates to/proxies the real service.
For this Linux run: xvfb-run -a python tools/glyphoku-ui-fixture.py
"""
from playwright.sync_api import sync_playwright
import pathlib,json,os,re,time
R=pathlib.Path(__file__).resolve().parents[1];OUT=R/'evidence/browser';OUT.mkdir(parents=True,exist_ok=True)
files={str(p.relative_to(R/'desk')):p.read_text() for p in (R/'desk').rglob('*.js')}
css=(R/'desk/styles.css').read_text();results=[];errors=[]
def check(name,value):
    results.append({'name':name,'pass':bool(value)});print(name, bool(value), flush=True);
    if not value:
        (OUT/'UI_FIXTURE_FAILURE.json').write_text(json.dumps({'name':name,'body':page.locator('body').inner_text(),'calls':page.evaluate('window.calls'),'errors':errors},indent=2));page.screenshot(path=str(OUT/'UI_FIXTURE_FAILURE.png'),full_page=True);raise AssertionError(name)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=False,args=['--no-sandbox'],env=os.environ.copy())
    page=browser.new_page(viewport={'width':1440,'height':1100})
    page.set_default_timeout(5000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<html><head></head><body><div style="padding:6px;background:#a54132;color:white;font:12px sans-serif">OFFLINE UI FIXTURE — MOCK RESPONSES — NOT A LIVE EMAIL DELIVERY</div><div id="root"><div></div></div></body></html>')
    page.add_style_tag(content=css)
    page.evaluate('''()=>{
    const own='owner@fixture.glyphoku.localhost';window.calls=[];window.mock={instance_id:'a'.repeat(32),revision:0,head:{header:{height:0}},instance:{g:1,domains:[],mailboxes:[],permits:[],deliveries:[],spentPermits:[]},operations:[],active:null};window.mockrun=null;window.syntheticFrame=null;
    window.fetch=async(path,options={})=>{window.calls.push({path,method:options.method,body:options.body?JSON.parse(options.body):null});let data={};const body=options.body?JSON.parse(options.body):{};if(path==='/api/glyphoku/state')data=window.mock;
    else if(path.endsWith('/start')){window.mockrun={run_id:'b'.repeat(32),observer_key:'fixture-observer',operation_id:body.operation_id,action:body.action,g:1,phase:'PREPARING',paused:false,index:0,total:1,counts:{events:0,guesses:0,retractions:0,rendered:0}};data=window.mockrun;}
    else if(path.endsWith('/poll')){if(window.mockrun.phase==='PREPARING'){const givens=Array(256).fill(0).map((_,i)=>i%3===0?(i%16)+1:0);window.mockrun={...window.mockrun,phase:'INITIAL_FRAME',counts:{events:1,guesses:0,retractions:0,rendered:0},frame:{id:'fixture:1',digest:'f'.repeat(64),board_index:0,seq:1,board:givens,kind:givens.map(v=>v?'given':'empty'),depth:0,nodes:0,events:[{seq:1,type:'INIT',cell:null,rule:'FIXTURE',oldValue:0,newValue:0}],initial:true,terminal:false}};window.syntheticFrame=window.mockrun.frame;}data=window.mockrun;}
    else if(path.endsWith('/ack')){window.mockrun={...window.mockrun,phase:'LIVE SOLVING',frame:null,counts:{...window.mockrun.counts,rendered:window.mockrun.counts.rendered+1}};data=window.mockrun;}
    else if(path.endsWith('/advance')){let n=window.mockrun.counts.events+body.count;window.mockrun={...window.mockrun,paused:body.single_step||window.mockrun.paused,counts:{...window.mockrun.counts,events:n,guesses:Math.floor(n/10),retractions:Math.floor(n/50)},frame:{...window.syntheticFrame,id:'fixture:'+n,seq:n,initial:false,events:[{seq:n,type:'GUESS',cell:1,oldValue:0,newValue:2,rule:'FIXTURE'}]}};window.syntheticFrame=window.mockrun.frame;data=window.mockrun;}
    else if(path.endsWith('/control')){window.mockrun={...window.mockrun,paused:body.action!=='resume',phase:body.action==='stop'?'CANCELLED':window.mockrun.phase,frame:body.action==='stop'?null:window.mockrun.frame};data=window.mockrun;}
    else if(path==='/api/admin/verify')data={ok:true,scope:'MOCK UI RESPONSE ONLY'};
    else if(path==='/api/glyphoku/mail')data={messages:window.mail??[]};
    else if(path==='/api/glyphoku/send'){window.mock.instance.permits[0].state='DELIVERED_LOCAL';window.mock.revision=3;window.mock.instance.spentPermits=['env-1'];window.mail=[{id:'fixture-mail',message_id:'fixture-message',folder:'INBOX',from:own,to:[own],subject:body.draft.subject,body:body.draft.body}];data={result:{status:'DELIVERED_LOCAL'}};}
    else if(path.startsWith('/api/glyphoku/trace'))data={notice:'MOCK trace'};
    else return {ok:false,status:404,json:async()=>({error:'MOCK_UNHANDLED',message:path})};
    return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(data))};};
    }''')
    # Build a module graph from supplied local bytes; never navigate to or proxy localhost.
    page.evaluate('''files=>{const made={},building=new Set();function normalize(s){const parts=[];for(const p of s.split('/')){if(p==='..')parts.pop();else if(p!=='.'&&p)parts.push(p);}return parts.join('/');}function build(name){if(made[name])return made[name];if(building.has(name))throw Error('Unexpected cycle '+name);building.add(name);let text=files[name];if(text===undefined)throw Error('Missing fixture module '+name);text=text.replace(/(^|\\n)(import[^\\n]*?\\sfrom\\s+)(['"])([^'"]+)\\3/g,(all,start,prefix,q,spec)=>{const target=normalize(name.slice(0,name.lastIndexOf('/')+1)+spec);return start+prefix+q+build(target)+q;});const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));made[name]=url;building.delete(name);return url;}const s=document.createElement('script');s.type='module';s.src=build('modules/local.js');document.head.append(s);}''',files)
    page.get_by_test_id('operator-token').wait_for(timeout=10000)
    check('Local root mounts supplied React-backed workspace',page.get_by_role('heading',name='Open your workspace').count()==1)
    page.get_by_test_id('operator-token').fill('fixture-token-not-valid-on-any-server')
    page.get_by_test_id('connect').click()
    page.get_by_test_id('create-domain').wait_for()
    check('Exact 256 accessible cells',page.get_by_role('gridcell').count()==256)
    check('Default 24 and four speed choices',page.get_by_label('Check speed').input_value()=='24' and page.get_by_label('Check speed').locator('option').all_text_contents()==['Slow','Normal','Fast','Very fast'])
    page.get_by_test_id('create-domain').click();page.wait_for_timeout(2000)
    check('Mock initial frame acknowledgment precedes first advance',page.evaluate("()=>{const a=calls.findIndex(x=>x.path.endsWith('/ack')),b=calls.findIndex(x=>x.path.endsWith('/advance'));return a>=0&&b>a;}") )
    page.get_by_test_id('pause').click();page.wait_for_timeout(200)
    count=page.get_by_test_id('events-count').inner_text();page.wait_for_timeout(300)
    check('Pause freezes displayed event counter',page.get_by_test_id('events-count').inner_text()==count)
    page.get_by_test_id('step').click();page.wait_for_timeout(250)
    check('Single step advances exactly one displayed event while paused',int(page.get_by_test_id('events-count').inner_text())==int(count)+1 and not page.get_by_test_id('resume').is_disabled())
    page.screenshot(path=str(OUT/'UI_FIXTURE_PAUSED.png'),full_page=True)
    page.get_by_test_id('stop').click();page.wait_for_timeout(150)
    check('Stop shows stopped and does not create a mailbox',page.get_by_test_id('phase').get_attribute('data-phase')=='CANCELLED' and page.get_by_test_id('phase').inner_text()=='Stopped' and 'g = 1' in page.get_by_test_id('ordinal').inner_text())
    page.evaluate("()=>{mock.instance={g:2,domains:[{id:'dom-1',label:'fixture',address:'fixture.glyphoku.localhost',ordinal:1}],mailboxes:[{id:'box-1',domainId:'dom-1',address:'owner@fixture.glyphoku.localhost',role:'owner'}],permits:[],deliveries:[],spentPermits:[]};mock.revision=1;mock.head.header.height=1;}")
    page.get_by_role('button',name='Refresh workspace').click();page.wait_for_timeout(150)
    page.get_by_label('Subject',exact=True).fill('UI fixture subject π 雪')
    page.get_by_label('Message',exact=True).fill('This is an offline UI fixture, not evidence of delivery.')
    page.get_by_test_id('freeze').click();page.wait_for_timeout(150)
    check('Frozen editor is locked and envelope action available',page.get_by_label('Message',exact=True).is_disabled() and page.get_by_test_id('create-envelope').count()==1)
    page.get_by_test_id('create-envelope').click();page.wait_for_timeout(200);page.get_by_test_id('stop').click();page.wait_for_timeout(100)
    page.evaluate("()=>{const d=calls.findLast(x=>x.path.endsWith('/start')&&x.body.action==='envelope').body.intent.draft;mock.instance.g=3;mock.instance.permits=[{id:'env-1',ordinal:2,sender:d.from,draftDigest:d.digest,recipients:d.to,bcc:d.bcc,state:'READY',draft:d}];mock.revision=2;mock.head.header.height=2;}")
    page.get_by_role('button',name='Refresh workspace').click();page.wait_for_timeout(200)
    check('Prepared message is explicitly not sent and horizon remains closed',page.get_by_test_id('permit-status').inner_text()=='Prepared, not sent' and page.get_by_test_id('horizon').count()==1 and page.get_by_test_id('create-domain').count()==0)
    page.screenshot(path=str(OUT/'UI_FIXTURE_READY.png'),full_page=True)
    page.get_by_test_id('send-locally').click();page.wait_for_timeout(200)
    check('Explicit Send alone invokes the delivery endpoint',page.evaluate("()=>calls.filter(x=>x.path==='/api/glyphoku/send').length") ==1 and page.get_by_test_id('permit-status').inner_text()=='Delivered locally')
    check('Mock inbox content is safely rendered as text', 'offline UI fixture' in page.get_by_test_id('inbox').inner_text())
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
    check('Narrow layout has no document horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    page.screenshot(path=str(OUT/'UI_FIXTURE_MOBILE.png'),full_page=True)
    page.get_by_role('button',name='Sign out',exact=True).click();page.wait_for_timeout(100)
    check('Sign out removes authenticated state and content',page.get_by_test_id('operator-token').count()==1 and page.get_by_test_id('inbox').count()==0)
    check('No unhandled browser JavaScript errors',not errors)
    browser.close()
report={'scope':'OFFLINE UI FIXTURE. In-memory mocked fetch only. No browser-to-server requests, no mail delivery, no proof of human attention. Actual localhost navigation blocked by managed policy. Headed Chromium on Xvfb virtual display.','checks':results,'errors':errors,'pass':sum(x['pass'] for x in results),'fail':sum(not x['pass'] for x in results)}
(OUT/'UI_FIXTURE_REPORT.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

