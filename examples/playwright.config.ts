import { defineConfig } from '@playwright/test';
import { getTestMatch } from 'playwright-scheduler-plugin';

/**
 * workers: 1 makes each shard's total time purely additive, so the
 * comparison between native --shard and PLAYWRIGHT_SCHEDULER_SHARD is
 * easy to read in the terminal output.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  ...getTestMatch({
    timingsFile: '.playwright-scheduler/timings.json',
    testDir: './tests',
  }),
  reporter: [
    ['playwright-scheduler-plugin/reporter', { outputFile: '.playwright-scheduler/timings.json' }],
    ['list'],
  ],
  use: {
    baseURL: 'https://example.com',
    headless: true,
  },
});
