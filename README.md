# playwright-scheduler-plugin

Playwright plugin that optimizes parallel test execution by distributing test files across shards based on **historical execution times** rather than file count.

Playwright's built-in `--shard` splits tests evenly by count, which leads to unbalanced run times when test files vary in duration. This plugin uses the **Longest Processing Time (LPT)** greedy algorithm to assign files to shards so that every shard finishes at roughly the same time.

## How it works

1. **Collection** — `SchedulerReporter` records the duration of every test and persists the data to `.playwright-scheduler/timings.json` after each run.
2. **Distribution** — Before the next run, `getTestMatch()` reads the timing file and uses LPT to assign the optimal subset of files to the current shard, exposed via the `PLAYWRIGHT_SCHEDULER_SHARD` environment variable.

On the first run (no timing data yet) files are distributed by count, exactly like the native sharding.

## Installation

```bash
npm install -D playwright-scheduler-plugin
```

## Setup

Add the reporter and the `testMatch` helper to your `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
import { getTestMatch } from 'playwright-scheduler-plugin';

export default defineConfig({
  testDir: './tests',
  ...getTestMatch({ testDir: './tests' }),
  reporter: [
    ['playwright-scheduler-plugin/reporter'],
    ['html'],
  ],
});
```

`getTestMatch()` reads `PLAYWRIGHT_SCHEDULER_SHARD` from the environment automatically. When the variable is not set all tests run normally, so your single-process workflow is unaffected.

> **Important:** pass the same value for `testDir` to both `defineConfig` and `getTestMatch` so that the file paths discovered by the scheduler match those stored by the reporter. If `testDir` is omitted both default to `process.cwd()`, which works when all test files live directly under the project root.

## Running shards

Set `PLAYWRIGHT_SCHEDULER_SHARD=<index>/<total>` (1-based) and run `playwright test` as usual:

```bash
PLAYWRIGHT_SCHEDULER_SHARD=1/4 playwright test
PLAYWRIGHT_SCHEDULER_SHARD=2/4 playwright test
PLAYWRIGHT_SCHEDULER_SHARD=3/4 playwright test
PLAYWRIGHT_SCHEDULER_SHARD=4/4 playwright test
```

### GitHub Actions

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: ['1/4', '2/4', '3/4', '4/4']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          PLAYWRIGHT_SCHEDULER_SHARD: ${{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ strategy.job-index }}
          path: playwright-report/
```

### GitLab CI

```yaml
test:
  parallel:
    matrix:
      - PLAYWRIGHT_SCHEDULER_SHARD: ['1/4', '2/4', '3/4', '4/4']
  script:
    - npx playwright test
```

## API

### `getTestMatch(options?)`

Returns `{ testMatch }` ready to spread into `defineConfig()`.

| Option | Type | Default | Description |
|---|---|---|---|
| `shard` | `string` | `process.env.PLAYWRIGHT_SCHEDULER_SHARD` | Shard spec in `"index/total"` format, e.g. `"2/4"` |
| `timingsFile` | `string` | `.playwright-scheduler/timings.json` | Path to the timing data file |
| `testDir` | `string` | `process.cwd()` | Root directory used for file discovery. **Must match Playwright's `testDir`** so that file paths align with those stored by the reporter. |

### `SchedulerReporter`

Playwright reporter that collects per-test timing data.

```ts
// playwright.config.ts
reporter: [
  ['playwright-scheduler-plugin/reporter', { outputFile: '.playwright-scheduler/timings.json' }],
]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `outputFile` | `string` | `.playwright-scheduler/timings.json` | Where to write timing data |

## Example

The `examples/` directory contains a working suite with four test files that have deliberately different durations, making the scheduling effect easy to observe.

**`playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import { getTestMatch } from 'playwright-scheduler-plugin';

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
```

**`tests/fast.spec.ts`** — 3 tests × 200–400 ms ≈ 900 ms total

```ts
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page title is set', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(200, 400));
  await expect(page).toHaveTitle(/Example Domain/);
});
// ...
```

**`tests/medium.spec.ts`** — 3 tests × 800–1200 ms ≈ 3 s total

```ts
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page responds with 200', async ({ page }) => {
  const response = await page.goto('/');
  await page.waitForTimeout(rand(800, 1200));
  expect(response?.status()).toBe(200);
});
// ...
```

**`tests/slow.spec.ts`** — 2 tests × 2500–3500 ms ≈ 6 s total

```ts
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page is accessible via HTTPS', async ({ page }) => {
  const response = await page.goto('https://example.com');
  await page.waitForTimeout(rand(2500, 3500));
  expect(response?.url()).toMatch(/^https:/);
  expect(response?.status()).toBe(200);
});
// ...
```

**`tests/very-slow.spec.ts`** — 2 tests × 5000–7000 ms ≈ 12 s total

```ts
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('all links on page are visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(5000, 7000));
  const links = page.locator('a');
  await expect(links.first()).toBeVisible();
});
// ...
```

**Running the example:**

```bash
cd examples
npm install
npx playwright install chromium

# Step 1 — first run collects timing data (no filtering, all 10 tests)
npx playwright test
# [playwright-scheduler] Saved timing data for 10 tests → .playwright-scheduler/timings.json

# Step 2 — run with 2 shards in parallel (two separate terminals or CI matrix)
PLAYWRIGHT_SCHEDULER_SHARD=1/2 npx playwright test
PLAYWRIGHT_SCHEDULER_SHARD=2/2 npx playwright test
```

**Comparison: native `--shard` vs `PLAYWRIGHT_SCHEDULER_SHARD`**

With 2 shards on the example suite (fast ≈ 2.5 s, medium ≈ 5 s, slow ≈ 7 s, very-slow ≈ 13 s):

| | Shard 1 | Shard 2 | Bottleneck |
|---|---|---|---|
| `--shard=x/2` (native, by file count) | `fast` + `medium` = **7.3 s** | `slow` + `very-slow` = **21.0 s** | **21.0 s** |
| `PLAYWRIGHT_SCHEDULER_SHARD=x/2` (LPT) | `very-slow` = **13.5 s** | `slow` + `medium` + `fast` = **13.9 s** | **13.9 s** |

Native sharding assigns files alphabetically by count, so `fast` and `medium` land in shard 1 while the two heaviest files (`slow` and `very-slow`) both go to shard 2 — the worst case for balanced load. The two shards are 13.7 s apart and the pipeline stalls waiting for shard 2.

The LPT scheduler distributes by measured duration: `very-slow` gets its own shard, and the remaining three files fill the other shard. The gap shrinks to 0.4 s and the bottleneck drops from **21 s to 14 s** — a **34% reduction**.

The benefit grows with suite size: in a real project with dozens of files at varied durations, the fastest shard often finishes minutes ahead of the slowest under naive sharding. LPT keeps every shard close to the theoretical minimum (`total_duration / num_shards`).

## Timing data

The plugin writes timing data to `.playwright-scheduler/timings.json`. Add this path to `.gitignore` and persist it between runs using your CI's artifact or cache mechanism so that each run picks up the latest durations.

### GitHub Actions

```yaml
- uses: actions/cache@v4
  with:
    path: .playwright-scheduler
    key: playwright-scheduler-${{ github.ref }}
    restore-keys: playwright-scheduler-
```

### GitLab CI

```yaml
cache:
  key: playwright-scheduler
  paths:
    - .playwright-scheduler/
```

## License

MIT
