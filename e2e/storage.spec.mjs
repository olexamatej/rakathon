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
  await expect(page.locator('#status')).toHaveText('Hotovo.');
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
  await page.evaluate(value => localStorage.setItem('pillgaze:patient:v3', JSON.stringify(value)), draft);
  await page.reload();
  const send = page.getByRole('button', { name: 'Uložit seznam' });
  await expect(send).toBeEnabled();
  const uploadPromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/transfers');
  await send.click();
  const upload = await uploadPromise;
  expect(upload.status(), 'Patient upload must create a record').toBe(201);
  const payload = JSON.parse(upload.request().postData());
  expect(payload.version).toBe(1);
  expect(payload.items).toEqual([{ name: draft.items[0].name, dosage: 'TEST', dosesPerPackage: '1' }]);
  const { pin } = await upload.json();
  expect(typeof pin === 'string' && /^[0-9]{4}$/.test(pin), 'Server must issue a valid PIN').toBe(true);
  await expect(page.locator('h1.pin')).toBeVisible();
  expect(await page.locator('h1.pin').textContent() === pin, 'Displayed PIN must match server receipt').toBe(true);

  // Verify admin growth before the doctor's one-time retrieval deletes the row.
  await adminAction(admin, () => admin.reload());
  const after = await inventory(admin);
  expect(after.length, 'Storage admin total must grow by exactly one').toBe(before.length + 1);
  expect(after.filter(digest => !before.includes(digest)).length).toBe(1);
  expect(before.every(digest => after.includes(digest))).toBe(true);

  // A separate browser context has no patient draft or history: retrieval must use the API.
  const doctorContext = await context.browser().newContext();
  try {
    const doctor = await doctorContext.newPage();
    await doctor.goto('http://127.0.0.1:4180/lekar');
    await doctor.locator('#pin').fill(pin);
    const retrievalPromise = doctor.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname === `/api/v1/transfers/${pin}`);
    await doctor.locator('#pin-submit').click();
    expect(await (await retrievalPromise).json()).toEqual(payload);
    await expect(doctor.locator('#main table')).toBeVisible();
    await expect(doctor.locator('#main [data-field="name"]')).toHaveValue(draft.items[0].name);
    await expect(doctor.locator('#main tbody tr')).toHaveCount(1);
    expect(await doctor.evaluate(() => localStorage.getItem('pillgaze:doctor:v1'))).toBeNull();
    await doctor.reload();
    await expect(doctor.locator('#pin')).toBeVisible();
    await expect(doctor.locator('#main tbody tr')).toHaveCount(0);
  } finally {
    await doctorContext.close();
  }

  // Reload tests persisted admin login too, and starts pagination at page one.
  await adminAction(admin, () => admin.reload());
  const consumed = await inventory(admin);
  expect(consumed).toEqual(before);
  console.info(`Storage admin: ${before.length} → ${after.length} → ${consumed.length}; one-time retrieval verified.`);
});

test('admin can cancel or confirm deleting all records across pages', async ({ page, context }) => {
  await page.goto('/storage-admin');
  await page.evaluate(() => { document.getElementById('password').value = 'local-e2e-password'; });
  await adminAction(page, () => page.getByRole('button', { name: 'Přihlásit', exact: true }).click());
  const syntheticPin = await page.locator('#rows code').first().textContent();
  const before = await inventory(page);
  expect(before.length, 'Purge must cover more than the visible page').toBeGreaterThan(100);
  await expect(page.locator('#page')).toHaveText('Strana 2');

  let deletes = 0;
  page.on('request', request => {
    if (request.method() === 'DELETE' && new URL(request.url()).pathname === '/api/v1/admin/blobs') deletes++;
  });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Smazat vše', exact: true }).click();
  expect(deletes, 'Cancellation must never send a delete').toBe(0);
  await expect(page.locator('#page')).toHaveText('Strana 2');

  const deletionPromise = page.waitForResponse(response => response.request().method() === 'DELETE'
    && new URL(response.url()).pathname === '/api/v1/admin/blobs');
  page.once('dialog', dialog => dialog.accept());
  await adminAction(page, () => page.getByRole('button', { name: 'Smazat vše', exact: true }).click());
  expect((await deletionPromise).status(), 'Authenticated purge must succeed').toBe(204);
  expect(deletes).toBe(1);
  await expect(page.locator('#rows tr')).toHaveCount(0);
  await expect(page.locator('#page')).toHaveText('Strana 1');
  await expect(page.locator('#previous')).toBeDisabled();
  await expect(page.locator('#next')).toBeDisabled();
  const missing = await context.request.get(`/api/v1/transfers/${syntheticPin}`, { maxRedirects: 0 });
  expect(missing.status(), 'Deleted synthetic PIN must no longer retrieve a list').toBe(404);
});
