import { defineConfig } from '@playwright/test';

const live = Boolean(process.env.E2E_BASE_URL);
if (live && new URL(process.env.E2E_BASE_URL).origin !== 'https://rakathon.denishromada.com') {
  throw new Error('Live E2E is restricted to https://rakathon.denishromada.com');
}
if (live && !process.env.STORAGE_ADMIN_PASSWORD) throw new Error('Missing STORAGE_ADMIN_PASSWORD');

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  workers: 1,
  retries: 0, // Never repeat a production upload automatically.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: 'line',
  use: {
    baseURL: live ? 'https://rakathon.denishromada.com' : 'http://127.0.0.1:4180',
    browserName: 'chromium',
    serviceWorkers: 'block',
    // Admin pages contain private metadata and the password in sessionStorage.
    trace: 'off', screenshot: 'off', video: 'off',
  },
  webServer: live ? undefined : {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:4180/pacient',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
