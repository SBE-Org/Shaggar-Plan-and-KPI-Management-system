/* =========================================================================
   services.js — service desk, citizen portal and notifications.
   ========================================================================= */
function maskPhone(p){if(!p)return '—';const d=p.replace(/\s/g,'');return d.slice(0,4)+' ••• ••• '+d.slice(-3)}
const prio=id=>S.config.desk.priorities.find(p=>p.id===id)||S.config.desk.priorities[1];
const cat=id=>S.config.desk.categories.find(c=>c.id===id);
function slaInfo(r){
  if(!r.dueAt)return {key:'none',label:'No deadline'};
  const due=new Date(r.dueAt).getTime();
  if(['Resolved','Closed'].includes(r.status)){const at=new Date(r.resolvedAt||r.createdAt).getTime();return at<=due?{key:'good',label:'Met deadline',icon:'✓'}:{key:'serious',label:'Missed deadline',icon:'!'}}
  const left=due-Date.now(),span=due-new Date(r.createdAt).getTime();
  const h=Math.abs(left)/3600e3,txt=h>=48?Math.round(h/24)+' days':Math.max(1,Math.round(h))+' h';
  if(left<0)return {key:'critical',label:`Overdue ${txt}`,icon:'✕'};
  if(left<span*.25)return {key:'warning',label:`Due in ${txt}`,icon:'!'};
  return {key:'none',label:`Due in ${txt}`,icon:'○'};
}
const slaChip=r=>{const s=slaInfo(r);return `<span class="chip c-${s.key}"><i>${s.icon||''}</i>${s.label}</span>`};
const prioChip=p=>{const m={urgent:'c-critical',high:'c-serious',medium:'c-info',low:'c-none'}[p]||'c-none';return `<span class="chip ${m}">${esc(prio(p).name)}</span>`};


/* ---------- service desk ---------- */
const RSTAT=['New','Assigned','In progress','Resolved','Closed'];
function rChip(s){const m={New:['c-info','●'],Assigned:['c-brand','→'],'In progress':['c-warning','◐'],Resolved:['c-good','✓'],Closed:['c-none','■']}[s]||['c-none',''];return `<span class="chip ${m[0]}"><i>${m[1]}</i>${s}</span>`}
function deskVisible(r){const u=me();if(!u)return false;if(can('desk_intake'))return true;if(r.assignedTo===u.id)return true;if(u.role==='dept_head'&&r.deptId===u.deptId)return true;return false}
function vDesk(){
  const u=me();const tab=UI.tab.desk||(can('desk_intake')?'all':'mine');
  let list=S.requests.filter(deskVisible);
  if(tab==='mine')list=list.filter(r=>r.assignedTo===u.id||(u.role==='dept_head'&&r.deptId===u.deptId));
  if(tab==='new')list=list.filter(r=>r.status==='New');
  if(tab==='esc')list=list.filter(r=>(r.esc||0)>0&&!['Resolved','Closed'].includes(r.status));
  list=list.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const emp=S.employees.find(e=>e.userId===u.id);
  const open=S.requests.filter(r=>deskVisible(r)&&!['Resolved','Closed'].includes(r.status));
  return `<div class="pagehead"><div><h1>${t('Service desk')}</h1><p>Complaints, service requests and appointment requests. The Mayor's Office registers and routes them, department heads assign staff, and staff resolve them. Each category has a priority and deadline; unresolved items escalate automatically.</p></div>
   ${can('desk_intake')?`<button class="btn pri" onclick="reqForm()">${ico('plus',16)} Register request</button>`:''}</div>
  <div class="tiles"><div class="tile"><div class="lbl">Open</div><div class="val">${open.length}</div></div><div class="tile"><div class="lbl">Overdue</div><div class="val">${open.filter(r=>slaInfo(r).key==='critical').length}</div></div><div class="tile"><div class="lbl">Escalated</div><div class="val">${open.filter(r=>(r.esc||0)>=2).length}</div><div class="sub">level 2 or higher</div></div><div class="tile"><div class="lbl">Resolved on time</div><div class="val">${(()=>{const d=S.requests.filter(r=>deskVisible(r)&&['Resolved','Closed'].includes(r.status));return d.length?Math.round(d.filter(r=>slaInfo(r).key==='good').length/d.length*100)+'%':'—'})()}</div></div></div>
  ${emp?myIndicatorsCard(emp):''}
  <div class="tabs">${(can('desk_intake')?[['all','All'],['new','New / unrouted'],['esc','Escalated']]:[]).concat([['mine',u.role==='dept_head'?'My department':'Assigned to me']]).map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.desk='${k}';render()">${l}</button>`).join('')}</div>
  <div class="card">${dataTable('desk_'+tab,{rows:list,exportName:'service-requests',search:r=>[r.ref,r.subject,r.citizenName,r.type,cat(r.category)?.name||''].join(' '),
    filters:[{key:'status',label:t('Status'),opts:RSTAT.map(s=>[s,s]),get:r=>r.status},{key:'prio',label:'Priority',opts:S.config.desk.priorities.map(p=>[p.id,p.name]),get:r=>r.priority},{key:'type',label:'Type',opts:['Complaint','Service request','Appointment'].map(x=>[x,x]),get:r=>r.type},{key:'dept',label:t('Department'),opts:[['null',"Mayor's Office"],...S.depts.map(d=>[d.id,d.short])],get:r=>String(r.deptId)}],
    onRow:r=>`reqDetail('${r.id}')`,
    cols:[
      {h:'Reference',td:r=>`<span class="mono" style="white-space:nowrap">${esc(r.ref)}</span>`,csv:r=>r.ref,sort:r=>r.ref},
      {h:'Subject',td:r=>`<b>${esc(r.subject)}</b><div class="muted small">${esc(r.type)} · ${esc(cat(r.category)?.name||'Uncategorised')}</div>`,csv:r=>r.subject,sort:r=>r.subject},
      {h:'Priority',td:r=>prioChip(r.priority),csv:r=>prio(r.priority).name,sort:r=>['urgent','high','medium','low'].indexOf(r.priority)},
      {h:'Office',td:r=>r.deptId?esc(dept(r.deptId).short):"Mayor's Office",csv:r=>r.deptId?dept(r.deptId).short:"Mayor's Office"},
      {h:'Assigned to',td:r=>r.assignedTo?esc(uname(r.assignedTo)):'<span class="muted">—</span>',csv:r=>r.assignedTo?uname(r.assignedTo):''},
      {h:t('Status'),td:r=>rChip(r.status)+((r.esc||0)>0&&!['Resolved','Closed'].includes(r.status)?` <span class="pill" title="Escalation level">L${r.esc}</span>`:''),csv:r=>r.status,sort:r=>RSTAT.indexOf(r.status)},
      {h:'Deadline',td:r=>slaChip(r),csv:r=>r.dueAt||'',sort:r=>r.dueAt||''},
      {h:'Registered',td:r=>`<span class="small" style="white-space:nowrap">${dshort(r.createdAt)}</span>`,csv:r=>r.createdAt,sort:r=>r.createdAt},
    ]})}</div>`;
}
function myIndicatorsCard(emp){
  return `<div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>My performance indicators</h2><span><a href="#employees" class="small" style="margin-right:10px">Propose targets / report results</a>${chip(empScore(emp))} <b class="num">${pct(empScore(emp))}</b></span></div><table class="tbl"><tbody>${emp.indicators.map(i=>{const a=indAch(i);return `<tr><td>${esc(i.name)}</td><td class="num">${fmtU(i.actual,i.unit)} / ${fmtU(i.target,i.unit)}</td><td style="width:160px">${achBar(a)}</td><td class="num">${pct(a)}</td></tr>`}).join('')}</tbody></table>${emp.evaluation?`<p class="small" style="margin:10px 0 0">Latest evaluation: <b>${esc(emp.evaluation.rating)}</b> — ${esc(emp.evaluation.comment)}</p>`:''}</div>`;
}
function reqForm(citizen){
  const cats=S.config.desk.categories;
  openModal(citizen?'Submit a request to the City':'Register a citizen request',`<form id="rf" class="fg" onsubmit="return saveReq(event,${citizen?1:0})">
   <div class="full"><label class="f">Category</label><select name="category" onchange="reqCatChange(this.value)">${cats.map(c=>`<option value="${c.id}">${esc(c.name)} (${esc(c.type)})</option>`).join('')}</select></div>
   ${citizen?'':`<div><label class="f">Citizen name</label><input name="citizenName" required></div>`}
   <div><label class="f">Phone</label><input type="tel" name="phone" required placeholder="09…"></div>
   ${citizen?'':`<div><label class="f">Priority</label><select name="priority" id="rf_p">${S.config.desk.priorities.map(p=>`<option value="${p.id}" ${p.id===cats[0].priority?'selected':''}>${esc(p.name)} — resolve within ${p.hours} h</option>`).join('')}</select></div>`}
   <div id="pdw" style="display:${cats[0].type==='Appointment'?'':'none'}"><label class="f">Preferred appointment date</label><input type="date" name="preferredDate"></div>
   <div class="full"><label class="f">Subject</label><input name="subject" required></div>
   <div class="full"><label class="f">Details</label><textarea name="details" required></textarea></div>
   <div class="full small muted" id="rf_info">${reqCatInfo(cats[0].id)}</div></form>`,
   `<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="rf">Submit request</button>`);
}
function reqCatInfo(id){const c=cat(id);return `Routed to ${c.deptId?dept(c.deptId).name:"the Mayor's Office"} · default priority ${prio(c.priority).name} (resolve within ${prio(c.priority).hours} hours)`}
function reqCatChange(id){const c=cat(id);$('#pdw').style.display=c.type==='Appointment'?'':'none';const p=$('#rf_p');if(p)p.value=c.priority;$('#rf_info').textContent=reqCatInfo(id)}
function saveReq(e,citizen){
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  act('POST','/api/requests',f,r=>`Request registered — reference ${r.ref}`);return false;
}
function reqDetail(id){
  const r=S.requests.find(x=>x.id===id),u=me();
  const canRoute=can('desk_intake');const canAssign=(u.role==='dept_head'&&r.deptId===u.deptId)||canRoute;
  const canWork=(r.assignedTo===u.id||(u.role==='dept_head'&&r.deptId===u.deptId)||canRoute)&&r.status!=='Closed'&&u.role!=='citizen';
  const staff=S.users.filter(x=>x.active&&(x.role==='staff'||x.role==='dept_head')&&(!r.deptId||x.deptId===r.deptId));
  openModal(`${r.type} · ${r.ref}`,`<div class="grid g2"><div><dl class="kv"><dt>Category</dt><dd>${esc(cat(r.category)?.name||'—')}</dd><dt>Priority</dt><dd>${prioChip(r.priority)}</dd><dt>${t('Status')}</dt><dd>${rChip(r.status)} ${(r.esc||0)>0?`<span class="pill">Escalation level ${r.esc}</span>`:''}</dd><dt>Deadline</dt><dd>${dt(r.dueAt)} ${slaChip(r)}</dd><dt>Citizen</dt><dd>${esc(r.citizenName)} · ${esc(r.phone||'—')}${r.phoneMasked?' <span class="pill" title="Masked to protect personal data">masked</span>':''}</dd><dt>Office</dt><dd>${r.deptId?esc(dept(r.deptId).name):"Mayor's Office"}</dd><dt>Assigned to</dt><dd>${esc(uname(r.assignedTo))}</dd>${r.preferredDate?`<dt>Preferred date</dt><dd>${dshort(r.preferredDate)}</dd>`:''}</dl>
   <h3 style="margin-top:16px">${esc(r.subject)}</h3><p style="margin:6px 0">${esc(r.details)}</p></div>
   <div><h4 style="margin-bottom:8px">History</h4><ul class="tl">${r.history.map(h=>`<li>${esc(h.text)}<div class="muted small">${esc(sysName(h.by))} · ${dt(h.at)}</div></li>`).join('')}</ul>
   ${canWork?`<div class="fg" style="margin-top:6px">
     ${canRoute?`<div><label class="f">Route to office</label><select id="rq_d"><option value="">Mayor's Office</option>${S.depts.map(d=>`<option value="${d.id}" ${d.id===r.deptId?'selected':''}>${esc(d.short)}</option>`).join('')}</select></div>`:''}
     ${canAssign?`<div><label class="f">Assign to</label><select id="rq_a"><option value="">—</option>${staff.map(x=>`<option value="${x.id}" ${x.id===r.assignedTo?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`:''}
     ${canRoute?`<div><label class="f">Priority</label><select id="rq_p">${S.config.desk.priorities.map(p=>`<option value="${p.id}" ${p.id===r.priority?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`:''}
     <div><label class="f">${t('Status')}</label><select id="rq_s">${RSTAT.map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select></div>
     <div class="full"><label class="f">Note</label><textarea id="rq_n"></textarea></div></div>`:''}</div></div>`,
   `<button class="btn" onclick="closeModal()">${t('Close')}</button>${canWork?`<button class="btn pri" onclick="reqUpdate('${r.id}')">Save changes</button>`:''}`,true);
}
function reqUpdate(id){
  const b={status:$('#rq_s').value,note:$('#rq_n').value.trim()};
  const d=$('#rq_d'),a=$('#rq_a'),p=$('#rq_p');
  if(d)b.deptId=d.value||null;if(a)b.assignedTo=a.value||null;if(p)b.priority=p.value;
  act('PUT',`/api/requests/${id}`,b,'Request updated');
}
function vPortal(){
  const u=me();const mine=S.requests.filter(r=>r.createdBy===u.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const tr=UI.track?[...S.requests,...((S.archive&&S.archive.requests)||[])].find(r=>r.ref.toLowerCase()===UI.track.toLowerCase()):null;
  return `<div class="pagehead"><div><h1>${t('Citizen portal')}</h1><p>Book an appointment, file a complaint or request a service. You will get a reference number and SMS updates as your request moves forward.</p></div><button class="btn pri" onclick="reqForm(true)">${ico('plus',16)} New request</button></div>
  <div class="grid g3" style="margin-bottom:16px">${[['Appointment','Request a meeting with the Mayor or a department head.','C7'],['Complaint','Report poor service, delays or misconduct.','C9'],['Service request','Ask for a public service such as street lights or drainage.','C3']].map(([k,d,c])=>`<div class="card"><h3>${k}</h3><p class="small ink2" style="min-height:40px">${d}</p><button class="btn sm" onclick="reqForm(true);setTimeout(()=>{const s=document.querySelector('#rf [name=category]');s.value='${c}';reqCatChange('${c}')},0)">Start</button></div>`).join('')}</div>
  <div class="card"><div class="cardhead"><h2>Track a request</h2><form style="display:flex;gap:6px" onsubmit="UI.track=this.q.value.trim();render();return false"><input type="search" name="q" placeholder="SR-2026-0001" aria-label="Request reference" value="${esc(UI.track||'')}"><button class="btn">Track</button></form></div>
   ${UI.track?(tr?`<div><b class="mono">${esc(tr.ref)}</b> · ${esc(tr.subject)} · ${rChip(tr.status)}<ul class="tl" style="margin-top:12px">${tr.history.filter(h=>!/^Escalation/.test(h.text)).map(h=>`<li>${esc(h.text.replace(/Assigned to [^;—]+/,'Assigned to an officer'))}<div class="muted small">${dt(h.at)}</div></li>`).join('')}</ul></div>`:'<div class="muted">No request has that reference. Check the number on your SMS or receipt.</div>'):''}</div>
  <div class="card"><h2 style="margin-bottom:10px">My requests</h2>${mine.length?`<div class="tblwrap"><table class="tbl"><thead><tr><th>Reference</th><th>Type</th><th>Subject</th><th>${t('Status')}</th><th>Submitted</th></tr></thead><tbody>${mine.map(r=>`<tr><td class="mono">${esc(r.ref)}</td><td>${esc(r.type)}</td><td>${esc(r.subject)}</td><td>${rChip(r.status)}</td><td>${dshort(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">You have no requests yet. Start one above.</div>'}</div>`;
}

/* ---------- notifications ----------
   Each notification carries a link ("kind:id") to what it is about. Clicking it
   marks it read, opens the page and then the record itself. Notifications from
   before v1.5 have no link, so the target is worked out from the text and event. */
const NOTIF_VIEW={sub:'submissions',rep:'submissions',kpiprop:'kpis',kpi:'kpis',tp:'kpis',cap:'alerts',req:'desk',emp:'employees',alerts:'alerts'};
const EVENT_VIEW={submission_submitted:'submissions',submission_verified:'submissions',submission_approved:'submissions',submission_returned:'submissions',kpi_alert:'alerts',cap_created:'alerts',target_proposed:'kpis',target_decided:'kpis',employee_report:'employees',request_new:'desk',request_assigned:'desk',request_status:'desk',escalation:'submissions',chat:'chat'};
function notifTarget(n){
  let [kind,id]=(n.link||'').split(':');
  if(!kind){ // older notification: read the reference out of the text
    const tx=n.text||'';let m;
    if((m=tx.match(/\b(SR-\d{4}-\d{3,})\b/))){const r=S.requests.find(x=>x.ref===m[1]);kind='req';id=r?r.id:'';if(!r&&can('citizen'))return {view:'portal',track:m[1]}}
    else if((m=tx.match(/\b(CAP-\d{4}-\d{3,})\b/))){const c=S.caps.find(x=>x.ref===m[1]);kind=c?'cap':'alerts';id=c?c.id:''}
    else if((m=tx.match(/\b([A-Z]{2,}-\d{2})\b\s+(Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun)\b/))){const k=S.kpis.find(x=>x.code===m[1]);const s=k&&subFor(k.id,MONTHS.indexOf(m[2]));kind=s?'sub':'';id=s?s.id:''}
    if(!kind)return {view:EVENT_VIEW[n.event]||null};
  }
  // a citizen follows their request in the portal, where staff names are not shown
  if(kind==='req'&&can('citizen')&&!can('desk_handle')){const r=S.requests.find(x=>x.id===id);return {view:'portal',track:r?r.ref:null}}
  if(kind==='emp'&&!(S.employees||[]).some(e=>e.id===id))return {view:'employees'};
  return {view:NOTIF_VIEW[kind]||EVENT_VIEW[n.event]||null,kind,id};
}
/** Open what a notification is about. Returns false if it cannot be opened here. */
function openNotif(nid){
  const n=S.notifs.find(x=>x.id===nid);if(!n)return false;UI.menu=null;
  if(!n.read){n.read=true;api('POST',`/api/notifications/${n.id}/read`).catch(()=>{})}
  const tg=notifTarget(n);
  if(!tg.view||!allowedViews().includes(tg.view)){render();toast('This notification has no page you can open.');return false}
  if(tg.track)UI.track=tg.track;
  if(tg.kind==='alerts'||tg.kind==='cap')UI.tab.al=tg.kind==='cap'?'caps':'alerts';
  if(tg.kind==='sub')UI.tab.sub=UI.tab.sub||'matrix';
  // switch page first, so the hash change does not close the record we open next
  S.ui.view=tg.view;UI.drawer=false;commit();if(location.hash.slice(1)!==tg.view)location.hash=tg.view;window.scrollTo(0,0);
  const gone=what=>toast(`That ${what} is no longer available to you; it may have been withdrawn or archived.`);
  const opener={
    sub:()=>S.subs.some(x=>x.id===tg.id)?subDetail(tg.id):gone('report'),
    rep:()=>{const [kid,m]=String(tg.id).split('.');kpi(kid)?openSub(kid,+m):gone('report')},
    kpiprop:()=>{const k=kpi(tg.id);if(!k)return gone('KPI');k.approval==='approved'?kpiDetail(k.id):kpiPropDetail(k.id)},
    kpi:()=>kpi(tg.id)?kpiDetail(tg.id):gone('KPI'),
    tp:()=>{const p=tpList().find(x=>x.id===tg.id);if(!p)return gone('target proposal');tpDetail(p.id)},
    cap:()=>S.caps.some(x=>x.id===tg.id)?capDetail(tg.id):gone('action plan'),
    req:()=>S.requests.some(x=>x.id===tg.id)?reqDetail(tg.id):gone('request'),
    emp:()=>empDetail(tg.id),
  }[tg.kind];
  if(opener&&tg.id)setTimeout(opener,0);
  return false;
}
function vNotifications(){
  const u=me();const tab=UI.tab.nt||'inbox';const adm=can('config');
  const tabs=[['inbox','Inbox'],['prefs','My channels']].concat(adm?[['channels','Channels & rules'],['outbox','SMS & email outbox']]:[]);
  let body='';
  if(tab==='inbox'){const list=S.notifs.filter(n=>n.to===u.id);body=`<div class="card">${dataTable('nt_inbox',{rows:list,search:n=>n.text,filters:[{key:'ev',label:'Event',opts:EVENTS,get:n=>n.event||'general'},{key:'rd',label:'Read',opts:[['unread','Unread'],['read','Read']],get:n=>n.read?'read':'unread'}],
      toolbar:list.some(n=>!n.read)?`<button class="btn sm" onclick="markRead()">${t('Mark all read')}</button>`:'',
      onRow:n=>`openNotif('${n.id}')`,
      cols:[{h:'',w:'28px',td:n=>n.read?'':'<span title="Unread" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--brand)"></span>'},{h:'Message',td:n=>esc(n.text)},{h:'Event',td:n=>`<span class="pill">${esc((EVENTS.find(e=>e[0]===(n.event||'general'))||[])[1]||'General')}</span>`},{h:'Received',td:n=>`<span class="small">${dt(n.at)}</span>`,sort:n=>n.at}]})}</div>`}
  if(tab==='prefs')body=`<div class="card"><h2>Where you receive notifications</h2><p class="ink2">In-system notifications are always on. SMS and email are sent only for events the administrator has enabled, once the gateways are approved.</p><dl class="kv" style="margin:12px 0"><dt>Mobile</dt><dd>${esc(u.phone||'—')}</dd><dt>Email</dt><dd>${esc(u.email||'—')}</dd><dt>SMS</dt><dd>${u.prefSms!==false?'On':'Off'}</dd><dt>Email</dt><dd>${u.prefEmail!==false?'On':'Off'}</dd></dl><button class="btn" onclick="profileModal()">Change in my profile</button></div>`;
  if(tab==='channels'){const N=S.config.notify;
    body=`<div class="grid g2">${['sms','email'].map(ch=>`<div class="card"><div class="cardhead"><h2>${ch==='sms'?'SMS gateway':'Email (SMTP)'}</h2>${N[ch].approved?'<span class="chip c-good"><i>✓</i>Approved for use</span>':'<span class="chip c-warning"><i>!</i>Pending integration & cost approval</span>'}</div>
      <div class="fg"><div><label class="f">Provider</label><input id="nc_${ch}_p" value="${esc(N[ch].provider)}"></div><div><label class="f">${ch==='sms'?'Sender ID':'From address'}</label><input id="nc_${ch}_s" value="${esc(ch==='sms'?N[ch].sender:N[ch].from)}"></div>
      <div class="full"><label class="toggle"><input type="checkbox" id="nc_${ch}_a" ${N[ch].approved?'checked':''}> Integration and cost approved — release held messages to the gateway</label></div></div>
      <p class="small muted" style="margin:10px 0 0">${ch==='sms'?'Bulk SMS is billed per message by the operator. Until approval, messages are held in the outbox and nothing is sent.':'Email needs the city mail server or a mail service account. Until approval, messages are held in the outbox.'}</p></div>`).join('')}</div>
    <div class="card"><div class="cardhead"><h2>Which events use which channel</h2></div><div class="tblwrap"><table class="tbl perm"><thead><tr><th>Event</th><th>In-system</th><th>SMS</th><th>Email</th></tr></thead><tbody>${EVENTS.map(([k,l])=>`<tr><td>${esc(l)}</td><td><input type="checkbox" checked disabled aria-label="In-system for ${esc(l)}"></td><td><input type="checkbox" id="ne_${k}_sms" ${N.events[k]?.sms?'checked':''} aria-label="SMS for ${esc(l)}"></td><td><input type="checkbox" id="ne_${k}_email" ${N.events[k]?.email?'checked':''} aria-label="Email for ${esc(l)}"></td></tr>`).join('')}</tbody></table></div>
    <div style="margin-top:14px"><button class="btn pri" onclick="saveChannels()">${t('Save')} channel settings</button></div></div>`}
  if(tab==='outbox')body=`<div class="card">${dataTable('outbox',{rows:S.outbox,exportName:'notification-outbox',search:o=>o.to+' '+o.text,filters:[{key:'ch',label:'Channel',opts:[['sms','SMS'],['email','Email']],get:o=>o.channel},{key:'st',label:t('Status'),opts:[...new Set(S.outbox.map(o=>o.status))].map(s=>[s,s]),get:o=>o.status}],
     cols:[{h:'Time',td:o=>`<span class="small">${dt(o.at)}</span>`,csv:o=>o.at,sort:o=>o.at},{h:'Channel',td:o=>o.channel==='sms'?'SMS':'Email',csv:o=>o.channel},{h:'To',td:o=>`${esc(uname(o.userId))}<div class="muted small">${esc(o.channel==='sms'?maskPhone(o.to):o.to)}</div>`,csv:o=>uname(o.userId)},{h:'Message',td:o=>`<span class="small">${esc(o.text)}</span>`,csv:o=>o.text},{h:t('Status'),td:o=>`<span class="chip ${/Held|Failed/.test(o.status)?'c-warning':'c-good'}">${esc(o.status)}</span>`,csv:o=>o.status}]})}</div>`;
  return `<div class="pagehead"><div><h1>${t('Notifications')}</h1><p>In-system alerts for every user, with SMS and email available once the gateway integrations and their running costs are approved.</p></div></div>
  <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.nt='${k}';render()">${l}</button>`).join('')}</div>${body}`;
}
function saveChannels(){const N=JSON.parse(JSON.stringify(S.config.notify));
  ['sms','email'].forEach(ch=>{N[ch].provider=$(`#nc_${ch}_p`).value;if(ch==='sms')N[ch].sender=$(`#nc_${ch}_s`).value;else N[ch].from=$(`#nc_${ch}_s`).value;N[ch].approved=$(`#nc_${ch}_a`).checked});
  EVENTS.forEach(([k])=>{N.events[k]={sms:$(`#ne_${k}_sms`).checked,email:$(`#ne_${k}_email`).checked}});
  act('PUT','/api/settings/notify',N,'Channel settings saved')}