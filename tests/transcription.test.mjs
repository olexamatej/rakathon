import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { transcribeImage, parseMedications, imageMimeType, MAX_IMAGE_BYTES, MEDICATION_SCHEMA } from '../services/transcription/gemini.mjs';
import { createAppServer } from '../apps/patient-web/server.mjs';

// Synthetic PNG signature, never a patient photograph. Provider calls are all stubbed.
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const rows = [{ name: 'Concor 5 mg', schedule: '1-0-0' }, { name: null, schedule: null }];
const generated = (text = JSON.stringify(rows), finishReason = 'STOP') => Response.json({
  candidates: [{ finishReason, content: { parts: [{ thought: true, text: 'not output' }, { text }] } }],
});
const status = expected => error => error.status === expected;

test('Gemini receives the image and strict minimal schema; key stays in headers', async () => {
  const result = await transcribeImage(png, { apiKey: 'test-secret', model: 'gemini-3.6-flash', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'test-secret');
    const request = JSON.parse(options.body);
    assert.deepEqual(request.contents[0].parts[0], { inline_data: { mime_type: 'image/png', data: png.toString('base64') } });
    assert.deepEqual(request.generationConfig.responseJsonSchema, MEDICATION_SCHEMA);
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    return generated();
  } });
  assert.deepEqual(result, rows);
});

test('parsing normalizes only schedule typography and rejects incomplete or extra data', () => {
  assert.deepEqual(parseMedications('[{"name":" Concor 5 mg ","schedule":"1/2 – 0 – 0"}]'), [{ name: 'Concor 5 mg', schedule: '1/2-0-0' }]);
  const free = [{ name: 'X', schedule: 'V pondělí večer 1 tableta' }];
  assert.deepEqual(parseMedications(JSON.stringify(free)), free);
  for (const value of ['```json\n[]\n```', '{}', '[{"name":"X"}]', '[{"name":"X","schedule":1}]',
    '[{"name":"X","schedule":null,"extra":1}]', '[{"name":"","schedule":null}]',
    JSON.stringify([{ name: 'X', schedule: 'x'.repeat(121) }]), JSON.stringify([{ name: 'X\nY', schedule: null }])]) {
    assert.throws(() => parseMedications(value), status(502));
  }
  assert.deepEqual(parseMedications('[]'), []);
});

test('invalid photos, missing credentials and oversize photos do not call Google', async () => {
  const fetchImpl = () => { throw new Error('must not fetch'); };
  await assert.rejects(transcribeImage(png, { apiKey: '', fetchImpl }), status(503));
  await assert.rejects(transcribeImage(Buffer.from('text'), { apiKey: 'test', fetchImpl }), status(415));
  await assert.rejects(transcribeImage(Buffer.alloc(0), { apiKey: 'test', fetchImpl }), status(400));
  await assert.rejects(transcribeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), { apiKey: 'test', fetchImpl }), status(413));
  assert.equal(imageMimeType(Buffer.from([255, 216, 255])), 'image/jpeg');
});

test('quota, blocked, truncated, malformed and timed out responses do not become partial lists', async () => {
  for (const [response, expected] of [
    [new Response('private provider detail', { status: 429 }), 429],
    [new Response('private provider detail', { status: 500 }), 502],
    [Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), 422],
    [generated('[{"name":"X","schedule":null}]', 'MAX_TOKENS'), 502],
    [generated('not json'), 502],
  ]) {
    await assert.rejects(transcribeImage(png, { apiKey: 'test', fetchImpl: async () => response }), error => {
      assert.equal(error.status, expected);
      assert.ok(!error.message.includes('private provider detail'));
      return true;
    });
  }
  await assert.rejects(transcribeImage(png, { apiKey: 'test', signal: AbortSignal.abort(), fetchImpl: async () => { throw new Error(); } }), status(504));
});

test('large images use Google Files and are deleted after success or failure', async () => {
  const bytes = Buffer.alloc(15 * 1024 * 1024);
  png.copy(bytes);
  for (const fail of [false, true]) {
    const calls = [];
    const work = transcribeImage(bytes, { apiKey: 'test', fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      if (calls.length === 1) return new Response('', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session' } });
      if (calls.length === 2) {
        assert.equal(options.body, bytes);
        return Response.json({ file: { name: 'files/test', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test', state: 'ACTIVE' } });
      }
      if (calls.length === 3) {
        const request = JSON.parse(options.body);
        assert.ok(request.contents[0].parts[0].file_data);
        return fail ? new Response('', { status: 429 }) : generated();
      }
      assert.equal(options.method, 'DELETE');
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/files/test');
      return new Response(null, { status: 204 });
    } });
    if (fail) await assert.rejects(work, status(429));
    else assert.deepEqual(await work, rows);
    assert.equal(calls.length, 4);
  }
});

test('HTTP image endpoint returns only the minimal JSON and never exposes credentials', async t => {
  const server = createAppServer({ transcriber: bytes => transcribeImage(bytes, { apiKey: 'server-only-secret', fetchImpl: async () => generated() }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), rows);
  response = await fetch(`${base}/api/transcribe`);
  assert.equal(response.status, 405);
  response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'text' });
  assert.equal(response.status, 415);
  response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'text' });
  assert.equal(response.status, 415);
  response = await fetch(`${base}/.env`);
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes('server-only-secret'));
});
