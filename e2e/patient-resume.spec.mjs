import { test, expect } from '@playwright/test';

const item = { name: 'Syntetické léčivo', dosage: '10 mg', dosesPerPackage: '30', schedule: '1-0-0' };

test('patient returns from the latest PIN to the original photo upload screen and saves under the same PIN', async ({ page, context }) => {
  const payload = { version: 1, regimen: 'Původní režim', items: [item] };
  const upload = await context.request.post('/api/v1/transfers', { data: payload });
  expect(upload.status()).toBe(201);
  const { pin } = await upload.json();
  await page.goto('/pacient');
  await page.evaluate(({ pin, item }) => {
    localStorage.setItem('pillgaze:patient:v2', JSON.stringify({
      items: [], submissions: [{ id: 'latest-local-id', pin, sentAt: '2026-10-17T12:00:00Z',
        items: [{ id: 'medicine-local-id', ...item }], regimen: 'Původní režim' }],
    }));
  }, { pin, item });
  await page.goto('/pacient?new=1');
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expect(page.locator('.medicine-info strong')).toHaveText(item.name);
  await expect(page.locator('.medicine input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vyfotit', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.locator('#regimen').fill('Upravený režim');
  const saved = page.waitForResponse(response => response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('h1.pin')).toHaveText(pin);
  const expected = { ...payload, regimen: 'Upravený režim', items: [item] };
  const stored = await context.request.get(`/api/v1/transfers/${pin}`);
  expect(await stored.json()).toEqual(expected);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v2')));
  expect(state.submissions).toHaveLength(1);
  expect(state.submissions[0].id).toBe('latest-local-id');
  expect(state.submissions[0].pin).toBe(pin);
  expect(state.submissions[0].items[0].name).toBe(expected.items[0].name);
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  const doctor = await context.newPage();
  await doctor.goto(`/lekar?pin=${pin}`);
  await expect(doctor.locator('#main input[data-field="name"]')).toHaveValue(expected.items[0].name);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.route('**/api/transcribe', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ name: 'Další syntetické léčivo', strength: '5 mg', schedule: null }]),
  }));
  await page.locator('#gallery').setInputFiles({
    name: 'synthetic.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('.medicine')).toHaveCount(2);
  await expect(page.locator('.photo-job')).toContainText('Hotovo');
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expect(page.locator('.medicine')).toHaveCount(2);
  await expect(page.locator('.photo-job')).toContainText('Hotovo');
  await expect(page.locator('.medicine input')).toHaveCount(0);
});

test('failed save keeps the photo upload screen and the previous snapshot without creating another PIN', async ({ page, context }) => {
  const upload = await context.request.post('/api/v1/transfers', { data: { version: 1, regimen: '', items: [item] } });
  const { pin } = await upload.json();
  await page.goto('/pacient');
  await page.evaluate(({ pin, item }) => localStorage.setItem('pillgaze:patient:v2', JSON.stringify({
    items: [], submissions: [{ id: 'latest-local-id', pin, sentAt: '2026-10-17T12:00:00Z', items: [{ id: 'medicine-local-id', ...item }] }],
  })), { pin, item });
  await page.reload();
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.getByRole('button', { name: 'Přidat režim onkologické léčby' }).click();
  await page.locator('#regimen').fill('Neuložená změna');
  let writes = 0;
  await page.route('**/api/v1/transfers/**', async route => {
    expect(route.request().method()).toBe('PUT');
    writes++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  await expect(page.locator('#message')).toContainText('nemůže potvrdit');
  await expect(page.locator('#regimen')).toHaveValue('Neuložená změna');
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v2')).submissions);
  expect(history).toHaveLength(1);
  expect(history[0].pin).toBe(pin);
  expect(history[0].items[0].name).toBe(item.name);
  expect(writes).toBe(1);
});
