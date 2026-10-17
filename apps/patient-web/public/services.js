import { newId, buildTransferPayload, isPin, isOwnerToken } from './lists.js';

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

// Map visible strength to the existing dosage field; unknown package size stays empty.
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
  if (!Array.isArray(rows) || rows.length > 200 || rows.some(row => !row || Object.keys(row).length !== 3
      || !Object.hasOwn(row, 'name') || !Object.hasOwn(row, 'schedule') || !Object.hasOwn(row, 'strength') || !text(row.strength) || !text(row.name) || !text(row.schedule))) {
    throw new Error('Rozpoznávání nevrátilo platný seznam léčiv.');
  }
  return rows.map(row => ({ id: newId(), name: row.name ?? '', dosage: row.strength ?? '', dosesPerPackage: '',
    ...(row.schedule !== null ? { schedule: row.schedule } : {}) }));
}

export async function sendList(payload, existingPin, ownerToken) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) throw new Error('Seznam je prázdný.');
  if (existingPin !== undefined && !isPin(existingPin)) {
    throw new Error('Tento PIN nelze upravit v úložišti.');
  }
  const snapshot = buildTransferPayload(payload.items, payload.regimen ?? '');
  let response;
  try {
    // PUT replaces only an existing PIN; never fall back to creating a copy.
    response = await fetch(existingPin ? `/api/v1/transfers/${encodeURIComponent(existingPin)}` : '/api/v1/transfers', {
      method: existingPin ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(ownerToken ? { 'X-Owner-Token': ownerToken } : {}) },
      body: JSON.stringify(snapshot),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(existingPin ? 'Nepodařilo se potvrdit uložení. Zkontrolujte připojení a zkuste uložit znovu.' : 'Nepodařilo se potvrdit odeslání. Zkontrolujte připojení. Opakované odeslání může vytvořit další kopii seznamu.');
  }
  if (response.status === 429) throw new Error('Příliš mnoho odeslání. Vyčkejte alespoň minutu před dalším pokusem.');
  if (response.status === 413) throw new Error('Seznam je příliš velký. Maximální velikost je 1 MiB.');
  if (existingPin && response.status === 404) throw Object.assign(new Error('Seznam s tímto PINem již není v úložišti. Obnovte jeho platnost.'), { missing: true });
  if (response.status !== (existingPin ? 200 : 201)) throw new Error('Úložiště nyní nemůže potvrdit odeslání seznamu.');
  let pin;
  try {
    ({ pin } = await response.json());
    if ((existingPin && pin !== existingPin) || !isPin(pin)) throw new Error();
  } catch {
    throw new Error('Úložiště nevrátilo platný PIN. Seznam již mohl být uložen.');
  }
  return readReceipt(response, pin);
}

function readReceipt(response, pin) {
  const ownerToken = response.headers.get('x-owner-token');
  const sentAt = response.headers.get('x-uploaded-at');
  const expiresAt = response.headers.get('x-expires-at');
  // Legacy backend compatibility; it cannot verify ownership or validity.
  if (!ownerToken && !sentAt && !expiresAt) return { pin, sentAt: new Date().toISOString() };
  if (!isOwnerToken(ownerToken) || !Number.isFinite(Date.parse(sentAt)) || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error('Úložiště nevrátilo platné údaje o platnosti.');
  }
  return { pin, ownerToken, sentAt, expiresAt };
}

export async function checkList(entry) {
  if (!isOwnerToken(entry.ownerToken)) return null;
  return validityRequest(entry, false);
}

export async function renewList(entry) {
  if (!isOwnerToken(entry.ownerToken)) throw new Error('Obnovte platnost seznamu novým uložením.');
  return validityRequest(entry, true);
}

async function validityRequest(entry, renew) {
  let response;
  try {
    response = await fetch(`/api/v1/transfers/${encodeURIComponent(entry.pin)}${renew ? '/renew' : ''}`, {
      method: renew ? 'POST' : 'HEAD', headers: { 'X-Owner-Token': entry.ownerToken },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('Platnost nelze ověřit. Zkontrolujte připojení.'); }
  if (response.status === 404) return null;
  if (response.status === 429) throw new Error('Příliš mnoho požadavků. Vyčkejte alespoň minutu.');
  if (response.status !== 200) throw new Error('Platnost nyní nelze ověřit.');
  const receipt = readReceipt(response, entry.pin);
  if (receipt.ownerToken !== entry.ownerToken || !receipt.expiresAt) throw new Error('Platnost nyní nelze ověřit.');
  return receipt;
}
