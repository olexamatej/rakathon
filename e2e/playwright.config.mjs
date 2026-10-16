import { defineConfig } from '@playwright/test';

if (process.env.E2E_BASE_URL) throw new Error('E2E only supports its disposable local test stack');

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: 'line',
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    browserName: 'chromium',
    serviceWorkers: 'block',
    // Admin pages contain private metadata and the password in sessionStorage.
    trace: 'off', screenshot: 'off', video: 'off',
  },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:4180/pacient',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
