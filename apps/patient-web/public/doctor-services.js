// Placeholders for the doctor API; replace the bodies, keep the signatures.

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// TODO(server): GET the list stored under this PIN. Resolve to { sentAt, regimen, items } where each
// item is { name, dosage, dosesPerPackage, schedule?, suklCode?, suklUrl? }; reject with a message
// the doctor can read when the PIN is unknown or expired.
// shortcut: the same fixed demo list for every PIN; the real API decides when a PIN is unknown.
export async function fetchListByPin(pin) {
  await wait(600);
  return {
    sentAt: new Date().toISOString(),
    regimen: 'FOLFOX4',
    items: [
      { name: 'WARFARIN ORION', dosage: '3 mg', dosesPerPackage: '100', schedule: '0-0-1', suklCode: '0094113' },
      { name: 'IBALGIN', dosage: '200 mg', dosesPerPackage: '12', schedule: '3x', suklCode: '0254290' },
      { name: 'Metformin', dosage: '500 mg', dosesPerPackage: '30' },
    ],
  };
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
