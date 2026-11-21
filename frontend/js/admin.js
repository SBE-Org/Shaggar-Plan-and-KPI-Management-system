/* =========================================================================
   admin.js — users & permissions, audit trail, settings (incl. name & logo),
   workflows, security, backups & retention, integrations/API, quality.
   ========================================================================= */
/* ---------- users & access ---------- */
function vUsers(){
  const tab=UI.tab.users||'users';
  return `<div class="pagehead"><div><h1>${t('Users & access control')}</h1><p>Each role has a set of permissions; department roles see only their own department. Passwords are stored as salted PBKDF2 hashes, and privileged roles sign in with a one-time code.</p></div>${tab==='users'?`<button class="btn pri" onclick="userForm()">${ico('plus',16)} Add user</button>`:''}</div>
  <div class="tabs">${[['users','Users'],['roles','Roles & permission matrix']].map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.users='${k}';render()">${l}</button>`).join('')}</div>
  ${tab==='users'?`<div class="card">${dataTable('users',{rows:S.users,exportName:'users',search:u=>[u.name,u.username,ROLES[u.role],u.title,dept(u.deptId)?.short||''].join(' '),
    filters:[{key:'role',label:'Role',opts:Object.entries(ROLES),get:u=>u.role},{key:'st',label:t('Status'),opts:[['active','Active'],['disabled','Disabled'],['locked','Locked']],get:u=>userState(u)}],
    onRow:u=>`userForm('${u.id}')`,
    cols:[
     {h:'Name',td:u=>`<b>${esc(u.name)}</b><div class="muted small mono">${esc(u.username)}</div>`,csv:u=>u.name,sort:u=>u.name},
     {h:'Role',td:u=>ROLES[u.role],csv:u=>ROLES[u.role],sort:u=>u.role},
     {h:'Scope',td:u=>u.deptId?esc(dept(u.deptId)?.short):scope(u).length===S.depts.length?'<span class="pill">City-wide</span>':'—',csv:u=>u.deptId?dept(u.deptId)?.short:'City-wide'},
     {h:'Two-step',td:u=>S.config.security.mfaRoles.includes(u.role)?'<span class="chip c-good"><i>✓</i>Required</span>':'<span class="muted small">Not required</span>',csv:u=>S.config.security.mfaRoles.includes(u.role)?'Required':'No'},
     {h:t('Status'),td:u=>{const s=userState(u);return s==='active'?'<span class="chip c-good"><i>✓</i>Active</span>':s==='locked'?'<span class="chip c-critical"><i>🔒</i>Locked</span>':'<span class="chip c-none"><i>■</i>Disabled</span>'},csv:u=>userState(u)},
     {h:'Last sign-in',td:u=>`<span class="small">${dt(u.lastLogin)}</span>`,csv:u=>u.lastLogin||'',sort:u=>u.lastLogin||''},
     {h:'',td:u=>`<div style="display:flex;gap:6px;justify-content:flex-end">${userState(u)==='locked'?`<button class="btn sm" onclick="event.stopPropagation();unlockUser('${u.id}')">Unlock</button>`:''}<button class="btn sm" onclick="event.stopPropagation();resetPw('${u.id}')">Reset password</button></div>`},
    ]})}</div>`:
  `<div class="card"><div class="tblwrap"><table class="tbl perm"><thead><tr><th>Permission</th>${Object.keys(ROLES).map(r=>`<th title="${esc(ROLE_DESC[r])}" style="white-space:normal;min-width:92px;text-align:center">${ROLES[r]}</th>`).join('')}</tr></thead><tbody>
   ${PERMS.map(([p,l])=>`<tr><td>${esc(l)}</td>${Object.keys(ROLES).map(r=>{const locked=r==='super_admin'&&['users','config','audit'].includes(p);return `<td><input type="checkbox" aria-label="${esc(ROLES[r]+': '+l)}" ${S.perms[r].includes(p)?'checked':''} ${locked?'disabled title="Locked to prevent lock-out"':''} onchange="togglePerm('${r}','${p}',this.checked)"></td>`}).join('')}</tr>`).join('')}
  </tbody></table></div><p class="small muted" style="margin:12px 0 0">Department Head, Department Staff and department-assigned KPI Officers are limited to their own department. A KPI Officer without a department (central M&E) reports for all departments. The Auditor / Reviewer role is read-only.</p></div>
  <div class="grid g2" style="margin-top:16px">${Object.keys(ROLES).map(r=>`<div class="card"><h3>${ROLES[r]}</h3><p class="small ink2" style="margin:4px 0 0">${esc(ROLE_DESC[r])}</p></div>`).join('')}</div>`}`;
}
const userState=u=>!u.active?'disabled':u.lockedUntil&&new Date(u.lockedUntil)>new Date()?'locked':'active';
function togglePerm(role,permission,granted){act('PUT','/api/permissions',{role,permission,granted},'Permission updated')}
function unlockUser(id){act('POST',`/api/users/${id}/unlock`,{},`${uname(id)} unlocked`)}
async function resetPw(id){const r=await act('POST',`/api/users/${id}/reset-password`,{},null);if(!r)return;
  openModal('Temporary password',`<p>Give this temporary password to <b>${esc(uname(id))}</b> through a secure channel. It is shown only once, and they must change it at their next sign-in.</p><p class="mono" style="font-size:18px;padding:12px;background:var(--surface-2);border-radius:10px;text-align:center">${esc(r.tempPassword)}</p>`,`<button class="btn pri" onclick="closeModal()">Done</button>`)}
function userForm(id){
  const u=id?user(id):{name:'',username:'',role:'staff',deptId:'',title:'',active:true,phone:'',email:''};
  openModal(id?'Edit user':'Add user',`<form id="uf" class="fg" onsubmit="return saveUser(event,'${id||''}')">
   <div class="full"><label class="f">Full name</label><input name="name" required value="${esc(u.name)}"></div>
   <div><label class="f">${t('Username')}</label><input name="username" required value="${esc(u.username)}" ${id?'readonly':''} autocomplete="off"></div>
   <div><label class="f">Role</label><select name="role">${Object.keys(ROLES).map(r=>`<option value="${r}" ${r===u.role?'selected':''}>${ROLES[r]}</option>`).join('')}</select></div>
   <div><label class="f">Department (scope)</label><select name="deptId"><option value="">— None / city-wide —</option>${S.depts.map(d=>`<option value="${d.id}" ${d.id===u.deptId?'selected':''}>${esc(d.short)}</option>`).join('')}</select></div>
   <div><label class="f">Job title</label><input name="title" value="${esc(u.title||'')}"></div>
   <div><label class="f">Email (sign-in codes are sent here)</label><input type="email" name="email" required value="${esc(u.email||'')}" placeholder="name@example.com"></div>
   <div><label class="f">Mobile phone</label><input type="tel" name="phone" value="${esc(u.phone||'')}"></div>
   <div><label class="f">Account status</label><select name="active"><option value="1" ${u.active?'selected':''}>Active</option><option value="0" ${!u.active?'selected':''}>Disabled</option></select></div>
   ${id?'':'<div class="full small muted">A temporary password is generated when you save. The user must change it at first sign-in.</div>'}</form>`,
   `<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="uf">${t('Save')}</button>`);
}
async function saveUser(e,id){
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  const body={name:f.name,username:f.username,role:f.role,deptId:f.deptId||null,title:f.title,phone:f.phone,email:f.email,active:f.active==='1'};
  const r=await act(id?'PUT':'POST',id?`/api/users/${id}`:'/api/users',body,id?'User saved':null);
  if(r&&!id)openModal('User created',`<p><b>${esc(body.name)}</b> can sign in as <b class="mono">${esc(r.username)}</b> with this temporary password (shown once):</p><p class="mono" style="font-size:18px;padding:12px;background:var(--surface-2);border-radius:10px;text-align:center">${esc(r.tempPassword)}</p>`,`<button class="btn pri" onclick="closeModal()">Done</button>`);
  return false;
}
/* ---------- audit trail ---------- */
/* Audit trail is paged, filtered and exported on the server. */
const AQ={q:'',cat:'',user:'',entity:'',from:'',to:'',page:0,size:25,data:null,busy:false,key:''};
async function loadAudit(){const p=new URLSearchParams(Object.entries({q:AQ.q,cat:AQ.cat,user:AQ.user,entity:AQ.entity,from:AQ.from,to:AQ.to,page:AQ.page,size:AQ.size}).filter(([,v])=>v!==''&&v!=null));const key=p.toString();if(AQ.busy||AQ.key===key&&AQ.data)return;AQ.busy=true;try{AQ.data=await api('GET','/api/audit?'+key);AQ.key=key}catch(e){onApiError(e)}AQ.busy=false;if(S.ui.view==='audit')render()}
function auditSet(k,v){AQ[k]=v;if(k!=='page')AQ.page=0;AQ.key='';loadAudit()}
function auditSearch(el){clearTimeout(AQ._t);const v=el.value,pos=el.selectionStart;AQ._t=setTimeout(()=>{UI.refocus={id:'aq',pos};auditSet('q',v)},300)}
function vAudit(){
  if(!AQ.data||AQ.key==='')setTimeout(loadAudit,0);
  const d=AQ.data||{rows:[],total:0,counts:{},entities:[]};const pages=Math.max(1,Math.ceil(d.total/AQ.size));
  const qs=new URLSearchParams(Object.entries({q:AQ.q,cat:AQ.cat,user:AQ.user,entity:AQ.entity,from:AQ.from,to:AQ.to}).filter(([,v])=>v)).toString();
  return `<div class="pagehead"><div><h1>${t('Audit trail')}</h1><p>Every sign-in, record creation, update, approval, assignment and status change: who did it, when, and what changed. Entries are append-only and kept for ${S.config.retention.auditYears} years.</p></div></div>
  <div class="tiles">${['Authentication','Approval','Assignment','Status change'].map(c=>`<div class="tile"><div class="lbl">${c}</div><div class="val">${d.counts[c]||0}</div></div>`).join('')}</div>
  <div class="card"><div class="dt-bar">
    <div class="search">${ico('search',16)}<input type="search" id="aq" placeholder="${t('Search')}…" aria-label="Search the audit trail" value="${esc(AQ.q)}" oninput="auditSearch(this)"></div>
    <select aria-label="Category" onchange="auditSet('cat',this.value)"><option value="">Category: all</option>${AUDIT_CATEGORIES.map(c=>`<option ${AQ.cat===c?'selected':''}>${c}</option>`).join('')}</select>
    <select aria-label="User" onchange="auditSet('user',this.value)"><option value="">User: all</option><option value="system" ${AQ.user==='system'?'selected':''}>System (automated)</option>${S.users.map(u=>`<option value="${u.id}" ${AQ.user===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select>
    <select aria-label="Record type" onchange="auditSet('entity',this.value)"><option value="">Record type: all</option>${d.entities.map(e=>`<option ${AQ.entity===e?'selected':''}>${esc(e)}</option>`).join('')}</select>
    <input type="date" aria-label="From date" value="${esc(AQ.from)}" onchange="auditSet('from',this.value)"><input type="date" aria-label="To date" value="${esc(AQ.to)}" onchange="auditSet('to',this.value)">
    <span class="muted small" style="margin-left:auto">${d.total} entries</span>
    ${can('export')?`<button class="btn sm" onclick="downloadUrl('/api/audit/export?${qs}','audit-trail.csv')">${ico('download',15)} ${t('Export CSV')}</button>`:''}
  </div>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th><th>Change</th></tr></thead><tbody>
  ${d.rows.length?d.rows.map(a=>{const df=diffKeys(a.before,a.after);return `<tr><td><span class="small" style="white-space:nowrap">${dt(a.at)}</span></td><td><b>${esc(sysName(a.user_id))}</b><div class="muted small">${a.user_id?ROLES[a.role]||'':''}</div></td><td>${esc(a.action)}<div><span class="pill">${esc(a.category)}</span></div></td><td><span class="small">${esc(a.entity)}</span><div class="mono muted">${esc(a.entity_id||'')}</div></td><td><span class="small" style="display:block;max-width:360px">${esc(a.details)}</span></td><td>${!a.before&&!a.after?'<span class="muted small">—</span>':`<div class="diff">${df.length?df.slice(0,5).map(c=>`<div><b>${esc(c.k)}</b>: <del>${esc(fmtVal(c.from))}</del> → <ins>${esc(fmtVal(c.to))}</ins></div>`).join('')+(df.length>5?`<div class="muted">+${df.length-5} more</div>`:''):'<span class="muted">no field changes</span>'}</div>`}</td></tr>`}).join(''):`<tr><td colspan="6" class="empty">${AQ.data?'No entries match these filters.':'Loading…'}</td></tr>`}
  </tbody></table></div>
  <div class="dt-foot"><span>${d.total?AQ.page*AQ.size+1:0}–${Math.min(d.total,(AQ.page+1)*AQ.size)} of ${d.total}</span><div class="pg"><select aria-label="Rows per page" onchange="AQ.size=+this.value;auditSet('page',0)">${[25,50,100,200].map(n=>`<option ${AQ.size===n?'selected':''}>${n}</option>`).join('')}</select><button class="btn sm" ${AQ.page===0?'disabled':''} onclick="auditSet('page',AQ.page-1)" aria-label="${t('Previous')}">${ico('chevl',15)}</button><span>Page ${AQ.page+1} of ${pages}</span><button class="btn sm" ${AQ.page>=pages-1?'disabled':''} onclick="auditSet('page',AQ.page+1)" aria-label="${t('Next')}">${ico('chevr',15)}</button></div></div></div>`;
}
function diffKeys(a,b){a=a||{};b=b||{};return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({k,from:a[k],to:b[k]}))}
const fmtVal=v=>v==null?'∅':typeof v==='object'?JSON.stringify(v):String(v);
/* ---------- system settings ---------- */
function vSettings(){
  const c=S.config,tab=UI.tab.set||'general',b=c.branding;
  const tabs=`<div class="tabs">${[['general','Scoring & calendar'],['branding','Name & logo'],['departments','Departments']].map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.set='${k}';render()">${l}</button>`).join('')}</div>`;
  let body='';
  if(tab==='general')body=`<div class="card" style="max-width:860px"><h2 style="margin-bottom:14px">Scoring and alert thresholds</h2><form id="cfg" class="fg" onsubmit="return saveCfg(event)">
   <div><label class="f">On track from (%)</label><input type="number" name="good" value="${c.bands.good}"></div>
   <div><label class="f">Alert below (%)</label><input type="number" name="warning" value="${c.bands.warning}"></div>
   <div><label class="f">Critical below (%)</label><input type="number" name="serious" value="${c.bands.serious}"></div>
   <div><label class="f">Achievement cap for scoring (%)</label><input type="number" name="cap" value="${c.cap}"></div>
   <div><label class="f">Variance explanation required below (%)</label><input type="number" name="varianceNote" value="${c.varianceNote}"></div>
   <div><label class="f">Report deadline (day of next month)</label><input type="number" name="deadlineDay" min="1" max="28" value="${c.deadlineDay}"></div>
   <div><label class="f">Current reporting month</label><select name="currentMonth">${MONTHS.map((m,i)=>`<option value="${i}" ${i===c.currentMonth?'selected':''}>${m} ${MONTH_YEAR(i)}</option>`).join('')}</select></div>
   <div><label class="f">Fiscal year label</label><input name="fy" value="${esc(c.fy)}"></div>
   <div><label class="f">Ethiopian calendar label</label><input name="fyNote" value="${esc(c.fyNote||'')}"></div>
   <div><label class="f">Fiscal year starts (July of year)</label><input type="number" name="fyStart" value="${c.fyStart}"></div>
   <div class="full"><button class="btn pri">Save settings</button></div></form></div>`;
  if(tab==='branding')body=`<div class="grid g2"><div class="card"><h2 style="margin-bottom:4px">Organisation name and logo</h2><p class="small ink2" style="margin:0 0 14px">Used on the sign-in page, the sidebar, the browser tab, reports and the API documentation. Changes apply to everyone immediately.</p>
   <form id="brf" class="fg" onsubmit="return saveBranding(event)">
    <div class="full"><label class="f">Organisation name</label><input name="orgName" required value="${esc(b.orgName)}"></div>
    <div class="full"><label class="f">Office</label><input name="office" value="${esc(b.office)}"></div>
    <div class="full"><label class="f">System name</label><input name="systemName" required value="${esc(b.systemName)}"></div>
    <div><label class="f">Short name (browser tab, SMS)</label><input name="shortName" maxlength="24" value="${esc(b.shortName)}"></div>
    <div><label class="f">Logo (PNG, JPG, WEBP or SVG, under 500 KB)</label><input type="file" id="br_logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="previewLogo(this)"></div>
    <div class="full" style="display:flex;gap:8px"><button class="btn pri">Save name and logo</button>${b.logo?`<button type="button" class="btn" onclick="UI.logoDraft=null;saveBranding(null,true)">Use the default emblem</button>`:''}</div></form></div>
   <div class="card"><h2 style="margin-bottom:14px">Preview</h2><div id="br_prev">${brandPreview(UI.logoDraft||b.logo,b)}</div><p class="small muted" style="margin:12px 0 0">Square logos look best. SVG files are checked and rejected if they contain scripts.</p></div></div>`;
  if(tab==='departments')body=`<div class="card" style="max-width:900px"><div class="cardhead"><h2>Departments</h2><button class="btn sm pri" onclick="deptForm()">${ico('plus',15)} Add department</button></div>
   <table class="tbl"><thead><tr><th>Code</th><th>Department</th><th>Head</th><th></th></tr></thead><tbody>${S.depts.map(d=>`<tr><td class="mono">${d.id}</td><td>${esc(d.name)}</td><td>${d.headId?`${esc(uname(d.headId))}<div class="muted small mono">${esc(user(d.headId)?.username||'')}</div>`:'<span class="chip c-warning"><i>!</i>No head assigned</span>'}</td><td class="right"><button class="btn sm" onclick="deptForm('${d.id}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="pagehead"><div><h1>${t('System settings')}</h1><p>Scoring thresholds, the reporting calendar, the organisation’s name and logo, and departments.</p></div></div>${tabs}${body}`;
}
function brandPreview(logo,b){const img=logo?`<img src="${esc(logo)}" alt="" style="width:52px;height:52px;object-fit:contain;border-radius:12px">`:`<div class="emblem" style="width:52px;height:52px">${emblem(30)}</div>`;
  return `<div style="display:flex;gap:14px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--side-bg)">${img}<div><b style="font-size:15px">${esc(b.orgName)}</b><div class="small muted">${esc(b.systemName)}</div></div></div>`}
async function previewLogo(inp){const f=inp.files[0];if(!f)return;if(f.size>500*1024){toast('The logo must be smaller than 500 KB.');inp.value='';return}UI.logoDraft=await fileToDataUrl(f);$('#br_prev').innerHTML=brandPreview(UI.logoDraft,S.config.branding)}
function saveBranding(e,resetLogo){if(e)e.preventDefault();const f=e?Object.fromEntries(new FormData(e.target).entries()):{};
  const body={...(e?{orgName:f.orgName,office:f.office,systemName:f.systemName,shortName:f.shortName}:{})};
  if(resetLogo)body.logo=null;else if(UI.logoDraft)body.logo=UI.logoDraft;
  act('PUT','/api/settings/branding',body,'Name and logo saved').then(r=>{if(r)UI.logoDraft=null});return false}
function saveCfg(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  act('PUT','/api/settings/scoring',{bands:{good:+f.good,warning:+f.warning,serious:+f.serious},cap:+f.cap,varianceNote:+f.varianceNote,deadlineDay:+f.deadlineDay,currentMonth:+f.currentMonth,fy:f.fy,fyNote:f.fyNote,fyStart:+f.fyStart},'Settings saved');return false}
/* Department form: the code follows the short name, the head's name is typed
   in, and saving creates the head's sign-in account. */
function deptForm(id){const d=id?dept(id):{id:'',name:'',short:'',headId:''};const h=d.headId?user(d.headId):null;
  openModal(id?'Edit department':'Add department',`<form id="df" class="fg" onsubmit="return saveDept(event,'${id||''}')">
   <div><label class="f">Short name</label><input name="short" required value="${esc(d.short)}" placeholder="e.g. Water" ${id?'':'oninput="deptAuto(this.form)"'}></div>
   <div><label class="f">Code ${id?'':'<span class="muted">(filled in automatically)</span>'}</label><input name="id" value="${esc(d.id)}" ${id?'disabled':'oninput="this.dataset.touched=1;this.value=this.value.toUpperCase()"'} placeholder="e.g. WATER" maxlength="12"></div>
   <div class="full"><label class="f">Full name</label><input name="name" required value="${esc(d.name)}" placeholder="e.g. Water & Sewerage Office"></div>
   <div class="full"><h4 style="margin:6px 0 0">Department head</h4></div>
   <div class="full"><label class="f">Full name of the department head</label><input name="headName" value="${esc(h?h.name:'')}" placeholder="Type the name" ${id&&h?'':'oninput="deptAuto(this.form)"'}></div>
   ${h?`<div class="full small muted">Current account: <span class="mono">${esc(h.username)}</span>. Changing the name above corrects the spelling for the same person.</div>
   <div class="full"><label class="toggle"><input type="checkbox" name="replaceHead" onchange="$('#df_acct').style.display=this.checked?'':'none';if(this.checked){this.form.headName.value='';this.form.headName.oninput=()=>deptAuto(this.form);this.form.headName.focus()}"> A new person is taking over (create a new account and switch off the current one)</label></div>`:''}
   <div class="full fg" id="df_acct" ${h?'style="display:none"':''}>
    <div><label class="f">${t('Username')} <span class="muted">(suggested from the name)</span></label><input name="headUsername" autocomplete="off" oninput="this.dataset.touched=1"></div>
    <div><label class="f">Email (sign-in codes are sent here)</label><input type="email" name="headEmail" placeholder="name@example.com"></div>
    <div><label class="f">Mobile phone</label><input type="tel" name="headPhone"></div>
    <div class="full small muted">Saving creates the head's account with the role Department Head, limited to this department. A temporary password is shown once after saving and must be changed at the first sign-in.</div>
   </div></form>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="df">${t('Save')}</button>`)}
function deptAuto(f){
  if(f.id&&!f.id.disabled&&!f.id.dataset.touched)f.id.value=(f.short.value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)[0]||'').slice(0,10);
  if(f.headUsername&&!f.headUsername.dataset.touched)f.headUsername.value=nameToUser(f.headName.value);
  if(f.headEmail)f.headEmail.required=!!f.headName.value.trim()&&$('#df_acct').style.display!=='none'; // an email is needed whenever an account will be created
  clearTimeout(deptAuto._t);deptAuto._t=setTimeout(async()=>{try{
    const r=await api('GET',`/api/departments/suggest?short=${encodeURIComponent(f.id&&!f.id.disabled?f.short.value:'')}&name=${encodeURIComponent(f.headName.value)}`);
    if(!document.body.contains(f))return;
    if(f.id&&!f.id.disabled&&!f.id.dataset.touched&&r.code&&f.short.value.trim())f.id.value=r.code;
    if(f.headUsername&&!f.headUsername.dataset.touched&&r.username&&f.headName.value.trim())f.headUsername.value=r.username;
  }catch(e){}},300)}
async function saveDept(e,id){e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  const creating=!!f.headName&&(!id||!dept(id).headId||!!f.replaceHead);
  const r=await act(id?'PUT':'POST',id?`/api/departments/${id}`:'/api/departments',{id:f.id,name:f.name,short:f.short,headName:f.headName||'',replaceHead:!!f.replaceHead,headUsername:creating?f.headUsername:'',headPhone:f.headPhone,headEmail:f.headEmail},null);
  if(!r)return false;
  if(r.tempPassword)showAccount('Department saved',r.headName,r.username,r.tempPassword);else toast('Department saved');
  return false}
/* ---------- workflows ---------- */
function vWorkflows(){
  const W=S.config.workflow;
  return `<div class="pagehead"><div><h1>${t('Workflows')}</h1><p>Configure the approval steps for performance data and when late reports are escalated.</p></div><button class="btn pri" onclick="saveWorkflows()">${t('Save')} all changes</button></div>
  <div class="grid g2">
   <div class="card"><h2>Performance data workflow</h2><p class="small ink2" style="margin:4px 0 14px">KPI Officer submits → Department Head verifies → Mayor's Office approves.</p>
    <div class="fg" style="grid-template-columns:1fr">
     <label class="toggle"><input type="checkbox" id="wf_v" ${W.verifyRequired?'checked':''}> Department head verification required</label>
     <label class="toggle"><input type="checkbox" id="wf_a" ${W.approveRequired?'checked':''}> Mayor's Office approval required</label>
     <label class="toggle"><input type="checkbox" id="wf_s" ${W.sod?'checked':''}> Enforce segregation of duties (no one verifies or approves their own work)</label>
     <label class="toggle"><input type="checkbox" id="wf_e" ${W.evidenceDefault?'checked':''}> New KPIs require evidence by default</label></div>
    <div class="fg" style="margin-top:14px"><div><label class="f">Escalate if not verified within (days)</label><input type="number" id="wf_vd" min="0" value="${W.verifyDays}"></div><div><label class="f">Escalate if not approved within (days)</label><input type="number" id="wf_ad" min="0" value="${W.approveDays}"></div></div></div>
  </div>`;
}
function collectWorkflows(){const W=S.config.workflow;
  if(!$('#wf_v'))return;
  Object.assign(W,{verifyRequired:$('#wf_v').checked,approveRequired:$('#wf_a').checked,sod:$('#wf_s').checked,evidenceDefault:$('#wf_e').checked,verifyDays:+$('#wf_vd').value,approveDays:+$('#wf_ad').value});}
async function saveWorkflows(){collectWorkflows();
  try{await api('PUT','/api/settings/workflow',S.config.workflow);await reload();toast('Workflow rules saved')}catch(e){onApiError(e);await reload()}}
/* ---------- security ---------- */
function vSecurity(){
  const P=S.config.security;const https=location.protocol==='https:';
  const locked=S.users.filter(u=>userState(u)==='locked');
  const ctl=[
   [https?'good':'warning','Encryption in transit',https?'This page is served over HTTPS (TLS), so data between the browser and the server is encrypted.':'This copy is not served over HTTPS. Production must use TLS 1.2 or later with HSTS.'],
   ['good','Password storage',`Salted PBKDF2-SHA256 hashes with ${(P.iterations||120000).toLocaleString()} iterations. Plain-text passwords are never stored.`],
   [P.mfaRoles.length?'good':'warning','Two-step verification',P.mfaRoles.length?`One-time code by ${P.otpChannel==='sms'?'SMS':'email'} required for: ${P.mfaRoles.map(r=>ROLES[r]).join(', ')}.`:'Not required for any role.'],
   ['good','Account lockout',`Locked for ${P.lockMin} minutes after ${P.maxAttempts} failed attempts.`],
   ['good','Session timeout',`Signed out after ${P.sessionMin} minutes of inactivity.`],
   ['good','Encrypted backups','Downloaded backups are encrypted with AES-256-GCM using a key derived from a passphrase (PBKDF2, 210,000 iterations).'],
   ['good','Server-side checks','Every API call re-checks the user’s role and department; the browser only receives data the user may see.'],
   ['good','Role-based access','Every screen and record is checked against the role permission matrix and the user’s department scope.'],
   ['good','Audit trail','Sign-ins, changes, approvals, assignments and exports are logged with before and after values.'],
  ];
  return `<div class="pagehead"><div><h1>${t('Security')}</h1><p>Authentication policy and the protections applied to data in transit and at rest.</p></div></div>
  <div class="grid g2">
   <div class="card"><h2 style="margin-bottom:6px">Controls in this system</h2>${ctl.map(([k,h,d])=>`<div class="check"><span class="chip c-${k}" style="flex:none"><i>${k==='good'?'✓':'!'}</i>${k==='good'?'Active':'Review'}</span><div><b>${h}</b><div class="small ink2">${d}</div></div></div>`).join('')}</div>
   <div><div class="card"><h2 style="margin-bottom:14px">Sign-in policy</h2><form class="fg" onsubmit="return saveSecurity(event)">
     <div><label class="f">Session timeout (minutes)</label><input type="number" name="sessionMin" min="5" max="480" value="${P.sessionMin}"></div>
     <div><label class="f">Failed attempts before lockout</label><input type="number" name="maxAttempts" min="3" max="10" value="${P.maxAttempts}"></div>
     <div><label class="f">Lockout duration (minutes)</label><input type="number" name="lockMin" min="5" value="${P.lockMin}"></div>
     <div><label class="f">Minimum password length</label><input type="number" name="pwMin" min="8" max="64" value="${P.pwMin}"></div>
     <div class="full"><label class="toggle"><input type="checkbox" name="pwComplex" ${P.pwComplex?'checked':''}> Require upper- and lower-case letters, a number and a symbol</label></div>
     <div class="full"><label class="f">Send sign-in codes by</label><select name="otpChannel"><option value="email" ${P.otpChannel!=='sms'?'selected':''}>Email (to the address on the account)</option><option value="sms" ${P.otpChannel==='sms'?'selected':''}>SMS (needs an approved SMS gateway)</option></select></div>
     <div class="full"><label class="f">Two-step verification required for</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${Object.keys(ROLES).map(r=>`<label class="toggle"><input type="checkbox" name="mfa_${r}" ${P.mfaRoles.includes(r)?'checked':''}> ${ROLES[r]}</label>`).join('')}</div></div>
     <div class="full"><button class="btn pri">Save policy</button></div></form></div>
   ${emailCard()}
   <div class="card"><h2 style="margin-bottom:8px">Locked accounts</h2>${locked.length?locked.map(u=>`<div class="check"><div style="flex:1"><b>${esc(u.name)}</b><div class="small muted">Locked until ${dt(u.lockedUntil)}</div></div><button class="btn sm" onclick="unlockUser('${u.id}')">Unlock</button></div>`).join(''):'<div class="muted small">No accounts are locked.</div>'}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2 style="margin-bottom:6px">Required at production deployment</h2><p class="small ink2" style="margin:0 0 8px">Hosting checklist — complete these when the system is installed on the City’s servers.</p>
   <div class="grid g2">${[['TLS 1.2+ with HSTS','Certificate on the city domain; HTTP redirected to HTTPS.'],['Database encryption at rest','AES-256 volume or transparent database encryption; encrypted backups stored off-site.'],['Field-level encryption','Phone numbers, national ID and complaint details encrypted in the database.'],['Key management','Keys held in a key vault or HSM, rotated yearly, separate from data.'],['Reverse proxy','Run behind Nginx or IIS with HTTPS; set SECURE_COOKIES=true and DEMO_MODE=false.'],['Rate limiting and WAF','Limit sign-in and API requests; web application firewall in front of the app.'],['Penetration test','Independent test before go-live and after major releases.'],['Data protection compliance','Handling of personal data in line with Ethiopia’s Personal Data Protection Proclamation No. 1321/2024.']].map(([h,d])=>`<div class="check"><span class="chip c-info" style="flex:none"><i>○</i>Deployment</span><div><b>${h}</b><div class="small ink2">${d}</div></div></div>`).join('')}</div></div>`;
}
/* Email set-up: whether a service is connected, a test button, and accounts that still have a sample address. */
function emailCard(){
  const c=S.config,need=S.users.filter(u=>u.active&&c.security.mfaRoles.includes(u.role));
  const bad=need.filter(u=>!u.email||/\.example$|@example\./i.test(u.email));
  return `<div class="card"><h2 style="margin-bottom:8px">Email for sign-in codes</h2>
   <div class="check"><span class="chip c-${c.emailProvider?'good':'warning'}" style="flex:none"><i>${c.emailProvider?'✓':'!'}</i>${c.emailProvider?'Connected':'Not set up'}</span><div><b>${c.emailProvider?`Email service: ${esc(c.emailProvider)}`:'No email service is connected'}</b><div class="small ink2">${c.emailProvider?`Messages are sent from ${esc(c.emailFrom||c.notify.email.from||'(no sender address set)')}.`:'Add BREVO_API_KEY (or RESEND_API_KEY) and EMAIL_FROM to the server variables, then redeploy. Until then codes cannot be emailed.'}</div></div></div>
   ${bad.length?`<div class="check"><span class="chip c-warning" style="flex:none"><i>!</i>${bad.length}</span><div><b>Accounts without a real email address</b><div class="small ink2">${bad.slice(0,8).map(u=>esc(u.name)).join(', ')}${bad.length>8?` and ${bad.length-8} more`:''}. They will not receive their code. Correct them under Users &amp; access.</div></div></div>`:''}
   ${c.demoMode?`<div class="check"><span class="chip c-warning" style="flex:none"><i>!</i>Demo</span><div><b>Demonstration mode is on</b><div class="small ink2">The code is also shown on the sign-in screen. Turn it off (DEMO_MODE=false) only after the test email below arrives and the accounts above have real addresses.</div></div></div>`:''}
   <form style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" onsubmit="return testEmail(event)"><input type="email" name="to" required value="${esc(me().email||'')}" placeholder="Send a test to…" style="flex:1;min-width:200px" aria-label="Address for the test email"><button class="btn" ${c.emailProvider?'':'disabled'}>Send a test email</button></form></div>`;
}
async function testEmail(e){e.preventDefault();const to=new FormData(e.target).get('to');const b=e.target.querySelector('button');b.disabled=true;
  try{const r=await api('POST','/api/email/test',{to});toast(`Test email sent to ${r.to}. Check the inbox and the spam folder.`)}catch(err){openModal('The test email was not sent',`<p>${esc(err.message)}</p><p class="small muted">Check the API key, and that the sender address in EMAIL_FROM is verified with the email service.</p>`,`<button class="btn pri" onclick="closeModal()">Close</button>`)}
  b.disabled=false;return false}
function saveSecurity(e){e.preventDefault();const f=new FormData(e.target);
  act('PUT','/api/settings/security',{sessionMin:+f.get('sessionMin'),maxAttempts:+f.get('maxAttempts'),lockMin:+f.get('lockMin'),pwMin:+f.get('pwMin'),pwComplex:!!f.get('pwComplex'),otpChannel:f.get('otpChannel')==='sms'?'sms':'email',mfaRoles:Object.keys(ROLES).filter(r=>f.get('mfa_'+r))},'Security policy saved');return false}
/* ---------- backup, retention & archive ---------- */
function createBackup(){act('POST','/api/backups',{},'Backup created')}
function verifyBackup(id){act('POST',`/api/backups/${id}/verify`,{},r=>r.ok?'Integrity check passed — checksum matches':'Integrity check FAILED — this backup is damaged')}
function restoreConfirm(id){const b=S.backups.find(x=>x.id===id);openModal('Restore this backup?',`<p>Restore the backup from <b>${dt(b.at)}</b> (${esc(b.kind)}). All current data will be replaced and other users will be signed out. A safety backup of the current state is taken first, so this can be undone.</p>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn bad" onclick="act('POST','/api/backups/${id}/restore',{},'Backup restored')">Restore backup</button>`)}
function deleteBackup(id){act('DELETE',`/api/backups/${id}`,null,'Backup deleted')}
function downloadBackupModal(id){openModal('Download encrypted backup',`<form id="bk" class="fg" style="grid-template-columns:1fr" onsubmit="return downloadBackup(event,'${id}')"><p class="ink2" style="margin:0">The file is encrypted with AES-256-GCM. Keep the passphrase somewhere safe — without it the backup cannot be restored.</p><div><label class="f">Passphrase (at least 12 characters)</label><input type="password" name="p1" minlength="12" required autocomplete="new-password"></div><div><label class="f">Confirm passphrase</label><input type="password" name="p2" required autocomplete="new-password"></div></form>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="bk">${ico('download',15)} Encrypt and download</button>`)}
async function downloadBackup(e,id){e.preventDefault();const f=new FormData(e.target);if(f.get('p1')!==f.get('p2')){toast('The passphrases do not match.');return false}
  closeModal();await downloadUrl(`/api/backups/${id}/download`,'shaggar-pms-backup.json','POST',{passphrase:f.get('p1')});return false}
function importBackupModal(){openModal('Restore from a backup file',`<form id="ib" class="fg" style="grid-template-columns:1fr" onsubmit="return importBackup(event)"><div><label class="f">Encrypted backup file (.json)</label><input type="file" name="file" accept=".json,application/json" required></div><div><label class="f">Passphrase</label><input type="password" name="p" required autocomplete="off"></div></form>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="ib">Decrypt and restore</button>`)}
async function importBackup(e){e.preventDefault();const f=new FormData(e.target);let obj;
  try{obj=JSON.parse(await f.get('file').text())}catch(err){toast('This file is not a backup file.');return false}
  act('POST','/api/backups/import',{file:obj,passphrase:f.get('p')},'Backup restored');return false}
function runArchival(){act('POST','/api/archive/run',{},r=>`Archival complete — ${r.ac} action plan(s) archived`)}
function restoreArchived(kind,id){act('POST','/api/archive/restore',{kind,id},'Record restored from archive')}
function vData(){
  const tab=UI.tab.data||'backups';const R=S.config.retention;const bs=S.backups;
  let body='';
  if(tab==='backups')body=`<div class="tiles"><div class="tile"><div class="lbl">Backups kept</div><div class="val">${bs.length}<span class="muted" style="font-size:15px"> / ${R.backupKeep}</span></div></div><div class="tile"><div class="lbl">Latest backup</div><div class="val" style="font-size:17px;margin-top:10px">${bs[0]?dt(bs[0].at):'None'}</div></div><div class="tile"><div class="lbl">Total backup size</div><div class="val">${(bs.reduce((a,b)=>a+b.size,0)/1048576).toFixed(1)} MB</div><div class="sub">stored on the server</div></div></div>
   <div class="card"><div class="cardhead"><h2>Backups</h2><div style="display:flex;gap:8px"><button class="btn" onclick="importBackupModal()">Restore from file</button><button class="btn pri" onclick="createBackup()">${ico('database',15)} Create backup now</button></div></div>
   <div class="tblwrap"><table class="tbl"><thead><tr><th>Created</th><th>Type</th><th>By</th><th class="num">Size</th><th>SHA-256</th><th></th></tr></thead><tbody>
   ${bs.length?bs.map(b=>`<tr><td>${dt(b.at)}</td><td>${esc({manual:'Manual',daily:'Automatic (daily)','pre-restore':'Safety (before restore)'}[b.kind]||b.kind)}</td><td>${esc(sysName(b.by))}</td><td class="num">${(b.size/1024).toFixed(0)} KB</td><td class="mono muted">${b.checksum.slice(0,16)}…</td><td><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn sm" onclick="verifyBackup('${b.id}')">Verify</button><button class="btn sm" onclick="downloadBackupModal('${b.id}')">Download</button><button class="btn sm" onclick="restoreConfirm('${b.id}')">Restore</button><button class="btn sm ghost" onclick="deleteBackup('${b.id}')" aria-label="Delete backup">${ico('x',15)}</button></div></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No backups yet. Create one now.</td></tr>'}
   </tbody></table></div><p class="small muted" style="margin:10px 0 0">The server takes an automatic backup every day and a safety backup before every restore. The newest ${R.backupKeep} are kept — download encrypted copies to keep longer or off-site.</p></div>`;
  if(tab==='retention')body=`<div class="grid g2"><div class="card"><h2 style="margin-bottom:14px">Retention rules</h2><form class="fg" onsubmit="return saveRetention(event)">
    <div><label class="f">Keep audit trail (years)</label><input type="number" name="auditYears" min="1" value="${R.auditYears}"></div>
    <div><label class="f">Archive completed action plans after (days)</label><input type="number" name="capDays" min="1" value="${R.capDays}"></div>
    <div><label class="f">Delete notifications after (days)</label><input type="number" name="notifDays" min="7" value="${R.notifDays}"></div>
    <div><label class="f">Delete outbox messages after (days)</label><input type="number" name="outboxDays" min="7" value="${R.outboxDays}"></div>
    <div><label class="f">Backups kept in the browser</label><input type="number" name="backupKeep" min="2" max="12" value="${R.backupKeep}"></div>
    <div class="full" style="display:flex;gap:8px"><button class="btn pri">Save rules</button><button type="button" class="btn" onclick="runArchival()">Run archival now</button></div></form>
    <p class="small muted" style="margin:12px 0 0">The server runs archival automatically once a day. Last run: ${esc(S.lastArchival||'never')}.</p></div>
   <div class="card"><h2 style="margin-bottom:10px">Records schedule</h2><table class="tbl"><thead><tr><th>Record</th><th>Active</th><th>Then</th></tr></thead><tbody>
    <tr><td>KPI targets, submissions and evidence</td><td>Current + 2 fiscal years</td><td>Archive; keep 10 years</td></tr>
    <tr><td>Audit trail</td><td>${R.auditYears} years</td><td>Delete</td></tr>
    <tr><td>Corrective action plans</td><td>${R.capDays} days after completion</td><td>Archive; keep 10 years</td></tr>
    <tr><td>Notifications</td><td>${R.notifDays} days</td><td>Delete</td></tr>
    <tr><td>SMS/email outbox</td><td>${R.outboxDays} days</td><td>Delete</td></tr>
    <tr><td>Backups (production)</td><td>30 daily, 12 monthly</td><td>Delete oldest</td></tr></tbody></table>
    <p class="small muted" style="margin:10px 0 0">Periods are proposals for approval by the City’s records management office.</p></div></div>`;
  if(tab==='archive')body=`<div class="card"><h2 style="margin-bottom:10px">Archived action plans (${S.archive.caps.length})</h2>${S.archive.caps.length?`<table class="tbl"><tbody>${S.archive.caps.map(c=>`<tr><td class="mono">${esc(c.ref)}</td><td>${esc(c.title)}</td><td>${dshort(c.archivedAt)}</td><td class="right"><button class="btn sm" onclick="restoreArchived('caps','${c.id}')">Restore</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nothing archived yet.</div>'}</div>`;
  if(tab==='procedures')body=`<div class="grid g2"><div class="card"><h2>Backup procedure (production)</h2><ol style="padding-left:18px;line-height:1.8;font-size:13.5px">
    <li>The server takes a full, consistent backup every day automatically (and before every restore).</li><li>Replicate the evidence folder (storage/uploads) to a second location; add disk snapshots for a 15-minute recovery point.</li><li>Copy the backups folder, or an encrypted download, off-site every week (separate data centre or approved cloud region).</li><li>Check this page weekly: the latest daily backup should be from today and pass Verify.</li><li>Backup files checked with checksums after every run.</li></ol>
    <h3 style="margin-top:14px">Targets</h3><dl class="kv" style="margin-top:6px"><dt>Recovery point objective</dt><dd>24 hours with the built-in backup; 15 minutes with replication or snapshots</dd><dt>Recovery time objective</dt><dd>4 hours to restore service</dd></dl></div>
   <div class="card"><h2>Recovery procedure</h2><ol style="padding-left:18px;line-height:1.8;font-size:13.5px">
    <li>Incident declared by the ICT Directorate; the Mayor's Office is informed.</li><li>Choose the restore point; take a safety copy of the current state.</li><li>Restore the database and files to the standby server; run integrity checks.</li><li>Check sign-in, scorecards and the audit trail with a test account.</li><li>Switch users to the restored service and record the incident in the audit trail.</li><li>Within 5 working days, write a post-incident review.</li></ol>
    <h3 style="margin-top:14px">Testing</h3><p class="small ink2" style="margin:4px 0 0">Restore drill every quarter on a copy of production; results recorded under Quality & testing.</p></div></div>`;
  return `<div class="pagehead"><div><h1>${t('Backup & retention')}</h1><p>Backups with integrity checks and encrypted download, retention and archival rules, and the recovery procedure.</p></div></div>
  <div class="tabs">${[['backups','Backups'],['retention','Retention & archival'],['archive','Archive'],['procedures','Procedures']].map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.data='${k}';render()">${l}</button>`).join('')}</div>${body}`;
}
function saveRetention(e){e.preventDefault();const f=new FormData(e.target);const v={};['auditYears','capDays','notifDays','outboxDays','backupKeep'].forEach(k=>v[k]=+f.get(k));act('PUT','/api/settings/retention',v,'Retention rules saved');return false}
/* ---------- integrations & API ---------- */
let ENDPOINTS=[];
async function loadEndpoints(){if(ENDPOINTS.length)return;try{ENDPOINTS=await api('GET','/api/v1/endpoints');render()}catch(e){}}
async function apiCall(method,url,bodyText,key){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key.replace(/^Bearer\s+/i,'')}:{})},body:method==='POST'?(bodyText||'{}'):undefined});
  let body;try{body=await r.json()}catch(e){body=await r.text()}return {status:r.status,body};
}
function vIntegrations(){
  const tab=UI.tab.api||'docs';let body='';if(!ENDPOINTS.length)setTimeout(loadEndpoints,0);
  if(tab==='docs')body=`<div class="card"><div class="cardhead"><h2>REST API v1</h2><button class="btn sm" onclick="downloadUrl('/api/v1/openapi.json','openapi.json')">${ico('download',15)} OpenAPI specification</button></div>
    <p class="ink2" style="margin-top:0">Base URL <span class="mono">${esc(location.origin)}</span>. Authenticate with <span class="mono">Authorization: Bearer &lt;api key&gt;</span>. Responses are JSON; times are ISO 8601 in UTC; calls are limited to 60 per minute per key and written to the audit trail.</p>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Method</th><th>Path</th><th>Scope</th><th>Description</th><th></th></tr></thead><tbody>${ENDPOINTS.map((e,i)=>`<tr><td><span class="chip ${e.m==='GET'?'c-info':'c-brand'}">${e.m}</span></td><td class="mono">${esc(e.p)}</td><td><span class="pill">${e.s}</span></td><td class="small">${esc(e.d)}</td><td><button class="btn sm" onclick="UI.tab.api='console';UI.apiEp=${i};render()">Try it</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Planned integrations</h3><ul class="small" style="line-height:1.9;padding-left:18px;margin:8px 0 0"><li>Revenue system — monthly collection actuals (REV-01)</li><li>Land information system — service requests delivered and turnaround (LAND-01, LAND-03)</li><li>e-Trade licensing — licences processed (TRADE-01)</li><li>DHIS2 — immunisation and ANC figures (HEALTH-01, HEALTH-02)</li><li>IFMIS — capital budget utilisation (INFRA-03)</li><li>SMS gateway and city mail server — notifications</li></ul><p class="small muted">Each integration needs approval from the system owner before keys are issued.</p></div>
    <div class="card"><h3>Error codes</h3><table class="tbl small"><tbody><tr><td class="mono">401</td><td>Missing, invalid or revoked API key</td></tr><tr><td class="mono">403</td><td>Key lacks the scope for this endpoint</td></tr><tr><td class="mono">404</td><td>Record or endpoint not found</td></tr><tr><td class="mono">409</td><td>Already submitted for that period</td></tr><tr><td class="mono">422</td><td>Validation failed — message explains which field</td></tr><tr><td class="mono">429</td><td>Rate limit exceeded</td></tr></tbody></table></div></div>`;
  if(tab==='keys')body=`<div class="card"><div class="cardhead"><h2>API keys</h2><button class="btn pri" onclick="keyForm()">${ico('plus',15)} Create key</button></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th>${t('Status')}</th><th></th></tr></thead><tbody>${S.api.keys.map(k=>`<tr><td><b>${esc(k.name)}</b><div class="small muted">by ${esc(uname(k.createdBy))}</div></td><td class="mono">${esc(k.prefix)}••••</td><td>${k.scopes.map(s=>`<span class="pill">${s}</span>`).join(' ')}</td><td class="small">${dshort(k.createdAt)}</td><td class="small">${dt(k.lastUsed)}</td><td>${k.revoked?'<span class="chip c-none">Revoked</span>':'<span class="chip c-good"><i>✓</i>Active</span>'}</td><td class="right">${k.revoked?'':`<button class="btn sm bad" onclick="revokeKey('${k.id}')">Revoke</button>`}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">Only a SHA-256 hash of each key is stored. The full key is shown once, when it is created.</p></div>`;
  if(tab==='console'&&!ENDPOINTS.length)body='<div class="card"><div class="empty">Loading…</div></div>';else if(tab==='console'){const e=ENDPOINTS[UI.apiEp||0];body=`<div class="card"><h2 style="margin-bottom:12px">API console</h2><div class="fg">
    <div class="full"><label class="f">Endpoint</label><select id="ac_ep" onchange="UI.apiEp=+this.value;render()">${ENDPOINTS.map((x,i)=>`<option value="${i}" ${i===(UI.apiEp||0)?'selected':''}>${x.m} ${x.p}</option>`).join('')}</select></div>
    <div class="full"><label class="f">URL</label><input id="ac_url" class="mono" value="${esc(e.ex||e.p)}"></div>
    <div class="full"><label class="f">Authorization: Bearer</label><input id="ac_key" class="mono" placeholder="shg_live_…" value="${esc(UI.lastKey||'')}" autocomplete="off"></div>
    ${e.m==='POST'?`<div class="full"><label class="f">Request body (JSON)</label><textarea id="ac_body" class="mono" style="min-height:90px">${esc(e.body||'{}')}</textarea></div>`:''}
    <div class="full"><button class="btn pri" onclick="runConsole()">${ico('send',15)} Send request</button></div></div>
    <h3 style="margin:18px 0 8px">Response</h3><pre id="ac_out" class="mono" style="background:var(--sunk);border-radius:10px;padding:14px;max-height:420px;overflow:auto;white-space:pre-wrap;margin:0">${esc(UI.apiOut||'Send a request to see the response.')}</pre>
    <p class="small muted">The console sends real requests to this server. Create a key under API keys first — it is filled in here automatically.</p></div>`}
  if(tab==='hooks')body=`<div class="card"><div class="cardhead"><h2>Webhooks</h2><button class="btn sm" onclick="addHook()">${ico('plus',15)} Add webhook</button></div><table class="tbl"><thead><tr><th>URL</th><th>Events</th><th>${t('Status')}</th><th></th></tr></thead><tbody>${S.api.hooks.map(h=>`<tr><td class="mono">${esc(h.url)}</td><td>${h.events.map(e=>`<span class="pill">${e}</span>`).join(' ')}</td><td>${h.active?'<span class="chip c-good"><i>✓</i>Active</span>':'<span class="chip c-warning"><i>!</i>Pending approval</span>'}</td><td class="right"><button class="btn sm" onclick="toggleHook('${h.id}')">${h.active?'Disable':'Enable'}</button></td></tr>`).join('')}</tbody></table><p class="small muted" style="margin:10px 0 0">Webhooks POST a signed JSON payload (HMAC-SHA256 in the X-Shaggar-Signature header) when the event happens. Only enabled webhooks receive events.</p></div>`;
  return `<div class="pagehead"><div><h1>${t('Integrations & API')}</h1><p>Documented REST endpoints, scoped API keys and webhooks for approved integrations with other city systems.</p></div></div>
  <div class="tabs">${[['docs','Documentation'],['keys','API keys'],['console','Console'],['hooks','Webhooks']].map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.api='${k}';render()">${l}</button>`).join('')}</div>${body}`;
}
function keyForm(){openModal('Create API key',`<form id="kf2" class="fg" style="grid-template-columns:1fr" onsubmit="return createKey(event)"><div><label class="f">Name (system and purpose)</label><input name="name" required placeholder="e.g. e-Trade licensing sync"></div><div><label class="f">Scopes</label>${SCOPES.map(([s,d])=>`<label class="toggle" style="display:flex;margin:4px 0"><input type="checkbox" name="sc_${s}"> <span class="mono">${s}</span> — ${d}</label>`).join('')}</div></form>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="kf2">Create key</button>`)}
async function createKey(e){e.preventDefault();const f=new FormData(e.target);const scopes=SCOPES.map(s=>s[0]).filter(s=>f.get('sc_'+s));
  const r=await act('POST','/api/api-keys',{name:f.get('name'),scopes},null);if(!r)return false;UI.lastKey=r.key;
  openModal('API key created',`<p>Copy this key now and store it in the other system’s secret store. It will not be shown again.</p><p class="mono" style="padding:12px;background:var(--surface-2);border-radius:10px;word-break:break-all">${esc(r.key)}</p>`,`<button class="btn" onclick="copyText(UI.lastKey,'Key copied')">Copy key</button><button class="btn pri" onclick="closeModal()">Done</button>`);return false}
function revokeKey(id){act('POST',`/api/api-keys/${id}/revoke`,{},'Key revoked')}
async function runConsole(){const e=ENDPOINTS[UI.apiEp||0];const url=$('#ac_url').value,key=$('#ac_key').value;UI.lastKey=key;
  const r=await apiCall(e.m,url,$('#ac_body')?.value,key);UI.apiOut=`HTTP ${r.status}\n\n`+(typeof r.body==='string'?r.body:JSON.stringify(r.body,null,2));$('#ac_out').textContent=UI.apiOut}
function addHook(){openModal('Add webhook',`<form id="whf" class="fg" style="grid-template-columns:1fr" onsubmit="return saveHook(event)"><div><label class="f">HTTPS URL that receives the events</label><input name="url" type="text" required placeholder="https://"></div><div><label class="f">Events</label>${EVENTS.filter(e=>e[0]!=='otp').map(([k,l])=>`<label class="toggle" style="display:flex;margin:4px 0"><input type="checkbox" name="ev_${k}"> ${esc(l)}</label>`).join('')}</div></form>`,`<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="whf">Add webhook</button>`)}
async function saveHook(e){e.preventDefault();const f=new FormData(e.target);const r=await act('POST','/api/webhooks',{url:f.get('url'),events:EVENTS.map(x=>x[0]).filter(k=>f.get('ev_'+k))},null);
  if(r)openModal('Webhook added',`<p>Use this secret to verify the <span class="mono">X-Shaggar-Signature</span> header (HMAC-SHA256 of the body). It is shown once.</p><p class="mono" style="padding:12px;background:var(--surface-2);border-radius:10px;word-break:break-all">${esc(r.secret)}</p><p class="small muted">The webhook starts disabled. Enable it once the receiving system is approved.</p>`,`<button class="btn pri" onclick="closeModal()">Done</button>`);return false}
function toggleHook(id){act('POST',`/api/webhooks/${id}/toggle`,{},'Webhook updated')}
/* ---------- quality & testing ---------- */
function hexToRgb(c){c=c.trim();if(c.startsWith('#')){if(c.length===4)c='#'+[...c.slice(1)].map(x=>x+x).join('');return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16))}const m=c.match(/\d+/g);return m?m.slice(0,3).map(Number):[0,0,0]}
function lum([r,g,b]){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)}
function contrast(a,b){const x=lum(hexToRgb(a)),y=lum(hexToRgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function runQuality(){
  const orig=S.ui.view;const res=[];const views=allowedViews().filter(v=>v!=='quality');const cs=getComputedStyle(document.documentElement);const v=n=>cs.getPropertyValue(n);
  views.forEach(view=>{S.ui.view=view;const t0=performance.now();render();const ms=performance.now()-t0;const c=$('#content');
    const ctrls=[...c.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(el=>!(el.getAttribute('aria-label')||(el.id&&c.querySelector(`label[for="${el.id}"]`))||el.closest('label')));
    const btns=[...c.querySelectorAll('button')].filter(b=>!(b.textContent.trim()||b.getAttribute('aria-label')));
    const svgs=[...c.querySelectorAll('svg')].filter(s=>!(s.getAttribute('aria-hidden')||s.getAttribute('role')||s.closest('[aria-hidden]')));
    const h1=c.querySelectorAll('h1').length;const nodes=c.querySelectorAll('*').length;
    const kb=[...c.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select)')].filter(el=>!el.hasAttribute('tabindex'));
    res.push({view,ms,ctrls:ctrls.length,btns:btns.length,svgs:svgs.length,h1,nodes,kb:kb.length});
  });
  S.ui.view=orig;
  const pairs=[['Body text on page','--ink','--surface'],['Secondary text','--ink-2','--surface'],['Muted text','--muted','--surface'],['Brand text on tint','--brand-ink','--brand-soft'],['Button text on brand','--on-brand','--brand']];
  const con=pairs.map(([l,a,b])=>({l,r:contrast(a.startsWith('--')?v(a):a,v(b))}));
  const storage=0;
  const run={at:new Date().toISOString(),by:S.ui.userId,theme:S.ui.theme,views:res,contrast:con,storage,
    pass:res.every(r=>r.ctrls===0&&r.btns===0&&r.svgs===0&&r.h1===1&&r.kb===0&&r.ms<300)&&con.every(c=>c.r>=4.5)};
  UI.tab.qa='auto';act('POST','/api/qa/runs',{results:{theme:run.theme,views:run.views,contrast:run.contrast,storage:run.storage},passed:run.pass},run.pass?'All automated checks passed':'Checks finished — see the results');
}
function vQuality(){
  const tab=UI.tab.qa||'auto';const run=S.qa.runs[0];let body='';
  const pf=(ok,warn)=>ok?'<span class="chip c-good"><i>✓</i>Pass</span>':warn?'<span class="chip c-warning"><i>!</i>Review</span>':'<span class="chip c-critical"><i>✕</i>Fail</span>';
  if(tab==='auto')body=run?`<div class="tiles"><div class="tile"><div class="lbl">Last run</div><div class="val" style="font-size:16px;margin-top:10px">${dt(run.at)}</div><div class="sub">${esc(uname(run.by))} · ${run.theme} theme</div></div><div class="tile"><div class="lbl">Result</div><div class="val" style="font-size:18px;margin-top:8px">${pf(run.pass)}</div></div><div class="tile"><div class="lbl">Slowest screen</div><div class="val">${Math.max(...run.views.map(r=>r.ms)).toFixed(0)} ms</div><div class="sub">budget 300 ms</div></div></div>
    <div class="card"><h2 style="margin-bottom:10px">Accessibility and performance by screen</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Screen</th><th class="num">Render time</th><th>Labelled form fields</th><th>Named buttons</th><th>Charts described</th><th>Keyboard reachable</th><th>One page title</th><th class="num">Elements</th></tr></thead><tbody>
    ${run.views.map(r=>{const n=navFlat().find(x=>x[0]===r.view);return `<tr><td>${esc(n?t(n[1]):r.view)}</td><td class="num">${r.ms.toFixed(0)} ms ${pf(r.ms<300,r.ms<600)}</td><td>${pf(!r.ctrls)}${r.ctrls?` ${r.ctrls}`:''}</td><td>${pf(!r.btns)}${r.btns?` ${r.btns}`:''}</td><td>${pf(!r.svgs)}${r.svgs?` ${r.svgs}`:''}</td><td>${pf(!r.kb)}</td><td>${pf(r.h1===1)}</td><td class="num">${r.nodes}</td></tr>`}).join('')}</tbody></table></div></div>
    <div class="card"><h2 style="margin-bottom:10px">Colour contrast (WCAG 2.2 AA needs 4.5 : 1 for text)</h2><table class="tbl"><tbody>${run.contrast.map(c=>`<tr><td>${c.l}</td><td class="num">${c.r.toFixed(2)} : 1</td><td>${pf(c.r>=4.5,c.r>=3)}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin:10px 0 0">Run the checks again in dark mode to test the dark palette. Status is never shown by colour alone — every chip has an icon and a label.</p></div>`
    :'<div class="card"><div class="empty">No checks have been run yet. Run them to test every screen you can access.</div></div>';
  if(tab==='usability')body=`<div class="card"><div class="cardhead"><h2>Usability test sessions</h2><span class="small muted">Five tasks, one per key role, with real staff</span></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Role</th><th>Task</th><th>${t('Status')}</th><th>Findings</th></tr></thead><tbody>${S.qa.sessions.map(s=>`<tr><td><b>${esc(s.role)}</b></td><td>${esc(s.task)}</td><td><select aria-label="Session status" onchange="qaSession('${s.id}','status',this.value)">${['Planned','Done','Issues found'].map(x=>`<option ${x===s.status?'selected':''}>${x}</option>`).join('')}</select></td><td><input aria-label="Findings" value="${esc(s.findings)}" placeholder="What went well, what was hard" style="width:100%" onchange="qaSession('${s.id}','findings',this.value)"></td></tr>`).join('')}</tbody></table></div></div>
   <div class="card"><h2>Test plan before go-live</h2><div class="grid g2" style="margin-top:8px">${[['Accessibility','WCAG 2.2 AA review with keyboard-only and screen-reader (NVDA, TalkBack) passes; Amharic and Afaan Oromoo screens included.'],['Usability','Task-based sessions with 5+ users per role; success rate ≥ 90% and no critical issues before launch.'],['Performance','Pages under 2 s on 3G mobile; API p95 under 500 ms at 200 concurrent users; load test with 3 years of data.'],['Devices','Chrome, Edge, Firefox, Safari; Android phones from 5″ screens; tablets in both orientations.'],['Security','Penetration test, dependency scan, role-permission test matrix for all 8 roles.'],['Recovery','Quarterly restore drill against the 15-minute RPO and 4-hour RTO.']].map(([h,d])=>`<div class="check"><span class="chip c-info" style="flex:none"><i>○</i>Planned</span><div><b>${h}</b><div class="small ink2">${d}</div></div></div>`).join('')}</div></div>`;
  return `<div class="pagehead"><div><h1>${t('Quality & testing')}</h1><p>Automated accessibility and performance checks of every screen, and the usability test plan.</p></div><button class="btn pri" onclick="runQuality()">${ico('refresh',15)} Run automated checks</button></div>
  <div class="tabs">${[['auto','Automated checks'],['usability','Usability & test plan']].map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="UI.tab.qa='${k}';render()">${l}</button>`).join('')}</div>${body}`;
}
function qaSession(id,k,v){api('PUT',`/api/qa/sessions/${id}`,{[k]:v}).then(()=>toast('Saved')).catch(onApiError)}