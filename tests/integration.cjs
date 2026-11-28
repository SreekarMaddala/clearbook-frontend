// Exercises the actual frontend event handlers against a real HTTP API.
// DOM stubs cover rendering contracts; this is not a visual browser test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn} = require('node:child_process');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clearbook-integration-'));
  const root = path.resolve(__dirname, '..');
  const apiPort = 5184, port = 5185;
  const backendRoot=process.env.CLEARBOOK_BACKEND_DIR || path.resolve(root,'../clearbook-backend');
  const server = spawn('python', ['-m', 'backend.server', '--seed-demo', '--port', String(apiPort)], {
    cwd:backendRoot, env:{...process.env, LOCAL_DATA_PATH:path.join(temp, 'test.json')}, stdio:['ignore','pipe','pipe'],
  });
  const frontend=spawn(process.execPath,['scripts/dev-server.cjs'],{cwd:root,env:{...process.env,PORT:String(port),CLEARBOOK_API_PROXY:`http://127.0.0.1:${apiPort}`},stdio:['ignore','pipe','pipe']});
  let serverError = '';
  frontend.stderr.on('data', chunk=>{serverError+=chunk;});
  const frontendReady=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Frontend did not start: '+serverError)),10000);
    frontend.stdout.once('data',()=>{clearTimeout(timer);resolve();});
    frontend.once('error',error=>{clearTimeout(timer);reject(error);});
    frontend.once('exit',code=>{clearTimeout(timer);reject(new Error(`Frontend exited ${code}: ${serverError}`));});
  });
  frontendReady.catch(()=>{}); // The API startup check is awaited first.
  server.stderr.on('data', chunk => {serverError += chunk;});
  try {
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Test server did not start: '+serverError)),10000);
      server.stdout.on('data', chunk => {if(chunk.toString().includes('Clearbook API:')){clearTimeout(timer);resolve();}});
      server.on('exit', code=>{clearTimeout(timer);reject(new Error(`Test server exited ${code}: ${serverError}`));});
    });
    await frontendReady;
    for (const file of ['/', '/app.js', '/analytics.js', '/analytics.css', '/config.js', '/styles.css', '/assets/at-infra-logo-green.png']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${file}`)).status,200);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/backend/seed.json`)).status,404);
    const nodes=new Map(), handlers={}, requests=[], exportBlobs=[];
    const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',open:false,hidden:true,setAttribute(){},removeAttribute(){},focus(){},classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(key);};
    const context=vm.createContext({
      Intl,Date,console,structuredClone,URLSearchParams,crypto:require('node:crypto').webcrypto,AbortSignal,Blob,URL:class extends URL{static createObjectURL(blob){exportBlobs.push(blob);return 'blob:export-test';}static revokeObjectURL(){}},setTimeout,clearTimeout,
      location:{hash:''}, window:{CLEARBOOK_CONFIG:{apiBase:`http://127.0.0.1:${port}/api`},addEventListener(){}},
      document:{createElement:()=>({click(){}}),querySelector:key=>key==='#transaction-form'?(nodes.get(key)||null):node(key),addEventListener:(name,handler)=>{handlers[name]=handler;}},
      fetch:async (...args)=>{requests.push({url:args[0],method:args[1]?.method||'GET'});return fetch(...args);},
      FormData:class{constructor(form){this.values=form.fields;}entries(){return Object.entries(this.values)[Symbol.iterator]();}[Symbol.iterator](){return this.entries();}get(key){return this.values[key];}},
    });
    const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
    assert.ok(!source.includes('setInterval('));
    vm.runInContext(fs.readFileSync(path.join(root,'analytics.js'),'utf8'),context);
    vm.runInContext(source,context);
    await context.window.CLEARBOOK_READY;
    const run=code=>vm.runInContext(code,context);
    assert.equal(run('connected'),true,run('loadError'));
    assert.ok(run('db.transactions.length')<=5,'Startup must only load the visible overview page.');
    assert.equal(requests.filter(r=>r.url.includes('/transactions?')).length,1);
    assert.ok(!requests.some(r=>/\/(categories|locations)$/.test(r.url)),'Form/filter references are lazy.');
    const initialQuery=new URL(requests.find(r=>r.url.includes('/transactions?')).url).searchParams;
    assert.equal(initialQuery.get('limit'),'5');
    assert.equal(initialQuery.get('from'),run('overviewMonth')+'-01');
    const call=async(path,body,method='POST')=>{
      const response=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,headers:{'Content-Type':'application/json','Idempotency-Key':require('node:crypto').randomUUID()},body:JSON.stringify(body)});
      const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;
    };
    // A ledger larger than both a UI page and the 200-row API maximum.
    for(let i=0;i<205;i++)await call('/transactions',{
      date:`2026-11-${String(i%28+1).padStart(2,'0')}`,type:'EXPENSE',payer:'business',
      amount:10,category:i%2?'Labour Tips':'LABOUR PAYMENTS',payee_name:i%2?'Anil':'Raju',
      location:i%3?'Site A':'Site B',mode:'CASH',notes:'Pagination fixture',
    });
    await run("overviewMonth='2026-11';refreshData()");
    assert.equal(run('transactionRows.length'),5);
    const all=await (await fetch(`http://127.0.0.1:${port}/api/transactions?limit=200&page=1`)).json();
    assert.ok(all.total>200);
    assert.ok(run('summary.overview.totals.expenses')>run('sum(transactionRows.filter(t=>t.type===\'EXPENSE\'))'),'Overview totals include off-page transactions.');
    const expectedTotal=run('summary.overview.totals.expenses');
    await run("location.hash='#transactions';route();pendingLoad");
    assert.equal(run('transactionRows.length'),10);
    assert.equal(run('transactionTotal'),all.total);
    const firstIds=Array.from(run('transactionRows.map(t=>t.id)'));
    const click=dataset=>handlers.click({target:{closest:()=>({dataset})}});
    await click({pagination:'2'});
    assert.equal(run('pageNumber'),2);
    assert.equal(run('transactionRows.length'),10);
    assert.ok(Array.from(run('transactionRows.map(t=>t.id)')).every(id=>!firstIds.includes(id)));
    const beforeBack=requests.length;
    await click({pagination:'1'});
    assert.equal(requests.length,beforeBack,'Visited pages reuse cached data.');
    await click({action:'filters'});
    assert.ok(requests.some(r=>r.url.endsWith('/categories')));
    assert.ok(requests.some(r=>r.url.endsWith('/locations')));
    const selectFilter=(key,value,checked=true)=>handlers.change({target:{id:'test-filter',type:'checkbox',dataset:{filter:key},value,checked}});
    await selectFilter('category','LABOUR PAYMENTS');
    assert.equal(run('pageNumber'),1);
    const oneCategory=run('transactionTotal');
    assert.ok(run("transactionRows.every(t=>t.category==='LABOUR PAYMENTS')"));
    await selectFilter('category','Labour Tips');
    assert.ok(run('transactionTotal')>oneCategory,'Selections within a filter use OR.');
    await selectFilter('location','Site A');
    assert.equal(run('transactionTotal'),136);
    assert.ok(run("transactionRows.every(t=>t.location==='Site A')"),'Different filters use AND.');
    await selectFilter('vendor','name:raju');
    assert.equal(run('transactionTotal'),68);
    assert.ok(run("transactionRows.every(t=>t.payee_name==='Raju')"));
    const beforeExport=requests.length;
    await run('exportCSV()');
    const filteredCSV=await exportBlobs.pop().text();
    assert.ok(filteredCSV.includes('"680.00"'));
    assert.ok(!filteredCSV.includes('Anil'));
    assert.ok(requests.length>beforeExport,'Export retrieves all matching rows on demand.');
    await click({action:'clear-filters'});
    await click({tab:'pending'});
    assert.ok(run("transactionRows.every(t=>['pending','partial'].includes(t.status[0]))"));
    await click({tab:'internal'});
    assert.ok(run("transactionRows.every(t=>t.type==='EXPENSE'&&account(t.payer).type==='INTERNAL')"));
    await click({tab:'all'});
    await run("search='Anil';reloadTransactions()");
    assert.equal(run('transactionTotal'),102);
    assert.ok(run("transactionRows.every(t=>t.payee_name==='Anil')"));
    await run("search='';reloadTransactions()");
    // A later filter/navigation must beat an older network response.
    let release;
    const realFetch=context.fetch;
    context.fetch=async(...args)=>{
      if(String(args[0]).includes('q=Raju'))await new Promise(resolve=>{release=resolve;});
      return realFetch(...args);
    };
    const old=run("search='Raju';reloadTransactions()");
    while(!release)await new Promise(resolve=>setTimeout(resolve,1));
    await run("search='Anil';reloadTransactions()");
    release();await old;
    assert.ok(run("transactionRows.every(t=>t.payee_name==='Anil')"),'Stale requests must not replace newer results.');
    context.fetch=realFetch;
    await click({action:'clear-filters'});
    const beforeDirectory=requests.length;
    await run("location.hash='#accounts';route();pendingLoad");
    assert.equal(requests.length,beforeDirectory);
    assert.equal(run('db.transactions.length'),0,'Directory totals do not need raw transactions.');
    assert.ok(run("summary.directory.accounts.business.count")>=205);
    assert.ok(node('#main').innerHTML.includes(String(run('summary.directory.accounts.business.count'))+' debit payments'));
    await run("location.hash='#transactions';route();pendingLoad");
    await run('exportCSV()');
    const completeCSV=await exportBlobs.pop().text();
    assert.equal(completeCSV.split('\r\n').filter(line=>line.startsWith('"2026-')).length,all.total,'Export includes every matching page.');
    assert.ok(requests.some(r=>r.url.includes('limit=200')&&r.url.includes('page=2')));
    const button={disabled:false};
    const form=(id,fields,dataset={})=>({id,fields,dataset,querySelector:()=>button});
    async function submit(value){
      await handlers.submit({target:value,preventDefault(){}});
      assert.match(node('#toast').textContent,/saved\.|updated\.|added\.|reversed\./,node('#toast').textContent+' '+run('loadError'));
    }
    await click({action:'add'});
    assert.ok(node('#transaction-dialog').innerHTML.includes('name="location"'));
    assert.ok(run("labourPayeeNames().includes('Anil')&&labourPayeeNames().includes('Raju')"),'Payee suggestions include names outside the current page.');
    assert.equal(run("amountInWords('12345678.90')"),'One crore twenty three lakh forty five thousand six hundred seventy eight rupees and ninety paise only');
    // Restrict the list so the new record stays visible after each edit.
    await run("filters={location:['Integration site']};reloadTransactions()");
    run("openForm();draft.category='LABOUR PAYMENTS'");
    const expenseForm=form('transaction-form',{date:'2026-11-04',amount:'123.45',payer:'business',payee_name:'Integration worker',category:'LABOUR PAYMENTS',mode:'UPI',location:'Integration site',notes:'Integration expense'});
    nodes.set('#transaction-form',expenseForm);
    const beforeSave=requests.length;
    await submit(expenseForm);
    assert.ok(!requests.slice(beforeSave).some(r=>/\/(accounts|vendors|clients|categories|locations)$/.test(r.url)&&r.method==='GET'),'Transaction saves preserve reference caches.');
    const expense=run("db.transactions.find(t=>t.notes==='Integration expense')");
    assert.ok(expense,'Created transaction must appear in its server-filtered page.');
    run(`openDetail('${expense.id}')`);
    assert.ok(node('#detail-dialog').innerHTML.includes('Integration expense'));
    run(`openForm('EXPENSE',null,db.transactions.find(t=>t.id==='${expense.id}'))`);
    expenseForm.fields.amount='150.25';expenseForm.fields.notes='Delivery <b>checked</b>';
    await submit(expenseForm);
    assert.equal(run('db.transactions[0].amount'),150.25);
    assert.equal(run('db.transactions[0].version'),2);
    run(`openDetail('${expense.id}')`);
    assert.ok(node('#detail-dialog').innerHTML.includes('Delivery &lt;b&gt;checked&lt;/b&gt;'));
    await submit(form('reversal-form',{reason:'Integration cleanup'},{id:expense.id}));
    assert.equal(run('transactionTotal'),0);
    assert.equal(run('summary.overview.totals.expenses'),expectedTotal);
    nodes.delete('#transaction-form');
    // Removing the sole item on the last page clamps to a valid page.
    for(const amount of [11,12,13,14,15,16])await call('/transactions',{date:'2026-11-05',amount,type:'EXPENSE',payer:'business',category:'Fuel',location:'Last page site',mode:'UPI'});
    await run("page='overview';overviewMonth='2026-11';filters={location:['Last page site']};pageNumber=1;refreshData()");
    assert.equal(run('transactionTotal'),6);
    await click({pagination:'2'});
    assert.equal(run('transactionRows.length'),1);
    const lastId=run('transactionRows[0].id');
    await submit(form('reversal-form',{reason:'Remove last page'},{id:lastId}));
    assert.equal(run('pageNumber'),1);
    assert.equal(run('transactionRows.length'),5);
    // Reference creation inside a dialog also works on a screen that doesn't use it.
    await run("location.hash='#accounts';route();pendingLoad");
    await click({action:'add'});
    await submit(form('directory-form',{name:'Dialog supplier',category:'Power Tools',description:'Tools',role_SUPPLIER:'on'},{kind:'vendor',id:''}));
    assert.ok(run("db.vendors.some(v=>v.name==='Dialog supplier')"));
    await submit(form('client-form',{name:'Dialog client',contact:'',phone:'',email:''}));
    const clientId=run("db.clients.find(c=>c.name==='Dialog client').id");
    await submit(form('client-form',{name:'Updated dialog client',contact:'',phone:'',email:''},{id:clientId}));
    assert.equal(run(`client('${clientId}').name`),'Updated dialog client');
    // Analytics fetches its complete dataset only when that screen is opened.
    const preAnalytics=requests.length;
    await run("location.hash='#analytics';route();pendingLoad");
    assert.ok(run('analyticsRows.length')>200);
    assert.ok(requests.slice(preAnalytics).some(r=>r.url.includes('/transactions?')));
    assert.ok(node('#main').innerHTML.includes('Transaction explorer'));
    const analyticsCount=requests.length;
    await handlers.change({target:{dataset:{anSetting:'type'},value:'EXPENSE'}});
    await click({anAction:'reset'});
    assert.equal(requests.length,analyticsCount,'Analytics filters reuse their on-demand report dataset.');
    const preRefresh=requests.length;
    await click({action:'refresh'});
    assert.ok(requests.length>preRefresh);
    assert.equal(run('loadError'),'');
    console.log('PASS: bounded startup, server pagination and multi-filters, complete summaries/exports, lazy references/analytics, stale-response protection, create/edit/reverse and cache invalidation.');
  } finally {
    const exited=[server,frontend].map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve)));
    server.kill();frontend.kill();
    await Promise.all(exited);
    // Leave the OS-managed temporary directory for normal system cleanup.
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
