const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5173);
const backend = new URL(process.env.CLEARBOOK_API_PROXY || 'http://127.0.0.1:8000');
if (!['http:', 'https:'].includes(backend.protocol)) throw new Error('API proxy must use HTTP or HTTPS.');
const assets = {'/':['index.html','text/html'], '/index.html':['index.html','text/html'],
  '/app.js':['app.js','text/javascript'], '/auth.js':['auth.js','text/javascript'], '/config.js':['config.js','text/javascript'], '/styles.css':['styles.css','text/css']};
function error(response, status, message) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify({error:message}));
}
const server = http.createServer((request, response) => {
  const incoming = new URL(request.url, 'http://localhost');
  if (incoming.pathname.startsWith('/api/')) {
    if (!['GET','POST','PATCH','OPTIONS'].includes(request.method)) return error(response,405,'Method not supported.');
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}`) return error(response,403,'Cross-origin requests are not allowed.');
    const headers = {...request.headers, host:backend.host};
    // The local API's origin check receives the trusted development proxy origin.
    if (origin) headers.origin=backend.origin;
    const client = backend.protocol === 'https:' ? https : http;
    const upstream = client.request({protocol:backend.protocol, hostname:backend.hostname, port:backend.port,
      path:request.url, method:request.method, headers, timeout:30000}, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode, {...upstreamResponse.headers,'Cache-Control':'no-store'});
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => error(response,502,'Cannot reach the backend. Start clearbook-backend on port 8000.'));
    upstream.on('timeout', () => upstream.destroy(new Error('Backend timed out.')));
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }
  const asset=assets[incoming.pathname];
  if (request.method !== 'GET' || !asset) return error(response,404,'Not found.');
  const data=fs.readFileSync(path.join(root,asset[0]));
  response.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(data);
});
server.on('error', error => {console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',() => console.log(`Clearbook frontend: http://127.0.0.1:${port} (API proxy: ${backend.origin})`));
