import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
  test(`camera fills the screen without cropping and keeps controls visible: ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      window.cameraTracks = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, 640, 480);
        const stream = canvas.captureStream();
        window.cameraTracks = stream.getTracks();
        return stream;
      };
    });
    await page.goto('/pacient');
    await expect(page.locator('#camera-dialog')).toBeHidden();
    await page.getByRole('button', { name: 'Vyfotit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Fotoaparát' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.width).toBeGreaterThan(viewport.width * 0.9);
    expect(box.height).toBeGreaterThan(viewport.height * 0.9);
    await expect(page.locator('#camera-video')).toHaveCSS('object-fit', 'contain');
    for (const id of ['camera-cancel', 'camera-shoot']) {
      const control = await page.locator(`#${id}`).boundingBox();
      expect(control.y).toBeGreaterThanOrEqual(0);
      expect(control.y + control.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.cameraTracks.every(track => track.readyState === 'ended'))).toBe(true);
  });
}
