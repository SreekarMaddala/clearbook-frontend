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
  const frontendReady=new Promise((resolve,reject)=>{frontend.stdout.once('data',resolve);frontend.once('error',reject);});
  server.stderr.on('data', chunk => {serverError += chunk;});
  try {
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Test server did not start: '+serverError)),10000);
      server.stdout.on('data', chunk => {if(chunk.toString().includes('Clearbook API:')){clearTimeout(timer);resolve();}});
      server.on('exit', code=>{clearTimeout(timer);reject(new Error(`Test server exited ${code}: ${serverError}`));});
    });
    await frontendReady;
    for (const file of ['/', '/app.js', '/config.js', '/styles.css']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${file}`)).status,200);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/backend/seed.json`)).status,404);
    const nodes=new Map(), handlers={}, requests=[];
    const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(key);};
    const context=vm.createContext({
      Intl,Date,console,structuredClone,crypto:require('node:crypto').webcrypto,AbortSignal,Blob,URL,setTimeout,clearTimeout,
      location:{hash:''}, window:{CLEARBOOK_CONFIG:{apiBase:`http://127.0.0.1:${port}/api`},addEventListener(){}},
      document:{querySelector:key=>key==='#transaction-form'?(nodes.get(key)||null):node(key),addEventListener:(name,handler)=>{handlers[name]=handler;}},
      fetch:async (...args)=>{requests.push({url:args[0],method:args[1]?.method||'GET'});return fetch(...args);},
      FormData:class{constructor(form){this.values=form.fields;}entries(){return Object.entries(this.values)[Symbol.iterator]();}[Symbol.iterator](){return this.entries();}get(key){return this.values[key];}},
    });
    const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
    assert.ok(!source.includes('setInterval('));
    vm.runInContext(source,context);
    await context.window.CLEARBOOK_READY;
    const run=code=>vm.runInContext(code,context);
    assert.equal(run('connected'),true);
    assert.equal(run('db.transactions.length'),28);
    assert.equal(run('summary.totals.outstanding'),83800);
    assert.ok(node('#main').innerHTML.includes('data-action="refresh"'));
    const count=requests.length;
    for(const page of ['overview','transactions','creditors','vendors','accounts','clients']){run(`page='${page}';render()`);assert.ok(node('#main').innerHTML.length>1000);}
    assert.equal(requests.length,count,'Rendering/navigation must not poll the API.');
    async function submit(form) {await handlers.submit({target:form,preventDefault(){}});}
    const button={disabled:false};
    const form=(id,fields,dataset={})=>({id,fields,dataset,querySelector(){return button;}});
    await submit(form('directory-form',{name:'Integration supplier',category:'Power Tools',description:'Tools'}, {kind:'vendor',id:''}));
    const vendor=run('db.vendors.find(v=>v.name==="Integration supplier")');
    assert.ok(vendor,'Vendor creation must reach API and refresh directory.');
    run('openForm()');
    assert.ok(node('#transaction-dialog').innerHTML.includes('name="location"'));
    assert.ok(node('#transaction-dialog').innerHTML.includes('Vendor (optional)'));
    assert.ok(!node('#transaction-dialog').innerHTML.includes('Paid to'));
    const modeSelect=node('#transaction-dialog').innerHTML.match(/<select name="mode" required>(.*?)<\/select>/)[1];
    const paymentModes=[...modeSelect.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)];
    assert.deepEqual(paymentModes.map(match=>match[1]),['UPI','NEFT','RTGS','IMPS','CASH','CHEQUE']);
    assert.equal(paymentModes.find(match=>match[2]==='Cash')[1],'CASH');
    assert.equal(paymentModes.find(match=>match[2]==='Cheque')[1],'CHEQUE');
    assert.ok(node('#transaction-dialog').innerHTML.includes('data-action="new-category"'));
    run('draft.amount="123.45";openCategoryForm()');
    assert.ok(node('#detail-dialog').innerHTML.includes('id="category-form"'));
    await submit(form('category-form',{name:'Custom supplies'}));
    assert.equal(run('draft.category'),'Custom supplies');
    assert.equal(run('draft.amount'),'123.45','Adding a category must preserve the transaction draft.');
    assert.ok(node('#transaction-dialog').innerHTML.includes('<option selected>Custom supplies</option>'));
    await run('refreshData()');
    assert.ok(run('categories.includes("Custom supplies")'),'Custom categories must persist after refresh.');
    assert.ok(node('#transaction-dialog').innerHTML.includes('<select name="location" required>'));
    assert.ok(node('#transaction-dialog').innerHTML.includes('data-action="new-location"'));
    assert.ok(run('locations.length>0'),'Historical transaction locations must be available.');
    run('openLocationForm()');
    assert.ok(node('#detail-dialog').innerHTML.includes('id="location-form"'));
    await submit(form('location-form',{name:'Integration site'}));
    assert.equal(run('draft.location'),'Integration site');
    assert.equal(run('draft.amount'),'123.45','Adding a location must preserve the draft.');
    assert.ok(node('#transaction-dialog').innerHTML.includes('<option value="Integration site" selected>'));
    await run('refreshData()');
    assert.ok(run('locations.includes("Integration site")'),'Locations must persist before recording a transaction.');
    const expenseForm=form('transaction-form',{date:'2026-11-04',amount:'123.45',payer:'business',vendor:vendor.id,category:'Power Tools',mode:'UPI',location:'Integration site',notes:'Integration expense'});
    nodes.set('#transaction-form',expenseForm);
    const before=run('summary.totals.expenses');
    await submit(expenseForm);
    const expense=run('db.transactions.find(t=>t.notes==="Integration expense")');
    assert.ok(expense,'Transaction form must persist to API.');
    assert.equal(expense.location,'Integration site');
    assert.equal(expense.vendor,vendor.id);
    expenseForm.fields.category='Custom supplies';
    assert.equal(run('summary.totals.expenses'),before+123.45);
    run(`openForm('EXPENSE',null,db.transactions.find(t=>t.id==='${expense.id}'))`);
    expenseForm.fields.amount='150.25';expenseForm.fields.location='Updated site';
    await submit(expenseForm);
    assert.equal(run(`db.transactions.find(t=>t.id==='${expense.id}').location`),'Updated site');
    assert.equal(run(`db.transactions.find(t=>t.id==='${expense.id}').version`),2);
    assert.equal(run(`db.transactions.find(t=>t.id==='${expense.id}').category`),'Custom supplies');
    for(const [,mode] of paymentModes){
      run(`openForm('EXPENSE',null,db.transactions.find(t=>t.id==='${expense.id}'))`);
      expenseForm.fields.mode=mode;
      await submit(expenseForm);
      assert.equal(run(`db.transactions.find(t=>t.id==='${expense.id}').mode`),mode,`${mode} must save through the real API.`);
      run(`openForm('EXPENSE',null,db.transactions.find(t=>t.id==='${expense.id}'))`);
      assert.ok(node('#transaction-dialog').innerHTML.includes(`<option value="${mode}" selected>`),`${mode} must remain selected when editing.`);
    }
    await submit(form('reversal-form',{reason:'Integration cleanup'},{id:expense.id}));
    assert.ok(!run(`db.transactions.some(t=>t.id==='${expense.id}')`));
    assert.equal(run('summary.totals.expenses'),before);
    const refreshButton={dataset:{action:'refresh'}};
    const preRefresh=requests.length;
    await handlers.click({target:{closest(){return refreshButton;}}});
    assert.equal(requests.length-preRefresh,7,'Refresh should issue one data-fetch batch including clients and locations.');
    assert.ok(requests.some(r=>r.method==='PATCH'));
    nodes.delete('#transaction-form');
    run("openForm('CREDIT')");
    assert.ok(node('#transaction-dialog').innerHTML.includes('Received into'));
    assert.ok(node('#transaction-dialog').innerHTML.includes('data-action="new-client"'));
    assert.ok(!node('#transaction-dialog').innerHTML.includes('data-form-type="TRANSFER"'));
    assert.ok(!node('#transaction-dialog').innerHTML.includes('name="payer"'));
    assert.ok(!node('#transaction-dialog').innerHTML.includes('name="notes"'));
    run('draft.amount="500";openClientForm()');
    await submit(form('client-form',{name:'Client <ABC>',contact:'Ravi',phone:'12345',email:'ravi@example.com'}));
    const client=run('db.clients.find(c=>c.name==="Client <ABC>")');
    assert.ok(client,'Client creation must persist to API.');
    assert.equal(run('draft.client_id'),client.id);
    assert.equal(run('draft.amount'),'500');
    assert.ok(node('#transaction-dialog').innerHTML.includes('Client &lt;ABC&gt;'));
    const creditForm=form('transaction-form',{date:'2026-11-04',amount:'500',client_id:client.id,recipient:'business',mode:'UPI',location:'Client site'});
    nodes.set('#transaction-form',creditForm);
    const expensesBefore=run('summary.totals.expenses'),owedBefore=run('summary.totals.outstanding');
    await submit(creditForm);
    const credit=run('db.transactions.find(t=>t.type==="CREDIT")');
    assert.ok(credit,'Credit form must persist to API.');
    assert.equal(credit.client_id,client.id);assert.equal(credit.payer,null);
    assert.equal(credit.recipient,'business');assert.equal(credit.status[1],'Received');
    assert.equal(run('summary.totals.credits'),500);
    assert.equal(run('summary.totals.expenses'),expensesBefore);
    assert.equal(run('summary.totals.outstanding'),owedBefore);
    run("page='clients';render()");
    assert.ok(node('#main').innerHTML.includes('Client &lt;ABC&gt;'));
    assert.ok(node('#main').innerHTML.includes('1 payment received'));
    await submit(form('client-form',{name:'Client ABC updated',contact:'Ravi',phone:'54321',email:'ravi@example.com'},{id:client.id}));
    assert.equal(run(`client('${client.id}').name`),'Client ABC updated');
    run(`filters={client:'${client.id}'};tab='credits';page='transactions';render()`);
    assert.equal(run('filteredTransactions().length'),1);
    assert.ok(node('#main').innerHTML.includes('Client ABC updated'));
    let csvBlob;
    context.URL={createObjectURL(blob){csvBlob=blob;return 'blob:integration';},revokeObjectURL(){}};
    context.document.createElement=()=>({click(){}});
    run('exportCSV()');
    const csv=await csvBlob.text();
    assert.ok(csv.includes('"Client","From account","To account"'));
    assert.ok(csv.includes('Client ABC updated'));
    assert.ok(csv.includes('"CREDIT"'));
    assert.ok(!csv.includes('Notes'));
    run(`openDetail('${credit.id}')`);
    assert.ok(node('#detail-dialog').innerHTML.includes('Received into'));
    assert.ok(!node('#detail-dialog').innerHTML.includes('Notes'));
    run(`openForm('CREDIT',null,db.transactions.find(t=>t.id==='${credit.id}'))`);
    creditForm.fields.amount='750';
    await submit(creditForm);
    assert.equal(run('summary.totals.credits'),750);
    assert.equal(run(`summary.accounts.find(a=>a.id==='business').credits`),750);
    await submit(form('reversal-form',{reason:'Credit test cleanup'},{id:credit.id}));
    assert.equal(run('summary.totals.credits'),0);
    assert.equal(run('summary.totals.expenses'),expensesBefore);
    assert.equal(run('summary.totals.outstanding'),owedBefore);
    console.log('PASS: real HTTP startup, six views, clients, incoming credit create/edit/reverse, vendor creation, expense create/edit/reverse, required location, manual refresh, and no render-triggered requests.');
  } finally {
    const exited=[server,frontend].map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve)));
    server.kill();frontend.kill();
    await Promise.all(exited);
    // Leave the OS-managed temporary directory for normal system cleanup.
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
