const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const config={enabled:true,domain:'https://test.auth.ap-south-2.amazoncognito.com',clientId:'client',issuer:'https://cognito-idp.ap-south-2.amazonaws.com/pool'};
function jwt(changes={}){
 const claims={sub:'user',token_use:'access',client_id:'client',iss:config.issuer,scope:'openid clearbook/ledger',exp:Math.floor(Date.now()/1000)+900,username:'sreekar','cognito:groups':['SUPER_ADMIN'],...changes};
 return 'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
}
function setup({search='',session,flow,fetch}={}){
 const values=new Map();if(session)values.set('clearbook-auth-session-v1',JSON.stringify(session));if(flow)values.set('clearbook-auth-flow-v1',JSON.stringify(flow));
 const calls=[],redirects=[],history=[];
 const location={origin:'https://app.example.com',pathname:'/',hash:'#transactions',search,assign:url=>redirects.push(url)};
 const context=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,Date,AbortSignal,Event,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),location,
  sessionStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
  history:{replaceState:(...args)=>history.push(args)},
  fetch:async(url,options)=>{calls.push({url,options});if(fetch)return fetch(url,options);return{ok:true,json:async()=>({access_token:jwt(),refresh_token:'refresh'})};},
  window:{CLEARBOOK_CONFIG:{auth:config},dispatchEvent(){}},
 });
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../auth.js'),'utf8'),context);
 return{auth:context.window.ClearbookAuth,values,calls,redirects,history};
}
(async()=>{
 const login=setup();await login.auth.login();const url=new URL(login.redirects[0]);
 assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.ok(url.searchParams.get('scope').includes('clearbook/ledger'));
 const flow=JSON.parse(login.values.get('clearbook-auth-flow-v1'));
 const challenge=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier))).toString('base64url');
 assert.equal(url.searchParams.get('code_challenge'),challenge);
 assert.equal(url.searchParams.get('redirect_uri'),'https://app.example.com/');
 assert.equal(login.calls.length,0);
 const callback=setup({search:'?code=abc&state='+flow.state,flow});await callback.auth.init();
 assert.ok(callback.auth.isSignedIn());assert.equal(callback.auth.user().role,'Super admin');
 assert.equal(new URLSearchParams(callback.calls[0].options.body).get('code_verifier'),flow.verifier);
 assert.equal(callback.values.has('clearbook-auth-flow-v1'),false);assert.ok(callback.history.length);
 const mismatch=setup({search:'?code=abc&state=wrong',flow});await assert.rejects(mismatch.auth.init(),/verification/);assert.equal(mismatch.calls.length,0);
 const expired=setup({search:'?code=abc&state='+flow.state,flow:{...flow,created:Date.now()-700000}});await assert.rejects(expired.auth.init(),/timed out/);
 const denied=setup({search:'?error=access_denied&state='+flow.state,flow});await assert.rejects(denied.auth.init(),/cancelled/);
 const wrongToken=setup({search:'?code=abc&state='+flow.state,flow,fetch:async()=>({ok:true,json:async()=>({access_token:jwt({token_use:'id'})})})});await assert.rejects(wrongToken.auth.init(),/invalid/);
 const restored=setup({session:{access_token:jwt(),refresh_token:'refresh'}});await restored.auth.init();await restored.auth.getAccessToken();assert.equal(restored.calls.length,0);
 const renewal=setup({session:{access_token:jwt({exp:Math.floor(Date.now()/1000)-1}),refresh_token:'refresh'}});await renewal.auth.init();assert.ok(renewal.auth.isSignedIn());assert.equal(renewal.calls.length,1);
 assert.equal(new URLSearchParams(renewal.calls[0].options.body).get('grant_type'),'refresh_token');
 const rejected=setup({session:{access_token:jwt({exp:0}),refresh_token:'refresh'},fetch:async()=>({ok:false,json:async()=>({error:'invalid_grant'})})});await rejected.auth.init();assert.equal(rejected.auth.isSignedIn(),false);
 await restored.auth.logout();assert.equal(restored.auth.isSignedIn(),false);assert.equal(restored.values.has('clearbook-auth-session-v1'),false);assert.ok(restored.calls[0].url.endsWith('/oauth2/revoke'));assert.equal(new URL(restored.redirects[0]).pathname,'/logout');
 console.log('PASS: S256 PKCE, callback state/expiry, cancellation, token type, session restore, on-demand renewal, failed renewal, revocation and logout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
