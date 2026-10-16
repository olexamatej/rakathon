import { normalizePin, isPin, validateItem } from './doctor.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Read the same tab-separated snapshot uploaded by the patient, including older PINs.
export function parsePatientList(blob) {
  const invalid = () => { throw new Error('Uložený záznam nemá platný formát seznamu léčiv.'); };
  if (!blob || typeof blob.text !== 'string') return invalid();
  const rows = blob.text.split(/\r?\n/);
  let regimen = '';
  if (rows[0].startsWith('Režim onkologické léčby\t')) {
    const cells = rows.shift().split('\t');
    if (cells.length !== 2 || cells[1].length > 200) return invalid();
    regimen = cells[1];
  }
  const header = rows.shift();
  const base = 'Název léčiva\tDosage\tPočet dávek v balení';
  if (header !== base && header !== base + '\tKdy') return invalid();
  const withSchedule = header.endsWith('\tKdy');
  if (!rows.length) return invalid();
  const items = rows.map(row => {
    const cells = row.split('\t');
    if (cells.length !== (withSchedule ? 4 : 3)) return invalid();
    const [name, dosage, dosesPerPackage, schedule] = cells;
    const item = { name, dosage, dosesPerPackage, ...(schedule ? { schedule } : {}) };
    if (name.length > 120 || dosage.length > 120 || Object.keys(validateItem(item)).length) return invalid();
    return item;
  });
  return { regimen, items };
}

export async function fetchListByPin(value) {
  const pin = normalizePin(value);
  if (!isPin(pin)) throw new Error('PIN musí mít 6 znaků.');
  let response;
  try {
    response = await fetch(`/api/v1/transfers/${encodeURIComponent(pin)}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit',
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Seznam se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.');
  }
  if (response.status === 404) throw new Error('Pro tento PIN nebyl nalezen žádný seznam. Zkontrolujte PIN od pacienta.');
  if (response.status === 429) throw new Error('Příliš mnoho pokusů. Vyčkejte alespoň minutu.');
  if (!response.ok) throw new Error('Úložiště nyní není dostupné. Zkuste to později.');
  let blob;
  try { blob = await response.json(); }
  catch { throw new Error('Úložiště nevrátilo platný seznam léčiv.'); }
  return parsePatientList(blob);
}

let suklNames;

// Medicine names from the SÚKL catalogue for autocomplete; resolves to [] when unavailable.
export function loadSuklNames() {
  suklNames ??= fetch('/sukl-names.json').then(response => {
    if (!response.ok) throw new Error('Katalog léčiv není dostupný.');
    return response.json();
  }).catch(() => { suklNames = undefined; return []; });
  return suklNames;
}

let suklSubstances;

// Active substances by exact SÚKL medicine name; resolves to {} when unavailable.
export function loadSuklSubstances() {
  suklSubstances ??= fetch('/sukl-substances.json').then(response => {
    if (!response.ok) throw new Error('Katalog léčiv není dostupný.');
    return response.json();
  }).catch(() => { suklSubstances = undefined; return {}; });
  return suklSubstances;
}

let regimenDrugs;

// Drugs of each oncology regimen by exact regimen name; resolves to {} when unavailable.
export function loadRegimenDrugs() {
  regimenDrugs ??= fetch('/regimen-drugs.json').then(response => {
    if (!response.ok) throw new Error('Látky režimů nejsou dostupné.');
    return response.json();
  }).catch(() => { regimenDrugs = undefined; return {}; });
  return regimenDrugs;
}

// TODO(server): load interactions. `regimen` is { name, drugs: [substance] } or null. Resolve to
// { checkedAt, medicines: [interaction], regimen: { name, interactions: [interaction] } | null }
// where `medicines` are interactions among the patient's medicines and `regimen.interactions` are
// interactions of every regimen drug with the patient's medicines, and an interaction is
// { a, b, severity: 'high' | 'moderate' | 'low' | 'unknown', summary: 'a few words',
//   links: [{ title, description, url }] } (https pages with a longer text; each link carries its own `description` of what that page says).
// shortcut: placeholder rows with made-up severities and example links; no real data is queried.
const SAMPLE = [
  {
    severity: 'high', summary: 'Riziko krvácení',
    links: [
      { title: 'Souhrn údajů o přípravku', description: 'Souběžné podávání výrazně zvyšuje riziko závažného krvácení včetně nitrolebního; nutná častá kontrola INR a krevního obrazu.', url: 'https://example.org/spc' },
      { title: 'Klinické doporučení', description: 'Doporučený postup při souběhu: snížení dávky, kontrola laboratorních hodnot po 3–5 dnech a poučení pacienta o varovných příznacích.', url: 'https://example.org/guidance' },
    ],
  },
  {
    severity: 'moderate', summary: 'Zátěž pro játra',
    links: [
      { title: 'Databáze interakcí', description: 'Možné zvýšení hladin jaterních enzymů a zhoršení funkce ledvin při dlouhodobém užívání.', url: 'https://example.org/database' },
    ],
  },
  {
    severity: 'low', summary: 'Mírné snížení účinku',
    links: [{ title: 'Přehled studií', description: 'Klinický význam je malý, léčbu není nutné upravovat.', url: 'https://example.org/studies' }],
  },
  { severity: 'unknown', summary: 'Bez dostupných údajů', links: [] },
];

const placeholderInteraction = (a, b, index) => ({ a, b, ...structuredClone(SAMPLE[index % SAMPLE.length]) });

export async function fetchInteractions(items, regimen) {
  await wait(900);
  const names = items.map(item => item.name);
  let index = 0;
  const medicines = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) medicines.push(placeholderInteraction(names[i], names[j], index++));
  }
  return {
    checkedAt: new Date().toISOString(),
    medicines,
    regimen: regimen?.name?.trim() ? {
      name: regimen.name.trim(),
      interactions: (regimen.drugs || []).flatMap(drug => names.map(name => placeholderInteraction(drug, name, index++))),
    } : null,
  };
}
