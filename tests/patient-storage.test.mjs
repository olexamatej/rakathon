import test from 'node:test';
import assert from 'node:assert/strict';
import { sendList } from '../apps/patient-web/public/services.js';
import { createState, recordSubmission, toText, saveState, loadState } from '../apps/patient-web/public/lists.js';

test('patient uploads its text as JSON and records exactly the storage-issued PIN', async t => {
  const state = createState();
  state.items.push({ id: 'local-id', name: 'Ukázkové léčivo', dosage: '10 mg', dosesPerPackage: '30', schedule: '1-0-0' });
  const text = toText(state.items, 'FOLFOX');
  let stored;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/v1/transfers');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    stored = JSON.parse(options.body);
    return new Response(JSON.stringify({ pin: '0AZ9QW' }), { status: 201 });
  });
  const receipt = await sendList(text);
  assert.deepEqual(stored, { text });
  assert.ok(!stored.text.includes('local-id'));
  assert.equal(receipt.pin, '0AZ9QW');
  assert.ok(Number.isFinite(Date.parse(receipt.sentAt)));
  const entry = recordSubmission(state, state.items, receipt, 'FOLFOX');
  assert.equal(entry.pin, '0AZ9QW');
  assert.equal(state.submissions[0].pin, receipt.pin);
  let saved;
  const storage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  saveState(storage, state);
  assert.equal(loadState(storage).state.submissions[0].pin, '0AZ9QW');
  assert.equal(fetch.mock.callCount(), 1);
});

test('sending the same list twice uploads twice and preserves both independent receipts', async t => {
  const state = createState();
  state.items.push({ id: 'local-id', name: 'Ukázkové léčivo', dosage: '10 mg', dosesPerPackage: '30' });
  const text = toText(state.items);
  const pins = ['01Z9QW', '23ABCD'];
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    bodies.push(options.body);
    return new Response(JSON.stringify({ pin: pins[bodies.length - 1] }), { status: 201 });
  });
  for (let i = 0; i < 2; i++) {
    recordSubmission(state, state.items, await sendList(text));
  }
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(state.submissions.length, 2);
  assert.deepEqual(state.submissions.map(entry => entry.pin), [...pins].reverse());
  assert.notEqual(state.submissions[0].id, state.submissions[1].id);
  let saved;
  const storage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  saveState(storage, state);
  assert.deepEqual(loadState(storage).state.submissions, state.submissions);
});

test('storage PINs containing 0 and 1 and old simulated PINs remain readable', () => {
  const state = createState();
  state.items.push({ id: 'local-id', name: 'Ukázkové léčivo', dosage: '10 mg', dosesPerPackage: '30' });
  for (const pin of ['01Z9QW', 'ILOU23']) {
    recordSubmission(state, state.items, { pin, sentAt: new Date().toISOString() });
  }
  let saved;
  const storage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  saveState(storage, state);
  assert.deepEqual(loadState(storage).state, state);
});

test('empty input never reaches storage', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not upload'); });
  for (const text of ['', '  ', null, {}, 42]) await assert.rejects(sendList(text), /prázdný/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('storage failures do not return a receipt or retry the upload', async t => {
  for (const [status, message] of [[400, /nemůže potvrdit/], [413, /příliš velký/], [429, /minutu/], [503, /nemůže potvrdit/], [200, /nemůže potvrdit/]]) {
    await t.test(`HTTP ${status}`, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('untrusted server error', { status }));
      await assert.rejects(sendList('synthetic list'), message);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
  for (const name of ['TypeError', 'TimeoutError']) {
    await t.test(name, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('untrusted error', name); });
      await assert.rejects(sendList('synthetic list'), /další kopii/);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
});

test('only a valid six-character Crockford storage PIN is accepted', async t => {
  for (const body of ['{broken', 'null', '{}', '{"pin":123456}', '{"pin":"ABC"}', '{"pin":"ABC23I"}', '{"pin":"abc234"}', '{"pin":"ABC2347"}']) {
    await t.test(body, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 201 }));
      await assert.rejects(sendList('synthetic list'), /nevrátilo platný PIN/);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
});
