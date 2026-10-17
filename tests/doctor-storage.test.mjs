import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchListByPin, parsePatientList } from '../apps/patient-web/public/doctor-services.js';
import { sendList } from '../apps/patient-web/public/services.js';
import { toText } from '../apps/patient-web/public/lists.js';
import { addList, createDoctorState } from '../apps/patient-web/public/doctor.js';

const items = [
  { name: 'Syntetické léčivo Ž', dosage: '10 mg / 5 mg', dosesPerPackage: '30', schedule: '1-0-0' },
  { name: 'Syntetické léčivo B', dosage: '20 mg', dosesPerPackage: '12' },
];

test('patient upload and doctor retrieval use the same server PIN and exact snapshot', async t => {
  let snapshot;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (options.method === 'POST') {
      snapshot = JSON.parse(options.body);
      return Response.json({ pin: '0042' }, { status: 201 });
    }
    assert.equal(url, '/api/v1/transfers/0042');
    return Response.json(snapshot);
  });
  const receipt = await sendList({ version: 1, regimen: 'FOLFOX4', items });
  const received = await fetchListByPin(receipt.pin.toLowerCase());
  assert.deepEqual(received, { regimen: 'FOLFOX4', items });
  const list = addList(createDoctorState(), { pin: receipt.pin, ...received });
  assert.deepEqual(list.items.map(({ id, ...item }) => item), items);
  assert.deepEqual(calls, ['/api/v1/transfers', '/api/v1/transfers/0042']);
  snapshot = { text: toText([items[1]]) };
  assert.deepEqual(await fetchListByPin(receipt.pin), { regimen: '', items: [items[1]] });
});

test('malformed stored data cannot become a partial or demo patient list', () => {
  const malformedStructured = [
    { version: 1, items: [] },
    { version: 1, items: [{ name: '', dosage: '', dosesPerPackage: '1' }] },
    { version: 1, items: [{ name: 'X', dosage: '10 mg', dosesPerPackage: '0' }] },
    { version: 1, items: [{ name: 'X', dosage: '10 mg', dosesPerPackage: '1', schedule: 'x'.repeat(121) }] },
  ];
  for (const value of [null, {}, { text: '' }, { text: 'arbitrary JSON text' },
    ...malformedStructured,
    { text: toText(items) + '\ninvalid row' },
    { text: toText(items).replace('30', '0') },
    { text: toText(items).replace('1-0-0', 'x'.repeat(121)) },
    { text: toText(items).replace(items[0].name, 'x'.repeat(121)) }]) {
    assert.throws(() => parsePatientList(value), /platný formát/);
  }
});

test('invalid PIN does not make a request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected request'); });
  for (const pin of ['../', '12345', 'ABC234', 'ab1234', '123456', '１２３４']) {
    await assert.rejects(fetchListByPin(pin), /4 číslice/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('retrieval errors are readable and never replaced by demo data or retried', async t => {
  for (const [status, message] of [[404, /nebyl nalezen/], [429, /minutu/], [503, /není dostupné/]]) {
    await t.test(String(status), async t => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status }));
      await assert.rejects(fetchListByPin('1234'), message);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
  await t.test('network failure', async t => {
    t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
    await assert.rejects(fetchListByPin('1234'), /připojení/);
  });
  await t.test('invalid JSON', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('{broken'));
    await assert.rejects(fetchListByPin('1234'), /platný seznam/);
  });
});


test('minimal recognized medicines reach the doctor without invented fields', () => {
  const items = [{ name: 'Concor 5 mg', dosage: '', dosesPerPackage: '', schedule: 'Každé pondělí večer 1 tableta' }];
  const payload = { version: 1, items };
  assert.deepEqual(parsePatientList(payload).items, items);
  assert.deepEqual(parsePatientList({ text: toText(items) }).items, items);
  const list = addList(createDoctorState(), { pin: '1234', ...parsePatientList(payload) });
  assert.deepEqual(list.items.map(({ id, ...item }) => item), items);
});


test('doctor uses the storage upload timestamp and never invents a missing or invalid one', async t => {
  for (const timestamp of ['2026-10-17T12:34:56Z', 'not-a-date', null]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ version: 1, regimen: '', items }, {
      headers: timestamp === null ? {} : { 'X-Uploaded-At': timestamp },
    }));
    const received = await fetchListByPin('1234');
    assert.equal(received.sentAt, timestamp === '2026-10-17T12:34:56Z' ? '2026-10-17T12:34:56.000Z' : undefined);
    assert.deepEqual(received.items, items);
    t.mock.restoreAll();
  }
});
