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
  await expect(page.locator('#photo-title')).toHaveText('Nahrajte fotografie léků');
  await expect(page.locator('h1.pin, .saved-list, .medicine')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Obnovit platnost' })).toHaveCount(0);
  await expect(page.locator('#message')).toContainText('vypršela');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pillgaze:patient:v3')))).toEqual({ items: [], submissions: [] });
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByRole('button', { name: 'Z galerie', exact: true })).toBeEnabled();
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
  expect(checks).toBe(2);
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
    await expect(page.locator('#photo-title')).toHaveText('Nahrajte fotografie léků');
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
