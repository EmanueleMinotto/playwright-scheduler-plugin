import { test, expect } from '@playwright/test';

/**
 * Medium suite — 3 tests × 800–1200 ms ≈ ~3 s total.
 */

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page responds with 200', async ({ page }) => {
  const response = await page.goto('/');
  await page.waitForTimeout(rand(800, 1200));
  expect(response?.status()).toBe(200);
});

test('page has a link', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(800, 1200));
  await expect(page.locator('a').first()).toBeVisible();
});

test('link points to iana.org', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(800, 1200));
  const href = await page.locator('a').first().getAttribute('href');
  expect(href).toContain('iana.org');
});
