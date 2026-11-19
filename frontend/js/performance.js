/* =========================================================================
   performance.js — dashboard, scorecards, KPI library, targets, reporting
   workflow, alerts & corrective actions, employee indicators, reports.
   ========================================================================= */
/* ---------- views: dashboard ---------- */
function vDashboard(){
  const months=periodMonths(),ds=scopedDepts(),pp=prevPeriod();
  const rows=ds.map(d=>{const c=deptCalc(d.id,months);return {d,...c,prev:pp?deptCalc(d.id,periodMonths(pp)).score:lastYearDept(d.id,months),ly:lastYearDept(d.id,months)}}).sort((a,b)=>(b.score??-1)-(a.score??-1));
  const city=avg(rows.map(r=>r.score).filter(v=>v!=null));
  const allK=rows.flatMap(r=>r.rows);const measured=allK.filter(r=>r.ach!=null);const onTrack=measured.filter(r=>r.ach>=S.config.bands.good).length;
  const al=alerts();const crit=al.filter(a=>['critical','serious'].includes(a.sev)).length;
  const q=myQueue();
  const caps=S.caps.filter(c=>inScope(c.deptId)&&c.status!=='Completed').length;
  const cityTrend=MONTHS.map((_,m)=>m<S.config.currentMonth?cityIndex([m],ds):null);
  const title=ds.length===1?`${ds[0].name} — performance overview`:t('City performance overview');
  const u=me(),hr=new Date().getHours(),greet=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const first=u.name.replace(/\(.*\)/,'').trim().split(/\s+/)[0];
  const openCaps=S.caps.filter(c=>inScope(c.deptId)&&c.status!=='Completed');
  const qLabel=can('approve')?'reports to approve':can('verify')?'reports to verify':can('submit')?'reports to submit or correct':'nothing assigned to your role';
  const tile=(cls,href,lbl,val,sub,extra='')=>`<a class="tile ${cls}" href="#${href}"><div class="lbl">${lbl}<span class="go" aria-hidden="true">›</span></div><div class="val num">${val}</div>${extra||`<div class="sub">${sub}</div>`}</a>`;
  return `<div class="pagehead"><div><h1>${greet}, ${esc(first)}</h1><p>Here is how ${ds.length===1?esc(ds[0].name):'the city'} is performing in <b>${esc(periodLabel())}</b>, based on ${S.ui.provisional?'approved and provisional (unapproved)':'approved'} data.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap">${can('ai')?`<button class="btn" onclick="go('assistant')">${ico('sparkle',16)} ${t('Ask the AI assistant')}</button>`:''}${can('reports')?`<button class="btn" onclick="go('reports')">${t('Open performance report')}</button>`:''}${can('target_propose')&&ds.length?`<button class="btn pri" onclick="kpiPropForm()">${ico('plus',15)} Propose a new KPI</button>`:''}</div></div>
  <div class="tiles">
    ${tile('t-blue','scorecards',ds.length===1?'Department score':'City performance index',city==null?'—':city.toFixed(1),'',`<div class="trend">${trendTxt(city,avg(rows.map(r=>r.ly).filter(v=>v!=null)))}${tileSpark(cityTrend)}</div>`)}
    ${tile('t-green','scorecards',`KPIs on track`,`${onTrack}<span class="muted" style="font-size:16px"> / ${measured.length}</span>`,`at ${S.config.bands.good}% of target or above`)}
    ${tile(crit?'t-red':'t-amber','alerts','Alerts',al.length,`${crit} serious or critical`)}
    ${tile('t-navy','submissions','Waiting for me',q.length,qLabel)}
    ${tile('t-amber','alerts','Open action plans',openCaps.length,`across ${new Set(openCaps.map(c=>c.deptId)).size} department(s)`)}
  </div>
  ${perfHero(rows,city)}
  <div class="grid g32">
   <div class="card"><div class="cardhead"><h2>Department performance ranking</h2><span class="muted small">Δ vs ${pp?periodLabel(pp):'same period last year'}</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>#</th><th>Department</th><th class="num">Score</th><th style="width:22%">Achievement</th><th>Status</th><th class="num">Δ</th><th class="num">Reported</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr class="click" onclick="S.ui.dept='${r.d.id}';go('scorecards')"><td class="muted">${i+1}</td><td><b>${esc(r.d.short)}</b><div class="muted small">${esc(uname(r.d.headId))}</div></td><td class="num"><b>${r.score==null?'—':r.score.toFixed(1)}</b></td><td>${achBar(r.score)}</td><td>${chip(r.score)}</td><td class="num">${delta(r.score,r.prev)}</td><td class="num muted">${r.rep}/${r.due}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">Black tick on each bar marks 100% of target. Status bands: ✓ On track ≥${S.config.bands.good}% · ! Needs attention ≥${S.config.bands.warning}% · ▼ Underperforming ≥${S.config.bands.serious}% · ✕ Critical below.</p>
   </div>
   <div class="card"><div class="cardhead"><h2>Needs attention</h2><a href="#alerts" class="small">View all alerts (${al.length})</a></div>
     ${needsAttention(q,al,crit,openCaps)}
     <div class="narow"><span>Right now</span><span>${ds.length===1?esc(ds[0].short):'All departments'}</span></div>
     ${al.length?al.slice(0,5).map(alertRow).join(''):'<div class="empty"><b>Nothing needs attention right now</b><br>All departments are performing within the thresholds.</div>'}
   </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><div class="cardhead"><h2>Headline KPI per department</h2><span class="muted small">${esc(periodLabel())}</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Department</th><th>KPI</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Achievement</th></tr></thead><tbody>
    ${ds.map(d=>{const k=S.kpis.filter(x=>x.deptId===d.id&&x.active).sort((a,b)=>b.weight-a.weight)[0];if(!k)return '';const c=kpiCalc(k,months);return `<tr class="click" onclick="kpiDetail('${k.id}')"><td>${esc(d.short)}</td><td>${esc(k.name)}</td><td class="num">${fmtU(c.target,k.unit)}</td><td class="num">${fmtU(c.actual,k.unit)}</td><td class="num"><b>${pct(c.ach)}</b> <span class="chip c-${band(c.ach).key}" style="padding:0 6px"><i>${band(c.ach).icon}</i></span></td></tr>`}).join('')}
    </tbody></table></div></div>
   <div class="card"><div class="cardhead"><h2>${ds.length===1?'Department score':'City performance index'} by month</h2><span class="muted small">FY${esc(S.config.fy)}</span></div>
    ${lineChart({labels:MONTHS,series:[{name:ds.length===1?'Score':'City index',values:cityTrend,color:'var(--s1)'}],refs:[{v:S.config.bands.good,label:`On track ${S.config.bands.good}%`},{v:S.config.bands.warning,label:`Threshold ${S.config.bands.warning}%`}],minY:40,maxY:120})}
   </div>
  </div>`;
}
/* three counters at the top of the "Needs attention" card, chosen for the user's role */
function needsAttention(q,al,crit,openCaps){
  const mini=(n,lbl,href)=>`<a class="mini" href="#${href}"><b class="num">${n}</b><span>${lbl}</span><i aria-hidden="true">›</i></a>`;
  const items=[mini(q.length,can('approve')?'Reports to approve':can('verify')?'Reports to verify':'Reports to submit','submissions')];
  if(can('target_approve'))items.push(mini(tpToApprove().length+kpiToApprove().length,'KPIs and targets to approve','kpis'));
  else if(can('target_propose'))items.push(mini(tpReturned().length+kpiReturned().length,'KPIs and targets returned to you','kpis'));
  if(can('emp_eval')&&items.length<3)items.push(mini(sum(S.employees.map(empTodo)),'Employee items to review','employees'));
  items.push(mini(crit,'Serious alerts','alerts'));
  if(items.length<3)items.push(mini(openCaps.length,'Open action plans','alerts'));
  return `<div class="minis">${items.slice(0,3).join('')}</div>`;
}
function alertRow(a){
  const b={critical:['c-critical','✕','Critical'],serious:['c-serious','▼','Serious'],warning:['c-warning','!','Warning']}[a.sev]||['c-none','·','Info'];
  const cap=a.capId?S.caps.find(c=>c.id===a.capId):(a.type==='Underperforming department'||a.type==='KPI below threshold'||a.type.startsWith('Declining'))?openCapFor(a.deptId,a.kpiId):null;
  let act='';
  if(a.type==='Overdue submission'&&can('submit')&&inScope(a.deptId))act=`<button class="btn sm pri" onclick="openSub('${a.kpiId}',${a.m})">Submit now</button>`;
  else if(a.subId)act=`<button class="btn sm" onclick="subDetail('${a.subId}')">Open</button>`;
  else if(cap)act=`<button class="btn sm" onclick="capDetail('${cap.id}')">${esc(cap.ref)}</button>`;
  else if(['Underperforming department','KPI below threshold','Declining trend (early warning)'].includes(a.type)&&can('cap_manage')&&inScope(a.deptId))act=`<button class="btn sm pri" onclick="capFromAlert('${a.key}')">Create action plan</button>`;
  else if(['Underperforming department','KPI below threshold'].includes(a.type))act=`<span class="pill">No action plan yet</span>`;
  return `<div class="alert"><span class="chip ${b[0]}"><i>${b[1]}</i>${b[2]}</span><div class="body"><div class="t">${esc(a.type)} · ${esc(dept(a.deptId)?.short||'')}</div><div class="small ink2">${esc(a.text)}</div></div>${act}</div>`;
}

/* ---------- views: scorecards ---------- */
function vScorecards(){
  const ds=scopedDepts();if(!ds.length)return '<div class="empty">No departments in your scope.</div>';
  if(!ds.find(d=>d.id===S.ui.dept))S.ui.dept=ds[0].id;
  const d=dept(S.ui.dept),months=periodMonths(),pp=prevPeriod();
  const c=deptCalc(d.id,months),ly=lastYearDept(d.id,months),pv=pp?deptCalc(d.id,periodMonths(pp)).score:null;
  const trend=MONTHS.map((_,m)=>m<S.config.currentMonth?deptCalc(d.id,[m]).score:null);
  const qThis=[0,1,2,3].map(q=>q*3<S.config.currentMonth?deptCalc(d.id,[q*3,q*3+1,q*3+2]).score:null);
  const qLY=[0,1,2,3].map(q=>{const ks=S.kpis.filter(k=>k.deptId===d.id&&k.active);const xs=ks.filter(k=>S.prev[k.id]&&S.prev[k.id][q]).map(k=>({k,a:achv(k,S.prev[k.id][q].a,S.prev[k.id][q].t)}));const W=sum(xs.map(x=>x.k.weight));return W?sum(xs.map(x=>x.k.weight*Math.min(x.a,S.config.cap)))/W:null});
  const objs=S.objectives.filter(o=>c.rows.some(r=>r.k.objectiveId===o.id));
  if(c.rows.some(r=>!S.objectives.some(o=>o.id===r.k.objectiveId)))objs.push({id:null,title:'Other KPIs'});
  const caps=S.caps.filter(x=>x.deptId===d.id);
  const emps=S.employees.filter(e=>e.deptId===d.id);
  const W=sum(c.rows.map(r=>r.k.weight));
  return `<div class="pagehead"><div><h1>${t('Performance scorecard')}</h1><p>Weighted scorecard grouped by strategic objective. Score = Σ(KPI weight × achievement, capped at ${S.config.cap}%) ÷ Σ(weights of KPIs with approved data).</p></div>
   <div class="ctx" style="display:flex;gap:8px">${ds.length>1?`<select onchange="S.ui.dept=this.value;commit()">${ds.map(x=>`<option value="${x.id}" ${x.id===d.id?'selected':''}>${esc(x.short)}</option>`).join('')}</select>`:''}</div></div>
  <div class="card"><div class="score-hero">${ring(c.score)}
    <div style="flex:1;min-width:240px"><h2>${esc(d.name)}</h2><div style="margin:6px 0 10px">${chip(c.score)}</div>
     <dl class="kv"><dt>Department head</dt><dd>${esc(uname(d.headId))}</dd><dt>Period</dt><dd>${esc(periodLabel())}</dd><dt>Data coverage</dt><dd>${c.rep} of ${c.due} due reports approved${S.ui.provisional?' or provisional':''}</dd></dl></div>
    <div class="tiles" style="flex:1;min-width:300px;margin:0;grid-template-columns:1fr 1fr">
      <div class="tile"><div class="lbl">vs ${pp?esc(periodLabel(pp)):'previous period'}</div><div class="val num" style="font-size:20px">${delta(c.score,pv)}</div><div class="sub">${pv==null?'no comparable data':'was '+pct(pv)}</div></div>
      <div class="tile"><div class="lbl">vs same period last year</div><div class="val num" style="font-size:20px">${delta(c.score,ly)}</div><div class="sub">${ly==null?'no data':'was '+pct(ly)}</div></div>
    </div></div></div>
  ${W!==100?`<div class="notice" style="margin-top:12px">KPI weights for this department total ${W}%. They should total 100% — adjust in the KPI library.</div>`:''}
  <div class="card"><div class="cardhead"><h2>KPI scorecard</h2><span class="muted small">Click a KPI for definition, monthly data and evidence</span></div>
   <div class="tblwrap"><table class="tbl"><thead><tr><th>KPI</th><th class="num">Weight</th><th class="num">Target</th><th class="num">Actual</th><th style="width:130px">Achievement</th><th class="num">Ach. %</th><th class="num">Weighted</th><th>Status</th><th>Monthly trend</th><th class="num">Last yr</th></tr></thead><tbody>
   ${objs.map(o=>{const rs=c.rows.filter(r=>o.id===null?!S.objectives.some(x=>x.id===r.k.objectiveId):r.k.objectiveId===o.id);return `<tr class="grp"><td colspan="10">${o.id===null?'':esc(o.id)+' · '}${esc(o.title)}</td></tr>`+rs.map(r=>`<tr class="click" onclick="kpiDetail('${r.k.id}')"><td><b>${esc(r.k.code)}</b> ${esc(r.k.name)}<div class="muted small">${r.k.dir==='lower'?'Lower is better · ':''}${r.k.freq} · ${r.rep}/${r.due} reported</div></td><td class="num">${r.k.weight}%</td><td class="num">${fmtU(r.target,r.k.unit)}</td><td class="num">${fmtU(r.actual,r.k.unit)}</td><td>${achBar(r.ach)}</td><td class="num"><b>${pct(r.ach)}</b></td><td class="num">${r.ach==null?'—':(r.k.weight*Math.min(r.ach,S.config.cap)/100).toFixed(1)}</td><td>${chip(r.ach)}</td><td>${spark(monthlyAch(r.k))}</td><td class="num muted">${pct(lastYearKpi(r.k,months))}</td></tr>`).join('')}).join('')}
   <tr><td><b>Department score</b></td><td class="num"><b>${W}%</b></td><td colspan="3"></td><td class="num"><b>${pct(c.score)}</b></td><td></td><td>${chip(c.score)}</td><td colspan="2"></td></tr>
   </tbody></table></div></div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><div class="cardhead"><h2>Monthly score</h2></div>${barChart({labels:MONTHS,series:[{name:'Score',values:trend,color:'var(--s1)'}],refs:[{v:100,label:'Target 100%'},{v:S.config.bands.warning,label:`Threshold ${S.config.bands.warning}%`}],maxY:120})}</div>
   <div class="card"><div class="cardhead"><h2>This year vs last year, by quarter</h2></div>${barChart({labels:['Q1','Q2','Q3','Q4'],series:[{name:`FY${S.config.fy}`,values:qThis,color:'var(--s1)'},{name:'Previous FY',values:qLY,color:'var(--s2)'}],refs:[{v:100,label:'Target 100%'}],maxY:120})}<p class="small muted" style="margin:6px 0 0">Q2 FY${esc(S.config.fy)} is in progress and reflects reported months only.</p></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><div class="cardhead"><h2>Corrective action plans</h2>${can('cap_manage')&&inScope(d.id)?`<button class="btn sm pri" onclick="capForm(null,'${d.id}','','')">New plan</button>`:''}</div>
    ${caps.length?`<table class="tbl"><tbody>${caps.map(x=>`<tr class="click" onclick="capDetail('${x.id}')"><td><b>${esc(x.ref)}</b><div class="small">${esc(x.title)}</div></td><td>${capChip(x)}</td><td class="num">${capProgress(x)}%</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No corrective action plans.</div>'}</div>
   <div class="card"><div class="cardhead"><h2>Employee indicators</h2>${(can('emp_eval')||can('all_depts'))?`<a href="#employees" class="small">Open</a>`:''}</div>
    <table class="tbl"><tbody>${emps.map(e=>{const s=empScore(e);return `<tr><td><b>${esc(e.name)}</b><div class="muted small">${esc(e.position)}</div></td><td>${achBar(s)}</td><td class="num">${pct(s)}</td><td>${e.evaluation?`<span class="pill">${esc(e.evaluation.rating)}</span>`:'<span class="muted small">Not evaluated</span>'}</td></tr>`}).join('')}</tbody></table></div>
  </div>`;
}

/* ---------- KPI detail ---------- */
/* the description of a KPI as short paragraphs: older KPIs have a separate formula and data source */
const kpiMeasure=k=>[k.definition,k.formula&&k.formula!==k.definition?'Calculated as: '+k.formula:'',k.source?'Evidence: '+k.source:''].filter(x=>x&&String(x).trim());
function kpiDetail(id){
  const k=kpi(id),d=dept(k.deptId),o=S.objectives.find(x=>x.id===k.objectiveId);
  const rows=[...Array(12).keys()].filter(m=>due(k,m));
  const ach=monthlyAch(k);
  const body=`<div class="grid g2"><div><dl class="kv">
    <dt>Department</dt><dd>${esc(d.name)}</dd>
    <dt>Unit</dt><dd>${esc(k.unit)}</dd><dt>Better when</dt><dd>${k.dir==='higher'?'Higher':'Lower'}</dd>
    <dt>Reported</dt><dd>${k.freq==='monthly'?'Every month':'Every quarter'}</dd><dt>Weight</dt><dd>${k.weight}%</dd>
    <dt>Annual target</dt><dd><b>${fmt(k.annual,k.unit)}</b> ${k.approval==='approved'?tpChip(targetState(k)):kpChip(k.approval)}</dd>
    ${k.baseline!=null?`<dt>Last year</dt><dd>${fmt(k.baseline,k.unit)}</dd>`:''}${o?`<dt>Strategic objective</dt><dd>${esc(o.id+' · '+o.title)}</dd>`:''}${k.ownerId?`<dt>KPI officer</dt><dd>${esc(uname(k.ownerId))}</dd>`:''}
    <dt>Evidence with reports</dt><dd>${k.evidenceRequired?'Required':'Not required'}</dd></dl></div>
   <div><h4>How it is measured</h4>${kpiMeasure(k).map(x=>`<p style="margin:4px 0 10px">${esc(x)}</p>`).join('')||'<p class="muted">Not described.</p>'}
   <p class="small muted">Achievement = ${k.dir==='higher'?'actual ÷ target × 100':'target ÷ actual × 100 (lower is better)'}</p></div></div>
   <h3 style="margin:16px 0 8px">Monthly reporting</h3>
   <div class="tblwrap"><table class="tbl"><thead><tr><th>Period</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Achievement</th><th>Status</th><th>Workflow</th></tr></thead><tbody>
   ${rows.map(m=>{const s=subFor(k.id,m),st=cellState(k,m);return `<tr ${s?`class="click" onclick="subDetail('${s.id}')"`:''}><td>${MONTHS[m]} ${MONTH_YEAR(m)}</td><td class="num">${fmtU(k.targets[m],k.unit)}</td><td class="num">${s?fmtU(s.actual,k.unit):'—'}</td><td class="num">${s?pct(achv(k,s.actual,k.targets[m])):'—'}</td><td>${s?chip(achv(k,s.actual,k.targets[m])):''}</td><td>${subChip(st)}</td></tr>`}).join('')}
   </tbody></table></div>
   <div style="margin-top:14px">${lineChart({labels:MONTHS,series:[{name:'Achievement',values:ach,color:'var(--s1)'}],refs:[{v:100,label:'Target'},{v:S.config.bands.warning,label:`${S.config.bands.warning}%`}],minY:40,maxY:130,h:200})}</div>`;
  const openTp=tpOpen(k.id);
  openModal(`${k.code} · ${k.name}`,body,`${can('kpi_manage')&&k.approval==='approved'?`<button class="btn" onclick="kpiForm('${k.id}')">Edit KPI (administrator)</button>`:''}${k.approval==='approved'&&canProposeFor(k)?`<button class="btn" onclick="tpForm('${k.id}')">${openTp?'Edit target change':'Change targets'}</button>`:''}<button class="btn pri" onclick="closeModal()">Close</button>`,true);
}

/* ---------- views: KPIs & targets (one page) ----------
   What each department is measured on and how much it has committed to.
   Departments propose; the Mayor's Office approves; approved targets are locked. */
const qTarget=(k,q)=>aggr(k,[q*3,q*3+1,q*3+2].filter(m=>due(k,m)).map(m=>k.targets[m]));
function vKpis(){
  const ds=scopedDepts();const f=ds.some(d=>d.id===UI.flt.kdept)?UI.flt.kdept:'';
  const canProp=can('target_propose')&&ds.length>0;
  const list=S.kpis.filter(k=>inScope(k.deptId)&&k.approval==='approved'&&k.active&&(!f||k.deptId===f));
  const shown=ds.filter(d=>!f||d.id===f);
  return `<div class="pagehead"><div><h1>${t('KPIs & targets')}</h1><p>What each department is measured on, and how much it has committed to achieve. The department proposes, the Mayor's Office approves, and approved targets are locked.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap">${ds.length>1?`<select aria-label="Department" onchange="UI.flt.kdept=this.value;render()"><option value="">All departments</option>${ds.map(d=>`<option value="${d.id}" ${f===d.id?'selected':''}>${esc(d.short)}</option>`).join('')}</select>`:''}${canProp?`<button class="btn pri" onclick="kpiPropForm('','${f}')">${ico('plus',15)} Propose a new KPI</button>`:''}</div></div>
  ${proposalsCard()}
  <div class="card"><div class="cardhead"><h2>Approved KPIs</h2><span class="muted small">FY${esc(S.config.fy)} · click a KPI for its monthly targets and results</span></div>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>KPI</th><th class="num">Weight</th><th class="num">Annual target</th>${[0,1,2,3].map(q=>`<th class="num qcol">Q${q+1}</th>`).join('')}<th>Targets</th><th></th></tr></thead><tbody>
  ${shown.map(d=>{const ks=list.filter(k=>k.deptId===d.id);const W=sum(ks.map(k=>k.weight));
    return `<tr class="grp"><td colspan="9">${esc(d.name)} <span style="float:right" class="${W===100||!ks.length?'':'chip c-warning'}">${!ks.length?'':W===100?'Weights: 100%':`<i>!</i>Weights total ${W}% (should be 100%)`}</span></td></tr>`+
    (ks.length?ks.map(k=>{const st=targetState(k),p=tpOpen(k.id),mine=canProposeFor(k);
      return `<tr class="click" onclick="kpiDetail('${k.id}')"><td><b>${esc(k.name)}</b><div class="muted small"><span class="mono">${esc(k.code)}</span> · ${esc(k.unit)}${k.dir==='lower'?' · lower is better':''}</div></td><td class="num">${k.weight}%</td><td class="num"><b>${fmt(k.annual,k.unit)}</b></td>${[0,1,2,3].map(q=>`<td class="num qcol">${fmt(qTarget(k,q),k.unit)}</td>`).join('')}<td>${tpChip(st)}</td>
       <td class="right" style="white-space:nowrap" onclick="event.stopPropagation()">${p?(mine?`<button class="btn sm ${p.status==='returned'?'pri':''}" onclick="tpForm('${k.id}')">Edit change</button>`:`<button class="btn sm" onclick="tpDetail('${p.id}')">View change</button>`):mine?`<button class="btn sm" onclick="tpForm('${k.id}')">Change targets</button>`:''}</td></tr>`}).join('')
     :`<tr><td colspan="9"><div class="empty" style="padding:18px"><b>No approved KPIs yet.</b> ${can('target_propose')&&inScope(d.id)?`<button class="btn sm pri" style="margin-left:8px" onclick="kpiPropForm('','${d.id}')">Propose the first KPI</button>`:'The department head proposes them here.'}</div></td></tr>`)}).join('')}
  </tbody></table></div></div>
  ${can('kpi_manage')?`<p class="small muted" style="margin:14px 2px 0">Administrator tools: <a href="#" onclick="objForm();return false">Strategic objectives</a> · <a href="#" onclick="kpiForm();return false">Add a KPI directly, without approval</a></p>`:''}`;
}
/* everything waiting for a decision, in one list: new KPIs and changes to approved targets */
function proposalsCard(){
  const appr=can('target_approve');
  const items=[...kpiProps().map(k=>({kind:'kpi',k,status:k.approval,annual:k.annual,by:k.proposedBy,at:k.createdAt,id:k.id})),
    ...tpList().filter(p=>['pending','returned'].includes(p.status)&&kpi(p.kpiId)&&inScope(kpi(p.kpiId).deptId)).map(p=>({kind:'tp',k:kpi(p.kpiId),status:p.status==='pending'?'proposed':'returned',annual:p.annual,by:p.proposedBy,at:p.proposedAt,id:p.id}))];
  if(!items.length)return '';
  const rank=x=>(x.status==='proposed')===appr?0:1; // approvers see what awaits them first; departments see what was returned first
  return `<div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>${appr?'Waiting for your decision':'Sent for approval'}</h2><span class="pill">${items.length}</span></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Proposal</th><th>Department</th><th class="num">Proposed annual target</th><th>Proposed by</th><th>Status</th><th></th></tr></thead><tbody>
  ${items.sort((a,b)=>rank(a)-rank(b)).map(x=>{const mine=canProposeFor(x.k),rev=appr&&x.status==='proposed'&&x.by!==me().id;
    const view=x.kind==='kpi'?`kpiPropDetail('${x.id}')`:`tpDetail('${x.id}')`,edit=x.kind==='kpi'?`kpiPropForm('${x.id}')`:`tpForm('${x.k.id}')`;
    return `<tr class="click" onclick="${view}"><td><b>${esc(x.k.name)}</b><div class="muted small">${x.kind==='kpi'?'New KPI':'Change to approved targets'}${x.kind==='tp'?` · now ${fmt(x.k.annual,x.k.unit)}`:''}</div></td><td>${esc(dept(x.k.deptId).short)}</td><td class="num"><b>${fmt(x.annual,x.k.unit)}</b></td><td>${esc(uname(x.by))}<div class="muted small">${dshort(x.at)}</div></td><td>${kpChip(x.status)}</td>
     <td class="right" style="white-space:nowrap" onclick="event.stopPropagation()">${rev?`<button class="btn sm pri" onclick="${view}">Review</button>`:''}${mine&&!rev?`<button class="btn sm ${x.status==='returned'?'pri':''}" onclick="${edit}">Edit</button>`:''}${!rev&&!mine?`<button class="btn sm" onclick="${view}">View</button>`:''}</td></tr>`}).join('')}</tbody></table></div>
   ${!appr&&can('target_propose')?'<p class="small muted" style="margin:10px 0 0">You can edit or withdraw a proposal until the Mayor\'s Office decides on it.</p>':''}</div>`;
}
/* ---------- KPI proposals ----------
   A department proposes a KPI with its targets; the Mayor's Office approves or
   returns it. Until approval the KPI is inactive and outside every score. */
const KPST={proposed:['c-info','↑','Awaiting approval'],returned:['c-warning','↩','Returned for revision'],approved:['c-good','✓','Approved']};
const kpChip=st=>{const c=KPST[st]||KPST.proposed;return `<span class="chip ${c[0]}"><i>${c[1]}</i>${t(c[2])}</span>`};
const kpiProps=()=>S.kpis.filter(k=>k.approval!=='approved'&&inScope(k.deptId));
const kpiToApprove=()=>can('target_approve')?kpiProps().filter(k=>k.approval==='proposed'&&k.proposedBy!==me().id):[];
const kpiReturned=()=>can('target_propose')?kpiProps().filter(k=>k.approval==='returned'):[];
const deptWeight=did=>sum(S.kpis.filter(k=>k.deptId===did&&k.active).map(k=>k.weight));
/* proposal form (department): six questions; the rest is optional */
const kpAvgUnit=u=>/%|percent|rate|days?|hours?|minutes?|score|ratio|average/i.test(u||'');
function kpiPropForm(id,deptId){
  const ds=scopedDepts();
  const k=id?kpi(id):{deptId:deptId&&inScope(deptId)?deptId:(ds.length===1?ds[0].id:(inScope(S.ui.dept)?S.ui.dept:ds[0].id)),name:'',objectiveId:'',unit:'',dir:'higher',freq:'monthly',agg:'',weight:'',annual:'',definition:'',baseline:'',evidenceRequired:true,targets:Array(12).fill(null)};
  const measure=id?kpiMeasure(k).join(' '):'';
  const even=id?distribute(k,k.annual):[];const custom=!!id&&k.targets.some((v,m)=>v!=null&&even[m]!=null&&Math.abs(v-even[m])>1e-9);
  const more=!!id&&(k.freq!=='monthly'||custom||!!k.objectiveId||k.baseline!=null||!k.evidenceRequired);
  const body=`<form id="kpf" class="fg" onsubmit="return saveKpiProp(event,'${id||''}')">
   ${id&&k.approval==='returned'?`<div class="full notice"><b>Returned by ${esc(uname(k.decidedBy))}:</b> ${esc(k.decisionComment)}</div>`:''}
   ${id||ds.length===1?`<input type="hidden" name="deptId" value="${k.deptId}">`:`<div class="full"><label class="f">Department</label><select name="deptId" onchange="kpWeight()">${ds.map(d=>`<option value="${d.id}" ${d.id===k.deptId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>`}
   <div class="full"><label class="f">1 · What will you measure?</label><input name="name" required maxlength="120" value="${esc(k.name)}" placeholder="e.g. Property tax collected"></div>
   <div class="full"><label class="f">2 · How is it measured?</label><textarea name="measure" required style="min-height:64px" placeholder="What is counted, and which record proves it. e.g. Property tax paid into the city account each month, taken from the treasury bank statement.">${esc(measure)}</textarea></div>
   <div><label class="f">3 · Unit</label><input name="unit" required maxlength="20" value="${esc(k.unit)}" placeholder="ETB M, %, days, households…" list="kp_units" oninput="kpSync()"><datalist id="kp_units">${['ETB M','%','days','households','licences','jobs','km','cases'].map(u=>`<option value="${u}">`).join('')}</datalist></div>
   <div><label class="f">4 · A good result is</label><select name="dir"><option value="higher" ${k.dir==='higher'?'selected':''}>Higher (more is better)</option><option value="lower" ${k.dir==='lower'?'selected':''}>Lower (less is better)</option></select></div>
   <div><label class="f">5 · Target for the year</label><input name="annual" id="kp_annual" type="number" step="any" min="0" required value="${k.annual}" oninput="kpSync()"><div class="muted small" id="kp_split"></div></div>
   <div><label class="f">6 · Weight in the department score (%)</label><input name="weight" type="number" min="1" max="100" step="1" required value="${k.weight}" oninput="kpWeight()"><div class="muted small" id="kp_w"></div></div>
   <div class="full"><details id="kp_more" ${more?'open':''} ontoggle="kpSync()"><summary>More options (not required)</summary>
    <div class="fg" style="margin-top:12px">
     <div><label class="f">Reported</label><select name="freq" onchange="kpSync()"><option value="monthly" ${k.freq==='monthly'?'selected':''}>Every month</option><option value="quarterly" ${k.freq==='quarterly'?'selected':''}>Every quarter</option></select></div>
     <div><label class="f">Over the year, results are</label><select name="agg" onchange="this.dataset.touched=1;kpSync()" ${id?'data-touched="1"':''}><option value="sum" ${k.agg==='sum'?'selected':''}>Added up (amounts, counts)</option><option value="avg" ${k.agg==='avg'?'selected':''}>Averaged (%, days, rates)</option></select></div>
     <div><label class="f">Last year's result</label><input name="baseline" type="number" step="any" value="${k.baseline??''}"></div>
     <div><label class="f">Evidence with each report</label><select name="evidenceRequired"><option value="1" ${k.evidenceRequired?'selected':''}>Required</option><option value="0" ${!k.evidenceRequired?'selected':''}>Not required</option></select></div>
     ${S.objectives.length?`<div class="full"><label class="f">City goal it supports</label><select name="objectiveId"><option value="">— Not set —</option>${S.objectives.map(o=>`<option value="${o.id}" ${o.id===k.objectiveId?'selected':''}>${esc(o.title)}</option>`).join('')}</select></div>`:''}
     <div class="full"><label class="toggle"><input type="checkbox" id="kp_custom" ${custom?'checked':''} onchange="kpSync()"> Set a different target for each period (otherwise the yearly target is shared equally)</label>
      <div class="tpgrid" id="kp_grid" style="margin-top:10px">${MONTHS.map((m,i)=>`<div><label class="f">${m} ${MONTH_YEAR(i)}</label><input type="number" step="any" min="0" id="kp_m${i}" value="${custom?(k.targets[i]??''):''}"></div>`).join('')}</div></div>
    </div></details></div>
   <div class="full small muted">This goes to the Mayor's Office. The KPI starts counting once it is approved, and you can edit or withdraw it until then.</div>
  </form>`;
  openModal(id?'Edit the proposed KPI':'Propose a new KPI',body,`<button class="btn" onclick="closeModal()">Cancel</button>${id?`<button class="btn bad" onclick="kpiPropWithdraw('${id}')">Withdraw</button>`:''}<button class="btn pri" form="kpf">${id&&k.approval==='proposed'?'Save changes':'Send for approval'}</button>`);
  kpSync();kpWeight();
}
const kpDue=(freq,m)=>freq==='monthly'||m%3===2;
function kpSync(){const f=$('#kpf');if(!f)return;
  if(!f.agg.dataset.touched)f.agg.value=kpAvgUnit(f.unit.value)?'avg':'sum';
  const fr=f.freq.value,avg=f.agg.value==='avg',custom=$('#kp_custom').checked,unit=f.unit.value.trim(),a=f.annual.value===''?null:+f.annual.value;
  $('#kp_grid').style.display=custom?'':'none';
  MONTHS.forEach((_,m)=>{const el=$('#kp_m'+m),on=kpDue(fr,m);el.parentElement.style.display=on?'':'none';el.required=custom&&on;if(custom&&on&&el.value===''&&a!=null){const ev=distribute({freq:fr,agg:f.agg.value,unit},a);el.value=ev[m]}});
  const n=fr==='monthly'?12:4,per=fr==='monthly'?'month':'quarter';
  $('#kp_split').textContent=a==null?'':custom?'You are setting each period yourself.':avg?`The same target applies every ${per}.`:`Shared equally: ${fmt(roundU(a/n,unit),unit)} each ${per}.`}
function kpWeight(){const f=$('#kpf');if(!f)return;const did=f.deptId.value,w=+f.weight.value||0;const cur=deptWeight(did),tot=cur+w;
  $('#kp_w').innerHTML=`How much this KPI counts. Your approved KPIs use ${cur}%${w?`; with this one <b class="${tot===100?'up':''}">${tot}%</b>`:''}${w&&tot!==100?' (aim for 100% in total)':''}.`}
function saveKpiProp(e,id){e.preventDefault();const f=e.target;const o=Object.fromEntries(new FormData(f).entries());
  ['weight','annual'].forEach(x=>o[x]=+o[x]);o.baseline=o.baseline===''||o.baseline==null?null:+o.baseline;o.evidenceRequired=o.evidenceRequired!=='0';
  const custom=$('#kp_custom').checked;
  o.targets=custom?MONTHS.map((_,m)=>kpDue(o.freq,m)?$('#kp_m'+m).value:null):null;
  if(custom&&o.agg==='sum'){const t=sum(o.targets.filter(v=>v!=null&&v!=='').map(Number));if(Math.abs(t-o.annual)>Math.max(0.5,Math.abs(o.annual)*0.005)){toast(`The periods add up to ${fmt(t,o.unit)}, but the target for the year is ${fmt(o.annual,o.unit)}. Make them match.`);return false}}
  act(id?'PUT':'POST',id?`/api/kpi-proposals/${id}`:'/api/kpi-proposals',o,r=>id&&kpi(id)?.approval==='proposed'?'Proposal updated':"Sent to the Mayor's Office for approval");return false}
function kpiPropWithdraw(id){act('DELETE',`/api/kpi-proposals/${id}`,{},'Proposal withdrawn')}
/* proposal review (Mayor's Office) and read-only view */
function kpiPropDetail(id){
  const k=kpi(id);if(!k)return;const mine=k.proposedBy===me().id,review=k.approval==='proposed'&&can('target_approve')&&inScope(k.deptId)&&!mine;
  const cur=deptWeight(k.deptId),tot=cur+k.weight;const ms=MONTHS.map((_,m)=>m).filter(m=>kpDue(k.freq,m));
  const row=(l,v)=>`<tr><td class="muted" style="width:210px">${l}</td><td>${v}</td></tr>`;
  const body=`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><h3>${esc(k.name)}</h3><div class="muted small">${esc(dept(k.deptId).name)} · proposed by ${esc(uname(k.proposedBy))} on ${dshort(k.createdAt)} · code ${esc(k.code)}</div></div><div>${kpChip(k.approval)}</div></div>
   ${k.approval==='returned'?`<div class="notice" style="margin-bottom:12px"><b>Returned by ${esc(uname(k.decidedBy))}:</b> ${esc(k.decisionComment)}</div>`:''}
   <div class="grid g2"><div><h4 style="margin-bottom:6px">The KPI</h4><table class="tbl"><tbody>
    ${row('How it is measured',kpiMeasure(k).map(esc).join('<br>')||'—')}
    ${row('Unit',esc(k.unit))}${row('A good result is',k.dir==='higher'?'Higher':'Lower')}${row('Reported',`${k.freq==='monthly'?'Every month':'Every quarter'} · ${k.agg==='sum'?'added up over the year':'averaged over the year'}`)}
    ${row('Weight',`<b>${k.weight}%</b> <span class="muted small">— department total after approval: <span class="${tot===100?'up':'down'}">${tot}%</span>${tot===100?'':' (should be 100%)'}</span>`)}
    ${row('Evidence',k.evidenceRequired?'Required with each report':'Not required')}${k.baseline==null?'':row('Last year',fmt(k.baseline,k.unit))}${k.objectiveId&&S.objectives.find(o=>o.id===k.objectiveId)?row('City goal',esc(S.objectives.find(o=>o.id===k.objectiveId).title)):''}
   </tbody></table></div>
   <div><h4 style="margin-bottom:6px">Proposed targets</h4><table class="tbl"><thead><tr><th>Period</th><th class="num">Target</th></tr></thead><tbody><tr><td><b>${k.agg==='sum'?'Annual total':'Annual level'}</b></td><td class="num"><b>${fmt(k.annual,k.unit)}</b></td></tr>${ms.map(m=>`<tr><td>${MONTHS[m]} ${MONTH_YEAR(m)}</td><td class="num">${fmt(k.targets[m],k.unit)}</td></tr>`).join('')}</tbody></table></div></div>
   ${review?`<div style="margin-top:14px"><label class="f">Comment (required when returning)</label><textarea id="kp_comment" placeholder="Your decision note. If you return the proposal, say what should change: the definition, the weight, the targets…"></textarea></div>`:''}
   ${k.approval==='proposed'&&mine&&can('target_approve')?'<p class="small muted" style="margin:12px 0 0">You proposed this KPI, so another authorised person must approve it.</p>':''}`;
  openModal('Proposed KPI',body,`<button class="btn" onclick="closeModal()">Close</button>${canProposeFor(k)&&!review?`<button class="btn bad" onclick="kpiPropWithdraw('${k.id}')">Withdraw</button><button class="btn pri" onclick="kpiPropForm('${k.id}')">Edit</button>`:''}${review?`<button class="btn bad" onclick="kpiPropDecide('${k.id}','return')">Return for revision</button><button class="btn ok" onclick="kpiPropDecide('${k.id}','approve')">Approve KPI and targets</button>`:''}`,true);
}
function kpiPropDecide(id,action){const comment=($('#kp_comment')?.value||'').trim();if(action==='return'&&comment.length<5){toast('Write a short reason before returning the proposal.');$('#kp_comment')?.focus();return}
  act('POST',`/api/kpi-proposals/${id}/decision`,{action,comment},action==='approve'?'KPI approved and active; targets locked':'Returned to the department')}

function kpiForm(id){
  const k=id?kpi(id):{code:'',deptId:scope()[0],name:'',objectiveId:S.objectives[0]?.id,unit:'',dir:'higher',freq:'monthly',agg:'sum',weight:0,annual:0,definition:'',formula:'',source:'',baseline:0,evidenceRequired:S.config.workflow.evidenceDefault,ownerId:'',active:true};
  const officers=S.users.filter(u=>u.role==='kpi_officer'||u.role==='dept_head');
  const body=`<form id="kf" class="fg" onsubmit="return saveKpi(event,'${id||''}')">
   <div><label class="f">KPI code</label><input name="code" required value="${esc(k.code)}" placeholder="e.g. REV-04"></div>
   <div><label class="f">Department</label><select name="deptId">${S.depts.map(d=>`<option value="${d.id}" ${d.id===k.deptId?'selected':''}>${esc(d.short)}</option>`).join('')}</select></div>
   <div class="full"><label class="f">KPI name</label><input name="name" required value="${esc(k.name)}"></div>
   <div class="full"><label class="f">Strategic objective</label><select name="objectiveId">${S.objectives.map(o=>`<option value="${o.id}" ${o.id===k.objectiveId?'selected':''}>${esc(o.id)} · ${esc(o.title)}</option>`).join('')}</select></div>
   <div class="full"><label class="f">Definition</label><textarea name="definition" required>${esc(k.definition||'')}</textarea></div>
   <div class="full"><label class="f">Measurement formula</label><input name="formula" value="${esc(k.formula||'')}" placeholder="e.g. Licences renewed before expiry ÷ licences due × 100"></div>
   <div class="full"><label class="f">Data source / means of verification</label><input name="source" value="${esc(k.source)}"></div>
   <div><label class="f">Unit</label><input name="unit" required value="${esc(k.unit)}" placeholder="ETB M, %, days, count…"></div>
   <div><label class="f">Direction</label><select name="dir"><option value="higher" ${k.dir==='higher'?'selected':''}>Higher is better</option><option value="lower" ${k.dir==='lower'?'selected':''}>Lower is better</option></select></div>
   <div><label class="f">Reporting frequency</label><select name="freq"><option value="monthly" ${k.freq==='monthly'?'selected':''}>Monthly</option><option value="quarterly" ${k.freq==='quarterly'?'selected':''}>Quarterly</option></select></div>
   <div><label class="f">Aggregation over periods</label><select name="agg"><option value="sum" ${k.agg==='sum'?'selected':''}>Sum (cumulative counts/amounts)</option><option value="avg" ${k.agg==='avg'?'selected':''}>Average (rates, %, days)</option></select></div>
   <div><label class="f">Weight in department scorecard (%)</label><input name="weight" type="number" min="0" max="100" step="1" required value="${k.weight}"></div>
   <div><label class="f">Annual target</label><input name="annual" type="number" step="any" required value="${k.annual}"></div>
   <div><label class="f">Baseline (previous FY)</label><input name="baseline" type="number" step="any" value="${k.baseline}"></div>
   <div><label class="f">KPI officer / owner</label><select name="ownerId">${officers.map(u=>`<option value="${u.id}" ${u.id===k.ownerId?'selected':''}>${esc(u.name)} — ${ROLES[u.role]}</option>`).join('')}</select></div>
   <div><label class="f">Evidence required</label><select name="evidenceRequired"><option value="1" ${k.evidenceRequired?'selected':''}>Yes — submissions must attach evidence</option><option value="0" ${!k.evidenceRequired?'selected':''}>No</option></select></div>
   <div><label class="f">Status</label><select name="active"><option value="1" ${k.active?'selected':''}>Active</option><option value="0" ${!k.active?'selected':''}>Inactive</option></select></div>
   ${id?'<div class="full small muted">Changing the annual target here does not overwrite monthly targets. Use the Targets screen to redistribute.</div>':'<div class="full small muted">Monthly/quarterly targets are generated by distributing the annual target evenly; refine them on the Targets screen.</div>'}
  </form>`;
  openModal(id?`Edit KPI ${k.code}`:'Define a new KPI',body,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" form="kf">Save KPI</button>`,true);
}
function saveKpi(e,id){
  e.preventDefault();const o=Object.fromEntries(new FormData(e.target).entries());
  ['weight','annual','baseline'].forEach(x=>o[x]=o[x]===''?null:+o[x]);o.evidenceRequired=o.evidenceRequired==='1';o.active=o.active==='1';
  act(id?'PUT':'POST',id?`/api/kpis/${id}`:'/api/kpis',o,'KPI saved');return false;
}
function objForm(){
  const body=`<form id="of" onsubmit="return saveObj(event)"><table class="tbl"><thead><tr><th>Code</th><th>Strategic objective</th></tr></thead><tbody>
  ${S.objectives.map((o,i)=>`<tr><td class="mono">${esc(o.id)}</td><td><input name="o${i}" value="${esc(o.title)}" style="width:100%"></td></tr>`).join('')}
  <tr><td><input name="newid" placeholder="SO6" style="width:70px"></td><td><input name="newtitle" placeholder="Add a new objective…" style="width:100%"></td></tr></tbody></table></form>`;
  openModal('Strategic objectives',body,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" form="of">Save</button>`);
}
function saveObj(e){e.preventDefault();const f=new FormData(e.target);
  const list=S.objectives.map((o,i)=>({id:o.id,title:f.get('o'+i)||o.title}));
  if(f.get('newid')&&f.get('newtitle'))list.push({id:f.get('newid').trim(),title:f.get('newtitle').trim()});
  act('PUT','/api/objectives',{objectives:list},'Objectives saved');return false}
/* ---------- changes to approved targets ----------
   Departments propose their targets; the Mayor's Office approves or returns
   them. Approved targets are locked and change only through a revision request. */
const TPST={pending:['c-info','↑','Awaiting approval'],approved:['c-good','✓','Approved · locked'],returned:['c-warning','↩','Returned for revision'],none:['c-none','○','Not yet approved']};
const tpList=()=>S.targetProposals||[];
const tpOpen=kid=>tpList().find(p=>p.kpiId===kid&&['pending','returned'].includes(p.status));
const targetState=k=>{const p=tpOpen(k.id);return p?p.status:(k.targetsApprovedAt?'approved':'none')};
const tpChip=st=>{const c=TPST[st]||TPST.none;return `<span class="chip ${c[0]}"><i>${c[1]}</i>${t(c[2])}</span>`};
const canProposeFor=k=>can('target_propose')&&inScope(k.deptId);
const tpToApprove=()=>can('target_approve')?tpList().filter(p=>p.status==='pending'&&p.proposedBy!==me().id&&kpi(p.kpiId)&&inScope(kpi(p.kpiId).deptId)):[];
const tpReturned=()=>can('target_propose')?tpList().filter(p=>p.status==='returned'&&kpi(p.kpiId)&&inScope(kpi(p.kpiId).deptId)):[];
/* proposal form (department) */
function tpForm(kid){
  const k=kpi(kid),p=tpOpen(kid),locked=!!k.targetsApprovedAt;
  const vals=p?p.targets:k.targets,annual=p?p.annual:k.annual;
  const body=`<form id="tpf" onsubmit="return saveTp(event,'${kid}')">
   <div style="margin-bottom:12px"><h3>${esc(k.code)} · ${esc(k.name)}</h3><div class="muted small">${esc(dept(k.deptId).name)} · ${esc(k.unit)} · ${k.freq} reporting · ${k.agg==='sum'?'monthly figures add up to the annual target':'each period carries the same rate'}</div></div>
   ${p&&p.status==='returned'?`<div class="notice" style="margin-bottom:12px"><b>Returned by ${esc(uname(p.decidedBy))}:</b> ${esc(p.comment)}</div>`:''}
   ${locked&&!(p&&p.status==='returned')?`<div class="notice" style="margin-bottom:12px">These targets are approved and locked. Your change goes to the Mayor's Office, and the current targets stay in force until it is approved.</div>`:''}
   <div class="fg"><div><label class="f">Annual target (${esc(k.unit)})</label><input type="number" step="any" min="0" id="tp_annual" required value="${annual}"></div>
   <div><label class="f">Current annual target</label><div class="num" style="font-size:16px;padding:7px 0">${fmt(k.annual,k.unit)}</div></div>
   <div style="align-self:end"><button type="button" class="btn" onclick="tpSpread('${kid}')">Distribute evenly</button></div></div>
   <h4 style="margin:16px 0 8px">Targets by reporting period</h4>
   <div class="tpgrid">${MONTHS.map((m,i)=>due(k,i)?`<div><label class="f">${m} ${MONTH_YEAR(i)}</label><input type="number" step="any" min="0" id="tp_m${i}" required value="${vals[i]??''}"><div class="muted small">now ${fmt(k.targets[i],k.unit)}</div></div>`:'').join('')}</div>
   <div style="margin-top:14px"><label class="f">${locked?'Why should the targets change? (required)':'Note for the Mayor\'s Office (optional)'}</label><textarea id="tp_reason" ${locked?'required minlength="10"':''} placeholder="${locked?'What changed since the targets were approved?':'For example: the plan, baseline or study the figures are based on'}">${esc(p?p.reason:'')}</textarea></div></form>`;
  openModal(p?'Edit the target change':'Change the targets',body,`<button class="btn" onclick="closeModal()">Cancel</button>${p?`<button class="btn bad" onclick="tpWithdraw('${p.id}')">Withdraw</button>`:''}<button class="btn pri" form="tpf">${p&&p.status==='pending'?'Save changes':'Send for approval'}</button>`,true);
}
function tpSpread(kid){const k=kpi(kid);const a=+$('#tp_annual').value;if(!(a>=0)){toast('Enter the annual target first.');return}distribute(k,a).forEach((v,m)=>{const el=$('#tp_m'+m);if(el&&v!=null)el.value=v})}
function saveTp(e,kid){e.preventDefault();const k=kpi(kid);
  act('POST','/api/target-proposals',{kpiId:kid,annual:$('#tp_annual').value,targets:MONTHS.map((_,m)=>due(k,m)?$('#tp_m'+m).value:null),reason:$('#tp_reason').value.trim()},"Sent to the Mayor's Office for approval");return false}
function tpWithdraw(id){act('POST',`/api/target-proposals/${id}/withdraw`,{},'Proposal withdrawn')}
/* proposal review (Mayor's Office) */
function tpDetail(id){
  const p=tpList().find(x=>x.id===id);if(!p)return;const k=kpi(p.kpiId);
  const mine=p.proposedBy===me().id,review=p.status==='pending'&&can('target_approve')&&inScope(k.deptId)&&!mine;
  const ms=MONTHS.map((_,m)=>m).filter(m=>due(k,m));
  const body=`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><h3>${esc(k.code)} · ${esc(k.name)}</h3><div class="muted small">${esc(dept(k.deptId).name)} · proposed by ${esc(uname(p.proposedBy))} on ${dt(p.proposedAt)}</div></div><div>${tpChip(p.status)}${p.isRevision?' <span class="pill">Revision of approved targets</span>':''}</div></div>
   ${p.reason?`<div class="small" style="margin-bottom:12px"><b>${p.isRevision?'Reason for the revision':'Basis'}:</b> ${esc(p.reason)}</div>`:''}
   ${p.status!=='pending'&&p.comment?`<div class="notice" style="margin-bottom:12px"><b>${p.status==='approved'?'Approved':'Returned'} by ${esc(uname(p.decidedBy))}:</b> ${esc(p.comment)}</div>`:''}
   <div class="tblwrap"><table class="tbl"><thead><tr><th>Period</th><th class="num">${p.status==='approved'?'Before':'Current target'}</th><th class="num">Proposed</th><th class="num">Change</th></tr></thead><tbody>
   ${p.status==='approved'?`<tr><td colspan="4" class="muted small">This proposal was approved; the proposed figures are now the targets in force.</td></tr>`:''}
   <tr><td><b>Annual</b></td><td class="num">${p.status==='approved'?'—':fmt(k.annual,k.unit)}</td><td class="num"><b>${fmt(p.annual,k.unit)}</b></td><td class="num">${p.status==='approved'?'':tpDelta(k.annual,p.annual)}</td></tr>
   ${ms.map(m=>`<tr><td>${MONTHS[m]} ${MONTH_YEAR(m)}</td><td class="num">${p.status==='approved'?'—':fmt(k.targets[m],k.unit)}</td><td class="num">${fmt(p.targets[m],k.unit)}</td><td class="num">${p.status==='approved'?'':tpDelta(k.targets[m],p.targets[m])}</td></tr>`).join('')}
   </tbody></table></div>
   ${review?`<div style="margin-top:14px"><label class="f">Comment (required when returning)</label><textarea id="tp_comment" placeholder="Your decision note. If you return the proposal, say what should change."></textarea></div>`:''}
   ${p.status==='pending'&&mine&&can('target_approve')?'<p class="small muted" style="margin:12px 0 0">You proposed these targets, so another authorised person must approve them.</p>':''}`;
  openModal('Proposed targets',body,`<button class="btn" onclick="closeModal()">Close</button>${['pending','returned'].includes(p.status)&&canProposeFor(k)&&!review?`<button class="btn bad" onclick="tpWithdraw('${p.id}')">Withdraw</button><button class="btn pri" onclick="tpForm('${k.id}')">Edit</button>`:''}${review?`<button class="btn bad" onclick="tpDecide('${p.id}','return')">Return for revision</button><button class="btn ok" onclick="tpDecide('${p.id}','approve')">Approve and lock</button>`:''}`,true);
}
function tpDelta(a,b){if(a==null||b==null||!a)return '<span class="muted">—</span>';const d=(b-a)/a*100;if(Math.abs(d)<0.05)return '<span class="muted">no change</span>';return `<span class="${d>0?'up':'down'}">${d>0?'▲':'▼'} ${Math.abs(d).toFixed(1)}%</span>`}
function tpDecide(id,action){const comment=($('#tp_comment')?.value||'').trim();if(action==='return'&&comment.length<5){toast('Write a short reason before returning the proposal.');$('#tp_comment')?.focus();return}
  act('POST',`/api/target-proposals/${id}/decision`,{action,comment},action==='approve'?'Targets approved and locked':'Returned to the department')}
/* ---------- views: submissions ---------- */
function myQueue(){
  const u=me();if(!u)return [];
  return S.subs.filter(s=>{const k=kpi(s.kpiId);if(!k||!inScope(k.deptId))return false;
    if(can('approve')&&s.status==='verified')return true;
    if(can('verify')&&s.status==='submitted'&&u.deptId===k.deptId)return true;
    if(can('submit')&&['returned','draft'].includes(s.status))return true;
    return false;});
}
function vSubmissions(){
  const tab=UI.tab.sub||'matrix';const ds=scopedDepts();const f=UI.flt.sdept||'';
  const ks=S.kpis.filter(k=>k.active&&inScope(k.deptId)&&(!f||k.deptId===f));
  const months=[...Array(Math.min(12,S.config.currentMonth+1)).keys()];
  const q=myQueue();
  const st=UI.flt.sst||'';
  const subs=S.subs.filter(s=>{const k=kpi(s.kpiId);return k&&inScope(k.deptId)&&(!f||k.deptId===f)&&(!st||s.status===st)}).sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
  return `<div class="pagehead"><div><h1>${t('Reporting & approvals')}</h1><p>Evidence-based submissions flow through three steps: <b>KPI Officer submits</b>, then the <b>Department Head verifies</b>, then the <b>Mayor's Office approves</b> (steps are configurable under Workflows). Only approved figures count in official scores. The same person cannot verify and approve their own work.</p></div></div>
  <div class="tabs">${[['matrix','Reporting calendar'],['queue',`Awaiting my action (${q.length})`],['all','All submissions']].map(([t,l])=>`<button class="${tab===t?'on':''}" onclick="UI.tab.sub='${t}';render()">${l}</button>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${ds.length>1?`<select onchange="UI.flt.sdept=this.value;render()"><option value="">All departments</option>${ds.map(d=>`<option value="${d.id}" ${f===d.id?'selected':''}>${esc(d.short)}</option>`).join('')}</select>`:''}
   ${tab==='queue'&&can('approve')&&q.filter(s=>s.status==='verified').length?`<button class="btn ok" onclick="bulkApprove()">Approve all verified (${q.filter(s=>s.status==='verified').length})</button>`:''}</div>
  ${tab==='matrix'?`<div class="card"><div class="tblwrap"><table class="tbl mx"><thead><tr><th>KPI</th>${months.map(m=>`<th>${MONTHS[m]} ${m===S.config.currentMonth?'<span class="pill">current</span>':''}</th>`).join('')}</tr></thead><tbody>
    ${ds.filter(d=>!f||d.id===f).map(d=>`<tr class="grp"><td colspan="${months.length+1}">${esc(d.name)}</td></tr>`+ks.filter(k=>k.deptId===d.id).map(k=>`<tr><td><b>${esc(k.code)}</b> <span class="small">${esc(k.name)}</span></td>${months.map(m=>{const c=cellState(k,m);if(!c)return '<td class="muted">·</td>';return `<td><span class="cell" onclick="openSub('${k.id}',${m})">${subChip(c)}</span></td>`}).join('')}</tr>`).join('')).join('')}
   </tbody></table></div><p class="small muted" style="margin:10px 0 0">Click a cell to open, submit or act on a report. Reports are due by day ${S.config.deadlineDay} of the following month.</p></div>`
  :subTable(tab==='queue'?q.filter(s=>!f||kpi(s.kpiId).deptId===f):subs,tab==='queue'?'subq':'suball')}`;
}
function subTable(list,id){
  return `<div class="card">${dataTable(id,{rows:list,pageSize:10,exportName:'performance-submissions',
    search:s=>{const k=kpi(s.kpiId);return [k.code,k.name,dept(k.deptId).short,uname(s.submittedBy),s.status,MONTHS[s.m]].join(' ')},
    filters:[{key:'status',label:'Status',opts:['draft','submitted','verified','approved','returned'].map(x=>[x,SUBST[x][2]]),get:s=>s.status},
             {key:'dept',label:'Department',opts:scopedDepts().map(d=>[d.id,d.short]),get:s=>kpi(s.kpiId).deptId}],
    onRow:s=>`subDetail('${s.id}')`,
    cols:[
     {h:'KPI',td:s=>{const k=kpi(s.kpiId);return `<b>${esc(k.code)}</b> <span class="small">${esc(k.name)}</span><div class="muted small">${esc(dept(k.deptId).short)}</div>`},csv:s=>kpi(s.kpiId).code+' '+kpi(s.kpiId).name,sort:s=>kpi(s.kpiId).code},
     {h:'Period',td:s=>`${MONTHS[s.m]} ${MONTH_YEAR(s.m)}`,csv:s=>`${MONTHS[s.m]} ${MONTH_YEAR(s.m)}`,sort:s=>s.m},
     {h:'Target',cls:'num',td:s=>fmtU(kpi(s.kpiId).targets[s.m],kpi(s.kpiId).unit),csv:s=>kpi(s.kpiId).targets[s.m]},
     {h:'Actual',cls:'num',td:s=>fmtU(s.actual,kpi(s.kpiId).unit),csv:s=>s.actual},
     {h:'Achievement',cls:'num',td:s=>pct(achv(kpi(s.kpiId),s.actual,kpi(s.kpiId).targets[s.m])),csv:s=>(achv(kpi(s.kpiId),s.actual,kpi(s.kpiId).targets[s.m])||0).toFixed(1),sort:s=>achv(kpi(s.kpiId),s.actual,kpi(s.kpiId).targets[s.m])},
     {h:'Evidence',td:s=>s.evidence.length?`${ico('clip',14)} ${s.evidence.length}`:'<span class="chip c-warning"><i>!</i>None</span>',csv:s=>s.evidence.length},
     {h:'Status',td:s=>subChip(s.status),csv:s=>SUBST[s.status][2],sort:s=>s.status},
     {h:'Submitted by',td:s=>esc(uname(s.submittedBy)),csv:s=>uname(s.submittedBy)},
     {h:'Last update',td:s=>{const l=s.history[s.history.length-1];return `<span class="small">${l?dt(l.at):'—'}</span>`},csv:s=>{const l=s.history[s.history.length-1];return l?l.at:''},sort:s=>{const l=s.history[s.history.length-1];return l?l.at:''}},
    ]})}</div>`;
}
function openSub(kid,m){
  const s=subFor(kid,m);const k=kpi(kid);
  if(s&&!(['draft','returned'].includes(s.status)&&can('submit')&&inScope(k.deptId)))return subDetail(s.id);
  if(s)return subForm(kid,m);
  if(m>=S.config.currentMonth){toast('This period is not yet open for reporting.');return}
  if(can('submit')&&inScope(k.deptId))return subForm(kid,m);
  subMissing(kid,m);
}
/* who may nudge a report forward: the Mayor's Office for any step it waits on, a head for their own officers */
function canRemind(k,status){
  if(!inScope(k.deptId))return false;
  if(status==='submitted')return can('approve');
  if(['missing','draft','returned'].includes(status))return can('approve')||(can('verify')&&me().deptId===k.deptId);
  return false;
}
function subRemind(kid,m){act('POST','/api/reports/remind',{kpiId:kid,month:m},r=>`Reminder sent to ${r.sent} ${r.sent===1?'person':'people'}`)}
/* a period with nothing submitted yet: say where it stands and who has to act */
function subMissing(kid,m){
  const k=kpi(kid),d=dept(k.deptId),c=cellState(k,m),late=c==='missing';
  const officers=S.users.filter(x=>x.active&&x.role==='kpi_officer'&&x.deptId===k.deptId).map(x=>x.name);
  const body=`<h3>${esc(k.code)} · ${esc(k.name)}</h3><div class="muted small" style="margin-bottom:12px">${esc(d.name)} · ${MONTHS[m]} ${MONTH_YEAR(m)}</div>
   <div class="notice"><b>${late?'Overdue — no report submitted.':'No report submitted yet.'}</b> The report was due by day ${S.config.deadlineDay} of the following month. ${officers.length?`The KPI officer${officers.length>1?'s':''} (${esc(officers.join(', '))}) submit${officers.length>1?'':'s'} it`:'A KPI officer submits it'}, then ${esc(uname(d.headId))} verifies it, then the Mayor's Office approves it.</div>
   <dl class="kv" style="margin-top:12px"><dt>Target</dt><dd class="num">${fmtU(k.targets[m],k.unit)}</dd><dt>Status</dt><dd>${subChip(c)}</dd></dl>`;
  openModal('Performance report',body,`<button class="btn" onclick="closeModal()">Close</button>${canRemind(k,'missing')?`<button class="btn pri" onclick="subRemind('${k.id}',${m})">${ico('bell',15)} Remind the department</button>`:''}`);
}
/* one line saying where a report stands and who acts next */
function subStage(s,k){
  const d=dept(k.deptId),last=a=>[...s.history].reverse().find(h=>h.action.startsWith(a));
  if(s.status==='draft')return ['c-none',`Draft — not yet submitted. ${esc(uname(s.submittedBy))} still has to submit it with evidence.`];
  if(s.status==='submitted')return ['c-info',`<b>Step 2 of 3 — waiting for verification by ${esc(uname(d.headId))}</b>, head of ${esc(d.short)}, since ${dt(s.submittedAt)}. The Mayor's Office can approve it once the head has verified it.`];
  if(s.status==='verified')return ['c-brand',`<b>Step 3 of 3 — waiting for the Mayor's Office.</b> Verified by ${esc(uname(s.verifiedBy))} on ${dt(s.verifiedAt)}.`];
  if(s.status==='returned'){const r=last('returned');return ['c-critical',`<b>Returned for correction</b>${r?` by ${esc(sysName(r.by))} on ${dt(r.at)}`:''}${r&&r.comment?`: “${esc(r.comment)}”`:'.'} ${esc(uname(s.submittedBy))} corrects and resubmits it; it then goes back to the department head for verification.`]}
  if(s.status==='approved')return ['c-good',`<b>Approved</b> by ${esc(sysName(s.approvedBy))} on ${dt(s.approvedAt)}. It counts in the official scores.`];
  return ['c-none',''];
}
let pendingFiles=[];
function subForm(kid,m){
  const k=kpi(kid),s=subFor(kid,m);
  pendingFiles=s?s.evidence.slice():[];newFiles=[];
  const t=k.targets[m];
  const body=`<form id="sf" onsubmit="return saveSub(event,'${kid}',${m})">
   <div class="grid g2" style="margin-bottom:14px"><div><h3>${esc(k.code)} · ${esc(k.name)}</h3><div class="muted small">${esc(dept(k.deptId).name)} · ${MONTHS[m]} ${MONTH_YEAR(m)}</div></div>
   <div class="small"><b>How it is measured:</b> ${esc(kpiMeasure(k).join(' '))}</div></div>
   ${s&&s.status==='returned'?`<div class="notice" style="margin-bottom:12px"><b>Returned:</b> ${esc([...s.history].reverse().find(h=>h.action==='returned')?.comment||'')}</div>`:''}
   <div class="fg">
    <div><label class="f">Target for the period</label><div class="num" style="font-size:18px;padding:6px 0">${fmt(t,k.unit)}</div></div>
    <div><label class="f">Actual achieved (${esc(k.unit)})</label><input name="actual" id="sfa" type="number" step="any" required value="${s?s.actual:''}" oninput="previewAch('${kid}',${m})"></div>
    <div><label class="f">Calculated achievement</label><div id="sfp" style="padding:6px 0">${s?pct(achv(k,s.actual,t))+' '+chip(achv(k,s.actual,t)):'<span class="muted">enter actual</span>'}</div></div>
    <div class="full"><label class="f">Evidence ${k.evidenceRequired?'(required)':''}</label><input type="file" multiple onchange="addFiles(this)"><div id="evl" style="margin-top:6px">${evList()}</div><div class="small muted">Attach source reports, registers, system extracts or photos. Files up to 10 MB each (PDF, images, Office documents, CSV or ZIP). They are stored on the server with a SHA-256 fingerprint.</div></div>
    <div class="full"><label class="f">Narrative / variance explanation <span id="sfn" class="muted"></span></label><textarea name="note" id="sfnote">${esc(s?s.note:'')}</textarea></div>
   </div></form>`;
  openModal(s?'Edit submission':'New performance submission',body,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn" form="sf" value="draft">Save draft</button><button class="btn pri" form="sf" value="submit">Submit for verification</button>`,true);
  previewAch(kid,m);
}
function evList(){return [...pendingFiles.map((f,i)=>`<div class="small">📎 ${esc(f.name)} <span class="muted">(${Math.round(f.size/1024)} KB)</span> <a href="#" onclick="pendingFiles.splice(${i},1);$('#evl').innerHTML=evList();return false">remove</a></div>`),...newFiles.map((f,i)=>`<div class="small">📎 ${esc(f.name)} <span class="muted">(${Math.round(f.size/1024)} KB · new)</span> <a href="#" onclick="newFiles.splice(${i},1);$('#evl').innerHTML=evList();return false">remove</a></div>`)].join('')||'<span class="small muted">No files attached</span>'}
let newFiles=[];
function addFiles(inp){for(const f of inp.files){if(f.size>10*1024*1024){toast(`${f.name} is larger than 10 MB.`);continue}newFiles.push(f)}inp.value='';$('#evl').innerHTML=evList()}
function previewAch(kid,m){const k=kpi(kid);const v=$('#sfa')?.value;if(v===''||v==null)return;const a=achv(k,+v,k.targets[m]);$('#sfp').innerHTML=`<b class="num">${pct(a)}</b> ${chip(a)}`;$('#sfn').textContent=a<S.config.varianceNote?`— required (achievement below ${S.config.varianceNote}%)`:''}
async function saveSub(e,kid,m){
  e.preventDefault();const mode=e.submitter?.value||'submit';
  const btns=[...document.querySelectorAll('#modal footer button')];btns.forEach(b=>b.disabled=true);
  try{
    const files=await Promise.all(newFiles.map(async f=>({name:f.name,type:f.type,data:await fileToBase64(f)})));
    const r=await act('POST','/api/submissions',{kpiId:kid,month:m,actual:$('#sfa').value,note:$('#sfnote').value.trim(),mode,keepEvidence:pendingFiles.map(f=>f.id),files},r=>r.status==='draft'||r.status==='returned'?'Draft saved':r.status==='submitted'?'Submitted for department head verification':'Submitted');
    if(r)newFiles=[];
  }finally{btns.forEach(b=>b.disabled=false)}
  return false;
}
function subDetail(id){
  const s=S.subs.find(x=>x.id===id),k=kpi(s.kpiId),t=k.targets[s.m],a=achv(k,s.actual,t),u=me();
  const canV=can('verify')&&s.status==='submitted'&&u.deptId===k.deptId;
  const canA=can('approve')&&s.status==='verified'&&inScope(k.deptId);
  const canR=can('approve')&&s.status==='submitted'&&inScope(k.deptId)&&!canV; // the Mayor's Office can send it back before verification, but not approve it
  const canN=canRemind(k,s.status);
  const canE=can('submit')&&inScope(k.deptId)&&['draft','returned'].includes(s.status);
  const sod=S.config.workflow.sod; const sodV=sod&&canV&&s.submittedBy===u.id, sodA=sod&&(canA||canR)&&(s.verifiedBy===u.id||s.submittedBy===u.id);
  const [stCls,stTxt]=subStage(s,k);
  const prevS=subFor(k.id,s.m-(k.freq==='monthly'?1:3));
  const body=`<div class="notice substage ${stCls}" style="margin-bottom:14px">${stTxt}</div><div class="grid g2"><div><h3>${esc(k.code)} · ${esc(k.name)}</h3><div class="muted small" style="margin-bottom:10px">${esc(dept(k.deptId).name)} · ${MONTHS[s.m]} ${MONTH_YEAR(s.m)}</div>
    <dl class="kv"><dt>Target</dt><dd class="num">${fmtU(t,k.unit)}</dd><dt>Actual</dt><dd class="num"><b>${fmtU(s.actual,k.unit)}</b></dd><dt>Achievement</dt><dd><b class="num">${pct(a)}</b> ${chip(a)}</dd>
    <dt>Previous period</dt><dd class="num">${prevS?`${fmtU(prevS.actual,k.unit)} (${pct(achv(k,prevS.actual,k.targets[prevS.m]))})`:'—'}</dd><dt>Status</dt><dd>${subChip(s.status)}</dd><dt>Formula</dt><dd class="small">${esc(k.formula)}</dd></dl>
    <h4 style="margin-top:14px">Narrative</h4><p style="margin:4px 0">${esc(s.note)||'<span class="muted">—</span>'}</p>
    <h4 style="margin-top:14px">Evidence</h4>${s.evidence.length?s.evidence.map(f=>`<div class="small">📎 ${f.hasFile?`<a href="#" onclick="downloadUrl('/api/evidence/${f.id}','${esc(f.name)}');return false">${esc(f.name)}</a>`:esc(f.name)} <span class="muted">(${Math.round(f.size/1024)} KB${f.hasFile?'':' · details only'})</span></div>`).join(''):'<div class="chip c-warning"><i>!</i>No evidence attached</div>'}</div>
   <div><h4 style="margin-bottom:8px">Approval workflow</h4><ul class="tl">${s.history.map(h=>`<li><b>${esc(h.action[0].toUpperCase()+h.action.slice(1))}</b> by ${esc(sysName(h.by))} <span class="muted small">${h.by?'('+ROLES[user(h.by)?.role]+')':''}</span><div class="muted small">${dt(h.at)}</div>${h.comment?`<div class="small" style="margin-top:2px">“${esc(h.comment)}”</div>`:''}</li>`).join('')}</ul>
    ${(canV||canA||canR)?`<label class="f" style="margin-top:10px">Comment ${'(required when returning)'}</label><textarea id="actc"></textarea>`:''}
    ${sodV||sodA?`<div class="notice" style="margin-top:8px">Segregation of duties: you ${sodV?'submitted':'already acted on'} this record, so another authorised user must ${sodV?'verify':'approve'} it.</div>`:''}</div></div>`;
  let ft='';
  if(canE)ft+=`<button class="btn pri" onclick="subForm('${k.id}',${s.m})">${s.status==='returned'?'Correct & resubmit':'Edit draft'}</button>`;
  if(canV)ft+=`<button class="btn bad" onclick="subAct('${s.id}','return')" ${sodV?'disabled':''}>Return for correction</button><button class="btn ok" onclick="subAct('${s.id}','verify')" ${sodV?'disabled':''}>Verify</button>`;
  if(canA)ft+=`<button class="btn bad" onclick="subAct('${s.id}','return')" ${sodA?'disabled':''}>Return</button><button class="btn ok" onclick="subAct('${s.id}','approve')" ${sodA?'disabled':''}>Approve</button>`;
  if(canN)ft+=`<button class="btn" onclick="subRemind('${k.id}',${s.m})">${ico('bell',15)} ${s.status==='submitted'?'Remind the department head':'Remind the department'}</button>`;
  if(canR)ft+=`<button class="btn bad" onclick="subAct('${s.id}','return')" ${sodA?'disabled':''}>Return to the department</button><button class="btn ok" disabled title="Approval opens once the department head has verified the report">Approve (after verification)</button>`;
  openModal('Performance submission',body,`<button class="btn" onclick="closeModal()">Close</button>${ft}`,true);
}
function subAct(id,action){
  const comment=($('#actc')?.value||'').trim();
  if(action==='return'&&comment.length<5){toast('Give a reason when returning a report.');return}
  act('POST',`/api/submissions/${id}/action`,{action,comment},r=>r.status==='returned'?'Returned to the submitter':r.status==='verified'?"Verified — sent to the Mayor's Office":'Approved — now counts in official performance');
}
function bulkApprove(){act('POST','/api/submissions/bulk-approve',{},r=>`${r.approved} submission(s) approved`)}
/* ---------- views: alerts & CAPs ---------- */
const capProgress=c=>c.actions.length?Math.round(c.actions.filter(a=>a.done).length/c.actions.length*100):0;
function capChip(c){const m={'Open':['c-info','○'],'In progress':['c-warning','◐'],'Completed':['c-good','✓']}[c.status]||['c-none','·'];return `<span class="chip ${m[0]}"><i>${m[1]}</i>${c.status}</span>`}
function vAlerts(){
  const al=alerts();const tab=UI.tab.al||'alerts';
  const caps=S.caps.filter(c=>inScope(c.deptId));
  return `<div class="pagehead"><div><h1>${t('Alerts & actions')}</h1><p>Alerts are generated automatically from approved data: underperforming departments and KPIs (below ${S.config.bands.warning}%), three-period declining trends, overdue or returned submissions, and overdue corrective actions. Each underperformance alert should be answered with a corrective action plan.</p></div>
   ${can('cap_manage')?`<button class="btn pri" onclick="capForm(null,'${scope()[0]}','','')">+ Corrective action plan</button>`:''}</div>
  <div class="tabs">${[['alerts',`Active alerts (${al.length})`],['caps',`Corrective action plans (${caps.length})`]].map(([t,l])=>`<button class="${tab===t?'on':''}" onclick="UI.tab.al='${t}';render()">${l}</button>`).join('')}</div>
  ${tab==='alerts'?`<div class="card">${al.length?al.map(alertRow).join(''):'<div class="empty">No active alerts for this period.</div>'}</div>`:
  `<div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Ref</th><th>Department</th><th>Plan</th><th>Linked KPI</th><th>Status</th><th class="num">Progress</th><th>Next due</th><th>Owner</th></tr></thead><tbody>
   ${caps.length?caps.map(c=>{const nx=c.actions.filter(a=>!a.done).sort((a,b)=>a.due.localeCompare(b.due))[0];const od=nx&&nx.due<new Date().toISOString().slice(0,10);return `<tr class="click" onclick="capDetail('${c.id}')"><td class="mono">${esc(c.ref)}</td><td>${esc(dept(c.deptId).short)}</td><td><b>${esc(c.title)}</b></td><td>${c.kpiId?esc(kpi(c.kpiId)?.code):'—'}</td><td>${capChip(c)}</td><td class="num">${capProgress(c)}%</td><td>${nx?`${dshort(nx.due)} ${od?'<span class="chip c-serious"><i>!</i>Overdue</span>':''}`:'—'}</td><td>${esc(uname(c.createdBy))}</td></tr>`}).join(''):'<tr><td colspan="8" class="empty">No plans.</td></tr>'}
  </tbody></table></div></div>`}`;
}
function capFromAlert(key){const a=alerts().find(x=>x.key===key);if(a)capForm(null,a.deptId,a.kpiId||'',a.type+': '+a.text)}
function capForm(id,deptId,kpiId,trigger){
  const c=id?S.caps.find(x=>x.id===id):{deptId,kpiId:kpiId||'',title:'',trigger:trigger||'',rootCause:'',actions:[{text:'',owner:dept(deptId)?.headId,due:''}]};
  const ds=scopedDepts();
  const staff=S.users.filter(u=>u.active&&['dept_head','staff','kpi_officer'].includes(u.role));
  const actRow=(a,i)=>`<div class="fg" style="grid-template-columns:3fr 1.4fr 1fr;margin-bottom:6px" data-row><input placeholder="Action" value="${esc(a.text)}" data-f="text"><select data-f="owner">${staff.map(u=>`<option value="${u.id}" ${u.id===a.owner?'selected':''}>${esc(u.name)}</option>`).join('')}</select><input type="date" value="${esc(a.due)}" data-f="due"></div>`;
  window._actRow=actRow;
  const body=`<form id="cf" onsubmit="return saveCap(event,'${id||''}')"><div class="fg">
   <div><label class="f">Department</label><select name="deptId">${ds.map(d=>`<option value="${d.id}" ${d.id===c.deptId?'selected':''}>${esc(d.short)}</option>`).join('')}</select></div>
   <div><label class="f">Linked KPI (optional)</label><select name="kpiId"><option value="">— Department-wide —</option>${S.kpis.filter(k=>k.active&&inScope(k.deptId)).map(k=>`<option value="${k.id}" ${k.id===c.kpiId?'selected':''}>${esc(k.code)} ${esc(k.name)}</option>`).join('')}</select></div>
   <div class="full"><label class="f">Plan title</label><input name="title" required value="${esc(c.title)}"></div>
   <div class="full"><label class="f">Trigger / performance gap</label><textarea name="trigger" required>${esc(c.trigger)}</textarea></div>
   <div class="full"><label class="f">Root cause analysis</label><textarea name="rootCause" required>${esc(c.rootCause)}</textarea></div>
   <div class="full"><label class="f">Corrective actions (action · responsible · due date)</label><div id="acts">${c.actions.map(actRow).join('')}</div><button type="button" class="btn sm" onclick="$('#acts').insertAdjacentHTML('beforeend',_actRow({text:'',owner:'',due:''}))">+ Add action</button></div>
  </div></form>`;
  openModal(id?`Edit ${c.ref}`:'New corrective action plan',body,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" form="cf">Save plan</button>`,true);
}
function saveCap(e,id){
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  const actions=[...document.querySelectorAll('#acts [data-row]')].map(r=>({text:r.querySelector('[data-f=text]').value.trim(),owner:r.querySelector('[data-f=owner]').value,due:r.querySelector('[data-f=due]').value})).filter(a=>a.text);
  if(!actions.length||actions.some(a=>!a.due)){toast('Add at least one action, each with a due date.');return false}
  act(id?'PUT':'POST',id?`/api/caps/${id}`:'/api/caps',{...f,actions},'Corrective action plan saved');return false;
}
function capDetail(id){
  const c=S.caps.find(x=>x.id===id);const ed=can('cap_manage')&&inScope(c.deptId);const rv=can('approve');
  const body=`<div class="grid g2"><div><dl class="kv"><dt>Department</dt><dd>${esc(dept(c.deptId).name)}</dd><dt>Linked KPI</dt><dd>${c.kpiId?esc(kpi(c.kpiId).code+' '+kpi(c.kpiId).name):'Department-wide'}</dd><dt>Status</dt><dd>${capChip(c)} <b class="num">${capProgress(c)}%</b> complete</dd><dt>Created</dt><dd>${esc(uname(c.createdBy))}, ${dshort(c.createdAt)}</dd></dl>
   <h4 style="margin-top:12px">Trigger</h4><p style="margin:4px 0">${esc(c.trigger)}</p><h4 style="margin-top:12px">Root cause</h4><p style="margin:4px 0">${esc(c.rootCause)}</p></div>
   <div><h4>Actions</h4><table class="tbl"><tbody>${c.actions.map((a,i)=>{const od=!a.done&&a.due<new Date().toISOString().slice(0,10);return `<tr><td style="width:28px"><input type="checkbox" aria-label="Done" ${a.done?'checked':''} ${ed?`onchange="capToggle('${c.id}','${a.id}',this.checked)"`:'disabled'}></td><td>${esc(a.text)}<div class="muted small">${esc(uname(a.owner))} · due ${dshort(a.due)} ${od?'<span class="chip c-serious"><i>!</i>Overdue</span>':''}</div></td></tr>`}).join('')}</tbody></table>
   <h4 style="margin-top:12px">Progress updates</h4><ul class="tl">${c.updates.map(u=>`<li>${esc(u.text)}<div class="muted small">${esc(uname(u.by))} · ${dt(u.at)}</div></li>`).join('')||'<li class="muted">No updates yet</li>'}</ul>
   <h4 style="margin-top:8px">Mayor's Office review</h4><ul class="tl">${c.review.map(u=>`<li>${esc(u.text)}<div class="muted small">${esc(uname(u.by))} · ${dt(u.at)}</div></li>`).join('')||'<li class="muted">Not reviewed yet</li>'}</ul>
   ${ed||rv?`<label class="f">${ed?'Add progress update':'Add review comment'}</label><textarea id="capu"></textarea>`:''}
   ${ed?`<div style="margin-top:8px"><label class="f">Status</label><select id="caps">${['Open','In progress','Completed'].map(s=>`<option ${s===c.status?'selected':''}>${s}</option>`).join('')}</select></div>`:''}</div></div>`;
  openModal(`${c.ref} · ${c.title}`,body,`<button class="btn" onclick="closeModal()">Close</button>${ed?`<button class="btn" onclick="capForm('${c.id}')">Edit plan</button><button class="btn pri" onclick="capUpdate('${c.id}','update')">Save update</button>`:''}${rv&&!ed?`<button class="btn pri" onclick="capUpdate('${c.id}','review')">Add review</button>`:''}`,true);
}
async function capToggle(id,itemId,done){try{await api('POST',`/api/caps/${id}/items/${itemId}`,{done});await reload();capDetail(id)}catch(e){onApiError(e)}}
function capUpdate(id,kind){
  const text=($('#capu')?.value||'').trim();const status=$('#caps')?.value;
  if(kind==='review'&&!text){toast('Write a review comment.');return}
  act('POST',`/api/caps/${id}/update`,{kind,text,status},'Saved');
}
/* ---------- views: employees ----------
   Targets: proposed by the employee and approved by the department head (or
   set by the head). Results: reported by the employee with evidence, verified
   by the head. Only approved targets with verified results count. */
const indAch=i=>i.actual==null||!i.target?null:(i.dir==='higher'?i.actual/i.target*100:(i.actual?i.target/i.actual*100:S.config.cap));
function empScore(e){const xs=e.indicators.filter(i=>i.status==='approved'&&i.actual!=null).map(i=>({w:i.weight,a:indAch(i)})).filter(x=>x.a!=null);const W=sum(xs.map(x=>x.w));return W?sum(xs.map(x=>x.w*Math.min(x.a,S.config.cap)))/W:null}
const isSup=e=>can('emp_eval')&&inScope(e.deptId)&&me().id!==e.userId;
const isOwn=e=>!!e.userId&&e.userId===me().id;
const empTodo=e=>isSup(e)?e.indicators.filter(i=>i.status==='proposed'||i.reportStatus==='reported').length:isOwn(e)?e.indicators.filter(i=>i.status==='returned'||i.reportStatus==='returned'||(i.status==='approved'&&i.reportStatus==='none')).length:0;
const kpiRef=id=>(S.kpiRefs||[]).find(k=>k.id===id);
function indChips(i){
  const out=[];
  if(i.status==='proposed')out.push('<span class="chip c-info"><i>↑</i>Target awaiting approval</span>');
  if(i.status==='returned')out.push('<span class="chip c-warning"><i>↩</i>Target returned</span>');
  if(i.status==='approved'){
    if(i.reportStatus==='reported')out.push('<span class="chip c-info"><i>↑</i>Result awaiting verification</span>');
    else if(i.reportStatus==='returned')out.push('<span class="chip c-warning"><i>↩</i>Result returned</span>');
    else if(i.reportStatus==='verified')out.push('<span class="chip c-good"><i>✓</i>Verified</span>');
    else out.push('<span class="chip c-none"><i>○</i>No result yet</span>');
  }
  return out.join(' ');
}
function vEmployees(){
  const ds=scopedDepts();const f=UI.flt.edept||(ds.length===1?ds[0].id:'');
  const team=can('emp_eval')||can('all_depts');
  const list=S.employees.filter(e=>(isOwn(e)||(team&&inScope(e.deptId)))&&(!f||e.deptId===f||isOwn(e)));
  const addDept=can('emp_eval')?(f&&inScope(f)?f:(ds.length===1?ds[0].id:'')):'';
  return `<div class="pagehead"><div><h1>${t(team?'Employee performance':'My performance')}</h1><p>${team?'Individual targets are proposed by the employee and approved by the department head. Each period the employee reports the result with evidence and the department head verifies it. Only verified results count towards the score.':'Propose your individual targets, report your results with evidence, and follow their approval here.'}</p></div>
   <div style="display:flex;gap:8px">${team&&ds.length>1?`<select aria-label="Department" onchange="UI.flt.edept=this.value;render()"><option value="">All departments</option>${ds.map(d=>`<option value="${d.id}" ${f===d.id?'selected':''}>${esc(d.short)}</option>`).join('')}</select>`:''}${can('emp_eval')?`<button class="btn pri" onclick="empForm('${addDept}')">${ico('plus',15)} Add employee</button>`:''}</div></div>
  <div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Employee</th><th>Department</th><th>Individual indicators (verified result / target)</th><th style="width:130px">Score</th><th class="num">%</th><th>Status</th><th>Evaluation</th><th></th></tr></thead><tbody>
  ${list.length?list.map(e=>{const s=empScore(e),n=empTodo(e);return `<tr class="click" onclick="empDetail('${e.id}')"><td><b>${esc(e.name)}</b>${isOwn(e)?' <span class="pill">You</span>':''}<div class="muted small">${esc(e.position||'')}</div></td><td>${esc(dept(e.deptId)?.short||e.deptId)}</td><td class="small">${e.indicators.length?e.indicators.map(i=>`${esc(i.name)}: <span class="num">${i.actual==null?'—':fmt(i.actual,i.unit)}/${fmt(i.target,i.unit)}</span>${i.status!=='approved'?' <span class="muted">(target '+i.status+')</span>':i.reportStatus==='reported'?' <span class="muted">(to verify)</span>':''}`).join('<br>'):'<span class="muted">No indicators yet</span>'}</td><td>${achBar(s)}</td><td class="num">${pct(s)}</td><td>${chip(s)}</td><td>${e.evaluation?`<span class="pill">${esc(e.evaluation.rating)}</span><div class="muted small">${esc(uname(e.evaluation.by))}</div>`:'<span class="muted small">Pending</span>'}</td><td class="right">${n?`<span class="chip c-info">${n} to do</span>`:''}</td></tr>`}).join(''):`<tr><td colspan="8"><div class="empty">${can('emp_eval')?'No employees yet. Use "Add employee" to start.':'No employee record is linked to your account yet. Ask your department head to add you.'}</div></td></tr>`}
  </tbody></table></div></div>`;
}
/* add an employee (department head) */
function empForm(deptId){
  const ds=scopedDepts();
  openModal('Add employee',`<form id="emf" class="fg" onsubmit="return saveEmpNew(event)">
   <div class="full"><label class="f">Full name</label><input name="name" required oninput="empUserSuggest(this.form)"></div>
   <div><label class="f">Position</label><input name="position" placeholder="e.g. Revenue Officer"></div>
   <div><label class="f">Department</label><select name="deptId" required>${ds.map(d=>`<option value="${d.id}" ${d.id===deptId?'selected':''}>${esc(d.short)}</option>`).join('')}</select></div>
   <div class="full"><label class="toggle"><input type="checkbox" name="acct" checked onchange="$('#emf_acct').style.display=this.checked?'':'none';this.form.email.required=this.checked"> Create a sign-in account, so the employee can propose targets and report results</label></div>
   <div class="full fg" id="emf_acct"><div><label class="f">${t('Username')}</label><input name="username" autocomplete="off" oninput="this.dataset.touched=1"></div><div><label class="f">Email (required for the account)</label><input type="email" name="email" required placeholder="name@example.com"></div><div><label class="f">Mobile phone</label><input type="tel" name="phone"></div>
   <div class="full small muted">A temporary password is generated when you save. The employee must change it at first sign-in.</div></div></form>`,
   `<button class="btn" onclick="closeModal()">${t('Cancel')}</button><button class="btn pri" form="emf">${t('Save')}</button>`);
}
function nameToUser(n){const p=String(n||'').toLowerCase().replace(/[^a-z\s]/g,' ').trim().split(/\s+/).filter(w=>w&&!['dr','mr','mrs','ms','ato','prof','eng','w','ro','rt'].includes(w));return p.length>1?`${p[0]}.${p[p.length-1][0]}`:(p[0]||'')}
function empUserSuggest(f){if(!f.username.dataset.touched)f.username.value=nameToUser(f.name.value)}
async function saveEmpNew(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  const r=await act('POST','/api/employees',{name:f.name,position:f.position,deptId:f.deptId,username:f.acct?f.username:'',phone:f.phone,email:f.email},null);if(!r)return false;
  if(r.tempPassword)showAccount('Employee added',f.name,r.username,r.tempPassword,()=>`empDetail('${r.id}')`);else{toast('Employee added');empDetail(r.id)}
  return false}
/* one-time display of a new account */
function showAccount(title,name,username,temp,nextCall){
  openModal(title,`<p>An account was created for <b>${esc(name)}</b>. Give these details to the person through a secure channel. The password is shown only once, and it must be changed at the first sign-in.</p>
   <div class="acctbox"><div><span>Username</span><b class="mono">${esc(username)}</b></div><div><span>Temporary password</span><b class="mono">${esc(temp)}</b></div></div>`,
   `<button class="btn" onclick="copyText('Username: ${esc(username)}\\nTemporary password: ${esc(temp)}','Copied')">Copy</button><button class="btn pri" onclick="closeModal()${nextCall?';'+nextCall():''}">Done</button>`)}
function empDetail(id){
  const e=S.employees.find(x=>x.id===id);if(!e)return;const sup=isSup(e),own=isOwn(e);
  const direct=sup&&!e.userId; // no account: the supervisor records results on the employee's behalf
  const rows=e.indicators.map((i,x)=>{
    const k=i.kpiId?kpiRef(i.kpiId):null;let actions='';
    if(sup&&i.status==='proposed')actions=`<button type="button" class="btn sm ok" onclick="indDecide('${id}','${i.id}','approve')">Approve target</button> <button type="button" class="btn sm bad" onclick="indDecide('${id}','${i.id}','return')">Return</button>`;
    else if(sup&&i.reportStatus==='reported')actions=`<button type="button" class="btn sm ok" onclick="indVerify('${id}','${i.id}','verify')">Verify result</button> <button type="button" class="btn sm bad" onclick="indVerify('${id}','${i.id}','return')">Return</button>`;
    else if(own&&i.status==='approved')actions=`<button type="button" class="btn sm ${i.reportStatus==='verified'?'':'pri'}" onclick="indReport('${id}','${i.id}')">${i.reportStatus==='none'?'Report result':i.reportStatus==='returned'?'Correct result':'Update result'}</button>`;
    if(sup||(own&&i.status!=='approved'))actions+=` <button type="button" class="btn sm" onclick="indForm('${id}','${i.id}')">Edit</button>`;
    return `<tr><td><b>${esc(i.name)}</b> <span class="muted small">(${esc(i.unit||'')}${i.dir==='lower'?', lower is better':''})</span>${k?`<div class="muted small">Contributes to ${esc(k.code)} ${esc(k.name)}</div>`:''}<div style="margin-top:4px">${indChips(i)}</div>
      ${i.status==='returned'&&i.decisionComment?`<div class="small" style="margin-top:4px"><b>Returned:</b> ${esc(i.decisionComment)}</div>`:''}
      ${i.reportStatus==='returned'&&i.verifyComment?`<div class="small" style="margin-top:4px"><b>Returned:</b> ${esc(i.verifyComment)}</div>`:''}
      ${i.reportStatus==='reported'?`<div class="small" style="margin-top:4px">Reported: <b class="num">${fmt(i.reported,i.unit)}</b>${i.reportNote?' — '+esc(i.reportNote):''}</div>`:''}
      ${i.evidence.length?`<div class="small" style="margin-top:4px">${i.evidence.map(f=>`📎 <a href="#" onclick="downloadUrl('/api/employee-evidence/${f.id}','${esc(f.name)}');return false">${esc(f.name)}</a>`).join(' · ')}</div>`:''}</td>
     <td class="num">${i.weight}%</td><td class="num">${fmt(i.target,i.unit)}</td>
     <td class="num">${direct&&i.status==='approved'?`<input type="number" step="any" min="0" name="a${x}" value="${i.actual??''}" style="width:84px" aria-label="Actual for ${esc(i.name)}">`:(i.actual==null?'<span class="muted">—</span>':fmt(i.actual,i.unit))}</td>
     <td class="num">${pct(indAch(i))}</td><td class="right" style="white-space:nowrap">${actions}</td></tr>`}).join('');
  const body=`<form id="ef" onsubmit="return saveEmp(event,'${id}')"><div class="muted" style="margin-bottom:10px">${esc(e.position||'')} · ${esc(dept(e.deptId)?.name||'')}${e.userId?'':' · <span class="pill">No sign-in account</span>'}</div>
  ${direct?'<div class="notice" style="margin-bottom:12px">This employee has no sign-in account, so you record the results on their behalf. They are saved as verified by you.</div>':''}
  <div class="tblwrap"><table class="tbl"><thead><tr><th>Indicator</th><th class="num">Weight</th><th class="num">Target</th><th class="num">Verified result</th><th class="num">Achievement</th><th></th></tr></thead><tbody>
  ${rows||'<tr><td colspan="6"><div class="empty">No indicators yet.</div></td></tr>'}
  <tr><td><b>Weighted score</b> <span class="muted small">(approved targets with verified results)</span></td><td></td><td></td><td></td><td class="num"><b>${pct(empScore(e))}</b></td><td></td></tr></tbody></table></div>
  ${sup||own?`<div style="margin-top:10px"><button type="button" class="btn sm" onclick="indForm('${id}')">${ico('plus',14)} ${own?'Propose a target':'Add an indicator'}</button></div>`:''}
  <div class="fg" style="margin-top:16px"><div><label class="f">Evaluation rating</label>${sup?`<select name="rating"><option value="">— Select —</option>${RATINGS.map(r=>`<option ${e.evaluation?.rating===r?'selected':''}>${r}</option>`).join('')}</select>`:`<div>${esc(e.evaluation?.rating||'Pending')}</div>`}</div>
  <div class="full"><label class="f">Supervisor comments & development needs</label>${sup?`<textarea name="comment">${esc(e.evaluation?.comment||'')}</textarea>`:`<div>${esc(e.evaluation?.comment||'—')}</div>`}</div></div></form>`;
  openModal(e.name,body,`<button class="btn" onclick="closeModal()">Close</button>${sup?`<button class="btn pri" form="ef">${direct?'Save results and evaluation':'Save evaluation'}</button>`:''}`,true);
}
function saveEmp(ev,id){
  ev.preventDefault();const e=S.employees.find(x=>x.id===id);const f=new FormData(ev.target);
  act('PUT',`/api/employees/${id}`,{indicators:e.indicators.map((i,x)=>({id:i.id,actual:f.get('a'+x)})).filter(i=>i.actual!=null&&i.actual!==''),rating:f.get('rating')||null,comment:f.get('comment')||''},'Evaluation saved');return false;
}
const backToEmp=id=>r=>{if(r)empDetail(id)};
/* indicator / individual target form */
function indForm(empId,indId){
  const e=S.employees.find(x=>x.id===empId),i=indId?e.indicators.find(x=>x.id===indId):{name:'',unit:'',dir:'higher',target:'',weight:'',kpiId:''};const own=isOwn(e);
  const ks=(S.kpiRefs||[]).filter(k=>k.deptId===e.deptId);
  openModal(indId?'Edit indicator':own?'Propose a target':'Add an indicator',`<form id="inf" class="fg" onsubmit="return saveInd(event,'${empId}','${indId||''}')">
   ${own?'<div class="full notice">Your proposal goes to your department head for approval. You can report results once it is approved.</div>':indId&&i.status==='proposed'?'<div class="full notice">Saving your changes approves this target.</div>':''}
   <div class="full"><label class="f">Indicator</label><input name="name" required maxlength="120" value="${esc(i.name)}" placeholder="e.g. Taxpayer files audited"></div>
   <div><label class="f">Unit</label><input name="unit" required maxlength="30" value="${esc(i.unit||'')}" placeholder="files, %, ETB M, days…"></div>
   <div><label class="f">Better when</label><select name="dir"><option value="higher" ${i.dir==='higher'?'selected':''}>Higher</option><option value="lower" ${i.dir==='lower'?'selected':''}>Lower</option></select></div>
   <div><label class="f">Target for the period</label><input type="number" step="any" min="0" name="target" required value="${i.target}"></div>
   <div><label class="f">Weight (%)</label><input type="number" step="any" min="1" max="100" name="weight" required value="${i.weight}"></div>
   <div class="full"><label class="f">Department KPI it contributes to</label><select name="kpiId"><option value="">— Not linked —</option>${ks.map(k=>`<option value="${k.id}" ${k.id===i.kpiId?'selected':''}>${esc(k.code)} · ${esc(k.name)}</option>`).join('')}</select></div></form>`,
   `<button class="btn" onclick="empDetail('${empId}')">${t('Cancel')}</button>${indId&&(isSup(e)||i.status!=='approved')?`<button class="btn bad" onclick="indRemove('${empId}','${indId}')">Remove</button>`:''}<button class="btn pri" form="inf">${own?'Submit for approval':t('Save')}</button>`);
}
function saveInd(ev,empId,indId){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target).entries());
  act(indId?'PUT':'POST',indId?`/api/employee-indicators/${indId}`:`/api/employees/${empId}/indicators`,f,r=>r.status==='proposed'?'Sent to your department head for approval':'Indicator saved').then(backToEmp(empId));return false}
function indRemove(empId,indId){act('DELETE',`/api/employee-indicators/${indId}`,{},'Indicator removed').then(backToEmp(empId))}
/* decisions by the department head */
function reasonModal(title,label,onOk,backId){
  openModal(title,`<form id="rsf" onsubmit="return reasonOk(event)"><label class="f">${label}</label><textarea id="rs_txt" required minlength="5"></textarea></form>`,`<button class="btn" onclick="empDetail('${backId}')">Cancel</button><button class="btn pri" form="rsf">Return</button>`);
  UI._reasonOk=onOk}
function reasonOk(e){e.preventDefault();UI._reasonOk($('#rs_txt').value.trim());return false}
function indDecide(empId,indId,action){
  const go=comment=>act('POST',`/api/employee-indicators/${indId}/decision`,{action,comment},action==='approve'?'Target approved':'Target returned').then(backToEmp(empId));
  if(action==='return')reasonModal('Return the proposed target','What should the employee change?',go,empId);else go('')}
function indVerify(empId,indId,action){
  const go=comment=>act('POST',`/api/employee-indicators/${indId}/verify`,{action,comment},action==='verify'?'Result verified':'Result returned').then(backToEmp(empId));
  if(action==='return')reasonModal('Return the reported result','What should the employee correct?',go,empId);else go('')}
/* self-report with evidence (employee) */
function indReport(empId,indId){
  const e=S.employees.find(x=>x.id===empId),i=e.indicators.find(x=>x.id===indId);
  pendingFiles=i.evidence.slice();newFiles=[];
  openModal('Report my result',`<form id="irf" onsubmit="return saveIndReport(event,'${empId}','${indId}')">
   <div style="margin-bottom:12px"><h3>${esc(i.name)}</h3><div class="muted small">Target ${fmt(i.target,i.unit)}${i.dir==='lower'?' · lower is better':''}</div></div>
   ${i.reportStatus==='returned'&&i.verifyComment?`<div class="notice" style="margin-bottom:12px"><b>Returned:</b> ${esc(i.verifyComment)}</div>`:''}
   <div class="fg"><div><label class="f">Actual result (${esc(i.unit||'')})</label><input type="number" step="any" min="0" id="ir_actual" required value="${i.reported??''}"></div>
   <div class="full"><label class="f">Evidence (required)</label><input type="file" multiple onchange="addFiles(this)"><div id="evl" style="margin-top:6px">${evList()}</div><div class="small muted">Attach the register, report, system extract or photo that supports the figure. Files up to 10 MB each.</div></div>
   <div class="full"><label class="f">Note for your department head</label><textarea id="ir_note">${esc(i.reportNote||'')}</textarea></div></div></form>`,
   `<button class="btn" onclick="empDetail('${empId}')">Cancel</button><button class="btn pri" form="irf">Submit for verification</button>`);
}
async function saveIndReport(ev,empId,indId){
  ev.preventDefault();const btns=[...document.querySelectorAll('#modal footer button')];btns.forEach(b=>b.disabled=true);
  try{
    const files=await Promise.all(newFiles.map(async f=>({name:f.name,type:f.type,data:await fileToBase64(f)})));
    const r=await act('POST',`/api/employee-indicators/${indId}/report`,{actual:$('#ir_actual').value,note:$('#ir_note').value.trim(),keepEvidence:pendingFiles.map(f=>f.id),files},'Sent to your department head for verification');
    if(r){newFiles=[];empDetail(empId)}
  }finally{btns.forEach(b=>b.disabled=false)}
  return false}

/* ---------- views: reports ---------- */
function vReports(){
  const months=periodMonths(),ds=scopedDepts(),pp=prevPeriod();
  const rows=ds.map(d=>({d,...deptCalc(d.id,months),ly:lastYearDept(d.id,months),pv:pp?deptCalc(d.id,periodMonths(pp)).score:null})).sort((a,b)=>(b.score??-1)-(a.score??-1));
  const city=avg(rows.map(r=>r.score).filter(v=>v!=null));
  const al=alerts();const caps=S.caps.filter(c=>inScope(c.deptId));
  const best=rows.filter(r=>r.score!=null)[0],worst=rows.filter(r=>r.score!=null).slice(-1)[0];
  const allK=rows.flatMap(r=>r.rows.map(x=>({...x,d:r.d}))).filter(x=>x.ach!=null).sort((a,b)=>a.ach-b.ach);
  const narrative=`For ${periodLabel()}, the ${ds.length>1?'overall city performance index':'department score'} was ${pct(city)} (${band(city).label.toLowerCase()}). `+
   (best&&ds.length>1?`${best.d.short} recorded the highest score (${pct(best.score)}) and ${worst.d.short} the lowest (${pct(worst.score)}). `:'')+
   `${allK.filter(x=>x.ach>=S.config.bands.good).length} of ${allK.length} measured KPIs were on track. `+
   (allK.length?`The largest gaps were ${allK.slice(0,3).map(x=>`${x.k.name} (${x.d.short}, ${pct(x.ach)})`).join(', ')}. `:'')+
   `${al.length} alert(s) are active and ${caps.filter(c=>c.status!=='Completed').length} corrective action plan(s) are open.`+
   (S.ui.provisional?' Figures include provisional data not yet approved by the Mayor\'s Office.':' Figures are based on approved data only.');
  UI._csv=['Department,KPI code,KPI,Unit,Weight,Target,Actual,Achievement %,Status,Reported/Due',...rows.flatMap(r=>r.rows.map(x=>[r.d.short,x.k.code,x.k.name,x.k.unit,x.k.weight,x.target??'',x.actual??'',x.ach==null?'':x.ach.toFixed(1),band(x.ach).label,`${x.rep}/${x.due}`].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')))].join('\n');
  UI._narr=narrative;
  return `<div class="pagehead"><div><h1>${t('Performance evaluation report')}</h1><p>${esc(S.config.org)} · ${esc(S.config.office)} · ${esc(periodLabel())} · generated ${dshort(new Date().toISOString())} by ${esc(me().name)}</p></div>
   <div style="display:flex;gap:8px"><button class="btn" onclick="copyText(UI._narr,'Summary copied')">Copy summary</button><button class="btn pri" onclick="copyText(UI._csv,'KPI table copied as CSV — paste into Excel')">Copy KPI data (CSV)</button></div></div>
  <div class="card"><h2>1. Executive summary</h2><p style="margin:8px 0 0;max-width:900px">${esc(narrative)}</p></div>
  <div class="card"><h2 style="margin-bottom:10px">2. Department results</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Rank</th><th>Department</th><th class="num">Score</th><th>Rating</th><th class="num">Previous period</th><th class="num">Same period last year</th><th class="num">KPIs on track</th><th class="num">Data coverage</th></tr></thead><tbody>
   ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.d.name)}</td><td class="num"><b>${pct(r.score)}</b></td><td>${chip(r.score)}</td><td class="num">${pct(r.pv)} ${r.pv!=null&&r.score!=null?delta(r.score,r.pv):''}</td><td class="num">${pct(r.ly)} ${r.ly!=null&&r.score!=null?delta(r.score,r.ly):''}</td><td class="num">${r.rows.filter(x=>x.ach!=null&&x.ach>=S.config.bands.good).length}/${r.rows.length}</td><td class="num">${r.rep}/${r.due}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><h2 style="margin-bottom:10px">3. KPI performance detail</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Department</th><th>KPI</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Achievement</th><th>Status</th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="grp"><td colspan="6">${esc(r.d.name)} — ${pct(r.score)}</td></tr>`+r.rows.map(x=>`<tr><td>${esc(r.d.short)}</td><td>${esc(x.k.code)} ${esc(x.k.name)}</td><td class="num">${fmtU(x.target,x.k.unit)}</td><td class="num">${fmtU(x.actual,x.k.unit)}</td><td class="num"><b>${pct(x.ach)}</b></td><td>${chip(x.ach)}</td></tr>`).join('')).join('')}
  </tbody></table></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h2 style="margin-bottom:6px">4. Alerts</h2>${al.length?al.slice(0,12).map(alertRow).join(''):'<div class="empty">None</div>'}</div>
  <div class="card"><h2 style="margin-bottom:10px">5. Corrective action plans</h2>${caps.length?`<table class="tbl"><tbody>${caps.map(c=>`<tr><td><b>${esc(c.ref)}</b> ${esc(c.title)}<div class="muted small">${esc(dept(c.deptId).short)}</div></td><td>${capChip(c)}</td><td class="num">${capProgress(c)}%</td></tr>`).join('')}</tbody></table>`:'<div class="empty">None</div>'}</div></div>`;
}


/* ---------- dashboard hero: performance ruler ---------- */
function perfHero(rows,city){
  const scored=rows.filter(r=>r.score!=null);const b=S.config.bands;
  const W=1000,H=160,x0=20,x1=980,lo=40,hi=120;const X=v=>x0+(clamp(v,lo,hi)-lo)/(hi-lo)*(x1-x0);const ty=82;
  const zones=[[lo,b.serious,'var(--crit)'],[b.serious,b.warning,'var(--serious)'],[b.warning,b.good,'var(--warn)'],[b.good,hi,'var(--good)']];
  let g=zones.map(([a,c,col],i)=>`<rect x="${X(a)}" y="${ty-5}" width="${X(c)-X(a)-(i<3?2:0)}" height="10" rx="${i===0||i===3?5:0}" fill="${col}" opacity=".55"/>`).join('');
  [lo,b.serious,b.warning,b.good,100,hi].forEach(v=>{g+=`<text x="${X(v)}" y="${ty+24}" text-anchor="middle" font-size="11" fill="#8fb5a8">${v}%</text>`});
  g+=`<line x1="${X(100)}" x2="${X(100)}" y1="${ty-14}" y2="${ty+14}" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 3" opacity=".6"/>`;
  const sorted=scored.slice().sort((a,c)=>a.score-c.score);const last={up:-999,down:-999};
  sorted.forEach(r=>{const x=X(r.score);let row=x-last.up>=120?'up':x-last.down>=120?'down':(last.up<last.down?'up':'down');last[row]=x;
    const ly=row==='up'?34:138;const lbl=`${r.d.short} ${r.score.toFixed(1)}`;
    g+=`<line x1="${x}" x2="${x}" y1="${row==='up'?ly+6:ty+7}" y2="${row==='up'?ty-7:ly-13}" stroke="#cfe3dc" stroke-width="1" opacity=".7"/><circle cx="${x}" cy="${ty}" r="7" fill="#fff" stroke="var(--brand-deep)" stroke-width="2.5"><title>${esc(lbl)}</title></circle><text x="${x}" y="${ly}" text-anchor="middle" font-size="13" font-weight="600" fill="#fff">${esc(r.d.short)}</text><text x="${x}" y="${ly+(row==='up'?-15:15)}" text-anchor="middle" font-size="12" fill="#a9cbbf">${r.score.toFixed(1)}</text>`});
  if(city!=null&&scored.length>1)g+=`<path d="M${X(city)-8},${ty+20} L${X(city)+8},${ty+20} L${X(city)},${ty+9} Z" fill="var(--gold)"><title>City index ${city.toFixed(1)}</title></path>`;
  const cnt=k=>scored.filter(r=>band(r.score).key===k).length;
  const low=sorted[0];
  const sentence=scored.length>1?`City performance stands at ${pct(city)} for ${periodLabel()}. ${cnt('good')} of ${scored.length} departments are on track${low&&band(low.score).key!=='good'?`; ${low.d.short} needs the most support at ${pct(low.score)}`:''}.`:scored.length?`${scored[0].d.name} scores ${pct(scored[0].score)} for ${periodLabel()} — ${t(band(scored[0].score).label).toLowerCase()}.`:'No approved data yet for this period.';
  return `<section class="hero" aria-label="Department scores on one scale"><h2>${esc(sentence)}</h2><p>Each department sits on one scale from ${lo}% to ${hi}% of target${scored.length>1?'; the gold marker is the city index':''}. Achievement above 100% is capped at ${S.config.cap}% in scores.</p>
   <svg class="ruler" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin-top:6px" role="img" aria-label="${esc(scored.map(r=>r.d.short+' '+r.score.toFixed(1)).join(', '))}">${g}</svg>
   <div class="mob">${sorted.slice().reverse().map(r=>`<div style="display:flex;align-items:center;gap:10px;margin:8px 0"><span style="width:96px;font-size:13px;color:#fff">${esc(r.d.short)}</span><div class="achbar" style="flex:1;background:rgba(255,255,255,.15)"><span class="bg-${band(r.score).key}" style="width:${clamp(r.score,0,120)/120*100}%"></span><em style="background:#fff"></em></div><b style="width:44px;text-align:right;color:#fff;font-size:13px">${r.score.toFixed(1)}</b></div>`).join('')}</div>
   <div class="legendrow"><span><i style="background:var(--good)"></i>✓ On track ≥${b.good}%</span><span><i style="background:var(--warn)"></i>! Needs attention</span><span><i style="background:var(--serious)"></i>▼ Underperforming</span><span><i style="background:var(--crit)"></i>✕ Critical &lt;${b.serious}%</span></div></section>`;
}

