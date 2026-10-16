import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizePhoto, sendList } from '../apps/patient-web/public/services.js';
import { createState, recordSubmission, saveState, loadState } from '../apps/patient-web/public/lists.js';
import { parsePatientList } from '../apps/patient-web/public/doctor-services.js';
import { addList, createDoctorState } from '../apps/patient-web/public/doctor.js';

const validPayload = { items: [{ name: 'Syntetické léčivo', dosage: '10 mg', dosesPerPackage: '30' }] };

test('photo mock uploads a complete structured list readable by the actual doctor parser', async t => {
  const items = await recognizePhoto(new File(['synthetic image'], 'photo.jpg', { type: 'image/jpeg' }), { mode: 'demo' });
  assert.deepEqual(items.map(item => item.name), ['PARALEN', 'IBALGIN', 'LETROX']);
  const expected = items.map(({ id, ...item }) => item);
  let stored;
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    stored = JSON.parse(options.body);
    return Response.json({ pin: '01Z9QW' }, { status: 201 });
  });
  const receipt = await sendList({ items: items.map(item => ({ ...item, photo: 'local photo metadata' })) });
  assert.deepEqual(stored, { version: 1, regimen: '', items: expected });
  const received = parsePatientList(stored);
  const list = addList(createDoctorState(), { pin: receipt.pin, ...received });
  assert.deepEqual(list.items.map(({ id, ...item }) => item), expected);
});

test('unreadable medicine fields never reach storage', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not upload'); });
  for (const item of [null, { name: 'missing fields' },
    { ...validPayload.items[0], name: 'x'.repeat(121) },
    { ...validPayload.items[0], dosage: 'x'.repeat(121) },
    { ...validPayload.items[0], dosesPerPackage: 30 },
    { ...validPayload.items[0], dosesPerPackage: '0' },
    { ...validPayload.items[0], schedule: 'x'.repeat(121) }]) {
    await assert.rejects(sendList({ items: [item] }), /platný formát pro lékaře/);
  }
  await assert.rejects(sendList({ ...validPayload, regimen: {} }), /platný formát pro lékaře/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('patient uploads its structured JSON and records exactly the storage-issued PIN', async t => {
  const state = createState();
  state.items.push({ id: 'local-id', name: 'Ukázkové léčivo', dosage: '10 mg', dosesPerPackage: '30', schedule: '1-0-0' });
  const payload = { version: 1, regimen: 'FOLFOX', items: [{ name: state.items[0].name, dosage: state.items[0].dosage, dosesPerPackage: state.items[0].dosesPerPackage, schedule: state.items[0].schedule }] };
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
  const receipt = await sendList(payload);
  assert.deepEqual(stored, payload);
  assert.ok(!JSON.stringify(stored).includes('local-id'));
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
  const payload = { version: 1, regimen: '', items: [{ name: state.items[0].name, dosage: state.items[0].dosage, dosesPerPackage: state.items[0].dosesPerPackage }] };
  const pins = ['01Z9QW', '23ABCD'];
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    bodies.push(options.body);
    return new Response(JSON.stringify({ pin: pins[bodies.length - 1] }), { status: 201 });
  });
  for (let i = 0; i < 2; i++) {
    recordSubmission(state, state.items, await sendList(payload));
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
  for (const payload of [null, {}, { items: [] }, { items: null }]) await assert.rejects(sendList(payload), /prázdný/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('storage failures do not return a receipt or retry the upload', async t => {
  for (const [status, message] of [[400, /nemůže potvrdit/], [413, /příliš velký/], [429, /minutu/], [503, /nemůže potvrdit/], [200, /nemůže potvrdit/]]) {
    await t.test(`HTTP ${status}`, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('untrusted server error', { status }));
      await assert.rejects(sendList(validPayload), message);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
  for (const name of ['TypeError', 'TimeoutError']) {
    await t.test(name, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('untrusted error', name); });
      await assert.rejects(sendList(validPayload), /další kopii/);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
});

test('only a valid six-character Crockford storage PIN is accepted', async t => {
  for (const body of ['{broken', 'null', '{}', '{"pin":123456}', '{"pin":"ABC"}', '{"pin":"ABC23I"}', '{"pin":"abc234"}', '{"pin":"ABC2347"}']) {
    await t.test(body, async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 201 }));
      await assert.rejects(sendList(validPayload), /nevrátilo platný PIN/);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
});
