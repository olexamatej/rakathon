import { test, expect } from '@playwright/test';

const payload = { version: 1, regimen: '', items: [
  { name: 'PARALEN', dosage: '500 mg', dosesPerPackage: '', schedule: '1-0-1' },
  { name: 'IBALGIN', dosage: '400 mg', dosesPerPackage: '', schedule: '0-1-0' },
] };

test.beforeEach(async ({ page }) => {
  await page.route('**/sukl-substances.json', route => route.fulfill({ json: { PARALEN: ['Paracetamol'], IBALGIN: ['Ibuprofen'] } }));
  await page.route('**/regimen-drugs.json', route => route.fulfill({ json: {} }));
  await page.route('**/api/v1/transfers/*', route => route.fulfill({ json: payload }));
});

test('close clears the displayed PIN, list and shared link without deleting storage', async ({ page }) => {
  const apiMethods = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiMethods.push(request.method());
  });
  await page.goto('/lekar?pin=ABC234&source=test');
  await expect(page.locator('#main code')).toHaveText('ABC234');
  await expect(page.locator('.list-head #pin-form')).toBeVisible();
  await expect(page.locator('.doc-side')).toHaveCount(0);
  await expect(page.locator('#main tbody tr')).toHaveCount(2);
  const close = page.getByRole('button', { name: 'Zavřít aktuální seznam', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toContainText('PIN pacienta');
  await expect(page.locator('#main code')).toHaveCount(0);
  await expect(page.locator('#main tbody tr')).toHaveCount(0);
  await expect(page.locator('#interactions-slot')).toHaveCount(0);
  await expect(page).toHaveTitle('Lékař · PillGaze');
  await expect(page.locator('#pin')).toBeFocused();
  await expect(page.locator('#pin')).toHaveValue('');
  await expect(page).toHaveURL(/\/lekar\?source=test$/);
  expect(apiMethods).toEqual(['GET']);
  await page.reload();
  await expect(page.locator('#main tbody tr')).toHaveCount(0);
  await page.locator('#pin').fill('ABC234');
  await page.locator('#pin-submit').click();
  await expect(page.locator('#main tbody tr')).toHaveCount(2);
  await expect(close).toBeVisible();
});

test('closing the current list prevents a pending PIN request from reopening it', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await page.route('**/api/v1/transfers/DEF567', async route => {
    started();
    await pending;
    await route.fulfill({ json: payload });
  });
  await page.goto('/lekar?pin=ABC234');
  await expect(page.locator('#main code')).toHaveText('ABC234');
  await page.locator('#pin').fill('DEF567');
  await page.locator('#pin-submit').click();
  await requested;
  await page.getByRole('button', { name: 'Zavřít aktuální seznam', exact: true }).click();
  const response = page.waitForResponse('**/api/v1/transfers/DEF567');
  release();
  await response;
  // Wait for the old response and catalogue microtasks before checking it cannot reopen.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#main tbody tr')).toHaveCount(0);
  await expect(page).toHaveTitle('Lékař · PillGaze');
  await expect(page.locator('#pin-submit')).toBeEnabled();
  await page.locator('#pin').fill('ABC234');
  await page.locator('#pin-submit').click();
  await expect(page.locator('#main code')).toHaveText('ABC234');
});
