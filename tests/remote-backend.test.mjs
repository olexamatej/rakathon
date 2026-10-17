import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAppServer } from '../apps/patient-web/server.mjs';

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('remote backend preserves storage bytes, query, auth, status and retry-after', async t => {
  const requests = [];
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    const headers = { 'Content-Type': 'application/json', 'Set-Cookie': 'private=secret', 'X-Uploaded-At': '2026-10-17T12:34:56Z' };
    if (req.method === 'DELETE') return res.writeHead(204, headers).end();
    if (req.url.includes('offset=100')) return res.writeHead(429, { ...headers, 'Retry-After': '60' }).end('{"status":429}');
    if (req.url.endsWith('/MISSING')) return res.writeHead(404, headers).end('{"status":404}');
    if (req.method === 'POST') return res.writeHead(201, headers).end('{"pin":"A7K2QM"}');
    res.writeHead(200, headers).end(' {"version":1,"regimen":"žádný","items":[]}\n');
  });
  const backendUrl = await listen(t, upstream);
  const base = await listen(t, createAppServer({ backendUrl }));
  const payload = ' {"version":1,"regimen":"žádný","items":[]}\n';
  const upload = await fetch(base + '/api/v1/transfers', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ignored', Cookie: 'ignored=yes', 'X-Forwarded-For': '1.2.3.4' }, body: payload,
  });
  assert.equal(upload.status, 201);
  assert.deepEqual(await upload.json(), { pin: 'A7K2QM' });
  assert.equal(upload.headers.get('cache-control'), 'no-store');
  assert.equal(upload.headers.get('set-cookie'), null);
  assert.equal(requests[0].url, '/api/v1/transfers');
  assert.equal(requests[0].body.toString(), payload);
  assert.equal(requests[0].headers['content-type'], 'application/json');
  for (const name of ['authorization', 'cookie', 'x-forwarded-for']) assert.equal(requests[0].headers[name], undefined);
  const retrieval = await fetch(base + '/api/v1/transfers/A7K2QM');
  assert.equal(await retrieval.text(), payload);
  assert.equal(retrieval.headers.get('x-uploaded-at'), '2026-10-17T12:34:56Z');
  assert.equal((await fetch(base + '/api/v1/transfers/MISSING')).status, 404);
  const admin = await fetch(base + '/api/v1/admin/blobs?offset=100', { headers: { Authorization: 'Bearer synthetic-test-password' } });
  assert.equal(admin.status, 429);
  assert.equal(admin.headers.get('retry-after'), '60');
  assert.equal(requests.at(-1).url, '/api/v1/admin/blobs?offset=100');
  assert.equal(requests.at(-1).headers.authorization, 'Bearer synthetic-test-password');
  assert.equal((await fetch(base + '/api/v1/admin/blobs/' + 'a'.repeat(64), { method: 'DELETE' })).status, 204);
  const head = await fetch(base + '/api/health/ready', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('remote routes take precedence over engine overrides and forward raw images', async t => {
  const oldInteraction = process.env.INTERACTION_API_URL;
  const oldTranscribe = process.env.TRANSCRIBE_API_URL;
  process.env.INTERACTION_API_URL = 'http://127.0.0.1:1';
  process.env.TRANSCRIBE_API_URL = 'http://127.0.0.1:1';
  t.after(() => {
    if (oldInteraction === undefined) delete process.env.INTERACTION_API_URL;
    else process.env.INTERACTION_API_URL = oldInteraction;
    if (oldTranscribe === undefined) delete process.env.TRANSCRIBE_API_URL;
    else process.env.TRANSCRIBE_API_URL = oldTranscribe;
  });
  const seen = [];
  const backendUrl = await listen(t, createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push([req.url, req.headers['content-type'], Buffer.concat(chunks)]);
    res.writeHead(202, { 'Content-Type': 'application/json', 'Retry-After': '2' }).end('{"state":"queued"}');
  }));
  const base = await listen(t, createAppServer({ backendUrl }));
  for (const path of ['/api/transcribe', '/api/interaction-checks', '/api/interaction-research']) {
    const bytes = Buffer.from([0, 255, 1, 128]);
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('retry-after'), '2');
    assert.deepEqual(seen.at(-1), [path, 'image/png', bytes]);
  }
});

test('remote proxy bounds requests, refuses unknown routes and redirects, and never retries', async t => {
  let calls = 0;
  const backendUrl = await listen(t, createServer((req, res) => {
    calls++;
    req.resume();
    res.writeHead(302, { Location: '/destination' }).end();
  }));
  const base = await listen(t, createAppServer({ backendUrl }));
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/api/v1/transfers', { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(base + '/api/v1/transfers', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal(calls, 0);
  assert.equal((await fetch(base + '/api/health/ready')).status, 502);
  assert.equal(calls, 1);
  const unavailable = createServer();
  await new Promise(resolve => unavailable.listen(0, '127.0.0.1', resolve));
  const port = unavailable.address().port;
  await new Promise(resolve => unavailable.close(resolve));
  const local = await listen(t, createAppServer({ backendUrl: `http://127.0.0.1:${port}` }));
  assert.equal((await fetch(local + '/api/health/ready')).status, 502);
});

test('backend configuration accepts only a fixed HTTP(S) origin', () => {
  for (const backendUrl of ['ftp://example.com', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com?token=secret', 'https://example.com/#hash']) {
    assert.throws(() => createAppServer({ backendUrl }));
  }
});


test('remote proxy allows PUT only for an existing transfer path and preserves JSON bytes', async t => {
  const payload = ' {"edited": true}\n';
  let calls = 0;
  const backendUrl = await listen(t, createServer(async (req, res) => {
    calls++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(req.method, 'PUT');
    assert.equal(req.url, '/api/v1/transfers/ABC234');
    assert.equal(Buffer.concat(chunks).toString(), payload);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"pin":"ABC234"}');
  }));
  const base = await listen(t, createAppServer({ backendUrl }));
  const response = await fetch(base + '/api/v1/transfers/ABC234', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pin: 'ABC234' });
  assert.equal((await fetch(base + '/api/v1/transfers', { method: 'PUT', body: '{}' })).status, 405);
  assert.equal(calls, 1);
});
