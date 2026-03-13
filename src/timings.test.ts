import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadTimings,
  saveTimings,
  buildTestId,
  upsertTiming,
  filesInStore,
  fileDuration,
  medianDuration,
} from './timings.js';
import type { TimingsStore } from './types.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `playwright-scheduler-test-${Date.now()}.json`);
}

describe('buildTestId', () => {
  it('joins file and title path with " > "', () => {
    expect(buildTestId('src/foo.spec.ts', ['describe', 'test name'])).toBe(
      'src/foo.spec.ts > describe > test name',
    );
  });

  it('handles empty title path', () => {
    expect(buildTestId('foo.spec.ts', [])).toBe('foo.spec.ts');
  });
});

describe('loadTimings', () => {
  it('returns empty store if file does not exist', () => {
    const store = loadTimings('/nonexistent/path/timings.json');
    expect(store.version).toBe(1);
    expect(store.tests).toEqual({});
  });

  it('loads an existing valid file', () => {
    const file = tmpFile();
    const data: TimingsStore = {
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      tests: {
        'foo > bar': {
          id: 'foo > bar',
          title: 'bar',
          titlePath: ['bar'],
          file: 'foo.spec.ts',
          duration: 1234,
          status: 'passed',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    };
    fs.writeFileSync(file, JSON.stringify(data));
    const loaded = loadTimings(file);
    expect(loaded.tests['foo > bar'].duration).toBe(1234);
    fs.unlinkSync(file);
  });

  it('returns empty store on invalid JSON', () => {
    const file = tmpFile();
    fs.writeFileSync(file, 'not json');
    const store = loadTimings(file);
    expect(store.tests).toEqual({});
    fs.unlinkSync(file);
  });

  it('returns empty store when version mismatches', () => {
    const file = tmpFile();
    fs.writeFileSync(file, JSON.stringify({ version: 99, updatedAt: '', tests: {} }));
    const store = loadTimings(file);
    expect(store.tests).toEqual({});
    fs.unlinkSync(file);
  });
});

describe('saveTimings & loadTimings round-trip', () => {
  it('persists and reloads correctly', () => {
    const file = tmpFile();
    const store: TimingsStore = {
      version: 1,
      updatedAt: '',
      tests: {},
    };
    upsertTiming(store, {
      id: 'a.spec.ts > suite > test',
      title: 'test',
      titlePath: ['suite', 'test'],
      file: 'a.spec.ts',
      duration: 5000,
      status: 'passed',
    });
    saveTimings(file, store);
    const loaded = loadTimings(file);
    expect(loaded.tests['a.spec.ts > suite > test'].duration).toBe(5000);
    fs.unlinkSync(file);
  });
});

describe('upsertTiming', () => {
  it('adds a new entry', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    upsertTiming(store, {
      id: 'x',
      title: 't',
      titlePath: ['t'],
      file: 'x.spec.ts',
      duration: 100,
      status: 'passed',
    });
    expect(store.tests['x']).toBeDefined();
  });

  it('overwrites an existing entry', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    upsertTiming(store, { id: 'x', title: 't', titlePath: ['t'], file: 'x.spec.ts', duration: 100, status: 'passed' });
    upsertTiming(store, { id: 'x', title: 't', titlePath: ['t'], file: 'x.spec.ts', duration: 999, status: 'passed' });
    expect(store.tests['x'].duration).toBe(999);
  });
});

describe('filesInStore', () => {
  it('returns unique file paths', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    upsertTiming(store, { id: 'a > 1', title: '1', titlePath: ['1'], file: 'a.spec.ts', duration: 1, status: 'passed' });
    upsertTiming(store, { id: 'a > 2', title: '2', titlePath: ['2'], file: 'a.spec.ts', duration: 2, status: 'passed' });
    upsertTiming(store, { id: 'b > 1', title: '1', titlePath: ['1'], file: 'b.spec.ts', duration: 3, status: 'passed' });
    const files = filesInStore(store);
    expect(files).toEqual(new Set(['a.spec.ts', 'b.spec.ts']));
  });
});

describe('fileDuration', () => {
  it('sums durations for tests in a file, excluding skipped', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    upsertTiming(store, { id: 'a>1', title: '1', titlePath: ['1'], file: 'a.spec.ts', duration: 100, status: 'passed' });
    upsertTiming(store, { id: 'a>2', title: '2', titlePath: ['2'], file: 'a.spec.ts', duration: 200, status: 'passed' });
    upsertTiming(store, { id: 'a>3', title: '3', titlePath: ['3'], file: 'a.spec.ts', duration: 999, status: 'skipped' });
    expect(fileDuration(store, 'a.spec.ts')).toBe(300);
  });

  it('returns 0 for unknown file', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    expect(fileDuration(store, 'missing.spec.ts')).toBe(0);
  });
});

describe('medianDuration', () => {
  it('returns default 5000 for empty store', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    expect(medianDuration(store)).toBe(5000);
  });

  it('returns the median value (odd count)', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    [1000, 3000, 2000].forEach((d, i) => {
      upsertTiming(store, { id: `t${i}`, title: `t${i}`, titlePath: [`t${i}`], file: 'f.spec.ts', duration: d, status: 'passed' });
    });
    expect(medianDuration(store)).toBe(2000);
  });

  it('returns average of two middle values (even count)', () => {
    const store: TimingsStore = { version: 1, updatedAt: '', tests: {} };
    [1000, 2000, 3000, 4000].forEach((d, i) => {
      upsertTiming(store, { id: `t${i}`, title: `t${i}`, titlePath: [`t${i}`], file: 'f.spec.ts', duration: d, status: 'passed' });
    });
    expect(medianDuration(store)).toBe(2500);
  });
});
