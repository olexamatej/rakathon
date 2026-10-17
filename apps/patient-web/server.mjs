import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_ENGINE_URL = 'https://rakathon.josefkuchar.com';
const DEFAULT_BACKEND_URL = 'https://rakathon.denishromada.com';
const engineUrl = () => (process.env.TRANSCRIBE_API_URL || process.env.INTERACTION_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');

const files = {
  '/pacient': ['index.html', 'text/html'],
  '/pacient/': ['index.html', 'text/html'],
  '/lekar': ['lekar.html', 'text/html'],
  '/lekar/': ['lekar.html', 'text/html'],
  '/lekar.js': ['lekar.js', 'text/javascript'],
  '/lekar.css': ['lekar.css', 'text/css'],
  '/doctor.js': ['doctor.js', 'text/javascript'],
  '/doctor-services.js': ['doctor-services.js', 'text/javascript'],
  '/autocomplete.js': ['autocomplete.js', 'text/javascript'],
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

const adminFiles = {
  '/storage-admin': ['index.html', 'text/html'],
  '/storage-admin/': ['index.html', 'text/html'],
  '/storage-admin/app.mjs': ['app.mjs', 'text/javascript'],
  '/storage-admin/styles.css': ['styles.css', 'text/css'],
};

function backendOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('WEB_BACKEND_URL musí být HTTP(S) origin bez cesty, hesla nebo query.');
  }
  return url.origin;
}

// A fixed upstream and explicit routes: never turn the development server into an open proxy.
async function proxyBackend(req, res, origin, path) {
  let methods;
  if (path === '/api/v1/transfers') methods = ['POST'];
  else if (/^\/api\/v1\/transfers\/[A-Za-z0-9]+$/.test(path)) methods = ['GET', 'HEAD'];
  else if (/^\/api\/v1\/admin\/blobs(?:\/[a-f0-9]{64})?$/.test(path)) methods = ['GET', 'HEAD', 'DELETE'];
  else if (['/api/health/live', '/api/health/ready'].includes(path)) methods = ['GET', 'HEAD'];
  else if (['/api/transcribe', '/api/interaction-checks', '/api/interaction-research'].includes(path)) methods = ['POST'];
  else return problem(res, 404, 'Nenalezeno', 'Tato API cesta není dostupná.');
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    return problem(res, 405, 'Nepovolená metoda', 'Tato metoda není povolena.');
  }
  const limit = path === '/api/transcribe' ? MAX_IMAGE_BYTES : 1024 * 1024;
  if (Number(req.headers['content-length']) > limit) return problem(res, 413, 'Příliš velký požadavek', 'Požadavek je příliš velký.');
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) return problem(res, 413, 'Příliš velký požadavek', 'Požadavek je příliš velký.');
      chunks.push(chunk);
    }
    const headers = {};
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    // Only storage admin needs user credentials. Never forward cookies or proxy headers.
    if (path.startsWith('/api/v1/admin/') && req.headers.authorization) headers.Authorization = req.headers.authorization;
    const query = new URL(req.url, 'http://localhost').search;
    const response = await fetch(`${origin}${path}${query}`, {
      method: req.method, headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      redirect: 'error', signal: AbortSignal.timeout(path === '/api/transcribe' ? 130_000 : 35_000),
    });
    const responseHeaders = { ...securityHeaders, 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'retry-after', 'content-language', 'allow']) {
      if (response.headers.has(name)) responseHeaders[name] = response.headers.get(name);
    }
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, responseHeaders);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    problem(res, 502, 'Backend není dostupný', 'Nasazený backend se nepodařilo zavolat.');
  }
}

// Only regimen names and their drugs leave the data directory. data/regimens.json is the slim
// extract of solid-tumors-regimens.json (scripts/slim_regimens.py), so no extra data is loaded.
let regimenData;
function loadRegimenData() {
  regimenData ??= readFile(new URL('../../data/regimens.json', import.meta.url), 'utf8')
    .then(text => {
      const regimens = JSON.parse(text);
      return {
        names: JSON.stringify(regimens.map(regimen => regimen.name)),
        drugs: JSON.stringify(Object.fromEntries(regimens.map(regimen => [regimen.name, regimen.drugs]))),
      };
    })
    .catch(error => { regimenData = undefined; throw error; });
  return regimenData;
}

// Medicine names and their active substances from the SÚKL catalogue. Names feed autocomplete (they
// never restrict input); substances map a name to its active substances. A name can have several
// catalogue variants, so the most common substance list wins.
const sentenceCase = text => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
let suklData;
function loadSuklData() {
  suklData ??= readFile(new URL('../../data/sukl/medications.json', import.meta.url), 'utf8')
    .then(text => {
      const variants = new Map(); // name -> Map(substance list JSON -> count)
      for (const record of JSON.parse(text)) {
        if (!record.name) continue;
        const substances = (record.activeSubstances || []).map(entry => entry.name || entry.inn).filter(Boolean).map(sentenceCase);
        const counts = variants.get(record.name) ?? new Map();
        const key = JSON.stringify(substances);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        variants.set(record.name, counts);
      }
      const names = [...variants.keys()].sort();
      const substances = {};
      for (const name of names) {
        const [best] = [...variants.get(name)].sort((a, b) => b[1] - a[1])[0];
        const list = JSON.parse(best);
        if (list.length) substances[name] = list;
      }
      return { names: JSON.stringify(names), substances: JSON.stringify(substances) };
    })
    .catch(error => { suklData = undefined; throw error; });
  return suklData;
}

const INTERACTION_BODY_LIMIT = 64 * 1024;
const problem = (res, status, title, detail) => {
  res.writeHead(status, { ...securityHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/problem+json; charset=utf-8' });
  res.end(JSON.stringify({ type: 'about:blank', title, status, detail }));
};

// Same-origin proxy for the interaction engine endpoints (interaction-engine/openapi.yaml): the browser avoids
// CORS and the CSP stays `connect-src 'self'`. The upstream is read per request so tests can stub it.
async function proxyInteractionEngine(req, res, upstreamPath) {
  if (req.method !== 'POST') return problem(res, 405, 'Nepovolená metoda', 'Tato metoda není povolena.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > INTERACTION_BODY_LIMIT) return problem(res, 413, 'Příliš velký požadavek', 'Požadavek je příliš velký.');
    chunks.push(chunk);
  }
  const upstream = (process.env.INTERACTION_API_URL || 'https://rakathon.josefkuchar.com').replace(/\/$/, '');
  try {
    const response = await fetch(`${upstream}${upstreamPath}`, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(30_000),
    });
    const headers = { ...securityHeaders, 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'retry-after', 'content-language']) {
      if (response.headers.has(name)) headers[name] = response.headers.get(name);
    }
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    problem(res, 502, 'Služba interakcí není dostupná', 'Službu pro kontrolu interakcí se nepodařilo zavolat. Zkuste to znovu.');
  }
}

// Same-origin proxy for photo transcription on the interaction engine. The engine holds the
// provider credentials and the SÚKL catalogue; the browser only ever sees medication rows.
async function recognizeImage(req, res) {
  if (req.method !== 'POST') return problem(res, 405, 'Nepovolená metoda', 'Použijte POST s fotografií.');
  res.setHeader('Cache-Control', 'no-store');
  const mimeType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'].includes(mimeType)) {
    return problem(res, 415, 'Nepodporovaný obrázek', 'Pošlete přímo fotografii JPEG, PNG nebo WebP.');
  }
  if (Number(req.headers['content-length']) > MAX_IMAGE_BYTES) return problem(res, 413, 'Příliš velká fotografie', 'Vyberte snímek do 20 MB.');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) return problem(res, 413, 'Příliš velká fotografie', 'Vyberte snímek do 20 MB.');
      chunks.push(chunk);
    }
    const response = await fetch(`${engineUrl()}/transcribe`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(130_000),
      headers: { 'Content-Type': mimeType }, body: Buffer.concat(chunks),
    });
    const headers = { ...securityHeaders, 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'retry-after', 'content-language']) {
      if (response.headers.has(name)) headers[name] = response.headers.get(name);
    }
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    problem(res, 502, 'Rozpoznávání fotografie', 'Fotografii se nepodařilo zpracovat. Zkuste to znovu.');
  }
}

export function createAppServer({ backendUrl = process.env.WEB_BACKEND_URL } = {}) {
  const backend = backendOrigin(backendUrl);
  return createServer(async (req, res) => {
    let path;
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400).end('Neplatná adresa.');
      return;
    }
    if (backend && path.startsWith('/api/')) {
      await proxyBackend(req, res, backend, path);
      return;
    }
    if (path === '/api/transcribe') {
      await recognizeImage(req, res);
      return;
    }
    if (path === '/api/interaction-checks' || path === '/api/interaction-research') {
      await proxyInteractionEngine(req, res, path.replace('/api', ''));
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
    if (backend && Object.hasOwn(adminFiles, path)) {
      const [name, type] = adminFiles[path];
      try {
        const body = await readFile(new URL(`../storage-admin/public/${name}`, import.meta.url));
        res.writeHead(200, { ...securityHeaders, 'Cache-Control': 'no-store', 'Content-Type': `${type}; charset=utf-8` });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        res.writeHead(500).end('Soubor administrace není dostupný.');
      }
      return;
    }
    if (path === '/sukl-names.json' || path === '/sukl-substances.json') {
      try {
        const data = await loadSuklData();
        const body = path === '/sukl-names.json' ? data.names : data.substances;
        res.writeHead(200, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        res.writeHead(500).end('Seznam léčiv není dostupný.');
      }
      return;
    }
    if (path === '/regimens.json' || path === '/regimen-drugs.json') {
      try {
        const data = await loadRegimenData();
        const body = path === '/regimens.json' ? data.names : data.drugs;
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
  try { loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT || 8081);
  const remote = process.argv.includes('--remote');
  const backendUrl = process.env.WEB_BACKEND_URL || (remote ? DEFAULT_BACKEND_URL : undefined);
  const server = createAppServer({ backendUrl });
  server.on('error', error => {
    console.error(`Server nelze spustit: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || (backendUrl ? '127.0.0.1' : '0.0.0.0'), () => {
    console.log(`PillGaze: http://localhost:${port}/pacient`);
    console.log(`Lékař: http://localhost:${port}/lekar`);
    if (backendUrl) {
      console.log(`Storage admin: http://localhost:${port}/storage-admin`);
      console.log(`Backend: ${backendOrigin(backendUrl)} — uploady a mazání mění nasazená data; používejte jen syntetická data.`);
    }
  });
}
