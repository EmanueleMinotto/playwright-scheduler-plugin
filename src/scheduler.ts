import type { ShardAssignment, TimingsStore } from './types.js';
import { fileDuration, medianDuration } from './timings.js';

/**
 * Distributes test files across `numShards` buckets using the
 * Longest Processing Time (LPT) greedy algorithm, which gives a
 * good approximation of the optimal makespan (completion time of the
 * slowest shard).
 *
 * Files not present in the timings store are assigned the median
 * known duration as an estimate.
 *
 * @param allFiles   All discovered test file paths (relative to testDir)
 * @param store      Timing data collected by SchedulerReporter
 * @param numShards  Number of parallel workers / shards
 * @returns          Array of ShardAssignment, one per shard (1-based index)
 */
export function computeShards(
  allFiles: string[],
  store: TimingsStore,
  numShards: number,
): ShardAssignment[] {
  if (numShards < 1) throw new RangeError('numShards must be >= 1');
  if (allFiles.length === 0) return [];

  const fallback = medianDuration(store);

  // Build (file, estimatedMs) pairs and sort descending by duration (LPT)
  const entries: Array<{ file: string; ms: number }> = allFiles.map((file) => {
    const knownMs = fileDuration(store, file);
    return { file, ms: knownMs > 0 ? knownMs : fallback };
  });
  entries.sort((a, b) => b.ms - a.ms);

  // Initialise empty shards
  const shards: ShardAssignment[] = Array.from({ length: numShards }, (_, i) => ({
    index: i + 1,
    total: numShards,
    files: [],
    estimatedMs: 0,
  }));

  // Greedy assignment: always pick the shard with the smallest current total
  for (const { file, ms } of entries) {
    const lightest = shards.reduce((min, s) => (s.estimatedMs < min.estimatedMs ? s : min));
    lightest.files.push(file);
    lightest.estimatedMs += ms;
  }

  return shards;
}

/**
 * Returns the shard assignment for a single shard index.
 *
 * @param allFiles   All discovered test file paths
 * @param store      Timing data
 * @param shardIndex 1-based index of the desired shard
 * @param numShards  Total number of shards
 */
export function getShardAssignment(
  allFiles: string[],
  store: TimingsStore,
  shardIndex: number,
  numShards: number,
): ShardAssignment {
  if (shardIndex < 1 || shardIndex > numShards) {
    throw new RangeError(`shardIndex ${shardIndex} is out of range [1, ${numShards}]`);
  }
  const all = computeShards(allFiles, store, numShards);
  return all[shardIndex - 1];
}

/**
 * Parses a shard string in "index/total" format (e.g. "2/4").
 * Returns null if the string is empty or undefined.
 * Throws if the format is invalid.
 */
export function parseShard(shard: string | undefined): { index: number; total: number } | null {
  if (!shard) return null;
  const match = /^(\d+)\/(\d+)$/.exec(shard.trim());
  if (!match) {
    throw new Error(
      `Invalid shard format "${shard}". Expected "index/total", e.g. "1/4".`,
    );
  }
  const index = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (total < 1) throw new RangeError('Shard total must be >= 1');
  if (index < 1 || index > total) {
    throw new RangeError(`Shard index ${index} is out of range [1, ${total}]`);
  }
  return { index, total };
}

/**
 * Pretty-prints a shard distribution summary to the console.
 */
export function printShardSummary(shards: ShardAssignment[]): void {
  const totalMs = shards.reduce((s, sh) => s + sh.estimatedMs, 0);
  const maxMs = Math.max(...shards.map((sh) => sh.estimatedMs));
  const efficiency = totalMs > 0 ? ((totalMs / (maxMs * shards.length)) * 100).toFixed(1) : '100.0';

  console.log('\n[playwright-scheduler] Shard distribution:');
  for (const shard of shards) {
    const bar = '█'.repeat(Math.round((shard.estimatedMs / (maxMs || 1)) * 20));
    const sec = (shard.estimatedMs / 1000).toFixed(1);
    console.log(`  Shard ${shard.index}/${shard.total}  ${bar.padEnd(20)}  ~${sec}s  (${shard.files.length} files)`);
  }
  console.log(`  Efficiency: ${efficiency}%  (ideal load balance = 100%)\n`);
}
