import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = {
  '/pacient': ['index.html', 'text/html'],
  '/pacient/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/lists.js': ['lists.js', 'text/javascript'],
  '/services.js': ['services.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
  '/sw.js': ['sw.js', 'text/javascript'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icons/icon.svg': ['icons/icon.svg', 'image/svg+xml'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
};

const securityHeaders = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

// Only regimen names leave the data file, never the rest of the dataset. Synthetic regimens are
// per-biosimilar copies of a real regimen (GEMOX-B (bevacizumab-xxxx) ...) and would flood autocomplete.
let regimenNames;
function loadRegimenNames() {
  regimenNames ??= readFile(new URL('../../data/solid-tumors-regimens.json', import.meta.url), 'utf8')
    .then(text => JSON.stringify([...new Set(JSON.parse(text).regimens.filter(regimen => regimen.type === 'Regimen').map(regimen => regimen.name))].sort()))
    .catch(error => { regimenNames = undefined; throw error; });
  return regimenNames;
}

export function createAppServer() {
  return createServer(async (req, res) => {
    let path;
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400).end('Neplatná adresa.');
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/') {
      res.writeHead(302, { Location: '/pacient' }).end();
      return;
    }
    if (path === '/regimens.json') {
      try {
        const body = await loadRegimenNames();
        res.writeHead(200, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        res.writeHead(500).end('Seznam režimů není dostupný.');
      }
      return;
    }
    const file = Object.hasOwn(files, path) ? files[path] : null;
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nenalezeno');
      return;
    }
    try {
      const body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      res.writeHead(200, { ...securityHeaders, 'Content-Type': `${file[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500).end('Soubor aplikace není dostupný.');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8081);
  const server = createAppServer();
  server.on('error', error => {
    console.error(`Server nelze spustit: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`PillGaze: http://localhost:${port}/pacient`);
  });
}
