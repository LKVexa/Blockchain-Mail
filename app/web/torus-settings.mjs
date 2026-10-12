// Joining a computer exchanges public registrations through the private service.
// A connection code grants one registration; mailbox and recovery keys stay here.
export async function renderTorusSettings(container,{api,me,isCurrent,onChange,onError}){
 const heading=document.createElement('h2');heading.textContent='Connected computers';container.append(heading);
 let status;try{status=await api('/api/torus/status')}catch(error){if(!isCurrent())return;const text=document.createElement('p');text.textContent='Open the protected workspace to connect private mail.';container.append(text);return;}
 if(!isCurrent())return;
 const addText=(text,kind='muted')=>{const p=document.createElement('p');p.className=kind;p.textContent=text;container.append(p);return p;};
 const description=addText(status.active?'Private mail is ready. Use New message for any assigned @127 address; this application finds the receiving computer automatically.':status.configured?'This computer is finishing its connection to the private network.':'Private mail starts automatically when this workspace opens.');
 const summary=addText('');
 const describe=()=>{summary.textContent=status.configured?'This computer · '+status.prefix+' · '+status.peers.length+' connected computer'+(status.peers.length===1?'':'s'):'';};describe();
 if(me.role!=='operator'){addText('The mailbox operator connects computers here. Your Inbox and Sent history belong to your account.');return;}
 const actions=document.createElement('div');actions.className='actions';container.append(actions);const feedback=addText('');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const controls=[];let busy=false;
 const run=async(action,{message='Connecting the computer…',changed=true}={})=>{
  if(busy||!isCurrent())return;busy=true;controls.forEach(control=>control.disabled=true);feedback.textContent=message;
  try{await action();if(isCurrent()&&changed)await onChange();}
  catch(error){if(isCurrent()){feedback.textContent=error.message;onError(error);}}
  finally{busy=false;if(isCurrent())controls.forEach(control=>control.disabled=false);}
 };
 const button=(label,action,options)=>{const element=document.createElement('button');element.type='button';element.textContent=label;element.onclick=()=>run(action,options);actions.append(element);controls.push(element);return element;};
 if(!status.configured)button('Start private mail',async()=>{await api('/api/torus/create',{});},{message:'Starting private mail…'});
 if(status.active&&status.node_id==='n00'){
  const codeArea=document.createElement('div');codeArea.hidden=true;container.append(codeArea);
  const codeLabel=document.createElement('label');codeLabel.textContent='Connection code for the other computer';codeArea.append(codeLabel);
  const sharedCode=document.createElement('textarea');sharedCode.readOnly=true;sharedCode.rows=4;sharedCode.setAttribute('aria-label','Connection code for the other computer');codeArea.append(sharedCode);
  const copy=document.createElement('button');copy.type='button';copy.textContent='Copy connection code';copy.onclick=()=>run(async()=>{
   if(!sharedCode.value)return;
   try{await navigator.clipboard.writeText(sharedCode.value);if(isCurrent())feedback.textContent='Connection code copied. Paste it into Connected computers on the other computer.';}
   catch{if(isCurrent()){sharedCode.focus();sharedCode.select();feedback.textContent='Copy the selected connection code and paste it on the other computer.';}}
  },{message:'Copying the connection code…',changed:false});codeArea.append(copy);controls.push(copy);
  const codeHelp=document.createElement('p');codeHelp.className='muted';codeHelp.textContent='Share this code only with the computer you want to connect. Keep this workspace open while it joins. Each code connects one computer.';codeArea.append(codeHelp);
  button('Connect another computer',async()=>{const result=await api('/api/torus/connection-code',{});if(!isCurrent())return;if(typeof result.code!=='string'||!result.code)throw Error('A connection code was not returned. Try again.');sharedCode.value=result.code;codeArea.hidden=false;sharedCode.focus();feedback.textContent='Open this application on the other computer and paste this code into Connected computers.';},{message:'Preparing a connection code…',changed:false});
 }
 const form=document.createElement('form');container.append(form);
 const label=document.createElement('label');label.textContent='Connection code from the first computer';form.append(label);
 const code=document.createElement('textarea');code.rows=4;code.maxLength=8192;code.placeholder='Paste the connection code here';code.setAttribute('aria-label','Connection code from the first computer');code.required=true;form.append(code);controls.push(code);
 const connect=document.createElement('button');connect.type='submit';connect.textContent='Connect this computer';form.append(connect);controls.push(connect);
 form.onsubmit=event=>{event.preventDefault();return run(async()=>{const value=code.value.trim();if(!value)throw Error('Paste the connection code from the first computer.');await api('/api/torus/connect',{code:value});if(isCurrent())code.value='';});};
 addText('Connecting once adds this computer to the same private network. After that, compose, attach files and send normally. Your mail stays in your own account.');
 addText('This private group supports up to '+(status.limits?.computers??256)+' computers. Assigned addresses can use 127.x.x.x followed by a private identifier of up to 32 digits. The signed directory connects that address to the receiving computer automatically. Receiving and forwarding computers must have this application running.');
 if(status.active&&status.node_id!=='n00'){
  try{await api('/api/torus/sync',{});if(!isCurrent())return;status=await api('/api/torus/status');if(!isCurrent())return;describe();description.textContent='Private mail is ready. Use New message for any assigned @127 address; this application finds the receiving computer automatically.';}
  catch{if(isCurrent())feedback.textContent='The first computer is offline. Your saved connections are still available; new computers will appear when it is online.';}
 }
}
