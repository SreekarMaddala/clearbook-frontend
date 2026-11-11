'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const A=require('../analytics.js');
const accounts=[{id:'bank',name:'Business bank',type:'INTERNAL'},{id:'cash',name:'Site cash',type:'INTERNAL'},{id:'creditor',name:'External creditor',type:'THIRD_PARTY_CREDITOR'}];
const clients=[{id:'client',name:'Tracks & Towers <test>'}];
const vendors=[{id:'vendor',name:'Site vendor'}];
const tx=(id,type,amount,props={})=>({id,type,amount,date:'2026-10-15',payer:'bank',recipient:null,category:null,vendor:null,client_id:null,location:'Madnoor',mode:'NEFT',status:['paid','Paid'],...props});
const data={accounts,clients,vendors,transactions:[
 tx('prior','CREDIT',200,{date:'2026-09-15',payer:null,recipient:'bank',client_id:'client'}),
 tx('credit','CREDIT',1000.25,{payer:null,recipient:'bank',client_id:'client',status:['received','Received']}),
 tx('expense','EXPENSE',300.10,{vendor:'vendor',category:'Steel'}),
 tx('externalExpense','EXPENSE',100.15,{payer:'creditor',vendor:'vendor',category:'Steel'}),
 tx('payback','PAYBACK',50,{recipient:'creditor'}),
 tx('internalTransfer','TRANSFER',200,{recipient:'cash'}),
 tx('externalFunding','TRANSFER',500,{payer:'creditor',recipient:'bank'}),
 tx('reversed','EXPENSE',9900,{reversed_at:'2026-10-16'}),
 tx('statusReversed','CREDIT',9900,{status:['reversed','Reversed'],payer:null,recipient:'bank'}),
]};
const totalRows=A.exportTotalRows(data.transactions,13,10);
assert.equal(totalRows[0][10],'2350.50');
assert.equal(totalRows.find(row=>row[0]==='Total Debit')[10],'400.25');
assert.equal(totalRows.find(row=>row[0]==='Total Client credit')[10],'1200.25');
assert.equal(totalRows.find(row=>row[0]==='Total Payback')[10],'50.00');
assert.equal(totalRows.find(row=>row[0]==='Total Transfer')[10],'700.00');
assert.ok(totalRows.every(row=>row.length===13));
assert.equal(A.exportTotalRows([],12,10)[0][10],'0.00');
assert.equal(A.exportTotalRows([tx('a','EXPENSE',0.1),tx('b','EXPENSE',0.2)],12,10)[0][10],'0.30');
let settings={...A.defaults(),period:'custom',from:'2026-10-01',to:'2026-10-31'};
assert.equal(A.defaults().period,'month');
assert.deepEqual(A.resolveRange(A.defaults(),data.transactions,'2026-11-09'),{from:'2026-11-01',to:'2026-11-30'});
assert.deepEqual(A.resolveRange({...A.defaults(),month:'2024-02'},[],'2026-11-09'),{from:'2024-02-01',to:'2024-02-29'});
assert.deepEqual(A.resolveRange({...A.defaults(),month:'2026-12'},[],'2026-11-09'),{from:'2026-12-01',to:'2026-12-31'});
assert.equal(A.sanitize({month:'2026-13'}).month,'');
assert.equal(A.sanitize({month:'2026-10'}).month,'2026-10');
assert.equal(A.buildReport(data,{...A.defaults(),month:'2026-10'},'2026-11-09').rows.length,6);
let report=A.buildReport(data,settings,'2026-11-09');
assert.equal(report.rows.length,6);
assert.deepEqual(report.current,{expenses:40025,credits:100025,paybacks:5000,incoming:150025,outgoing:35010,count:6,operating:60000,net:115015});
assert.equal(report.prior.credits,20000);
assert.deepEqual(report.previousRange,{from:'2026-08-31',to:'2026-09-30'});
assert.equal(report.groups.length,1);
assert.equal(report.groups[0].value,40025);
assert.equal(report.groups[0].count,2);
assert.equal(report.locations[0].expenses,40025);
assert.equal(report.locations[0].net,115015);
assert.equal(report.clients[0].value,100025);
assert.equal(report.vendors[0].value,40025);
assert.equal(report.series.reduce((n,b)=>n+b.incoming,0),report.current.incoming);
assert.equal(report.series.reduce((n,b)=>n+b.outgoing,0),report.current.outgoing);
const bank=report.accounts.find(a=>a.id==='bank'),cash=report.accounts.find(a=>a.id==='cash');
assert.equal(bank.outgoing,55010);
assert.equal(cash.incoming,20000);
assert.equal(bank.net+cash.net,report.current.net);
const map=new Map(accounts.map(a=>[a.id,a]));
assert.deepEqual(A.movement(data.transactions.find(t=>t.id==='internalTransfer'),map),{incoming:0,outgoing:0});
assert.deepEqual(A.movement(data.transactions.find(t=>t.id==='externalExpense'),map),{incoming:0,outgoing:0});
report=A.buildReport(data,{...settings,account:'bank'},'2026-11-09');
assert.equal(report.current.outgoing,55010);
assert.equal(report.current.net,95015);
assert.equal(report.current.expenses,30010);
report=A.buildReport(data,{...settings,account:'cash'},'2026-11-09');
assert.equal(report.current.incoming,20000);
assert.equal(report.current.outgoing,0);
report=A.buildReport(data,{...settings,client:'client',type:'CREDIT',dimension:'client',metric:'credits'},'2026-11-09');
assert.equal(report.rows.length,1);
assert.equal(report.current.credits,100025);
assert.equal(report.groups[0].name,clients[0].name);
assert.equal(report.groups[0].share,100);
report=A.buildReport(data,{...settings,location:'Unknown'},'2026-11-09');
assert.equal(report.current.count,0);
assert.equal(report.current.net,0);
assert.equal(report.groups.length,0);
assert.equal(report.series.length,1);
assert.ok(A.buildReport(data,{...settings,from:'2026-12-01'},'2026-11-09').error);
assert.ok(A.buildReport(data,{...settings,to:''},'2026-11-09').error);
assert.deepEqual(A.resolveRange({...settings,period:'lastMonth'},[],'2024-03-15'),{from:'2024-02-01',to:'2024-02-29'});
assert.deepEqual(A.resolveRange({...settings,period:'financialYear'},[],'2026-02-15'),{from:'2025-04-01',to:'2026-02-15'});
assert.deepEqual(A.resolveRange({...settings,period:'quarter'},[],'2026-11-09'),{from:'2026-10-01',to:'2026-11-09'});
assert.equal(A.resolveRange({...settings,period:'last90'},[],'2026-11-09').from,'2026-08-12');
report=A.buildReport(data,{...settings,group:'day',from:'2025-01-01',to:'2026-12-31'},'2026-11-09');
assert.equal(report.group,'week');
assert.equal(report.series.reduce((n,b)=>n+b.credits,0),120025);
assert.deepEqual(A.sanitize({period:'evil',dimension:'__proto__',from:'2026-02-30',widgets:['trend','trend','unknown']}),{...A.defaults(),widgets:['trend']});
assert.ok(A.csv([['=SUM(A1:A2)',' @cmd','He said "hello"','a,b']]).includes('"\'=SUM(A1:A2)"'));
assert.ok(A.csv([['=SUM(A1:A2)',' @cmd','He said "hello"','a,b']]).includes('"He said ""hello"""'));

// Exercise saved views, workspace isolation and real render/event contracts.
const storage=new Map(),downloads=[],notices=[],exportedTexts=[];
let html='',repaints=0,latestContext;
const browser={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
const ctx=vm.createContext({window:browser,Intl,Date,Map,Set,console,Blob:class extends Blob{constructor(parts,options){super(parts,options);exportedTexts.push(parts.join(''));}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},crypto:{randomUUID:()=>`view-${storage.size}`},setTimeout:fn=>fn(),
 document:{querySelector:()=>null,createElement:()=>({click(){downloads.push(this.download);}})},
 FormData:class {constructor(form){this.form=form;}get(key){return this.form[key];}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../analytics.js'),'utf8'),ctx);
const controller=browser.ClearbookAnalytics.create();
latestContext={data,categories:['Steel'],locations:['Madnoor'],workspaceId:'org-a',today:'2026-11-09',loading:false,notify:msg=>notices.push(msg),repaint:()=>{repaints++;html=controller.render(latestContext);}};
html=controller.render(latestContext);
assert.ok(html.includes('data-an-value="month" aria-pressed="true"'));
assert.ok(html.includes('type="month" data-an-setting="month" value="2026-11"'));
assert.ok(!html.includes('type="date" data-an-setting="from"'));
controller.handleChange({dataset:{anSetting:'month'},value:'2026-10'});
controller.handleClick({dataset:{anAction:'date-mode',anValue:'custom'}});
assert.ok(html.includes('data-an-value="custom" aria-pressed="true"'));
assert.ok(html.includes('data-an-setting="from" value="2026-10-01"'));
assert.ok(html.includes('data-an-setting="to" value="2026-10-31"'));
assert.ok(!html.includes('type="month"'));
controller.handleClick({dataset:{anAction:'date-mode',anValue:'month'}});
assert.ok(html.includes('type="month" data-an-setting="month" value="2026-10"'));
assert.ok(html.includes('Credits & debits over time'));
assert.ok(html.includes('Payment methods'));
assert.ok(html.includes('Payment activity'));
assert.ok(!html.includes('Credits less debits'));
assert.ok(!html.includes('Net movement'));
assert.ok(!html.includes('Net account movement'));
assert.ok(!html.includes('NaN'));
controller.handleClick({dataset:{anAction:'mode',anValue:'CASH'}});
assert.ok(html.includes('No transactions match these filters'));
controller.handleClick({dataset:{anAction:'mode',anValue:'CASH'}});
assert.ok(html.includes('data-detail="credit"'));
controller.handleClick({dataset:{anAction:'activity',anIndex:'14'}});
assert.ok(html.includes('Showing: <strong>15 Oct 2026</strong>'));
controller.handleClick({dataset:{anAction:'clear-drill'}});
assert.ok(html.includes('Breakdown explorer'));
assert.ok(html.includes('Tracks &amp; Towers &lt;test&gt;'));
assert.ok(!html.includes('Tracks & Towers <test>'));
assert.ok(html.includes('data-detail="credit"'));
controller.handleChange({dataset:{anSetting:'location'},value:'Madnoor'});
controller.handleClick({dataset:{anAction:'customize'}});
controller.saveView({viewName:'Madnoor receipts'});
assert.ok(html.includes('Madnoor receipts'));
assert.ok([...storage.values()].every(v=>!v.includes('1000.25')&&!v.includes('Tracks & Towers')),'Persist preferences, never ledger data.');
const view=JSON.parse(storage.get('clearbook.analytics.v1.org-a')).views[0];
controller.handleChange({dataset:{anSetting:'location'},value:'Unknown'});
assert.ok(html.includes('No transactions match these filters'));
controller.handleClick({dataset:{anAction:'view',anId:view.id}});
assert.ok(html.includes('value="Madnoor" selected'));
controller.handleClick({dataset:{anAction:'drill',anIndex:'0'}});
assert.ok(html.includes('Showing: <strong>Steel</strong>'));
controller.handleClick({dataset:{anAction:'export-ledger'}});
assert.equal(downloads.length,1);
assert.ok(downloads[0].includes('analytics-transactions'));
assert.ok(exportedTexts[0].includes('"TOTAL transaction value (excluding reversed)"'));
assert.ok(exportedTexts[0].includes('"400.25"'),'Drilled export totals must match the selected records.');
controller.handleClick({dataset:{anAction:'export-breakdown'}});
assert.ok(exportedTexts[1].includes('"TOTAL","400.25","2","100.00"'));
controller.handleClick({dataset:{anAction:'export'}});
assert.ok(exportedTexts[2].includes('"TOTAL transaction value (excluding reversed)"'));

controller.handleChange({dataset:{anSetting:'from'},value:'2026-12-01'});
controller.handleChange({dataset:{anSetting:'to'},value:'2026-11-01'});
assert.ok(html.includes('role="alert"'));
controller.handleClick({dataset:{anAction:'export'}});
assert.equal(downloads.length,3,'Invalid dates cannot produce a misleading export.');
latestContext={...latestContext,workspaceId:'org-b'};
html=controller.render(latestContext);
assert.ok(!html.includes('Madnoor receipts'),'A different workspace cannot inherit named views or filters.');
assert.ok(!html.includes('role="alert"'));
controller.handleClick({dataset:{anAction:'reset'}});
assert.ok(html.includes('type="month" data-an-setting="month" value="2026-11"'));
// Existing browser preferences adopt Monthly without losing saved views.
storage.set('clearbook.analytics.v1.org-legacy',JSON.stringify({settings:{period:'all',location:'Madnoor'},views:[{id:'legacy',name:'Old custom view',settings:{period:'custom',from:'2026-10-01',to:'2026-10-31'}}]}));
latestContext={...latestContext,workspaceId:'org-legacy'};
html=controller.render(latestContext);
assert.ok(html.includes('type="month" data-an-setting="month" value="2026-11"'));
assert.ok(html.includes('Old custom view'));
controller.handleClick({dataset:{anAction:'view',anId:'legacy'}});
assert.ok(html.includes('data-an-setting="from" value="2026-10-01"'));
// New preferences keep a chosen month when the page is reopened.
controller.handleClick({dataset:{anAction:'date-mode',anValue:'month'}});
controller.handleChange({dataset:{anSetting:'month'},value:'2026-10'});
const reopened=browser.ClearbookAnalytics.create();
assert.ok(reopened.render(latestContext).includes('type="month" data-an-setting="month" value="2026-10"'));
assert.ok(repaints>=8);
console.log('PASS: analytics amounts, account flows, comparisons, filters, reversed records, chart aggregation, exports, saved views and workspace isolation.');
