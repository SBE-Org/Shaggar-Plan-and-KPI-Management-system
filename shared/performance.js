/* Performance engine — the single source of truth for scoring, used by the
   backend (alerts, notifications, public API, AI tools) and by the browser
   (dashboards). It works on a "state" object with this shape:
     { config:{bands,cap,currentMonth,deadlineDay,fy,fyStart},
       depts:[{id,short,name,headId}], kpis:[{id,code,deptId,name,unit,dir,freq,agg,weight,active,targets[12]}],
       subs:[{id,kpiId,m,actual,status}], prev:{[kpiId]:[{t,a}x4]}, caps:[{id,ref,deptId,kpiId,status,actions:[{text,due,done}]}] }
   createEngine({ getState, scopeIds, provisional, period }) returns pure functions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants'));
  else root.createPerfEngine = factory(root.SHARED);
})(typeof self !== 'undefined' ? self : this, function (C) {
  const { MONTHS, sum, avg, pct, fmt } = C;

  return function createEngine(opts) {
    const S = () => opts.getState();
    const scopeIds = () => (opts.scopeIds ? opts.scopeIds() : S().depts.map(d => d.id));
    const provisional = () => (opts.provisional ? opts.provisional() : false);
    const defPeriod = () => (opts.period ? opts.period() : { type: 'Y', v: 0 });

    const monthYear = m => (m < 6 ? S().config.fyStart : S().config.fyStart + 1);
    const due = (k, m) => k.freq === 'monthly' || m % 3 === 2;
    const subFor = (kid, m) => S().subs.find(s => s.kpiId === kid && s.m === m);
    const countable = s => !!s && (s.status === 'approved' || (provisional() && ['submitted', 'verified'].includes(s.status)));
    function periodMonths(p = defPeriod()) { if (p.type === 'M') return [p.v]; if (p.type === 'Q') return [p.v * 3, p.v * 3 + 1, p.v * 3 + 2]; return [...Array(12).keys()]; }
    function periodLabel(p = defPeriod()) { if (p.type === 'M') return `${MONTHS[p.v]} ${monthYear(p.v)}`; if (p.type === 'Q') return `Q${p.v + 1} FY${S().config.fy}`; return `FY${S().config.fy} year-to-date`; }
    function prevPeriod(p = defPeriod()) { if (p.type === 'M' && p.v > 0) return { type: 'M', v: p.v - 1 }; if (p.type === 'Q' && p.v > 0) return { type: 'Q', v: p.v - 1 }; return null; }
    function parsePeriod(p) { if (!p || p === 'Y') return { type: 'Y', v: 0 }; p = String(p).toUpperCase(); if (/^Q[1-4]$/.test(p)) return { type: 'Q', v: +p[1] - 1 }; if (/^M\d{1,2}$/.test(p)) return { type: 'M', v: Math.min(11, +p.slice(1)) }; return { type: 'Y', v: 0 }; }
    const aggr = (k, arr) => (arr.length ? (k.agg === 'sum' ? sum(arr) : avg(arr)) : null);
    function achv(k, a, t) { if (a == null || t == null) return null; if (k.dir === 'higher') return t ? a / t * 100 : null; return a ? t / a * 100 : S().config.cap; }

    function kpiCalc(k, months) {
      const ms = months.filter(m => m < S().config.currentMonth && due(k, m));
      const T = [], A = []; let rep = 0;
      ms.forEach(m => { const s = subFor(k.id, m); if (countable(s)) { T.push(k.targets[m]); A.push(s.actual); rep++; } });
      if (!A.length) return { target: aggr(k, ms.map(m => k.targets[m])), actual: null, ach: null, due: ms.length, rep: 0 };
      const t = aggr(k, T), a = aggr(k, A);
      return { target: t, actual: a, ach: achv(k, a, t), due: ms.length, rep };
    }
    function deptCalc(did, months) {
      const ks = S().kpis.filter(k => k.deptId === did && k.active);
      const rows = ks.map(k => ({ k, ...kpiCalc(k, months) }));
      const m = rows.filter(r => r.ach != null);
      const W = sum(m.map(r => r.k.weight));
      const score = W ? sum(m.map(r => r.k.weight * Math.min(r.ach, S().config.cap))) / W : null;
      return { rows, score, due: sum(rows.map(r => r.due)), rep: sum(rows.map(r => r.rep)) };
    }
    const scopedDeptList = () => S().depts.filter(d => scopeIds().includes(d.id));
    function cityIndex(months, depts = scopedDeptList()) { return avg(depts.map(d => deptCalc(d.id, months).score).filter(v => v != null)); }
    function lastYearKpi(k, months) {
      const qs = [...new Set(months.filter(m => m < S().config.currentMonth).map(m => Math.floor(m / 3)))];
      const P = S().prev[k.id]; if (!qs.length || !P) return null;
      return achv(k, aggr(k, qs.map(q => P[q].a)), aggr(k, qs.map(q => P[q].t)));
    }
    function lastYearDept(did, months) {
      const ks = S().kpis.filter(k => k.deptId === did && k.active).map(k => ({ k, a: lastYearKpi(k, months) })).filter(x => x.a != null);
      const W = sum(ks.map(x => x.k.weight)); return W ? sum(ks.map(x => x.k.weight * Math.min(x.a, S().config.cap))) / W : null;
    }
    function band(v) {
      const b = S().config.bands;
      if (v == null) return { key: 'none', label: 'No data', icon: '–' };
      if (v >= b.good) return { key: 'good', label: 'On track', icon: '✓' };
      if (v >= b.warning) return { key: 'warning', label: 'Needs attention', icon: '!' };
      if (v >= b.serious) return { key: 'serious', label: 'Underperforming', icon: '▼' };
      return { key: 'critical', label: 'Critical', icon: '✕' };
    }
    function pastDeadline(m, now = new Date()) { const cm = S().config.currentMonth; if (m < cm - 1) return true; if (m === cm - 1) return now.getDate() > S().config.deadlineDay; return false; }
    function cellState(k, m) {
      if (!due(k, m)) return null;
      const s = subFor(k.id, m);
      if (s) return s.status;
      if (m >= S().config.currentMonth) return 'notdue';
      return pastDeadline(m) ? 'missing' : 'open';
    }
    function monthlyAch(k) { return [...Array(12).keys()].map(m => { if (m >= S().config.currentMonth || !due(k, m)) return null; const s = subFor(k.id, m); return countable(s) ? achv(k, s.actual, k.targets[m]) : null; }); }

    function alerts(period = defPeriod()) {
      const out = [], months = periodMonths(period), b = S().config.bands, ids = scopeIds();
      scopedDeptList().forEach(d => {
        const dc = deptCalc(d.id, months);
        if (dc.score != null && dc.score < b.warning) out.push({ key: 'D-' + d.id, sev: band(dc.score).key, type: 'Underperforming department', deptId: d.id, kpiId: null, text: `${d.short} scored ${pct(dc.score)} for ${periodLabel(period)}, below the ${b.warning}% performance threshold.` });
        dc.rows.forEach(r => {
          if (r.ach != null && r.ach < b.warning) out.push({ key: 'K-' + r.k.id, sev: band(r.ach).key, type: 'KPI below threshold', deptId: d.id, kpiId: r.k.id, text: `${r.k.code} ${r.k.name}: ${pct(r.ach)} of target (${fmt(r.actual, r.k.unit)} vs ${fmt(r.target, r.k.unit)}).` });
          const ma = monthlyAch(r.k).map((v, m) => [m, v]).filter(p => p[1] != null);
          if (ma.length >= 3) { const last = ma.slice(-3), [x, y, z] = last.map(p => p[1]); if (z < y && y < x && z < b.good) out.push({ key: 'T-' + r.k.id, sev: 'warning', type: 'Declining trend (early warning)', deptId: d.id, kpiId: r.k.id, text: `${r.k.name} (${r.k.code}) is falling. Achievement against target dropped three reporting periods in a row: ${last.map(p => `${MONTHS[p[0]]} ${pct(p[1])}`).join(', ')}.` }); }
        });
        S().kpis.filter(k => k.deptId === d.id && k.active).forEach(k => {
          for (let m = 0; m < S().config.currentMonth; m++) {
            if (!due(k, m)) continue; const s = subFor(k.id, m);
            if ((!s || s.status === 'draft') && pastDeadline(m)) out.push({ key: `O-${k.id}-${m}`, sev: 'serious', type: 'Overdue submission', deptId: d.id, kpiId: k.id, m, text: `${k.code} ${k.name}: ${MONTHS[m]} ${monthYear(m)} report not submitted (deadline: day ${S().config.deadlineDay} of the following month).` });
            if (s && s.status === 'returned') out.push({ key: `R-${s.id}`, sev: 'warning', type: 'Returned for correction', deptId: d.id, kpiId: k.id, m, subId: s.id, text: `${k.code} ${MONTHS[m]} ${monthYear(m)} submission was returned and awaits resubmission.` });
          }
        });
      });
      const today = new Date().toISOString().slice(0, 10);
      S().caps.filter(c => ids.includes(c.deptId) && c.status !== 'Completed').forEach(c => {
        const od = c.actions.filter(a => !a.done && a.due < today);
        if (od.length) out.push({ key: 'C-' + c.id, sev: 'serious', type: 'Corrective action overdue', deptId: c.deptId, kpiId: c.kpiId, capId: c.id, text: `${c.ref}: ${od.length} action(s) past due date — "${od[0].text}".` });
      });
      const order = { critical: 0, serious: 1, warning: 2, good: 3, none: 4 };
      return out.sort((a, c) => order[a.sev] - order[c.sev]);
    }

    return { monthYear, due, subFor, countable, periodMonths, periodLabel, prevPeriod, parsePeriod, aggr, achv, kpiCalc, deptCalc, cityIndex, lastYearKpi, lastYearDept, band, pastDeadline, cellState, monthlyAch, alerts };
  };
});
