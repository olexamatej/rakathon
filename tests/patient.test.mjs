import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, newId, loadState, saveState, recordSubmission, canSend, toText, STORAGE_KEY } from '../apps/patient-web/public/lists.js';
import { recognizePhoto, sendList } from '../apps/patient-web/public/services.js';

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index],
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}
const medicine = () => ({ id: newId(), name: 'Ukázkové léčivo', dosage: '10 mg', dosesPerPackage: '30' });
const receipt = () => ({ pin: 'ABC234', sentAt: '2026-10-16T12:00:00.000Z' });
const legacyList = (updatedAt, items = [medicine()], sent = null) => ({
  id: newId(), createdAt: updatedAt, updatedAt, items, receipt: sent,
});
const saveLegacy = (storage, list) => storage.setItem('pillgaze:list:v1:' + list.id, JSON.stringify(list));

test('new users start with an empty main list and no submissions', () => {
  assert.deepEqual(loadState(memoryStorage()), { state: { items: [], submissions: [] }, skipped: 0 });
});

test('empty lists cannot be sent; every item must have valid data', () => {
  assert.equal(canSend([]), false);
  assert.equal(canSend([medicine()]), true);
  for (const invalid of ['', '0', '-1', '1.5', 'abc', '1000000']) {
    assert.equal(canSend([{ ...medicine(), dosesPerPackage: invalid }]), false);
  }
  assert.equal(canSend([{ ...medicine(), name: '  ' }]), false);
  assert.equal(canSend([{ ...medicine(), dosage: '' }]), false);
  assert.throws(() => toText([]));
});

test('the single list restores edits, unfinished fields and removals after reload', () => {
  const storage = memoryStorage();
  const state = createState();
  state.items.push(medicine(), medicine());
  saveState(storage, state);
  const restored = loadState(storage).state;
  restored.items[0].name = 'Opravené léčivo';
  restored.items[0].dosage = '';
  restored.items.pop();
  saveState(storage, restored);
  assert.deepEqual(loadState(storage).state, restored);
  assert.equal(storage.length, 1);
  restored.items = [];
  saveState(storage, restored);
  assert.deepEqual(loadState(storage).state.items, []);
});

test('each submission keeps an independent snapshot without clearing the main list', () => {
  const storage = memoryStorage();
  const state = createState();
  state.items.push(medicine());
  const original = structuredClone(state.items);
  const first = recordSubmission(state, state.items, receipt());
  assert.deepEqual(state.items, original);
  state.items[0].name = 'Změna po odeslání';
  const second = recordSubmission(state, state.items, { ...receipt(), pin: 'DEF567' });
  assert.notEqual(first.id, second.id);
  state.items = [];
  saveState(storage, state);
  const restored = loadState(storage).state;
  assert.deepEqual(restored.items, []);
  assert.deepEqual(restored.submissions[1].items, original);
  assert.equal(restored.submissions[0].items[0].name, 'Změna po odeslání');
  assert.equal(restored.submissions[1].pin, first.pin);
});

test('invalid server responses cannot create a submission', () => {
  const state = createState();
  state.items.push(medicine());
  for (const invalid of [null, { pin: '!', sentAt: 'today' }, { pin: 'ABC234' }]) {
    assert.throws(() => recordSubmission(state, state.items, invalid));
  }
  assert.equal(state.submissions.length, 0);
});

test('migration takes the last edited list and keeps old data and sent snapshots', () => {
  const storage = memoryStorage();
  const old = legacyList('2026-10-15T10:00:00.000Z', [medicine()], receipt());
  const current = legacyList('2026-10-16T13:00:00.000Z');
  current.items[0].name = 'Poslední pracovní seznam';
  saveLegacy(storage, current);
  saveLegacy(storage, old);
  const loaded = loadState(storage);
  assert.deepEqual(loaded.state.items, current.items);
  assert.deepEqual(loaded.state.submissions[0].items, old.items);
  assert.equal(loaded.state.submissions.length, 1);
  saveState(storage, loaded.state);
  assert.equal(storage.getItem('pillgaze:list:v1:' + old.id), JSON.stringify(old));
  assert.equal(storage.getItem('pillgaze:list:v1:' + current.id), JSON.stringify(current));
});

test('an empty latest list stays empty and saved state is never reimported from legacy lists', () => {
  const storage = memoryStorage();
  saveLegacy(storage, legacyList('2026-10-14T10:00:00.000Z'));
  saveLegacy(storage, legacyList('2026-10-15T10:00:00.000Z', []));
  const state = loadState(storage).state;
  assert.deepEqual(state.items, []);
  saveState(storage, state);
  saveLegacy(storage, legacyList('2026-10-16T10:00:00.000Z'));
  assert.deepEqual(loadState(storage).state.items, []);
});

test('broken legacy entries are skipped, while broken current state fails without overwriting it', () => {
  const storage = memoryStorage();
  storage.setItem('pillgaze:list:v1:broken-entry', '{broken');
  storage.setItem('another-app', 'preserved');
  assert.equal(loadState(storage).skipped, 1);
  assert.equal(storage.getItem('pillgaze:list:v1:broken-entry'), '{broken');
  storage.setItem(STORAGE_KEY, '{broken current state');
  assert.throws(() => loadState(storage));
  assert.equal(storage.getItem(STORAGE_KEY), '{broken current state');
  assert.equal(storage.getItem('another-app'), 'preserved');
  storage.setItem(STORAGE_KEY, JSON.stringify({ items: [], submissions: [{ pin: 'bad' }] }));
  assert.throws(() => loadState(storage));
});

test('quota errors leave the previously saved list and submissions intact', () => {
  const storage = memoryStorage();
  const state = createState();
  state.items.push(medicine());
  saveState(storage, state);
  const saved = storage.getItem(STORAGE_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  recordSubmission(state, state.items, receipt());
  state.items[0].name = 'Neuložená změna';
  assert.throws(() => saveState(storage, state), /QuotaExceeded/);
  assert.equal(storage.getItem(STORAGE_KEY), saved);
});

test('text handoff includes only requested fields and keeps one row per medicine', () => {
  const text = toText([{ ...medicine(), name: ' Název\nNavíc\tX ', photo: 'private photo', id: 'private-id' }]);
  assert.equal(text, 'Název léčiva\tDosage\tPočet dávek v balení\nNázev Navíc X\t10 mg\t30');
  assert.ok(!text.includes('private'));
});

test('a photo can yield multiple medicines; the demo returns a six-character PIN', async () => {
  const items = await recognizePhoto(new File(['synthetic fixture'], 'fixture.png', { type: 'image/png' }));
  assert.equal(items.length, 2);
  assert.equal(canSend(items), true);
  assert.notEqual(items[0].id, items[1].id);
  const response = await sendList(toText(items));
  assert.match(response.pin, /^[A-Z2-9]{6}$/);
  assert.ok(Number.isFinite(Date.parse(response.sentAt)));
  await assert.rejects(recognizePhoto(new File(['text'], 'test.txt', { type: 'text/plain' })));
  await assert.rejects(sendList(''));
});
