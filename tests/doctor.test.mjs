import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDoctorState, loadDoctorState, saveDoctorState, addList, validateItem,
  normalizePin, isPin, suklLink, lookupSubstances, applySubstances, formatMedicineLines, formatMedicineInline, HISTORY_LIMIT, DOCTOR_STORAGE_KEY,
} from '../apps/patient-web/public/doctor.js';
import { fetchInteractions, researchInteraction, RESEARCH_SITES, buildInteractionRequest, parseInteractionResponse } from '../apps/patient-web/public/doctor-services.js';

const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};
const item = (extra = {}) => ({ name: 'Ibalgin', dosage: '200 mg', dosesPerPackage: '12', ...extra });

test('PIN input is normalised and validated like patient PINs', () => {
  assert.equal(normalizePin(' 00-42 '), '0042');
  assert.ok(isPin('1234'));
  assert.ok(isPin('0102'));
  for (const bad of ['ABC234', '123', '12345', '12a4', '１２３４', '1234\n', 1234, null]) assert.ok(!isPin(bad), bad);
});

test('history is stored locally, newest first, one entry per PIN, and capped', () => {
  const state = createDoctorState();
  const first = addList(state, { pin: '1234', items: [item()], regimen: 'FOLFOX' });
  addList(state, { pin: '5678', items: [item()] });
  const again = addList(state, { pin: '1234', items: [item(), item({ name: 'X' })] });
  assert.deepEqual(state.lists.map(list => list.pin), ['1234', '5678']);
  assert.notEqual(first.id, again.id);
  const storage = memory();
  saveDoctorState(storage, state);
  assert.deepEqual(loadDoctorState(storage), state);
  const big = createDoctorState();
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) addList(big, { pin: String(i).padStart(4, '0'), items: [] });
  assert.equal(big.lists.length, HISTORY_LIMIT);
});

test('broken stored history is rejected instead of being overwritten', () => {
  const storage = memory();
  storage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({ lists: [{ id: 'x' }] }));
  assert.throws(() => loadDoctorState(storage));
  assert.equal(memory().getItem(DOCTOR_STORAGE_KEY), null);
  assert.throws(() => saveDoctorState(storage, { lists: [{ id: 'x' }] }));
  assert.throws(() => addList(createDoctorState(), { pin: '1234', items: [{ name: 'x'.repeat(121), dosage: 'a', dosesPerPackage: '1' }] }));
});

test('item edits are validated; SÚKL code and link are optional', () => {
  assert.deepEqual(validateItem(item()), {});
  assert.deepEqual(validateItem(item({ dosage: '', dosesPerPackage: '', schedule: 'Každé pondělí večer 1 tableta' })), {});
  assert.deepEqual(validateItem(item({ schedule: '1-0-0', suklCode: '0254290' })), {});
  assert.deepEqual(Object.keys(validateItem(item({ name: ' ', dosage: '', dosesPerPackage: '0', suklCode: '12' }))).sort(),
    ['dosesPerPackage', 'name', 'suklCode']);
  assert.equal(suklLink(item()), '');
  assert.deepEqual(validateItem(item({ substances: ['Ibuprofen', 'Warfarin'] })), {});
  assert.match(suklLink(item({ suklCode: '0254290' })), /^https:\/\/prehledy\.sukl\.cz\/.*0254290$/);
  assert.equal(suklLink(item({ suklUrl: 'https://example.test/x', suklCode: '0254290' })), 'https://example.test/x');
  assert.match(suklLink(item({ suklUrl: 'javascript:alert(1)', suklCode: '0254290' })), /^https:\/\/prehledy/);
  assert.equal(suklLink(item({ suklUrl: 'javascript:alert(1)' })), '');
});

test('placeholder interactions return interaction pairs', async () => {
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

const finding = { summary: 'Zvýšené riziko krvácení.', severity: 'major', clinicalEffects: ['Krvácení'], recommendations: [{ action: 'monitor', description: 'Sledovat INR.' }], evidence: { level: 'established', references: [] } };
const engine = (interactions, resolutions) => ({
  status: 'partial', checkedAt: '2026-10-16T12:00:00Z',
  resolutions,
  drugs: [{ id: 'drug-1', name: 'warfarin', activeIngredients: ['warfarin'] }, { id: 'drug-2', name: 'ibuprofen', activeIngredients: ['ibuprofen'] }, { id: 'drug-3', name: 'fluorouracil', activeIngredients: ['fluorouracil'] }],
  coverage: { uniqueResolvedDrugs: 3, evaluatedPairs: 3, interactingPairs: interactions.length },
  interactions,
});

test('interaction request sends medicine names, then regimen drugs, and skips blanks', () => {
  const request = buildInteractionRequest([item({ name: ' WARFARIN ORION ' }), item({ name: '' }), item({ name: 'IBALGIN' })], { name: 'FOLFOX4', drugs: ['Fluorouracil', 'Oxaliplatin'] });
  assert.deepEqual(request.drugs, ['WARFARIN ORION', 'IBALGIN', 'Fluorouracil', 'Oxaliplatin']);
  assert.deepEqual(request.inputs.map(input => input.role), ['medicine', 'medicine', 'regimen', 'regimen']);
});

test('engine response is split into medicine and regimen interactions with unresolved names', () => {
  const { inputs } = buildInteractionRequest([item({ name: 'WARFARIN ORION' }), item({ name: 'IBALGIN' }), item({ name: 'Neznámý' })], { name: 'FOLFOX4', drugs: ['Fluorouracil', 'Oxaliplatin'] });
  const response = engine(
    [
      { drugIds: ['drug-1', 'drug-2'], severity: 'major', findings: [finding] },
      { drugIds: ['drug-1', 'drug-3'], severity: 'moderate', findings: [{ ...finding, severity: 'moderate' }] },
      { drugIds: ['drug-2', 'drug-3'], severity: 'contraindicated', findings: [finding] },
    ],
    [
      { inputIndex: 0, inputName: 'WARFARIN ORION', status: 'resolved', drugId: 'drug-1' },
      { inputIndex: 1, inputName: 'IBALGIN', status: 'resolved', drugId: 'drug-2' },
      { inputIndex: 2, inputName: 'Neznámý', status: 'unrecognized', message: 'Nebylo nalezeno.', candidates: [] },
      { inputIndex: 3, inputName: 'Fluorouracil', status: 'resolved', drugId: 'drug-3' },
      { inputIndex: 4, inputName: 'Oxaliplatin', status: 'unrecognized', message: 'Nebylo nalezeno.', candidates: ['Oxaliplatin Accord'] },
    ],
  );
  const result = parseInteractionResponse(response, inputs, 'FOLFOX4');
  assert.deepEqual(result.medicines.map(row => [row.a, row.b, row.severity]), [['WARFARIN ORION', 'IBALGIN', 'major']]);
  assert.deepEqual(result.medicines[0].names, ['warfarin', 'ibuprofen']); // canonical names, used for web research
  assert.deepEqual(result.regimen.interactions.map(row => [row.a, row.b, row.severity]),
    [['IBALGIN', 'Fluorouracil', 'contraindicated'], ['WARFARIN ORION', 'Fluorouracil', 'moderate']]); // worst first
  assert.deepEqual(result.unresolved.map(entry => [entry.name, entry.candidates]), [['Neznámý', []], ['Oxaliplatin', ['Oxaliplatin Accord']]]);
  assert.equal(result.regimen.name, 'FOLFOX4');
  assert.equal(parseInteractionResponse(response, inputs, '').regimen, null);
});

test('fetchInteractions polls until the engine answers and reports problems in Czech', async () => {
  const original = globalThis.fetch;
  const items = [item({ name: 'warfarin' }), item({ name: 'ibuprofen' })];
  const body = engine([{ drugIds: ['drug-1', 'drug-2'], severity: 'major', findings: [finding] }], [
    { inputIndex: 0, inputName: 'warfarin', status: 'resolved', drugId: 'drug-1' },
    { inputIndex: 1, inputName: 'ibuprofen', status: 'resolved', drugId: 'drug-2' },
  ]);
  try {
    const calls = [];
    const replies = [new Response('{"state":"queued"}', { status: 202 }), new Response('{"state":"running"}', { status: 202 }), new Response(JSON.stringify(body), { status: 200 })];
    globalThis.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return replies.shift(); };
    const result = await fetchInteractions(items, null, { pollMs: 0 });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], ['/api/interaction-checks', { drugs: ['warfarin', 'ibuprofen'] }]);
    assert.equal(result.medicines.length, 1);

    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Služba je dočasně nedostupná.' }), { status: 503 });
    await assert.rejects(fetchInteractions(items, null, { pollMs: 0 }), /dočasně nedostupná/);
    globalThis.fetch = async () => { throw new TypeError('network'); };
    await assert.rejects(fetchInteractions(items, null, { pollMs: 0 }), /nepodařilo zavolat/);

    globalThis.fetch = async () => { throw new Error('must not be called'); };
    const none = await fetchInteractions([item({ name: 'jen jedno' })], null);
    assert.deepEqual(none.medicines, []); // fewer than two drugs: nothing to check
  } finally {
    globalThis.fetch = original;
  }
});

test('web research polls the engine and keeps only valid HTTPS result pages', async () => {
  assert.deepEqual(RESEARCH_SITES, ['drugs.com', 'rxlist.com', 'reference.medscape.com']);
  const original = globalThis.fetch;
  try {
    const calls = [];
    const replies = [
      new Response('{"state":"running"}', { status: 202 }),
      new Response(JSON.stringify({ drugs: ['warfarin', 'ibuprofen'], site: 'drugs.com', checkedAt: '2026-10-16T12:00:00Z', status: 'found', url: 'https://www.drugs.com/drug-interactions/ibuprofen-with-warfarin.html', summary: 'Zvyšuje riziko krvácení.' }), { status: 200 }),
    ];
    globalThis.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return replies.shift(); };
    const found = await researchInteraction(['warfarin', 'ibuprofen'], 'drugs.com', { pollMs: 0 });
    assert.deepEqual(calls[0], ['/api/interaction-research', { drugs: ['warfarin', 'ibuprofen'], site: 'drugs.com' }]);
    assert.equal(calls.length, 2);
    assert.equal(found.status, 'found');
    assert.match(found.url, /^https:\/\/www\.drugs\.com\//);

    const reply = body => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 }); };
    reply({ status: 'not_found', url: null, summary: 'Nenalezeno.' });
    assert.equal((await researchInteraction(['a', 'b'], 'rxlist.com')).url, null);
    reply({ status: 'found', url: 'javascript:alert(1)', summary: 'x' });
    assert.equal((await researchInteraction(['a', 'b'], 'rxlist.com')).url, null);
    reply({ status: 'weird' });
    await assert.rejects(researchInteraction(['a', 'b'], 'rxlist.com'), /neplatnou odpověď/);
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Neplatná dvojice.' }), { status: 400 });
    await assert.rejects(researchInteraction(['a', 'b'], 'rxlist.com'), /Neplatná dvojice/);
  } finally {
    globalThis.fetch = original;
  }
});


test('legacy doctor history is preserved separately and does not block four-digit records', () => {
  const storage = memory();
  const original = JSON.stringify({ lists: [{ pin: 'ABC234' }] });
  storage.setItem('pillgaze:doctor:v1', original);
  const state = loadDoctorState(storage);
  assert.deepEqual(state, createDoctorState());
  addList(state, { pin: '0042', items: [item()] });
  saveDoctorState(storage, state);
  assert.equal(storage.getItem('pillgaze:doctor:v1'), original);
  assert.equal(loadDoctorState(storage).lists[0].pin, '0042');
});
