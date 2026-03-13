import fs from 'node:fs';
import path from 'node:path';
import type { TimingsStore, TestTimingEntry } from './types.js';

const CURRENT_VERSION = 1 as const;

/** Load the timings file, returning an empty store if it does not exist. */
export function loadTimings(filePath: string): TimingsStore {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { version: CURRENT_VERSION, updatedAt: new Date().toISOString(), tests: {} };
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as TimingsStore;
    if (parsed.version !== CURRENT_VERSION) {
      console.warn(
        `[playwright-scheduler] Timings file version mismatch (found ${parsed.version}, expected ${CURRENT_VERSION}). Resetting.`,
      );
      return { version: CURRENT_VERSION, updatedAt: new Date().toISOString(), tests: {} };
    }
    return parsed;
  } catch {
    console.warn(`[playwright-scheduler] Could not parse timings file at ${resolved}. Starting fresh.`);
    return { version: CURRENT_VERSION, updatedAt: new Date().toISOString(), tests: {} };
  }
}

/** Persist the timings store to disk, creating parent directories as needed. */
export function saveTimings(filePath: string, store: TimingsStore): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(resolved, JSON.stringify(store, null, 2), 'utf-8');
}

/** Build a stable test ID from a file path and title hierarchy. */
export function buildTestId(file: string, titlePath: string[]): string {
  return [file, ...titlePath].join(' > ');
}

/** Upsert a single test entry into the store. */
export function upsertTiming(store: TimingsStore, entry: Omit<TestTimingEntry, 'lastUpdated'>): void {
  store.tests[entry.id] = {
    ...entry,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Returns all unique test files referenced in the timings store.
 */
export function filesInStore(store: TimingsStore): Set<string> {
  const files = new Set<string>();
  for (const entry of Object.values(store.tests)) {
    files.add(entry.file);
  }
  return files;
}

/**
 * Computes the estimated total duration (ms) for a given file,
 * summing all test durations within that file.
 */
export function fileDuration(store: TimingsStore, file: string): number {
  let total = 0;
  for (const entry of Object.values(store.tests)) {
    if (entry.file === file && entry.status !== 'skipped') {
      total += entry.duration;
    }
  }
  return total;
}

/**
 * Returns the median duration of all non-skipped tests in the store.
 * Used as a fallback for tests not yet in the timing data.
 */
export function medianDuration(store: TimingsStore): number {
  const durations = Object.values(store.tests)
    .filter((e) => e.status !== 'skipped' && e.duration > 0)
    .map((e) => e.duration)
    .sort((a, b) => a - b);

  if (durations.length === 0) return 5000; // default 5 s
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 === 0
    ? Math.round((durations[mid - 1] + durations[mid]) / 2)
    : durations[mid];
}
