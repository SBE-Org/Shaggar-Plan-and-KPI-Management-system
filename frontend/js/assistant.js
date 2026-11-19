/* =========================================================================
   assistant.js — AI Executive Assistant.
   Questions go to POST /api/ai/chat; the server calls the configured model
   (Claude API or a local Ollama model) with tools limited to the user's scope.
   When no model is configured, answers come from built-in rules below.
   ========================================================================= */
const AI={msgs:[],busy:false,ctrl:null,provider:undefined};
async function aiStatus(){if(AI.provider!==undefined)return;try{AI.provider=(await api('GET','/api/ai/status')).provider}catch(e){AI.provider='none'}if(S.ui.view==='assistant')render()}

function findDept(q){if(!q)return null;q=String(q).toLowerCase();return scopedDepts().find(d=>d.id.toLowerCase()===q||d.short.toLowerCase()===q||d.name.toLowerCase().includes(q)||q.includes(d.short.toLowerCase()))}
const r1=v=>v==null?null:Math.round(v*10)/10;

async function aiAsk(text){
  text=(text||'').trim();if(!text||AI.busy)return;
  AI.msgs.push({role:'user',text});const cur={role:'ai',text:'',tools:[],pending:true};AI.msgs.push(cur);AI.busy=true;
  render();aiScroll();
  const history=AI.msgs.filter(m=>m!==cur&&!m.local&&m.text).map(m=>({role:m.role==='user'?'user':'assistant',content:m.text}));
  AI.ctrl=new AbortController();
  try{
    const r=await fetch('/api/ai/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history,lang:LANGS[lang()]}),signal:AI.ctrl.signal});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'The assistant could not answer.');
    if(j.provider==='none'){cur.text=localAnswer(text);cur.local=true;cur.note=j.note||''}else{cur.text=j.text||'(No answer)';cur.tools=j.tools||[]}
  }catch(e){
    if(e.name==='AbortError')cur.text='_Stopped._';
    else{ // the server or the AI model could not answer: still give the built-in answer
      try{cur.text=localAnswer(text);cur.local=true;cur.note=e.message}catch(e2){console.error(e2);cur.text='Sorry, I could not answer that. Try asking about a department, a KPI, alerts or what is waiting for you.'}
    }
  }
  cur.pending=false;AI.busy=false;AI.ctrl=null;aiPaint();
}
function aiStop(){if(AI.ctrl)AI.ctrl.abort()}
function md(s){
  const lines=esc(s||'').split('\n');let out='',list=null;
  const inline=x=>x.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,'$1<i>$2</i>').replace(/_(.+?)_/g,'<i>$1</i>');
  const close=()=>{if(list){out+=`</${list}>`;list=null}};
  lines.forEach(l=>{
    if(/^#{1,4}\s/.test(l)){close();out+=`<h3>${inline(l.replace(/^#+\s/,''))}</h3>`}
    else if(/^\s*[-*•]\s+/.test(l)){if(list!=='ul'){close();out+='<ul>';list='ul'}out+=`<li>${inline(l.replace(/^\s*[-*•]\s+/,''))}</li>`}
    else if(/^\s*\d+[.)]\s+/.test(l)){if(list!=='ol'){close();out+='<ol style="margin:4px 0 8px;padding-left:20px">';list='ol'}out+=`<li>${inline(l.replace(/^\s*\d+[.)]\s+/,''))}</li>`}
    else if(!l.trim()){close()}
    else{close();out+=`<p>${inline(l)}</p>`}
  });close();return out;
}
function aiMsgHtml(m,i){
  if(m.role==='user')return `<div class="msg user">${esc(m.text)}</div>`;
  return `<div class="msg ai">${m.tools.length?`<div class="tools">${ico('search',13)} Looked up: ${[...new Set(m.tools)].join(', ')}</div>`:''}${m.text?md(m.text):`<span class="muted">${m.pending?'Thinking…':''}</span>`}
   ${!m.pending&&m.text?`<div style="margin-top:8px;display:flex;gap:6px"><button class="btn sm ghost" onclick="copyText(AI.msgs[${i}].text,'Answer copied')">Copy</button>${m.local?'<span class="pill">Built-in assistant</span>':''}</div>${m.note?`<div class="small muted" style="margin-top:6px">The AI model could not be used (${esc(m.note)}), so this answer comes from the built-in assistant.</div>`:''}`:''}</div>`;
}
function aiPaint(){const el=$('#ailog');if(!el)return;el.innerHTML=AI.msgs.map(aiMsgHtml).join('')||aiEmpty();aiScroll();const b=$('#aisend');if(b){b.disabled=AI.busy;b.style.display=AI.busy?'none':''}const st=$('#aistop');if(st)st.style.display=AI.busy?'':'none'}
function aiScroll(){const el=$('#ailog');if(el)el.scrollTop=el.scrollHeight}
function aiEmpty(){return `<div class="empty" style="margin:auto;max-width:520px"><div class="emblem" style="margin:0 auto 12px;width:46px;height:46px">${ico('sparkle',22)}</div><h2 style="color:var(--ink)">Ask about performance, alerts or what needs your decision</h2><p class="ink2" style="margin:6px 0 0">Ask about a department, a KPI, alerts, what is waiting for you, or how to do something in the system. It reads only what your role can see, and can draft a memo for you.</p></div>`}
function aiSuggestions(){
  const u=me();const low=scopedDepts().map(d=>({d,s:deptCalc(d.id,periodMonths()).score})).filter(x=>x.s!=null).sort((a,b)=>a.s-b.s)[0];
  const s=['Give me my executive briefing for today',scopedDepts().length>1?'Which departments need my attention, and what should I do?':'Which KPIs are weakest?'];
  if(can('target_propose')&&!can('all_depts'))s.push('How do I propose a new KPI?');
  if(low)s.push(`Why is ${low.d.short} at ${low.s.toFixed(0)}%? Draft a memo to its head.`);
  if(can('approve')||can('verify'))s.push('What is waiting for my approval or verification?');
  s.push('Compare this year with last year by department','Which citizen requests are overdue or escalated?');
  return s.slice(0,5);
}
function vAssistant(){
  if(AI.provider===undefined)setTimeout(aiStatus,0);
  const status=AI.provider===undefined?['c-none','○','Connecting…']:AI.provider==='anthropic'?['c-good','✓','Connected to Claude']:AI.provider==='ollama'?['c-good','✓','Connected to local model']:['c-info','✓','Built-in assistant'];
  setTimeout(()=>{aiScroll();const ta=$('#aiq');if(ta&&!AI.busy)ta.focus()},30);
  return `<div class="pagehead"><div><h1>${t('AI assistant')}</h1><p>An executive assistant that answers from the live performance data and drafts memos, briefings and messages.</p></div>
   <div style="display:flex;gap:8px;align-items:center"><span class="chip ${status[0]}"><i>${status[1]}</i>${status[2]}</span>${AI.msgs.length?`<button class="btn sm" onclick="AI.msgs=[];render()">New conversation</button>`:''}</div></div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start">
   <div class="chat"><div class="log" id="ailog" aria-live="polite">${AI.msgs.map(aiMsgHtml).join('')||aiEmpty()}</div>
    ${AI.msgs.length<2?`<div class="suggest">${aiSuggestions().map(q=>`<button onclick="aiAsk(${esc(JSON.stringify(q))})">${esc(q)}</button>`).join('')}</div>`:''}
    <form class="composer" onsubmit="event.preventDefault();const v=this.q.value;this.q.value='';aiAsk(v)"><textarea name="q" id="aiq" rows="1" placeholder="Ask anything about performance, alerts, approvals or requests…" aria-label="Message the AI assistant" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}" oninput="this.style.height='auto';this.style.height=Math.min(160,this.scrollHeight)+'px'"></textarea>
     <button class="btn pri" id="aisend" ${AI.busy?'style="display:none"':''} aria-label="Send">${ico('send',16)}</button><button type="button" class="btn" id="aistop" onclick="aiStop()" style="${AI.busy?'':'display:none'}">Stop</button></form>
   </div>
   <aside class="card"><h3>About this assistant</h3><ul class="small ink2" style="padding-left:18px;line-height:1.7;margin:8px 0 12px">
     <li>Reads only what your role can see; it cannot change data.</li><li>Every question is recorded in the audit trail.</li><li>Figures come from approved data for ${esc(periodLabel())}.</li><li>Check important figures on the scorecards before acting.</li></ul>
     <h3>Model</h3><p class="small ink2" style="margin:6px 0 0">${AI.provider==='anthropic'?'Answers come from the Claude API, billed per use to the City’s account.':AI.provider==='ollama'?'Answers come from an open-weight model running on the City’s own server.':`The built-in assistant is answering. It understands questions about departments, KPIs, alerts, approvals, action plans, comparisons with last year and how to use the system.${can('config')?' For free-form questions and richer drafting, connect an AI model: add the variable ANTHROPIC_API_KEY (paid per use) or OLLAMA_URL (self-hosted) on the server, then redeploy.':''}`}</p></aside>
  </div>`;
}
/* ---------- built-in assistant ----------
   Used when no AI model is connected, or when the model cannot be reached.
   It reads the same live data as the screens (already limited to what the
   user may see), recognises the kind of question and answers it. */
const AIH={
  n:v=>pct(v),
  kpiByText(s){
    const ks=S.kpis.filter(k=>k.active&&inScope(k.deptId));
    const code=s.match(/\b([a-z]{2,10})[-\s]?(\d{1,2})\b/i);
    if(code){const want=(code[1]+'-'+code[2].padStart(2,'0')).toLowerCase();const k=ks.find(x=>x.code.toLowerCase()===want);if(k)return k}
    let best=null,score=0;
    for(const k of ks){const words=k.name.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3);if(!words.length)continue;const hit=words.filter(w=>s.includes(w)).length;const sc=hit/words.length;if(hit>=Math.min(2,words.length)&&sc>score){best=k;score=sc}}
    return best;
  },
  kpi(k){
    const ms=periodMonths(),c=kpiCalc(k,ms),d=dept(k.deptId);
    const months=[...Array(S.config.currentMonth).keys()].filter(m=>due(k,m)).map(m=>{const sub=subFor(k.id,m);const a=sub?achv(k,sub.actual,k.targets[m]):null;return `- ${MONTHS[m]}: ${sub?`${fmt(sub.actual,k.unit)} against ${fmt(k.targets[m],k.unit)} (${pct(a)}), ${(SUBST[sub.status]||['','',sub.status])[2].toLowerCase()}`:`no report yet (target ${fmt(k.targets[m],k.unit)})`}`});
    const al=alerts().filter(x=>x.kpiId===k.id);
    return `**${k.name}** (${k.code}) belongs to **${d.name}** and counts for ${k.weight}% of its score.\n\n${kpiMeasure(k).length?`- How it is measured: ${kpiMeasure(k).join(' ')}\n`:''}- Target for the year: **${fmt(k.annual,k.unit)}**${k.dir==='lower'?' (lower is better)':''}\n- ${periodLabel()}: ${c.ach==null?'no approved result yet':`**${pct(c.ach)}** of target (${fmt(c.actual,k.unit)} against ${fmt(c.target,k.unit)}), ${t(band(c.ach).label).toLowerCase()}`}\n\n### Month by month\n${months.join('\n')||'- Nothing is due yet.'}${al.length?`\n\n### Alerts\n${al.map(x=>`- ${x.text}`).join('\n')}`:''}`;
  },
  dept(d){
    const ms=periodMonths(),c=deptCalc(d.id,ms);const rows=c.rows.filter(r=>r.ach!=null).sort((a,b)=>a.ach-b.ach);const caps=S.caps.filter(x=>x.deptId===d.id&&x.status!=='Completed');const ly=lastYearDept(d.id,ms);
    if(!c.rows.length)return `**${d.name}** has no approved KPIs yet, so there is no score. ${can('target_propose')&&inScope(d.id)?'Open **KPIs & targets** and click **Propose a new KPI** to start.':'Its department head proposes them under **KPIs & targets**.'}`;
    return `**${d.name}** scores **${pct(c.score)}** for ${periodLabel()} (${t(band(c.score).label).toLowerCase()})${ly!=null&&c.score!=null?`, ${c.score>=ly?'up':'down'} ${Math.abs(c.score-ly).toFixed(1)} points on last year`:''}. Head: ${uname(d.headId)}.\n\n${rows.map(r=>`- ${r.k.name} (${r.k.code}): ${pct(r.ach)} — ${fmt(r.actual,r.k.unit)} against ${fmt(r.target,r.k.unit)}`).join('\n')||'- No approved results yet for this period.'}\n\n### Recommended actions\n${rows[0]&&rows[0].ach<S.config.bands.warning?`- Ask ${uname(d.headId)} for a recovery plan on ${rows[0].k.name}${caps.length?`; plan ${caps[0].ref} is ${capProgress(caps[0])}% complete`:''}.`:rows[0]&&rows[0].ach<S.config.bands.good?`- Watch ${rows[0].k.name}, the weakest KPI at ${pct(rows[0].ach)}.`:'- Keep the current pace; review at the next monthly meeting.'}\n- ${c.rep<c.due?`Chase ${c.due-c.rep} report(s) that are not yet approved (${c.rep} of ${c.due} done).`:'All due reports are approved.'}`;
  },
  ranked(){const ms=periodMonths();return scopedDepts().map(d=>({d,c:deptCalc(d.id,ms),ly:lastYearDept(d.id,ms)})).filter(r=>r.c.score!=null).sort((a,b)=>b.c.score-a.c.score)},
  memo(d){
    const ms=periodMonths(),c=deptCalc(d.id,ms);const weak=c.rows.filter(r=>r.ach!=null&&r.ach<S.config.bands.good).sort((a,b)=>a.ach-b.ach).slice(0,3);
    return `Here is a draft you can copy and adjust.\n\n**To:** ${uname(d.headId)}, Head, ${d.name}\n**From:** ${B().office}\n**Subject:** ${d.short} performance for ${periodLabel()}\n\n${d.name} scored **${pct(c.score)}** for ${periodLabel()}, which is rated "${t(band(c.score).label)}".\n\n${weak.length?`The results that need attention are:\n${weak.map(r=>`- ${r.k.name}: ${pct(r.ach)} of target (${fmt(r.actual,r.k.unit)} against ${fmt(r.target,r.k.unit)})`).join('\n')}\n\nPlease send the Mayor's Office, within five working days, the causes of these gaps and a corrective action plan with responsible officers and dates.`:'All reported KPIs are on track. Thank you and your team for the result; please keep the monthly reports on time.'}${c.rep<c.due?`\n\n${c.due-c.rep} report(s) for the period are still outstanding. Please make sure they are submitted and verified.`:''}\n\nThank you.`;
  },
  howto(s){
    const propose=can('target_propose'),approve=can('target_approve');
    if(/differen/.test(s)&&/kpi/.test(s)&&/target/.test(s))return `A **KPI** is *what* is measured, for example "Property tax collected". A **target** is *how much* is expected for that KPI: the figure for the year and for each month or quarter.\n\nBoth are on one page, **KPIs & targets**. A department proposes a KPI together with its target, and the Mayor's Office approves them.`;
    if(/strategic objective|city goal/.test(s))return `A **strategic objective** (city goal) is a broad aim of the city, such as improving revenue. Linking a KPI to one only groups it under that goal on the scorecard; it does not change any score.\n\nThe list is kept by the Super Administrator. Choosing one is optional when proposing a KPI.`;
    if(/weight/.test(s))return `The **weight** says how much a KPI counts in the department's score. A KPI with weight 40 counts twice as much as one with weight 20. The weights of a department's approved KPIs should add up to 100%.`;
    if(/scor|calculat|index|cap\b|rating|band/.test(s)){const b=S.config.bands;return `### How scores are calculated\n1. **Achievement** of a KPI = actual result ÷ target (or target ÷ actual where lower is better).\n2. Anything above **${S.config.cap}%** is counted as ${S.config.cap}%.\n3. The **department score** is the average of its KPIs' achievements, weighted by each KPI's weight.\n4. The **city index** is the average of the department scores.\n\nOnly approved results count.\n\n- ${b.good}% and above: on track\n- ${b.warning}% to ${b.good}%: needs attention\n- ${b.serious}% to ${b.warning}%: underperforming\n- below ${b.serious}%: critical`}
    if(/kpi/.test(s)&&/(add|new|creat|propos|set|make|put)/.test(s))return propose?`### To propose a new KPI\n1. Open **KPIs & targets** in the menu.\n2. Click **Propose a new KPI**.\n3. Answer six questions: what you will measure, how it is measured, the unit, whether higher or lower is better, the target for the year, and its weight.\n4. Click **Send for approval**.\n\nThe Mayor's Office then approves it or returns it with a comment. You can edit or withdraw it until they decide.`:`New KPIs are proposed by the **department head** (or KPI officer) under **KPIs & targets → Propose a new KPI**, and approved by the **Mayor's Office**.${approve?' Proposals waiting for you are listed at the top of **KPIs & targets**; click **Review**.':''}`;
    if(/target/.test(s)&&/(chang|edit|revis|updat|set|add|new|propos|lock)/.test(s))return propose?`### To change a target\n- **Not approved yet:** open **KPIs & targets**, find it under "Sent for approval" and click **Edit**.\n- **Already approved (locked):** click **Change targets** on the KPI's row, enter the new figures and the reason, and send it. The current targets stay in force until the Mayor's Office approves the change.`:`Targets are proposed by the department and approved by the Mayor's Office. Approved targets are locked; a change needs a request with a reason.${approve?' Requests waiting for you are at the top of **KPIs & targets**.':''}`;
    if(/(report|submit|result|actual|evidence|upload)/.test(s))return `### To report a monthly result\n1. Open **Reporting & approvals**.\n2. Choose the KPI and the month, then enter the actual result.\n3. Attach the evidence (PDF, photo, Excel…). If the result is below ${S.config.varianceNote}% of target, add an explanation.\n4. Click **Submit for verification**.\n\nThe department head verifies it, then the Mayor's Office approves it. Reports are due by day ${S.config.deadlineDay} of the following month.${can('submit')?'':' Reports are entered by the KPI officer.'}`;
    if(/(verif|approv|return)/.test(s))return `### Verifying and approving\n- **Department head:** open **Reporting & approvals**, open the report under "Awaiting my action", check the evidence, then **Verify** or **Return** with a reason.\n- **Mayor's Office:** the same page lists verified reports; **Approve** or **Return**. New KPIs and target changes are approved under **KPIs & targets**.\n\nNobody can verify or approve their own work.`;
    if(/action plan|corrective/.test(s))return `### Corrective action plans\n1. Open **Alerts & actions**.\n2. On the alert, click **Create action plan**.\n3. Write the cause, then add actions, each with an owner and a due date.\n4. Tick actions off as they are done and post progress updates.\n\nA plan can be closed only when every action is done. Plans are created by the department head; the Mayor's Office can add review comments.`;
    if(/employee|staff|individual|my performance/.test(s))return `### Employee performance\n- **Department head:** open **Employees**, click **Add employee**; then approve their targets, verify their results and give the rating.\n- **Employee:** open **My performance**, click your name, then **Propose a target** or **Report result** (a file is required as evidence).\n\nOnly verified results count in the score.`;
    if(/department/.test(s)&&/(add|new|creat)/.test(s))return `### To add a department\n1. Sign in as the Super Administrator.\n2. Open **Settings → System settings → Departments** and click **Add department**.\n3. Type the short name, full name and the head's name. The code and username are suggested automatically.\n4. Save. The head's temporary password is shown once.`;
    if(/(user|account|password|unlock|reset|sign.?in|log.?in)/.test(s))return `### Accounts and passwords\n- **Change my password:** click your name at the bottom of the menu, then **Change password**.\n- **New account, reset or unlock:** the Super Administrator does this under **Users & access**.\n- After 5 wrong attempts an account is locked for 15 minutes.`;
    if(/(messag|chat)/.test(s))return `### Messages\nOpen **Messages**, click **New**, pick the person (listed by office and department) and write. Only you and that person can read the conversation.`;
    if(/alert/.test(s))return `### Alerts\nThe system raises alerts by itself when a department or KPI falls below ${S.config.bands.warning}%, when a result falls three periods in a row, when a report is late or returned, or when an action in a plan is overdue. They are listed under **Alerts & actions**.`;
    return null;
  },
  menu(){return `I can answer questions like these:\n\n- **Give me a briefing** for the period\n- **How is Revenue doing?** (any department)\n- **Tell me about REV-01** (any KPI, by code or name)\n- **Which departments need attention?**\n- **Which KPIs are weakest?**\n- **Compare with last year**\n- **What is waiting for me?**\n- **Which reports are overdue?**\n- **Show the alerts** or **the action plans**\n- **Draft a memo to the Infrastructure head**\n- **How do I propose a KPI?** (or change a target, report a result, add an employee…)`},
};
function localAnswer(q){
  const s=' '+q.toLowerCase().replace(/[?!.,]/g,' ')+' ';const ms=periodMonths();const al=alerts();const B_=S.config.bands;
  if(/^\s*(hi|hello|hey|selam|akkam|good (morning|afternoon|evening)|thanks|thank you)\b/.test(s)&&s.trim().split(/\s+/).length<=4)return `Hello ${me().name.split(' ')[0]}. ${AIH.menu()}`;
  // how-to and "what does … mean" questions about the system itself
  if(/\b(how (do|can|to|does|is|are)|where (do|can|is|are)|what('?s| is| are) (the|a|an) |what does|explain|steps|guide|help( me)?|meaning|purpose)\b/.test(s)){const h=AIH.howto(s);if(h)return h}
  const k=AIH.kpiByText(s),d=findDept(s.trim());
  if(/\b(memo|draft|letter|write|email)\b/.test(s)){const target=d||AIH.ranked().slice(-1)[0]?.d;if(target)return AIH.memo(target)}
  if(k&&!/\b(which|all|list|weakest|worst|departments)\b/.test(s))return AIH.kpi(k);
  if(d&&!/\b(compare|rank|all departments)\b/.test(s))return AIH.dept(d);
  const R=AIH.ranked();
  if(/last year|previous year|compare|comparison|versus|\bvs\b|improv|year.on.year/.test(s))return R.length?`### ${periodLabel()} compared with the same period last year\n${R.map(r=>`- **${r.d.short}**: ${pct(r.c.score)}${r.ly==null?' (no figure for last year)':` against ${pct(r.ly)} last year — ${r.c.score>=r.ly?'up':'down'} ${Math.abs(r.c.score-r.ly).toFixed(1)} points`}`).join('\n')}\n\n${(()=>{const w=R.filter(r=>r.ly!=null).sort((a,b)=>(a.c.score-a.ly)-(b.c.score-b.ly))[0];return w&&w.c.score<w.ly?`**${w.d.short}** has fallen the most.`:'No department is below last year.'})()}`:'There are no approved results yet for this period.';
  if(/attention|focus|priorit|concern|worr|struggl|behind|need.*help|support/.test(s)&&!/kpi/.test(s)){const weak=R.filter(r=>r.c.score<B_.good).reverse();return weak.length?`**${weak.length} of ${R.length} departments** are below ${B_.good}% for ${periodLabel()}.\n\n${weak.map(r=>{const w=r.c.rows.filter(x=>x.ach!=null).sort((a,b)=>a.ach-b.ach)[0];const cap=S.caps.find(c=>c.deptId===r.d.id&&c.status!=='Completed');return `- **${r.d.short}** at ${pct(r.c.score)} (${t(band(r.c.score).label).toLowerCase()}). Weakest KPI: ${w?`${w.k.name} at ${pct(w.ach)}`:'none reported'}. ${cap?`Plan ${cap.ref} is ${capProgress(cap)}% complete.`:r.c.score<B_.warning?'No action plan yet.':''}`}).join('\n')}\n\n### Recommended actions\n${weak.filter(r=>r.c.score<B_.warning&&!S.caps.some(c=>c.deptId===r.d.id&&c.status!=='Completed')).map(r=>`- Ask ${uname(r.d.headId)} (${r.d.short}) for a corrective action plan.`).join('\n')||'- Review progress on the open action plans at the next meeting.'}\n- Ask me about any department by name for its KPI detail.`:`All ${R.length} departments are on track for ${periodLabel()}.`}
  if(/\b(rank|ranking|best|worst|top|bottom|strongest|weakest|highest|lowest|leading)\b/.test(s)&&!/kpi|indicator/.test(s))return R.length?`### Department ranking — ${periodLabel()}\n${R.map((r,i)=>`${i+1}. **${r.d.short}** — ${pct(r.c.score)} (${t(band(r.c.score).label).toLowerCase()})`).join('\n')}`:'There are no approved results yet for this period.';
  if(/kpi|indicator/.test(s)&&/(weak|worst|below|behind|off track|underperform|lowest|problem|fail|poor|which|list)/.test(s)){const rows=scopedDepts().flatMap(x=>deptCalc(x.id,ms).rows).filter(r=>r.ach!=null).sort((a,b)=>a.ach-b.ach);const low=rows.filter(r=>r.ach<B_.good);return rows.length?`**${low.length} of ${rows.length} KPIs** with results are below ${B_.good}% for ${periodLabel()}.\n\n${(low.length?low:rows).slice(0,10).map(r=>`- ${r.k.name} (${r.k.code}, ${dept(r.k.deptId).short}): **${pct(r.ach)}** — ${fmt(r.actual,r.k.unit)} against ${fmt(r.target,r.k.unit)}`).join('\n')}`:'No KPI has an approved result yet for this period.'}
  if(/overdue|late|missing|not (yet )?submitted|outstanding|deadline/.test(s)&&!/request|citizen|complain/.test(s)){const od=al.filter(a=>a.type==='Overdue submission');return od.length?`**${od.length} report(s)** are overdue.\n\n${od.map(a=>`- ${dept(a.deptId)?.short}: ${a.text}`).join('\n')}\n\nReports are entered under **Reporting & approvals**.`:'No reports are overdue.'}
  if(/approv|verif|pending|waiting|my action|to.?do|decision|for me\b/.test(s)){const q2=myQueue(),kp=kpiToApprove(),tp=tpToApprove(),kr=kpiReturned(),tr=tpReturned(),em=sum((S.employees||[]).map(empTodo));const lines=[];
    if(q2.length)lines.push(`### Reports (${q2.length})\n${q2.slice(0,10).map(x=>{const kk=kpi(x.kpiId);return `- ${kk.name} (${kk.code}) — ${MONTHS[x.m]}, ${SUBST[x.status][2].toLowerCase()}`}).join('\n')}\nOpen **Reporting & approvals**.`);
    if(kp.length+tp.length)lines.push(`### KPIs and targets to approve (${kp.length+tp.length})\n${[...kp.map(x=>`- New KPI: ${x.name} (${dept(x.deptId).short})`),...tp.map(x=>`- Target change: ${kpi(x.kpiId).name} (${dept(kpi(x.kpiId).deptId).short})`)].join('\n')}\nOpen **KPIs & targets**.`);
    if(kr.length+tr.length)lines.push(`### Returned to you (${kr.length+tr.length})\n${[...kr.map(x=>`- New KPI: ${x.name} — ${x.decisionComment}`),...tr.map(x=>`- Target change: ${kpi(x.kpiId).name} — ${x.comment}`)].join('\n')}\nOpen **KPIs & targets** and click **Edit**.`);
    if(em)lines.push(`### Employees\n- ${em} item(s) to review or complete. Open **Employees**.`);
    return lines.length?lines.join('\n\n'):'Nothing is waiting for your action.'}
  if(/alert|risk|problem|issue|warning/.test(s))return al.length?`There are **${al.length} active alerts** for ${periodLabel()}, ${al.filter(a=>['critical','serious'].includes(a.sev)).length} of them serious or critical.\n\n${al.slice(0,10).map(a=>`- **${a.type}** (${dept(a.deptId)?.short}): ${a.text}`).join('\n')}${al.length>10?`\n\n…and ${al.length-10} more under **Alerts & actions**.`:''}`:'There are no active alerts.';
  if(/action plan|corrective|\bcap\b|recovery/.test(s)){const cs=S.caps.filter(c=>inScope(c.deptId));const open=cs.filter(c=>c.status!=='Completed');const today=new Date().toISOString().slice(0,10);return cs.length?`**${open.length} open** corrective action plan(s), ${cs.length-open.length} completed.\n\n${open.map(c=>{const od=c.actions.filter(a=>!a.done&&a.due<today).length;return `- **${c.ref}** (${dept(c.deptId).short}): ${c.title} — ${capProgress(c)}% done${od?`, **${od} action(s) overdue**`:''}`}).join('\n')||'- None open.'}`:'There are no corrective action plans.'}
  if(/target|proposal|propos/.test(s)){const ks=S.kpis.filter(x=>inScope(x.deptId));const appr=ks.filter(x=>x.approval==='approved'&&x.active);const pend=kpiProps(),tps=tpList().filter(p=>['pending','returned'].includes(p.status));return `**${appr.length} KPIs** are approved, and their targets are locked.\n\n- New KPIs awaiting a decision: ${pend.filter(x=>x.approval==='proposed').length}\n- New KPIs returned for revision: ${pend.filter(x=>x.approval==='returned').length}\n- Target changes awaiting a decision: ${tps.filter(p=>p.status==='pending').length}\n- Target changes returned: ${tps.filter(p=>p.status==='returned').length}\n\nEverything is on the **KPIs & targets** page.`}
  if(/employee|staff perform|individual/.test(s)&&(S.employees||[]).length){const es=S.employees.map(e=>({e,s:empScore(e)}));const sc=es.filter(x=>x.s!=null).sort((a,b)=>a.s-b.s);return `**${es.length} employee record(s)** in your view; ${sum(S.employees.map(empTodo))} item(s) need attention.\n\n${sc.slice(0,8).map(x=>`- ${x.e.name} (${dept(x.e.deptId)?.short}): ${pct(x.s)}${x.e.evaluation?`, rated ${x.e.evaluation.rating}`:''}`).join('\n')}`}
  if(/request|complain|citizen|escalat|service desk|appointment/.test(s)){const rs=S.requests.filter(r=>deskVisible(r)&&!['Resolved','Closed'].includes(r.status));return rs.length?`**${rs.length} open request(s)**; ${rs.filter(r=>slaInfo(r).key==='critical').length} overdue.\n\n${rs.slice(0,12).map(r=>`- ${r.ref} ${r.subject} — ${r.status}, ${slaInfo(r).label}${r.esc?`, escalation level ${r.esc}`:''}`).join('\n')}`:'There are no open citizen requests in your view.'}
  if(/brief|summary|summar|overview|today|status|how are we|how is the city|performance|dashboard|report|update/.test(s)){const city=cityIndex(ms);const best=R[0],worst=R[R.length-1];
    if(!R.length)return `There are no approved results yet for ${periodLabel()}, so there is no score to report. ${myQueue().length?`${myQueue().length} report(s) are waiting for your action.`:''}`;
    return `### Briefing — ${periodLabel()}\n${R.length>1?`City performance is **${pct(city)}** (${t(band(city).label).toLowerCase()}).`:`${R[0].d.name} scores **${pct(R[0].c.score)}** (${t(band(R[0].c.score).label).toLowerCase()}).`}\n\n${R.length>1?`- Strongest: **${best.d.short}** at ${pct(best.c.score)}\n- Weakest: **${worst.d.short}** at ${pct(worst.c.score)}\n`:''}- ${al.filter(a=>['critical','serious'].includes(a.sev)).length} serious or critical alerts\n- ${myQueue().length} report(s) waiting for your action\n- ${kpiToApprove().length+tpToApprove().length+kpiReturned().length+tpReturned().length} KPI or target proposal(s) waiting for you\n- ${S.caps.filter(c=>inScope(c.deptId)&&c.status!=='Completed').length} open corrective action plan(s)\n\n### Recommended actions\n${worst&&worst.c.score<B_.warning?`- Review ${worst.d.short}'s corrective action plan with ${uname(worst.d.headId)} this week.\n`:''}${myQueue().length?'- Clear the pending reports so the latest figures count in the scores.':'- No reports are waiting for you.'}`}
  const h=AIH.howto(s);if(h)return h;
  return `I could not match that to something I can look up.\n\n${AIH.menu()}`;
}
