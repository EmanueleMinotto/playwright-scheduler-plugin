import { test, expect } from '@playwright/test';

/**
 * Fast suite — 3 tests × 200–400 ms ≈ ~900 ms total.
 */

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test('page title is set', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(200, 400));
  await expect(page).toHaveTitle(/Example Domain/);
});

test('heading is visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(200, 400));
  await expect(page.getByRole('heading', { name: 'Example Domain' })).toBeVisible();
});

test('page has body text', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(rand(200, 400));
  await expect(page.locator('body')).toContainText('This domain is for use in');
});
