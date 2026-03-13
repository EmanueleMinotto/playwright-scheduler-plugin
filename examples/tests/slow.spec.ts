import { test, expect } from '@playwright/test';

/**
 * Slow suite — 2 tests × 2500–3500 ms ≈ ~6 s total.
 */

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page is accessible via HTTPS', async ({ page }) => {
  const response = await page.goto('https://example.com');
  await page.waitForTimeout(rand(2500, 3500));
  expect(response?.url()).toMatch(/^https:/);
  expect(response?.status()).toBe(200);
});

test('page has no broken layout (html and body present)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(2500, 3500));
  await expect(page.locator('html')).toBeAttached();
  await expect(page.locator('body')).toBeAttached();
  await expect(page.locator('h1')).toBeAttached();
});
