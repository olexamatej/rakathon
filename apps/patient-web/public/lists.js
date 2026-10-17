// PINs are strings: 0042 and 42 must never identify the same record.
export const isPin = value => typeof value === 'string' && value.length === 4 && /^[0-9]{4}$/.test(value);
export const isOwnerToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
// Allow pasted visual separators, but never truncate or remove letters from a code.
export const normalizePin = value => String(value).replace(/[\s-]/g, '');

export const STORAGE_KEY = 'pillgaze:patient:v3';
const PREVIOUS_STORAGE_KEY = 'pillgaze:patient:v2';
const LEGACY_PREFIX = 'pillgaze:list:v1:';

export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}

export function createState() {
  return { items: [], submissions: [] };
}

const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isId = value => typeof value === 'string' && /^[a-z0-9-]{8,80}$/.test(value);
const isText = (value, limit) => typeof value === 'string' && value.length <= limit;
const isReceipt = (value, legacy = false) => value && (isPin(value.pin)
  || (legacy && typeof value.pin === 'string' && /^[A-Z0-9]{6}$/.test(value.pin))) && isDate(value.sentAt);
const isItems = items => Array.isArray(items)
  && items.every(item => item && isId(item.id)
    && isText(item.name, 120) && isText(item.dosage, 120)
    && (item.schedule === undefined || isText(item.schedule, 120))
    && isText(item.dosesPerPackage, 6))
  && new Set(items.map(item => item.id)).size === items.length;
const isRegimen = value => value === undefined || isText(value, 200);
const isSubmission = (value, legacy = false) => value && isId(value.id) && isReceipt(value, legacy)
  && isItems(value.items) && canSend(value.items) && isRegimen(value.regimen)
  && (value.ownerToken === undefined || isOwnerToken(value.ownerToken))
  && (value.expiresAt === undefined || isDate(value.expiresAt))
  && (value.expired === undefined || typeof value.expired === 'boolean');
const isState = (state, legacy = false) => state && isItems(state.items) && isRegimen(state.regimen) && Array.isArray(state.submissions)
  && (state.invalidatedDraft === undefined || (state.invalidatedDraft && isItems(state.invalidatedDraft.items) && isRegimen(state.invalidatedDraft.regimen)))
  && state.submissions.every(entry => isSubmission(entry, legacy))
  && new Set(state.submissions.map(entry => entry.id)).size === state.submissions.length;

export function loadState(storage) {
  const current = storage.getItem(STORAGE_KEY);
  const saved = current ?? storage.getItem(PREVIOUS_STORAGE_KEY);
  if (saved !== null) {
    const state = JSON.parse(saved);
    if (!isState(state, current === null)) throw new Error('Neplatný formát uloženého seznamu.');
    // Migrate previous patient history to its latest PIN, preserving the draft.
    state.submissions = state.submissions.slice(0, 1);
    return migratePin(state);
  }

  // Keep legacy records intact; migrate the most recently edited list once.
  const legacy = [];
  let skipped = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(LEGACY_PREFIX)) continue;
    try {
      const list = JSON.parse(storage.getItem(key));
      if (!list || !isId(list.id) || key !== LEGACY_PREFIX + list.id
        || !isDate(list.updatedAt) || !isItems(list.items)
        || !(list.receipt === null || (isReceipt(list.receipt, true) && canSend(list.items)))) {
        throw new Error('Invalid legacy list');
      }
      legacy.push(list);
    } catch {
      skipped++;
    }
  }
  legacy.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const state = {
    items: structuredClone(legacy[0]?.items || []),
    submissions: legacy.filter(list => list.receipt).map(list => ({
      id: list.id, pin: list.receipt.pin, sentAt: list.receipt.sentAt, items: list.items,
    })).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)).slice(0, 1),
  };
  return { ...migratePin(state), skipped };
}

// Preserve old storage keys and recover the last saved list for a fresh four-digit upload.
function migratePin(state) {
  const previous = state.submissions[0];
  if (!previous || isPin(previous.pin)) return { state, skipped: 0 };
  if (state.items.length === 0) {
    state.items = structuredClone(previous.items);
    state.regimen = previous.regimen || '';
  }
  state.submissions = [];
  return { state, skipped: 0, pinMigrated: true };
}

export function saveState(storage, state) {
  if (!isState(state)) throw new Error('Neplatný formát seznamu.');
  const serialized = JSON.stringify({ ...state, submissions: state.submissions.slice(0, 1) });
  if (storage.getItem(STORAGE_KEY) !== serialized) storage.setItem(STORAGE_KEY, serialized);
}

export function recordSubmission(state, items, receipt, regimen = '') {
  if (state.submissions[0]) {
    return updateSubmission(state, state.submissions[0].id, items, receipt, regimen);
  }
  return replaceSubmission(state, items, receipt, regimen);
}

// A confirmed fresh POST replaces the receipt, without discarding the draft.
export function replaceSubmission(state, items, receipt, regimen = '') {
  const entry = { id: newId(), pin: receipt?.pin, sentAt: receipt?.sentAt, items: structuredClone(items) };
  copyValidity(entry, receipt);
  if (regimen.trim()) entry.regimen = regimen.trim();
  if (!isSubmission(entry)) throw new Error('Neplatná odpověď při odeslání seznamu.');
  state.submissions = [entry];
  return entry;
}

// Keep the invalid receipt and any unsent edits locally, but start fresh photo input.
export function invalidateSubmission(state, preserveActiveDraft = false) {
  const entry = state.submissions[0];
  if (!entry) return;
  const alreadyExpired = entry.expired;
  entry.expired = true;
  if (preserveActiveDraft || alreadyExpired) return;
  state.invalidatedDraft = { items: structuredClone(state.items), regimen: state.regimen || '' };
  state.items = [];
  state.regimen = '';
}

// Replace the local snapshot only after the server confirms the same PIN was saved.
export function updateSubmission(state, id, items, receipt, regimen = '') {
  const previous = state.submissions.find(entry => entry.id === id);
  const entry = { id, pin: receipt?.pin, sentAt: receipt?.sentAt, items: structuredClone(items) };
  copyValidity(entry, receipt);
  if (regimen.trim()) entry.regimen = regimen.trim();
  if (!previous || previous.pin !== entry.pin || !isSubmission(entry)) {
    throw new Error('Neplatná odpověď při uložení seznamu.');
  }
  state.submissions = [entry];
  return entry;
}

function copyValidity(entry, receipt) {
  if (receipt?.ownerToken !== undefined) entry.ownerToken = receipt.ownerToken;
  if (receipt?.expiresAt !== undefined) entry.expiresAt = receipt.expiresAt;
}

// Photo transcription provides name, visible strength (stored as dosage) and optional schedule.
// Missing strength/package information remains empty, never guessed to satisfy validation.
export function canSend(items) {
  return Array.isArray(items) && items.length > 0 && items.every(item => item
    && isText(item.name, 120) && item.name.trim()
    && isText(item.dosage, 120)
    && isText(item.dosesPerPackage, 6) && (item.dosesPerPackage === '' || /^[1-9]\d{0,5}$/.test(item.dosesPerPackage))
    && (item.schedule === undefined || isText(item.schedule, 120)));
}

// The patient upload and doctor's reader share this exact JSON format.
export function buildTransferPayload(items, regimen = '') {
  if (!canSend(items) || !isText(regimen, 200)) {
    throw new Error('Seznam nemá platný formát pro lékaře. Zkontrolujte údaje léčiv.');
  }
  return {
    version: 1,
    regimen,
    items: items.map(({ name, dosage, dosesPerPackage, schedule }) => ({
      name, dosage, dosesPerPackage, ...(schedule ? { schedule } : {}),
    })),
  };
}

export const medicineSummary = item => [item.dosage,
  item.dosesPerPackage ? `${item.dosesPerPackage} dávek v balení` : '', item.schedule].filter(Boolean).join(' · ');

export function toText(items, regimen = '') {
  if (!canSend(items)) throw new Error('Doplňte názvy léčiv a opravte neplatné údaje.');
  const clean = value => value.trim().replace(/[\t\r\n]+/g, ' ');
  const regimenLine = regimen.trim() ? [`Režim onkologické léčby\t${clean(regimen)}`] : [];
  const withSchedule = items.some(item => item.schedule?.trim());
  return [...regimenLine, 'Název léčiva\tDosage\tPočet dávek v balení' + (withSchedule ? '\tKdy' : ''),
    ...items.map(item => [item.name, item.dosage, item.dosesPerPackage, ...(withSchedule ? [item.schedule || ''] : [])].map(clean).join('\t'))].join('\n');
}
