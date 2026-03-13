import path from 'node:path';
import type { Reporter, TestCase, TestResult, FullConfig, Suite } from '@playwright/test/reporter';
import type { SchedulerReporterOptions } from './types.js';
import { loadTimings, saveTimings, buildTestId, upsertTiming } from './timings.js';
import type { TimingsStore } from './types.js';

const DEFAULT_OUTPUT_FILE = '.playwright-scheduler/timings.json';

/**
 * SchedulerReporter — a Playwright reporter that collects per-test timing data
 * and persists it to a JSON file after each test run.
 *
 * Usage in playwright.config.ts:
 *
 * ```ts
 * import { defineConfig } from '@playwright/test';
 *
 * export default defineConfig({
 *   reporter: [
 *     ['playwright-scheduler-plugin/reporter', { outputFile: '.playwright-scheduler/timings.json' }],
 *   ],
 * });
 * ```
 */
class SchedulerReporter implements Reporter {
  private readonly outputFile: string;
  private store!: TimingsStore;
  private testDir!: string;

  constructor(options: SchedulerReporterOptions = {}) {
    this.outputFile = options.outputFile ?? DEFAULT_OUTPUT_FILE;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.testDir = config.rootDir;
    this.store = loadTimings(this.outputFile);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Skip retried runs that are not the final attempt
    if (result.retry < test.retries && result.status !== 'passed') return;

    const titlePath = test.titlePath().filter(Boolean);
    const absoluteFile = test.location.file;
    const relativeFile = path.relative(this.testDir, absoluteFile);

    const id = buildTestId(relativeFile, titlePath);

    upsertTiming(this.store, {
      id,
      title: test.title,
      titlePath,
      file: relativeFile,
      duration: result.duration,
      status: result.status as TestCase['expectedStatus'],
    });
  }

  onEnd(): void {
    try {
      saveTimings(this.outputFile, this.store);
      const count = Object.keys(this.store.tests).length;
      console.log(`\n[playwright-scheduler] Saved timing data for ${count} tests → ${this.outputFile}`);
    } catch (err) {
      console.error('[playwright-scheduler] Failed to save timing data:', err);
    }
  }

  printsToStdio(): boolean {
    return true;
  }
}

export default SchedulerReporter;
