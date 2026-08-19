import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.RANDS_E2E_OUTPUT_DIR || 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
});
