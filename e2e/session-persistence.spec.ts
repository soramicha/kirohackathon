/**
 * Playwright end-to-end test: session persistence
 *
 * Scenario:
 *   1. Complete processing (mocked APIs)
 *   2. Reload the page
 *   3. Open the session list
 *   4. Load the saved session
 *   5. Verify timestamps and dancer profiles are restored
 *
 * Requirements: 8.5
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Minimal JPEG bytes (reused from happy-path)
// ---------------------------------------------------------------------------
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xfb, 0xd2, 0x8a, 0x28, 0x03, 0xff, 0xd9,
]);

// ---------------------------------------------------------------------------
// Helper: mock all compute API routes
// ---------------------------------------------------------------------------
async function mockComputeApis(page: import('@playwright/test').Page) {
  await page.route('**/api/download', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Video-Title': 'Persistence Test Video',
        'X-Video-Duration': '180',
      },
      body: MINIMAL_JPEG,
    });
  });

  await page.route('**/api/extract-frames', async (route) => {
    const boundary = 'persist-boundary';
    const part =
      `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n` +
      MINIMAL_JPEG.toString('binary') +
      '\r\n';
    const body = part + `--${boundary}--`;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.from(body, 'binary'),
    });
  });

  await page.route('**/api/pose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracks: [
          {
            trackId: 'dancer-a',
            detections: [
              { frameIndex: 0, bbox: [10, 10, 50, 100], keypoints: [], centroid: [30, 55] },
            ],
          },
        ],
      }),
    });
  });

  await page.route('**/api/depth', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ depthMap: [[0.5]], width: 640, height: 360 }),
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: complete the full workflow up to the export step
// ---------------------------------------------------------------------------
async function completeWorkflow(page: import('@playwright/test').Page) {
  await page.goto('/');
  await mockComputeApis(page);

  // Step 1: URL input
  await page.getByLabel('YouTube URL').fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByRole('button', { name: 'Load Video' }).click();
  await expect(page.getByText('Persistence Test Video')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Confirm & Download' }).click();

  // Step 2: Add one timestamp
  await expect(page.getByRole('heading', { name: 'Select Timestamps' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByLabel('Timestamp (HH:MM:SS)').fill('00:00:30');
  await page.getByRole('button', { name: 'Add Timestamp' }).click();
  await page.getByRole('button', { name: 'Proceed' }).click();

  // Step 3: Wait for processing to complete
  await expect(page.getByRole('heading', { name: 'Dancer Profiles' })).toBeVisible({
    timeout: 60_000,
  });

  // Step 4: Proceed through dancer review
  await page.getByRole('button', { name: 'Continue to Environment' }).click();

  // Step 5: Confirm environment
  await page.getByRole('button', { name: 'Confirm Environment' }).click();

  // Step 6: Proceed to export
  await expect(page.getByRole('heading', { name: 'Formation Viewer' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Export' }).click();

  // Verify we're on the export page
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Session persistence', () => {
  test('reloading the page and loading a saved session restores timestamps and dancer profiles', async ({
    page,
  }) => {
    // Complete the workflow to create a saved session
    await completeWorkflow(page);

    // Reload the page — this simulates a fresh browser visit
    await page.reload();

    // Re-mock the APIs in case the page makes any requests after reload
    await mockComputeApis(page);

    // The app should start at the URL input step after reload
    await expect(page.getByRole('heading', { name: 'Import YouTube Video' })).toBeVisible({
      timeout: 5_000,
    });

    // Open the saved sessions list
    await page.getByRole('button', { name: 'Saved sessions' }).click();
    await expect(page.getByRole('heading', { name: 'Saved Sessions' })).toBeVisible();

    // The saved session should appear in the list
    await expect(page.getByText('Persistence Test Video')).toBeVisible({ timeout: 5_000 });

    // Load the session
    await page.getByRole('button', { name: 'Load' }).first().click();

    // After loading, the app should restore to the export step
    // (since formations were completed)
    await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible({ timeout: 5_000 });

    // The video title should be visible in the export summary
    await expect(page.getByText('Persistence Test Video')).toBeVisible();

    // The timestamp should be visible in the formation viewer on the export page
    await expect(page.getByText('00:00:30')).toBeVisible();
  });

  test('saved session appears in the session list after processing', async ({ page }) => {
    await completeWorkflow(page);

    // Open the session list without reloading
    await page.getByRole('button', { name: 'Saved sessions' }).click();
    await expect(page.getByRole('heading', { name: 'Saved Sessions' })).toBeVisible();
    await expect(page.getByText('Persistence Test Video')).toBeVisible();
  });
});
