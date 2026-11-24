const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../landing-scene.js'),path.resolve(__dirname,'../construction-scene.js')],bundle:true,minify:true,format:'esm',target:['es2022'],outdir:path.resolve(__dirname,'../assets'),legalComments:'eof'});
