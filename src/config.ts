import fs from 'node:fs';
import path from 'node:path';
import { loadTimings } from './timings.js';
import { parseShard, getShardAssignment } from './scheduler.js';
import type { SchedulerShardOptions, TestMatchResult } from './types.js';

const DEFAULT_TIMINGS_FILE = '.playwright-scheduler/timings.json';
const SHARD_ENV_VAR = 'PLAYWRIGHT_SCHEDULER_SHARD';

/**
 * Returns a `testMatch` configuration that restricts Playwright to only the
 * test files assigned to the current shard, distributed optimally using the
 * LPT (Longest Processing Time) algorithm based on historical timing data.
 *
 * Set `PLAYWRIGHT_SCHEDULER_SHARD=x/N` before invoking `playwright test`.
 *
 * ```ts
 * // playwright.config.ts
 * import { defineConfig } from '@playwright/test';
 * import { getTestMatch } from 'playwright-scheduler-plugin';
 *
 * export default defineConfig({
 *   ...getTestMatch(),
 *   reporter: [['playwright-scheduler-plugin/reporter']],
 * });
 * ```
 *
 * ```bash
 * PLAYWRIGHT_SCHEDULER_SHARD=1/4 playwright test
 * PLAYWRIGHT_SCHEDULER_SHARD=2/4 playwright test
 * PLAYWRIGHT_SCHEDULER_SHARD=3/4 playwright test
 * PLAYWRIGHT_SCHEDULER_SHARD=4/4 playwright test
 * ```
 *
 * When `PLAYWRIGHT_SCHEDULER_SHARD` is not set, `testMatch` is left undefined
 * and all tests run normally (useful for the first run that collects timings).
 */
export function getTestMatch(options: SchedulerShardOptions = {}): TestMatchResult {
  const timingsFile = options.timingsFile ?? DEFAULT_TIMINGS_FILE;
  const shardStr = options.shard ?? process.env[SHARD_ENV_VAR];
  const testDir = options.testDir ?? process.cwd();

  const parsed = parseShard(shardStr);
  if (!parsed) {
    return { testMatch: undefined };
  }

  const store = loadTimings(timingsFile);
  const allFiles = discoverTestFiles(testDir);

  if (allFiles.length === 0) {
    console.warn('[playwright-scheduler] No test files discovered. Running without filtering.');
    return { testMatch: undefined };
  }

  const assignment = getShardAssignment(allFiles, store, parsed.index, parsed.total);

  if (assignment.files.length === 0) {
    return { testMatch: ['__no_tests_for_this_shard__'] };
  }

  const absolutePaths = assignment.files.map((f) => path.resolve(testDir, f));
  return { testMatch: absolutePaths };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TEST_FILE_EXTENSIONS = ['.spec.ts', '.spec.js', '.test.ts', '.test.js', '.spec.tsx', '.test.tsx'];

function discoverTestFiles(dir: string): string[] {
  const results: string[] = [];
  walkDir(dir, dir, results);
  return results.sort();
}

function walkDir(rootDir: string, currentDir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(rootDir, fullPath, results);
    } else if (entry.isFile() && TEST_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      results.push(path.relative(rootDir, fullPath));
    }
  }
}
