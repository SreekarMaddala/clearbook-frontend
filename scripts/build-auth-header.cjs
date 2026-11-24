const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
require('./build-scene.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=req.url==='/header'?'auth-branding/header.html':req.url==='/scene.js'?'assets/construction-scene.js':null;
  if(!file){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'text/javascript');res.end(fs.readFileSync(path.join(root,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:700,height:356},reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:'+server.address().port+'/header',{waitUntil:'networkidle'});
  await page.waitForSelector('canvas');
  const target=path.join(root,'auth-branding/header.jpg');
  await page.screenshot({path:target,type:'jpeg',quality:90});
  if(fs.statSync(target).size>100000)throw new Error('Header exceeds Cognito logo size limit.');
  console.log('Rendered 3D sign-in header:',fs.statSync(target).size,'bytes');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
