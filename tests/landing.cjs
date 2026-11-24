const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'.local','landing-preview');
 fs.mkdirSync(out,{recursive:true});
 const server=spawn(process.execPath,['scripts/dev-server.cjs'],{cwd:root,env:{...process.env,PORT:'5178'},stdio:['ignore','pipe','pipe']});
 let browser,serverError='';server.stderr.on('data',d=>{serverError+=d;});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(serverError||'Preview did not start')),20000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('error',reject);server.once('exit',()=>{clearTimeout(timer);reject(new Error(serverError));});});
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
  let apiRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests++;});
  await page.goto('http://127.0.0.1:5178/?landing=1',{waitUntil:'networkidle'});
  await page.waitForSelector('#lp-scene canvas');
  assert.equal(apiRequests,0,'Landing page must not fetch customer data.');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.evaluate(()=>window.scrollTo(0,350));
  await page.waitForFunction(()=>parseFloat(document.querySelector('#clearbook-landing').style.getPropertyValue('--lp-hero-scroll'))>.15);
  const firstObject=page.locator('.lp-workflow-grid .lp-object').first();
  await firstObject.scrollIntoViewIfNeeded();
  const beforeTurn=await firstObject.evaluate(el=>el.closest('article').style.getPropertyValue('--lp-object-turn'));
  await page.evaluate(()=>window.scrollBy(0,120));
  await page.waitForFunction(previous=>document.querySelector('.lp-workflow-grid article').style.getPropertyValue('--lp-object-turn')!==previous,beforeTurn);
  assert.notEqual(await firstObject.evaluate(el=>getComputedStyle(el).transform),'none');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'3D scroll effects must fit mobile screens.');
  await page.setViewportSize({width:1440,height:1050});
  await page.getByRole('tab',{name:'People',exact:true}).click();
  assert.match(await page.locator('#lp-preview h3').textContent(),/people behind/);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Perspective',exact:true}).getAttribute('aria-selected'),'true');
  assert.match(await page.locator('#lp-preview h3').textContent(),/picture behind/);
  await page.getByRole('button',{name:'Get access',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#lp-access').getBoundingClientRect().top<innerHeight-100);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('#clearbook-landing').classList.contains('lp-scroll-ready'));
  for(const width of [360,390,768,1920]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await page.route('**/oauth2/authorize?**',route=>route.abort());
  const requestPromise=page.waitForRequest(r=>r.url().includes('/oauth2/authorize?'));
  await page.getByRole('button',{name:'Step into Clearbook',exact:false}).click();
  const url=new URL((await requestPromise).url());
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:5178/');
  assert.ok(url.searchParams.get('state'));
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL, scroll-driven depth, mobile layout, product tabs, keyboard navigation, reduced motion, no customer API requests and Cognito PKCE handoff.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
