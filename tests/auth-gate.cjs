const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nodes=new Map(),handlers={};
const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',classList:{add(){},remove(){}},close(){},setAttribute(){}});return nodes.get(key);};
let apiRequests=0,signIns=0;
const auth={enabled:true,init:async()=>{},isSignedIn:()=>false,login:async()=>{signIns++;}};
const context=vm.createContext({Intl,Date,URL,URLSearchParams,setTimeout,clearTimeout,
 location:{hash:''},window:{ClearbookAuth:auth,CLEARBOOK_CONFIG:{apiBase:'https://api.example.com'},addEventListener(){}},
 document:{body:{classList:{toggle(){}}},querySelector:node,addEventListener:(key,handler)=>{handlers[key]=handler;}},
 fetch:async()=>{apiRequests++;throw new Error('Signed-out users must never call the API.');},
});
(async()=>{
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
 await context.window.CLEARBOOK_READY;
 assert.equal(apiRequests,0);
 assert.ok(node('#main').innerHTML.includes('data-action="sign-in"'));
 assert.ok(!node('#main').innerHTML.includes('Recent transactions'));
 await handlers.click({target:{closest:()=>({dataset:{action:'sign-in'}})}});
 assert.equal(signIns,1);
 console.log('PASS: hosted sign-in gate hides transactions, suppresses API requests, and routes the sign-in action.');
})().catch(error=>{console.error(error);process.exitCode=1;});
