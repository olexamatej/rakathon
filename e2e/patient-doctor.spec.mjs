import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('patient sends a list and doctor opens it with the same PIN', async ({ page, context }) => {
  await page.route('**/api/transcribe', route => route.fulfill({ json: [
    { name: 'Ukázkové léčivo Alfa 500 mg', schedule: '1-0-0' },
    { name: 'Ukázkové léčivo Beta 10 mg', schedule: null },
  ] }));
  await page.goto('/pacient');
  // Stub only Gemini; upload and PIN issuance still use real storage.
  await page.locator('#gallery').setInputFiles({
    name: `synthetic-${randomUUID()}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByText('Ukázkové léčivo Alfa 500 mg')).toBeVisible();
  await expect(page.getByText('Ukázkové léčivo Beta 10 mg')).toBeVisible();

  const send = page.getByRole('button', { name: 'Odeslat seznam' });
  await expect(send).toBeEnabled();
  const uploadPromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/transfers');
  await send.click();
  const upload = await uploadPromise;
  expect(upload.status(), 'Patient upload must succeed').toBe(201);
  const uploaded = JSON.parse(upload.request().postData());
  expect(uploaded.version).toBe(1);
  expect(uploaded.items).toEqual([
    { name: 'Ukázkové léčivo Alfa 500 mg', dosage: '', dosesPerPackage: '', schedule: '1-0-0' },
    { name: 'Ukázkové léčivo Beta 10 mg', dosage: '', dosesPerPackage: '' },
  ]);
  const { pin } = await upload.json();
  expect(typeof pin === 'string' && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(pin), 'Server must issue a valid PIN').toBe(true);
  await expect(page.locator('h1.pin')).toBeVisible();
  expect(await page.locator('h1.pin').textContent() === pin, 'Patient must see the PIN issued by the server').toBe(true);

  // Use a clean browser context so the doctor can only see the list through retrieval by PIN.
  const doctorContext = await context.browser().newContext();
  try {
    const doctor = await doctorContext.newPage();
    await doctor.goto('http://127.0.0.1:4180/lekar');
    await doctor.locator('#pin').fill(pin);
    await doctor.locator('#pin-submit').click();
    await expect(doctor.locator('#main table')).toBeVisible();
    await expect(doctor.locator('#main tbody tr')).toHaveCount(2);
    await expect(doctor.locator('#main [data-field="name"]').nth(0)).toHaveValue('Ukázkové léčivo Alfa 500 mg');
    await expect(doctor.locator('#main [data-field="dosage"]').nth(0)).toHaveValue('');
    await expect(doctor.locator('#main [data-field="schedule"]').nth(0)).toHaveValue('1-0-0');
    await expect(doctor.locator('#main [data-field="name"]').nth(1)).toHaveValue('Ukázkové léčivo Beta 10 mg');
    await expect(doctor.locator('#main [data-field="dosage"]').nth(1)).toHaveValue('');
  } finally {
    await doctorContext.close();
  }
});
