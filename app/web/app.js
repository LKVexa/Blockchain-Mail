import {SessionFence, SessionChangedError} from './session.mjs';
import {initializeTheme} from './theme.mjs';
import {renderTorusSettings} from './torus-settings.mjs';
import {createAttachmentUploads,saveChunkedAttachment} from './attachment-client.mjs';
'use strict';
initializeTheme(document, window);
const $=s=>document.querySelector(s);const fence=new SessionFence();let renderGeneration=0;let paging={before:null,head:null,history:[]};const resetPaging=()=>{paging={before:null,head:null,history:[]}};let sessionId=0;let access='',me=null,page='INBOX',ledger=null,current=null,requestKey=crypto.randomUUID(),internetAttempt=null,composeBusy=false;
const attachmentUploads=createAttachmentUploads();
if(window.workspaceAccess){$('.setup-help').innerHTML='<summary>How do I open another mailbox?</summary><p class="muted">Your recovery key unlocks this local vault. Choose a startup mailbox below, or enter a mailbox access token issued by the operator. Recovery words and tokens are never saved in browser storage.</p><button type="button" id="operator-access">Operator mailbox</button> <button type="button" id="user-access">Second mailbox</button>';const fill=address=>window.workspaceAccess(address).then(token=>{$('#token').value=token});$('#operator-access').onclick=()=>void fill('postmaster@local.test');$('#user-access').onclick=()=>void fill('user@local.test');void fill('postmaster@local.test')}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const bytes=n=>n>1048576?(n/1048576).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB';
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,7000)}
async function api(route,body){
 const op=fence.begin(), bearer=access;
 try {
  const r=await fetch(route,{method:body===undefined?'GET':'POST',signal:op.signal,headers:{Authorization:'Bearer '+bearer,...(body!==undefined?{'Content-Type':'application/json','X-BVE-Request':'1'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  op.check();const d=await r.json();op.check();
  if(!r.ok){const e=Error((d.error||r.status)+': '+(d.message||'Request failed'));e.code=d.error;e.responseReceived=true;throw e}
  return d;
 }finally{op.finish()}
}
async function download(data,name,type='application/json'){if(window.workspaceDownload)return window.workspaceDownload(data,name,type);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function fileGet(route,name){
 const op=fence.begin(), bearer=access;
 try{const r=await fetch(route,{signal:op.signal,headers:{Authorization:'Bearer '+bearer}});op.check();if(!r.ok)throw Error('Export refused: '+r.status);const data=await r.arrayBuffer();op.check();await download(data,name,'application/octet-stream')}finally{op.finish()}
}
async function attachmentGet(id,index,descriptor){if(!descriptor.attachment_id)return fileGet('/api/messages/'+id+'/attachment/'+index,descriptor.name);const operation=fence.begin();try{await saveChunkedAttachment('/api/messages/'+id+'/attachment/'+index,descriptor,{api,check:()=>operation.check(),download:async(blob,name)=>{const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});}finally{operation.finish();}}
async function watchPeerAttempt(attempt,version){if(attempt.watching)return;attempt.watching=true;try{while(version===sessionId&&attempt===internetAttempt&&['QUEUED','SENDING'].includes(attempt.status)){await new Promise(resolve=>setTimeout(resolve,2000));if(version!==sessionId||attempt!==internetAttempt)return;const outbox=await api('/api/torus/outbox'),message=outbox.messages.find(item=>item.request_id===attempt.payload.request_id);if(message)showInternetResult({route:'peer',message,replayed:true});}}catch(error){if(version===sessionId&&error.code!=='SESSION_CHANGED'&&error.name!=='AbortError')composeFeedback('The send is saved. Check its progress in Sent.');}finally{attempt.watching=false;}}
function safe(fn){return async e=>{try{await fn(e)}catch(err){if(err.code!=='SESSION_CHANGED'&&err.name!=='AbortError')toast(err.message)}}}
$('#login-form').onsubmit=safe(async e=>{e.preventDefault();attachmentUploads.clear();fence.invalidate();sessionId++;resetPaging();access=$('#token').value.trim();me=await api('/api/login',{});let prior=null;try{prior=JSON.parse(localStorage.getItem('vexa127-head-pin')||'null')}catch{throw Error('HEAD PIN: this browser cannot keep a checkpoint outside the mail store.')}const held=await api('/api/pin',{checkpoint:prior});localStorage.setItem('vexa127-head-pin',JSON.stringify(held.checkpoint));$('#token').value='';$('#login').hidden=true;$('#shell').hidden=false;await refresh()});
$('#logout').onclick=()=>{attachmentUploads.clear();window.workspaceCloseMailSocket?.();fence.invalidate();sessionId++;renderGeneration++;resetPaging();access='';me=null;current=null;ledger=null;internetAttempt=null;composeBusy=false;$('#reader-body').textContent='';$('#reader-meta').textContent='';$('#reader-title').textContent='';$('#reader-attachments').textContent='';$('#identity').textContent='';$('#compose-from').value='';$('#compose-form').reset();$('#to').value='';requestKey=crypto.randomUUID();$('#quote-result').textContent='';composeFeedback('');updateComposeControls();$('#toast').hidden=true;$('#shell').hidden=true;$('#login').hidden=false;$('#content').textContent='';$('#reader').close();$('#compose').close()};
$('#refresh').onclick=safe(async()=>{resetPaging();await refresh()});$('#nav').onclick=safe(async e=>{if(!e.target.dataset.page)return;page=e.target.dataset.page;resetPaging();await refresh()});
async function refresh(){[me,ledger]=await Promise.all([api('/api/me'),api('/api/ledger')]);$('#height').textContent=ledger.head.header.height;$('#storage').textContent=bytes(me.used_bytes);$('#identity').textContent=(me.assigned_address||me.address)+' · '+me.role;$('#compose-from').value=internetAttempt?.payload.confirmed_from||me.assigned_address||me.address;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#page-title').textContent=({INBOX:'Inbox',ledger:'Signed ledger',directory:'Directory',parents:'Implementation records',settings:'Settings'})[page]||page;await render()}
async function render(){const view=++renderGeneration,c=$('#content');
 if(['INBOX','Sent','Quarantine','Trash'].includes(page)){
  const folder=page,query=new URLSearchParams({folder,limit:'25'});
  if(paging.before){query.set('before',paging.before);query.set('head',paging.head)}
  let result;
  try{result=await api('/api/mailbox-page?'+query)}catch(e){
   if(e.code==='PAGE_CHANGED'&&view===renderGeneration){resetPaging();toast('The signed mailbox snapshot changed. Showing the newest page.');return render()}
   throw e;
  }
  let internetSends='';
  if(folder==='Sent'){try{internetSends=internetSendsHTML(await api('/api/internet/outbox'))}catch(error){if(error.code!=='INTERNET_PROTECTED_REQUIRED')throw error}try{internetSends+=peerSendsHTML(await api('/api/torus/outbox'))}catch(error){if(error.code!=='TORUS_UNAVAILABLE')throw error}}
  if(view!==renderGeneration)throw new SessionChangedError();
  const messages=result.messages;
  c.innerHTML='<section class="panel">'+(folder==='Sent'?'<h2>Your sent messages</h2><h3>Local deliveries</h3>':'')+'<div class="pagination"><span>'+result.total+' messages · '+(result.total?result.start+1:0)+'–'+(result.start+messages.length)+'</span><div class="actions"><button id="newer" '+(!paging.history.length?'disabled':'')+'>← Newer</button><button id="older" '+(!result.next_before?'disabled':'')+'>Older →</button></div></div>'+(messages.length?messages.map(m=>'<button class="mail-row" data-mail="'+m.id+'"><small>'+escape(m.from)+'</small><span class="subject">'+escape(m.subject)+'</span><small>'+new Date(m.created).toLocaleDateString()+'</small></button>').join(''):'<div class="empty"><b>'+(folder==='INBOX'?'A quiet, local inbox.':'No messages here.')+'</b>Use New message to begin.</div>')+internetSends+'</section>';
  c.querySelectorAll('[data-mail]').forEach(b=>b.onclick=safe(()=>read(b.dataset.mail)));
  $('#older').onclick=safe(async()=>{if(!result.next_before)return;paging.history.push({before:paging.before,head:result.head});paging.before=result.next_before;paging.head=result.head;await render()});
  $('#newer').onclick=safe(async()=>{const previous=paging.history.pop();if(!previous)return;paging.before=previous.before;paging.head=previous.head;await render()});return;
 }
if(page==='ledger'){const local127=await api('/api/local127-registry');if(view!==renderGeneration)throw new SessionChangedError();const addressRegister='<h3>Reserved local 127 addresses</h3><p class="muted">Service '+escape(local127.service.host)+'. Mailbox address reservations are unique within this signed local ledger. They do not start additional network listeners.</p>'+(local127.claims.length?'<table><thead><tr><th>Address</th><th>Type</th><th>Registered block</th></tr></thead><tbody>'+local127.claims.map(a=>'<tr><td>'+escape(a.address)+'</td><td>'+escape(a.kind)+'</td><td>'+escape(a.created_height)+'</td></tr>').join('')+'</tbody></table>':'<p class="muted">No local 127 mailbox addresses registered yet.</p>')+(local127.reconciliation_required?'<p class="warning">Earlier local addresses await a signed reservation. The next local address operation records them without rewriting history.</p><ul>'+local127.unreconciled_claims.map(a=>'<li>'+escape(a.address)+' · '+escape(a.kind)+'</li>').join('')+'</ul>'+(local127.reconciliation_conflicts.length?'<p class="warning">Existing address conflicts block new allocation.</p>':''):'');c.innerHTML='<section class="panel"><h2>Signed ledger</h2><p class="muted break">Chain '+escape(ledger.chain_id)+'<br>Head '+escape(ledger.head.hash)+'</p><p class="warning">This chain is operated by one local authority. It has no peer consensus, mining, public settlement, or externally trusted timestamp.</p><div class="actions"><button id="pin">Save checkpoint</button>'+(me.role==='operator'?'<button id="verify">Verify complete chain</button>':'')+'</div><table><thead><tr><th>Block</th><th>Events</th><th>Digest</th></tr></thead><tbody>'+ledger.blocks.map(b=>'<tr><td>'+b.header.height+'</td><td>'+b.events.map(e=>escape(e.type)).join('<br>')+'</td><td class="mono break">'+escape(b.hash)+'</td></tr>').join('')+'</tbody></table>'+addressRegister+'</section>';$('#pin').onclick=safe(async()=>download(JSON.stringify(await api('/api/checkpoint'),null,2),'local-checkpoint.json'));if($('#verify'))$('#verify').onclick=safe(async()=>{const r=await api('/api/admin/verify',{});toast(r.ok?'Verified '+r.blocks_checked+' blocks; local scope only.':'Verification failed: '+r.errors.join('; '))});return}
if(page==='directory'){const d=await api('/api/directory');if(view!==renderGeneration)throw new SessionChangedError();c.innerHTML='<section class="panel"><h2>Registered local identities</h2><p class="muted">Choose a registered address for local delivery. Your assigned address belongs to your existing mailbox.</p><table><tr><th>Mailbox address</th><th>Role</th></tr>'+d.mailboxes.map(a=>'<tr><td>'+escape(a.assigned_address||a.address)+'</td><td>'+escape(a.role)+'</td></tr>').join('')+'</table><h3>Local aliases</h3>'+Object.entries(d.aliases).map(([a,t])=>'<p><code>'+escape(a)+'</code> → '+escape(t.join(', '))+'</p>').join('')+'<p class="muted">New message chooses local delivery or Internet delivery from the recipient address. Internet email supports one recipient and plain text per message.</p></section>';return}
if(page==='parents'){const d=await api('/api/parents');if(view!==renderGeneration)throw new SessionChangedError();c.innerHTML='<section class="panel"><h2>Implementation records</h2><p class="warning">Partial local implementation is not completion of the 6,800 controls. Optional external protocols are not silently substituted with simulations.</p><table><tr><th>Parent</th><th>Workstream</th><th>Disposition</th></tr>'+(d.parents||[]).map(p=>'<tr><td>'+escape(p.parent_id)+'</td><td>'+escape(p.name)+'</td><td><span class="tag">'+escape(p.status)+'</span><p class="muted">'+escape(p.detail)+'</p></td></tr>').join('')+'</table></section>';return}
if(page==='settings'){c.innerHTML='<div class="grid2"><section class="panel"><h2>Mailbox policy</h2><form id="prefs"><label for="prefs-accept">Accept correspondence</label><select id="prefs-accept" name="accept"><option value="true"'+(me.accept?' selected':'')+'>Yes</option><option value="false"'+(!me.accept?' selected':'')+'>No</option></select><label for="prefs-blocked">Blocked senders (comma-separated)</label><input id="prefs-blocked" name="blocked" value="'+escape(me.blocked.join(', '))+'"><button class="primary">Save policy</button></form><div class="actions"><button id="export">Export mailbox</button><button id="rotate">Rotate access token</button><button id="discard-attachments">Discard unfinished attachments</button></div><p class="warning">'+(window.workspaceAccess?'Exports and backups are encrypted with your recovery key. Opening an export writes a decrypted copy you choose.':'Mailbox exports are plaintext. Local backups include private authority and encryption keys. Protect them.')+'</p></section>'+(me.role==='operator'?'<section class="panel"><h2>Mailbox administration</h2><form id="account"><label for="account-address">New local mailbox</label><input id="account-address" name="address" placeholder="alice@local.test" required><button>Create mailbox</button></form><div class="actions"><button id="backup">Create private backup</button><button id="review-quarantine">Review held delivery IDs</button></div><pre id="admin-output"></pre></section>':'')+'</div>';
c.innerHTML+='<section class="panel" aria-labelledby="internet-setting-title"><h2 id="internet-setting-title">Internet sending</h2><div id="internet-settings-controls"></div><p id="internet-settings-status" class="muted" role="status" aria-live="polite">Checking your sender…</p></section>';
c.innerHTML+='<section class="panel" id="torus-settings"></section>';
$('#prefs').onsubmit=safe(async e=>{e.preventDefault();const f=new FormData(e.target);await api('/api/preferences',{daily:me.daily,accept:f.get('accept')==='true',blocked:String(f.get('blocked')).split(',').map(s=>s.trim()).filter(Boolean)});toast('Mailbox policy saved.');await refresh()});$('#export').onclick=safe(async()=>download(JSON.stringify(await api('/api/export'),null,2),'mailbox-export.json'));$('#rotate').onclick=safe(async()=>{if(!confirm('Rotate your token? The old token will stop working. Save the new token immediately.'))return;const d=await api('/api/rotate-token',{});access=d.token;await download(JSON.stringify({address:me.address,token:access},null,2),'access-token.secret.json');toast(window.workspaceAccess?'New token exported privately. Recovery-key access follows this rotation.':'New token saved as a download. Keep it private. Old startup credentials are now stale for this mailbox.')});
$('#discard-attachments').onclick=safe(async()=>{const result=await api('/api/attachments/discard-unfinished',{});attachmentUploads.clear();toast('Removed '+result.discarded+' unfinished file transfers. Saved messages and attachments are preserved.');});
if(me.role==='operator'){$('#account').onsubmit=safe(async e=>{e.preventDefault();const r=await api('/api/admin/mailboxes',{address:String(new FormData(e.target).get('address')).trim()});$('#admin-output').textContent=JSON.stringify(r,null,2);toast('Mailbox created. Save its access token privately.')});$('#backup').onclick=safe(async()=>{const r=await api('/api/admin/backup',{});$('#admin-output').textContent=JSON.stringify(r,null,2)});$('#review-quarantine').onclick=safe(async()=>{const rows=await api('/api/quarantine');$('#admin-output').textContent=JSON.stringify(rows,null,2);const id=prompt('Enter a listed delivery ID to release, or cancel:');if(id){await api('/api/admin/release',{id});toast('Quarantined delivery released by operator.')}})}await loadInternetSettings(view);if(view===renderGeneration)await renderTorusSettings($('#torus-settings'),{api,me,isCurrent:()=>view===renderGeneration,onChange:async()=>{me=await api('/api/login',{});await refresh();},onError:error=>toast(error.message)});return}}
async function loadInternetSettings(view){
 let status;
 try{status=await api('/api/internet/status')}
 catch(error){if(error.code==='SESSION_CHANGED'||error.name==='AbortError'||view!==renderGeneration)return;$('#internet-settings-status').textContent=error.code==='INTERNET_PROTECTED_REQUIRED'?'Unlock the protected workspace to use Internet sending.':'Internet settings could not be loaded. Refresh to try again.';return}
 if(view!==renderGeneration)return;
 if(me.active&&me.mode==='private-torus'){$('#internet-settings-controls').textContent='This private network exchanges mail only with assigned @127 mailboxes.';$('#internet-settings-status').textContent='Existing Internet delivery attempts remain in your Sent history.';return;}
 const controls=$('#internet-settings-controls');
 controls.innerHTML='<p class="muted">Assigned address: <code>'+escape(status.assigned_address||me?.assigned_address||'')+'</code></p><p class="muted">Current sender: <code>'+escape(status.from||status.assigned_address||me?.assigned_address||'')+'</code></p><label for="internet-enabled"><input id="internet-enabled" type="checkbox"'+(status.enabled?' checked':'')+'> Enable Internet sending</label>';
 const toggle=$('#internet-enabled');toggle.checked=!!status.enabled;
 $('#internet-settings-status').textContent=status.enabled?'Internet sending is enabled for your account.':'Internet sending is paused for your account.';
 toggle.onchange=safe(async()=>{
  if(toggle.disabled)return;const enabled=toggle.checked,prior=status;toggle.disabled=true;$('#internet-settings-status').textContent='Saving your sending preference…';
  try{
   const from=prior.from||(enabled?(prior.assigned_address||me?.assigned_address||''):''),helo=prior.helo||(enabled&&from?'['+from.split('@')[1]+']':'');
   const saved=await api('/api/internet/config',{enabled,from,helo});if(view!==renderGeneration)return;status=saved;toggle.checked=!!saved.enabled;$('#internet-settings-status').textContent=saved.enabled?'Internet sending is enabled for your account.':'Internet sending is paused for your account.';
  }catch(error){if(error.code==='SESSION_CHANGED'||error.name==='AbortError'||view!==renderGeneration)return;toggle.checked=!!prior.enabled;$('#internet-settings-status').textContent=error.responseReceived?'Your sending preference was not saved. '+error.message:'Your sending preference could not be confirmed. Refresh to check it.';throw error}
  finally{if(view===renderGeneration)toggle.disabled=false}
 });
}
async function read(id){current=await api('/api/messages/'+id);const proof=await api('/api/messages/'+id+'/proof');$('#reader-title').textContent=current.subject;$('#reader-meta').textContent='From '+current.from+' → '+current.to.join(', ')+' · '+new Date(current.created).toLocaleString()+' · block '+proof.height+' · event '+proof.event_index+' · '+proof.steps.length+' path steps · signature checked';$('#reader-body').textContent=current.body;const area=$('#reader-attachments');area.textContent='';current.attachments.forEach((a,i)=>{const b=document.createElement('button');b.textContent='↓ '+a.name;b.onclick=safe(()=>attachmentGet(id,i,a));area.append(b)});$('#reader').showModal()}
$('#reader-close').onclick=()=>$('#reader').close();$('#download-eml').onclick=safe(()=>fileGet('/api/messages/'+current.id+'/eml',current.message_id+'.eml'));$('#trash').onclick=safe(async()=>{await api('/api/move',{id:current.id,folder:'Trash'});$('#reader').close();await refresh()});$('#compose-open').onclick=()=>{updateComposeControls();$('#compose').showModal()};$('#compose-close').onclick=()=>$('#compose').close();$('#compose-form').oninput=()=>{if(internetAttempt){updateComposeControls();return}requestKey=crypto.randomUUID();$('#quote-result').textContent='';composeFeedback('')};
async function draft(){
 const op=fence.begin(),files=[...$('#attachments').files];
 const snapshot={to:$('#to').value.split(',').map(s=>s.trim()).filter(Boolean),subject:$('#subject').value,body:$('#body').value,request_id:requestKey};
 try{
  if(files.length>4)throw Error('Attach up to four files per message.');
  const attachments=await Promise.all(files.map(async f=>{if(typeof f.slice==='function')return attachmentUploads.prepare(f,{api,check:()=>op.check(),progress:(done,total)=>composeFeedback('Preparing '+f.name+' · '+bytes(done)+' / '+bytes(total))});const a=new Uint8Array(await f.arrayBuffer());op.check();let text='';for(let i=0;i<a.length;i++)text+=String.fromCharCode(a[i]);return {name:f.name,data:btoa(text)}}));
  op.check();return {...snapshot,attachments};
 }finally{op.finish()}
}
function composeFeedback(message,kind=''){$('#send-result').textContent=message;if($('#send-result').dataset)$('#send-result').dataset.kind=kind}
function internetSendsHTML(result){
 const statuses={ACCEPTED:'Recipient server accepted',FAILED:'Send failed',UNKNOWN:'Delivery uncertain',QUEUED:'Queued',SENDING:'Connecting to mail server'},messages=Array.isArray(result.messages)?result.messages:[];
 return '<h3>Internet delivery attempts</h3><p class="muted">Server acceptance does not prove inbox delivery.</p>'+(messages.length?messages.map(m=>'<article class="panel"><h3>'+escape(m.subject||'(No subject)')+'</h3><p>'+escape(m.from)+' → '+escape(m.to)+'</p><p>'+escape(statuses[m.status]||'Status unavailable')+'</p>'+(m.status==='UNKNOWN'?'<p class="warning">Check with the recipient before sending again. A new send attempt could create a duplicate.</p>':'')+(m.detail?'<p class="muted">'+escape(m.detail)+'</p>':'')+'</article>').join(''):'<p class="muted">No Internet sends yet.</p>');
}
function peerSendsHTML(result){const labels={DELIVERED:'Recipient mailbox received',FAILED:'Send failed',UNKNOWN:'Delivery uncertain',QUEUED:'Queued',SENDING:'Sending privately'},messages=result.messages??[];return '<h3>Private delivery attempts</h3>'+(messages.length?messages.map(message=>'<article class="panel"><h3>'+escape(message.subject||'(No subject)')+'</h3><p>'+escape(message.from)+' → '+escape(message.to)+'</p><p>'+escape(labels[message.status]||message.status)+'</p><p class="muted">'+escape(message.detail||'')+'</p></article>').join(''):'<p class="muted">No private peer sends yet.</p>');}
function quoteText(q){return (q.route==='peer'?'Private delivery':q.route==='internet'?'Internet delivery':'Local delivery')+' · from '+(q.from||me?.assigned_address||me?.address||'')+' → '+q.to.join(', ');}
function updateComposeControls(){
 const locked=!!internetAttempt;
 for(const id of ['#to','#subject','#body'])$(id).readOnly=locked||composeBusy;
 if(locked){$('#to').value=internetAttempt.payload.to.join(', ');$('#subject').value=internetAttempt.payload.subject;$('#body').value=internetAttempt.payload.body;$('#compose-from').value=internetAttempt.payload.confirmed_from}
 $('#attachments').disabled=locked||composeBusy;$('#quote').disabled=locked||composeBusy;$('#new-draft').disabled=composeBusy;
 $('#send').disabled=composeBusy||['ACCEPTED','DELIVERED'].includes(internetAttempt?.status);$('#send').textContent=composeBusy?'Checking delivery…':locked?'Check send attempt':'Send';
 $('#compose-help').textContent=locked?'This send attempt keeps the same address, message and ID. Checking it retrieves the existing result.':me?.active&&me.mode==='private-torus'?'Enter an assigned address such as mail@127.0.0.1:10000000000000000000000000000001. Messages reach a local mailbox or another network computer automatically.':'Local and Torus recipients use their assigned @127 addresses, including a private identifier after the colon. Public Internet email supports one recipient and plain text without attachments.';
}
function showInternetResult(result){
 const message=result.message;internetAttempt.status=message.status;
 const existing=result.replayed?' This is the existing send attempt.':'';
 if(result.route==='peer'){composeFeedback(message.status==='DELIVERED'?'Recipient mailbox received.'+existing+' View your message in Sent.':message.status==='FAILED'?'Private send failed.'+existing+' '+(message.detail||''):['QUEUED','SENDING'].includes(message.status)?'Sending privately, including your attachments. You can check progress in Sent.':'Private delivery is uncertain.'+existing+' Check send attempt looks for its signed receipt without sending another copy.',message.status==='DELIVERED'?'success':message.status==='FAILED'?'error':'uncertain');updateComposeControls();if(['QUEUED','SENDING'].includes(message.status))void watchPeerAttempt(internetAttempt,sessionId);return;}
 if(message.status==='ACCEPTED')composeFeedback('Recipient server accepted.'+existing+' This does not prove inbox delivery. View the result in Sent.','success');
 else if(message.status==='FAILED')composeFeedback('Send failed.'+existing+(message.detail?' '+message.detail:'')+' Choose New message when you are ready to make a new attempt.','error');
 else if(message.status==='UNKNOWN')composeFeedback('Delivery uncertain — check recipient before sending again.'+existing+' Your unchanged draft is preserved; Check send attempt retrieves its existing result.','uncertain');
 else composeFeedback('Send attempt recorded.'+existing+' Check send attempt to retrieve its progress.');
 updateComposeControls();
}
async function submitInternetAttempt(){
 const attempt=internetAttempt,version=sessionId;
 composeFeedback('Checking the send attempt with the recipient’s mail server…');
 try{const result=await api('/api/mail/send',attempt.payload);if(version!==sessionId||attempt!==internetAttempt)return;showInternetResult(result)}
 catch(error){if(error.code==='SESSION_CHANGED'||error.name==='AbortError'||version!==sessionId)return;composeFeedback(error.responseReceived?error.message+' Your unchanged draft and send attempt are preserved. Check send attempt to retrieve its existing result.':'Delivery uncertain — check recipient before sending again. Your unchanged draft and send attempt are preserved. Check send attempt retrieves its existing result.',error.responseReceived?'error':'uncertain')}
}
$('#new-draft').onclick=()=>{
 if(composeBusy)return;
 if(internetAttempt&&!['ACCEPTED','DELIVERED','FAILED'].includes(internetAttempt.status)&&!confirm('This send attempt may still be accepted by the recipient’s mail server. Check with the recipient before sending again. A new message creates a new send attempt and could produce a duplicate. Start a new message?'))return;
 internetAttempt=null;$('#compose-form').reset();$('#to').value='';$('#compose-from').value=me?.assigned_address||me?.address||'';requestKey=crypto.randomUUID();$('#quote-result').textContent='';composeFeedback('');updateComposeControls();$('#to').focus();
};
$('#show-send-history').onclick=safe(async()=>{$('#compose').close();page='Sent';resetPaging();await refresh()});
$('#quote').onclick=safe(async()=>{
 if(composeBusy||internetAttempt)return;const version=sessionId;composeBusy=true;updateComposeControls();
 try{const q=await api('/api/mail/quote',await draft());$('#quote-result').textContent=quoteText(q);}
 catch(error){if(error.code!=='SESSION_CHANGED'&&error.name!=='AbortError'&&version===sessionId)composeFeedback(error.message,'error');throw error}
 finally{if(version===sessionId){composeBusy=false;updateComposeControls()}}
});
$('#compose-form').onsubmit=safe(async e=>{
 e.preventDefault();if(composeBusy||['ACCEPTED','DELIVERED'].includes(internetAttempt?.status))return;const version=sessionId;composeBusy=true;updateComposeControls();
 try{
  if(internetAttempt){await submitInternetAttempt();return}
  const d=await draft(),q=await api('/api/mail/quote',d);
  $('#quote-result').textContent=quoteText(q);
  if(q.route==='peer'){internetAttempt={status:'PENDING',payload:{...d,to:q.to,confirmed_from:q.from,expected_route:'peer'}};updateComposeControls();await submitInternetAttempt();return;}
  if(q.route==='internet'){
   if(!confirm('Send email from '+q.from+' to '+q.to.join(', ')+'?'))return;
   internetAttempt={status:'PENDING',payload:{...d,to:q.to,confirmed_from:q.from,confirmed_helo:q.helo,expected_route:'internet'}};updateComposeControls();await submitInternetAttempt();return;
  }
  if(q.route!=='local')throw Error('The delivery route could not be verified. Your draft is preserved.');
  const r=await api('/api/mail/send',{...d,expected_route:'local'}),held=await api('/api/pin',{checkpoint:JSON.parse(localStorage.getItem('vexa127-head-pin')||'null')});localStorage.setItem('vexa127-head-pin',JSON.stringify(held.checkpoint));toast('Message sent'+(r.replayed?' (existing result; no duplicate)':'')+'. View it in Sent.');$('#compose').close();e.target.reset();$('#to').value='';requestKey=crypto.randomUUID();await refresh();
 }catch(error){if(error.code!=='SESSION_CHANGED'&&error.name!=='AbortError'&&version===sessionId)composeFeedback(error.message,'error');throw error}
 finally{if(version===sessionId){composeBusy=false;updateComposeControls()}}
});
