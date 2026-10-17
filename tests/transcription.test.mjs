import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createAppServer } from '../apps/patient-web/server.mjs';

// Synthetic PNG signature, never a patient photograph. The interaction engine is stubbed.
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const rows = [{ name: 'Concor', strength: '5 mg', schedule: '1-0-0' }, { name: null, strength: null, schedule: null }];

async function withEngine(t, handler) {
  const upstream = createServer(handler);
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const previous = process.env.TRANSCRIBE_API_URL;
  process.env.TRANSCRIBE_API_URL = `http://127.0.0.1:${upstream.address().port}`;
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (previous === undefined) delete process.env.TRANSCRIBE_API_URL;
    else process.env.TRANSCRIBE_API_URL = previous;
    upstream.closeAllConnections();
    server.closeAllConnections();
    upstream.close();
    server.close();
  });
  return { base: `http://127.0.0.1:${server.address().port}`, upstream };
}

test('photo endpoint forwards the raw image to the engine and returns only rows', async t => {
  const seen = [];
  const { base } = await withEngine(t, (req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, type: req.headers['content-type'], body: Buffer.concat(chunks) });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(rows));
    });
  });
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), rows);
  assert.deepEqual(seen, [{ method: 'POST', url: '/transcribe', type: 'image/png', body: png }]);
});

test('invalid requests never reach the engine', async t => {
  let calls = 0;
  const { base } = await withEngine(t, (req, res) => {
    calls += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
  let response = await fetch(`${base}/api/transcribe`);
  assert.equal(response.status, 405);
  response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'text' });
  assert.equal(response.status, 415);
  response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.alloc(20 * 1024 * 1024 + 1) });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test('engine problem responses pass through with their headers', async t => {
  const problem = JSON.stringify({ type: 'about:blank', title: 'Vytíženo', status: 429, detail: 'internal engine detail' });
  for (const [status, headers] of [[429, { 'Retry-After': '3' }], [422, {}], [502, {}], [504, {}]]) {
    const { base } = await withEngine(t, (req, res) => {
      req.resume();
      res.writeHead(status, { 'Content-Type': 'application/problem+json', ...headers });
      res.end(problem);
    });
    const response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: png });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/problem+json');
    if (status === 429) assert.equal(response.headers.get('retry-after'), '3');
    assert.deepEqual(await response.json(), JSON.parse(problem));
  }
});

test('an unavailable engine yields a 502 without exposing internals', async t => {
  const previous = process.env.TRANSCRIBE_API_URL;
  process.env.TRANSCRIBE_API_URL = 'http://127.0.0.1:1';
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (previous === undefined) delete process.env.TRANSCRIBE_API_URL;
    else process.env.TRANSCRIBE_API_URL = previous;
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.ok(!body.includes('ECONNREFUSED') && !body.includes('127.0.0.1:1'));
});
