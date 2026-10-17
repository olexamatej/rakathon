import { normalizePin, isPin, validateItem } from './doctor.js';
import { buildTransferPayload } from './lists.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Read the structured patient payload, while keeping older tab-separated PINs readable.
export function parsePatientList(blob) {
  const invalid = () => { throw new Error('Uložený záznam nemá platný formát seznamu léčiv.'); };
  // Current patient uploads are structured JSON. Keep the text parser below for existing PINs.
  if (blob && blob.version === 1 && Array.isArray(blob.items)) {
    try {
      const { regimen, items } = buildTransferPayload(blob.items, blob.regimen ?? '');
      return { regimen, items };
    } catch { return invalid(); }
  }
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
  const list = parsePatientList(blob);
  const uploadedAt = response.headers.get('X-Uploaded-At');
  if (uploadedAt && Number.isFinite(Date.parse(uploadedAt))) list.sentAt = new Date(uploadedAt).toISOString();
  return list;
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

// Interactions come from the interaction engine (interaction-engine/openapi.yaml) through the
// same-origin proxy /api/interaction-checks. The engine takes plain drug names and is asynchronous:
// the same POST is repeated until it stops answering 202.
const ENGINE_URL = '/api/interaction-checks';
const RESEARCH_URL = '/api/interaction-research';
const MAX_INPUTS = 50;
const POLL_TIMEOUT_MS = 180_000;

// Medicines first, then the regimen's drugs; `role` tells the two apart when reading the response.
export function buildInteractionRequest(items, regimen) {
  const inputs = [
    ...items.map(item => ({ name: item.name.trim(), role: 'medicine' })),
    ...(regimen?.drugs || []).map(name => ({ name: name.trim(), role: 'regimen' })),
  ].filter(input => input.name);
  return { inputs, drugs: inputs.map(input => input.name) };
}

const order = ['contraindicated', 'major', 'moderate', 'minor', 'unknown'];

// Turns an engine response into what the page shows:
// { checkedAt, medicines: [interaction], regimen: { name, interactions } | null, unresolved, coverage }
// where interaction = { a, b, names, severity, findings }; a/b are the names the doctor sees and
// `names` the engine's canonical drug names (what the web research is asked about).
export function parseInteractionResponse(response, inputs, regimenName = '') {
  const drugs = new Map(response.drugs.map(drug => [drug.id, drug]));
  const roles = new Map(); // drugId -> { medicine, regimen, label }
  const unresolved = [];
  for (const resolution of response.resolutions) {
    const input = inputs[resolution.inputIndex];
    if (!input) continue;
    if (resolution.status !== 'resolved') {
      unresolved.push({ name: input.name, role: input.role, message: resolution.message, candidates: resolution.candidates || [] });
      continue;
    }
    const entry = roles.get(resolution.drugId) ?? { medicine: false, regimen: false, label: input.name };
    if (input.role === 'medicine' && !entry.medicine) entry.label = input.name; // the doctor's own medicine name wins
    entry[input.role] = true;
    roles.set(resolution.drugId, entry);
  }
  const medicines = [];
  const regimenInteractions = [];
  for (const interaction of response.interactions) {
    const [x, y] = interaction.drugIds.map(id => roles.get(id));
    if (!x || !y || !drugs.has(interaction.drugIds[0])) continue;
    const row = { a: x.label, b: y.label, names: interaction.drugIds.map(id => drugs.get(id).name), severity: order.includes(interaction.severity) ? interaction.severity : 'unknown', findings: interaction.findings };
    if (x.medicine && y.medicine) medicines.push(row);
    else if ((x.regimen && y.medicine) || (x.medicine && y.regimen)) regimenInteractions.push(row);
    // two drugs that only belong to the regimen are meant to be taken together: not shown
  }
  const rank = row => order.indexOf(row.severity);
  return {
    checkedAt: response.checkedAt,
    medicines: medicines.sort((p, q) => rank(p) - rank(q)),
    regimen: regimenName.trim() ? { name: regimenName.trim(), interactions: regimenInteractions.sort((p, q) => rank(p) - rank(q)) } : null,
    unresolved,
    coverage: response.coverage,
  };
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }, { once: true });
});

// POSTs the same body until the engine stops answering 202 (queued/running). `pollMs` overrides the
// delay the engine suggests (tests). Resolves to the parsed 200 body; problems become Czech Errors.
async function postAndPoll(url, body, { signal, pollMs, failure }) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    let response;
    try {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('Službu pro kontrolu interakcí se nepodařilo zavolat.');
    }
    if (response.status === 202) {
      if (Date.now() > deadline) throw new Error('Načítání trvá příliš dlouho. Zkuste to znovu.');
      const suggested = Number(response.headers.get('Retry-After'));
      await sleep(pollMs ?? (Number.isFinite(suggested) && suggested > 0 ? Math.min(suggested, 5) * 1000 : 2000), signal);
      continue;
    }
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.detail || failure);
    }
    return response.json();
  }
}

// Loads interactions among the medicines and between the regimen's drugs and the medicines.
// `regimen` is { name, drugs } or null.
export async function fetchInteractions(items, regimen, options = {}) {
  const { inputs, drugs } = buildInteractionRequest(items, regimen);
  if (drugs.length > MAX_INPUTS) throw new Error(`Seznam má příliš mnoho látek (nejvýše ${MAX_INPUTS} léčiv a látek režimu).`);
  if (drugs.length < 2) {
    return { checkedAt: new Date().toISOString(), medicines: [], regimen: regimen?.name?.trim() ? { name: regimen.name.trim(), interactions: [] } : null, unresolved: [], coverage: null };
  }
  const response = await postAndPoll(ENGINE_URL, { drugs }, { ...options, failure: 'Interakce se nepodařilo načíst.' });
  return parseInteractionResponse(response, inputs, regimen?.name || '');
}

// Sites the research agent can search, as accepted by /interaction-research.
export const RESEARCH_SITES = ['drugs.com', 'rxlist.com', 'reference.medscape.com'];

// Asks an agent to find a page dedicated to exactly this pair on one site. Resolves to
// { status: 'found' | 'not_found' | 'inconclusive', url: https url | null, summary, site, checkedAt }.
// It runs a live web search, so it can take a minute; call it on demand only.
export async function researchInteraction(drugs, site, options = {}) {
  const result = await postAndPoll(RESEARCH_URL, { drugs, site }, { ...options, failure: 'Hledání podrobností se nepodařilo.' });
  const valid = ['found', 'not_found', 'inconclusive'].includes(result?.status) && typeof result.summary === 'string';
  if (!valid) throw new Error('Služba vrátila neplatnou odpověď.');
  return { ...result, url: result.status === 'found' && /^https:\/\//.test(result.url || '') ? result.url : null };
}
