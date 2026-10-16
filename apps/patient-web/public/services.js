import { newId } from './lists.js';

export async function recognizePhoto(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Vyberte prosím fotografii.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Fotografie je příliš velká. Vyberte snímek do 20 MB.');
  // TODO(model): pass the photo to an on-device model or API; validate every returned medicine.
  // shortcut: every photo returns two fake medicines; replace when recognition is connected.
  await new Promise(resolve => setTimeout(resolve, 1100));
  return [
    { id: newId(), name: 'Ukázkové léčivo Alfa', dosage: '500 mg', dosesPerPackage: '30' },
    { id: newId(), name: 'Ukázkové léčivo Beta', dosage: '10 mg', dosesPerPackage: '20' },
  ];
}

export async function sendList(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Seznam je prázdný.');
  // TODO(server): POST text only, validate the response and return the server-issued PIN.
  // shortcut: this is a local simulation with no upload or server-side PIN; replace with the API.
  await new Promise(resolve => setTimeout(resolve, 750));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pin = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
  return { pin, sentAt: new Date().toISOString() };
}
