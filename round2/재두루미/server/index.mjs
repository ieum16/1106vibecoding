import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createStore } from './store.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');
const store = createStore({ directory: join(root, '.cache') });
await store.load();
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!hosts.includes(req.headers.host)) return json(res, 403, { error: '허용되지 않은 호스트입니다.' });
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === '/api/news' && req.method === 'GET') return json(res, 200, store.snapshot());
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      if (req.headers['x-news-client'] !== 'news-collection' || (req.headers.origin && !hosts.some(host => req.headers.origin === `http://${host}`))) return json(res, 403, { error: '페이지에서 새로고침을 실행해 주세요.' });
      const current = store.snapshot();
      if (current.refreshing) return json(res, 202, current);
      if (current.cooldownSeconds) { res.setHeader('Retry-After', String(current.cooldownSeconds)); return json(res, 429, { error: `${current.cooldownSeconds}초 뒤 다시 시도해 주세요.` }); }
      void store.refresh().catch(() => console.error('Refresh failed; keys and upstream responses omitted.'));
      return json(res, 202, store.snapshot());
    }
    const paths = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/images/logo.png': ['images/logo.png', 'image/png'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
    const asset = paths[url.pathname];
    if (!asset || !['GET', 'HEAD'].includes(req.method)) return json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
    const body = await readFile(join(root, asset[0]));
    res.writeHead(200, { 'Content-Type': asset[1] + (asset[1].startsWith('text/') ? '; charset=utf-8' : ''), 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) { json(res, e.code === 'ENOENT' ? 404 : 500, { error: '요청을 처리하지 못했습니다.' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`뉴스 수집: http://localhost:${port}`));
