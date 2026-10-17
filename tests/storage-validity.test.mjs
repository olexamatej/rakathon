import test from 'node:test';
import assert from 'node:assert/strict';
import { checkList, renewList, sendList } from '../apps/patient-web/public/services.js';
import { createState, recordSubmission, updateSubmission, saveState, loadState } from '../apps/patient-web/public/lists.js';

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
