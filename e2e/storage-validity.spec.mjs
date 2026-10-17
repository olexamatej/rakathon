import { test, expect } from '@playwright/test';

test('patient hides an unverified or consumed PIN, retains local text and restores validity', async ({ page }) => {
  const item = { id: 'medicine-local-id', name: 'Lokální syntetické léčivo', dosage: '10 mg', dosesPerPackage: '' };
  const token = 'a'.repeat(64);
  await page.goto('/pacient');
  await page.evaluate(({ item, token }) => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({ items: [], submissions: [{
    id: 'saved-local-id', pin: '0042', ownerToken: token, sentAt: '2026-10-17T12:00:00Z',
    expiresAt: '2099-10-31T12:00:00Z', items: [item],
  }] })), { item, token });
  let available = true;
  let renewed = 0;
  let reads = 0;
  const headers = { 'x-owner-token': token, 'x-uploaded-at': '2026-10-17T12:00:00Z', 'x-expires-at': '2099-10-31T12:00:00Z' };
  await page.route('**/api/v1/transfers/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') reads++;
    if (request.method() === 'HEAD') {
      expect(request.headers()['x-owner-token']).toBe(token);
      return route.fulfill({ status: available ? 200 : 404, headers });
    }
    expect(request.method()).toBe('POST');
    renewed++;
    await route.fulfill({ status: 200, json: { pin: '0042' }, headers });
  });
  await page.reload();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await page.getByRole('button', { name: 'Prodloužit platnost', exact: true }).click();
  await expect(page.locator('.message')).toContainText('14 dní');
  expect(renewed).toBe(1);
  available = false;
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Vypršelo');
  await expect(page.locator('h1.pin')).toHaveCount(0);
  await expect(page.locator('.saved-list')).toContainText(item.name);
  await expect(page.getByRole('button', { name: 'Obnovit platnost', exact: true })).toBeEnabled();
  expect(reads).toBe(0);
  // Restoring missing data is the only path that uploads the local snapshot again.
  await page.route('**/api/v1/transfers', async route => {
    expect(route.request().postDataJSON().items[0].name).toBe(item.name);
    await route.fulfill({ status: 201, json: { pin: '5678' }, headers });
  });
  await page.getByRole('button', { name: 'Obnovit platnost', exact: true }).click();
  await expect(page.locator('h1.pin')).toHaveText('5678');
});

test('network failure does not display stale PIN or claim expiration', async ({ page }) => {
  await page.goto('/pacient');
  await page.evaluate(() => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({ items: [], submissions: [{
    id: 'saved-local-id', pin: '0042', ownerToken: 'a'.repeat(64), sentAt: '2026-10-17T12:00:00Z',
    items: [{ id: 'medicine-local-id', name: 'Lokální seznam', dosage: '', dosesPerPackage: '' }],
  }] })));
  await page.route('**/api/v1/transfers/**', route => route.abort());
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Platnost není ověřena');
  await expect(page.locator('h1.pin')).toHaveCount(0);
  await expect(page.locator('.saved-list')).toContainText('Lokální seznam');
  await expect(page.getByRole('button', { name: 'Ověřit platnost' })).toBeEnabled();
});

test('display-expired demo record renews the same stored upload instead of creating a duplicate', async ({ page }) => {
  await page.goto('/pacient');
  await page.evaluate(() => localStorage.setItem('pillgaze:patient:v3', JSON.stringify({ items: [], submissions: [{
    id: 'saved-local-id', pin: '0042', ownerToken: 'a'.repeat(64), sentAt: '2020-01-01T12:00:00Z',
    items: [{ id: 'medicine-local-id', name: 'Lokální seznam', dosage: '', dosesPerPackage: '' }],
  }] })));
  let renewed = false;
  let uploads = 0;
  await page.route('**/api/v1/transfers', route => { uploads++; return route.abort(); });
  await page.route('**/api/v1/transfers/**', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      expect(new URL(request.url()).pathname).toBe('/api/v1/transfers/0042/renew');
      renewed = true;
    } else expect(request.method()).toBe('HEAD');
    return route.fulfill({ status: 200, json: { pin: '0042' }, headers: {
      'x-owner-token': 'a'.repeat(64), 'x-uploaded-at': '2020-01-01T12:00:00Z',
      'x-expires-at': renewed ? '2099-01-15T12:00:00Z' : '2020-01-15T12:00:00Z',
    } });
  });
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Vypršelo');
  await page.getByRole('button', { name: 'Obnovit platnost', exact: true }).click();
  await expect(page.locator('h1.pin')).toHaveText('0042');
  await expect(page.locator('.generated-at')).toContainText('2020');
  expect(uploads).toBe(0);
  expect(renewed).toBe(true);
});
