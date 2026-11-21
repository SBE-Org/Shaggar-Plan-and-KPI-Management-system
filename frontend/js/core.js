/* =========================================================================
   core.js — constants, client state, API client, access helpers,
   performance-engine binding, formatting, charts, translations and icons.
   ========================================================================= */
const {MONTHS,ROLES,ROLE_DESC,PERMS,EVENTS,SCOPES,RATINGS,AUDIT_CATEGORIES,sum,avg,clamp,pct,fmt,roundU,auditCategory}=SHARED;

/* ---------- client state ----------
   S = data from GET /api/bootstrap (already filtered by the server to what this
   user may see) + S.ui (this browser's preferences, kept in localStorage). */
let S={ui:null};
const UI={tab:{},flt:{},tbl:{},tblRows:{},tblCfg:{},menu:null,drawer:false,fid:0,lastAct:Date.now()};
const PREFS_KEY='spms_prefs_v1';
function loadPrefs(){let p={};try{p=JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')}catch(e){}return {view:'dashboard',period:{type:'Y',v:0},provisional:false,dept:null,theme:'navy',lang:'en',collapsed:false,navOpen:{},...p,userId:null}}
function save(){try{const {userId,...p}=S.ui;localStorage.setItem(PREFS_KEY,JSON.stringify(p))}catch(e){}}
S.ui=loadPrefs();

/* ---------- API client ---------- */
async function api(method,path,body){
  const r=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const err=new Error((j&&j.error)||`The server answered ${r.status}.`);err.status=r.status;throw err}
  return j;
}
/** Reload all data for the signed-in user and redraw. */
async function reload(){const d=await api('GET','/api/bootstrap');const ui=S.ui;S={...d,ui,pub:S.pub};S.ui.userId=d.me;if(!S.ui.lang||S.ui.lang==='en')S.ui.lang=me()?.lang||S.ui.lang;render()}
/** Run a change on the server, then refresh. Shows the server's message on failure. */
async function act(method,path,body,msg,{keepModal=false}={}){
  try{const r=await api(method,path,body);if(!keepModal)closeModal();await reload();if(msg)toast(typeof msg==='function'?msg(r):msg);return r||{}}
  catch(e){onApiError(e);return null}
}
function onApiError(e){if(e.status===401){S.ui.userId=null;AUTH.err=e.message;closeModal(true);render();return}if(e.status===403&&/temporary password/.test(e.message)){UI.forcePw=true;pwModal(true);return}toast(e.message)}
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})}
function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file)})}

/* ---------- utils ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const el=$('#toast');el.textContent=msg;el.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>el.style.display='none',3200)}
function dt(iso){if(!iso)return '—';const d=new Date(iso);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
function dshort(iso){if(!iso)return '—';return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
function fmtU(v,unit){const s=fmt(v,unit);if(s==='—'||['%','ETB M','days'].includes(unit))return s;return s+` <span class="muted small">${esc(unit)}</span>`}
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
/** Save a generated file in the browser. */
function downloadFile(name,data,what,mime='text/plain'){const blob=data instanceof Blob?data:new Blob([data],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);toast(`${what||'File'} downloaded`)}
async function downloadUrl(url,fallbackName,method='GET',body){try{const r=await fetch(url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(!r.ok){let m='Download failed.';try{m=(await r.json()).error||m}catch(e){}throw new Error(m)}const cd=r.headers.get('content-disposition')||'';const name=(cd.match(/filename="([^"]+)"/)||[])[1]||fallbackName;downloadFile(name,await r.blob(),'File');return true}catch(e){toast(e.message);return false}}
function distribute(k,annual){const dueM=[...Array(12).keys()].filter(m=>k.freq==='monthly'||m%3===2);return [...Array(12).keys()].map(m=>dueM.includes(m)?(k.agg==='sum'?roundU(annual/dueM.length,k.unit):annual):null)}

/* ---------- access ---------- */
const me=()=>(S.users||[]).find(u=>u.id===S.ui.userId);
const can=(p,u=me())=>!!u&&u.active&&(S.perms[u.role]||[]).includes(p);
const dept=id=>S.depts.find(d=>d.id===id);
const kpi=id=>S.kpis.find(k=>k.id===id);
const user=id=>S.users.find(u=>u.id===id);
const uname=id=>{const u=user(id);return u?u.name:'—'};
const sysName=id=>id?uname(id):'System (automated)';
function scope(u=me()){
  if(!S||!S.depts)return [];
  if(!u)return [];
  if(can('all_depts',u)||(!u.deptId&&['super_admin','kpi_officer','mayor','mayor_admin','auditor'].includes(u.role)))return S.depts.map(d=>d.id);
  return u.deptId?[u.deptId]:[];
}
const scopedDepts=()=>S.depts.filter(d=>scope().includes(d.id));
const inScope=did=>scope().includes(did);

/* ---------- audit & notifications ---------- */

/* ---------- performance engine (shared/performance.js — same code as the server) ---------- */
const ENG=createPerfEngine({getState:()=>S,scopeIds:()=>scope(),provisional:()=>S.ui.provisional,period:()=>S.ui.period});
const {due,subFor,countable,periodMonths,periodLabel,prevPeriod,aggr,achv,kpiCalc,deptCalc,lastYearKpi,lastYearDept,band,pastDeadline,cellState,monthlyAch}=ENG;
const MONTH_YEAR=m=>ENG.monthYear(m);
function cityIndex(months,depts=scopedDepts()){return ENG.cityIndex(months,depts)}
function alerts(){return ENG.alerts(S.ui.period)}
const chip=v=>{const b=band(v);return `<span class="chip c-${b.key}"><i>${b.icon}</i>${t(b.label)}</span>`};
function achBar(v){const b=band(v);const w=v==null?0:clamp(v,0,120)/120*100;return `<div class="achbar" title="${pct(v)} of target"><span class="bg-${b.key}" style="width:${w}%"></span><em></em></div>`}
function delta(cur,prev,suffix=''){
  if(cur==null||prev==null)return '<span class="muted">—</span>';
  const d=cur-prev;const up=d>=0;
  return `<span class="num" style="white-space:nowrap" title="${suffix}">${up?'▲':'▼'} ${Math.abs(d).toFixed(1)} pts</span>`;
}
const SUBST={draft:['c-none','✎','Draft'],submitted:['c-info','↑','Awaiting verification'],verified:['c-brand','✓','Verified · awaiting approval'],approved:['c-good','✓','Approved'],returned:['c-critical','↩','Returned'],missing:['c-serious','!','Overdue'],notdue:['c-none','·','Not yet due'],open:['c-none','○','Open for reporting']};
const subChip=st=>{const c=SUBST[st]||SUBST.draft;return `<span class="chip ${c[0]}"><i>${c[1]}</i>${t(c[2])}</span>`};

function tileSpark(vals){const v=vals.map((x,i)=>[i,x]).filter(p=>p[1]!=null);if(v.length<2)return '';const W=96,H=34,lo=Math.min(...v.map(p=>p[1])),hi=Math.max(...v.map(p=>p[1])),n=Math.max(...v.map(p=>p[0]))||1;const X=i=>3+i/n*(W-6),Y=x=>H-4-(hi===lo?.5:(x-lo)/(hi-lo))*(H-8);const pts=v.map(p=>X(p[0])+','+Y(p[1])).join(' ');const id='sp'+(++UI.fid);return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".35"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs><polygon points="${X(v[0][0])},${H} ${pts} ${X(v[v.length-1][0])},${H}" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
function trendTxt(cur,prev){if(cur==null||prev==null)return '<span class="small muted">no comparison</span>';const d=cur-prev;return `<span class="small ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)} pts vs LY</span>`}

const openCapFor=(deptId,kpiId)=>S.caps.find(c=>c.deptId===deptId&&(kpiId?c.kpiId===kpiId:true)&&c.status!=='Completed');


/* ---------- charts (inline SVG) ---------- */
function niceMax(v){return Math.ceil(Math.max(v,110)/10)*10}
function lineChart({labels,series,refs=[],h=230,minY=0,maxY}){
  const W=680,H=h,pl=42,pr=70,pt=12,pb=26;
  const vals=series.flatMap(s=>s.values).filter(v=>v!=null);
  const max=maxY??niceMax(vals.length?Math.max(...vals):100);
  const min=minY;
  const x=i=>pl+(labels.length<2?(W-pl-pr)/2:i*(W-pl-pr)/(labels.length-1));
  const y=v=>pt+(H-pt-pb)*(1-(clamp(v,min,max)-min)/(max-min));
  let g='<g class="grid">';
  const st=(max-min)%20===0&&(max-min)/20<=7?20:(max-min)/5;for(let t=min;t<=max+.01;t+=st){g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl-6}" y="${y(t)+4}" text-anchor="end">${Math.round(t)}%</text>`}
  g+='</g>';
  labels.forEach((l,i)=>{g+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle">${esc(l)}</text>`});
  refs.forEach(r=>{g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="#9a988f" stroke-dasharray="4 4"/><text x="${W-pr+6}" y="${y(r.v)+4}">${esc(r.label)}</text>`});
  series.forEach(s=>{
    let d='',pen=false;
    s.values.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?'L':'M')+x(i)+','+y(v);pen=true});
    if(series.length===1){const pts=s.values.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);if(pts.length>1){const gid='ga'+(++UI.fid);g+=`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".32"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><path d="M${pts[0][0]},${y(min)} ${pts.map(p=>'L'+p[0]+','+p[1]).join(' ')} L${pts[pts.length-1][0]},${y(min)} Z" fill="url(#${gid})"/>`}}
    g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v,i)=>{if(v!=null)g+=`<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`});
    const li=s.values.map((v,i)=>v!=null?i:-1).filter(i=>i>=0).pop();
    if(li!=null&&series.length===1)g+=`<text x="${x(li)+8}" y="${y(s.values[li])-8}" style="fill:var(--ink);font-weight:600">${s.values[li].toFixed(1)}%</text>`;
  });
  const cw=(W-pl-pr)/Math.max(1,labels.length-1);
  labels.forEach((l,i)=>{
    const tip=[l,...series.map(s=>`${s.name}: ${s.values[i]==null?'no data':s.values[i].toFixed(1)+'%'}`)].join('\n');
    g+=`<g class="col"><line class="xh" x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H-pb}"/><rect class="hit" x="${x(i)-cw/2}" y="${pt}" width="${cw}" height="${H-pt-pb}" data-tip="${esc(tip)}"/></g>`;
  });
  return legend(series)+`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s=>s.name).join(', '))} line chart">${g}</svg>`;
}
function barPath(x,y,w,h,r=4){if(h<=0.5)return '';r=Math.min(r,w/2,h);return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}
function barChart({labels,series,refs=[],h=230,maxY}){
  const W=680,H=h,pl=42,pr=70,pt=12,pb=26;
  const vals=series.flatMap(s=>s.values).filter(v=>v!=null);
  const max=maxY??niceMax(vals.length?Math.max(...vals):100);
  const y=v=>pt+(H-pt-pb)*(1-clamp(v,0,max)/max);
  const gw=(W-pl-pr)/labels.length,inner=Math.min(gw*.7,26*series.length+2*(series.length-1)),bw=(inner-2*(series.length-1))/series.length;
  let g='<g class="grid">';
  const st=max%20===0&&max/20<=7?20:max/5;for(let t=0;t<=max+.01;t+=st)g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl-6}" y="${y(t)+4}" text-anchor="end">${Math.round(t)}%</text>`;
  g+='</g>';
  labels.forEach((l,i)=>{
    const gx=pl+i*gw+(gw-inner)/2;
    g+=`<text x="${pl+i*gw+gw/2}" y="${H-6}" text-anchor="middle">${esc(l)}</text>`;
    series.forEach((s,j)=>{const v=s.values[i];if(v==null)return;const bx=gx+j*(bw+2);
      g+=`<path class="barhit" d="${barPath(bx,y(v),bw,y(0)-y(v))}" fill="${s.color}" data-tip="${esc(`${l} · ${s.name}\n${v.toFixed(1)}%`)}"/>`});
  });
  refs.forEach(r=>{g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="#7d7b74" stroke-dasharray="4 4"/><text x="${W-pr+6}" y="${y(r.v)+4}">${esc(r.label)}</text>`});
  g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(0)}" y2="${y(0)}" stroke="#cfccc4"/>`;
  return legend(series)+`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="bar chart">${g}</svg>`;
}
function legend(series){if(series.length<2)return '';return `<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`}
function spark(vals){
  const v=vals.map((x,i)=>[i,x]).filter(p=>p[1]!=null);if(v.length<2)return '<span class="muted small">—</span>';
  const W=84,H=24,lo=Math.min(50,...v.map(p=>p[1])),hi=Math.max(110,...v.map(p=>p[1]));
  const n=Math.max(...v.map(p=>p[0]))||1;const X=i=>2+i/n*(W-8),Y=x=>H-3-(x-lo)/(hi-lo)*(H-6);
  const last=v[v.length-1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${Y(100)}" y2="${Y(100)}" stroke="#d9d7d0" stroke-dasharray="2 2"/><polyline fill="none" stroke="var(--s1)" stroke-width="1.6" points="${v.map(p=>X(p[0])+','+Y(p[1])).join(' ')}"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="2.6" fill="var(--s1)"/></svg>`;
}
function ring(v){
  const b=band(v),r=48,c=2*Math.PI*r,f=v==null?0:clamp(v,0,100)/100;
  const col={good:'var(--good)',warning:'var(--warn)',serious:'var(--serious)',critical:'var(--crit)',none:'#c9c7c0'}[b.key];
  return `<svg class="ring" viewBox="0 0 118 118" role="img" aria-label="Score ${pct(v)}"><circle cx="59" cy="59" r="${r}" fill="none" stroke="#ecebe6" stroke-width="10"/><circle cx="59" cy="59" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c*f} ${c}" transform="rotate(-90 59 59)"/><text x="59" y="62" text-anchor="middle" style="font:600 22px 'IBM Plex Sans';fill:var(--ink)">${v==null?'—':v.toFixed(1)}</text><text x="59" y="80" text-anchor="middle" style="font:500 10px 'IBM Plex Sans';fill:var(--ink2)">SCORE / 100</text></svg>`;
}


/* ---------- i18n (draft translations, pending approval) ---------- */
const LANGS={en:'English',om:'Afaan Oromoo',am:'አማርኛ'};
const T={
om:{'Executive dashboard':'Daashboordii hoggansaa','AI assistant':'Gargaaraa AI','Department scorecards':'Kaardii qabxii kutaalee','KPI library':'Kuusaa KPI','Targets':'Galmoota','Performance reporting':'Gabaasa raawwii','Alerts & corrective actions':'Akeekkachiisaa fi tarkaanfii sirreeffamaa','Employee performance':'Raawwii hojjettootaa','Reports & evaluation':'Gabaasaa fi madaallii','Service desk':'Tajaajila maamiltootaa','Citizen portal':'Poortaalii lammiilee','Notifications':'Beeksisoota','Users & access control':"Fayyadamtootaa fi to'annoo seensaa",'Security':'Nageenya','Workflows & service rules':'Adeemsa hojii fi seera tajaajilaa','Backup & retention':'Kuusaa deeggarsaa fi turtii','Integrations & API':'Walitti hidhamiinsa fi API','Quality & testing':'Qulqullina fi qormaata','Audit trail':'Galmee odiitii','System settings':"Qindaa'ina sirnaa",'Performance':'Raawwii','Services':'Tajaajiloota','Administration':'Bulchiinsa','Performance scorecard':'Kaardii qabxii raawwii','Performance evaluation report':'Gabaasa madaallii raawwii','City performance overview':'Haala raawwii magaalaa','On track':'Karoora irra jira','Needs attention':'Xiyyeeffannaa barbaada','Underperforming':'Raawwiin gadi aanaa','Critical':"Baay'ee hamaa",'No data':'Daataan hin jiru','Draft':'Wixinee','Awaiting verification':'Mirkaneessa eeggachaa','Verified · awaiting approval':"Mirkanaa'eera · raggaasisa eeggachaa",'Approved':'Raggaasifameera','Returned':"Deebi'eera",'Overdue':'Yeroon darbeera','Not yet due':'Yeroon isaa hin geenye','Open for reporting':'Gabaasaaf banaa','Monthly':"Ji'aan",'Quarterly':'Kurmaanaan','Annual (YTD)':"Waggaan (hanga har'aa)",'Include unapproved (provisional)':'Kan hin raggaasifamin dabali','Mark all read':'Hunda akka dubbifametti mallatteessi','No notifications':'Beeksisni hin jiru','My profile':'Piroofaayilii koo','Change password':'Jecha icciitii jijjiiri','Sign out':"Ba'i",'Sign in':'Seeni','Username':'Maqaa fayyadamaa','Password':'Jecha icciitii','Verification code':'Koodii mirkaneessaa','Verify and sign in':'Mirkaneessiitii seeni','Back':'Duubatti','Dark mode':'Haala dukkanaa','Light mode':'Haala ifaa','Ask the AI assistant':'Gargaaraa AI gaafadhu','Open performance report':'Gabaasa raawwii bani','Export CSV':'CSV baasi','Search':'Barbaadi','Save':"Olkaa'i",'Cancel':'Haqi','Close':'Cufi','Department':'Kutaa','Status':'Haala','Previous':'Kan duraa','Next':'Kan itti aanu','Shaggar City Administration':'Bulchiinsa Magaalaa Shaggar','Office of the Mayor':'Waajjira Kantiibaa','Performance management':'Bulchiinsa raawwii','Language':'Afaan','System':'Sirna','KPIs & targets':'KPI fi galmoota','Settings':"Qindaa'ina",'Data & integrations':'Daataa fi walitti hidhamiinsa','Scorecards':'Kaardii qabxii','Reporting & approvals':'Gabaasaa fi raggaasisa','Alerts & actions':'Akeekkachiisaa fi tarkaanfii','Employees':'Hojjettoota','Reports':'Gabaasawwan','Users & access':'Fayyadamtootaa fi hayyama','Workflows':'Adeemsa hojii'},
am:{'Executive dashboard':'የአመራር ዳሽቦርድ','AI assistant':'የAI ረዳት','Department scorecards':'የመምሪያ የውጤት ካርዶች','KPI library':'የቁልፍ አፈጻጸም መለኪያዎች','Targets':'ዒላማዎች','Performance reporting':'የአፈጻጸም ሪፖርት','Alerts & corrective actions':'ማስጠንቀቂያዎች እና የማስተካከያ እርምጃዎች','Employee performance':'የሠራተኞች አፈጻጸም','Reports & evaluation':'ሪፖርቶች እና ግምገማ','Service desk':'የአገልግሎት ዴስክ','Citizen portal':'የነዋሪዎች መግቢያ','Notifications':'ማሳወቂያዎች','Users & access control':'ተጠቃሚዎች እና የመዳረሻ ቁጥጥር','Security':'ደህንነት','Workflows & service rules':'የሥራ ሂደቶች እና የአገልግሎት ደንቦች','Backup & retention':'ምትኬ እና የመረጃ ቆይታ','Integrations & API':'ውህደቶች እና API','Quality & testing':'ጥራት እና ሙከራ','Audit trail':'የኦዲት መዝገብ','System settings':'የሥርዓት ቅንብሮች','Performance':'አፈጻጸም','Services':'አገልግሎቶች','Administration':'አስተዳደር','Performance scorecard':'የአፈጻጸም የውጤት ካርድ','Performance evaluation report':'የአፈጻጸም ግምገማ ሪፖርት','City performance overview':'የከተማው አፈጻጸም አጠቃላይ እይታ','On track':'በዕቅዱ መሠረት','Needs attention':'ትኩረት ይፈልጋል','Underperforming':'ዝቅተኛ አፈጻጸም','Critical':'አሳሳቢ','No data':'መረጃ የለም','Draft':'ረቂቅ','Awaiting verification':'ማረጋገጫ በመጠባበቅ ላይ','Verified · awaiting approval':'ተረጋግጧል · ማጽደቅ በመጠባበቅ ላይ','Approved':'ጸድቋል','Returned':'ተመልሷል','Overdue':'ጊዜው አልፏል','Not yet due':'ጊዜው ገና ነው','Open for reporting':'ለሪፖርት ክፍት','Monthly':'ወርሃዊ','Quarterly':'የሩብ ዓመት','Annual (YTD)':'ዓመታዊ (እስካሁን)','Include unapproved (provisional)':'ያልጸደቁትን አካትት','Mark all read':'ሁሉንም እንደተነበበ ምልክት አድርግ','No notifications':'ምንም ማሳወቂያ የለም','My profile':'የእኔ መገለጫ','Change password':'የይለፍ ቃል ቀይር','Sign out':'ውጣ','Sign in':'ግባ','Username':'የተጠቃሚ ስም','Password':'የይለፍ ቃል','Verification code':'የማረጋገጫ ኮድ','Verify and sign in':'አረጋግጥና ግባ','Back':'ተመለስ','Dark mode':'ጨለማ ገጽታ','Light mode':'ብሩህ ገጽታ','Ask the AI assistant':'የAI ረዳቱን ይጠይቁ','Open performance report':'የአፈጻጸም ሪፖርት ክፈት','Export CSV':'CSV ላክ','Search':'ፈልግ','Save':'አስቀምጥ','Cancel':'ሰርዝ','Close':'ዝጋ','Department':'መምሪያ','Status':'ሁኔታ','Previous':'ቀዳሚ','Next':'ቀጣይ','Shaggar City Administration':'የሸገር ከተማ አስተዳደር','Office of the Mayor':'የከንቲባ ጽሕፈት ቤት','Performance management':'የአፈጻጸም አስተዳደር','Language':'ቋንቋ','System':'ሥርዓት','KPIs & targets':'መለኪያዎች እና ዒላማዎች','Settings':'ቅንብሮች','Data & integrations':'መረጃ እና ውህደቶች','Scorecards':'የውጤት ካርዶች','Reporting & approvals':'ሪፖርት እና ማጽደቅ','Alerts & actions':'ማስጠንቀቂያዎች እና እርምጃዎች','Employees':'ሠራተኞች','Reports':'ሪፖርቶች','Users & access':'ተጠቃሚዎች እና ፈቃዶች','Workflows':'የሥራ ሂደቶች'}
};
function lang(){return (S&&S.ui&&S.ui.lang)||'en'}
const B=()=>(S&&S.config&&S.config.branding)||(S&&S.pub&&S.pub.branding)||{orgName:'Shaggar City Administration',office:'Office of the Mayor',systemName:'KPI & Performance Management System',shortName:'Shaggar PMS',logo:null};
function t(s){const l=lang();return (l!=='en'&&T[l]&&T[l][s])||s}
function setLang(l){S.ui.lang=l;document.documentElement.lang=l;UI.menu=null;commit();if(me())api('PUT','/api/profile',{lang:l,phone:me().phone,email:me().email,prefSms:me().prefSms,prefEmail:me().prefEmail}).catch(()=>{})}


/* ---------- icons ---------- */
const ICONS={
 grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
 target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
 book:'<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/>',
 flag:'<path d="M5.5 21V4h11l-2 4.25 2 4.25h-11"/>',
 upload:'<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
 alert:'<path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.4 6.4 0 0 1 3.5 5.8"/>',
 file:'<path d="M6.5 3h8l4.5 4.5V21h-12.5z"/><path d="M14.5 3v4.5H19M9.5 13h6M9.5 17h6"/>',
 sparkle:'<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
 inbox:'<path d="M3.5 13.5 6.5 5h11l3 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5l1.2 2.2h4.6l1.2-2.2h5"/>',
 home:'<path d="M3.5 11 12 4l8.5 7v9h-17z"/><path d="M9.5 20v-5.5h5V20"/>',
 bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
 shield:'<path d="M12 3.5 19.5 6v6c0 4.6-3.2 7.6-7.5 8.5-4.3-.9-7.5-3.9-7.5-8.5V6z"/><path d="m9 12 2 2 4-4"/>',
 list:'<path d="M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 sliders:'<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
 database:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.75"/><path d="M4.5 5.5v13c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75v-13M4.5 12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75"/>',
 plug:'<path d="M9 2.5v5M15 2.5v5M6.5 7.5h11v3.5a5.5 5.5 0 0 1-11 0zM12 16.5v5"/>',
 check:'<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 lock:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
 moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 3.2 2.8 13.8 0 17M12 3.5c-2.8 3.2-2.8 13.8 0 17"/>',
 logout:'<path d="M14.5 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9.5"/>',
 user:'<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
 key:'<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16 7l2.5 2.5M14 9l1.8 1.8"/>',
 chevl:'<path d="m14.5 6-6 6 6 6"/>',chevr:'<path d="m9.5 6 6 6-6 6"/>',
 send:'<path d="M4.5 12 20 4.5 13.5 20l-2-6z"/>',
 download:'<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M4.5 20h15"/>',
 clip:'<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
 chat:'<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H11l-4.5 3.5v-3.5h-2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
 chevd:'<path d="m6 9.5 6 6 6-6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
};
function ico(n,s=18){return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`}
/* Odaa (sycamore) tree emblem — a symbol of assembly and good governance in Oromo culture */
function emblem(s=24,col='#fff'){return `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><g fill="${col}"><ellipse cx="16" cy="11" rx="12" ry="6.5"/><ellipse cx="9" cy="13.5" rx="5" ry="3.6"/><ellipse cx="23" cy="13.5" rx="5" ry="3.6"/><path d="M14.6 15h2.8l.6 10.5h-4z"/><path d="M8 27.5h16v1.5H8z"/></g></svg>`}
/** The organisation's uploaded logo, or the default Odaa-tree emblem. */
function brandMark(size=24){const b=B();return b.logo?`<img src="${esc(b.logo)}" alt="" width="${size+14}" height="${size+14}" style="object-fit:contain;border-radius:9px;display:block">`:emblem(size)}
function treeArt(){return `<svg class="tree" viewBox="0 0 400 360" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="2"><ellipse cx="200" cy="120" rx="170" ry="82"/><ellipse cx="200" cy="120" rx="128" ry="58"/><ellipse cx="200" cy="120" rx="84" ry="36"/><path d="M188 196 182 330M212 196 218 330M200 200v130M150 170c20 10 34 18 42 30M250 170c-20 10-34 18-42 30M90 345h220"/></g></svg>`}


