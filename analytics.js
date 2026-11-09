'use strict';

(function (root, factory) {
  const analytics = factory();
  if (typeof module === 'object' && module.exports) module.exports = analytics;
  if (root) root.ClearbookAnalytics = analytics;
})(typeof window === 'undefined' ? null : window, () => {
  const DAY = 86400000;
  const TYPES = {EXPENSE:'Expense', CREDIT:'Client credit', PAYBACK:'Payback', TRANSFER:'Transfer'};
  const DIMENSIONS = {category:'Category', vendor:'Vendor', client:'Client', location:'Location', account:'Business account', mode:'Payment mode'};
  const PERIODS = {all:'All time', month:'This month', lastMonth:'Last month', quarter:'This quarter', financialYear:'Financial year', last90:'Last 90 days', custom:'Custom dates'};
  const METRICS = {expenses:'Expenses', credits:'Client credits', paybacks:'Paybacks', volume:'Transaction value'};
  const WIDGETS = {trend:'Money over time', breakdown:'Breakdown explorer', locations:'Location performance', relationships:'Clients & vendors', accounts:'Business accounts', ledger:'Transaction explorer'};
  const COLORS = ['#315f4b','#8da97a','#ba9161','#7395a7','#8d7aa4','#b97963','#729a8a','#b4ab70'];
  const defaults = () => ({period:'all', from:'', to:'', account:'', client:'', vendor:'', category:'', location:'', mode:'', type:'', group:'month', dimension:'category', metric:'expenses', chart:'cashflow', compare:true, widgets:Object.keys(WIDGETS), search:'', sort:'date-desc', ledgerPage:1, advanced:false, customize:false});
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', minimumFractionDigits:0, maximumFractionDigits:2}).format(n / 100);
  const compactMoney = n => Math.abs(n)>=10000000 ? `₹${(n/10000000).toLocaleString('en-IN',{maximumFractionDigits:1})}L` : Math.abs(n)>=100000 ? `₹${(n/100000).toLocaleString('en-IN',{maximumFractionDigits:1})}k` : money(n);
  const cents = t => Math.round(Number(t.amount) * 100);
  const total = rows => rows.reduce((n,t) => n+cents(t), 0);
  const date = iso => new Date(`${iso}T00:00:00Z`);
  const iso = day => day.toISOString().slice(0,10);
  const shift = (day, n) => iso(new Date(date(day).getTime()+n*DAY));
  const labelDate = value => date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(date(value).getTime()) && iso(date(value))===value;
  const sumByType = (rows, type) => total(rows.filter(t => t.type===type));

  function sanitize(input = {}) {
    const out = defaults();
    for (const [key,choices] of Object.entries({period:PERIODS, group:{day:1,week:1,month:1}, dimension:DIMENSIONS, metric:METRICS, chart:{cashflow:1,activity:1}, sort:{'date-desc':1,'date-asc':1,'amount-desc':1,'amount-asc':1}})) {
      if (Object.hasOwn(choices,input[key])) out[key]=input[key];
    }
    for (const key of ['account','client','vendor','category','location','mode','type']) if (typeof input[key]==='string') out[key]=input[key].slice(0,200);
    for (const key of ['from','to']) if (validDate(input[key])) out[key]=input[key];
    if (typeof input.compare==='boolean') out.compare=input.compare;
    if (Array.isArray(input.widgets)) out.widgets=[...new Set(input.widgets.filter(k => Object.hasOwn(WIDGETS,k)))];
    return out;
  }

  function resolveRange(settings, rows, today) {
    const year=Number(today.slice(0,4)), month=Number(today.slice(5,7));
    let from='', to=today;
    switch (settings.period) {
      case 'month': from=today.slice(0,7)+'-01'; break;
      case 'lastMonth': to=shift(today.slice(0,7)+'-01',-1); from=to.slice(0,7)+'-01'; break;
      case 'quarter': from=`${year}-${String(Math.floor((month-1)/3)*3+1).padStart(2,'0')}-01`; break;
      case 'financialYear': from=`${month<4?year-1:year}-04-01`; break;
      case 'last90': from=shift(today,-89); break;
      case 'custom': from=settings.from; to=settings.to; break;
      default: {
        const dates=rows.map(t=>t.date).sort();
        from=dates[0] || today;
        to=dates[dates.length-1] || today;
      }
    }
    if (settings.period==='custom' && (!validDate(from)||!validDate(to))) return {from,to,error:'Choose both a start date and an end date.'};
    if (from>to) return {from,to,error:'The start date must be on or before the end date.'};
    return {from,to};
  }

  function matches(t,s) {
    return (!s.account || t.payer===s.account || t.recipient===s.account) &&
      (!s.client || t.client_id===s.client) && (!s.vendor || t.vendor===s.vendor) &&
      (!s.category || t.category===s.category) && (!s.location || t.location===s.location) &&
      (!s.mode || t.mode===s.mode) && (!s.type || t.type===s.type);
  }

  function movement(t, accountMap, selectedAccount='') {
    const isBusiness = id => accountMap.get(id)?.type==='INTERNAL';
    const scoped = isBusiness(selectedAccount);
    const from = scoped ? t.payer===selectedAccount : isBusiness(t.payer);
    const to = scoped ? t.recipient===selectedAccount : isBusiness(t.recipient);
    // A transfer between selected business accounts has no consolidated movement.
    if (from && to) return {incoming:0, outgoing:0};
    return {incoming:to?cents(t):0, outgoing:from?cents(t):0};
  }

  function totals(rows, accountMap, selectedAccount) {
    const values={expenses:sumByType(rows,'EXPENSE'), credits:sumByType(rows,'CREDIT'), paybacks:sumByType(rows,'PAYBACK'), incoming:0, outgoing:0, count:rows.length};
    for (const row of rows) {
      const flow=movement(row,accountMap,selectedAccount);
      values.incoming+=flow.incoming; values.outgoing+=flow.outgoing;
    }
    values.operating=values.credits-values.expenses;
    values.net=values.incoming-values.outgoing;
    return values;
  }

  function breakdown(rows, dimension, metric, data) {
    const accounts=new Map(data.accounts.map(a=>[a.id,a]));
    const vendors=new Map(data.vendors.map(v=>[v.id,v]));
    const clients=new Map(data.clients.map(c=>[c.id,c]));
    const eligible=rows.filter(t=>metric==='volume'||t.type===({expenses:'EXPENSE',credits:'CREDIT',paybacks:'PAYBACK'}[metric]));
    const groups=new Map();
    for (const t of eligible) {
      let key=t[dimension] || '', name='Unassigned';
      if (dimension==='category') name=t.category || 'No expense category';
      if (dimension==='location') name=t.location || 'No location';
      if (dimension==='mode') name=t.mode==='CASH'?'Cash':t.mode || 'No payment mode';
      if (dimension==='vendor') {key=t.vendor||'';name=vendors.get(key)?.name || 'No vendor';}
      if (dimension==='client') {key=t.client_id||'';name=clients.get(key)?.name || 'No client';}
      if (dimension==='account') {
        const payer=accounts.get(t.payer), recipient=accounts.get(t.recipient);
        key=payer?.type==='INTERNAL'?payer.id:recipient?.type==='INTERNAL'?recipient.id:'';
        name=accounts.get(key)?.name || 'Externally paid';
        if (t.type==='TRANSFER' && payer?.type==='INTERNAL' && recipient?.type==='INTERNAL') name=`${payer.name} → ${recipient.name}`;
      }
      const groupKey=dimension==='account'?`${key}:${name}`:key;
      const g=groups.get(groupKey)||{key,name,value:0,count:0,ids:[]};
      g.value+=cents(t);g.count++;g.ids.push(t.id);groups.set(groupKey,g);
    }
    const sum=total(eligible);
    return [...groups.values()].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).map(g=>({...g,share:sum?g.value/sum*100:0}));
  }

  function series(rows, range, group, accountMap, selectedAccount) {
    const keyFor = value => group==='month'?value.slice(0,7)+'-01':group==='week'?shift(value,-((date(value).getUTCDay()+6)%7)):value;
    let cursor=keyFor(range.from), end=keyFor(range.to);
    const buckets=new Map();
    while (cursor<=end && buckets.size<=10000) {
      buckets.set(cursor,{date:cursor,credits:0,expenses:0,incoming:0,outgoing:0,count:0});
      cursor=group==='month'?iso(new Date(Date.UTC(Number(cursor.slice(0,4)),Number(cursor.slice(5,7)),1))):shift(cursor,group==='week'?7:1);
    }
    for (const t of rows) {
      const b=buckets.get(keyFor(t.date));
      if (!b) continue;
      if (t.type==='CREDIT') b.credits+=cents(t);
      if (t.type==='EXPENSE') b.expenses+=cents(t);
      const flow=movement(t,accountMap,selectedAccount);
      b.incoming+=flow.incoming; b.outgoing+=flow.outgoing; b.count++;
    }
    return [...buckets.values()];
  }

  function buildReport(data, settings, today) {
    const active=data.transactions.filter(t=>!t.reversed_at && t.status?.[0]!=='reversed');
    const range=resolveRange(settings,active,today);
    const accountMap=new Map(data.accounts.map(a=>[a.id,a]));
    if (range.error) return {error:range.error,range,rows:[],active};
    const inRange=t=>t.date>=range.from && t.date<=range.to;
    const rows=active.filter(t=>matches(t,settings)&&inRange(t));
    const days=Math.round((date(range.to)-date(range.from))/DAY)+1;
    const previousRange={from:shift(range.from,-days),to:shift(range.from,-1)};
    const previous=active.filter(t=>matches(t,settings)&&t.date>=previousRange.from&&t.date<=previousRange.to);
    const current=totals(rows,accountMap,settings.account), prior=totals(previous,accountMap,settings.account);
    // Keep charts readable without silently discarding dates from long ranges.
    let group=settings.group;
    if (days>120 && group==='day') group=days>840?'month':'week';
    if (days>840 && group==='week') group='month';
    const result={rows,active,range,previousRange,current,prior,group,series:series(rows,range,group,accountMap,settings.account),groups:breakdown(rows,settings.dimension,settings.metric,data)};
    result.locations=breakdown(rows,'location','volume',data).map(g=>({...g,...totals(rows.filter(t=>g.ids.includes(t.id)),accountMap,settings.account)}));
    result.clients=breakdown(rows,'client','credits',data);
    result.vendors=breakdown(rows,'vendor','expenses',data);
    result.accounts=data.accounts.filter(a=>a.type==='INTERNAL'&&(!settings.account||a.id===settings.account)).map(a=>({ ...a, ...totals(rows.filter(t=>t.payer===a.id||t.recipient===a.id),accountMap,a.id)}));
    return result;
  }

  function csvCell(value) {
    let text=String(value ?? '');
    if (/^[\s]*[=+@\-\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }
  const csv = rows => '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const options = (values, selected) => values.map(([value,label])=>`<option value="${escape(value)}" ${selected===value?'selected':''}>${escape(label)}</option>`).join('');
  const select = (key,label,values,current,allLabel='') => `<label class="an-field"><span>${escape(label)}</span><select data-an-setting="${key}">${allLabel?`<option value="">${allLabel}</option>`:''}${options(values,current)}</select></label>`;
  const action = (name,label,extra='') => `<button type="button" class="button ${name==='export'?'primary':''}" data-an-action="${name}" ${extra}>${label}</button>`;
  const empty = (title,description='Try a wider date range or clear a filter.') => `<div class="an-empty"><span aria-hidden="true">↗</span><strong>${escape(title)}</strong><p>${escape(description)}</p></div>`;

  function create() {
    let settings=defaults(), views=[], scope=null, context=null, report=null, drill=null;
    const storageKey=()=>`clearbook.analytics.v1.${scope}`;
    const persist=()=>{
      try { window.localStorage.setItem(storageKey(),JSON.stringify({settings:sanitize(settings),views})); }
      catch { /* A browser with storage disabled can still use the page. */ }
    };
    function loadScope(workspace) {
      if (scope===workspace) return;
      scope=workspace;settings=defaults();views=[];drill=null;
      try {
        const saved=JSON.parse(window.localStorage.getItem(storageKey())||'null');
        if (saved) {
          settings=sanitize(saved.settings);
          views=Array.isArray(saved.views)?saved.views.slice(0,12).filter(v=>typeof v.name==='string'&&typeof v.id==='string').map(v=>({id:v.id.slice(0,80),name:v.name.slice(0,48),settings:sanitize(v.settings)})):[];
        }
      } catch { /* Ignore corrupt or unavailable browser preferences. */ }
    }
    const update=()=>{persist();context.repaint();};
    const rangeLabel = r => `${labelDate(r.from)} – ${labelDate(r.to)}`;

    function header() {
      return `<header class="an-header"><div><div class="eyebrow">ANALYTICS / YOUR BUSINESS IN FOCUS</div><h1>See the story behind the numbers<span>.</span></h1><p>Follow your money. Understand your costs. Make your next move with clarity.</p></div><div class="an-header-actions">${action('customize','⚙ <span>Customize</span>',`aria-expanded="${settings.customize}" aria-controls="an-customize"`)}${action('export','↓ <span>Export report</span>') }</div></header>`;
    }

    function controls() {
      const d=context.data;
      const referenceOptions=(list)=>list.map(v=>[v.id,v.name]).sort((a,b)=>a[1].localeCompare(b[1]));
      const unique=key=>[...new Set([...(key==='category'?(context.categories||[]):key==='location'?(context.locations||[]):[]),...d.transactions.map(t=>t[key]).filter(Boolean)])].sort().map(v=>[v,v==='CASH'?'Cash':v]);
      return `<section class="an-controls" aria-label="Analytics filters"><div class="an-control-main">${select('period','Date range',Object.entries(PERIODS),settings.period)}<label class="an-field"><span>From</span><input type="date" data-an-setting="from" value="${escape(report.range.from||'')}"></label><label class="an-field"><span>To</span><input type="date" data-an-setting="to" value="${escape(report.range.to||'')}"></label>${select('location','Location',unique('location'),settings.location,'All locations')}${select('account','Account',referenceOptions(d.accounts),settings.account,'All accounts')}<button class="button an-filter-toggle" data-an-action="advanced" aria-expanded="${settings.advanced}" aria-controls="an-advanced">More filters <span>${['client','vendor','category','mode','type'].filter(k=>settings[k]).length || '+'}</span></button></div><div id="an-advanced" class="an-control-advanced" ${settings.advanced?'':'hidden'}>${select('client','Client',referenceOptions(d.clients),settings.client,'All clients')}${select('vendor','Vendor',referenceOptions(d.vendors),settings.vendor,'All vendors')}${select('category','Category',unique('category'),settings.category,'All categories')}${select('mode','Payment mode',unique('mode'),settings.mode,'All modes')}${select('type','Transaction type',Object.entries(TYPES),settings.type,'All types')}</div><div class="an-control-foot"><label class="an-check"><input type="checkbox" data-an-setting="compare" ${settings.compare?'checked':''}> Compare with previous period</label><div class="an-filter-info"><span>${report.error?'Check dates':`${report.current.count.toLocaleString('en-IN')} transactions in view`}</span><button data-an-action="reset" class="button text">Reset filters</button><button class="button text" data-action="refresh" ${context.loading?'disabled':''}>↻ Refresh</button></div></div></section>`;
    }

    function customization() {
      return `<section id="an-customize" class="an-customize" ${settings.customize?'':'hidden'}><div class="an-section-head"><div><h2>Make this view yours</h2><p>Choose your panels and save a view for next time. Saved in this browser for this workspace.</p></div><button class="button text" data-an-action="customize">Done ✓</button></div><div class="an-widget-options">${Object.entries(WIDGETS).map(([key,label])=>`<label class="an-check"><input type="checkbox" data-an-widget="${key}" ${settings.widgets.includes(key)?'checked':''}>${label}</label>`).join('')}</div><div class="an-save-row"><form id="analytics-view-form"><label class="sr-only" for="an-view-name">View name</label><input id="an-view-name" name="viewName" maxlength="48" required placeholder="Name this view, e.g. Madnoor monthly"><button class="button primary" type="submit">Save view</button></form>${action('restore','Restore default layout')}</div></section>`;
    }

    function savedViews() {
      if (!views.length) return '';
      return `<div class="an-saved"><span>YOUR VIEWS</span>${views.map(v=>`<div class="an-saved-view"><button data-an-action="view" data-an-id="${escape(v.id)}">${escape(v.name)}</button><button data-an-action="delete-view" data-an-id="${escape(v.id)}" aria-label="Delete saved view ${escape(v.name)}">×</button></div>`).join('')}</div>`;
    }

    function comparison(key) {
      if (!settings.compare) return '';
      const a=report.current[key], b=report.prior[key];
      if (!b) return `<span class="an-delta neutral">${a?'No previous activity':'No change'}</span>`;
      const delta=a-b;
      const sign=delta>0?'+':'';
      const result=b>0?`${sign}${(delta/Math.abs(b)*100).toLocaleString('en-IN',{maximumFractionDigits:1})}%`:`${sign}${money(delta)}`;
      return `<span class="an-delta ${delta===0?'neutral':key==='expenses'?(delta>0?'down':'up'):(delta>0?'up':'down')}">${delta>0?'↗':delta<0?'↘':'—'} ${result}</span><span class="an-delta-label">vs previous period</span>`;
    }

    function kpis() {
      const c=report.current;
      const list=[['credits','Client credits','Money received from your clients','↙'],['expenses','Total expenses','Business and externally funded expenses','↗'],['operating','Credits less expenses','Receipts minus expenses · not accounting profit','≈'],['net','Net account movement','Business inflows minus outflows · excludes opening balance','⇄']];
      return `<div class="an-kpis">${list.map(([key,label,hint,symbol])=>`<section class="an-kpi ${key==='net'?'an-kpi-featured':''}"><div class="an-kpi-label">${label}<span>${symbol}</span></div><strong>${money(c[key])}</strong><div class="an-kpi-delta">${comparison(key)}</div><p>${hint}</p></section>`).join('')}</div>`;
    }

    function trend() {
      const isFlow=settings.chart==='cashflow', a=isFlow?'incoming':'credits', b=isFlow?'outgoing':'expenses';
      const labels=isFlow?['Money in','Money out']:['Client credits','Expenses'];
      const buckets=report.series, max=Math.max(1,...buckets.map(p=>Math.max(p[a],p[b])));
      const maxScale=Math.ceil(max/(10**Math.floor(Math.log10(max))))*(10**Math.floor(Math.log10(max)));
      const width=Math.max(650,buckets.length*42), height=232, x=55, y=16, bottom=184, inner=width-78;
      const bucketWidth=inner/Math.max(1,buckets.length);
      const yFor=value=>bottom-value/maxScale*(bottom-y);
      const labelEvery=Math.max(1,Math.ceil(buckets.length/12));
      const svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${labels.join(' and ')} by ${report.group}; exact values are available below" style="min-width:${width}px"><title>${escape(labels.join(' and '))} over the selected period</title>${[0,0.25,0.5,0.75,1].map(f=>`<line x1="${x}" y1="${yFor(maxScale*f)}" x2="${width-15}" y2="${yFor(maxScale*f)}" stroke="#e9eee7" stroke-dasharray="${f?'3 5':'0'}"/><text x="${x-9}" y="${yFor(maxScale*f)+4}" text-anchor="end" class="an-axis">${compactMoney(maxScale*f)}</text>`).join('')}${buckets.map((p,i)=>{const left=x+i*bucketWidth+bucketWidth*0.17, bar=Math.max(1,bucketWidth*0.26);const l=date(p.date).toLocaleDateString('en-IN',report.group==='month'?{month:'short',year:'2-digit',timeZone:'UTC'}:{day:'numeric',month:'short',timeZone:'UTC'});return `<g><title>${escape(labelDate(p.date))}: ${labels[0]} ${money(p[a])}; ${labels[1]} ${money(p[b])}</title><rect x="${left}" y="${yFor(p[a])}" width="${bar}" height="${bottom-yFor(p[a])}" rx="2" fill="#315f4b"/><rect x="${left+bar+2}" y="${yFor(p[b])}" width="${bar}" height="${bottom-yFor(p[b])}" rx="2" fill="#c8b48f"/>${i%labelEvery===0?`<text x="${left+bar}" y="207" text-anchor="middle" class="an-axis">${escape(l)}</text>`:''}</g>`;}).join('')}</svg>`;
      return `<section class="panel an-trend"><div class="an-section-head"><div><span class="an-overline">THE BIG PICTURE</span><h2>Money over time</h2><p>${isFlow?'Movement through your business accounts':'Client receipts alongside all recorded expenses'}</p></div><div class="an-inline-selects">${select('chart','Measure',[['cashflow','Account cash flow'],['activity','Credits & expenses']],settings.chart)}${select('group','Group by',[['day','Day'],['week','Week'],['month','Month']],settings.group)}</div></div><div class="an-chart-legend"><span><i></i>${labels[0]}</span><span><i></i>${labels[1]}</span><small>${report.group!==settings.group?`Grouped by ${report.group} to keep this range readable`:`${buckets.length} ${report.group}${buckets.length===1?'':'s'}`}</small></div>${report.rows.length?`<div class="an-chart-scroll" tabindex="0" aria-label="Scroll chart horizontally">${svg}</div>`:empty('No activity in this period')}<div class="an-trend-foot"><div><span>${labels[0]}</span><strong>${money(report.current[a])}</strong></div><div><span>${labels[1]}</span><strong>${money(report.current[b])}</strong></div><div><span>${isFlow?'Net movement':'Credits less expenses'}</span><strong>${money(report.current[a]-report.current[b])}</strong></div></div><details class="an-chart-details"><summary>View chart data</summary><div class="table-scroll"><table><thead><tr><th>PERIOD START</th><th>${labels[0].toUpperCase()}</th><th>${labels[1].toUpperCase()}</th><th>TRANSACTIONS</th></tr></thead><tbody>${buckets.map(p=>`<tr><td>${labelDate(p.date)}</td><td>${money(p[a])}</td><td>${money(p[b])}</td><td>${p.count}</td></tr>`).join('')}</tbody></table></div></details></section>`;
    }

    function breakdownPanel() {
      const groups=report.groups, value=groups.reduce((n,g)=>n+g.value,0);
      let position=0;
      const stops=groups.slice(0,7).map((g,i)=>{const start=position;position+=g.share;return `${COLORS[i]} ${start}% ${position}%`;});
      if (groups.length>7) stops.push(`#dce2d8 ${position}% 100%`);
      return `<section class="panel an-breakdown"><div class="an-section-head"><div><span class="an-overline">LOOK A LITTLE CLOSER</span><h2>Breakdown explorer</h2><p>Choose a measure. Select any row to see its transactions.</p></div></div><div class="an-breakdown-controls">${select('metric','Measure',Object.entries(METRICS),settings.metric)}${select('dimension','Break down by',Object.entries(DIMENSIONS),settings.dimension)}</div>${groups.length?`<div class="an-donut-wrap"><div class="an-donut" style="background:conic-gradient(${stops.join(',')})" role="img" aria-label="${escape(METRICS[settings.metric])} by ${escape(DIMENSIONS[settings.dimension])}; detailed amounts listed below"><div><span>${escape(METRICS[settings.metric])}</span><strong>${money(value)}</strong><small>${groups.length} ${escape(DIMENSIONS[settings.dimension].toLowerCase())} groups</small></div></div></div><div class="an-ranking">${groups.map((g,i)=>`<button class="an-rank" data-an-action="drill" data-an-index="${i}"><span class="an-rank-top"><span><i style="background:${COLORS[Math.min(i,7)]}"></i>${escape(g.name)}</span><strong>${money(g.value)}</strong></span><span class="an-rank-bottom"><span>${g.count} transaction${g.count===1?'':'s'}</span><span>${g.share.toFixed(1)}% ↗</span></span><span class="an-rank-track"><i style="width:${g.share}%;background:${COLORS[Math.min(i,7)]}"></i></span></button>`).join('')}</div>`:empty('No matching breakdown')}<div class="an-panel-foot">${action('export-breakdown','↓ Export breakdown')}<span>${settings.metric==='volume'?'Gross transaction value; includes transfers and paybacks.':'Shares are based on the selected measure.'}</span></div></section>`;
    }

    function insights() {
      const top=report.groups[0], credit=report.clients[0];
      const peak=[...report.series].sort((a,b)=>b.expenses-a.expenses)[0];
      const spending=report.current.expenses;
      const items=[
        {label:'Largest share',text:top?`${top.name} accounts for ${top.share.toFixed(1)}% of ${METRICS[settings.metric].toLowerCase()}.`:'Your breakdown insights will appear as transactions are added.'},
        {label:'Client concentration',text:credit?`${credit.name} contributed ${credit.share.toFixed(1)}% of client receipts in this view.`:'No client receipts in this view.'},
        {label:'Expense pace',text:peak&&spending?`${labelDate(peak.date)} starts the highest-spend ${report.group}: ${money(peak.expenses)}.`:'No recorded expenses in this view.'}
      ];
      return `<div class="an-insights">${items.map((item,i)=>`<div><span class="an-insight-icon">${['◔','↙','↗'][i]}</span><div><span>${item.label}</span><p>${escape(item.text)}</p></div></div>`).join('')}</div>`;
    }

    function locationPanel() {
      return `<section class="panel"><div class="an-section-head"><div><span class="an-overline">ACROSS YOUR SITES</span><h2>Location performance</h2><p>Receipts, costs and movement for every location in this view.</p></div></div><div class="table-scroll"><table class="an-data-table"><thead><tr><th>LOCATION</th><th>CLIENT CREDITS</th><th>EXPENSES</th><th>CREDITS − EXPENSES</th><th>PAYBACKS</th><th>NET MOVEMENT</th><th>COUNT</th></tr></thead><tbody>${report.locations.map(g=>`<tr><td><button class="an-table-link" data-an-action="location" data-an-value="${escape(g.key)}">${escape(g.name)} ↗</button></td><td>${money(g.credits)}</td><td>${money(g.expenses)}</td><td class="${g.operating<0?'an-negative':''}">${money(g.operating)}</td><td>${money(g.paybacks)}</td><td>${money(g.net)}</td><td>${g.count}</td></tr>`).join('')}</tbody></table></div>${report.locations.length?'':empty('No location activity')}<div class="an-explainer">Location labels match your transaction records. Shared labels such as “Central” or “Jubilee Hills / Madnoor” remain together.</div></section>`;
    }

    function relationships() {
      const list=(rows,kind,label)=>`<section class="panel"><div class="an-section-head"><div><span class="an-overline">${kind==='client'?'MONEY COMING IN':'WHERE YOU SPEND'}</span><h2>${label}</h2><p>${kind==='client'?'Client receipts in the selected period':'Expense payments in the selected period'}</p></div></div><div class="an-people-list">${rows.slice(0,6).map((g,i)=>`<button data-an-action="relationship" data-an-kind="${kind}" data-an-value="${escape(g.key)}"><span class="an-person-avatar">${i+1}</span><span class="an-person-name"><strong>${escape(g.name)}</strong><small>${g.count} payment${g.count===1?'':'s'} · ${g.share.toFixed(1)}% share</small></span><span class="an-person-amount">${money(g.value)} <small>↗</small></span></button>`).join('')}</div>${rows.length?'':empty(kind==='client'?'No client receipts':'No vendor expenses')}<div class="an-panel-foot"><span>Top ${Math.min(6,rows.length)} of ${rows.length} · use the breakdown explorer for the full list</span></div></section>`;
      return `<div class="an-two-columns">${list(report.clients,'client','Client contributions')}${list(report.vendors,'vendor','Vendor spending')}</div>`;
    }

    function accountPanel() {
      return `<section class="panel"><div class="an-section-head"><div><span class="an-overline">FOLLOW THE FUNDS</span><h2>Business account movement</h2><p>Actual inflows and outflows. Opening balances are not included.</p></div></div><div class="an-account-grid">${report.accounts.map(a=>`<button class="an-account-card" data-an-action="account" data-an-value="${escape(a.id)}"><span class="an-account-icon">⇄</span><strong>${escape(a.name)}</strong><div><span>Money in</span><b>${money(a.incoming)}</b></div><div><span>Money out</span><b>${money(a.outgoing)}</b></div><div class="an-account-net"><span>Net movement</span><b>${money(a.net)}</b></div><small>${a.count} transaction${a.count===1?'':'s'} · explore account ↗</small></button>`).join('')}</div>${report.accounts.length?'':empty('No business account selected','Choose a business account or reset the account filter.')}<div class="an-explainer">Internal transfers appear on each account. They cancel out in consolidated cash flow. Expenses paid by an external creditor count as expenses without reducing business account funds.</div></section>`;
    }

    function ledger() {
      const d=context.data;
      const map=list=>new Map(list.map(item=>[item.id,item.name]));
      const accounts=map(d.accounts),clients=map(d.clients),vendors=map(d.vendors);
      let rows=report.rows;
      if (drill) rows=rows.filter(t=>drill.ids.includes(t.id));
      const query=settings.search.toLowerCase().trim();
      if (query) rows=rows.filter(t=>[t.date,TYPES[t.type],clients.get(t.client_id),vendors.get(t.vendor),accounts.get(t.payer),accounts.get(t.recipient),t.category,t.location,t.mode,t.amount,t.source_import?.bank_transaction_id].some(v=>String(v||'').toLowerCase().includes(query)));
      const [by,order]=settings.sort.split('-');
      rows=[...rows].sort((a,b)=>(by==='amount'?cents(a)-cents(b):a.date.localeCompare(b.date))*(order==='desc'?-1:1)||a.id.localeCompare(b.id));
      const pageCount=Math.max(1,Math.ceil(rows.length/12));
      settings.ledgerPage=Math.max(1,Math.min(pageCount,settings.ledgerPage));
      const start=(settings.ledgerPage-1)*12;
      const paged=rows.slice(start,start+12);
      return `<section class="panel an-ledger" id="an-ledger"><div class="an-section-head"><div><span class="an-overline">FROM THE NUMBERS TO THE RECORD</span><h2>Transaction explorer <span class="count-pill">${rows.length}</span></h2><p>Every transaction behind this view. Select a row to open its full record.</p></div>${action('export-ledger','↓ Export these records')}</div>${drill?`<div class="an-drill">Showing: <strong>${escape(drill.name)}</strong><button class="button text" data-an-action="clear-drill">Clear selection ×</button></div>`:''}<div class="an-ledger-controls"><label class="an-search"><span aria-hidden="true">⌕</span><input id="an-search" data-an-search type="search" placeholder="Search names, amount, location, reference…" aria-label="Search analytics transactions" value="${escape(settings.search)}"></label>${select('sort','Sort by',[['date-desc','Newest first'],['date-asc','Oldest first'],['amount-desc','Highest amount'],['amount-asc','Lowest amount']],settings.sort)}</div><div class="table-scroll"><table class="an-data-table"><thead><tr><th>DATE</th><th>TYPE</th><th>CLIENT / VENDOR</th><th>ACCOUNT</th><th>CATEGORY</th><th>LOCATION</th><th>MODE</th><th>AMOUNT</th><th>STATUS</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${paged.map(t=>{const status=t.status||['','Recorded'];return `<tr><td>${labelDate(t.date)}</td><td><span class="an-type an-type-${t.type.toLowerCase()}">${TYPES[t.type]}</span></td><td><strong>${escape(clients.get(t.client_id)||vendors.get(t.vendor)||accounts.get(t.payer)||'—')}</strong></td><td>${escape(accounts.get(t.type==='CREDIT'?t.recipient:t.payer)||'—')}</td><td>${escape(t.category||'—')}</td><td>${escape(t.location)}</td><td>${escape(t.mode==='CASH'?'Cash':t.mode)}</td><td class="amount">${money(cents(t))}</td><td><span class="status ${escape(status[0])}">${escape(status[1])}</span></td><td><button class="an-table-link" data-detail="${escape(t.id)}" aria-label="Open ${escape(TYPES[t.type])} ${money(cents(t))} on ${labelDate(t.date)}">Open ↗</button></td></tr>`;}).join('')}</tbody></table></div>${rows.length?'':empty('No records match this view')}<div class="an-ledger-foot"><span>${rows.length?`${start+1}–${Math.min(start+12,rows.length)} of ${rows.length} records`:'0 records'} · ${money(total(rows))} transaction value</span><div>${action('prev','←','aria-label="Previous analytics page" '+(settings.ledgerPage===1?'disabled':''))}<span>${settings.ledgerPage} / ${pageCount}</span>${action('next','→','aria-label="Next analytics page" '+(settings.ledgerPage===pageCount?'disabled':''))}</div></div></section>`;
    }

    function render(nextContext) {
      context=nextContext;
      loadScope(context.workspaceId||'local');
      report=buildReport(context.data,settings,context.today);
      const panels={trend,breakdown:breakdownPanel,locations:locationPanel,relationships,accounts:accountPanel,ledger};
      const main=report.error?`<p class="an-error" role="alert">${escape(report.error)}</p>`:`<div class="an-range-caption"><span>${rangeLabel(report.range)}</span>${settings.compare?`<span>Comparing ${rangeLabel(report.previousRange)}</span>`:''}</div>${kpis()}${report.rows.length?insights():empty('A fresh view is waiting','No transactions match these filters. Reset filters or choose another date range.')}<div class="an-primary-grid">${settings.widgets.includes('trend')?trend():''}${settings.widgets.includes('breakdown')?breakdownPanel():''}</div><div class="an-sections">${settings.widgets.filter(k=>!['trend','breakdown'].includes(k)).map(k=>panels[k]()).join('')}</div>${!settings.widgets.length?empty('Your summary is ready','Use Customize to add charts, breakdowns and the transaction explorer.'):''}<div class="an-methodology"><strong>A clear basis for every number.</strong><p>Reversed transactions are excluded. Paybacks reduce creditor liabilities and are never counted as another expense. Credits less expenses is a receipts-based comparison, not accounting profit. Comparisons use the immediately preceding period of the same length with the same filters. Net movement excludes opening balances.</p></div>`;
      return `<div class="analytics-page">${header()}${savedViews()}${customization()}${controls()}${main}</div>`;
    }

    function download(rows,kind) {
      if (report.error) {context.notify(report.error);return;}
      const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8;'}));
      const a=document.createElement('a');
      a.href=url;a.download=`clearbook-analytics-${kind}-${report.range.from}-to-${report.range.to}.csv`;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      context.notify('Analytics export downloaded.');
    }

    function exportRecords(onlyLedger=false) {
      if (report.error) {context.notify(report.error);return;}
      const find=(kind,id)=>context.data[kind].find(item=>item.id===id)?.name||'';
      let rows=report.rows;
      if (onlyLedger && drill) rows=rows.filter(t=>drill.ids.includes(t.id));
      if (onlyLedger && settings.search.trim()) {
        const q=settings.search.trim().toLowerCase();
        rows=rows.filter(t=>[t.date,TYPES[t.type],find('clients',t.client_id),find('vendors',t.vendor),find('accounts',t.payer),find('accounts',t.recipient),t.category,t.location,t.mode,t.amount,t.source_import?.bank_transaction_id].some(v=>String(v||'').toLowerCase().includes(q)));
      }
      download([['Date','Type','Client','Vendor','From account','To account','Category','Location','Payment mode','Amount INR','Status','Bank reference'],...rows.map(t=>[t.date,TYPES[t.type],find('clients',t.client_id),find('vendors',t.vendor),find('accounts',t.payer),find('accounts',t.recipient),t.category,t.location,t.mode,(cents(t)/100).toFixed(2),t.status?.[1]||'',t.source_import?.bank_transaction_id||''])],'transactions');
    }

    function handleClick(target) {
      const name=target.dataset.anAction;
      if (!name || !context) return false;
      if (name==='customize') settings.customize=!settings.customize;
      if (name==='advanced') settings.advanced=!settings.advanced;
      if (name==='reset') {const layout={widgets:settings.widgets,dimension:settings.dimension,metric:settings.metric,group:settings.group,chart:settings.chart,customize:settings.customize};settings={...defaults(),...layout};drill=null;}
      if (name==='restore') {settings={...settings,widgets:Object.keys(WIDGETS),group:'month',dimension:'category',metric:'expenses',chart:'cashflow',compare:true};}
      if (name==='view') {const view=views.find(v=>v.id===target.dataset.anId);if(view){settings=sanitize(view.settings);drill=null;}}
      if (name==='delete-view') views=views.filter(v=>v.id!==target.dataset.anId);
      if (name==='prev') settings.ledgerPage--;
      if (name==='next') settings.ledgerPage++;
      if (name==='clear-drill') {drill=null;settings.ledgerPage=1;}
      if (name==='drill') {
        const g=report.groups[Number(target.dataset.anIndex)];
        if (g) {drill={name:g.name,ids:g.ids};settings.ledgerPage=1;settings.widgets=[...new Set([...settings.widgets,'ledger'])];}
      }
      if (name==='location'||name==='relationship'||name==='account') {
        const key=name==='relationship'?target.dataset.anKind:name;
        const value=target.dataset.anValue;
        if (!value) {context.notify('Choose this group in the breakdown explorer to see unassigned records.');return true;}
        settings[key]=value;
        if (key==='client') {settings.type='CREDIT';settings.vendor='';settings.category='';}
        if (key==='vendor') {settings.type='EXPENSE';settings.client='';}
        drill=null;settings.ledgerPage=1;settings.widgets=[...new Set([...settings.widgets,'ledger'])];
      }
      if (name==='export'||name==='export-ledger') {exportRecords(name==='export-ledger');return true;}
      if (name==='export-breakdown') {if(!report.error)download([[DIMENSIONS[settings.dimension],METRICS[settings.metric]+' INR','Transactions','Share %'],...report.groups.map(g=>[g.name,(g.value/100).toFixed(2),g.count,g.share.toFixed(2)])],'breakdown');return true;}
      update();
      if (['drill','location','relationship','account'].includes(name)) document.querySelector('#an-ledger')?.scrollIntoView?.({behavior:'smooth',block:'start'});
      return true;
    }

    function handleChange(target) {
      const key=target.dataset.anSetting, widget=target.dataset.anWidget;
      if (widget && Object.hasOwn(WIDGETS,widget)) {
        settings.widgets=target.checked?[...new Set([...settings.widgets,widget])]:settings.widgets.filter(k=>k!==widget);
      } else if (key && Object.hasOwn(settings,key)) {
        if (key==='from'||key==='to') {
          settings.from=report.range.from||'';settings.to=report.range.to||'';
          settings.period='custom';settings[key]=target.value;
        } else settings[key]=key==='compare'?target.checked:target.value;
        settings.ledgerPage=1;drill=null;
      } else return false;
      update();return true;
    }

    function handleSearch(target) {
      if (!Object.hasOwn(target.dataset||{},'anSearch')) return false;
      settings.search=target.value;settings.ledgerPage=1;
      const position=target.selectionStart;
      context.repaint();
      const input=document.querySelector('#an-search');
      input?.focus();
      if (input?.type!=='search') input?.setSelectionRange?.(position,position);
      return true;
    }

    function saveView(form) {
      const name=String(new FormData(form).get('viewName')||'').trim().slice(0,48);
      if (!name) {context.notify('Enter a name for this view.');return;}
      const existing=views.find(v=>v.name.toLowerCase()===name.toLowerCase());
      if (existing) existing.settings=sanitize(settings);
      else {
        if (views.length>=12) {context.notify('You can save up to 12 views. Delete one to make room.');return;}
        views.push({id:crypto.randomUUID(),name,settings:sanitize(settings)});
      }
      update();context.notify('Analytics view saved in this browser.');
    }

    return {render,handleClick,handleChange,handleSearch,saveView};
  }
  return {create,buildReport,breakdown,totals,movement,resolveRange,sanitize,defaults,csv};
});
