const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const filename of ['index.html','app.js','auth.js','provider.js','styles.css','config.js']){
  let data=fs.readFileSync(path.join(root,filename),'utf8');
  if(filename==='config.js' && process.env.CLEARBOOK_API_BASE){
    const api=new URL(process.env.CLEARBOOK_API_BASE);
    if(!['https:','http:'].includes(api.protocol))throw new Error('CLEARBOOK_API_BASE must be an HTTP(S) URL.');
    if(api.username||api.password||api.search||api.hash)throw new Error('The API base must not contain credentials, query parameters or a fragment.');
    data=data.replace(/apiBase:\s*'[^']*'/,`apiBase: ${JSON.stringify(api.href.replace(/\/$/,''))}`);
  }
  fs.writeFileSync(path.join(out,filename),data);
}
console.log('Static frontend built in dist/.');
