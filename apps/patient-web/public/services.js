import { newId } from './lists.js';

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

// Resolves to the medicines array, or { items, regimen } when the photo also names an oncology regimen.
export async function recognizePhoto(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Vyberte prosím fotografii.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Fotografie je příliš velká. Vyberte snímek do 20 MB.');
  // TODO(model): pass the photo to an on-device model or API; validate every returned medicine.
  // shortcut: every photo returns two fake medicines; replace when recognition is connected.
  await new Promise(resolve => setTimeout(resolve, 1100));
  return [
    { id: newId(), name: 'Ukázkové léčivo Alfa', dosage: '500 mg', dosesPerPackage: '30', schedule: '1-0-0' },
    { id: newId(), name: 'Ukázkové léčivo Beta', dosage: '10 mg', dosesPerPackage: '20' },
  ];
}

export async function sendList(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Seznam je prázdný.');
  let response;
  try {
    // Each POST creates a blob: never retry automatically or invent a local PIN.
    response = await fetch('/api/v1/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text }),
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
