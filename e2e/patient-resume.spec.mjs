import { test, expect } from '@playwright/test';

const item = { name: 'Syntetické léčivo', dosage: '10 mg', dosesPerPackage: '30', schedule: '1-0-0' };

test('patient returns from the latest PIN to the original photo upload screen and saves under the same PIN', async ({ page, context }) => {
  const payload = { version: 1, regimen: 'Původní režim', items: [item] };
  const upload = await context.request.post('/api/v1/transfers', { data: payload });
  expect(upload.status()).toBe(201);
  const { pin } = await upload.json();
  await page.goto('/pacient');
  await page.evaluate(({ pin, item, ownerToken, expiresAt }) => {
    localStorage.setItem('pillgaze:patient:v3', JSON.stringify({
      items: [], submissions: [{ id: 'latest-local-id', pin, ownerToken, expiresAt, sentAt: '2026-10-17T12:00:00Z',
        items: [{ id: 'medicine-local-id', ...item }], regimen: 'Původní režim' },
        { id: 'older-local-id', pin: '1234', sentAt: '2026-10-16T12:00:00Z',
          items: [{ id: 'older-medicine-id', ...item }] }],
    }));
  }, { pin, item, ownerToken: upload.headers()['x-owner-token'], expiresAt: upload.headers()['x-expires-at'] });
  await page.goto('/pacient?new=1');
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await expect(page.locator('.submission-history, #history-title')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')).submissions.length)).toBe(1);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expect(page.locator('.medicine-info strong')).toHaveText(item.name);
  await expect(page.locator('.medicine input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.locator('#regimen').fill('Upravený režim');
  const saved = page.waitForResponse(response => response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('h1.pin')).toHaveText(pin);
  const expected = { ...payload, regimen: 'Upravený režim', items: [item] };
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
  expect(state.submissions).toHaveLength(1);
  expect(state.submissions[0].id).toBe('latest-local-id');
  expect(state.submissions[0].pin).toBe(pin);
  expect(state.submissions[0].items[0].name).toBe(expected.items[0].name);
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  const doctor = await context.newPage();
  await doctor.goto(`/lekar?pin=${pin}`);
  await expect(doctor.locator('#main input[data-field="name"]')).toHaveValue(expected.items[0].name);
  await page.reload();
  await expect(page.locator('#photo-title')).toHaveText('Nahrajte fotografie léků');
  await expect(page.locator('h1.pin')).toHaveCount(0);
  const invalidated = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
  expect(invalidated.items).toEqual([]);
  expect(invalidated.submissions[0].expired).toBe(true);
  expect(invalidated.submissions[0].items[0].name).toBe(item.name);
  await page.route('**/api/transcribe', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ name: 'Další syntetické léčivo', strength: '5 mg', schedule: null }]),
  }));
  await page.locator('#gallery').setInputFiles({
    name: 'synthetic.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('.medicine')).toHaveCount(1);
  await expect(page.locator('.photo-status')).toHaveCount(0);
  await expect(page.locator('.photo-section img, .photo-job')).toHaveCount(0);
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  await expect(page.locator('h1.pin')).toBeVisible();
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expect(page.locator('.medicine')).toHaveCount(1);
  await expect(page.locator('.photo-status')).toHaveCount(0);
  await expect(page.locator('.photo-section img, .photo-job')).toHaveCount(0);
  await expect(page.locator('.medicine input')).toHaveCount(0);
});

test('failed save keeps the photo upload screen and the previous snapshot without creating another PIN', async ({ page, context }) => {
  const upload = await context.request.post('/api/v1/transfers', { data: { version: 1, regimen: '', items: [item] } });
  const { pin } = await upload.json();
  await page.goto('/pacient');
  await page.evaluate(({ pin, item, ownerToken, expiresAt }) => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({
    items: [], submissions: [{ id: 'latest-local-id', pin, ownerToken, expiresAt, sentAt: '2026-10-17T12:00:00Z', items: [{ id: 'medicine-local-id', ...item }] }],
  })), { pin, item, ownerToken: upload.headers()['x-owner-token'], expiresAt: upload.headers()['x-expires-at'] });
  await page.reload();
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.getByRole('button', { name: 'Přidat režim onkologické léčby' }).click();
  await page.locator('#regimen').fill('Neuložená změna');
  let writes = 0;
  await page.route('**/api/v1/transfers/**', async route => {
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers: {
      'x-owner-token': upload.headers()['x-owner-token'], 'x-uploaded-at': upload.headers()['x-uploaded-at'],
      'x-expires-at': upload.headers()['x-expires-at'],
    } });
    expect(route.request().method()).toBe('PUT');
    writes++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  await expect(page.locator('#message')).toContainText('nemůže potvrdit');
  await expect(page.locator('#regimen')).toHaveValue('Neuložená změna');
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')).submissions);
  expect(history).toHaveLength(1);
  expect(history[0].pin).toBe(pin);
  expect(history[0].items[0].name).toBe(item.name);
  expect(writes).toBe(1);
});

test('patient can queue more photos during recognition and a failed photo does not stop the queue', async ({ page }) => {
  const requests = [];
  await page.route('**/api/transcribe', route => { requests.push(route); });
  await page.goto('/pacient');
  await expect(page.locator('#list-form button')).toHaveCount(2);
  await expect(page.locator('#photo-title')).toHaveText('Nahrajte fotografie léků');
  await expect(page.locator('#list-form')).not.toContainText('Z fotografie');
  await expect(page.locator('.photo-actions button')).toHaveText(['Z galerie', 'Vyfotit']);
  await expect(page.locator('[data-action="gallery"]')).toHaveClass(/secondary/);
  await expect(page.locator('[data-action="camera"]')).toHaveClass(/primary/);
  const photo = name => ({ name, mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64') });
  await page.locator('#gallery').setInputFiles(photo('first.png'));
  await expect.poll(() => requests.length).toBe(1);
  await page.locator('#gallery').evaluate(input => { input.queueTestMarker = true; });
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeEnabled();
  await page.locator('#gallery').setInputFiles([photo('second.png'), photo('third.png')]);
  await expect(page.locator('.photo-status')).toHaveText('Načítám léčiva…');
  await expect(page.locator('.photo-section img, .photo-job')).toHaveCount(0);
  await expect(page.locator('#send')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await requests[0].fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ name: 'První léčivo', strength: '10 mg', schedule: null }]) });
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.locator('.medicine-info strong')).toHaveText('První léčivo');
  await expect(page.locator('#photo-title')).toHaveText('Nahrajte další fotografie léků');
  await expect(page.locator('.photo-actions button')).toHaveText(['Z galerie', 'Vyfotit']);
  expect(await page.locator('.medicines').evaluate(list => Boolean(
    list.compareDocumentPosition(document.querySelector('.photo-section')) & Node.DOCUMENT_POSITION_FOLLOWING
  ))).toBe(true);
  await expect(page.locator('#send')).toBeDisabled();
  await requests[1].fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.locator('.photo-section [role="alert"]')).toContainText('nepodařilo rozpoznat');
  await requests[2].fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ name: 'Třetí léčivo', strength: '5 mg', schedule: null }]) });
  await expect(page.locator('.medicine-info strong')).toHaveText(['První léčivo', 'Třetí léčivo']);
  await expect(page.locator('.photo-status')).toHaveCount(0);
  await expect(page.locator('.photo-section img, .photo-job')).toHaveCount(0);
  await expect(page.locator('#send')).toBeEnabled();
  expect(await page.locator('#gallery').evaluate(input => input.queueTestMarker)).toBe(true);
  await expect(page.locator('#gallery')).toHaveValue('');
  const saved = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/v1/transfers');
  await page.locator('#send').click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().items.map(item => item.name)).toEqual(['První léčivo', 'Třetí léčivo']);
});


test('an old six-character receipt becomes a preserved draft and receives a fresh four-digit PIN', async ({ page }) => {
  await page.goto('/pacient');
  const original = JSON.stringify({ items: [], submissions: [{ id: 'legacy-local-id', pin: 'ABC234',
    sentAt: '2026-10-16T12:00:00Z', items: [{ id: 'medicine-local-id', ...item }], regimen: 'Původní režim' }] });
  await page.evaluate(value => {
    localStorage.removeItem('pillgaze:patient:v3');
    localStorage.setItem('pillgaze:patient:v2', value);
  }, original);
  await page.reload();
  await expect(page.locator('.medicine-info strong')).toHaveText(item.name);
  await expect(page.locator('#regimen')).toHaveValue('Původní režim');
  await expect(page.locator('h1.pin')).toHaveCount(0);
  const upload = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/v1/transfers');
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  const response = await upload;
  expect(response.status()).toBe(201);
  const { pin } = await response.json();
  expect(pin).toMatch(/^[0-9]{4}$/);
  await expect(page.locator('h1.pin')).toHaveText(pin);
  expect(await page.evaluate(() => localStorage.getItem('pillgaze:patient:v2'))).toBe(original);
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
});
