// Execute the actual app with hosted identities and inspect every requested API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(role = 'provider') {
  const nodes = new Map(), handlers = {}, requests = [];
  const customers = [{id:'customer-a', name:'Customer <A>', enabled:true}];
  const users = [{id:'user-a', email:'user@example.com', customer_id:'customer-a', enabled:true}];
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      innerHTML:'', textContent:'', open:false,
      classList:{add(){},remove(){},toggle(){}}, setAttribute(){},
      showModal(){this.open=true;}, close(){this.open=false;},
    });
    return nodes.get(key);
  };
  const auth = {enabled:true, init:async()=>{}, isSignedIn:()=>true};
  const context = vm.createContext({
    Intl, Date, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
    location:{hash:''}, window:{ClearbookAuth:auth, CLEARBOOK_CONFIG:{apiBase:'/api'}, addEventListener(){}},
    document:{body:{classList:{toggle(){},add(){},remove(){}}},querySelector:node,addEventListener:(name,fn)=>{handlers[name]=fn;}},
    FormData:class {constructor(form){this.fields=form.fields;}[Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]();}},
    fetch:async(url,options)=>{
      const endpoint = url.slice(4); requests.push({endpoint, method:options.method});
      const body = options.body ? JSON.parse(options.body) : {};
      let data;
      if(endpoint==='/session') {
        if(role==='unassigned')return {status:403,ok:false,json:async()=>({error:'No customer access.'})};
        data={role,name:role==='provider'?'Software provider':'user@example.com',workspace:role==='customer'?{id:'customer-a',name:'Organization A'}:null};
      }else if(endpoint==='/provider/customers') {
        if(options.method==='POST')customers.push({id:'customer-b',name:body.name,enabled:true});
        data={items:[...customers]};
      }else if(endpoint==='/provider/users'){
        if(options.method==='POST')users.push({id:'user-b',email:body.email,customer_id:body.customer_id,enabled:true});
        data={items:[...users]};
      }
      else if(endpoint==='/provider/users/user-a'){
        if(options.method==='DELETE'){users.splice(users.findIndex(u=>u.id==='user-a'),1);data={deleted:true};}
        else{users[0].enabled=body.enabled;data=users[0];}
      }
      else if(endpoint==='/provider/customers/customer-a'&&options.method==='DELETE'){
        customers.splice(customers.findIndex(c=>c.id==='customer-a'),1);data={deleted:true};
      }
      else if(role==='customer'&&endpoint==='/dashboard')data={totals:{expenses:0,fronted:0,settled:0,outstanding:0},creditors:[]};
      else if(role==='customer'&&endpoint==='/categories')data={items:[{name:'Fuel'}]};
      else if(role==='customer')data={items:[],total:0};
      else throw new Error('Provider must never request ledger endpoint: '+endpoint);
      return {status:200,ok:true,json:async()=>data};
    },
  });
  for(const file of ['provider.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  return {context,nodes,node,handlers,requests,users,run:code=>vm.runInContext(code,context)};
}

(async()=>{
  const provider=setup();await provider.context.window.CLEARBOOK_READY;
  assert.deepEqual(provider.requests.map(request=>request.endpoint),['/session','/provider/customers','/provider/users']);
  assert.ok(provider.node('#main').innerHTML.includes('Organizations'));
  assert.ok(provider.node('#main').innerHTML.includes('Customer &lt;A&gt;'));
  assert.ok(!provider.node('#navigation').innerHTML.includes('Transactions'));
  assert.ok(provider.node('.profile').innerHTML.includes('Software provider'));
  for(const page of ['overview','transactions','creditors','accounts','vendors']){
    provider.run(`page='${page}';render()`);
    assert.ok(!provider.node('#main').innerHTML.includes('Add transaction'));
    assert.ok(!provider.node('#main').innerHTML.includes('Total expenses'));
  }
  await provider.handlers.click({target:{closest:()=>({dataset:{action:'new-customer'}})}});
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('customer-form'));
  let cleared=false;
  const form={id:'customer-form',fields:{name:'Organization B'},querySelector:()=>({disabled:false}),reset(){cleared=true;}};
  await provider.handlers.submit({target:form,preventDefault(){}});
  assert.ok(cleared);
  assert.ok(provider.node('#main').innerHTML.includes('Organization B'));
  provider.run("page='users';render()");
  assert.ok(provider.node('#main').innerHTML.includes('user@example.com'));
  await provider.handlers.click({target:{closest:()=>({dataset:{action:'new-customer-user'}})}});
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('name="temporary_password"'));
  const userForm={id:'customer-user-form',fields:{email:'second@example.com',customer_id:'customer-a',temporary_password:'Test-Only-Password-123'},querySelector:()=>({disabled:false}),reset(){}};
  await provider.handlers.submit({target:userForm,preventDefault(){}});
  assert.ok(provider.users.some(user=>user.email==='second@example.com'));
  assert.ok(!provider.node('#main').innerHTML.includes(userForm.fields.temporary_password));
  await provider.handlers.click({target:{closest:()=>({dataset:{providerKind:'users',providerId:'user-a',providerEnabled:'false'}})}});
  assert.equal(provider.users[0].enabled,false);
  assert.ok(provider.requests.every(request=>request.endpoint==='/session'||request.endpoint.startsWith('/provider/')));
  await provider.handlers.click({target:{closest:()=>({dataset:{providerDeleteKind:'users',providerId:'user-a'}})}});
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('provider-delete-form'));
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('user@example.com'));
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('Financial history will be retained'));
  await provider.handlers.submit({target:{id:'provider-delete-form',dataset:{kind:'users',id:'user-a'},querySelector:()=>({disabled:false})},preventDefault(){}});
  assert.ok(!provider.users.some(u=>u.id==='user-a'));
  await provider.handlers.click({target:{closest:()=>({dataset:{providerDeleteKind:'customers',providerId:'customer-a'}})}});
  assert.ok(provider.node('#detail-dialog').innerHTML.includes('Customer &lt;A&gt;'));
  await provider.handlers.submit({target:{id:'provider-delete-form',dataset:{kind:'customers',id:'customer-a'},querySelector:()=>({disabled:false})},preventDefault(){}});
  assert.ok(provider.requests.some(r=>r.method==='DELETE'&&r.endpoint==='/provider/customers/customer-a'));

  const customer=setup('customer');await customer.context.window.CLEARBOOK_READY;
  assert.ok(customer.node('#main').innerHTML.includes('Total expenses'));
  assert.ok(customer.node('.workspace').innerHTML.includes('Organization A'));
  assert.ok(customer.requests.every(request=>!request.endpoint.startsWith('/provider/')));

  const unassigned=setup('unassigned');await unassigned.context.window.CLEARBOOK_READY;
  assert.equal(unassigned.requests.length,1);
  assert.ok(unassigned.node('#main').innerHTML.includes('No customer access.'));
  assert.ok(!unassigned.node('#main').innerHTML.includes('Total expenses'));
  console.log('PASS: provider routing, escaped customer names, organization onboarding, user access controls, isolated organization ledgers, and fail-closed unassigned accounts.');
})().catch(error=>{console.error(error);process.exitCode=1;});
