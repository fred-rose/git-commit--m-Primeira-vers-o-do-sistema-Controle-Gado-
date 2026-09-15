import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest':'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end(); }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.slice(root.length).replaceAll('\\', '/');
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !/^(index\.html|sw\.js|manifest\.webmanifest|style\.css|js\/[^.].*\.js|css\/[^.].*\.css|assets\/[^.].*\.(svg|png|jpg|webp))$/.test(relative)) {
      response.writeHead(404); return response.end('Não encontrado.');
    }
    const content = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end('Não encontrado.'); }
});
server.listen(port, host, () => process.stdout.write(`Controle Gado disponível em http://${host}:${port}\n`));
server.on('error', error => { process.stderr.write(`Não foi possível iniciar: ${error.message}\n`); process.exitCode = 1; });
