/**
 * Playwright end-to-end test: happy path
 *
 * Scenario:
 *   1. Navigate to the app
 *   2. Enter a valid YouTube URL
 *   3. Add two timestamps
 *   4. Click "Process" (mocked API responses)
 *   5. Wait for complete state
 *   6. Verify Formation_Images are displayed
 *   7. Click "Export PDF" and verify a file download is triggered
 *
 * Requirements: 1.1, 2.1, 7.3, 10.1
 *
 * NOTE: The Compute API calls (/api/download, /api/extract-frames, /api/pose,
 * /api/depth) are intercepted and mocked so the test runs without a live
 * Vercel backend. OPFS and IndexedDB are real browser APIs available in
 * Chromium.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Minimal JPEG bytes (1×1 white pixel) — used as mock frame/formation data
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

test.describe('Happy path', () => {
  test.beforeEach(async ({ page }) => {
    // -----------------------------------------------------------------------
    // Mock /api/download — returns a minimal video binary with metadata headers
    // -----------------------------------------------------------------------
    await page.route('**/api/download', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Video-Title': 'Test Dance Video',
          'X-Video-Duration': '120',
        },
        body: MINIMAL_JPEG,
      });
    });

    // -----------------------------------------------------------------------
    // Mock /api/extract-frames — returns a multipart response with two frames
    // -----------------------------------------------------------------------
    await page.route('**/api/extract-frames', async (route) => {
      const boundary = 'test-boundary-123';
      const part =
        `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n` +
        MINIMAL_JPEG.toString('binary') +
        '\r\n';
      const body = part + part + `--${boundary}--`;

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.from(body, 'binary'),
      });
    });

    // -----------------------------------------------------------------------
    // Mock /api/pose — returns two dancer tracks
    // -----------------------------------------------------------------------
    await page.route('**/api/pose', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: [
            {
              trackId: 'dancer-1',
              detections: [
                { frameIndex: 0, bbox: [10, 10, 50, 100], keypoints: [], centroid: [30, 55] },
                { frameIndex: 1, bbox: [20, 10, 60, 100], keypoints: [], centroid: [40, 55] },
              ],
            },
            {
              trackId: 'dancer-2',
              detections: [
                { frameIndex: 0, bbox: [100, 10, 140, 100], keypoints: [], centroid: [120, 55] },
                { frameIndex: 1, bbox: [110, 10, 150, 100], keypoints: [], centroid: [130, 55] },
              ],
            },
          ],
        }),
      });
    });

    // -----------------------------------------------------------------------
    // Mock /api/depth — returns a minimal depth map
    // -----------------------------------------------------------------------
    await page.route('**/api/depth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          depthMap: [[0.5, 0.6], [0.4, 0.7]],
          width: 1280,
          height: 720,
        }),
      });
    });
  });

  test('completes the full workflow and triggers a PDF download', async ({ page }) => {
    await page.goto('/');

    // -----------------------------------------------------------------------
    // Step 1: Enter a valid YouTube URL and load the video
    // -----------------------------------------------------------------------
    await page.getByLabel('YouTube URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Load Video' }).click();

    // Wait for the video preview to appear
    await expect(page.getByText('Test Dance Video')).toBeVisible({ timeout: 10_000 });

    // Confirm and download
    await page.getByRole('button', { name: 'Confirm & Download' }).click();

    // -----------------------------------------------------------------------
    // Step 2: Add two timestamps
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Select Timestamps' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel('Timestamp (HH:MM:SS)').fill('00:00:10');
    await page.getByRole('button', { name: 'Add Timestamp' }).click();
    await expect(page.getByText('00:00:10')).toBeVisible();

    await page.getByLabel('Timestamp (HH:MM:SS)').fill('00:01:00');
    await page.getByRole('button', { name: 'Add Timestamp' }).click();
    await expect(page.getByText('00:01:00')).toBeVisible();

    // Proceed to processing
    await page.getByRole('button', { name: 'Proceed' }).click();

    // -----------------------------------------------------------------------
    // Step 3: Wait for processing to complete
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Processing Video' })).toBeVisible();

    // Wait for the dancer review step (processing complete)
    await expect(page.getByRole('heading', { name: 'Dancer Profiles' })).toBeVisible({
      timeout: 60_000,
    });

    // -----------------------------------------------------------------------
    // Step 4: Proceed through dancer review
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: 'Continue to Environment' }).click();

    // -----------------------------------------------------------------------
    // Step 5: Confirm environment
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Environment Analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Environment' }).click();

    // -----------------------------------------------------------------------
    // Step 6: Formation viewer — verify Formation_Images are displayed
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Formation Viewer' })).toBeVisible();

    // Both timestamp labels should appear
    await expect(page.getByText('00:00:10')).toBeVisible();
    await expect(page.getByText('00:01:00')).toBeVisible();

    // Proceed to export
    await page.getByRole('button', { name: 'Continue to Export' }).click();

    // -----------------------------------------------------------------------
    // Step 7: Export — trigger PDF download
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();

    // Listen for the download event
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = await downloadPromise;

    // Verify a file download was triggered with a .pdf extension
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
