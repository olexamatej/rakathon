import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type CatalogEntry = {
  suklCode: string;
  name: string;
  strength: string | null;
  activeSubstances: { code: string; name: string | null; inn: string | null }[];
  dosageForm: string | null;
  packSize: string | null;
  registrationStatus: string;
};

type CatalogMetadata = {
  fileSha256: string;
  recordCount: number;
  distinctNameCount: number;
  validation: { uniqueSuklCodes: number; missingStrength: number; emptyActiveSubstances: number };
  registrationStatusCounts: Record<string, number>;
  registrationStatuses: Record<string, string>;
};

// Public reference data only: never load patient documents or photographs here.
const bytes = readFileSync(new URL('../data/sukl/medications.json', import.meta.url));
const catalog: CatalogEntry[] = JSON.parse(bytes.toString('utf8'));
const metadata: CatalogMetadata = JSON.parse(readFileSync(new URL('../data/sukl/metadata.json', import.meta.url), 'utf8'));

test('public SUKL snapshot matches its checksum and published record count', () => {
  assert.ok(Array.isArray(catalog), 'Catalog must be a JSON array');
  assert.ok(catalog.length > 0, 'Catalog must not be empty');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.fileSha256);
  assert.equal(catalog.length, metadata.recordCount);
});

test('public SUKL snapshot preserves string identifiers and metadata summaries', () => {
  const codes = new Set<string>();
  const names = new Set<string>();
  const statuses: Record<string, number> = {};
  let missingStrength = 0;
  let emptyActiveSubstances = 0;
  const nullableText = (value: unknown) => value === null || typeof value === 'string';

  for (const [index, entry] of catalog.entries()) {
    const message = `Invalid catalog structure at index ${index}`;
    assert.ok(entry !== null && typeof entry === 'object', message);
    assert.ok(typeof entry.suklCode === 'string' && /^\d+$/.test(entry.suklCode), message);
    assert.ok(typeof entry.name === 'string' && entry.name.length > 0, message);
    assert.ok(nullableText(entry.strength) && nullableText(entry.dosageForm) && nullableText(entry.packSize), message);
    assert.ok(Array.isArray(entry.activeSubstances), message);
    for (const substance of entry.activeSubstances) {
      assert.ok(substance !== null && typeof substance === 'object', message);
      assert.ok(typeof substance.code === 'string' && /^\d+$/.test(substance.code), message);
      assert.ok(nullableText(substance.name) && nullableText(substance.inn), message);
    }
    assert.ok(typeof entry.registrationStatus === 'string' && Object.hasOwn(metadata.registrationStatuses, entry.registrationStatus), message);
    codes.add(entry.suklCode);
    names.add(entry.name);
    statuses[entry.registrationStatus] = (statuses[entry.registrationStatus] ?? 0) + 1;
    if (entry.strength === null) missingStrength += 1;
    if (entry.activeSubstances.length === 0) emptyActiveSubstances += 1;
  }

  assert.equal(codes.size, catalog.length, 'SUKL codes must be unique');
  assert.equal(codes.size, metadata.validation.uniqueSuklCodes);
  assert.equal(names.size, metadata.distinctNameCount);
  assert.equal(missingStrength, metadata.validation.missingStrength);
  assert.equal(emptyActiveSubstances, metadata.validation.emptyActiveSubstances);
  assert.deepEqual(statuses, metadata.registrationStatusCounts);
});
