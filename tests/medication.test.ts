import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoHandoff, demoMedications, formatMedications, receiveDemoHandoff, validateMedication } from '../src/medication.ts';

const reviewed = demoMedications.map((medication) => ({ ...medication, reviewed: true }));

test('requires complete single-line fields while preserving fractional and free-text dosing', () => {
  assert.match(validateMedication({ name: ' ', strength: '5 mg', schedule: '1-0-0' })!, /Vyplňte/);
  assert.ok(validateMedication({ name: 'AGEN\nJméno', strength: '5 mg', schedule: '1-0-0' }));
  assert.ok(validateMedication({ name: 'a'.repeat(121), strength: '5 mg', schedule: '1-0-0' }));
  assert.equal(validateMedication({ name: 'Lék', strength: '0,5 mg / 20 mg', schedule: '½ tablety obden' }), null);
});

test('exports only medication fields, no internal ids, review metadata or photo paths', () => {
  assert.equal(formatMedications([reviewed[0]]), 'AGEN\t5 mg\t1-0-0');
  assert.equal(formatMedications([]), '');
  assert.equal(formatMedications(reviewed).split('\n').length, 3);
});

test('refuses an empty, incomplete or unchecked handoff', () => {
  assert.throws(() => createDemoHandoff([], '0123', 0));
  assert.throws(() => createDemoHandoff(demoMedications, '0123', 0));
  assert.throws(() => createDemoHandoff([{ ...reviewed[0], strength: '' }], '0123', 0));
  assert.throws(() => createDemoHandoff(reviewed, '12', 0));
});

test('accepts a four-digit PIN including a leading zero and expires at three minutes', () => {
  const handoff = createDemoHandoff(reviewed, '0123', 1000);
  assert.deepEqual(receiveDemoHandoff(handoff, '0123', 180_999), reviewed);
  assert.throws(() => receiveDemoHandoff(handoff, '9999', 1001));
  assert.throws(() => receiveDemoHandoff(handoff, '123', 1001));
  assert.throws(() => receiveDemoHandoff(handoff, '0123', 181_000));
  assert.throws(() => receiveDemoHandoff(null, '0123', 1001));
});

test('handoff snapshot and clinician edits cannot alter the patient list', () => {
  const patient = reviewed.map((medication) => ({ ...medication }));
  const handoff = createDemoHandoff(patient, '0123', 0);
  patient[0].name = 'Změna po předání';
  const received = receiveDemoHandoff(handoff, '0123', 1);
  assert.equal(received[0].name, 'AGEN');
  received[0].strength = '10 mg';
  assert.equal(patient[0].strength, '5 mg');
  assert.equal(handoff.medications[0].strength, '5 mg');
});
