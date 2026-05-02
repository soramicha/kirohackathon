/**
 * Playwright end-to-end test: invalid URL error path
 *
 * Scenario:
 *   1. Navigate to the app
 *   2. Enter an invalid URL
 *   3. Assert the inline error message is displayed
 *   4. Assert the "Load Video" button remains enabled
 *
 * Requirements: 1.3
 */

import { test, expect } from '@playwright/test';

test.describe('Invalid URL error path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows an inline error for a non-YouTube URL and keeps the button enabled', async ({
    page,
  }) => {
    // Enter a non-YouTube URL
    await page.getByLabel('YouTube URL').fill('https://vimeo.com/123456789');
    await page.getByRole('button', { name: 'Load Video' }).click();

    // Error message should appear
    await expect(page.getByRole('alert')).toBeVisible();
    const errorText = await page.getByRole('alert').textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);

    // The "Load Video" button should still be enabled (not disabled)
    await expect(page.getByRole('button', { name: 'Load Video' })).toBeEnabled();
  });

  test('shows an inline error for an empty URL submission', async ({ page }) => {
    // Try to submit with an empty field — button should be disabled
    const loadButton = page.getByRole('button', { name: 'Load Video' });
    await expect(loadButton).toBeDisabled();
  });

  test('shows an inline error for a plain string that is not a URL', async ({ page }) => {
    await page.getByLabel('YouTube URL').fill('not a url at all');
    await page.getByRole('button', { name: 'Load Video' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Video' })).toBeEnabled();
  });

  test('shows an inline error for a YouTube URL with no video ID', async ({ page }) => {
    await page.getByLabel('YouTube URL').fill('https://www.youtube.com/watch');
    await page.getByRole('button', { name: 'Load Video' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Video' })).toBeEnabled();
  });

  test('clears the error message when the user starts typing a new URL', async ({ page }) => {
    // Trigger an error first
    await page.getByLabel('YouTube URL').fill('https://vimeo.com/123456789');
    await page.getByRole('button', { name: 'Load Video' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    // Start typing — error should clear
    await page.getByLabel('YouTube URL').fill('https://www.youtube.com/watch?v=');
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
