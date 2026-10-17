import test from 'node:test';
import assert from 'node:assert/strict';
import { checkList, renewList, sendList, validateList, savePatientList, renewPatientList } from '../apps/patient-web/public/services.js';
import { createState, recordSubmission, replaceSubmission, updateSubmission, invalidateSubmission, saveState, loadState } from '../apps/patient-web/public/lists.js';

const token = 'a'.repeat(64);
const entry = { pin: '0042', ownerToken: token };
const headers = { 'x-owner-token': token, 'x-uploaded-at': '2026-10-17T12:00:00Z', 'x-expires-at': '2026-10-31T12:00:00Z' };

test('patient availability uses non-consuming HEAD; renewal uses POST without uploading content', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers['X-Owner-Token'], token);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    return new Response(null, { headers });
  });
  assert.equal((await checkList(entry)).expiresAt, headers['x-expires-at']);
  assert.equal((await renewList(entry)).sentAt, headers['x-uploaded-at']);
  assert.deepEqual(requests.map(r => [r.url, r.options.method]), [
    ['/api/v1/transfers/0042', 'HEAD'], ['/api/v1/transfers/0042/renew', 'POST'],
  ]);
});

const payload = { items: [{ id: 'medicine-local-id', name: 'Aktuální rozepsané léčivo', dosage: '', dosesPerPackage: '' }], regimen: 'Aktuální režim' };
const futureEntry = { ...entry, expiresAt: '2099-10-31T12:00:00Z' };
const futureHeaders = { ...headers, 'x-expires-at': futureEntry.expiresAt };

test('shared validation skips HEAD for expired receipts and checks future receipts', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { headers: futureHeaders }));
  assert.equal(await validateList({ ...entry, expiresAt: '2020-01-01T00:00:00Z' }), null);
  assert.equal(await validateList(undefined), null);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal((await validateList(futureEntry)).pin, entry.pin);
  assert.equal(fetch.mock.callCount(), 1);
});

for (const scenario of ['available', 'missing', 'expired', 'consumed-during-put']) {
  test(`saving validates and chooses the correct write: ${scenario}`, async t => {
    const methods = [];
    t.mock.method(globalThis, 'fetch', async (_, options) => {
      methods.push(options.method);
      if (options.method === 'HEAD') return new Response(null, { status: scenario === 'missing' ? 404 : 200, headers: futureHeaders });
      assert.equal(JSON.parse(options.body).items[0].name, payload.items[0].name);
      if (options.method === 'PUT' && scenario === 'consumed-during-put') return new Response(null, { status: 404 });
      return Response.json({ pin: options.method === 'POST' ? '5678' : '0042' }, { status: options.method === 'POST' ? 201 : 200, headers: futureHeaders });
    });
    const previous = scenario === 'expired' ? { ...futureEntry, expiresAt: '2020-01-01T00:00:00Z' } : futureEntry;
    const result = await savePatientList(payload, previous);
    assert.deepEqual(methods, scenario === 'available' ? ['HEAD', 'PUT'] : scenario === 'expired' ? ['POST']
      : scenario === 'missing' ? ['HEAD', 'POST'] : ['HEAD', 'PUT', 'POST']);
    assert.equal(result.updatedExisting, scenario === 'available');
    const state = createState();
    state.items = structuredClone(payload.items);
    state.regimen = payload.regimen;
    recordSubmission(state, payload.items, { ...futureEntry, sentAt: headers['x-uploaded-at'] });
    if (!result.updatedExisting) replaceSubmission(state, payload.items, result.receipt, payload.regimen);
    assert.deepEqual(state.items, payload.items);
    assert.equal(state.regimen, payload.regimen);
    assert.equal(state.submissions.length, 1);
    assert.equal(state.submissions[0].pin, result.receipt.pin);
  });
}

for (const failure of ['head-network', 'head-429', 'head-503', 'put-network', 'put-429', 'put-503']) {
  test(`uncertain availability or write does not create a copy: ${failure}`, async t => {
    const methods = [];
    t.mock.method(globalThis, 'fetch', async (_, options) => {
      methods.push(options.method);
      if (options.method === 'HEAD' && failure.startsWith('put')) return new Response(null, { headers: futureHeaders });
      if (failure.endsWith('network')) throw new TypeError();
      return new Response(null, { status: failure.endsWith('429') ? 429 : 503 });
    });
    await assert.rejects(savePatientList(payload, futureEntry));
    assert.deepEqual(methods, failure.startsWith('head') ? ['HEAD'] : ['HEAD', 'PUT']);
  });
}

test('missing and legacy receipts are not confused with network or service failures', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  assert.equal(await checkList({ pin: '0042' }), null);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await checkList(entry), null);
  for (const status of [429, 503]) {
    fetch.mock.mockImplementation(async () => new Response(null, { status }));
    await assert.rejects(checkList(entry));
  }
  fetch.mock.mockImplementation(async () => { throw new TypeError(); });
  await assert.rejects(checkList(entry));
});

test('deadline crossing while HEAD is pending chooses POST instead of PUT', async t => {
  let now = Date.parse('2026-10-17T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const deadline = new Date(now + 1000).toISOString();
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    methods.push(options.method);
    if (options.method === 'HEAD') {
      now += 2000;
      return new Response(null, { headers: { ...futureHeaders, 'x-expires-at': deadline } });
    }
    return Response.json({ pin: '5678' }, { status: 201, headers: futureHeaders });
  });
  assert.equal((await savePatientList(payload, { ...futureEntry, expiresAt: deadline })).updatedExisting, false);
  assert.deepEqual(methods, ['HEAD', 'POST']);
});

test('extension uses the same validation and never renews an expired or missing upload', async t => {
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    methods.push(options.method);
    return new Response(null, { status: 404 });
  });
  assert.equal(await renewPatientList({ ...entry, expiresAt: '2020-01-01T00:00:00Z' }), null);
  assert.deepEqual(methods, []);
  assert.equal(await renewPatientList(futureEntry), null);
  assert.deepEqual(methods, ['HEAD']);
});

test('failed fresh POST leaves the existing receipt and draft untouched', async t => {
  const state = createState();
  state.items = structuredClone(payload.items);
  state.regimen = payload.regimen;
  recordSubmission(state, state.items, { ...futureEntry, sentAt: headers['x-uploaded-at'] });
  const before = structuredClone(state);
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    methods.push(options.method);
    return new Response(null, { status: options.method === 'HEAD' ? 404 : 503 });
  });
  await assert.rejects(savePatientList(payload, state.submissions[0]));
  assert.deepEqual(methods, ['HEAD', 'POST']);
  assert.deepEqual(state, before);
});

test('unchanged persistence does not invalidate another tab through redundant storage writes', () => {
  const state = createState();
  let saved = null;
  let writes = 0;
  const storage = { getItem: () => saved, setItem: (_, value) => { writes++; saved = value; } };
  saveState(storage, state);
  saveState(storage, state);
  assert.equal(writes, 1);
});

test('invalidation retains the receipt and draft locally without restoring them to fresh upload', () => {
  const state = createState();
  state.items = structuredClone(payload.items);
  state.regimen = payload.regimen;
  const receipt = recordSubmission(state, state.items, { ...futureEntry, sentAt: headers['x-uploaded-at'] }, payload.regimen);
  invalidateSubmission(state);
  assert.equal(state.submissions[0], receipt);
  assert.equal(receipt.expired, true);
  assert.ok(Number.isFinite(Date.parse(receipt.invalidatedAt)));
  const invalidatedAt = receipt.invalidatedAt;
  assert.deepEqual(state.invalidatedDraft, payload);
  assert.deepEqual(state.items, []);
  let serialized;
  const storage = { getItem: () => serialized ?? null, setItem: (_, value) => { serialized = value; } };
  saveState(storage, state);
  assert.deepEqual(loadState(storage).state, state);
  state.items = structuredClone(payload.items);
  invalidateSubmission(state);
  assert.equal(receipt.invalidatedAt, invalidatedAt);
  assert.deepEqual(state.items, payload.items);
});

test('invalidation during an active edit preserves current items for a fresh POST', () => {
  const state = createState();
  state.items = structuredClone(payload.items);
  recordSubmission(state, state.items, { ...futureEntry, sentAt: headers['x-uploaded-at'] });
  invalidateSubmission(state, true);
  assert.equal(state.submissions[0].expired, true);
  assert.deepEqual(state.items, payload.items);
});

test('receipt uses server time and token; saved snapshots cannot switch PINs', async t => {
  const state = createState();
  const items = [{ id: 'medicine-local-id', name: 'Syntetické léčivo', dosage: '', dosesPerPackage: '' }];
  const original = recordSubmission(state, items, { ...entry, sentAt: headers['x-uploaded-at'], expiresAt: headers['x-expires-at'] });
  assert.throws(() => updateSubmission(state, original.id, items, { pin: '5678', sentAt: headers['x-uploaded-at'] }));
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    assert.equal(options.method, 'POST');
    return Response.json({ pin: '0042' }, { status: 201, headers });
  });
  const receipt = await sendList({ items });
  assert.equal(receipt.sentAt, headers['x-uploaded-at']);
  const restored = updateSubmission(state, original.id, items, receipt);
  assert.equal(restored.id, original.id);
  assert.equal(restored.expired, undefined);
  let saved;
  const storage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  saveState(storage, state);
  assert.deepEqual(loadState(storage).state.submissions, [restored]);
});
