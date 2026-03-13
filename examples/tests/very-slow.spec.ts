import { test, expect } from '@playwright/test';

/**
 * Very-slow suite — 2 tests × 5000–7000 ms ≈ ~12 s total.
 * Named "very-slow" so it sorts after "slow" alphabetically,
 * which means native --shard will group it with slow.spec.ts in the
 * same shard — the worst-case for naive file-count distribution.
 */

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('all links on page are visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(5000, 7000));
  const links = page.locator('a');
  await expect(links.first()).toBeVisible();
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
});

test('page has exactly one h1', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(5000, 7000));
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Example Domain');
});
