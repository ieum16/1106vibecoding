const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const server = http.createServer((req, res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  const target = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(4173, '127.0.0.1', () => console.log('Location Tracker: http://localhost:4173'));
