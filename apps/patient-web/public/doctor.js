import { newId } from './lists.js';

export const DOCTOR_STORAGE_KEY = 'pillgaze:doctor:v1';
export const HISTORY_LIMIT = 50;

const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isText = (value, limit) => typeof value === 'string' && value.length <= limit;
const optionalText = (value, limit) => value === undefined || isText(value, limit);

export const normalizePin = value => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isPin = value => /^[A-Z0-9]{6}$/.test(value);

// SÚKL product detail; an API-provided `suklUrl` always wins over this constructed address.
export const suklLink = item => (/^https:\/\//.test(item.suklUrl || '') ? item.suklUrl : '')
  || (item.suklCode ? `https://prehledy.sukl.cz/prehled_leciv.html#/leciva/${encodeURIComponent(item.suklCode)}` : '');

const isItem = item => item && /^[a-z0-9-]{8,80}$/.test(item.id)
  && isText(item.name, 120) && isText(item.dosage, 120) && isText(item.dosesPerPackage, 6)
  && optionalText(item.schedule, 20) && optionalText(item.suklCode, 20) && optionalText(item.suklUrl, 500)
  && (item.substances === undefined || (Array.isArray(item.substances) && item.substances.length <= 30
    && item.substances.every(name => isText(name, 120))));
const isList = list => list && /^[a-z0-9-]{8,80}$/.test(list.id) && isPin(list.pin)
  && isDate(list.loadedAt) && isDate(list.updatedAt) && isText(list.regimen, 200)
  && Array.isArray(list.items) && list.items.every(isItem)
  && new Set(list.items.map(item => item.id)).size === list.items.length;
const isState = state => state && Array.isArray(state.lists) && state.lists.every(isList)
  && new Set(state.lists.map(list => list.id)).size === state.lists.length;

export const createDoctorState = () => ({ lists: [] });

export function loadDoctorState(storage) {
  const saved = storage.getItem(DOCTOR_STORAGE_KEY);
  if (saved === null) return createDoctorState();
  const state = JSON.parse(saved);
  if (!isState(state)) throw new Error('Neplatný formát uložené historie.');
  return state;
}

export function saveDoctorState(storage, state) {
  if (!isState(state)) throw new Error('Neplatný formát historie.');
  storage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(state));
}

// Add a list received for a PIN; a repeated PIN replaces its older entry and moves to the top.
export function addList(state, { pin, items, regimen = '', sentAt }) {
  const now = new Date().toISOString();
  const list = {
    id: newId(), pin, loadedAt: now, updatedAt: now, regimen: String(regimen || ''),
    items: items.map(item => ({ ...item, id: newId() })),
  };
  if (sentAt && isDate(sentAt)) list.sentAt = sentAt;
  if (!isList(list)) throw new Error('Neplatný seznam z API.');
  state.lists = [list, ...state.lists.filter(entry => entry.pin !== pin)].slice(0, HISTORY_LIMIT);
  return list;
}

export function touch(list) {
  list.updatedAt = new Date().toISOString();
}

// Returns a map of field -> error message; empty when the item is valid.
export function validateItem(item) {
  const errors = {};
  if (!item.name.trim()) errors.name = 'Vyplňte název.';
  if (!item.dosage.trim()) errors.dosage = 'Vyplňte sílu / dávkování.';
  if (!/^[1-9]\d{0,5}$/.test(item.dosesPerPackage.trim())) errors.dosesPerPackage = 'Zadejte kladné celé číslo.';
  if (item.schedule && item.schedule.length > 20) errors.schedule = 'Nejvýše 20 znaků.';
  if (item.suklCode && !/^\d{7}$/.test(item.suklCode.trim())) errors.suklCode = 'Kód SÚKL má 7 číslic.';
  return errors;
}

// Plain-text exports of the medicine list for pasting elsewhere.
const medicineText = item => [item.name, item.dosage].map(part => part.trim()).filter(Boolean).join(' ');

// One medicine per line in space-aligned columns (name, dosage, schedule); a missing value is "-".
export function formatMedicineLines(items) {
  const rows = items.map(item => [item.name, item.dosage, item.schedule].map(value => value?.trim() || '-'));
  const widths = [0, 1].map(column => Math.max(...rows.map(row => row[column].length)));
  return rows.map(row => [row[0].padEnd(widths[0]), row[1].padEnd(widths[1]), row[2]].join('   ')).join('\n');
}

// Everything on one line: "NAME DOSAGE SCHEDULE, NAME DOSAGE SCHEDULE, ...".
export const formatMedicineInline = items => items
  .map(item => [medicineText(item), item.schedule?.trim()].filter(Boolean).join(' ')).join(', ');

const fold = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const indexes = new WeakMap(); // substances map -> Map(folded name -> substance list)

// Active substances for a typed medicine name: exact catalogue name first, then the longest catalogue
// name the text starts with ("IBALGIN 400 mg" -> IBALGIN). Returns undefined when nothing matches.
export function lookupSubstances(map, name) {
  if (!indexes.has(map)) indexes.set(map, new Map(Object.entries(map).map(([key, list]) => [fold(key), list])));
  const index = indexes.get(map);
  const text = fold(name);
  if (!text) return undefined;
  if (index.has(text)) return index.get(text);
  let best;
  for (const [key, list] of index) {
    if (text.startsWith(`${key} `) && (!best || key.length > best.key.length)) best = { key, list };
  }
  return best?.list;
}

// Fills `substances` from the catalogue. Items that already have substances (from the API) are kept
// unless `replace` is set; returns whether anything changed.
export function applySubstances(items, map, { replace = false } = {}) {
  let changed = false;
  for (const item of items) {
    if (item.substances?.length && !replace) continue;
    const found = lookupSubstances(map, item.name);
    if (found) {
      if (JSON.stringify(item.substances) !== JSON.stringify(found)) { item.substances = [...found]; changed = true; }
    } else if (replace && item.substances) {
      delete item.substances;
      changed = true;
    }
  }
  return changed;
}
