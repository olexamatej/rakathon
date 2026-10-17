import { test, expect } from '@playwright/test';

const item = { id: 'medicine-local-id', name: 'Lokální syntetické léčivo', dosage: '10 mg', dosesPerPackage: '' };
const token = 'a'.repeat(64);
const headers = { 'x-owner-token': token, 'x-uploaded-at': '2026-10-17T12:00:00Z', 'x-expires-at': '2099-10-31T12:00:00Z' };

async function seed(page, expiresAt = headers['x-expires-at']) {
  await page.goto('/pacient');
  await page.evaluate(({ item, token, expiresAt }) => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({
    items: [item], regimen: 'Rozepsaný režim', submissions: [{ id: 'saved-local-id', pin: '0042', ownerToken: token,
      sentAt: '2026-10-17T12:00:00Z', expiresAt, items: [item], regimen: 'Uložený režim' }],
  })), { item, token, expiresAt });
}

async function expectFresh(page) {
  await expect(page.locator('h1')).toHaveText('Platnost seznamu skončila');
  await expect(page.locator('h1.pin, .medicine')).toHaveCount(0);
  await expect(page.locator('.saved-list')).toContainText(item.name);
  await expect(page.getByRole('button', { name: 'Obnovit platnost' })).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('v tomto zařízení');
  await expect(page.getByRole('button', { name: 'Znovu nahrát a získat nový PIN' })).toBeEnabled();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
  expect(state.items).toEqual([]);
  expect(state.submissions).toHaveLength(1);
  expect(state.submissions[0].expired).toBe(true);
  expect(state.submissions[0].items[0].name).toBe(item.name);
  expect(state.invalidatedDraft.items[0].name).toBe(item.name);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByRole('button', { name: 'Zahodit seznam' })).toBeEnabled();
}

test('future local expiry checks HEAD, preserves available flow and clears consumed data', async ({ page }) => {
  await seed(page);
  let available = true;
  let renewed = 0;
  let checks = 0;
  await page.route('**/api/v1/transfers/**', async route => {
    const request = route.request();
    if (request.method() === 'HEAD') {
      checks++;
      expect(request.headers()['x-owner-token']).toBe(token);
      return route.fulfill({ status: available ? 200 : 404, headers });
    }
    expect(request.method()).toBe('POST');
    renewed++;
    await route.fulfill({ status: 200, json: { pin: '0042' }, headers });
  });
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  expect(checks).toBe(1);
  await page.getByRole('button', { name: 'Prodloužit platnost', exact: true }).click();
  await expect(page.locator('.message')).toContainText('14 dní');
  expect(renewed).toBe(1);
  available = false;
  await page.reload();
  await expectFresh(page);
  await expect(page.locator('.current-submission')).toContainText('Platnost do');
  await expect(page.locator('.current-submission')).toContainText('Nedostupnost zjištěna');
  await expect(page.locator('.current-submission')).not.toContainText('Platnost vypršela');
  expect(checks).toBe(3);
});

test('network failure keeps local data without displaying stale PIN or claiming expiration', async ({ page }) => {
  await seed(page);
  await page.route('**/api/v1/transfers/**', route => route.abort());
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Platnost není ověřena');
  await expect(page.locator('h1.pin')).toHaveCount(0);
  await expect(page.locator('.saved-list')).toContainText(item.name);
  await expect(page.getByRole('button', { name: 'Ověřit platnost' })).toBeEnabled();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')))).submissions).toHaveLength(1);
});

for (const expiresAt of ['2020-01-15T12:00:00Z', undefined]) {
  test(`local expired or missing deadline clears data without any API calls: ${expiresAt}`, async ({ page }) => {
    await seed(page, expiresAt === undefined ? null : expiresAt);
    // Old receipts without expiry cannot be presented as valid.
    if (expiresAt === undefined) await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('pillgaze:patient:v3'));
      delete state.submissions[0].expiresAt;
      localStorage.setItem('pillgaze:patient:v3', JSON.stringify(state));
    });
    let calls = 0;
    await page.route('**/api/v1/transfers**', route => { calls++; return route.abort(); });
    await page.reload();
    await expectFresh(page);
    expect(calls).toBe(0);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Platnost seznamu skončila');
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')))).submissions[0].expired).toBe(true);
    expect(calls).toBe(0);
    await page.evaluate(item => {
      const state = JSON.parse(localStorage.getItem('pillgaze:patient:v3'));
      state.items = [{ ...item, name: 'Nově nahraný seznam' }];
      localStorage.setItem('pillgaze:patient:v3', JSON.stringify(state));
    }, item);
    await page.reload();
    await expect(page.locator('.medicine-info strong')).toHaveText('Nově nahraný seznam');
    expect(calls).toBe(0);
  });
}

test('server-reported expiry clears data even when the local deadline was in the future', async ({ page }) => {
  await seed(page);
  await page.route('**/api/v1/transfers/**', route => route.fulfill({ status: 200,
    headers: { ...headers, 'x-expires-at': '2020-01-15T12:00:00Z' } }));
  await page.reload();
  await expectFresh(page);
});

test('consumption between validation and extension clears the list instead of reuploading it', async ({ page }) => {
  await seed(page);
  let uploads = 0;
  await page.route('**/api/v1/transfers', route => { uploads++; return route.abort(); });
  await page.route('**/api/v1/transfers/**', route => route.fulfill({
    status: route.request().method() === 'HEAD' ? 200 : 404, headers,
  }));
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Prodloužit platnost', exact: true }).click();
  await expectFresh(page);
  expect(uploads).toBe(0);
});

for (const scenario of ['missing', 'expired', 'consumed-during-put', 'head-network']) {
  test(`save reuses validation and preserves current edits: ${scenario}`, async ({ page }) => {
    await seed(page);
    let editing = false;
    const methods = [];
    await page.route('**/api/v1/transfers/**', async route => {
      const method = route.request().method();
      if (editing) methods.push(method);
      if (method === 'HEAD') {
        if (editing && scenario === 'head-network') return route.abort();
        return route.fulfill({ status: editing && scenario === 'missing' ? 404 : 200, headers });
      }
      expect(method).toBe('PUT');
      expect(scenario).toBe('consumed-during-put');
      return route.fulfill({ status: 404 });
    });
    await page.route('**/api/v1/transfers', async route => {
      methods.push(route.request().method());
      expect(route.request().postDataJSON()).toMatchObject({ regimen: 'Aktuální rozepsaný režim', items: [{ name: item.name }] });
      return route.fulfill({ status: 201, json: { pin: '5678' }, headers });
    });
    await page.reload();
    await expect(page.locator('h1.pin')).toHaveText('0042');
    await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
    await page.locator('#regimen').fill('Aktuální rozepsaný režim');
    editing = true;
    if (scenario === 'expired') await page.clock.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    await page.getByRole('button', { name: 'Uložit seznam' }).click();
    if (scenario === 'head-network') {
      await expect(page.locator('#message')).toContainText('připojení');
      await expect(page.locator('#regimen')).toHaveValue('Aktuální rozepsaný režim');
      expect(methods).toEqual(['HEAD']);
    } else {
      await expect(page.locator('h1.pin')).toHaveText('5678');
      expect(methods).toEqual(scenario === 'expired' ? ['POST'] : scenario === 'missing' ? ['HEAD', 'POST'] : ['HEAD', 'PUT', 'POST']);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
      expect(saved.submissions).toHaveLength(1);
      expect(saved.submissions[0].regimen).toBe('Aktuální rozepsaný režim');
      expect(saved.items[0].name).toBe(item.name);
    }
  });
}

test('doctor consumes the upload during patient editing; save POSTs the current draft with a new receipt', async ({ page, context }) => {
  const upload = await context.request.post('/api/v1/transfers', { data: {
    version: 1, regimen: 'Původní režim', items: [{ name: item.name, dosage: item.dosage, dosesPerPackage: '' }],
  } });
  expect(upload.status()).toBe(201);
  const { pin } = await upload.json();
  await page.goto('/pacient');
  await page.evaluate(({ item, pin, headers }) => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({ items: [], submissions: [{
    id: 'saved-local-id', pin, ownerToken: headers['x-owner-token'], expiresAt: headers['x-expires-at'],
    sentAt: headers['x-uploaded-at'], items: [item], regimen: 'Původní režim',
  }] })), { item, pin, headers: upload.headers() });
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText(pin);
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.locator('#regimen').fill('Aktuální rozepsaný režim');
  const consumed = await context.request.get(`/api/v1/transfers/${pin}`);
  expect(consumed.status()).toBe(200);
  const writes = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/transfers') && ['POST', 'PUT'].includes(request.method())) writes.push(request.method());
  });
  const savedResponse = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/v1/transfers');
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  const receipt = await saved.json();
  await expect(page.locator('h1.pin')).toHaveText(receipt.pin);
  expect(writes).toEqual(['POST']);
  expect(saved.headers()['x-owner-token']).not.toBe(upload.headers()['x-owner-token']);
  const payload = await context.request.get(`/api/v1/transfers/${receipt.pin}`);
  expect((await payload.json()).regimen).toBe('Aktuální rozepsaný režim');
});

test('opening the editor rechecks a PIN consumed since the screen was displayed', async ({ page }) => {
  await seed(page);
  let available = true;
  await page.route('**/api/v1/transfers/**', route => route.fulfill({ status: available ? 200 : 404, headers }));
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  available = false;
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expectFresh(page);
});

test('another tab changing the receipt blocks stale writes and preserves its storage', async ({ page }) => {
  await seed(page);
  await page.route('**/api/v1/transfers/**', route => route.fulfill({ status: 200, headers }));
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.locator('#regimen').fill('Stará editace');
  const other = await page.context().newPage();
  await other.goto('/storage-admin');
  await other.evaluate(() => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({ items: [], submissions: [] })));
  await expect(page.locator('.notice')).toContainText('jiné kartě');
  await expect(page.locator('#send')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')))).toEqual({ items: [], submissions: [] });
  await other.close();
});

test('returning through the PIN screen does not overwrite unsaved editor changes', async ({ page }) => {
  await seed(page);
  await page.route('**/api/v1/transfers/**', route => route.fulfill({ status: 200, headers }));
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await page.locator('#regimen').fill('Neuložená editace');
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  await expect(page.locator('#regimen')).toHaveValue('Neuložená editace');
});

test('expiry during photo recognition preserves edits and saves them with POST', async ({ page }) => {
  await seed(page);
  await page.route('**/api/v1/transfers/**', route => route.fulfill({ status: 200, headers }));
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Zpět k seznamu' }).click();
  let transcription;
  await page.route('**/api/transcribe', route => { transcription = route; });
  await page.locator('#gallery').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64') });
  await expect.poll(() => Boolean(transcription)).toBe(true);
  await page.clock.setSystemTime(new Date('2100-01-01T00:00:00Z'));
  await transcription.fulfill({ json: [{ name: 'Další rozpoznané léčivo', strength: '5 mg', schedule: null }] });
  await expect(page.locator('.medicine')).toHaveCount(2);
  await expect(page.locator('#send')).toBeEnabled();
  await page.route('**/api/v1/transfers', route => {
    expect(route.request().postDataJSON().items).toHaveLength(2);
    return route.fulfill({ status: 201, json: { pin: '5678' }, headers: { ...headers, 'x-expires-at': '2100-01-15T00:00:00Z' } });
  });
  await page.getByRole('button', { name: 'Uložit seznam' }).click();
  await expect(page.locator('h1.pin')).toHaveText('5678');
});

test('expired local copy shows dates and explicitly reuploads the displayed snapshot', async ({ page }) => {
  await seed(page, '2026-10-01T12:00:00Z');
  const writes = [];
  await page.route('**/api/v1/transfers**', route => {
    writes.push(route.request().method());
    expect(route.request().postDataJSON()).toMatchObject({ regimen: 'Uložený režim', items: [{ name: item.name }] });
    return route.fulfill({ status: 201, json: { pin: '5678' }, headers });
  });
  await page.reload();
  await expectFresh(page);
  await expect(page.locator('time[datetime="2026-10-17T12:00:00Z"]')).toBeVisible();
  await expect(page.locator('time[datetime="2026-10-01T12:00:00Z"]')).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Znovu nahrát a získat nový PIN' }).click();
  await expect(page.locator('h1.pin')).toHaveText('5678');
  expect(writes).toEqual(['POST']);
  await expect(page.locator('.generated-at')).toHaveCount(0);
  await expect(page.locator('time[datetime="2026-10-17T12:00:00Z"]')).toHaveCount(0);
  await expect(page.locator('time[datetime="2099-10-31T12:00:00Z"]')).toBeVisible();
  await expect(page.locator('.saved-list h2')).toHaveText('Uložený seznam léčiv:');
  await expect(page.locator('.current-submission')).not.toContainText('Po načtení lékařem');
  expect(await page.locator('[data-action="renew"]').evaluate(button => button.previousElementSibling.classList.contains('validity-date'))).toBe(true);
  const help = page.getByRole('button', { name: 'Informace o platnosti' });
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#validity-info')).toBeHidden();
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#validity-info')).toContainText('musíte platnost před návštěvou prodloužit');
  await help.click();
  await expect(page.locator('#validity-info')).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
  expect(saved.submissions[0].expired).toBeUndefined();
});

test('failed reupload retains the expired copy; discard requires confirmation', async ({ page }) => {
  await seed(page, '2020-01-15T12:00:00Z');
  await page.route('**/api/v1/transfers', route => route.fulfill({ status: 503 }));
  await page.reload();
  await expectFresh(page);
  await page.getByRole('button', { name: 'Znovu nahrát a získat nový PIN' }).click();
  await expect(page.locator('.message')).toContainText('nemůže potvrdit');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')))).submissions[0].expired).toBe(true);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Zahodit seznam' }).click();
  await expect(page.locator('.saved-list')).toContainText(item.name);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Zahodit seznam' }).click();
  await expect(page.locator('#photo-title')).toHaveText('Nahrajte fotografie léků');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')));
  expect(saved.submissions).toEqual([]);
  expect(saved.invalidatedDraft).toBeUndefined();
});
