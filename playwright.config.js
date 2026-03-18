// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  retries: 1,

  reporter: [
    ['list'],                          // shows results in terminal
    ['html', { outputFolder: 'playwright-report', open: 'never' }], // HTML report
  ],

  use: {
    baseURL: 'http://localhost:3000',
    headless: false,        // set true to run without browser window
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8000,
  },

  projects: [
    {
      name: 'Chrome',
      use: { browserName: 'chromium' },
    },
    {
      name: 'Firefox',
      use: { browserName: 'firefox' },
    },
  ],
});
