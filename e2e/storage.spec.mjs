import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Assertions never dump passwords, PINs, HMACs or existing admin records to logs.
async function adminAction(page, action) {
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/admin/blobs');
  await action();
  const response = await responsePromise;
  expect(response.status(), 'Admin listing must succeed').toBe(200);
  await expect(page.locator('#storage')).toBeVisible();
  await expect(page.locator('#status')).not.toHaveText('Načítání…');
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'false');
}

async function inventory(page) {
  const digests = [];
  // Traverse UI pagination; the visible row count is capped at 100.
  for (let index = 0; index < 20; index++) {
    digests.push(...await page.locator('#rows code').allTextContents());
    if (await page.getByRole('button', { name: 'Další', exact: true }).isDisabled()) return digests;
    await adminAction(page, () => page.getByRole('button', { name: 'Další', exact: true }).click());
  }
  throw new Error('Admin inventory exceeds bounded E2E pagination (2000 records).');
}

test('Odeslat seznam stores one record visible in storage admin', async ({ page, context }) => {
  const admin = await context.newPage();
  await admin.goto('/storage-admin');
  await expect(admin.getByLabel('Heslo administrátora')).toBeVisible();
  // fill() can echo its argument in Playwright's failure call log.
  await admin.evaluate(password => { document.getElementById('password').value = password; },
    'local-e2e-password');
  await adminAction(admin, () => admin.getByRole('button', { name: 'Přihlásit', exact: true }).click());
  const before = await inventory(admin);

  // Seed only the patient's draft. Sending, authentication and storage are real.
  // No OCR call, patient photograph, API route interception or mocked PIN.
  const draft = {
    items: [{ id: randomUUID(), name: `E2E synteticky zaznam ${randomUUID()}`, dosage: 'TEST', dosesPerPackage: '1' }],
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
  expect(upload.status(), 'Patient upload must create a record').toBe(201);
  const { pin } = await upload.json();
  expect(typeof pin === 'string' && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(pin), 'Server must issue a valid PIN').toBe(true);
  await expect(page.locator('h1.pin')).toBeVisible();
  expect(await page.locator('h1.pin').textContent() === pin, 'Displayed PIN must match server receipt').toBe(true);

  // Confirm that the issued PIN reads back the exact JSON sent by the browser.
  const stored = await context.request.get(`/api/v1/transfers/${pin}`, { maxRedirects: 0 });
  expect(stored.status(), 'Issued PIN must retrieve the stored list').toBe(200);
  expect(await stored.text() === upload.request().postData(), 'Stored bytes must match patient upload').toBe(true);

  // Reload tests persisted admin login too, and starts pagination at page one.
  await adminAction(admin, () => admin.reload());
  const after = await inventory(admin);
  expect(after.length, 'Storage admin total must grow by exactly one').toBe(before.length + 1);
  expect(after.filter(digest => !before.includes(digest)).length, 'Exactly one new storage row must appear').toBe(1);
  expect(before.every(digest => after.includes(digest)), 'Existing rows must remain present').toBe(true);
  console.info(`Storage admin: ${before.length} → ${after.length} records; PIN and stored payload verified.`);
});
