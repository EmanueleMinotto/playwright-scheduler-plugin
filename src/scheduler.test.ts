import { computeShards, parseShard, getShardAssignment } from './scheduler.js';
import type { TimingsStore } from './types.js';

function makeStore(entries: Array<{ file: string; duration: number }>): TimingsStore {
  const tests: TimingsStore['tests'] = {};
  for (const { file, duration } of entries) {
    const id = `${file} > test`;
    tests[id] = {
      id,
      title: 'test',
      titlePath: ['test'],
      file,
      duration,
      status: 'passed',
      lastUpdated: new Date().toISOString(),
    };
  }
  return { version: 1, updatedAt: new Date().toISOString(), tests };
}

describe('parseShard', () => {
  it('returns null for undefined', () => {
    expect(parseShard(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseShard('')).toBeNull();
  });

  it('parses valid shard strings', () => {
    expect(parseShard('1/4')).toEqual({ index: 1, total: 4 });
    expect(parseShard('3/3')).toEqual({ index: 3, total: 3 });
    expect(parseShard(' 2/5 ')).toEqual({ index: 2, total: 5 });
  });

  it('throws on invalid format', () => {
    expect(() => parseShard('1-4')).toThrow();
    expect(() => parseShard('abc')).toThrow();
    expect(() => parseShard('0/4')).toThrow();
    expect(() => parseShard('5/4')).toThrow();
  });
});

describe('computeShards', () => {
  it('returns empty array for no files', () => {
    const store = makeStore([]);
    expect(computeShards([], store, 2)).toEqual([]);
  });

  it('handles single shard (all files in one shard)', () => {
    const store = makeStore([
      { file: 'a.spec.ts', duration: 1000 },
      { file: 'b.spec.ts', duration: 2000 },
    ]);
    const shards = computeShards(['a.spec.ts', 'b.spec.ts'], store, 1);
    expect(shards).toHaveLength(1);
    expect(shards[0].files).toHaveLength(2);
    expect(shards[0].estimatedMs).toBe(3000);
  });

  it('distributes files evenly when durations are equal', () => {
    const files = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'];
    const store = makeStore(files.map((f) => ({ file: f, duration: 1000 })));
    const shards = computeShards(files, store, 2);
    expect(shards[0].files).toHaveLength(2);
    expect(shards[1].files).toHaveLength(2);
    expect(shards[0].estimatedMs).toBe(2000);
    expect(shards[1].estimatedMs).toBe(2000);
  });

  it('places longest file first, balancing load (LPT)', () => {
    // files: 10s, 8s, 6s, 4s, 3s, 2s → 2 shards
    // LPT: S1=[10,6,3]=19, S2=[8,4,2]=14  (greedy)
    const files = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts', 'e.spec.ts', 'f.spec.ts'];
    const store = makeStore([
      { file: 'a.spec.ts', duration: 10000 },
      { file: 'b.spec.ts', duration: 8000 },
      { file: 'c.spec.ts', duration: 6000 },
      { file: 'd.spec.ts', duration: 4000 },
      { file: 'e.spec.ts', duration: 3000 },
      { file: 'f.spec.ts', duration: 2000 },
    ]);
    const shards = computeShards(files, store, 2);
    expect(shards).toHaveLength(2);
    const [s1, s2] = shards.sort((a, b) => b.estimatedMs - a.estimatedMs);
    // Max difference between shards should be smaller than naive sequential split
    const naiveMax = 10000 + 8000 + 6000; // all top 3 in first shard
    expect(s1.estimatedMs).toBeLessThan(naiveMax);
    // Both shards have files
    expect(s1.files.length).toBeGreaterThan(0);
    expect(s2.files.length).toBeGreaterThan(0);
  });

  it('uses fallback duration for unknown files', () => {
    // store has one file; another file is unknown
    const store = makeStore([{ file: 'known.spec.ts', duration: 4000 }]);
    const shards = computeShards(['known.spec.ts', 'unknown.spec.ts'], store, 2);
    expect(shards).toHaveLength(2);
    // Each shard gets one file
    const totalFiles = shards.reduce((s, sh) => s + sh.files.length, 0);
    expect(totalFiles).toBe(2);
    // Unknown file gets fallback duration (median = 4000), so shards should be balanced
    expect(shards[0].estimatedMs).toBe(4000);
    expect(shards[1].estimatedMs).toBe(4000);
  });

  it('handles more shards than files (some shards get 0 files)', () => {
    const files = ['a.spec.ts'];
    const store = makeStore([{ file: 'a.spec.ts', duration: 1000 }]);
    const shards = computeShards(files, store, 3);
    expect(shards).toHaveLength(3);
    const nonEmpty = shards.filter((s) => s.files.length > 0);
    const empty = shards.filter((s) => s.files.length === 0);
    expect(nonEmpty).toHaveLength(1);
    expect(empty).toHaveLength(2);
  });

  it('throws for numShards < 1', () => {
    const store = makeStore([]);
    expect(() => computeShards([], store, 0)).toThrow(RangeError);
  });

  it('preserves correct index/total on each shard', () => {
    const files = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'];
    const store = makeStore(files.map((f) => ({ file: f, duration: 1000 })));
    const shards = computeShards(files, store, 3);
    for (let i = 0; i < 3; i++) {
      expect(shards[i].index).toBe(i + 1);
      expect(shards[i].total).toBe(3);
    }
  });
});


describe('getShardAssignment', () => {
  it('returns the correct shard by index', () => {
    const files = ['a.spec.ts', 'b.spec.ts'];
    const store = makeStore(files.map((f) => ({ file: f, duration: 1000 })));
    const shard2 = getShardAssignment(files, store, 2, 2);
    expect(shard2.index).toBe(2);
    expect(shard2.total).toBe(2);
  });

  it('throws for out-of-range index', () => {
    const files = ['a.spec.ts'];
    const store = makeStore([{ file: 'a.spec.ts', duration: 100 }]);
    expect(() => getShardAssignment(files, store, 0, 2)).toThrow(RangeError);
    expect(() => getShardAssignment(files, store, 3, 2)).toThrow(RangeError);
  });
});
