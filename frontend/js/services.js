/* =========================================================================
   services.js — notifications.
   ========================================================================= */
/* ---------- notifications ----------
   Each notification carries a link ("kind:id") to what it is about. Clicking it
   marks it read, opens the page and then the record itself. Notifications from
   before v1.5 have no link, so the target is worked out from the text and event. */
const NOTIF_VIEW={sub:'submissions',rep:'submissions',kpiprop:'kpis',kpi:'kpis',tp:'kpis',cap:'alerts',emp:'employees',alerts:'alerts'};
const EVENT_VIEW={submission_submitted:'submissions',submission_verified:'submissions',submission_approved:'submissions',submission_returned:'submissions',kpi_alert:'alerts',cap_created:'alerts',target_proposed:'kpis',target_decided:'kpis',employee_report:'employees',escalation:'submissions',chat:'chat'};
function notifTarget(n){
  let [kind,id]=(n.link||'').split(':');
  if(!kind){ // older notification: read the reference out of the text
    const tx=n.text||'';let m;
    if((m=tx.match(/\b(CAP-\d{4}-\d{3,})\b/))){const c=S.caps.find(x=>x.ref===m[1]);kind=c?'cap':'alerts';id=c?c.id:''}
    else if((m=tx.match(/\b([A-Z]{2,}-\d{2})\b\s+(Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun)\b/))){const k=S.kpis.find(x=>x.code===m[1]);const s=k&&subFor(k.id,MONTHS.indexOf(m[2]));kind=s?'sub':'';id=s?s.id:''}
    if(!kind)return {view:EVENT_VIEW[n.event]||null};
  }
  if(kind==='emp'&&!(S.employees||[]).some(e=>e.id===id))return {view:'employees'};
  return {view:NOTIF_VIEW[kind]||EVENT_VIEW[n.event]||null,kind,id};
}
/** Open what a notification is about. Returns false if it cannot be opened here. */
function openNotif(nid){
  const n=S.notifs.find(x=>x.id===nid);if(!n)return false;UI.menu=null;
  if(!n.read){n.read=true;api('POST',`/api/notifications/${n.id}/read`).catch(()=>{})}
  const tg=notifTarget(n);
  if(!tg.view||!allowedViews().includes(tg.view)){render();toast('This notification has no page you can open.');return false}
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