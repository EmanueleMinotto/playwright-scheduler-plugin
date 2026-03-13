/**
 * A single test timing entry stored in the timings file.
 */
export interface TestTimingEntry {
  /** Stable identifier: relative file path + full title path joined by ' > ' */
  id: string;
  /** Test title (last part of titlePath) */
  title: string;
  /** Full title path hierarchy, e.g. ['describe block', 'test name'] */
  titlePath: string[];
  /** Relative path to the test file from testDir */
  file: string;
  /** Duration in milliseconds (last recorded run) */
  duration: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Last known status */
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
}

/**
 * The timings JSON file structure.
 */
export interface TimingsStore {
  version: 1;
  updatedAt: string;
  /** Map of testId -> TestTimingEntry */
  tests: Record<string, TestTimingEntry>;
}

/**
 * Options for the SchedulerReporter.
 */
export interface SchedulerReporterOptions {
  /**
   * Path to the timings file.
   * @default '.playwright-scheduler/timings.json'
   */
  outputFile?: string;
}

/**
 * A computed shard: a subset of test files assigned to one parallel worker.
 */
export interface ShardAssignment {
  /** 1-based shard index */
  index: number;
  /** Total number of shards */
  total: number;
  /** Absolute or relative test file paths assigned to this shard */
  files: string[];
  /** Estimated total duration in ms (from timing data) */
  estimatedMs: number;
}

/**
 * Options for getTestMatch() and the scheduler algorithm.
 */
export interface SchedulerShardOptions {
  /**
   * Path to the timings file produced by SchedulerReporter.
   * @default '.playwright-scheduler/timings.json'
   */
  timingsFile?: string;
  /**
   * Shard specification in "index/total" format (1-based), e.g. "2/4".
   * If undefined or empty, all tests are included (no filtering).
   * Typically passed via the PLAYWRIGHT_SCHEDULER_SHARD environment variable.
   */
  shard?: string;
  /**
   * Root directory where test files are discovered (used to resolve relative paths).
   * Defaults to process.cwd().
   */
  testDir?: string;
}

/**
 * Result of getTestMatch(): ready to spread into defineConfig().
 */
export interface TestMatchResult {
  /** Glob patterns / paths to include, or undefined if no filtering needed */
  testMatch: string[] | undefined;
}

