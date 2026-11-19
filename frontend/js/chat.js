/* =========================================================================
   chat.js — internal messages: one-to-one conversations between staff
   accounts (departments, the Mayor, the Mayor's Office, administrators).
   ========================================================================= */
const CHAT={convs:null,partner:null,msgs:[],draft:'',q:'',picking:false,busy:false};
const chatPeople=()=>S.users.filter(u=>u.active&&u.id!==S.ui.userId&&(S.perms[u.role]||[]).includes('chat'));
const chatInitials=n=>String(n||'?').replace(/\(.*\)/,'').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
const chatWho=u=>u?`${ROLES[u.role]||''}${u.deptId?' · '+(dept(u.deptId)?.short||u.deptId):''}`:'';
function chatTime(iso){const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}
async function chatLoad(){try{const r=await api('GET','/api/chat');CHAT.convs=r.conversations;S.chatUnread=r.unread}catch(e){CHAT.convs=CHAT.convs||[];onApiError(e)}}
async function chatOpen(uid){
  CHAT.partner=uid;CHAT.picking=false;CHAT.q='';CHAT.draft='';CHAT.msgs=[];
  try{const r=await api('GET',`/api/chat/with/${uid}`);CHAT.msgs=r.messages;S.chatUnread=r.unread;const c=(CHAT.convs||[]).find(x=>x.userId===uid);if(c)c.unread=0}catch(e){onApiError(e)}
  render();
}
function vChat(){
  if(CHAT.owner!==S.ui.userId)Object.assign(CHAT,{owner:S.ui.userId,convs:null,partner:null,msgs:[],draft:'',q:'',picking:false}); // another person signed in on this browser
  if(CHAT.convs===null){chatLoad().then(render);return `<div class="pagehead"><div><h1>${t('Messages')}</h1></div></div><div class="card"><div class="empty">Loading…</div></div>`}
  const p=CHAT.partner?user(CHAT.partner):null;
  return `<div class="pagehead"><div><h1>${t('Messages')}</h1><p>Write directly to a department, the Mayor, the Mayor's Office or an administrator. Only you and the other person can read a conversation.</p></div></div>
  <div class="card im ${p?'open':''}">
   <div class="im-side">
    <div class="im-tools"><input type="search" id="im_q" placeholder="${CHAT.picking?'Search people or departments…':'Search conversations…'}" value="${esc(CHAT.q)}" oninput="CHAT.q=this.value;$('#im_list').innerHTML=chatListHtml()" aria-label="Search">
     <button class="btn ${CHAT.picking?'':'pri'}" onclick="CHAT.picking=!CHAT.picking;CHAT.q='';render()">${CHAT.picking?'Back':ico('plus',15)+' New'}</button></div>
    <div class="im-list" id="im_list">${chatListHtml()}</div>
   </div>
   <div class="im-main">${p?`
    <div class="im-head"><button class="iconbtn im-back" onclick="CHAT.partner=null;render()" aria-label="Back to conversations">${ico('chevl')}</button><div class="avatar">${esc(chatInitials(p.name))}</div><div style="min-width:0"><b>${esc(p.name)}</b><div class="muted small">${esc(chatWho(p))}</div></div></div>
    <div class="im-log" id="im_log" aria-live="polite">${chatLogHtml()}</div>
    <form class="im-form" onsubmit="return chatSend(event)"><textarea id="im_text" rows="1" maxlength="2000" placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)" oninput="CHAT.draft=this.value" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}" aria-label="Message">${esc(CHAT.draft)}</textarea><button class="btn pri" aria-label="Send">${ico('send',16)} Send</button></form>`
    :`<div class="empty" style="margin:auto"><b>Choose a conversation</b><br>or press <b>New</b> to write to someone.</div>`}</div>
  </div>`;
}
function chatListHtml(){
  const q=CHAT.q.trim().toLowerCase();
  const item=(u,sub,time,unread)=>`<button class="im-item ${CHAT.partner===u.id?'on':''}" onclick="chatOpen('${u.id}')"><div class="avatar">${esc(chatInitials(u.name))}</div><div class="im-txt"><div class="im-row"><b>${esc(u.name)}</b>${time?`<span class="muted small">${time}</span>`:''}</div><div class="im-row"><span class="muted small im-snip">${sub}</span>${unread?`<span class="im-badge">${unread}</span>`:''}</div></div></button>`;
  if(CHAT.picking){
    const match=u=>!q||`${u.name} ${ROLES[u.role]} ${dept(u.deptId)?.name||''} ${dept(u.deptId)?.short||''}`.toLowerCase().includes(q);
    const ppl=chatPeople().filter(match);if(!ppl.length)return '<div class="empty">No one matches.</div>';
    const groups=[["Mayor's Office and administration",ppl.filter(u=>!u.deptId)],...S.depts.map(d=>[d.name,ppl.filter(u=>u.deptId===d.id)])].filter(g=>g[1].length);
    const order={mayor:0,mayor_admin:1,super_admin:2,dept_head:3,kpi_officer:4,auditor:5,staff:6};
    return groups.map(([g,us])=>`<div class="im-grp">${esc(g)}</div>${us.sort((a,b)=>(order[a.role]??9)-(order[b.role]??9)||a.name.localeCompare(b.name)).map(u=>item(u,esc(chatWho(u)),'',0)).join('')}`).join('');
  }
  const list=(CHAT.convs||[]).map(c=>({c,u:user(c.userId)})).filter(x=>x.u&&(!q||`${x.u.name} ${x.c.last.text}`.toLowerCase().includes(q)));
  if(!list.length)return `<div class="empty">${q?'Nothing matches.':'No conversations yet.<br>Press <b>New</b> to start one.'}</div>`;
  return list.map(({c,u})=>item(u,(c.last.from===S.ui.userId?'You: ':'')+esc(c.last.text.slice(0,70)),chatTime(c.last.at),c.unread)).join('');
}
function chatLogHtml(){
  if(!CHAT.msgs.length)return '<div class="empty" style="margin:auto">No messages yet. Say hello.</div>';
  let day='';
  return CHAT.msgs.map(m=>{const d=new Date(m.at).toDateString();const sep=d!==day?`<div class="im-day">${new Date(m.at).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</div>`:'';day=d;const mine=m.from===S.ui.userId;
    return `${sep}<div class="im-msg ${mine?'me':''}"><div class="im-bub">${esc(m.text).replace(/\n/g,'<br>')}</div><div class="im-meta">${new Date(m.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}${mine&&m.read?' · read':''}</div></div>`}).join('');
}
function chatScroll(){const l=$('#im_log');if(l)l.scrollTop=l.scrollHeight}
function chatAfterRender(){chatScroll();const tx=$('#im_text');if(tx&&window.innerWidth>900&&!$('#modal').classList.contains('open')&&document.activeElement!==$('#im_q'))tx.focus()}
async function chatSend(e){
  e.preventDefault();const tx=$('#im_text');const text=tx.value.trim();if(!text||CHAT.busy)return false;
  CHAT.busy=true;
  try{const r=await api('POST',`/api/chat/with/${CHAT.partner}`,{text});CHAT.msgs.push(r.message);CHAT.draft='';tx.value='';
    const c=(CHAT.convs||[]).find(x=>x.userId===CHAT.partner);if(c)c.last=r.message;else CHAT.convs.unshift({userId:CHAT.partner,last:r.message,unread:0});
    CHAT.convs.sort((a,b)=>b.last.at.localeCompare(a.last.at));
    $('#im_log').innerHTML=chatLogHtml();chatScroll();if(!CHAT.picking)$('#im_list').innerHTML=chatListHtml();tx.focus();
  }catch(err){onApiError(err)}finally{CHAT.busy=false}
  return false;
}
/* Checks for new messages every few seconds while the user is active. Only the
   message area and the menu counter are redrawn, so typing is never interrupted. */
function chatBadge(n){if(n===S.chatUnread)return;const more=n>(S.chatUnread||0);S.chatUnread=n;const sc=$('#sidescroll');if(sc){const top=sc.scrollTop;sc.innerHTML=sideNav();sc.scrollTop=top}if(more&&S.ui.view!=='chat')toast('You have a new message')}
async function chatPoll(){
  if(!S.ui||!S.ui.userId||!S.perms||!can('chat')||document.hidden||Date.now()-UI.lastAct>180000||CHAT.polling)return;
  CHAT.polling=true;
  try{
    if(S.ui.view==='chat'&&CHAT.convs!==null){
      if(CHAT.partner){const pid=CHAT.partner;const r=await api('GET',`/api/chat/with/${pid}`);
        if(pid===CHAT.partner&&(r.messages.length!==CHAT.msgs.length||r.messages.at(-1)?.id!==CHAT.msgs.at(-1)?.id||r.messages.filter(m=>m.read).length!==CHAT.msgs.filter(m=>m.read).length)){const l=$('#im_log');const atEnd=!l||l.scrollHeight-l.scrollTop-l.clientHeight<80;CHAT.msgs=r.messages;if(l){l.innerHTML=chatLogHtml();if(atEnd)chatScroll()}}}
      const r=await api('GET','/api/chat');CHAT.convs=r.conversations;if(!CHAT.picking&&$('#im_list')&&document.activeElement!==$('#im_q'))$('#im_list').innerHTML=chatListHtml();chatBadge(r.unread);
    }else{const r=await api('GET','/api/chat/unread');if(r.unread!==S.chatUnread)CHAT.convs=null;chatBadge(r.unread)}
  }catch(e){if(e.status===401)onApiError(e)}finally{CHAT.polling=false}
}
setInterval(chatPoll,6000);
