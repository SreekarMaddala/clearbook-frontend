const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../landing-scene.js')],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:path.resolve(__dirname,'../assets/landing-scene.js'),legalComments:'eof'});
