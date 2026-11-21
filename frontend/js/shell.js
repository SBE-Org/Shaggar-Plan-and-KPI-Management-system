/* =========================================================================
   shell.js — layout (sidebar, top bar), navigation, sign-in, data tables,
   command palette, dialogs and start-up.
   ========================================================================= */
/* ---------- navigation ---------- */
const NAV=[
 [null,[
  ['dashboard','Executive dashboard','grid',()=>can('dash')],
  ['assistant','AI assistant','sparkle',()=>can('ai')],
 ]],
 ['Performance',[
  ['scorecards','Scorecards','target',()=>can('dash')],
  ['kpis','KPIs & targets','flag',()=>can('dash')],
  ['submissions','Reporting & approvals','upload',()=>can('submit')||can('verify')||can('approve')||can('audit')],
  ['alerts','Alerts & actions','alert',()=>can('dash')],
  ['employees','Employees','users',()=>can('emp_eval')||can('all_depts')||(S.employees||[]).some(e=>e.userId===S.ui.userId)],
  ['reports','Reports','file',()=>can('reports')],
 ]],
 ['Communication',[
  ['chat','Messages','chat',()=>can('chat')],
  ['notifications','Notifications','bell',()=>!!me()],
 ]],
 ['System',[
  ['users','Users & access','key',()=>can('users')],
  {g:'settings',label:'Settings',icon:'sliders',items:[['settings','System settings','sliders',()=>can('config')],['workflows','Workflows','sliders',()=>can('config')],['security','Security','shield',()=>can('config')],['quality','Quality & testing','check',()=>can('config')]]},
  {g:'data',label:'Data & integrations',icon:'database',items:[['data','Backup & retention','database',()=>can('config')],['integrations','Integrations & API','plug',()=>can('config')]]},
  ['audit','Audit trail','list',()=>can('audit')],
 ]],
];
const navFlat=()=>NAV.flatMap(s=>s[1].flatMap(i=>Array.isArray(i)?[i]:i.items));
const allowedViews=()=>navFlat().filter(n=>n[3]()).map(n=>n[0]);
function go(v){UI.drawer=false;location.hash=v}
function navCount(v){
  if(v==='alerts')return alerts().filter(a=>['critical','serious'].includes(a.sev)).length;
  if(v==='submissions')return myQueue().length;
  if(v==='chat')return S.chatUnread||0;
  if(v==='kpis')return tpToApprove().length+tpReturned().length+kpiToApprove().length+kpiReturned().length;
  if(v==='employees')return sum((S.employees||[]).map(empTodo));
  return 0;
}
const VIEWS=()=>({dashboard:vDashboard,assistant:vAssistant,scorecards:vScorecards,kpis:vKpis,submissions:vSubmissions,alerts:vAlerts,employees:vEmployees,reports:vReports,notifications:vNotifications,chat:vChat,users:vUsers,security:vSecurity,workflows:vWorkflows,data:vData,integrations:vIntegrations,quality:vQuality,audit:vAudit,settings:vSettings});

/* ---------- render ---------- */
function render(){
  if(S.ui.theme==='dark')S.ui.theme='navy';document.documentElement.dataset.theme=S.ui.theme||'navy';
  applyBranding();
  const u=me();
  if(!u){$('#app').innerHTML=vLogin();enhance();return}
  if(S.ui.view==='targets')S.ui.view='kpis'; // the two pages are now one
  const views=allowedViews();
  if(!views.includes(S.ui.view))S.ui.view=views[0];
  const myN=S.notifs.filter(n=>n.to===u.id);const unread=myN.filter(n=>!n.read).length;
  const showPeriod=['dashboard','scorecards','alerts','reports','employees'].includes(S.ui.view);
  const initials=u.name.replace(/\(.*\)/,'').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  let body;try{body=VIEWS()[S.ui.view]()}catch(e){console.error(e);body=`<div class="card"><div class="empty">This page could not be displayed: ${esc(e.message)}</div></div>`}
  $('#app').innerHTML=`<div class="shell ${S.ui.collapsed&&window.innerWidth>900?'collapsed':''} ${UI.drawer?'drawer':''}">
  <div class="scrim" onclick="UI.drawer=false;render()"></div>
  <aside class="side" aria-label="Main navigation">
    <div class="side-top"><div class="emblem${B().logo?' haslogo':''}">${brandMark(24)}</div><div class="brandtxt"><b>${esc(t(B().orgName))}</b><span>${esc(B().systemName)}</span></div><button class="iconbtn colbtn" onclick="S.ui.collapsed=!S.ui.collapsed;commit()" aria-label="${S.ui.collapsed?'Expand':'Collapse'} sidebar" title="${S.ui.collapsed?'Expand':'Collapse'} sidebar">${ico(S.ui.collapsed?'chevr':'chevl',16)}</button></div>
    <div class="side-scroll" id="sidescroll" onscroll="sideFade()">${sideNav()}</div><div class="side-more" id="sidemore" aria-hidden="true">${ico('chevd',14)} more below</div>
    <div class="side-user">
      <button class="uc" onclick="toggleMenu('user',event)" aria-label="Account menu" title="${esc(u.name)}"><div class="avatar">${esc(initials)}</div><div class="who"><b>${esc(u.name)}</b><span>${ROLES[u.role]}${u.deptId?' · '+esc(dept(u.deptId)?.short||''):''}</span></div></button>
      <button class="iconbtn so" onclick="signOut()" aria-label="${t('Sign out')}" title="${t('Sign out')}">${ico('logout')}</button>
      ${UI.menu==='user'?`<div class="menu"><div style="padding:8px 10px 10px"><b>${esc(u.name)}</b><div class="small muted">${esc(u.username)} · FY ${esc(S.config.fy)} · ${MONTHS[S.config.currentMonth]} ${MONTH_YEAR(S.config.currentMonth)}</div></div><hr><button class="mi" onclick="profileModal()">${ico('user',16)} ${t('My profile')}</button><button class="mi" onclick="pwModal(false)">${ico('lock',16)} ${t('Change password')}</button><hr><button class="mi" onclick="signOut()">${ico('logout',16)} ${t('Sign out')}</button></div>`:''}
    </div>
  </aside>
  <div class="main">
    <header class="top">
      <button class="iconbtn mobile-only" onclick="UI.drawer=true;render()" aria-label="Open menu">${ico('menu')}</button>
      <button class="searchbtn" onclick="openPalette()" aria-label="Search">${ico('search',17)}<span class="lbl">${t('Search KPIs, departments, people…')}</span><kbd>Ctrl K</kbd></button>
      <div class="grow"></div>
      ${can('ai')?`<button class="iconbtn hide-sm" onclick="go('assistant')" aria-label="${t('AI assistant')}" title="${t('AI assistant')}">${ico('sparkle')}</button>`:''}
      ${can('config')?`<button class="iconbtn" onclick="go('settings')" aria-label="${t('Settings')}" title="${t('Settings')}">${ico('gear')}</button>`:''}
      <div style="position:relative"><button class="iconbtn" onclick="toggleMenu('lang',event)" aria-label="${t('Language')}" title="${t('Language')}">${ico('globe')}</button>
        ${UI.menu==='lang'?`<div class="menu">${Object.entries(LANGS).map(([k,v])=>`<button class="mi" onclick="setLang('${k}')">${lang()===k?'✓ ':'&nbsp;&nbsp;&nbsp;'}${v}</button>`).join('')}<hr><div class="small muted" style="padding:4px 10px 6px">Draft translations — pending review and approval</div></div>`:''}</div>
      <button class="iconbtn" onclick="S.ui.theme=S.ui.theme==='light'?'navy':'light';commit()" aria-label="${S.ui.theme==='light'?t('Dark mode'):t('Light mode')}" title="${S.ui.theme==='light'?t('Dark mode'):t('Light mode')}">${ico(S.ui.theme==='light'?'moon':'sun')}</button>
      <div style="position:relative"><button class="iconbtn" onclick="toggleMenu('bell',event)" aria-label="${t('Notifications')}${unread?`, ${unread} unread`:''}">${ico('bell')}${unread?`<span class="dot">${unread>9?'9+':unread}</span>`:''}</button>
        ${UI.menu==='bell'?`<div class="menu notifs"><div class="it" style="display:flex;justify-content:space-between;align-items:center"><b>${t('Notifications')}</b>${unread?`<a href="#" onclick="markRead();return false">${t('Mark all read')}</a>`:''}</div>${myN.length?myN.slice(0,15).map(n=>`<a href="#" class="it click ${n.read?'':'unread'}" onclick="return openNotif('${n.id}')" title="Open">${esc(n.text)}<div class="muted small">${dt(n.at)}</div></a>`).join('')+`<div class="it" style="text-align:center"><a href="#notifications" onclick="UI.menu=null">View all</a></div>`:`<div class="it muted">${t('No notifications')}</div>`}</div>`:''}</div>
    </header>
    ${showPeriod?`<div class="ctxbar">${periodPicker()}${can('dash')?`<label class="toggle" style="margin-left:auto" title="Include data that is submitted or verified but not yet approved by the Mayor's Office"><input type="checkbox" ${S.ui.provisional?'checked':''} onchange="S.ui.provisional=this.checked;commit()"> ${t('Include unapproved (provisional)')}</label>`:''}</div>`:''}
    <main class="content" id="content">${body}</main>
  </div></div>`;
  enhance();
  const sc=$('#sidescroll');if(sc){sc.scrollTop=UI.sideTop||0;sideFade()}
  if(S.ui.view==='chat')chatAfterRender();
  if(UI.forcePw&&!$('#modal').classList.contains('open'))pwModal(true);
}
/* shows a "more below" hint while part of the menu is out of view, and keeps the scroll position between redraws */
function sideFade(){const sc=$('#sidescroll'),m=$('#sidemore');if(!sc||!m)return;UI.sideTop=sc.scrollTop;m.classList.toggle('show',sc.scrollHeight-sc.scrollTop-sc.clientHeight>12)}
window.addEventListener('resize',()=>sideFade());
function commit(){save();render()}
function navLink([id,l,ic],sub){const c=navCount(id);if(id==='employees'&&!(can('emp_eval')||can('all_depts')))l='My performance';return `<a href="#${id}" class="${S.ui.view===id?'on':''}${sub?' subl':''}" title="${esc(t(l))}" ${S.ui.view===id?'aria-current="page"':''}>${sub&&!(S.ui.collapsed&&window.innerWidth>900)?'':ico(ic)}<span class="lbl">${t(l)}</span>${c?`<span class="cnt${id==='alerts'?' red':''}" aria-label="${c} pending">${c}</span>`:''}</a>`}
function sideNav(){
  const col=S.ui.collapsed&&window.innerWidth>900;S.ui.navOpen=S.ui.navOpen||{};
  return NAV.map(([sec,items])=>{
    const vis=items.map(i=>Array.isArray(i)?(i[3]()?i:null):({...i,items:i.items.filter(c=>c[3]())})).filter(i=>i&&(Array.isArray(i)||i.items.length));
    if(!vis.length)return '';
    return `${sec?`<div class="navgrp">${t(sec)}</div>`:''}<nav class="nav">${vis.map(i=>{
      if(Array.isArray(i))return navLink(i);
      if(col||i.items.length===1)return i.items.map(c=>navLink(c)).join('');
      const active=i.items.some(c=>c[0]===S.ui.view);const open=S.ui.navOpen[i.g]??active;
      const cnt=sum(i.items.map(c=>navCount(c[0])));
      return `<button class="navg${active?' has':''}" aria-expanded="${!!open}" onclick="S.ui.navOpen['${i.g}']=!${!!open};commit()">${ico(i.icon)}<span class="lbl">${t(i.label)}</span>${cnt&&!open?`<span class="cnt">${cnt}</span>`:''}<svg class="ico chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.chevr}</svg></button>${open?`<div class="navsub">${i.items.map(c=>navLink(c,true)).join('')}</div>`:''}`;
    }).join('')}</nav>`;
  }).join('');
}
function toggleMenu(m,e){if(e)e.stopPropagation();UI.menu=UI.menu===m?null:m;render()}
function markRead(){act('POST','/api/notifications/read-all',{},null)}
function periodPicker(){
  const p=S.ui.period;
  const opts=p.type==='M'?MONTHS.map((m,i)=>`<option value="${i}" ${i===p.v?'selected':''} ${i>=S.config.currentMonth?'disabled':''}>${m} ${MONTH_YEAR(i)}</option>`).join(''):p.type==='Q'?[0,1,2,3].map(q=>`<option value="${q}" ${q===p.v?'selected':''} ${q*3>=S.config.currentMonth?'disabled':''}>Q${q+1}</option>`).join(''):'';
  return `<div class="seg" role="group" aria-label="Reporting period">${[['M','Monthly'],['Q','Quarterly'],['Y','Annual (YTD)']].map(([k,l])=>`<button class="${p.type===k?'on':''}" onclick="setPeriodType('${k}')" aria-pressed="${p.type===k}">${t(l)}</button>`).join('')}</div>
  ${p.type!=='Y'?`<select aria-label="Period" onchange="S.ui.period.v=+this.value;commit()">${opts}</select>`:''}<span class="muted small">${esc(periodLabel())}</span>`;
}
function setPeriodType(k){const cm=S.config.currentMonth;S.ui.period={type:k,v:k==='M'?Math.max(0,cm-1):k==='Q'?Math.max(0,Math.floor((cm-1)/3)):0};commit()}
/* accessibility enhancement pass after every render */
function enhance(root=document){
  root.querySelectorAll('label.f').forEach(l=>{const c=l.nextElementSibling;if(c&&/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)){if(!c.id)c.id='fx'+(++UI.fid);l.htmlFor=c.id}});
  root.querySelectorAll('select:not([aria-label]),input:not([type=hidden]):not([aria-label]),textarea:not([aria-label])').forEach(c=>{
    if(c.id&&root.querySelector(`label[for="${c.id}"]`))return;if(c.closest('label'))return;
    const n=c.getAttribute('placeholder')||c.getAttribute('title')||(c.tagName==='SELECT'&&c.options[0]?c.options[0].text:'')||c.name||'Field';c.setAttribute('aria-label',n)});
  root.querySelectorAll('tr.click,.cell,[onclick]:not(button):not(a):not(input):not(select):not(label):not(#modal):not(#palette):not(.scrim)').forEach(el=>{if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');if(!el.getAttribute('role')&&el.tagName!=='TR')el.setAttribute('role','button')});
  if(UI.refocus){const el=document.getElementById(UI.refocus.id);if(el){el.focus();try{el.setSelectionRange(UI.refocus.pos,UI.refocus.pos)}catch(e){}}UI.refocus=null}
}


/* ---------- branding ---------- */
function applyBranding(){
  const b=B();document.title=`${b.shortName||b.systemName} — ${b.orgName}`;
  let link=document.querySelector('link[rel=icon]');if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}
  link.href=b.logo||'assets/favicon.svg';
}

/* ---------- authentication (server sessions; password + one-time code) ---------- */
const AUTH={step:'cred',challengeId:null,phone:'',channel:'email',sent:true,why:'',devCode:null,err:'',busy:false,un:''};
function vLogin(){
  const P=S.pub||{};const b=B();const demo=P.demo;
  const groups=demo?Object.keys(ROLES).map(r=>({r,us:demo.accounts.filter(u=>u.role===r)})).filter(g=>g.us.length):[];
  return `<div class="login">
  <section class="login-art">
    <div style="display:flex;align-items:center;gap:12px;position:relative;z-index:1"><div class="emblem" style="background:rgba(255,255,255,.12)">${brandMark(24)}</div><div><b style="color:#fff">${esc(t(b.orgName))}</b><div style="font-size:12.5px;color:#a9cbbf">${esc(t(b.office))}</div></div></div>
    <div style="position:relative;z-index:1;margin:48px 0"><h1>Every department’s commitments, measured in one place.</h1><p style="margin-top:14px">${esc(b.systemName)} — targets, evidence-based reporting, approvals, alerts and corrective actions, with every action on record.</p></div>
    <div class="facts"><div><b>${P.stats?.depts??'—'}</b><span>departments on scorecards</span></div><div><b>${P.stats?.kpis??'—'}</b><span>KPIs with targets for FY ${esc(P.fy||'')}</span></div><div><b>3-step</b><span>submit, verify, approve workflow</span></div></div>
    ${treeArt()}
  </section>
  <section class="login-form"><div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:26px"><h2 style="font-size:22px">${AUTH.step==='otp'?'Two-step verification':t('Sign in')}</h2>
      <select aria-label="${t('Language')}" onchange="setLang(this.value)">${Object.entries(LANGS).map(([k,v])=>`<option value="${k}" ${lang()===k?'selected':''}>${v}</option>`).join('')}</select></div>
    ${AUTH.err?`<div class="notice" role="alert" style="margin-bottom:14px;color:var(--crit-ink);background:color-mix(in srgb,var(--crit) 9%,var(--surface));border-color:color-mix(in srgb,var(--crit) 35%,var(--line))">${esc(AUTH.err)}</div>`:''}
    ${AUTH.step==='otp'?`
      <p class="ink2" style="margin:0 0 14px">${AUTH.sent?`We sent a 6-digit code ${AUTH.channel==='sms'?'by SMS':'by email'} to <b>${esc(AUTH.phone)}</b>. It expires in 5 minutes.${AUTH.channel==='email'?' Check the spam folder if you do not see it.':''}`:AUTH.devCode?'Enter the 6-digit code shown below to finish signing in.':`A 6-digit code is needed to finish signing in.${AUTH.why?' It could not be sent: '+esc(AUTH.why)+'.':''}`}</p>
      ${AUTH.devCode?`<div class="otpbox">${AUTH.sent?'<b>Demonstration mode:</b> the code is also shown here:':'Your code:'} <b class="mono" style="font-size:17px;letter-spacing:.08em">${esc(AUTH.devCode)}</b>${AUTH.sent?'':'<div class="small muted" style="margin-top:4px">Codes will be sent by email once email sending is set up.</div>'}</div>`:''}
      <form class="fg" onsubmit="return verifyOtp(event)"><div><label class="f">${t('Verification code')}</label><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required autofocus></div>
      <button class="btn pri" ${AUTH.busy?'disabled':''}>${t('Verify and sign in')}</button><button type="button" class="btn ghost" onclick="AUTH.step='cred';AUTH.err='';render()">${t('Back')}</button></form>`:`
      <form class="fg" onsubmit="return doLogin(event)" autocomplete="on">
        <div><label class="f">${t('Username')}</label><input name="username" id="lg_u" autocomplete="username" required value="${esc(AUTH.un)}"></div>
        <div><label class="f">${t('Password')}</label><input name="password" id="lg_p" type="password" autocomplete="current-password" required></div>
        <button class="btn pri" ${AUTH.busy?'disabled':''}>${AUTH.busy?'Checking…':t('Sign in')}</button>
      </form>
      ${P.security?`<p class="small muted" style="margin:12px 0 0">Accounts lock for ${P.security.lockMin} minutes after ${P.security.maxAttempts} failed attempts. Sessions end after ${P.security.sessionMin} minutes of inactivity.</p>`:''}
      ${demo?`<div class="demo"><div style="display:flex;justify-content:space-between;align-items:baseline"><h4>Demo accounts</h4><span class="small muted">Password for all: <b class="mono">${esc(demo.password)}</b></span></div>
        <div class="demo-list">${groups.map(g=>g.us.map(u=>`<button type="button" onclick="fillLogin('${esc(u.username)}')"><span><b>${esc(u.name)}</b><br><span class="small muted">${ROLES[g.r]}${u.dept?' · '+esc(u.dept):''}</span></span><span class="mono small muted">${esc(u.username)}</span></button>`).join('')).join('')}</div></div>`:''}`}
  </div></section></div>`;
}
function fillLogin(un){AUTH.un=un;$('#lg_u').value=un;$('#lg_p').value=S.pub?.demo?.password||'';$('#lg_p').focus()}
async function doLogin(e){
  e.preventDefault();if(AUTH.busy)return false;
  const f=new FormData(e.target);AUTH.un=String(f.get('username')||'').trim();const password=f.get('password');AUTH.busy=true;AUTH.err='';render();
  try{
    const r=await api('POST','/api/auth/login',{username:AUTH.un,password});
    AUTH.busy=false;
    if(r.mfa){Object.assign(AUTH,{step:'otp',challengeId:r.challengeId,phone:r.to||r.phone||'',channel:r.channel||'sms',sent:r.sent!==false,why:r.why||'',devCode:r.devCode||null});render();return false}
    await finishLogin(r);
  }catch(err){AUTH.busy=false;AUTH.err=err.message;render()}
  return false;
}
async function verifyOtp(e){
  e.preventDefault();const code=String(new FormData(e.target).get('code')||'').trim();AUTH.busy=true;render();
  try{const r=await api('POST','/api/auth/otp',{challengeId:AUTH.challengeId,code});AUTH.busy=false;await finishLogin(r)}
  catch(err){AUTH.busy=false;AUTH.err=err.message;if(/Sign in again/.test(err.message))AUTH.step='cred';render()}
  return false;
}
async function finishLogin(r){
  Object.assign(AUTH,{step:'cred',challengeId:null,devCode:null,err:'',un:''});UI.lastAct=Date.now();
  await reload();
  const views=allowedViews();if(!views.includes(S.ui.view))S.ui.view=views[0];location.hash=S.ui.view;
  if(r&&r.mustChange)UI.forcePw=true;
  render();
}
async function signOut(reason){
  try{await api('POST','/api/auth/logout',{})}catch(e){}
  S={ui:S.ui,pub:S.pub};S.ui.userId=null;UI.menu=null;UI.forcePw=false;if(typeof AI!=='undefined')AI.msgs=[];closeModal(true);
  AUTH.err=reason||'';await loadPublic();render();
}
function pwModal(forced){
  UI.menu=null;const P=(S.config&&S.config.security)||{pwMin:10,pwComplex:true};
  openModal(forced?'Set a new password':t('Change password'),`${forced?'<div class="info" style="margin-bottom:14px">Your password was set by an administrator. Choose a new password to continue.</div>':''}
  <form id="pwf" class="fg" style="grid-template-columns:1fr" onsubmit="return savePw(event)">
   <div><label class="f">Current ${forced?'(temporary) ':''}password</label><input type="password" name="cur" autocomplete="current-password" required></div>
   <div><label class="f">New password</label><input type="password" name="pw" autocomplete="new-password" required></div>
   <div><label class="f">Confirm new password</label><input type="password" name="pw2" autocomplete="new-password" required></div>
   <p class="small muted" style="margin:0">At least ${P.pwMin} characters${P.pwComplex?', with upper- and lower-case letters, a number and a symbol':''}.</p></form>`,
  `${forced?`<button class="btn" onclick="signOut()">${t('Sign out')}</button>`:`<button class="btn" onclick="closeModal()">${t('Cancel')}</button>`}<button class="btn pri" form="pwf">Change password</button>`);
}
async function savePw(e){
  e.preventDefault();const f=new FormData(e.target);
  if(f.get('pw')!==f.get('pw2')){toast('The new passwords do not match.');return false}
  try{await api('POST','/api/auth/password',{current:f.get('cur'),next:f.get('pw')});UI.forcePw=false;closeModal(true);await reload();toast('Password changed')}catch(err){toast(err.message)}
  return false;
}
function profileModal(){
  UI.menu=null;const u=me();
  openModal(t('My profile'),`<form id="prf" class="fg" onsubmit="return saveProfile(event)">
   <div><label class="f">Name</label><input value="${esc(u.name)}" disabled></div><div><label class="f">${t('Username')}</label><input value="${esc(u.username)}" disabled></div>
   <div><label class="f">Email (sign-in codes are sent here)</label><input type="email" name="email" required value="${esc(u.email||'')}"></div>
   <div><label class="f">Mobile phone</label><input type="tel" name="phone" value="${esc(u.phone||'')}"></div>
   <div><label class="f">${t('Language')}</label><select name="lang">${Object.entries(LANGS).map(([k,v])=>`<option value="${k}" ${lang()===k?'selected':''}>${v}</option>`).join('')}</select></div>
   <div class="full"><label class="toggle"><input type="checkbox" name="prefSms" ${u.prefSms!==false?'checked':''}> Send me SMS for events the administrator enables</label></div>
   <div class="full"><label class="toggle"><input type="checkbox" name="prefEmail" ${u.prefEmail!==false?'checked':''}> Send me email for events the administrator enables</label></div>
   <div class="full small muted">Role: ${ROLES[u.role]} · Last sign-in: ${dt(u.lastLogin)}</div></form>`,
   `<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="prf">${t('Save')}</button>`);
}
function saveProfile(e){e.preventDefault();const f=new FormData(e.target);S.ui.lang=f.get('lang');save();act('PUT','/api/profile',{phone:f.get('phone'),email:f.get('email'),prefSms:!!f.get('prefSms'),prefEmail:!!f.get('prefEmail'),lang:f.get('lang')},'Profile saved');return false}
['mousemove','keydown','click','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{UI.lastAct=Date.now()},{passive:true}));
setInterval(()=>{if(S.ui.userId&&S.config&&Date.now()-UI.lastAct>S.config.security.sessionMin*60000)signOut(`You were signed out after ${S.config.security.sessionMin} minutes of inactivity.`)},15000);

/* ---------- boot ---------- */
async function loadPublic(){try{S.pub=await api('GET','/api/public/branding')}catch(e){S.pub=S.pub||{}}}
async function boot(){
  document.documentElement.lang=lang();
  await loadPublic();
  const h=location.hash.slice(1);if(h)S.ui.view=h;
  try{const m=await api('GET','/api/auth/me');await reload();if(m.mustChange){UI.forcePw=true;render()}}
  catch(e){S.ui.userId=null;if(e.status===401&&/inactivity/.test(e.message))AUTH.err=e.message;render()}
}

/* ---------- data table (search, filter, sort, paginate, export) ---------- */
function dataTable(id,{cols,rows,search,filters=[],pageSize=10,exportName,onRow,empty='No records match.',toolbar=''}){
  const st=UI.tbl[id]||(UI.tbl[id]={q:'',page:0,sort:null,dir:1,f:{},size:pageSize});
  let rs=rows;
  if(st.q&&search){const q=st.q.toLowerCase();rs=rs.filter(r=>search(r).toLowerCase().includes(q))}
  filters.forEach(f=>{const v=st.f[f.key];if(v)rs=rs.filter(r=>String(f.get(r))===v)});
  if(st.sort!=null&&cols[st.sort]&&cols[st.sort].sort){const c=cols[st.sort];rs=rs.slice().sort((a,b)=>{const x=c.sort(a),y=c.sort(b);return ((x??'')>(y??'')?1:(x??'')<(y??'')?-1:0)*st.dir})}
  const total=rs.length,pages=Math.max(1,Math.ceil(total/st.size));if(st.page>=pages)st.page=pages-1;
  const view=rs.slice(st.page*st.size,(st.page+1)*st.size);
  UI.tblRows[id]=rs;UI.tblCfg[id]={cols,exportName};
  return `<div class="dt-bar">
    ${search?`<div class="search">${ico('search',16)}<input type="search" id="q_${id}" placeholder="${t('Search')}…" aria-label="${t('Search')}" value="${esc(st.q)}" oninput="tblSearch('${id}',this)"></div>`:''}
    ${filters.map(f=>`<select aria-label="${esc(f.label)}" onchange="UI.tbl['${id}'].f['${f.key}']=this.value;UI.tbl['${id}'].page=0;render()"><option value="">${esc(f.label)}: all</option>${f.opts.map(([v,l])=>`<option value="${esc(v)}" ${st.f[f.key]===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`).join('')}
    ${toolbar}
    <span class="muted small" style="margin-left:auto">${total} record${total===1?'':'s'}</span>
    ${exportName&&can('export')?`<button class="btn sm" onclick="tblExport('${id}')">${ico('download',15)} ${t('Export CSV')}</button>`:''}
  </div>
  <div class="tblwrap"><table class="tbl"><thead><tr>${cols.map((c,i)=>`<th class="${c.cls||''} ${c.sort?'sortable':''}" ${c.sort?`onclick="tblSort('${id}',${i})" aria-sort="${st.sort===i?(st.dir>0?'ascending':'descending'):'none'}"`:''} ${c.w?`style="width:${c.w}"`:''}>${esc(c.h)}${st.sort===i?(st.dir>0?' ↑':' ↓'):''}</th>`).join('')}</tr></thead><tbody>
  ${view.length?view.map(r=>`<tr ${onRow?`class="click" onclick="${onRow(r)}"`:''}>${cols.map(c=>`<td class="${c.cls||''}">${c.td(r)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" class="empty">${esc(empty)}</td></tr>`}
  </tbody></table></div>
  ${total>Math.min(...[10,st.size])||pages>1?`<div class="dt-foot"><span>${total?st.page*st.size+1:0}–${Math.min(total,(st.page+1)*st.size)} of ${total}</span>
    <div class="pg"><select aria-label="Rows per page" onchange="UI.tbl['${id}'].size=+this.value;UI.tbl['${id}'].page=0;render()">${[10,25,50,100].map(n=>`<option ${st.size===n?'selected':''}>${n}</option>`).join('')}</select>
    <button class="btn sm" ${st.page===0?'disabled':''} onclick="UI.tbl['${id}'].page--;render()" aria-label="${t('Previous')}">${ico('chevl',15)}</button><span>Page ${st.page+1} of ${pages}</span><button class="btn sm" ${st.page>=pages-1?'disabled':''} onclick="UI.tbl['${id}'].page++;render()" aria-label="${t('Next')}">${ico('chevr',15)}</button></div></div>`:''}`;
}
function tblSearch(id,el){clearTimeout(UI._qt);const v=el.value,pos=el.selectionStart;UI._qt=setTimeout(()=>{UI.tbl[id].q=v;UI.tbl[id].page=0;UI.refocus={id:'q_'+id,pos};render()},220)}
function tblSort(id,i){const st=UI.tbl[id];if(st.sort===i)st.dir*=-1;else{st.sort=i;st.dir=1}render()}
async function tblExport(id){
  if(!can('export')){toast('Your role is not allowed to export records.');return}
  const {cols,exportName}=UI.tblCfg[id];const rs=UI.tblRows[id]||[];const cs=cols.filter(c=>c.csv);
  try{await api('POST','/api/exports',{name:exportName,rows:rs.length})}catch(e){onApiError(e);return}
  const csv=[cs.map(c=>csvCell(c.h)).join(','),...rs.map(r=>cs.map(c=>csvCell(c.csv(r))).join(','))].join('\r\n');
  downloadFile(`${exportName}-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+csv,'CSV export','text/csv');
}

/* ---------- command palette ---------- */
const PAL={q:'',sel:0,items:[]};
function openPalette(){PAL.q='';PAL.sel=0;$('#palette').innerHTML=`<div class="pal" role="dialog" aria-label="Search"><input id="palq" placeholder="${t('Search KPIs, departments, people…')}" aria-label="${t('Search')}" oninput="PAL.q=this.value;PAL.sel=0;palRender()" onkeydown="palKey(event)"><div class="res" id="palres"></div></div>`;$('#palette').classList.add('open');palRender();setTimeout(()=>$('#palq').focus(),10)}
function closePalette(){$('#palette').classList.remove('open');$('#palette').innerHTML=''}
function palItems(){
  const q=PAL.q.toLowerCase().trim();const out=[];const m=s=>!q||s.toLowerCase().includes(q);
  navFlat().filter(n=>n[3]()&&m(t(n[1])+' '+n[1])).forEach(n=>out.push({g:'Pages',l:t(n[1]),ic:n[2],act:`go('${n[0]}')`}));
  if(can('dash')){
    scopedDepts().filter(d=>m(d.name+' '+d.short)).forEach(d=>out.push({g:'Departments',l:d.name,ic:'target',sub:pct(deptCalc(d.id,periodMonths()).score),act:`S.ui.dept='${d.id}';go('scorecards')`}));
    S.kpis.filter(k=>inScope(k.deptId)&&m(k.code+' '+k.name)).forEach(k=>out.push({g:'KPIs',l:`${k.code} ${k.name}`,ic:'book',sub:dept(k.deptId).short,act:`kpiDetail('${k.id}')`}));
    S.caps.filter(c=>inScope(c.deptId)&&m(c.ref+' '+c.title)).forEach(c=>out.push({g:'Action plans',l:`${c.ref} ${c.title}`,ic:'alert',act:`capDetail('${c.id}')`}));
  }
  if(can('users'))S.users.filter(u=>m(u.name+' '+u.username)).forEach(u=>out.push({g:'People',l:u.name,ic:'user',sub:ROLES[u.role],act:`userForm('${u.id}')`}));
  return out.slice(0,q?40:14);
}
function palRender(){PAL.items=palItems();let g='';$('#palres').innerHTML=PAL.items.length?PAL.items.map((it,i)=>{const h=it.g!==g?`<div class="g">${esc(it.g)}</div>`:'';g=it.g;return h+`<div class="r ${i===PAL.sel?'sel':''}" onclick="palGo(${i})">${ico(it.ic,16)}<span>${esc(it.l)}</span>${it.sub?`<small>${esc(it.sub)}</small>`:''}</div>`}).join(''):'<div class="empty">No matches. Try a KPI code, a request reference or a name.</div>'}
function palKey(e){if(e.key==='ArrowDown'){PAL.sel=Math.min(PAL.items.length-1,PAL.sel+1);palRender();e.preventDefault()}else if(e.key==='ArrowUp'){PAL.sel=Math.max(0,PAL.sel-1);palRender();e.preventDefault()}else if(e.key==='Enter'){palGo(PAL.sel)}else if(e.key==='Escape')closePalette()}
function palGo(i){const it=PAL.items[i];if(!it)return;closePalette();new Function(it.act)()}


/* ---------- modal, tooltip, keyboard ---------- */
function openModal(title,body,footer,wide){const m=$('#modal');UI._lastFocus=document.activeElement;m.innerHTML=`<div class="dlg ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="dlgt"><header><h2 id="dlgt">${esc(title)}</h2><button class="x" onclick="closeModal()" aria-label="${t('Close')}">×</button></header><div class="bd">${body}</div>${footer?`<footer>${footer}</footer>`:''}</div>`;m.classList.add('open');m.scrollTop=0;enhance(m);setTimeout(()=>{const f=m.querySelector('input:not([disabled]):not([type=checkbox]),select,textarea,button.pri');if(f)f.focus()},20)}
function closeModal(force){if(UI.forcePw&&me()&&!force)return;const m=$('#modal');m.classList.remove('open');m.innerHTML='';if(UI._lastFocus&&UI._lastFocus.focus)try{UI._lastFocus.focus()}catch(e){}}
function copyText(txt,msg){try{navigator.clipboard.writeText(txt).then(()=>toast(msg),()=>showCopy(txt))}catch(e){showCopy(txt)}}
function showCopy(txt){openModal('Copy the content',`<p class="small muted">Select all and copy:</p><textarea style="min-height:300px" onfocus="this.select()">${esc(txt)}</textarea>`,`<button class="btn pri" onclick="closeModal()">Done</button>`,true)}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&me()){e.preventDefault();openPalette();return}
  if(e.key==='Escape'){if($('#palette').classList.contains('open'))closePalette();else closeModal();if(UI.menu){UI.menu=null;render()}}
  if(e.key==='Enter'&&e.target&&e.target.matches&&e.target.matches('tr.click,[role=button][tabindex]')){e.preventDefault();e.target.click()}
});
document.addEventListener('mousemove',e=>{const tp=$('#tip');const el=e.target.closest&&e.target.closest('[data-tip]');if(!el){tp.style.display='none';return}tp.textContent=el.getAttribute('data-tip');tp.style.display='block';const w=tp.offsetWidth;tp.style.left=Math.min(window.innerWidth-w-8,e.clientX+14)+'px';tp.style.top=(e.clientY+14)+'px'});
document.addEventListener('click',e=>{if(UI.menu&&!e.target.closest('.menu')&&!e.target.closest('.iconbtn')&&!e.target.closest('.uc')){UI.menu=null;render()}});
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(h&&S.ui&&h!==S.ui.view){S.ui.view=h;UI.drawer=false;closeModal();commit();window.scrollTo(0,0)}});

