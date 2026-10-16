import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('patient sends a list and doctor opens it with the same PIN', async ({ page, context }) => {
  const itemName = `E2E synteticky zaznam ${randomUUID()}`;
  const draft = {
    items: [{ id: randomUUID(), name: itemName, dosage: 'TEST', dosesPerPackage: '1' }],
    submissions: [],
  };

  await page.goto('/pacient');
  await page.evaluate(value => localStorage.setItem('pillgaze:patient:v2', JSON.stringify(value)), draft);
  await page.reload();

  const send = page.getByRole('button', { name: 'Odeslat seznam' });
  await expect(send).toBeEnabled();
  const uploadPromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/transfers');
  await send.click();
  const upload = await uploadPromise;
  expect(upload.status(), 'Patient upload must succeed').toBe(201);
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
    await expect(doctor.locator('#main [data-field="name"]')).toHaveValue(itemName);
    await expect(doctor.locator('#main tbody tr')).toHaveCount(1);
  } finally {
    await doctorContext.close();
  }
});
