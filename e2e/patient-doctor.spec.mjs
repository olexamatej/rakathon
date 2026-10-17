import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const medicines = [
  { name: 'PARALEN', dosage: '500 mg', dosesPerPackage: '24', schedule: '1-0-1' },
  { name: 'IBALGIN', dosage: '400 mg', dosesPerPackage: '30', schedule: '0-1-0' },
  { name: 'LETROX', dosage: '50 mikrogramů', dosesPerPackage: '100', schedule: '1-0-0' },
];

for (const source of ['gallery', 'camera']) {
  test.describe(`patient photo from ${source}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });

    test('stores readable mock medicines under the same PIN in admin and doctor', async ({ page, context }) => {
      await page.goto('/pacient');
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: source === 'camera' ? 'Vyfotit' : 'Z galerie', exact: true }).click();
      await (await chooserPromise).setFiles({
        name: `synthetic-${randomUUID()}.png`, mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64'),
      });
      for (const item of medicines) await expect(page.getByText(item.name, { exact: true })).toBeVisible();

      const uploadPromise = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/transfers');
      await page.getByRole('button', { name: 'Odeslat seznam' }).click();
      const upload = await uploadPromise;
      expect(upload.status(), 'Patient upload must succeed').toBe(201);
      const payload = upload.request().postDataJSON();
      expect(payload).toEqual({ version: 1, regimen: '', items: medicines });
      const { pin } = await upload.json();
      expect(typeof pin === 'string' && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(pin), 'Server must issue a valid PIN').toBe(true);
      await expect(page.locator('h1.pin')).toBeVisible();
      expect(await page.locator('h1.pin').textContent() === pin, 'Patient must display the server PIN').toBe(true);

      const admin = await context.request.get('/api/v1/admin/blobs?offset=0&includeSensitive=true', {
        headers: { Authorization: 'Bearer local-e2e-password' }, maxRedirects: 0,
      });
      expect(admin.status(), 'Admin diagnostics must be available').toBe(200);
      const listing = await admin.json();
      expect(listing.sensitiveEnabled).toBe(true);
      const row = listing.items.find(item => item.pin === pin);
      expect(Boolean(row), 'Admin must contain the same server PIN').toBe(true);
      expect(JSON.parse(row.payload)).toEqual(payload);

      const doctorContext = await context.browser().newContext();
      try {
        const doctor = await doctorContext.newPage();
        await doctor.goto('http://127.0.0.1:4180/lekar');
        await doctor.locator('#pin').fill(pin);
        const retrievalPromise = doctor.waitForResponse(response => response.request().method() === 'GET'
          && new URL(response.url()).pathname === `/api/v1/transfers/${pin}`);
        await doctor.locator('#pin-submit').click();
        const retrieval = await retrievalPromise;
        expect(retrieval.status(), 'Doctor must retrieve by PIN alone').toBe(200);
        expect(await retrieval.json()).toEqual(payload);
        await expect(doctor.locator('#main tbody tr')).toHaveCount(medicines.length);
        for (const [index, item] of medicines.entries()) {
          for (const field of ['name', 'dosage', 'schedule']) {
            await expect(doctor.locator(`#main [data-field="${field}"]`).nth(index)).toHaveValue(item[field]);
          }
        }
        expect(await doctor.evaluate(() => localStorage.getItem('pillgaze:doctor:v1'))).toBeNull();
        await doctor.reload();
        await expect(doctor.locator('#pin')).toBeVisible();
        await expect(doctor.locator('#main tbody tr')).toHaveCount(0);
      } finally {
        await doctorContext.close();
      }
    });
  });
}
