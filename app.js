'use strict';

const paths = {
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  analytics: '<path d="M4 20h17M7 16v-5m5 5V5m5 11v-8"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  transactions: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  creditors: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6m17 6h-5v5h5"/><path d="M17 14.5h.01"/>',
  vendors: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
  accounts: '<path d="m3 9 9-6 9 6H3zm2 3v6m7-6v6m7-6v6M3 21h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="8" cy="7" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  trend: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
paths.staff = paths.vendors;
paths.subcontractors = paths.vendors;
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.accounts}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
function amountInWords(value){
 const raw=String(value??'').trim();
 if(!/^\d{1,12}(?:\.\d{0,2})?$/.test(raw))return '';
 const [whole,fraction='']=raw.split('.'),rupees=Number(whole),paise=Number(fraction.padEnd(2,'0'));
 const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
 const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
 function words(n){
  if(n<20)return small[n];
  if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+small[n%10]:'');
  for(const [unit,label] of [[10000000,'crore'],[100000,'lakh'],[1000,'thousand'],[100,'hundred']]){
   if(n>=unit)return words(Math.floor(n/unit))+' '+label+(n%unit?' '+words(n%unit):'');
  }
 }
 const result=words(rupees)+(rupees===1?' rupee':' rupees')+(paise?' and '+words(paise)+(paise===1?' paisa':' paise'):'')+' only';
 return result[0].toUpperCase()+result.slice(1);
}
const initials = name => name.split(' ').filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase();
const isoToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const categories = ['Fuel','Food','Porter','Labour Transport','Power Tools','Toll','Machinery Repair','Machinery Purchase','Other Expense','Labour Tips','Sub Contractor','Staff Salaries','LABOUR PAYMENTS','LABOUR ADVANCE'];
const locations = [];
const SALARY_CATEGORY = 'Staff Salaries';
const isLabourPayeeCategory = category => ['labour payments','labour tips','labour advance'].includes(String(category||'').toLowerCase());
const payeeRoles = v => v.roles || (/^(staff|staff salaries)$/i.test(v.category)?['STAFF']:/sub\s*contractor/i.test(v.category)?['SUBCONTRACTOR']:['SUPPLIER']);
const isStaff = v => payeeRoles(v).includes('STAFF');
const salaryMonthLabel = value => value?new Date(`${value}-01T12:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'}):'Not recorded';
const categoryColors = ['#365b45','#94ad7a','#c4cfab','#d9bd8e','#728c9c','#9d87ad','#b78565','#638f82','#dedfd4','#b4a367','#8d9b72'];
let db = {accounts:[], vendors:[], clients:[], transactions:[]};
let summary = {totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};
let workspaceSession = null;
let snapshotWorkspaceId = null;
let providerData = {customers:[], users:[]};
const isProvider = () => workspaceSession?.role === 'provider';
let pendingLoad = Promise.resolve(false);
let loading = false, connected = false, lastRefreshed = null, loadError = '', submitting = false;
const apiConfig = window.CLEARBOOK_CONFIG || {apiBase:'/api'};
async function api(path, {method='GET', body, key}={}) {
  const token = await apiConfig.getAccessToken?.();
  const response = await fetch((apiConfig.apiBase || '/api').replace(/\/$/, '') + path, {
    method, cache:'no-store', headers:{'Accept':'application/json', ...(body ? {'Content-Type':'application/json'} : {}),
      ...(key ? {'Idempotency-Key':key} : {}), ...(token ? {'Authorization':`Bearer ${token}`} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(()=>({error:'The server returned an invalid response.'}));
  if(response.status===401 && window.ClearbookAuth?.enabled){window.ClearbookAuth.expire();}
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
// Cache only resources actually visited; never carry them across workspace sessions.
const dataCache = new Map();
let loadGeneration = 0, cacheWorkspace = null;
let transactionTotal = 0, transactionRows = [], analyticsRows = [];
let searchTimer;
function cachedResource(path) {
  if (!dataCache.has(path)) {
    const request=api(path);
    dataCache.set(path,request);
    request.catch(()=>{if(dataCache.get(path)===request)dataCache.delete(path);});
  }
  return dataCache.get(path);
}
function invalidateData(kind='all') {
  for(const key of dataCache.keys()) {
    if(kind==='all'||key.startsWith('/transactions?')||key.startsWith('/dashboard?')||key===`/${kind}`)dataCache.delete(key);
  }
}
function transactionQuery({all=false}={}) {
  const selected={};
  for(const key of ['payer','client','vendor','category','location'])if(filterValues(key).length)selected[key]=filterValues(key);
  const query=new URLSearchParams({limit:String(all?200:page==='overview'?5:10),page:String(all?1:pageNumber),tab,q:search});
  if(Object.keys(selected).length)query.set('filters',JSON.stringify(selected));
  if(filters.from)query.set('from',filters.from);
  if(filters.to)query.set('to',filters.to);
  if(page==='overview'){
    const end=new Date(Date.UTC(Number(overviewMonth.slice(0,4)),Number(overviewMonth.slice(5,7)),0)).toISOString().slice(0,10);
    query.set('from',filters.from && filters.from>overviewMonth+'-01'?filters.from:overviewMonth+'-01');
    query.set('to',filters.to && filters.to<end?filters.to:end);
  }
  return query;
}
async function allTransactionPages(query=new URLSearchParams({limit:'200',page:'1'}), read=api) {
  const rows=[];
  for(let number=1;;number++){
    query.set('page',String(number));
    const result=await read('/transactions?'+query);
    rows.push(...result.items);
    if(rows.length>=result.total||!result.items.length)return rows;
  }
}
function refreshData(notify=false, invalidate=true) {
  clearTimeout(searchTimer);
  if(invalidate)invalidateData(typeof invalidate==='string'?invalidate:'all');
  pendingLoad=loadSnapshot(notify);
  return pendingLoad;
}
async function loadSnapshot(notify=false) {
  if(window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn()){render();return false;}
  const generation=++loadGeneration;
  const current=()=>generation===loadGeneration&&(!window.ClearbookAuth?.enabled||window.ClearbookAuth.isSignedIn());
  const requestedPage=page;
  loading=true; loadError=''; transactionRows=[]; transactionTotal=0; render();
  try {
    if(window.ClearbookAuth?.enabled){
      let session;
      try{session=await api('/session');}
      catch(error){if(current()){workspaceSession=null;connected=false;cacheWorkspace=null;dataCache.clear();analyticsRows=[];db={accounts:[],vendors:[],clients:[],transactions:[]};summary={totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};}throw error;}
      if(!current())return false;
      if(!['provider','customer'].includes(session.role)||!session.name||(session.role==='customer'&&(!session.workspace?.id||!session.workspace?.name)))throw new Error('This account has no workspace access.');
      workspaceSession=session;
      if(isProvider()){
        const [customers,users]=await Promise.all([api('/provider/customers'),api('/provider/users')]);
        if(!current())return false;
        providerData={customers:customers.items,users:users.items};
        connected=true;lastRefreshed=new Date();return true;
      }
    }
    const workspaceId=workspaceSession?.workspace?.id||'local';
    if(cacheWorkspace!==workspaceId){dataCache.clear();analyticsRows=[];summary={totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};connected=false;snapshotWorkspaceId=null;db={accounts:[],vendors:[],clients:[],transactions:[]};cacheWorkspace=workspaceId;}
    const refs=['accounts'];
    if(['overview','transactions','analytics','vendors','staff','subcontractors'].includes(requestedPage))refs.push('vendors');
    if(['overview','transactions','analytics','clients'].includes(requestedPage))refs.push('clients');
    if(showFilters||requestedPage==='analytics')refs.push('categories','locations');
    const ledger=['overview','transactions'].includes(requestedPage);
    const query=ledger?transactionQuery():null;
    const [references,dashboardData,result,reportRows]=await Promise.all([
      Promise.all(refs.map(async name=>[name,await cachedResource('/'+name)])),
      cachedResource('/dashboard?month='+overviewMonth),
      ledger?cachedResource('/transactions?'+query):null,
      requestedPage==='analytics'?allTransactionPages(undefined,path=>{
        if(!current())throw new Error('Report loading cancelled.');
        return cachedResource(path);
      }):null,
    ]);
    if(!current())return false;
    for(const [name,value] of references){
      if(name==='categories')categories.splice(0,categories.length,...value.items.map(c=>c.name));
      else if(name==='locations')locations.splice(0,locations.length,...value.items.map(l=>l.name));
      else db[name]=value.items;
    }
    summary=dashboardData;
    if(result){transactionRows=result.items;transactionTotal=result.total;}
    if(reportRows)analyticsRows=reportRows;
    db.transactions=reportRows||transactionRows;
    snapshotWorkspaceId=workspaceSession?.workspace?.id||null;
    connected=true;lastRefreshed=new Date();
    if(result&&pageNumber>Math.max(1,Math.ceil(result.total/(page==='overview'?5:10)))){
      pageNumber=Math.max(1,Math.ceil(result.total/(page==='overview'?5:10)));
      return await refreshData(false,false);
    }
    if(notify)toast('Latest data loaded.');
    return true;
  }catch(error){if(current()){loadError=error.message;if(notify)toast(error.message);}return false;}
  finally{if(generation===loadGeneration){loading=false;render();}}
}
async function prepareForm() {
  const generation=loadGeneration;
  const values=await Promise.all(['accounts','vendors','clients','categories','locations'].map(async name=>[name,await cachedResource('/'+name)]));
  if(generation!==loadGeneration||window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn())return false;
  for(const [name,value] of values){
    if(name==='categories')categories.splice(0,categories.length,...value.items.map(c=>c.name));
    else if(name==='locations')locations.splice(0,locations.length,...value.items.map(l=>l.name));
    else db[name]=value.items;
  }
  return true;
}
function reloadTransactions(delay=0){
  clearTimeout(searchTimer);
  // Invalidate pending responses immediately, including during the search debounce.
  ++loadGeneration;loading=false;transactionRows=[];transactionTotal=0;
  if(delay)searchTimer=setTimeout(()=>refreshData(false,false),delay);
  else return refreshData(false,false);
}
let page='overview', tab='all', search='', pageNumber=1, showFilters=false;
let overviewMonth=isoToday().slice(0,7);
const overviewTransactions=()=>transactionRows;
const overviewMonthLabel=()=>salaryMonthLabel(overviewMonth);
function overviewControls(){return `<div class="filters filter-fields"><label>Month <input aria-label="Overview month" type="month" data-overview-month value="${esc(overviewMonth)}"></label><span class="panel-subtitle">Showing ${esc(overviewMonthLabel())}</span></div>`;}
function overviewTotals(){return summary.overview?.totals||{expenses:0,fronted:0,settled:0,credits:0,outstanding:summary.totals.outstanding};}
let filters={payer:'',vendor:'',category:'',from:'',to:''};
let openFilterGroups=new Set();
const filterValues=key=>Array.isArray(filters[key])?filters[key]:filters[key]?[filters[key]]:[];
const matchesFilter=(key,...values)=>!filterValues(key).length||filterValues(key).some(value=>values.includes(value));
function multiFilter(key,label,items){
 const selected=filterValues(key);
 return `<details class="multi-filter" data-filter-group="${key}" ${openFilterGroups.has(key)?'open':''}><summary>${esc(label)} <span>${selected.length||'All'}</span></summary><div class="multi-filter-options" role="group" aria-label="Filter ${esc(label.toLowerCase())}">${items.length?items.map(([value,name],index)=>`<label><input id="filter-${key}-${index}" type="checkbox" data-filter="${key}" value="${esc(value)}" ${selected.includes(value)?'checked':''}> <span>${esc(name)}</span></label>`).join(''):'<p>No options available</p>'}</div></details>`;
}
function transactionFilterControls(){
 const payees=[...db.vendors.map(v=>[v.id,v.name]),...labourPayeeNames().map(name=>['name:'+name.toLowerCase(),name])];
 return `<div class="more-filters filter-fields">${multiFilter('payer','Accounts',db.accounts.map(a=>[a.id,a.name]))}${multiFilter('client','Clients',db.clients.map(c=>[c.id,c.name]))}${multiFilter('vendor','Payees',payees)}${multiFilter('category','Categories',categories.map(c=>[c,c]))}${multiFilter('location','Locations',locations.map(l=>[l,l]))}<label>From <input aria-label="From date" type="date" data-filter="from" value="${esc(filters.from||'')}"></label><label>To <input aria-label="To date" type="date" data-filter="to" value="${esc(filters.to||'')}"></label><button class="chip" data-action="clear-filters">Clear filters</button><small class="filter-help">Match any selected value within a filter and all filters together.</small></div>`;
}

let formType='EXPENSE', editId=null, draft={};
const analytics = window.ClearbookAnalytics?.create();
function analyticsPage(){return analytics ? analytics.render({data:{...db,transactions:analyticsRows},categories,locations,workspaceId:workspaceSession?.workspace?.id||'local',today:isoToday(),loading,repaint:render,notify:toast}) : ''; }
const main=document.querySelector('#main');
const dialog=document.querySelector('#transaction-dialog');
const detailDialog=document.querySelector('#detail-dialog');
const account=id=>db.accounts.find(a=>a.id===id);
const client=id=>db.clients.find(c=>c.id===id);
const vendor=id=>db.vendors.find(p=>p.id===id);
const payeeName=t=>t.payee_name||vendor(t.vendor)?.name||'';
const externalAccounts=()=>db.accounts.filter(a=>a.type==='THIRD_PARTY_CREDITOR');
const activeCreditors=()=>externalAccounts().filter(a=>creditorStats(a.id).balance>0);
const isExternal=t=>account(t.payer)?.type==='THIRD_PARTY_CREDITOR';
const sum=list=>list.reduce((n,t)=>n+t.amount,0);
function creditorStats(id){return summary.creditors.find(c=>c.id===id)||{fronted:0,settled:0,balance:0};}
function reimbursement(t){return t.status || ['pending','Pending payback'];}
let toastTimer;
function toast(message){clearTimeout(toastTimer);const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
const button=(label,action,ico='',style='')=>`<button class="button ${style}" data-action="${action}">${ico?icon(ico):''}${label}</button>`;
function navigation(){document.querySelector('#navigation').innerHTML=[['overview','Overview'],['analytics','Analytics'],['transactions','Transactions'],['creditors','Paybacks'],['clients','Clients'],['vendors','Vendors'],['subcontractors','Subcontractors'],['staff','Staff'],['accounts','Accounts']].map(([key,label])=>`<a href="#${key}" class="${page===key?'active':''}" ${page===key?'aria-current="page"':''} title="${label}">${icon(key)}<span class="nav-text">${label}</span>${key==='creditors'?`<span class="nav-count">${activeCreditors().length}</span>`:''}</a>`).join('');document.querySelector('#breadcrumb-current').textContent=({creditors:'Paybacks'}[page]||page[0].toUpperCase()+page.slice(1));}
function heading(title,description,eyebrow='YOUR BUSINESS, AT A GLANCE'){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-description">${description}</p></div><div class="heading-actions"><button class="button" data-action="refresh" ${loading?'disabled':''}>${icon('refresh')}${loading?'Refreshing...':'Refresh'}</button>${button('Export','export','download')}${button('Add transaction','add','plus','primary')}</div></div>`;}
function metrics(creditorView=false){const n=creditorView?summary.totals:overviewTotals();const items=creditorView?[['Total capital fronted',n.fronted,'creditors','Across all external funding accounts'],['Total repaid',n.settled,'check','Reimbursed to your creditors'],['Outstanding payback',n.outstanding,'transactions','Your current reimbursement liability'],['Active creditors',activeCreditors().length,'vendors','With an outstanding balance']]:[['Total debits',n.expenses,'trend','Across all accounts & vendors'],['Externally funded',n.fronted,'creditors','Paid on behalf of your business'],['Total repaid',n.settled,'check','Returned to external creditors'],['Outstanding payback',n.outstanding,'transactions','Current balance · all time']];if(!creditorView)items.push(['Client credits',n.credits||0,'plus','Money received from clients']);return `<div class="metrics">${items.map(([label,value,ico,foot],i)=>`<div class="metric ${i===(creditorView?2:3)?'highlight':''}"><div class="metric-label">${label}<span class="metric-icon">${icon(ico)}</span></div><div class="metric-value">${creditorView&&i===3?value:money(value)}</div><div class="metric-foot">${i===0?'<strong>↗</strong>':''}${foot}</div></div>`).join('')}</div>`;}
function charts(){const rows=overviewTransactions();const days=new Date(Number(overviewMonth.slice(0,4)),Number(overviewMonth.slice(5,7)),0).getDate();const weeks=Array.from({length:Math.ceil(days/7)},(_,i)=>({from:i*7+1,to:Math.min((i+1)*7,days)}));const labels=weeks.map(w=>`${w.from}–${w.to}`);const monthly=weeks.map((_,i)=>summary.overview?.weeks[i]||{expenses:0,repaid:0});const max=Math.max(50000,...monthly.flatMap(m=>[m.expenses,m.repaid]));const scale=Math.ceil(max/50000)*50000;const spending=Object.entries(summary.overview?.spending||{}).map(([name,value],i)=>({name,value,color:categoryColors[i%categoryColors.length]}));const total=spending.reduce((n,s)=>n+s.value,0);let position=0;const gradient=spending.map(s=>{const start=position;position+=total?s.value/total*100:0;return `${s.color} ${start}% ${position}%`;}).join(',');return `<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Money in motion</h2><p class="panel-subtitle">Weekly debits and repayments · ${esc(overviewMonthLabel())}</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Debits</span><span><i class="legend-dot light"></i>Repayments</span></div></div><div class="chart" role="img" aria-label="Weekly debits and repayments for ${esc(overviewMonthLabel())}"><div class="chart-scale">${[scale,scale*2/3,scale/3,0].map(v=>`<span>${v===0?'₹0':`₹${Math.round(v/1000)}k`}</span>`).join('')}</div><div class="chart-plot">${monthly.map((m,i)=>`<div class="bar-group" title="${labels[i]} ${esc(overviewMonthLabel())}: debits ${money(m.expenses)}, repayments ${money(m.repaid)}"><div class="bar" style="height:${m.expenses/scale*100}%"></div><div class="bar light" style="height:${m.repaid/scale*100}%"></div><span>${labels[i]}</span></div>`).join('')}</div></div><div class="chart-bottom"><span>${esc(overviewMonthLabel())}</span><strong>Every payment, accounted for ${icon('arrow')}</strong></div></section><section class="panel"><div class="panel-heading"><div><h2>Where your money goes</h2><p class="panel-subtitle">Debit breakdown by category · ${esc(overviewMonthLabel())}</p></div></div><div class="spending-content"><div class="donut" style="background:conic-gradient(${total?gradient:'#e7ebe5'})" role="img" aria-label="Debit distribution by category"><div class="donut-center"><small>Total debits</small><strong>${money(total)}</strong></div></div><div class="category-legend">${spending.map(s=>`<div class="category-row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><strong>${total?Math.round(s.value/total*100):0}%</strong></div>`).join('')}</div></div><div class="chart-bottom"><span>${spending.length} debit categories</span><strong>Built from your transactions</strong></div></section></div>`;}
function filteredTransactions(){return transactionRows;}
let searchSuggestionIndex=-1;
function searchNames(){return [...new Set([...db.vendors,...db.clients,...db.accounts].map(item=>item.name))].filter(name=>name.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>a.localeCompare(b));}
function searchField(){return `<div class="transaction-search"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Search transactions..." aria-label="Search transactions" value="${esc(search)}" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="search-suggestions" aria-expanded="false" autocomplete="off"></label><div id="search-suggestions" class="search-suggestions" role="listbox" aria-label="Name suggestions" hidden></div></div>`;}
function closeSearchSuggestions(){
 const input=document.querySelector('#search'),list=document.querySelector('#search-suggestions');
 if(!list||list.hidden!==false)return;
 list.hidden=true;
 if(input){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 searchSuggestionIndex=-1;
}
function showSearchSuggestions(){
 const input=document.querySelector('#search'),list=document.querySelector('#search-suggestions');
 if(!input||!list)return;
 const names=searchNames();searchSuggestionIndex=-1;
 list.innerHTML=names.length?names.map((name,i)=>`<button type="button" role="option" aria-selected="false" id="search-name-${i}" tabindex="-1" data-search-name="${esc(name)}">${esc(name)}</button>`).join(''):'<p class="search-no-match">No matching names</p>';
 list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
}
function selectSearchName(name){search=name;pageNumber=1;reloadTransactions();render();document.querySelector('#search').focus();closeSearchSuggestions();}
function table(){const list=filteredTransactions(),size=page==='overview'?5:10;const total=transactionTotal,pages=Math.max(1,Math.ceil(total/size));const rows=list;const pageButtons=[...new Set([1,...Array.from({length:5},(_,i)=>pageNumber-2+i).filter(n=>n>=1&&n<=pages),pages])].sort((a,b)=>a-b);return `<section class="panel transaction-panel"><div class="table-toolbar"><div class="table-title"><h2>${page==='overview'?'Recent transactions':'All transactions'}</h2><span class="count-pill">${total}</span></div><div class="toolbar-actions">${searchField()}${button('Filters','filters','filter')}</div></div><div class="filters">${[['all','All transactions'],['internal','Business funded'],['external','Externally funded'],['pending','Pending payback'],['paybacks','Repayments'],['credits','Credits received']].map(([id,name])=>`<button class="chip ${tab===id?'active':''}" data-tab="${id}" aria-pressed="${tab===id}">${name}</button>`).join('')}</div>${showFilters?transactionFilterControls():''}<div class="table-scroll"><table><thead><tr><th>DATE</th><th>TYPE</th><th>FROM</th><th>TO</th><th>CATEGORY</th><th>LOCATION</th><th>MODE</th><th style="text-align:right">AMOUNT</th><th>STATUS</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(t=>{const [status,label]=reimbursement(t);return `<tr class="transaction-row" data-detail="${esc(t.id)}" tabindex="0" aria-haspopup="dialog" aria-label="View transaction dated ${esc(dateLabel(t.date))}"><td>${dateLabel(t.date)}</td><td>${esc(t.type==='CREDIT'?'Credit':t.type==='PAYBACK'?'Payback':t.type==='TRANSFER'?'Transfer':'Debit')}</td><td>${esc(t.type==='CREDIT'?client(t.client_id)?.name:account(t.payer)?.name)}</td><td>${esc(payeeName(t)||account(t.recipient)?.name||'—')}</td><td>${esc(t.category||(t.type==='PAYBACK'?'Payback / Settlement':t.type==='CREDIT'?'Client receipt':'Account transfer'))}</td><td>${esc(t.location)}</td><td>${esc(t.mode==='CASH'?'Cash':t.mode)}</td><td class="amount">${money(t.amount)}</td><td><span class="status ${status}">${label}</span></td><td><button class="row-action" data-detail="${t.id}" aria-label="View transaction dated ${esc(dateLabel(t.date))}">${icon('more')}</button></td></tr>`;}).join('')}</tbody></table>${!rows.length?loading?'<div class="empty" role="status">Loading transactions...</div>':loadError?'<div class="empty">Unable to load transactions. Use Refresh to retry.</div>':'<div class="empty">No transactions match your filters. Try a different search.</div>':''}</div><div class="table-footer"><span>${total?`Showing ${(pageNumber-1)*size+1}–${Math.min(pageNumber*size,total)} of ${total} transactions`:'0 transactions'}</span><div class="pagination"><button data-pagination="${pageNumber-1}" ${pageNumber===1?'disabled':''} aria-label="Previous page">‹</button>${pageButtons.map(n=>`<button data-pagination="${n}" class="${pageNumber===n?'active':''}" aria-label="Page ${n}" ${pageNumber===n?'aria-current="page"':''}>${n}</button>`).join('')}<button data-pagination="${pageNumber+1}" ${pageNumber===pages?'disabled':''} aria-label="Next page">›</button></div></div></section>`;}
function creditorStrip(){return `<section class="panel creditor-strip"><div class="panel-heading"><div><h2>A quick look at paybacks</h2><p class="panel-subtitle">A little help, clearly accounted for.</p></div><a class="button text" href="#creditors">View all paybacks ${icon('arrow')}</a></div><div class="creditor-mini-grid">${externalAccounts().slice(0,3).map((a,i)=>`<div class="creditor-mini"><span class="initials ${['','sage','lilac'][i]}">${esc(initials(a.owner))}</span><div><strong>${esc(a.owner)}</strong><small>${esc(a.name)}</small></div><div class="balance"><strong>${money(creditorStats(a.id).balance)}</strong><button data-repay="${a.id}">Record payback ↗</button></div></div>`).join('')}</div></section>`;}
function creditors(){return `${heading('Good accounts. Clear relationships.','See who has your back, and what you owe them.','PAYBACKS & REIMBURSEMENTS')}${metrics(true)}<div class="creditor-cards">${externalAccounts().map((a,i)=>{const s=creditorStats(a.id);return `<section class="panel creditor-card"><div class="person"><span class="initials ${['','sage','lilac'][i%3]}">${esc(initials(a.owner))}</span><div><h2>${esc(a.owner)}</h2><small>${esc(a.name)}</small></div></div><div class="detail-line"><span>Total funded</span><strong>${money(s.fronted)}</strong></div><div class="detail-line"><span>Total reimbursed</span><strong>${money(s.settled)}</strong></div><div class="owed-line"><span>Outstanding balance</span><strong>${money(s.balance)}</strong></div><button class="button ${s.balance>0?'primary':''}" data-repay="${a.id}" ${s.balance<=0?'disabled':''}>${icon('transactions')} ${s.balance>0?'Record payback':'All settled'}</button></section>`;}).join('')}</div><p class="section-note">${icon('creditors')} Repayments reduce what you owe. They don’t count as a second debit. Partial reimbursements are allocated to the oldest debits first by the server.</p>`;}
function directory(){
 const isAccounts=page==='accounts',staff=page==='staff',subcontractors=page==='subcontractors';
 const records=isAccounts?db.accounts:db.vendors.filter(v=>payeeRoles(v).includes(staff?'STAFF':subcontractors?'SUBCONTRACTOR':'SUPPLIER'));
 return `${heading(isAccounts?'Every account. One picture.':staff?'Your team. Every salary.':subcontractors?'Your subcontractors. Every payment.':'The people behind your progress.',isAccounts?'Business funds and personal support, organized in one place.':staff?'Keep staff details and salary payments together.':subcontractors?'Subcontractors, with a complete payment history.':'Suppliers, with a complete payment history.',isAccounts?'FUNDING ACCOUNTS':staff?'YOUR STAFF':subcontractors?'YOUR SUBCONTRACTOR DIRECTORY':'YOUR VENDOR DIRECTORY')}<div style="margin-bottom:22px">${button(isAccounts?'Add account':staff?'Add staff':subcontractors?'Add subcontractor':'Add vendor',isAccounts?'new-account':staff?'new-staff':subcontractors?'new-subcontractor':'new-vendor','plus')}</div><div class="directory-grid">${records.map((item,i)=>{
 const stats=summary.directory?.[isAccounts?'accounts':'vendors']?.[item.id];
 const active=(staff?stats?.salary:stats)||{amount:0,count:0};
 return `<section class="panel directory-card"><span class="initials ${['','sage','lilac','blue'][i%4]}">${isAccounts?icon('accounts'):esc(initials(item.name))}</span><h2>${esc(item.name)}</h2><p>${esc(isAccounts?item.detail:item.role)}</p><span class="status ${isAccounts&&item.type==='THIRD_PARTY_CREDITOR'?'pending':'paid'}">${isAccounts?(item.type==='INTERNAL'?'Business owned':'External creditor'):staff?'Staff':esc(item.category)}</span>${!isAccounts&&(!staff||payeeRoles(item).length>1)?`<small class="payee-roles">${payeeRoles(item).map(r=>({STAFF:'Staff',SUPPLIER:'Supplier',SUBCONTRACTOR:'Subcontractor'}[r])).join(' &middot; ')}</small>`:''}<div class="large-number">${money(active.amount)}</div>${isAccounts&&item.type==='INTERNAL'?accountMovement(item.id):''}<small>${active.count} ${staff?'salary':'debit'} payment${active.count!==1?'s':''} &middot; all time</small><div style="margin-top:16px;display:flex;justify-content:space-between"><button class="button text" data-edit-reference="${item.id}">Edit</button><button class="button text" data-directory="${item.id}">View transactions ${icon('arrow')}</button></div>${staff?`<button class="button primary" style="margin-top:14px" data-pay-salary="${item.id}">Record salary</button>`:''}</section>`;
 }).join('')}</div>${records.length?'':`<p class="empty-state">${staff?'No staff added yet. Add your first staff member to record salary payments.':subcontractors?'No subcontractors added yet. Add your first subcontractor to track payments.':isAccounts?'No records yet.':'No vendors added yet. Add your first vendor to track payments.'}</p>`}`;
}
function accountMovement(id){
 const a=summary.accounts?.find(a=>a.id===id)||{incoming:0,credits:0,outgoing:0,net_movement:0};
 return `<div class="detail-line"><span>Client credits</span><strong>${money(a.credits)}</strong></div><div class="detail-line"><span>Incoming</span><strong>${money(a.incoming)}</strong></div><div class="detail-line"><span>Outgoing</span><strong>${money(a.outgoing)}</strong></div>`;
}
function clientsDirectory(){
 return `${heading('Your clients. Every receipt.','Manage clients and track payments received.','CLIENT DIRECTORY')}<div style="margin-bottom:22px">${button('Add client','new-client','plus')}</div><div class="directory-grid">${db.clients.map((c,i)=>{const rows=summary.directory?.clients?.[c.id]||{amount:0,count:0};return `<section class="panel directory-card"><span class="initials ${['','sage','lilac'][i%3]}">${esc(initials(c.name))}</span><h2>${esc(c.name)}</h2><p>${esc(c.contact||'')}</p><p>${esc(c.phone||'')} ${esc(c.email||'')}</p><div class="large-number">${money(rows.amount)}</div><small>${rows.count} payment${rows.count===1?'':'s'} received</small><div style="margin-top:16px;display:flex;justify-content:space-between"><button class="button text" data-edit-client="${esc(c.id)}">Edit</button><button class="button text" data-directory="${esc(c.id)}">View payments ${icon('arrow')}</button></div></section>`;}).join('')}</div>${db.clients.length?'':'<div class="empty">Add your first client to record incoming payments.</div>'}`;
}
function openClientForm(record=null){
 captureDraft();const c=record||{};
 detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">${record?'Edit client':'Add client'}</h2><button class="close-button" data-action="close-detail" aria-label="Close client form">&times;</button></div><form id="client-form" data-id="${esc(c.id||'')}" class="form-body"><div class="form-grid"><label class="form-field full">Client name<input name="name" required maxlength="120" value="${esc(c.name||'')}" placeholder="e.g. ABC Constructions"></label><label class="form-field full">Contact person (optional)<input name="contact" maxlength="120" value="${esc(c.contact||'')}"></label><label class="form-field">Phone (optional)<input name="phone" type="tel" maxlength="40" value="${esc(c.phone||'')}"></label><label class="form-field">Email (optional)<input name="email" type="email" maxlength="254" value="${esc(c.email||'')}"></label></div><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">${record?'Save changes':'Add client'}</button></div></form>`;detailDialog.showModal();
}
function render(){const focused=document.activeElement?.id==='search'?document.activeElement:null;const selection=focused?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null;if(renderAuth())return;if(!connected&&!loadError){document.body?.classList.add('account-loading');main.innerHTML=accountLoader();return;}document.body?.classList.remove('account-loading');if(isProvider()){renderProvider();return;}navigation();main.innerHTML=(!connected?`<div class="connection-banner ${loadError?'error':''}" role="status">${esc(loadError||'Loading your accounts and transactions...')} ${loadError?'<button class="button" data-action="refresh">Retry</button>':''}</div>`:loadError?`<div class="connection-banner error" role="alert">Refresh failed: ${esc(loadError)}. Showing data from the last successful refresh.</div>`:'')+(page==='overview'?`${heading('A clearer view of your money.','Your payments, people, and paybacks. All in one place.')}${overviewControls()}${metrics()}${charts()}${table()}${creditorStrip()}`:page==='transactions'?`${heading('Every payment has a story.','Track client receipts, business debits, and repayments.','TRANSACTION LEDGER')}${table()}`:page==='analytics'?analyticsPage():page==='creditors'?creditors():page==='clients'?clientsDirectory():directory());document.querySelector('.local-badge').textContent=loading?'Refreshing...':connected?`Updated ${lastRefreshed.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`:'API disconnected';if(focused){const input=document.querySelector('#search');input?.focus({preventScroll:true});if(selection[0]!=null)input?.setSelectionRange?.(...selection);}}
function route(){const key=location.hash.slice(1)||'overview';page=['overview','analytics','transactions','creditors','vendors','subcontractors','staff','accounts','clients','customers','users'].includes(key)?key:'overview';pageNumber=1;render();if(connected||loading)refreshData(false,false);}
window.addEventListener('hashchange',route);
function options(list,selected){return list.map(a=>`<option value="${esc(a.id)}" ${selected===a.id?'selected':''}>${esc(a.name)}</option>`).join('');}
function enhanceTransactionSelects(){
 // Keep the native selects as the source of submitted IDs.
 for(const select of dialog.querySelectorAll?.('select')||[]){
  const wrapper=document.createElement('div'),input=document.createElement('input'),toggle=document.createElement('button'),list=document.createElement('div');
  const id=select.id||`transaction-${select.name}`,items=[...select.options].map(option=>({value:option.value,label:option.textContent}));
  let active=-1,matches=[];
  const exactMatch=value=>{
   const matchesLabel=item=>item.label.toLowerCase()===value.trim().toLowerCase();
   return items.find(item=>item.value===select.value&&matchesLabel(item))||items.find(matchesLabel);
  };
  wrapper.className='select-search';input.id=`${id}-search`;input.type='text';input.autocomplete='off';input.required=select.required;
  input.placeholder=items.find(item=>!item.value)?.label||'Type to search...';
  input.value=select.value?items.find(item=>item.value===select.value)?.label||'':'';
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',`${id}-options`);
  toggle.type='button';toggle.className='select-search-toggle';toggle.tabIndex=-1;toggle.setAttribute('aria-label','Show options');toggle.innerHTML=icon('chevron');
  list.id=`${id}-options`;list.className='select-search-options';list.setAttribute('role','listbox');list.hidden=true;
  const label=select.closest('label');if(label)label.htmlFor=input.id;
  select.hidden=true;select.required=false;select.after(wrapper);wrapper.append(input,toggle,list);
  const close=()=>{input.value=select.value?items.find(item=>item.value===select.value)?.label||'':'';input.setCustomValidity('');list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
  const choose=item=>{
   select.value=item.value;input.value=item.value?item.label:'';input.setCustomValidity('');close();
   select.dispatchEvent(new Event('change',{bubbles:true}));
   if(!input.isConnected){const next=document.getElementById(input.id);if(next){next.dataset.skipOpen='true';next.focus();}}else input.focus();
   close();
  };
  const show=(query='')=>{
   matches=items.filter(item=>item.label.toLowerCase().includes(query.trim().toLowerCase()));active=-1;
   list.replaceChildren();
   matches.forEach((item,index)=>{
    const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.id=`${id}-option-${index}`;option.textContent=item.label;
    option.setAttribute('role','option');option.setAttribute('aria-selected',String(item.value===select.value));
    option.addEventListener('mousedown',event=>event.preventDefault());
    option.addEventListener('click',event=>{event.preventDefault();choose(item);});list.append(option);
   });
   if(!matches.length){const empty=document.createElement('p');empty.textContent='No matching options';list.append(empty);}
   const bounds=input.getBoundingClientRect(),dialogBounds=dialog.getBoundingClientRect();
   wrapper.classList.toggle('opens-up',dialogBounds.bottom-bounds.bottom<220&&bounds.top-dialogBounds.top>220);
   list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
  };
  const openSearch=()=>{input.value='';input.setCustomValidity('');show();};
  input.addEventListener('focus',()=>{if(input.dataset.skipOpen){delete input.dataset.skipOpen;return;}openSearch();});input.addEventListener('click',()=>{if(list.hidden)openSearch();});
  input.addEventListener('input',()=>{
   const exact=exactMatch(input.value);
   input.setCustomValidity(exact||(!input.required&&!input.value)?'':'Choose an option from the list.');
   show(input.value);
  });
  input.addEventListener('blur',()=>{
   const exact=exactMatch(input.value);
   if(exact&&exact.value!==select.value){select.value=exact.value;input.setCustomValidity('');select.dispatchEvent(new Event('change',{bubbles:true}));}
   close();
  });
  toggle.addEventListener('mousedown',event=>event.preventDefault());
  toggle.addEventListener('click',event=>{event.preventDefault();const wasOpen=!list.hidden;input.focus();if(wasOpen)close();else openSearch();});
  input.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!list.hidden){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==='Enter'&&!list.hidden){event.preventDefault();if(matches.length)choose(matches[Math.max(0,active)]);return;}
   if(!['ArrowDown','ArrowUp'].includes(event.key))return;
   event.preventDefault();if(list.hidden)openSearch();if(!matches.length)return;
   active=(active+(event.key==='ArrowDown'?1:active<0?0:-1)+matches.length)%matches.length;
   [...list.children].forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
   input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});
  });
 }
}
function captureDraft(){const form=document.querySelector('#transaction-form');if(form)draft={...draft,...Object.fromEntries(new FormData(form).entries())};}
function labourPayeeNames(){
 // db is the server-authorized workspace snapshot. Never reuse it for another organization.
 if(window.ClearbookAuth?.enabled && (!window.ClearbookAuth.isSignedIn() || !workspaceSession?.workspace?.id || workspaceSession.workspace.id!==snapshotWorkspaceId))return [];
 const names=new Map();
 for(const name of summary.payee_names||[])if(!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name);
 for(const t of db.transactions){
  if(t.type!=='EXPENSE'||!isLabourPayeeCategory(t.category)||t.reversed_at||t.status?.[0]==='reversed')continue;
  const name=(t.payee_name||'').trim();
  if(name&&!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name);
 }
 return [...names.values()].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
}
function vendorsForCategory(category){return db.vendors.filter(v=>category===SALARY_CATEGORY?isStaff(v):v.category===category&&payeeRoles(v).some(r=>r!=='STAFF'));}
function vendorOptions(category,selected){
 const vendors=vendorsForCategory(category);
 return `<option value="">${category===SALARY_CATEGORY?'Select staff member':vendors.length?'No vendor':'No vendors for this category'}</option>${options(vendors,selected)}`;
}
function changeExpenseCategory(category){
 captureDraft();draft.category=category;
 if(!vendorsForCategory(category).some(v=>v.id===draft.vendor))draft.vendor='';
 const select=dialog.querySelector('[name="vendor"]');
 if(select){select.innerHTML=vendorOptions(category,draft.vendor);select.value=draft.vendor;}
 renderForm();
}
function renderForm(){const t=draft;if(formType==='EXPENSE'){t.category=t.category||'';if(t.vendor&&!vendorsForCategory(t.category).some(v=>v.id===t.vendor))t.vendor='';}const validPayers=formType==='PAYBACK'?db.accounts.filter(a=>a.type==='INTERNAL'):db.accounts;const recipients=formType==='PAYBACK'?externalAccounts():db.accounts.filter(a=>a.type==='INTERNAL');dialog.innerHTML=`<div class="modal-head"><h2 id="dialog-title">${editId?'Edit transaction':'Add a transaction'}</h2><button class="close-button" data-action="close-modal" aria-label="Close transaction form">×</button></div><form id="transaction-form" class="form-body"><p class="modal-subtitle">Enter the payment details below.</p><div class="type-switch">${(editId&&formType==='TRANSFER'?['EXPENSE','PAYBACK','CREDIT','TRANSFER']:['EXPENSE','PAYBACK','CREDIT']).map(type=>`<button type="button" class="${formType===type?'selected':''}" data-form-type="${type}" aria-pressed="${formType===type}">${type==='EXPENSE'?'Debit':type==='PAYBACK'?'Payback':type==='CREDIT'?'Credit':'Transfer'}</button>`).join('')}</div><div class="form-grid"><label class="form-field">Amount (₹)<input name="amount" type="number" aria-describedby="transaction-amount-words" min="0.01" max="999999999999.99" step="0.01" placeholder="0.00" required value="${esc(t.amount||'')}"><small id="transaction-amount-words" class="amount-words" data-amount-words aria-live="polite" aria-atomic="true">${amountInWords(t.amount)}</small></label><label class="form-field">Payment date<input name="date" type="date" value="${esc(t.date||isoToday())}" required></label>${formType==='CREDIT'?`<label for="transaction-client_id" class="form-field"><span class="field-heading">Client<button class="inline-add" type="button" data-action="new-client">+ Add client</button></span><select id="transaction-client_id" name="client_id" required><option value="">Select client</option>${options(db.clients,t.client_id)}</select></label>`:`<label for="transaction-payer" class="form-field"><span class="field-heading">Paid by <button class="inline-add" type="button" data-action="new-account">+ Add account</button></span><select id="transaction-payer" name="payer" required><option value="">Select account</option>${options(validPayers,t.payer)}</select></label>`}${formType!=='EXPENSE'?`<label class="form-field">${formType==='PAYBACK'?'Creditor':formType==='CREDIT'?'Received into':'Destination account'}<select name="recipient" required><option value="">Select account</option>${options(recipients,t.recipient)}</select></label>`:''}${formType==='EXPENSE'?`<label for="transaction-category" class="form-field"><span class="field-heading">Debit category<button class="inline-add" type="button" data-action="new-category">+ Add category</button></span><select id="transaction-category" name="category" required><option value="">Select category</option>${categories.map(c=>`<option ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>${isLabourPayeeCategory(t.category)?`<label class="form-field">Payee name (optional)<input name="payee_name" list="labour-payee-names" maxlength="120" autocomplete="off" placeholder="Select or type a payee name" value="${esc(t.payee_name||'')}"><datalist id="labour-payee-names">${labourPayeeNames().map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist></label>`:`<label for="transaction-vendor" class="form-field"><span class="field-heading">${t.category===SALARY_CATEGORY?'Staff member':'Vendor (optional)'}<button class="inline-add" type="button" data-action="${t.category===SALARY_CATEGORY?'new-staff':'new-vendor'}">+ Add ${t.category===SALARY_CATEGORY?'staff':'vendor'}</button></span><select id="transaction-vendor" name="vendor" ${t.category===SALARY_CATEGORY?'required':''}>${vendorOptions(t.category,t.vendor)}</select></label>`}`:''}<label class="form-field">Payment mode<select name="mode" required><option value="">Select payment mode</option>${['UPI','NEFT','RTGS','IMPS','CASH','CHEQUE'].map(m=>`<option value="${m}" ${t.mode===m?'selected':''}>${m==='CASH'?'Cash':m==='CHEQUE'?'Cheque':m}</option>`).join('')}</select></label><label for="transaction-location" class="form-field transaction-location"><span class="field-heading">Location<button class="inline-add" type="button" data-action="new-location">+ Add location</button></span><select id="transaction-location" name="location" required><option value="">Select location</option>${[...new Set([...locations,...(t.location?[t.location]:[])])].map(l=>`<option value="${esc(l)}" ${t.location===l?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label class="form-field full">Remarks (optional)<textarea name="notes" maxlength="1000" rows="3" placeholder="Add any details about this transaction">${esc(t.notes||'')}</textarea></label></div><div class="form-actions"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${icon('check')}${editId?'Save changes':'Save transaction'}</button></div></form>`;enhanceTransactionSelects();}
function openForm(type='EXPENSE',recipient=null,transaction=null){formType=type;editId=transaction?.id||null;draft=transaction?{...transaction}:{date:isoToday(),payer:'',mode:'',category:'',idempotencyKey:crypto.randomUUID(),...(recipient?{recipient,amount:Math.max(0,creditorStats(recipient).balance)}:{})};if(detailDialog.open)detailDialog.close();renderForm();dialog.showModal();}
function openDetail(id){const t=db.transactions.find(x=>x.id===id);if(!t)return;const recipient=payeeName(t)||account(t.recipient)?.name;detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">Transaction details</h2><button class="close-button" data-action="close-detail" aria-label="Close details">×</button></div><div class="detail-content">${[['Date',dateLabel(t.date)],['Type',t.type==='EXPENSE'?'Debit':t.type],['Amount',money(t.amount)],...(t.type==='CREDIT'?[['Client',client(t.client_id)?.name]]:[['Paid by',account(t.payer)?.name]]),...(isLabourPayeeCategory(t.category)?[['Payee name',payeeName(t)||'?']]:t.vendor?[[t.category===SALARY_CATEGORY?'Staff member':'Vendor',vendor(t.vendor)?.name]]:[]),['Location',t.location],...(t.type==='EXPENSE'?[]:[[t.type==='PAYBACK'?'Creditor':t.type==='CREDIT'?'Received into':'Destination account',recipient]]),['Category',t.category||'—'],['Payment mode',t.mode],['Status',reimbursement(t)[1]],['Remarks',t.notes?.trim()||'No remarks']].map(([k,v])=>`<div class="detail-line"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}<div class="form-actions"><button class="button danger" data-delete="${id}">Reverse</button><button class="button primary" data-edit="${id}">Edit transaction</button></div></div>`;detailDialog.showModal();}
function openDirectoryForm(kind, record=null){
 captureDraft();const isAccount=kind==='account',staff=kind==='staff',subcontractor=kind==='subcontractor',t=record||(isAccount?{}:{category:staff?SALARY_CATEGORY:subcontractor?'Sub Contractor':draft.category});
 const roles=record?payeeRoles(record):staff?['STAFF']:subcontractor?['SUBCONTRACTOR']:['SUPPLIER'];
 detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">${record?'Edit':'Add'} ${isAccount?'funding account':staff?'staff member':subcontractor?'subcontractor':'vendor'}</h2><button class="close-button" data-action="close-detail" aria-label="Close form">&times;</button></div><form id="directory-form" data-kind="${kind}" data-id="${esc(t.id||'')}" class="form-body"><div class="form-grid"><label class="form-field full">${isAccount?'Account name':staff?'Staff name':subcontractor?'Subcontractor name':'Vendor name'}<input name="name" required maxlength="120" value="${esc(t.name||'')}" placeholder="${isAccount?'e.g. Business bank account':staff?'Employee full name':subcontractor?'Subcontractor full name':'e.g. Shree Balaji Steels'}"></label>${isAccount?`<label class="form-field full">Account ownership<select name="type"><option value="INTERNAL" ${t.type==='INTERNAL'?'selected':''}>Business owned</option><option value="THIRD_PARTY_CREDITOR" ${t.type==='THIRD_PARTY_CREDITOR'?'selected':''}>External creditor (reimbursable)</option></select></label><label class="form-field full">Owner name<input name="owner" maxlength="120" required value="${esc(t.owner||'')}"></label>`:`<fieldset class="form-field full payee-role-options"><legend>Roles (choose one or more)</legend>${[['SUPPLIER','Supplier'],['SUBCONTRACTOR','Subcontractor'],['STAFF','Staff']].map(([value,label])=>`<label><input type="checkbox" name="role_${value}" ${roles.includes(value)?'checked':''}> ${label}</label>`).join('')}</fieldset><label class="form-field full">Default debit category<select name="category">${categories.map(c=>`<option ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`}<label class="form-field full">${isAccount?'Account description':staff?'Job title / description':'Role / description'}<input name="description" maxlength="500" value="${esc((isAccount?t.detail:t.role)||'')}"></label></div><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">${record?'Save changes':isAccount?'Add account':staff?'Add staff':subcontractor?'Add subcontractor':'Add vendor'}</button></div></form>`;detailDialog.showModal();
}
function openLocationForm(){
 captureDraft();
 detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">Add location</h2><button class="close-button" data-action="close-detail" aria-label="Close location form">&times;</button></div><form id="location-form" class="form-body"><label class="form-field">Location name<input name="name" required maxlength="200" placeholder="e.g. Hyderabad - Block A"></label><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">Add location</button></div></form>`;
 detailDialog.showModal();
}
function openCategoryForm(){
 captureDraft();
 detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">Add category</h2><button class="close-button" data-action="close-detail" aria-label="Close category form">&times;</button></div><form id="category-form" class="form-body"><label class="form-field">Category name<input name="name" required maxlength="80" placeholder="e.g. Office supplies"></label><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">Add category</button></div></form>`;
 detailDialog.showModal();
}
function validateTransaction(t){if(!Number.isFinite(t.amount)||t.amount<=0)return 'Enter a valid positive amount.';if(!t.location?.trim())return 'Enter a location for this transaction.';return null;}
document.addEventListener('click', async event=>{
 if(event.target.id==='search'){showSearchSuggestions();return;}
 if(!event.target.closest('.transaction-search'))closeSearchSuggestions();
 const target=event.target.closest('button,a,[data-detail]');if(!target)return;
 try {
  if(page==='analytics'&&!isProvider()&&analytics?.handleClick(target))return;
  if(target.dataset.searchName!==undefined){selectSearchName(target.dataset.searchName);return;}
  const action=target.dataset.action;
  if(action==='sign-in'){await window.ClearbookAuth.login();return;}
  if(action==='sign-out'){await window.ClearbookAuth.logout();return;}
  if(action==='refresh')await refreshData(true);
  if(isProvider()){
   if(action==='new-customer'||action==='new-customer-user'){
    detailDialog.innerHTML=window.ClearbookProvider.form(action==='new-customer'?'customer':'user',providerData.customers,providerData.users);
    detailDialog.showModal();
   }
   if(target.dataset.providerDeleteKind){
    const kind=target.dataset.providerDeleteKind;
    const record=providerData[kind==='customers'?'customers':'users'].find(r=>r.id===target.dataset.providerId);
    if(record){detailDialog.innerHTML=window.ClearbookProvider.deleteForm(kind,record);detailDialog.showModal();}
   }
   if(action==='close-detail'&&!submitting)detailDialog.close();
   if(target.dataset.providerKind&&!submitting){
    submitting=true;
    try{
     target.disabled=true;
     await api(`/provider/${target.dataset.providerKind}/${target.dataset.providerId}`,{method:'PATCH',body:{enabled:target.dataset.providerEnabled==='true'}});
     await refreshData();
    }finally{submitting=false;target.disabled=false;}
   }
   return;
  }
  if(action==='add'){if(!connected){toast('Connect to the API first.');return;}if(await prepareForm())openForm();}
  if(action==='filters'){showFilters=!showFilters;if(showFilters)await prepareForm();render();}
  if(action==='clear-filters'){filters={};tab='all';search='';pageNumber=1;await reloadTransactions();}
  if(action==='close-modal'&&!submitting)dialog.close();if(action==='close-detail'&&!submitting)detailDialog.close();
  if(action==='new-client')openClientForm();
  if(action==='new-staff'&&await prepareForm())openDirectoryForm('staff');
  if(action==='new-subcontractor'&&await prepareForm())openDirectoryForm('subcontractor');
  if(target.dataset.paySalary&&await prepareForm()){openForm();draft.category=SALARY_CATEGORY;draft.vendor=target.dataset.paySalary;renderForm();}
  if(action==='new-location')openLocationForm();
  if(action==='new-category')openCategoryForm();
  if(action==='new-account'&&await prepareForm())openDirectoryForm('account');if(action==='new-vendor'&&await prepareForm())openDirectoryForm('vendor');
  if(action==='export')await exportCSV();
  if(target.dataset.tab){tab=target.dataset.tab;pageNumber=1;await reloadTransactions();}
  if(target.dataset.pagination){pageNumber=Math.max(1,Number(target.dataset.pagination));await reloadTransactions();}
  if(target.dataset.repay&&await prepareForm())openForm('PAYBACK',target.dataset.repay);
  if(target.dataset.detail)openDetail(target.dataset.detail);
  if(target.dataset.edit){const t=db.transactions.find(x=>x.id===target.dataset.edit);if(t&&await prepareForm())openForm(t.type,null,t);}
  if(target.dataset.editClient)openClientForm(client(target.dataset.editClient));
  if(target.dataset.editReference&&await prepareForm()){const isAccount=page==='accounts';openDirectoryForm(isAccount?'account':page==='staff'?'staff':page==='subcontractors'?'subcontractor':'vendor',(isAccount?db.accounts:db.vendors).find(x=>x.id===target.dataset.editReference));}
  if(target.dataset.formType&&!submitting){captureDraft();formType=target.dataset.formType;renderForm();}
  if(target.dataset.directory){filters={[page==='accounts'?'payer':page==='clients'?'client':'vendor']:target.dataset.directory,...(page==='staff'?{category:SALARY_CATEGORY}:{})};tab='all';search='';showFilters=true;location.hash='transactions';}
  if(target.dataset.delete){const id=target.dataset.delete;target.closest('.form-actions').outerHTML=`<form id="reversal-form" data-id="${id}" class="confirm-delete"><label class="form-field">Reason for reversal<input name="reason" maxlength="500" required placeholder="e.g. Duplicate entry"></label><p>Reversing keeps the original record and recalculates balances.</p><div class="form-actions"><button type="button" class="button" data-detail="${id}">Keep transaction</button><button class="button danger" type="submit">Reverse transaction</button></div></form>`;}
 } catch(error){toast(error.message);}
});
document.addEventListener('input',event=>{if(page==='analytics'&&!isProvider()&&analytics?.handleSearch(event.target))return;if(event.target.name==='amount'){const preview=event.target.closest('.form-field')?.querySelector('[data-amount-words]');if(preview)preview.textContent=amountInWords(event.target.value);}if(event.target.id==='search'){if(event.isComposing)return;const {selectionStart,selectionEnd,selectionDirection}=event.target;search=event.target.value;pageNumber=1;reloadTransactions(250);render();const input=document.querySelector('#search');input.focus({preventScroll:true});if(selectionStart!=null)input.setSelectionRange?.(selectionStart,selectionEnd,selectionDirection);showSearchSuggestions();}});
document.addEventListener('focusin',event=>{if(event.target.id==='search')showSearchSuggestions();});
document.addEventListener('focusout',event=>{if(event.target.id==='search')closeSearchSuggestions();});
document.addEventListener('mousedown',event=>{if(event.target.closest('[data-search-name]'))event.preventDefault();});
document.addEventListener('keydown',event=>{
 if(event.target.matches?.('tr[data-detail]')&&['Enter',' '].includes(event.key)){event.preventDefault();openDetail(event.target.dataset.detail);return;}
 if(event.target.id!=='search')return;
 const list=document.querySelector('#search-suggestions');
 if(event.key==='Escape'){event.preventDefault();closeSearchSuggestions();return;}
 if(event.key==='Enter'&&!list.hidden&&searchSuggestionIndex>=0){event.preventDefault();selectSearchName(searchNames()[searchSuggestionIndex]);return;}
 if(!['ArrowDown','ArrowUp'].includes(event.key))return;
 event.preventDefault();if(list.hidden)showSearchSuggestions();
 const options=[...list.querySelectorAll('[data-search-name]')];if(!options.length)return;
 searchSuggestionIndex=(searchSuggestionIndex+(event.key==='ArrowDown'?1:searchSuggestionIndex<0?0:-1)+options.length)%options.length;
 options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===searchSuggestionIndex)));
 event.target.setAttribute('aria-activedescendant',options[searchSuggestionIndex].id);
 options[searchSuggestionIndex].scrollIntoView({block:'nearest'});
});
document.addEventListener('change',async event=>{const el=event.target;if(el.dataset.overviewMonth!==undefined){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(el.value))overviewMonth=el.value;pageNumber=1;await reloadTransactions();return;}if(page==='analytics'&&!isProvider()&&analytics?.handleChange(el))return;if(el.dataset.filter){
 const key=el.dataset.filter;
 openFilterGroups=new Set([...(document.querySelectorAll?.('details[data-filter-group][open]')||[])].map(group=>group.dataset.filterGroup));
 if(el.type==='checkbox'){
  const values=new Set(filterValues(key));if(el.checked)values.add(el.value);else values.delete(el.value);
  filters[key]=[...values];
 }else filters[key]=el.value;
 pageNumber=1;await reloadTransactions();
 if(el.type==='checkbox')document.getElementById?.(el.id)?.focus();
 }if(el.form?.id==='transaction-form'&&el.name==='category')changeExpenseCategory(el.value);if(el.form?.id==='transaction-form'&&el.name==='vendor')draft.vendor=el.value;});
document.addEventListener('submit',async event=>{
 const form=event.target;if(form.id==='analytics-view-form'&&page==='analytics'&&!isProvider()){event.preventDefault();analytics?.saveView(form);return;}if(!['transaction-form','directory-form','category-form','location-form','client-form','reversal-form','customer-form','customer-user-form','provider-delete-form'].includes(form.id))return;
 event.preventDefault();if(submitting)return;submitting=true;
 const submitButton=form.querySelector('button[type="submit"], button.primary');
 if(submitButton)submitButton.disabled=true;
 try {
  if(form.id==='provider-delete-form'){
   if(!isProvider())throw new Error('Software-provider access is required.');
   const kind=form.dataset.kind;
   if(!['customers','users'].includes(kind))throw new Error('Invalid access record.');
   await api(`/provider/${kind}/${form.dataset.id}`,{method:'DELETE'});
   detailDialog.close();toast(kind==='customers'?'Organization access deleted. Financial history retained.':'User access deleted.');
  }else if(form.id==='customer-form'||form.id==='customer-user-form'){
   if(!isProvider())throw new Error('Software-provider access is required.');
   const body=Object.fromEntries(new FormData(form));
   const result=await api(form.id==='customer-form'?'/provider/customers':'/provider/users',{method:'POST',body});
   form.reset();detailDialog.innerHTML='';detailDialog.close();
   toast(form.id==='customer-form'?'Organization onboarded.':result.existing_account?'Existing account linked. Its password was unchanged.':'Organization user added. Share the temporary password privately.');
  }else if(form.id==='transaction-form'){
   captureDraft();const t={date:draft.date,amount:draft.amount,type:formType,payer:formType==='CREDIT'?null:draft.payer,client_id:formType==='CREDIT'?draft.client_id:null,
    vendor:formType==='EXPENSE'&&!isLabourPayeeCategory(draft.category)?draft.vendor||null:null,
    payee_name:formType==='EXPENSE'&&isLabourPayeeCategory(draft.category)?(draft.payee_name||'').trim():'',recipient:formType==='EXPENSE'?null:draft.recipient,
    category:formType==='EXPENSE'?draft.category:null,mode:draft.mode,location:draft.location?.trim(),notes:(draft.notes||'').trim(),receiptName:draft.receiptName||null,
    ...(editId?{version:draft.version}:{})};
   const error=validateTransaction({...t,amount:Number(t.amount)});if(error)throw new Error(error);
   await api(editId?`/transactions/${editId}`:'/transactions',{method:editId?'PATCH':'POST',body:t,key:draft.idempotencyKey});
   dialog.close();toast(editId?'Transaction updated.':'Transaction saved.');
  }else if(form.id==='client-form'){
   const fields=Object.fromEntries(new FormData(form)),id=form.dataset.id;
   const body=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value.trim()]));
   const result=await api('/clients'+(id?'/'+id:''),{method:id?'PATCH':'POST',body});
   db.clients=db.clients.filter(c=>c.id!==result.id).concat(result);
   if(!id&&dialog.open)draft.client_id=result.id;
   detailDialog.close();toast(id?'Client updated.':'Client added.');
  }else if(form.id==='location-form'){
   const name=String(new FormData(form).get('name')||'').trim();
   if(!name||name.length>200)throw new Error('Enter a location name of at most 200 characters.');
   const result=await api('/locations',{method:'POST',body:{name}});
   if(!locations.includes(result.name))locations.push(result.name);
   locations.sort((a,b)=>a.localeCompare(b));draft.location=result.name;
   detailDialog.close();toast('Location added.');
  }else if(form.id==='category-form'){
   const name=String(new FormData(form).get('name')||'').trim();
   if(!name||name.length>80)throw new Error('Enter a category name of at most 80 characters.');
   const result=await api('/categories',{method:'POST',body:{name}});
   if(!categories.includes(result.name))categories.push(result.name);
   draft.category=result.name;
   detailDialog.close();toast('Category added.');
  }else if(form.id==='directory-form'){
   const v=Object.fromEntries(new FormData(form)),isAccount=form.dataset.kind==='account',id=form.dataset.id;
   const roles=['SUPPLIER','SUBCONTRACTOR','STAFF'].filter(r=>v['role_'+r]);
   if(!isAccount&&!roles.length)throw new Error('Choose at least one role.');
   const body={name:v.name.trim(),...(isAccount?{type:v.type,owner:v.owner.trim(),detail:v.description.trim()}:{category:v.category,role:v.description.trim(),roles})};
   const result=await api(`/${isAccount?'accounts':'vendors'}${id?'/'+id:''}`,{method:id?'PATCH':'POST',body});
   const entity=isAccount?'accounts':'vendors';
   db[entity]=db[entity].filter(record=>record.id!==result.id).concat(result);
   detailDialog.close();if(dialog.open){draft[isAccount?'payer':'vendor']=result.id;if(!isAccount)draft.category=form.dataset.kind==='staff'?SALARY_CATEGORY:result.category;}
   toast(id?'Changes saved.':isAccount?'Account added.':form.dataset.kind==='staff'?'Staff member added.':form.dataset.kind==='subcontractor'?'Subcontractor added.':'Vendor added.');
  }else{
   const id=form.dataset.id,t=db.transactions.find(t=>t.id===id);const reason=new FormData(form).get('reason');
   await api(`/transactions/${id}/reverse`,{method:'POST',body:{reason,version:t.version}});detailDialog.close();toast('Transaction reversed. History preserved.');
  }
  if(loading) await pendingLoad;
  const resource=({'client-form':'clients','category-form':'categories','location-form':'locations','directory-form':form.dataset?.kind==='account'?'accounts':'vendors'})[form.id]||'transactions';
  const refreshed=await refreshData(false,resource);
  if(dialog.open)renderForm();
  if(!refreshed)toast('Saved successfully, but refresh failed. Click Refresh to load the latest data.');
 }catch(error){toast(error.message);}
 finally{submitting=false;if(submitButton)submitButton.disabled=false;}
});
async function exportCSV(){const generation=loadGeneration;toast('Preparing export...');if(!await prepareForm())return;const query=page==='staff'?new URLSearchParams({limit:'200',page:'1',category:SALARY_CATEGORY}):transactionQuery({all:true});const transactions=await allTransactionPages(query,path=>{if(generation!==loadGeneration||window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn())throw new Error('Export cancelled because the view changed.');return api(path);});if(generation!==loadGeneration||window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn())return;const rows=window.ClearbookAnalytics.omitEmptySalaryMonth([['Date','Type','Client','From account','To account','Payee','Category','Salary month','Location','Mode','Amount (INR)','Status'],...transactions.map(t=>[t.date,t.type==='EXPENSE'?'Debit':t.type,client(t.client_id)?.name,account(t.payer)?.name,account(t.recipient)?.name,payeeName(t),t.category||'',t.salary_month||'',t.location,t.mode,t.amount,reimbursement(t)[1]]),...window.ClearbookAnalytics.exportTotalRows(transactions,12,10)]);const safeCell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`clearbook-transactions-${isoToday()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Transaction export downloaded.');}
let authError='';
function renderProvider(){
 const userView=page==='users';
 document.querySelector('#navigation').innerHTML=[['customers','Organizations','accounts'],['users','Users','vendors']].map(([key,label,ico])=>`<a href="#${key}" class="${(userView?key==='users':key==='customers')?'active':''}">${icon(ico)}<span class="nav-text">${label}</span></a>`).join('');
 document.querySelector('#breadcrumb-current').textContent=userView?'Organization users':'Organizations';
 main.innerHTML=window.ClearbookProvider.render({...providerData,page,loading,error:loadError});
 document.querySelector('.local-badge').textContent=loading?'Refreshing...':'Provider console';
}
function accountLoader(){return `<section class="account-loader" role="status" aria-live="polite" aria-label="Loading your account"><div class="loader-brand"><svg class="loader-logo" viewBox="0 0 1280 1280" role="img" aria-label="A&amp;T INFRA"><defs><mask id="loader-still" maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="1280"><rect width="1280" height="1280" fill="white"/><polygon points="390,937 640,937 1040,726 900,723 800,734 700,758 600,788 500,833 430,875 390,909" fill="black"/></mask><clipPath id="loader-swoosh-clip"><polygon points="390,937 640,937 1040,726 900,723 800,734 700,758 600,788 500,833 430,875 390,909"/></clipPath></defs><image href="assets/at-infra-logo-green.png" width="1280" height="1280" mask="url(#loader-still)"/><g class="loader-swoosh"><image href="assets/at-infra-logo-green.png" width="1280" height="1280" clip-path="url(#loader-swoosh-clip)"/></g></svg></div><p>Loading your workspace...</p></section>`;}
function renderAuth(){
 const auth=window.ClearbookAuth;
 document.body?.classList.toggle('account-loading',Boolean(auth?.enabled&&auth.isSignedIn()&&!workspaceSession&&!loadError));
 if(!auth?.enabled)return false;
 const signed=auth.isSignedIn();
 document.body.classList.toggle('signed-out',!signed);
 if(!signed){
  if(window.ClearbookLanding){main.innerHTML=window.ClearbookLanding.render(authError);window.ClearbookLanding.mount(main);}
  else main.innerHTML=`<section class="auth-card"><div class="eyebrow">CLEARBOOK WORKSPACE</div><h1>Your accounts. In one place.</h1><p>Sign in to manage your business debits, vendors and paybacks.</p>${authError?`<p class="auth-error" role="alert">${esc(authError)}</p>`:''}<button class="button primary" data-action="sign-in">Sign in securely ${icon('arrow')}</button><small>Access is limited to your workspace members.</small></section>`;
  document.querySelector('#navigation').innerHTML='';
  document.querySelector('.local-badge').textContent='Sign-in required';
  return true;
 }
 window.ClearbookLanding?.destroy();
 if(!workspaceSession){
  main.innerHTML=loadError?`<section class="auth-card"><div class="eyebrow">CLEARBOOK</div><h1>Account access unavailable</h1><p role="alert">${esc(loadError)}</p><button class="button" data-action="refresh">Retry</button><button class="button" data-action="sign-out">Sign out</button></section>`:accountLoader();
  document.querySelector('#navigation').innerHTML='';
  return true;
 }
 const user={name:workspaceSession.name,role:isProvider()?'Software provider':'Organization user'};
 const workspace=document.querySelector('.workspace');
 if(workspace)workspace.innerHTML=`<span class="workspace-avatar">${isProvider()?'CB':esc(initials(workspaceSession.workspace.name))}</span><div><strong>${esc(isProvider()?'Clearbook':workspaceSession.workspace.name)}</strong><small>${isProvider()?'Provider console':'Customer workspace'}</small></div>`;
 const avatar=document.querySelector('.top-avatar');if(avatar&&user){avatar.textContent=initials(user.name);avatar.setAttribute('aria-label',user.name);}
 const profile=document.querySelector('.profile');
 if(profile&&user)profile.innerHTML=`<span class="profile-avatar">${esc(initials(user.name))}</span><div><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small></div>`;
 let logout=document.querySelector('#sign-out');
 if(!logout){logout=document.createElement('button');logout.id='sign-out';logout.className='button';logout.dataset.action='sign-out';logout.textContent='Sign out';document.querySelector('.topbar-right').append(logout);}
 return false;
}
if(window.ClearbookAuth){
 window.addEventListener('clearbook-auth-change',()=>{if(!window.ClearbookAuth.isSignedIn()){++loadGeneration;clearTimeout(searchTimer);dataCache.clear();cacheWorkspace=null;analyticsRows=[];transactionRows=[];transactionTotal=0;snapshotWorkspaceId=null;loading=false;workspaceSession=null;providerData={customers:[],users:[]};db={accounts:[],vendors:[],clients:[],transactions:[]};summary={totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};connected=false;dialog.close();detailDialog.close();render();}});
 window.CLEARBOOK_READY=(async()=>{try{await window.ClearbookAuth.init();}catch(error){authError=error.message;}route();if(!window.ClearbookAuth.enabled||window.ClearbookAuth.isSignedIn())await refreshData();})();
}else{route();window.CLEARBOOK_READY=refreshData();}
