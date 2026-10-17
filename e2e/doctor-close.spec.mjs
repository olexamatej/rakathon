import { test, expect } from '@playwright/test';

const payload = { version: 1, regimen: '', items: [
  { name: 'PARALEN', dosage: '500 mg', dosesPerPackage: '', schedule: '1-0-1' },
  { name: 'IBALGIN', dosage: '400 mg', dosesPerPackage: '', schedule: '0-1-0' },
] };

test.beforeEach(async ({ page }) => {
  await page.route('**/sukl-substances.json', route => route.fulfill({ json: { PARALEN: ['Paracetamol'], IBALGIN: ['Ibuprofen'] } }));
  await page.route('**/regimen-drugs.json', route => route.fulfill({ json: {} }));
  await page.route('**/api/v1/transfers/*', route => route.fulfill({ json: payload, headers: { 'X-Uploaded-At': '2026-10-17T12:34:56Z' } }));
});

test('close clears the displayed PIN, list and shared link without deleting storage', async ({ page }) => {
  const apiMethods = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiMethods.push(request.method());
  });
  await page.goto('/lekar?pin=1234&source=test');
  await expect(page.locator('#pin')).toHaveValue('1234');
  await expect(page.locator('.list-head #pin-form')).toBeVisible();
  await expect(page.locator('.list-head h1, .list-head code')).toHaveCount(0);
  await expect(page.locator('.patient-record .record-pin')).toHaveText('PIN 1234');
  await expect(page.locator('.patient-record .upload-info')).toContainText('Nahráno pacientem');
  await expect(page.locator('.patient-record time')).toHaveAttribute('datetime', '2026-10-17T12:34:56.000Z');
  await expect(page.locator('.patient-record .regimen-row')).toBeVisible();
  await expect(page.locator('.patient-record .med-table')).toBeVisible();
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
  await page.locator('#pin').fill('1234');
  await page.locator('#pin-submit').click();
  await expect(page.locator('#main tbody tr')).toHaveCount(2);
  await expect(close).toBeVisible();
});

test('closing the current list prevents a pending PIN request from reopening it', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await page.route('**/api/v1/transfers/5678', async route => {
    started();
    await pending;
    await route.fulfill({ json: payload, headers: { 'X-Uploaded-At': '2026-10-17T12:34:56Z' } });
  });
  await page.goto('/lekar?pin=1234');
  await expect(page.locator('#pin')).toHaveValue('1234');
  await page.locator('#pin').fill('5678');
  await page.locator('#pin-submit').click();
  await requested;
  await page.getByRole('button', { name: 'Zavřít aktuální seznam', exact: true }).click();
  const response = page.waitForResponse('**/api/v1/transfers/5678');
  release();
  await response;
  // Wait for the old response and catalogue microtasks before checking it cannot reopen.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#main tbody tr')).toHaveCount(0);
  await expect(page).toHaveTitle('Lékař · PillGaze');
  await expect(page.locator('#pin-submit')).toBeEnabled();
  await page.locator('#pin').fill('1234');
  await page.locator('#pin-submit').click();
  await expect(page.locator('#pin')).toHaveValue('1234');
});


test('four-digit entry preserves leading zeros and rejects oversized shared codes without truncation', async ({ page }) => {
  const reads = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/transfers/')) reads.push(new URL(request.url()).pathname);
  });
  await page.goto('/lekar?pin=0042');
  await expect(page.locator('#pin')).toHaveValue('0042');
  await expect(page.locator('#pin')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#pin')).toHaveAttribute('maxlength', '4');
  await expect(page.locator('.record-pin')).toHaveText('PIN 0042');
  expect(reads).toEqual(['/api/v1/transfers/0042']);
  for (const pin of ['00423', 'ABC234', 'ab0042']) {
    await page.goto(`/lekar?pin=${pin}`);
    await expect(page.locator('#pin-error')).toContainText('4 číslice');
    await expect(page.locator('.record-pin')).toHaveCount(0);
  }
  expect(reads).toEqual(['/api/v1/transfers/0042']);
});
