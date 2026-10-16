import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDoctorState, loadDoctorState, saveDoctorState, addList, validateItem,
  normalizePin, isPin, suklLink, lookupSubstances, applySubstances, formatMedicineLines, formatMedicineInline, HISTORY_LIMIT, DOCTOR_STORAGE_KEY,
} from '../apps/patient-web/public/doctor.js';
import { fetchInteractions } from '../apps/patient-web/public/doctor-services.js';

const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};
const item = (extra = {}) => ({ name: 'Ibalgin', dosage: '200 mg', dosesPerPackage: '12', ...extra });

test('PIN input is normalised and validated like patient PINs', () => {
  assert.equal(normalizePin(' abc-234 '), 'ABC234');
  assert.ok(isPin('ABC234'));
  assert.ok(isPin('0A1BC2'));
  for (const bad of ['ABC23', 'ABC2345', 'ABC23!', 'abc234']) assert.ok(!isPin(bad), bad);
});

test('history is stored locally, newest first, one entry per PIN, and capped', () => {
  const state = createDoctorState();
  const first = addList(state, { pin: 'ABC234', items: [item()], regimen: 'FOLFOX' });
  addList(state, { pin: 'DEF567', items: [item()] });
  const again = addList(state, { pin: 'ABC234', items: [item(), item({ name: 'X' })] });
  assert.deepEqual(state.lists.map(list => list.pin), ['ABC234', 'DEF567']);
  assert.notEqual(first.id, again.id);
  const storage = memory();
  saveDoctorState(storage, state);
  assert.deepEqual(loadDoctorState(storage), state);
  const big = createDoctorState();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) addList(big, { pin: alphabet[i % 32] + alphabet[Math.floor(i / 32)] + 'AAAA', items: [] });
  assert.equal(big.lists.length, HISTORY_LIMIT);
});

test('broken stored history is rejected instead of being overwritten', () => {
  const storage = memory();
  storage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({ lists: [{ id: 'x' }] }));
  assert.throws(() => loadDoctorState(storage));
  assert.equal(memory().getItem(DOCTOR_STORAGE_KEY), null);
  assert.throws(() => saveDoctorState(storage, { lists: [{ id: 'x' }] }));
  assert.throws(() => addList(createDoctorState(), { pin: 'ABC234', items: [{ name: 'x'.repeat(121), dosage: 'a', dosesPerPackage: '1' }] }));
});

test('item edits are validated; SÚKL code and link are optional', () => {
  assert.deepEqual(validateItem(item()), {});
  assert.deepEqual(validateItem(item({ schedule: '1-0-0', suklCode: '0254290' })), {});
  assert.deepEqual(Object.keys(validateItem(item({ name: ' ', dosage: '', dosesPerPackage: '0', suklCode: '12' }))).sort(),
    ['dosage', 'dosesPerPackage', 'name', 'suklCode']);
  assert.equal(suklLink(item()), '');
  assert.deepEqual(validateItem(item({ substances: ['Ibuprofen', 'Warfarin'] })), {});
  assert.match(suklLink(item({ suklCode: '0254290' })), /^https:\/\/prehledy\.sukl\.cz\/.*0254290$/);
  assert.equal(suklLink(item({ suklUrl: 'https://example.test/x', suklCode: '0254290' })), 'https://example.test/x');
  assert.match(suklLink(item({ suklUrl: 'javascript:alert(1)', suklCode: '0254290' })), /^https:\/\/prehledy/);
  assert.equal(suklLink(item({ suklUrl: 'javascript:alert(1)' })), '');
});

test('placeholder interactions return interaction pairs', async () => {
  const items = [item(), item({ name: 'Warfarin' }), item({ name: 'Metformin' })];
  const result = await fetchInteractions(items, { name: 'FOLFOX', drugs: ['Oxaliplatin', 'Fluorouracil'] });
  assert.equal(result.medicines.length, 3); // one card per pair, not per substance
  assert.deepEqual(result.medicines.map(row => [row.a, row.b]).slice(0, 2), [['Ibalgin', 'Warfarin'], ['Ibalgin', 'Metformin']]);
  assert.equal(result.regimen.name, 'FOLFOX');
  assert.equal(result.regimen.interactions.length, 6);
  for (const row of [...result.medicines, ...result.regimen.interactions]) {
    assert.ok(['high', 'moderate', 'low', 'unknown'].includes(row.severity));
    assert.ok(row.summary && row.links.every(link => link.url.startsWith('https://') && link.title && link.description));
  }
  assert.equal((await fetchInteractions(items, null)).regimen, null);
  assert.deepEqual((await fetchInteractions([item()], null)).medicines, []);
});

test('medicine list exports as lines and as one comma-separated line', () => {
  const items = [
    { name: 'HELICID 20 ZENTIVA', dosage: '20 mg', schedule: '1-0-0' },
    { name: 'LIPERTANCE', dosage: '10 mg / 5 mg / 5 mg', schedule: '1x' },
    { name: 'Metformin', dosage: '500 mg' },
  ];
  assert.equal(formatMedicineLines(items), [
    'HELICID 20 ZENTIVA   20 mg                 1-0-0',
    'LIPERTANCE           10 mg / 5 mg / 5 mg   1x',
    'Metformin            500 mg                -',
  ].join('\n'));
  assert.equal(formatMedicineLines([{ name: 'X', dosage: '' }]), 'X   -   -');
  assert.equal(formatMedicineInline(items), 'HELICID 20 ZENTIVA 20 mg 1-0-0, LIPERTANCE 10 mg / 5 mg / 5 mg 1x, Metformin 500 mg');
  assert.equal(formatMedicineLines([]), '');
});

test('active substances are mapped from the SÚKL catalogue by medicine name', () => {
  const map = { IBALGIN: ['Ibuprofen'], 'IBALGIN BABY': ['Ibuprofen'], 'WARFARIN ORION': ['Sodná sůl warfarinu'], LOZAP: ['Draselná sůl losartanu'] };
  assert.deepEqual(lookupSubstances(map, 'ibalgin'), ['Ibuprofen']);
  assert.deepEqual(lookupSubstances(map, '  Warfarin  Orion '), ['Sodná sůl warfarinu']);
  assert.deepEqual(lookupSubstances(map, 'IBALGIN 400 mg'), ['Ibuprofen']); // longest name prefix
  assert.deepEqual(lookupSubstances(map, 'IBALGIN BABY 100 mg'), ['Ibuprofen']);
  assert.equal(lookupSubstances(map, 'Neznámý lék'), undefined);
  assert.equal(lookupSubstances(map, ''), undefined);
  const items = [{ name: 'LOZAP' }, { name: 'IBALGIN', substances: ['Z API'] }, { name: 'Nic' }];
  assert.ok(applySubstances(items, map));
  assert.deepEqual(items.map(item => item.substances), [['Draselná sůl losartanu'], ['Z API'], undefined]); // API value kept
  assert.ok(applySubstances(items, map, { replace: true }));
  assert.deepEqual(items.map(item => item.substances), [['Draselná sůl losartanu'], ['Ibuprofen'], undefined]);
  items[0].name = 'Nic';
  assert.ok(applySubstances([items[0]], map, { replace: true }));
  assert.equal(items[0].substances, undefined); // stale substances are dropped for an unknown name
});
