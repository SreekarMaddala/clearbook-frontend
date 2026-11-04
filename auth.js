'use strict';
// OAuth authorization code + S256 PKCE. API Gateway is the token verifier.
window.ClearbookAuth = (() => {
  const settings=window.CLEARBOOK_CONFIG;
  const config=settings.auth;
  const enabled=config.enabled;
  const sessionKey='clearbook-auth-session-v1', flowKey='clearbook-auth-flow-v1';
  let session=null, refreshing=null;
  const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
  function claims(token){
    const part=token.split('.')[1];
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4)),c=>c.charCodeAt(0))));
  }
  function validate(data){
    if(!data?.access_token)throw new Error('Sign-in did not return an access token.');
    const token=claims(data.access_token);
    if(token.token_use!=='access'||token.client_id!==config.clientId||token.iss!==config.issuer||!token.sub||!token.scope?.split(' ').includes('clearbook/ledger')||token.exp*1000<=Date.now())throw new Error('The session is invalid or has expired. Please sign in again.');
    return token;
  }
  function clear(){session=null;sessionStorage.removeItem(sessionKey);sessionStorage.removeItem('clearbook-access-token');}
  function changed(){window.dispatchEvent(new Event('clearbook-auth-change'));}
  function save(data,previous){
    validate(data);
    session={access_token:data.access_token,refresh_token:data.refresh_token||previous?.refresh_token||null};
    sessionStorage.setItem(sessionKey,JSON.stringify(session));
  }
  async function tokenRequest(values){
    const response=await fetch(config.domain+'/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,...values}),signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok)throw new Error('Your session could not be completed. Please sign in again.');
    return data;
  }
  async function login(){
    const verifier=random(),state=random();
    const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const redirect=location.origin+'/';
    sessionStorage.setItem(flowKey,JSON.stringify({verifier,state,redirect,created:Date.now(),returnHash:location.hash}));
    const url=new URL(config.domain+'/oauth2/authorize');
    url.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:redirect,
      scope:'openid email profile clearbook/ledger',state,code_challenge:challenge,code_challenge_method:'S256'});
    location.assign(url.href);
  }
  async function init(){
    if(!enabled)return;
    const query=new URLSearchParams(location.search);
    if(query.has('code')||query.has('error')){
      const raw=sessionStorage.getItem(flowKey);sessionStorage.removeItem(flowKey);
      history.replaceState(null,'',location.pathname+location.hash);
      clear();
      const flow=raw?JSON.parse(raw):null;
      if(!flow||query.get('state')!==flow.state||Date.now()-flow.created>10*60*1000||flow.created>Date.now()||flow.redirect!==location.origin+'/')throw new Error('Sign-in verification failed or timed out. Please sign in again.');
      if(query.has('error'))throw new Error('Sign-in was cancelled or denied. Please try again.');
      save(await tokenRequest({grant_type:'authorization_code',code:query.get('code'),redirect_uri:flow.redirect,code_verifier:flow.verifier}));
      if(/^#[a-z]+$/.test(flow.returnHash))history.replaceState(null,'',location.pathname+flow.returnHash);
    }else{
      try{session=JSON.parse(sessionStorage.getItem(sessionKey));if(session)await getAccessToken();}
      catch{clear();}
    }
  }
  async function getAccessToken(){
    if(!enabled)return null;
    if(!session)throw new Error('Please sign in to access your workspace.');
    let token;
    try{token=claims(session.access_token);}catch{clear();changed();throw new Error('Please sign in again.');}
    if(token.exp*1000>Date.now()+60000){validate(session);return session.access_token;}
    if(!session.refresh_token){clear();changed();throw new Error('Your session expired. Please sign in again.');}
    if(!refreshing){
      const previous=session;
      refreshing=(async()=>{
        try{
          const next=await tokenRequest({grant_type:'refresh_token',refresh_token:previous.refresh_token});
          if(session!==previous)throw new Error('Session changed. Please sign in again.');
          save(next,previous);return session.access_token;
        }catch(error){clear();changed();throw error;}
        finally{refreshing=null;}
      })();
    }
    return refreshing;
  }
  async function logout(){
    const refresh=session?.refresh_token;
    clear();sessionStorage.removeItem(flowKey);changed();
    if(refresh){try{await fetch(config.domain+'/oauth2/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refresh,client_id:config.clientId}),signal:AbortSignal.timeout(5000)});}catch{/* Clear Cognito's browser session even if revocation is unreachable. */}}
    const url=new URL(config.domain+'/logout');url.search=new URLSearchParams({client_id:config.clientId,logout_uri:location.origin+'/'});location.assign(url.href);
  }
  function user(){if(!session)return null;try{const c=claims(session.access_token);return {name:c.username||'Workspace user',role:(c['cognito:groups']||[]).includes('SUPER_ADMIN')?'Super admin':'Workspace member'};}catch{return null;}}
  return {enabled,init,login,logout,getAccessToken,user,isSignedIn:()=>Boolean(session),expire(){clear();changed();}};
})();
