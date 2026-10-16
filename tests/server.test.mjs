import test from 'node:test';
import assert from 'node:assert/strict';
import { request, createServer as createHttpServer } from 'node:http';
import { createAppServer } from '../apps/patient-web/server.mjs';

// Only the public application may be served, never the repository's input data.
test('patient routes, PWA assets and private-file boundaries', async t => {
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(base, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/pacient');
  for (const path of ['/pacient', '/pacient/', '/pacient?historie=1', '/pacient?pin=12345678']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /lang="cs"/);
  }
  for (const path of ['/lekar', '/lekar/', '/lekar.js', '/lekar.css', '/doctor.js', '/doctor-services.js', '/autocomplete.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  assert.match(await (await fetch(base + '/lekar')).text(), /PIN pacienta/);
  const regimens = await (await fetch(base + '/regimens.json')).json();
  assert.ok(regimens.length > 1000 && regimens.every(name => typeof name === 'string'));
  assert.ok(regimens.includes('A-CMF'));
  assert.ok(!regimens.some(name => /bevacizumab-[a-z]{4}\)/.test(name)), 'biosimilar copies are excluded');
  const drugs = await (await fetch(base + '/regimen-drugs.json')).json();
  assert.ok(Array.isArray(drugs['A-CMF']) && drugs['A-CMF'].includes('Doxorubicin'));
  assert.deepEqual(Object.keys(drugs).sort(), regimens);
  const names = await (await fetch(base + '/sukl-names.json')).json();
  assert.ok(names.length > 5000 && names.every(name => typeof name === 'string'));
  assert.ok(names.includes('IBALGIN'));
  assert.equal(new Set(names).size, names.length);
  const substances = await (await fetch(base + '/sukl-substances.json')).json();
  assert.deepEqual(substances.IBALGIN, ['Ibuprofen']);
  assert.ok(Object.keys(substances).every(name => names.includes(name)));
  const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.start_url, '/pacient');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const response = await fetch(base + icon.src);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  assert.equal((await fetch(base + '/sw.js')).status, 200);
  for (const path of ['/.env', '/.git/config', '/data/sukl/medications.json', '/assets/private.jpg', '/__proto__']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base + '/pacient', { method: 'POST', body: 'not-an-api' })).status, 405);
  const malformedStatus = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: 'http://[' }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(malformedStatus, 400);
});

test('interaction engine proxy forwards the polling POST and its problems', async t => {
  const upstreamBodies = [];
  const upstream = createHttpServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      upstreamBodies.push([req.method, req.url, body]);
      if (body.includes('bad')) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' }).end('{"title":"x","status":400,"detail":"Neplatný požadavek."}');
      } else if (upstreamBodies.length === 1) {
        res.writeHead(202, { 'Content-Type': 'application/json', 'Retry-After': '2' }).end('{"state":"queued"}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"complete"}');
      }
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  process.env.INTERACTION_API_URL = `http://127.0.0.1:${upstream.address().port}`;
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    delete process.env.INTERACTION_API_URL;
    upstream.close();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/interaction-checks`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const first = await post('{"drugs":["a","b"]}');
  assert.equal(first.status, 202);
  assert.equal(first.headers.get('retry-after'), '2');
  assert.deepEqual(await first.json(), { state: 'queued' });
  const second = await post('{"drugs":["a","b"]}');
  assert.equal(second.status, 200);
  assert.equal((await second.json()).status, 'complete');
  assert.equal(second.headers.get('cache-control'), 'no-store');
  const rejected = await post('{"drugs":["bad"]}');
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).detail, 'Neplatný požadavek.');
  assert.deepEqual(upstreamBodies[0], ['POST', '/interaction-checks', '{"drugs":["a","b"]}']);
  assert.equal((await fetch(url)).status, 405);
  const research = await fetch(url.replace('interaction-checks', 'interaction-research'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"drugs":["a","b"],"site":"drugs.com"}' });
  assert.equal(research.status, 200);
  assert.deepEqual(upstreamBodies.at(-1), ['POST', '/interaction-research', '{"drugs":["a","b"],"site":"drugs.com"}']);
  assert.equal((await post('x'.repeat(70 * 1024))).status, 413);
  upstream.close();
  const down = await post('{"drugs":["a","b"]}');
  assert.equal(down.status, 502);
});
