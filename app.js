'use strict';

const paths = {
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
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
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
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
const categories = ['Fuel','Food','Porter','Labour Transport','Power Tools','Toll','Machinery Repair','Machinery Purchase','Other Expense','Labour Tips','Sub Contractor'];
const locations = [];
const categoryColors = ['#365b45','#94ad7a','#c4cfab','#d9bd8e','#728c9c','#9d87ad','#b78565','#638f82','#dedfd4','#b4a367','#8d9b72'];
let db = {accounts:[], vendors:[], clients:[], transactions:[]};
let summary = {totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};
let workspaceSession = null;
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
function refreshData(notify=false) {
  if (loading) return pendingLoad;
  pendingLoad = loadSnapshot(notify);
  return pendingLoad;
}
async function loadSnapshot(notify=false) {
  if(window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn()){render();return false;}
  if(window.ClearbookAuth?.enabled)workspaceSession=null;
  loading=true; loadError=''; render();
  try {
    if(window.ClearbookAuth?.enabled){
      const session = await api('/session');
      if(!window.ClearbookAuth.isSignedIn())return false;
      if(!['provider','customer'].includes(session.role)||!session.name||(session.role==='customer'&&(!session.workspace?.id||!session.workspace?.name)))throw new Error('This account has no workspace access.');
      workspaceSession = session;
      if(isProvider()){
        const [customers, users] = await Promise.all([api('/provider/customers'), api('/provider/users')]);
        if(!window.ClearbookAuth.isSignedIn())return false;
        providerData = {customers:customers.items, users:users.items};
        connected=true; lastRefreshed=new Date();
        if(notify)toast('Organization access refreshed.');
        return true;
      }
    }
    const [accounts,vendors,clients,categoryData,locationData,dashboardData,first] = await Promise.all([
      api('/accounts'),api('/vendors'),api('/clients'),api('/categories'),api('/locations'),api('/dashboard'),api('/transactions?limit=200&page=1'),
    ]);
    const transactions=[...first.items];
    // Fetch subsequent pages once per explicit refresh; this is pagination, not polling.
    for(let page=2;transactions.length<first.total;page++) {
      const next=await api(`/transactions?limit=200&page=${page}`);
      transactions.push(...next.items);
      if(!next.items.length) break;
    }
    if(window.ClearbookAuth?.enabled&&!window.ClearbookAuth.isSignedIn())return false;
    db={accounts:accounts.items,vendors:vendors.items,clients:clients.items,transactions};
    categories.splice(0,categories.length,...categoryData.items.map(c=>c.name));
    locations.splice(0,locations.length,...locationData.items.map(l=>l.name));
    summary=dashboardData; connected=true; lastRefreshed=new Date();
    if(notify) toast('Latest data loaded.');
    return true;
  } catch(error) {
    loadError=error.message; if(notify)toast(error.message); return false;
  } finally { loading=false;render(); }
}
let page='overview', tab='all', search='', pageNumber=1, showFilters=false;
let filters={payer:'',vendor:'',category:'',from:'',to:''};
let formType='EXPENSE', editId=null, draft={};
const main=document.querySelector('#main');
const dialog=document.querySelector('#transaction-dialog');
const detailDialog=document.querySelector('#detail-dialog');
const account=id=>db.accounts.find(a=>a.id===id);
const client=id=>db.clients.find(c=>c.id===id);
const vendor=id=>db.vendors.find(p=>p.id===id);
const externalAccounts=()=>db.accounts.filter(a=>a.type==='THIRD_PARTY_CREDITOR');
const activeCreditors=()=>externalAccounts().filter(a=>creditorStats(a.id).balance>0);
const isExternal=t=>account(t.payer)?.type==='THIRD_PARTY_CREDITOR';
const sum=list=>list.reduce((n,t)=>n+t.amount,0);
function creditorStats(id){return summary.creditors.find(c=>c.id===id)||{fronted:0,settled:0,balance:0};}
function reimbursement(t){return t.status || ['pending','Pending payback'];}
let toastTimer;
function toast(message){clearTimeout(toastTimer);const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
const button=(label,action,ico='',style='')=>`<button class="button ${style}" data-action="${action}">${ico?icon(ico):''}${label}</button>`;
function navigation(){document.querySelector('#navigation').innerHTML=[['overview','Overview'],['transactions','Transactions'],['creditors','Paybacks'],['clients','Clients'],['vendors','Vendors'],['accounts','Accounts']].map(([key,label])=>`<a href="#${key}" class="${page===key?'active':''}" ${page===key?'aria-current="page"':''} title="${label}">${icon(key)}<span class="nav-text">${label}</span>${key==='creditors'?`<span class="nav-count">${activeCreditors().length}</span>`:''}</a>`).join('');document.querySelector('#breadcrumb-current').textContent=({creditors:'Paybacks'}[page]||page[0].toUpperCase()+page.slice(1));}
function heading(title,description,eyebrow='YOUR BUSINESS, AT A GLANCE'){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-description">${description}</p></div><div class="heading-actions"><button class="button" data-action="refresh" ${loading?'disabled':''}>${icon('refresh')}${loading?'Refreshing...':'Refresh'}</button>${button('Export','export','download')}${button('Add transaction','add','plus','primary')}</div></div>`;}
function metrics(creditorView=false){const n=summary.totals;const items=creditorView?[['Total capital fronted',n.fronted,'creditors','Across all external funding accounts'],['Total repaid',n.settled,'check','Reimbursed to your creditors'],['Outstanding payback',n.outstanding,'transactions','Your current reimbursement liability'],['Active creditors',activeCreditors().length,'vendors','With an outstanding balance']]:[['Total expenses',n.expenses,'trend','Across all accounts & vendors'],['Externally funded',n.fronted,'creditors','Paid on behalf of your business'],['Total repaid',n.settled,'check','Returned to external creditors'],['Outstanding payback',n.outstanding,'transactions','Left to reimburse']];if(!creditorView)items.push(['Client credits',summary.totals.credits||0,'plus','Money received from clients']);return `<div class="metrics">${items.map(([label,value,ico,foot],i)=>`<div class="metric ${i===(creditorView?2:3)?'highlight':''}"><div class="metric-label">${label}<span class="metric-icon">${icon(ico)}</span></div><div class="metric-value">${creditorView&&i===3?value:money(value)}</div><div class="metric-foot">${i===0?'<strong>↗</strong>':''}${foot}</div></div>`).join('')}</div>`;}
function charts(){const months=['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];const monthly=months.map(m=>({expenses:sum(db.transactions.filter(t=>t.type==='EXPENSE'&&t.date.startsWith(m))),repaid:sum(db.transactions.filter(t=>t.type==='PAYBACK'&&t.date.startsWith(m)))}));const max=Math.max(50000,...monthly.map(m=>m.expenses));const scale=Math.ceil(max/50000)*50000;const spending=categories.map((name,i)=>({name,color:categoryColors[i%categoryColors.length],value:sum(db.transactions.filter(t=>t.type==='EXPENSE'&&t.category===name))}));const total=spending.reduce((n,s)=>n+s.value,0);let position=0;const gradient=spending.map(s=>{const start=position;position+=total?s.value/total*100:0;return `${s.color} ${start}% ${position}%`;}).join(',');return `<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Money in motion</h2><p class="panel-subtitle">Expenses and repayments over time</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Expenses</span><span><i class="legend-dot light"></i>Repayments</span></div></div><div class="chart" role="img" aria-label="Monthly expenses and repayments from June to November 2026"><div class="chart-scale">${[scale,scale*2/3,scale/3,0].map(v=>`<span>${v===0?'₹0':`₹${Math.round(v/1000)}k`}</span>`).join('')}</div><div class="chart-plot">${monthly.map((m,i)=>`<div class="bar-group" title="${months[i]}: expenses ${money(m.expenses)}, repayments ${money(m.repaid)}"><div class="bar" style="height:${m.expenses/scale*100}%"></div><div class="bar light" style="height:${m.repaid/scale*100}%"></div><span>${['Jun','Jul','Aug','Sep','Oct','Nov'][i]}</span></div>`).join('')}</div></div><div class="chart-bottom"><span>Jun – Nov 2026</span><strong>Every payment, accounted for ${icon('arrow')}</strong></div></section><section class="panel"><div class="panel-heading"><div><h2>Where your money goes</h2><p class="panel-subtitle">Expense breakdown by category · all time</p></div></div><div class="spending-content"><div class="donut" style="background:conic-gradient(${total?gradient:'#e7ebe5'})" role="img" aria-label="Expense distribution by category"><div class="donut-center"><small>Total expenses</small><strong>${money(total)}</strong></div></div><div class="category-legend">${spending.map(s=>`<div class="category-row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><strong>${total?Math.round(s.value/total*100):0}%</strong></div>`).join('')}</div></div><div class="chart-bottom"><span>${categories.length} expense categories</span><strong>Built from your transactions</strong></div></section></div>`;}
function filteredTransactions(){return db.transactions.filter(t=>{const status=reimbursement(t)[0];if(tab==='internal'&&!(t.type==='EXPENSE'&&!isExternal(t)))return false;if(tab==='external'&&!(t.type==='EXPENSE'&&isExternal(t)))return false;if(tab==='pending'&&!['pending','partial'].includes(status))return false;if(tab==='paybacks'&&t.type!=='PAYBACK')return false;if(tab==='credits'&&t.type!=='CREDIT')return false;if(filters.client&&t.client_id!==filters.client)return false;if(filters.payer&&t.payer!==filters.payer&&t.recipient!==filters.payer)return false;if(filters.vendor&&t.vendor!==filters.vendor)return false;if(filters.category&&t.category!==filters.category)return false;if(filters.location&&t.location!==filters.location)return false;if(filters.from&&t.date<filters.from)return false;if(filters.to&&t.date>filters.to)return false;const recipient=t.vendor?vendor(t.vendor)?.name:account(t.recipient)?.name;return `${client(t.client_id)?.name||account(t.payer)?.name} ${recipient} ${t.location||''} ${t.category||''} ${t.mode} ${t.amount}`.toLowerCase().includes(search.toLowerCase());}).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));}
function table(){const list=filteredTransactions(),size=page==='overview'?5:10;const pages=Math.max(1,Math.ceil(list.length/size));pageNumber=Math.min(pageNumber,pages);const rows=list.slice((pageNumber-1)*size,pageNumber*size);return `<section class="panel"><div class="table-toolbar"><div class="table-title"><h2>${page==='overview'?'Recent transactions':'All transactions'}</h2><span class="count-pill">${list.length}</span></div><div class="toolbar-actions"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Search transactions…" aria-label="Search transactions" value="${esc(search)}"></label>${button('Filters','filters','filter')}</div></div><div class="filters">${[['all','All transactions'],['internal','Business funded'],['external','Externally funded'],['pending','Pending payback'],['paybacks','Repayments'],['credits','Credits received']].map(([id,name])=>`<button class="chip ${tab===id?'active':''}" data-tab="${id}" aria-pressed="${tab===id}">${name}</button>`).join('')}</div>${showFilters?`<div class="more-filters filter-fields"><select aria-label="Filter account" data-filter="payer"><option value="">All accounts</option>${db.accounts.map(a=>`<option value="${a.id}" ${filters.payer===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select><select aria-label="Filter client" data-filter="client"><option value="">All clients</option>${db.clients.map(c=>`<option value="${esc(c.id)}" ${filters.client===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select aria-label="Filter vendor" data-filter="vendor"><option value="">All vendors</option>${db.vendors.map(v=>`<option value="${v.id}" ${filters.vendor===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select><select aria-label="Filter category" data-filter="category"><option value="">All categories</option>${categories.map(c=>`<option ${filters.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select aria-label="Filter location" data-filter="location"><option value="">All locations</option>${locations.map(l=>`<option value="${esc(l)}" ${filters.location===l?'selected':''}>${esc(l)}</option>`).join('')}</select><label>From <input aria-label="From date" type="date" data-filter="from" value="${filters.from}"></label><label>To <input aria-label="To date" type="date" data-filter="to" value="${filters.to}"></label><button class="chip" data-action="clear-filters">Clear filters</button></div>`:''}<div class="table-scroll"><table><thead><tr><th>DATE</th><th>TYPE</th><th>FROM</th><th>TO</th><th>CATEGORY</th><th>LOCATION</th><th>MODE</th><th style="text-align:right">AMOUNT</th><th>STATUS</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(t=>{const [status,label]=reimbursement(t);return `<tr><td>${dateLabel(t.date)}</td><td>${esc(t.type==='CREDIT'?'Credit':t.type==='PAYBACK'?'Payback':t.type==='TRANSFER'?'Transfer':'Expense')}</td><td>${esc(t.type==='CREDIT'?client(t.client_id)?.name:account(t.payer)?.name)}</td><td>${esc(t.vendor?vendor(t.vendor)?.name:account(t.recipient)?.name||'—')}</td><td>${esc(t.category||(t.type==='PAYBACK'?'Payback / Settlement':t.type==='CREDIT'?'Client receipt':'Account transfer'))}</td><td>${esc(t.location)}</td><td>${esc(t.mode==='CASH'?'Cash':t.mode)}</td><td class="amount">${money(t.amount)}</td><td><span class="status ${status}">${label}</span></td><td><button class="row-action" data-detail="${t.id}" aria-label="View transaction dated ${esc(dateLabel(t.date))}">${icon('more')}</button></td></tr>`;}).join('')}</tbody></table>${!rows.length?'<div class="empty">No transactions match your filters. Try a different search.</div>':''}</div><div class="table-footer"><span>${list.length?`Showing ${(pageNumber-1)*size+1}–${Math.min(pageNumber*size,list.length)} of ${list.length} transactions`:'0 transactions'}</span><div class="pagination"><button data-pagination="${pageNumber-1}" ${pageNumber===1?'disabled':''} aria-label="Previous page">‹</button>${Array.from({length:pages},(_,i)=>`<button data-pagination="${i+1}" class="${pageNumber===i+1?'active':''}" aria-label="Page ${i+1}" ${pageNumber===i+1?'aria-current="page"':''}>${i+1}</button>`).join('')}<button data-pagination="${pageNumber+1}" ${pageNumber===pages?'disabled':''} aria-label="Next page">›</button></div></div></section>`;}
function creditorStrip(){return `<section class="panel creditor-strip"><div class="panel-heading"><div><h2>A quick look at paybacks</h2><p class="panel-subtitle">A little help, clearly accounted for.</p></div><a class="button text" href="#creditors">View all paybacks ${icon('arrow')}</a></div><div class="creditor-mini-grid">${externalAccounts().slice(0,3).map((a,i)=>`<div class="creditor-mini"><span class="initials ${['','sage','lilac'][i]}">${esc(initials(a.owner))}</span><div><strong>${esc(a.owner)}</strong><small>${esc(a.name)}</small></div><div class="balance"><strong>${money(creditorStats(a.id).balance)}</strong><button data-repay="${a.id}">Record payback ↗</button></div></div>`).join('')}</div></section>`;}
function creditors(){return `${heading('Good accounts. Clear relationships.','See who has your back, and what you owe them.','PAYBACKS & REIMBURSEMENTS')}${metrics(true)}<div class="creditor-cards">${externalAccounts().map((a,i)=>{const s=creditorStats(a.id);return `<section class="panel creditor-card"><div class="person"><span class="initials ${['','sage','lilac'][i%3]}">${esc(initials(a.owner))}</span><div><h2>${esc(a.owner)}</h2><small>${esc(a.name)}</small></div></div><div class="detail-line"><span>Total funded</span><strong>${money(s.fronted)}</strong></div><div class="detail-line"><span>Total reimbursed</span><strong>${money(s.settled)}</strong></div><div class="owed-line"><span>Outstanding balance</span><strong>${money(s.balance)}</strong></div><button class="button ${s.balance>0?'primary':''}" data-repay="${a.id}" ${s.balance<=0?'disabled':''}>${icon('transactions')} ${s.balance>0?'Record payback':'All settled'}</button></section>`;}).join('')}</div><p class="section-note">${icon('creditors')} Repayments reduce what you owe. They don’t count as a second expense. Partial reimbursements are allocated to the oldest expenses first by the server.</p>`;}
function directory(){const isAccounts=page==='accounts';return `${heading(isAccounts?'Every account. One picture.':'The people behind your progress.',isAccounts?'Business funds and personal support, organized in one place.':'A complete payment history, no matter who made the payment.',isAccounts?'FUNDING ACCOUNTS':'YOUR VENDOR DIRECTORY')}<div style="margin-bottom:22px">${button(isAccounts?'Add account':'Add vendor',isAccounts?'new-account':'new-vendor','plus')}</div><div class="directory-grid">${(isAccounts?db.accounts:db.vendors).map((item,i)=>{const transactions=db.transactions.filter(t=>t.type==='EXPENSE'&&(isAccounts?t.payer===item.id:t.vendor===item.id));return `<section class="panel directory-card"><span class="initials ${['','sage','lilac','blue'][i%4]}">${isAccounts?icon('accounts'):esc(initials(item.name))}</span><h2>${esc(item.name)}</h2><p>${esc(isAccounts?item.detail:item.role)}</p><span class="status ${isAccounts&&item.type==='THIRD_PARTY_CREDITOR'?'pending':'paid'}">${isAccounts?(item.type==='INTERNAL'?'Business owned':'External creditor'):esc(item.category)}</span><div class="large-number">${money(sum(transactions))}</div>${isAccounts&&item.type==='INTERNAL'?accountMovement(item.id):''}<small>${transactions.length} expense payment${transactions.length!==1?'s':''} · all time</small><div style="margin-top:16px;display:flex;justify-content:space-between"><button class="button text" data-edit-reference="${item.id}">Edit</button><button class="button text" data-directory="${item.id}">View transactions ${icon('arrow')}</button></div></section>`;}).join('')}</div>`;}
function accountMovement(id){
 const a=summary.accounts?.find(a=>a.id===id)||{incoming:0,credits:0,outgoing:0,net_movement:0};
 return `<div class="detail-line"><span>Client credits</span><strong>${money(a.credits)}</strong></div><div class="detail-line"><span>Incoming</span><strong>${money(a.incoming)}</strong></div><div class="detail-line"><span>Outgoing</span><strong>${money(a.outgoing)}</strong></div><div class="detail-line"><span>Net movement</span><strong>${money(a.net_movement)}</strong></div><p>Net movement excludes any opening balance.</p>`;
}
function clientsDirectory(){
 return `${heading('Your clients. Every receipt.','Manage clients and track payments received.','CLIENT DIRECTORY')}<div style="margin-bottom:22px">${button('Add client','new-client','plus')}</div><div class="directory-grid">${db.clients.map((c,i)=>{const rows=db.transactions.filter(t=>t.type==='CREDIT'&&t.client_id===c.id);return `<section class="panel directory-card"><span class="initials ${['','sage','lilac'][i%3]}">${esc(initials(c.name))}</span><h2>${esc(c.name)}</h2><p>${esc(c.contact||'')}</p><p>${esc(c.phone||'')} ${esc(c.email||'')}</p><div class="large-number">${money(sum(rows))}</div><small>${rows.length} payment${rows.length===1?'':'s'} received</small><div style="margin-top:16px;display:flex;justify-content:space-between"><button class="button text" data-edit-client="${esc(c.id)}">Edit</button><button class="button text" data-directory="${esc(c.id)}">View payments ${icon('arrow')}</button></div></section>`;}).join('')}</div>${db.clients.length?'':'<div class="empty">Add your first client to record incoming payments.</div>'}`;
}
function openClientForm(record=null){
 captureDraft();const c=record||{};
 detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">${record?'Edit client':'Add client'}</h2><button class="close-button" data-action="close-detail" aria-label="Close client form">&times;</button></div><form id="client-form" data-id="${esc(c.id||'')}" class="form-body"><div class="form-grid"><label class="form-field full">Client name<input name="name" required maxlength="120" value="${esc(c.name||'')}" placeholder="e.g. ABC Constructions"></label><label class="form-field full">Contact person (optional)<input name="contact" maxlength="120" value="${esc(c.contact||'')}"></label><label class="form-field">Phone (optional)<input name="phone" type="tel" maxlength="40" value="${esc(c.phone||'')}"></label><label class="form-field">Email (optional)<input name="email" type="email" maxlength="254" value="${esc(c.email||'')}"></label></div><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">${record?'Save changes':'Add client'}</button></div></form>`;detailDialog.showModal();
}
function render(){if(renderAuth())return;if(isProvider()){renderProvider();return;}navigation();main.innerHTML=(!connected?`<div class="connection-banner ${loadError?'error':''}" role="status">${esc(loadError||'Loading your accounts and transactions...')} ${loadError?'<button class="button" data-action="refresh">Retry</button>':''}</div>`:loadError?`<div class="connection-banner error" role="alert">Refresh failed: ${esc(loadError)}. Showing data from the last successful refresh.</div>`:'')+(page==='overview'?`${heading('A clearer view of your money.','Your payments, people, and paybacks. All in one place.')}${metrics()}${charts()}${table()}${creditorStrip()}`:page==='transactions'?`${heading('Every payment has a story.','Track client receipts, business expenses, and repayments.','TRANSACTION LEDGER')}${table()}`:page==='creditors'?creditors():page==='clients'?clientsDirectory():directory());document.querySelector('.local-badge').textContent=loading?'Refreshing...':connected?`Updated ${lastRefreshed.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`:'API disconnected';}
function route(){const key=location.hash.slice(1)||'overview';page=['overview','transactions','creditors','vendors','accounts','clients','customers','users'].includes(key)?key:'overview';pageNumber=1;render();}
window.addEventListener('hashchange',route);
function options(list,selected){return list.map(a=>`<option value="${esc(a.id)}" ${selected===a.id?'selected':''}>${esc(a.name)}</option>`).join('');}
function captureDraft(){const form=document.querySelector('#transaction-form');if(form)draft={...draft,...Object.fromEntries(new FormData(form).entries())};}
function renderForm(){const t=draft;const validPayers=formType==='PAYBACK'?db.accounts.filter(a=>a.type==='INTERNAL'):db.accounts;const recipients=formType==='PAYBACK'?externalAccounts():db.accounts.filter(a=>a.type==='INTERNAL');dialog.innerHTML=`<div class="modal-head"><h2 id="dialog-title">${editId?'Edit transaction':'Add a transaction'}</h2><button class="close-button" data-action="close-modal" aria-label="Close transaction form">×</button></div><form id="transaction-form" class="form-body"><p class="modal-subtitle">A clear record today. A clearer picture tomorrow.</p><div class="type-switch">${(editId&&formType==='TRANSFER'?['EXPENSE','PAYBACK','CREDIT','TRANSFER']:['EXPENSE','PAYBACK','CREDIT']).map(type=>`<button type="button" class="${formType===type?'selected':''}" data-form-type="${type}" aria-pressed="${formType===type}">${type==='EXPENSE'?'Expense':type==='PAYBACK'?'Payback':type==='CREDIT'?'Credit':'Transfer'}</button>`).join('')}</div><div class="form-grid"><label class="form-field">Amount (₹)<input name="amount" type="number" aria-describedby="transaction-amount-words" min="0.01" max="999999999999.99" step="0.01" placeholder="0.00" required value="${esc(t.amount||'')}"><small id="transaction-amount-words" class="amount-words" data-amount-words aria-live="polite" aria-atomic="true">${amountInWords(t.amount)}</small></label><label class="form-field">Payment date<input name="date" type="date" value="${esc(t.date||isoToday())}" required></label>${formType==='CREDIT'?`<label class="form-field"><span class="field-heading">Client<button class="inline-add" type="button" data-action="new-client">+ Add client</button></span><select name="client_id" required><option value="">Select client</option>${options(db.clients,t.client_id)}</select></label>`:`<label class="form-field"><span class="field-heading">Paid by <button class="inline-add" type="button" data-action="new-account">+ Add account</button></span><select name="payer" required>${options(validPayers,t.payer)}</select></label>`}${formType!=='EXPENSE'?`<label class="form-field">${formType==='PAYBACK'?'Creditor':formType==='CREDIT'?'Received into':'Destination account'}<select name="recipient" required>${options(recipients,t.recipient)}</select></label>`:''}${formType==='EXPENSE'?`<label class="form-field"><span class="field-heading">Vendor (optional)<button class="inline-add" type="button" data-action="new-vendor">+ Add vendor</button></span><select name="vendor"><option value="">No vendor</option>${options(db.vendors,t.vendor)}</select></label><label class="form-field"><span class="field-heading">Expense category<button class="inline-add" type="button" data-action="new-category">+ Add category</button></span><select name="category" required>${categories.map(c=>`<option ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`:''}<label class="form-field">Payment mode<select name="mode" required>${['UPI','NEFT','RTGS','IMPS','CASH','CHEQUE'].map(m=>`<option value="${m}" ${t.mode===m?'selected':''}>${m==='CASH'?'Cash':m==='CHEQUE'?'Cheque':m}</option>`).join('')}</select><label class="form-field full"><span class="field-heading">Location<button class="inline-add" type="button" data-action="new-location">+ Add location</button></span><select name="location" required><option value="">Select location</option>${[...new Set([...locations,...(t.location?[t.location]:[])])].map(l=>`<option value="${esc(l)}" ${t.location===l?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label class="upload form-field full">${icon('upload')}<span id="file-label">${esc(t.receiptName||'Click or drop a receipt here')}</span><small>PDF, PNG or JPEG · Up to 10 MB · Filename only in this demo</small><input name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" aria-label="Attach receipt"></label></div><div class="form-actions"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${icon('check')}${editId?'Save changes':'Save transaction'}</button></div></form>`;}
function openForm(type='EXPENSE',recipient=null,transaction=null){formType=type;editId=transaction?.id||null;draft=transaction?{...transaction}:{date:isoToday(),payer:db.accounts.find(a=>a.type==='INTERNAL')?.id||db.accounts[0]?.id,mode:'UPI',idempotencyKey:crypto.randomUUID(),...(recipient?{recipient,amount:Math.max(0,creditorStats(recipient).balance)}:{})};if(detailDialog.open)detailDialog.close();renderForm();dialog.showModal();}
function openDetail(id){const t=db.transactions.find(x=>x.id===id);if(!t)return;const recipient=t.vendor?vendor(t.vendor)?.name:account(t.recipient)?.name;detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">Transaction details</h2><button class="close-button" data-action="close-detail" aria-label="Close details">×</button></div><div class="detail-content">${[['Date',dateLabel(t.date)],['Type',t.type],['Amount',money(t.amount)],...(t.type==='CREDIT'?[['Client',client(t.client_id)?.name]]:[['Paid by',account(t.payer)?.name]]),...(t.vendor?[['Vendor',vendor(t.vendor)?.name]]:[]),['Location',t.location],...(t.type==='EXPENSE'?[]:[[t.type==='PAYBACK'?'Creditor':t.type==='CREDIT'?'Received into':'Destination account',recipient]]),['Category',t.category||'—'],['Payment mode',t.mode],['Status',reimbursement(t)[1]],['Receipt filename',t.receiptName||'No attachment']].map(([k,v])=>`<div class="detail-line"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}<div class="form-actions"><button class="button danger" data-delete="${id}">Reverse</button><button class="button primary" data-edit="${id}">Edit transaction</button></div></div>`;detailDialog.showModal();}
function openDirectoryForm(kind, record=null){captureDraft();const isAccount=kind==='account',t=record||{};detailDialog.innerHTML=`<div class="modal-head"><h2 id="detail-title">${record?'Edit':'Add'} ${isAccount?'funding account':'vendor'}</h2><button class="close-button" data-action="close-detail" aria-label="Close form">?</button></div><form id="directory-form" data-kind="${kind}" data-id="${esc(t.id||'')}" class="form-body"><div class="form-grid"><label class="form-field full">${isAccount?'Account name':'Vendor name'}<input name="name" required maxlength="120" value="${esc(t.name||'')}" placeholder="${isAccount?'e.g. Business bank account':'e.g. Shree Balaji Steels'}"></label>${isAccount?`<label class="form-field full">Account ownership<select name="type"><option value="INTERNAL" ${t.type==='INTERNAL'?'selected':''}>Business owned</option><option value="THIRD_PARTY_CREDITOR" ${t.type==='THIRD_PARTY_CREDITOR'?'selected':''}>External creditor (reimbursable)</option></select></label><label class="form-field full">Owner name<input name="owner" maxlength="120" required value="${esc(t.owner||'')}"></label>`:`<label class="form-field full">Default category<select name="category">${categories.map(c=>`<option ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`}<label class="form-field full">${isAccount?'Account description':'Role / description'}<input name="description" maxlength="500" value="${esc((isAccount?t.detail:t.role)||'')}"></label></div><div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button class="button primary" type="submit">${record?'Save changes':isAccount?'Add account':'Add vendor'}</button></div></form>`;detailDialog.showModal();}
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
 const target=event.target.closest('button,a');if(!target)return;
 try {
  const action=target.dataset.action;
  if(action==='sign-in'){await window.ClearbookAuth.login();return;}
  if(action==='sign-out'){await window.ClearbookAuth.logout();return;}
  if(action==='refresh')await refreshData(true);
  if(isProvider()){
   if(action==='new-customer'||action==='new-customer-user'){
    detailDialog.innerHTML=window.ClearbookProvider.form(action==='new-customer'?'customer':'user',providerData.customers,providerData.users);
    detailDialog.showModal();
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
  if(action==='add'){if(!connected){toast('Connect to the API first.');return;}openForm();}
  if(action==='filters'){showFilters=!showFilters;render();}
  if(action==='clear-filters'){filters={};tab='all';search='';pageNumber=1;render();}
  if(action==='close-modal'&&!submitting)dialog.close();if(action==='close-detail'&&!submitting)detailDialog.close();
  if(action==='new-client')openClientForm();
  if(action==='new-location')openLocationForm();
  if(action==='new-category')openCategoryForm();
  if(action==='new-account')openDirectoryForm('account');if(action==='new-vendor')openDirectoryForm('vendor');
  if(action==='export')exportCSV();
  if(target.dataset.tab){tab=target.dataset.tab;pageNumber=1;render();}
  if(target.dataset.pagination){pageNumber=Number(target.dataset.pagination);render();}
  if(target.dataset.repay)openForm('PAYBACK',target.dataset.repay);
  if(target.dataset.detail)openDetail(target.dataset.detail);
  if(target.dataset.edit){const t=db.transactions.find(x=>x.id===target.dataset.edit);openForm(t.type,null,t);}
  if(target.dataset.editClient)openClientForm(client(target.dataset.editClient));
  if(target.dataset.editReference){const isAccount=page==='accounts';openDirectoryForm(isAccount?'account':'vendor',(isAccount?db.accounts:db.vendors).find(x=>x.id===target.dataset.editReference));}
  if(target.dataset.formType&&!submitting){captureDraft();formType=target.dataset.formType;renderForm();}
  if(target.dataset.directory){filters={[page==='accounts'?'payer':page==='clients'?'client':'vendor']:target.dataset.directory};tab='all';search='';showFilters=true;location.hash='transactions';}
  if(target.dataset.delete){const id=target.dataset.delete;target.closest('.form-actions').outerHTML=`<form id="reversal-form" data-id="${id}" class="confirm-delete"><label class="form-field">Reason for reversal<input name="reason" maxlength="500" required placeholder="e.g. Duplicate entry"></label><p>Reversing keeps the original record and recalculates balances.</p><div class="form-actions"><button type="button" class="button" data-detail="${id}">Keep transaction</button><button class="button danger" type="submit">Reverse transaction</button></div></form>`;}
 } catch(error){toast(error.message);}
});
document.addEventListener('input',event=>{if(event.target.name==='amount'){const preview=event.target.closest('.form-field')?.querySelector('[data-amount-words]');if(preview)preview.textContent=amountInWords(event.target.value);}if(event.target.id==='search'){search=event.target.value;pageNumber=1;render();document.querySelector('#search').focus();}});
document.addEventListener('change',event=>{const el=event.target;if(el.dataset.filter){filters[el.dataset.filter]=el.value;pageNumber=1;render();}if(el.name==='vendor'){const p=vendor(el.value);const select=dialog.querySelector('[name="category"]');if(p&&select)select.value=p.category;}if(el.name==='receipt'){const file=el.files[0];if(file){if(file.size>10*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type)){el.value='';toast('Choose a PDF, PNG, or JPEG smaller than 10 MB.');return;}draft.receiptName=file.name;document.querySelector('#file-label').textContent=file.name;}}});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['transaction-form','directory-form','category-form','location-form','client-form','reversal-form','customer-form','customer-user-form'].includes(form.id))return;
 event.preventDefault();if(submitting)return;submitting=true;
 const submitButton=form.querySelector('button[type="submit"], button.primary');
 if(submitButton)submitButton.disabled=true;
 try {
  if(form.id==='customer-form'||form.id==='customer-user-form'){
   if(!isProvider())throw new Error('Software-provider access is required.');
   const body=Object.fromEntries(new FormData(form));
   const result=await api(form.id==='customer-form'?'/provider/customers':'/provider/users',{method:'POST',body});
   form.reset();detailDialog.innerHTML='';detailDialog.close();
   toast(form.id==='customer-form'?'Organization onboarded.':result.existing_account?'Existing account linked. Its password was unchanged.':'Organization user added. Share the temporary password privately.');
  }else if(form.id==='transaction-form'){
   captureDraft();const t={date:draft.date,amount:draft.amount,type:formType,payer:formType==='CREDIT'?null:draft.payer,client_id:formType==='CREDIT'?draft.client_id:null,
    vendor:formType==='EXPENSE'?draft.vendor||null:null,recipient:formType==='EXPENSE'?null:draft.recipient,
    category:formType==='EXPENSE'?draft.category:null,mode:draft.mode,location:draft.location?.trim(),notes:(draft.notes||'').trim(),receiptName:draft.receiptName||null,
    ...(editId?{version:draft.version}:{})};
   const error=validateTransaction({...t,amount:Number(t.amount)});if(error)throw new Error(error);
   await api(editId?`/transactions/${editId}`:'/transactions',{method:editId?'PATCH':'POST',body:t,key:draft.idempotencyKey});
   dialog.close();toast(editId?'Transaction updated.':'Transaction saved.');
  }else if(form.id==='client-form'){
   const fields=Object.fromEntries(new FormData(form)),id=form.dataset.id;
   const body=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value.trim()]));
   const result=await api('/clients'+(id?'/'+id:''),{method:id?'PATCH':'POST',body});
   if(!id){db.clients.push(result);if(dialog.open)draft.client_id=result.id;}
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
   const body={name:v.name.trim(),...(isAccount?{type:v.type,owner:v.owner.trim(),detail:v.description.trim()}:{category:v.category,role:v.description.trim()})};
   const result=await api(`/${isAccount?'accounts':'vendors'}${id?'/'+id:''}`,{method:id?'PATCH':'POST',body});
   detailDialog.close();if(dialog.open){draft[isAccount?'payer':'vendor']=result.id;if(!isAccount)draft.category=result.category;}
   toast(id?'Changes saved.':isAccount?'Account added.':'Vendor added.');
  }else{
   const id=form.dataset.id,t=db.transactions.find(t=>t.id===id);const reason=new FormData(form).get('reason');
   await api(`/transactions/${id}/reverse`,{method:'POST',body:{reason,version:t.version}});detailDialog.close();toast('Transaction reversed. History preserved.');
  }
  if(loading) await pendingLoad;
  const refreshed=await refreshData();
  if(dialog.open)renderForm();
  if(!refreshed)toast('Saved successfully, but refresh failed. Click Refresh to load the latest data.');
 }catch(error){toast(error.message);}
 finally{submitting=false;if(submitButton)submitButton.disabled=false;}
});
function exportCSV(){const rows=[['Date','Type','Client','From account','To account','Vendor','Category','Location','Mode','Amount (INR)','Status'],...filteredTransactions().map(t=>[t.date,t.type,client(t.client_id)?.name,account(t.payer)?.name,account(t.recipient)?.name,vendor(t.vendor)?.name,t.category||'',t.location,t.mode,t.amount,reimbursement(t)[1]])];const safeCell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`clearbook-transactions-${isoToday()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Transaction export downloaded.');}
let authError='';
function renderProvider(){
 const userView=page==='users';
 document.querySelector('#navigation').innerHTML=[['customers','Organizations','accounts'],['users','Users','vendors']].map(([key,label,ico])=>`<a href="#${key}" class="${(userView?key==='users':key==='customers')?'active':''}">${icon(ico)}<span class="nav-text">${label}</span></a>`).join('');
 document.querySelector('#breadcrumb-current').textContent=userView?'Organization users':'Organizations';
 main.innerHTML=window.ClearbookProvider.render({...providerData,page,loading,error:loadError});
 document.querySelector('.local-badge').textContent=loading?'Refreshing...':'Provider console';
}
function renderAuth(){
 const auth=window.ClearbookAuth;
 if(!auth?.enabled)return false;
 const signed=auth.isSignedIn();
 document.body.classList.toggle('signed-out',!signed);
 if(!signed){
  main.innerHTML=`<section class="auth-card"><div class="eyebrow">CLEARBOOK WORKSPACE</div><h1>Your accounts. In one place.</h1><p>Sign in to manage your business expenses, vendors and paybacks.</p>${authError?`<p class="auth-error" role="alert">${esc(authError)}</p>`:''}<button class="button primary" data-action="sign-in">Sign in securely ${icon('arrow')}</button><small>Access is limited to your workspace members.</small></section>`;
  document.querySelector('#navigation').innerHTML='';
  document.querySelector('.local-badge').textContent='Sign-in required';
  return true;
 }
 if(!workspaceSession){
  main.innerHTML=`<section class="auth-card"><div class="eyebrow">CLEARBOOK</div><h1>${loadError?'Account access unavailable':'Loading your account...'}</h1><p role="status">${esc(loadError||'Checking your workspace access.')}</p><button class="button" data-action="refresh">Retry</button><button class="button" data-action="sign-out">Sign out</button></section>`;
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
 window.addEventListener('clearbook-auth-change',()=>{if(!window.ClearbookAuth.isSignedIn()){workspaceSession=null;providerData={customers:[],users:[]};db={accounts:[],vendors:[],transactions:[]};summary={totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};connected=false;dialog.close();detailDialog.close();render();}});
 window.CLEARBOOK_READY=(async()=>{try{await window.ClearbookAuth.init();}catch(error){authError=error.message;}route();if(!window.ClearbookAuth.enabled||window.ClearbookAuth.isSignedIn())await refreshData();})();
}else{route();window.CLEARBOOK_READY=refreshData();}
