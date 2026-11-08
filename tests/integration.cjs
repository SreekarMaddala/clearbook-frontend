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
    for(const page of ['overview','transactions','creditors','vendors','accounts']){run(`page='${page}';render()`);assert.ok(node('#main').innerHTML.length>1000);}
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
    assert.ok(node('#transaction-dialog').innerHTML.includes('data-action="new-category"'));
    run('draft.amount="123.45";openCategoryForm()');
    assert.ok(node('#detail-dialog').innerHTML.includes('id="category-form"'));
    await submit(form('category-form',{name:'Custom supplies'}));
    assert.equal(run('draft.category'),'Custom supplies');
    assert.equal(run('draft.amount'),'123.45','Adding a category must preserve the transaction draft.');
    assert.ok(node('#transaction-dialog').innerHTML.includes('<option selected>Custom supplies</option>'));
    await run('refreshData()');
    assert.ok(run('categories.includes("Custom supplies")'),'Custom categories must persist after refresh.');
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
    await submit(form('reversal-form',{reason:'Integration cleanup'},{id:expense.id}));
    assert.ok(!run(`db.transactions.some(t=>t.id==='${expense.id}')`));
    assert.equal(run('summary.totals.expenses'),before);
    const refreshButton={dataset:{action:'refresh'}};
    const preRefresh=requests.length;
    await handlers.click({target:{closest(){return refreshButton;}}});
    assert.equal(requests.length-preRefresh,5,'Refresh should issue one data-fetch batch.');
    assert.ok(requests.some(r=>r.method==='PATCH'));
    console.log('PASS: real HTTP startup, five views, vendor creation, expense create/edit/reverse, required location, manual refresh, and no render-triggered requests.');
  } finally {
    const exited=[server,frontend].map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve)));
    server.kill();frontend.kill();
    await Promise.all(exited);
    // Leave the OS-managed temporary directory for normal system cleanup.
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
