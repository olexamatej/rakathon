import { newId, buildTransferPayload } from './lists.js';

let regimens;

// Names of oncology regimens for autocomplete; resolves to [] when unavailable (free text still works).
export function loadRegimens() {
  regimens ??= fetch('/regimens.json').then(response => {
    if (!response.ok) throw new Error('Seznam režimů není dostupný.');
    return response.json();
  }).then(names => Array.isArray(names) ? names.filter(name => typeof name === 'string') : [])
    .catch(() => { regimens = undefined; return []; });
  return regimens;
}

// Keep absent values empty in the UI, including providers that return the literal string "null".
const photoText = value => typeof value === 'string' && value.trim().toLowerCase() !== 'null' ? value.trim() : '';

// The transcription API separates name, strength and patient schedule.
export async function recognizePhoto(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Vyberte prosím fotografii.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Fotografie je příliš velká. Vyberte snímek do 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Použijte fotografii JPEG, PNG nebo WebP.');
  let response;
  try {
    response = await fetch('/api/transcribe', {
      method: 'POST', headers: { 'Content-Type': file.type, Accept: 'application/json' }, body: file,
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(135_000),
    });
  } catch {
    throw new Error('Fotografii se nepodařilo odeslat k rozpoznání. Zkontrolujte připojení a zkuste to znovu.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Rozpoznávání je nyní vytížené. Zkuste to později.');
    if (response.status === 413) throw new Error('Fotografie přesahuje 20 MB. Vyberte menší snímek.');
    if (response.status === 504) throw new Error('Rozpoznávání trvá příliš dlouho. Zkuste to znovu.');
    throw new Error('Fotografii se nepodařilo rozpoznat. Zkuste to znovu.');
  }
  let rows;
  try { rows = await response.json(); } catch { throw new Error('Rozpoznávání nevrátilo platný seznam léčiv.'); }
  const text = value => value === null || (typeof value === 'string' && value.trim().length > 0
    && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value));
  if (!Array.isArray(rows) || rows.length > 200 || rows.some(row => !row
      || Object.keys(row).some(key => !['name', 'strength', 'schedule'].includes(key))
      || !Object.hasOwn(row, 'name') || !Object.hasOwn(row, 'schedule') || !text(row.name) || !text(row.schedule)
      || (Object.hasOwn(row, 'strength') && !text(row.strength)))) {
    throw new Error('Rozpoznávání nevrátilo platný seznam léčiv.');
  }
  return rows.map(row => ({ id: newId(), name: photoText(row.name), dosage: photoText(row.strength), dosesPerPackage: '',
    ...(photoText(row.schedule) ? { schedule: photoText(row.schedule) } : {}) }))
    .filter(item => item.name || item.dosage || item.schedule);
}

export async function sendList(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) throw new Error('Seznam je prázdný.');
  const snapshot = buildTransferPayload(payload.items, payload.regimen ?? '');
  let response;
  try {
    // Each POST creates a blob: never retry automatically or invent a local PIN.
    response = await fetch('/api/v1/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(snapshot),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Nepodařilo se potvrdit odeslání. Zkontrolujte připojení. Opakované odeslání může vytvořit další kopii seznamu.');
  }
  if (response.status === 429) throw new Error('Příliš mnoho odeslání. Vyčkejte alespoň minutu před dalším pokusem.');
  if (response.status === 413) throw new Error('Seznam je příliš velký. Maximální velikost je 1 MiB.');
  if (response.status !== 201) throw new Error('Úložiště nyní nemůže potvrdit odeslání seznamu.');
  let pin;
  try {
    ({ pin } = await response.json());
    if (typeof pin !== 'string' || !/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(pin)) throw new Error();
  } catch {
    throw new Error('Úložiště nevrátilo platný PIN. Seznam již mohl být uložen.');
  }
  return { pin, sentAt: new Date().toISOString() };
}
