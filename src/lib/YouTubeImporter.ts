/**
 * YouTubeImporter — handles URL validation, video metadata retrieval, and video download.
 *
 * - validateUrl: client-side regex validation for YouTube URL patterns
 * - fetchMeta: calls POST /api/download and reads X-Video-Title / X-Video-Duration headers
 * - downloadVideo: streams binary from POST /api/download and writes to OPFS via SessionStore
 */

import type { VideoMeta } from '../types/index';
import { type SessionStore, sessionStore as defaultSessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// URL patterns
// ---------------------------------------------------------------------------

/**
 * Extracts the video ID from a YouTube URL.
 * Supports:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *
 * Returns null if the URL does not match any supported pattern or the video ID is empty.
 */
function extractVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.replace(/^www\./, '');

  // youtu.be short URLs: https://youtu.be/VIDEO_ID
  if (hostname === 'youtu.be') {
    const id = parsed.pathname.slice(1); // strip leading '/'
    return id.length > 0 ? id : null;
  }

  if (hostname === 'youtube.com') {
    // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v');
      return id && id.length > 0 ? id : null;
    }

    // Shorts URL: https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      const id = shortsMatch[1];
      return id.length > 0 ? id : null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// YouTubeImporter class
// ---------------------------------------------------------------------------

export class YouTubeImporter {
  private readonly store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  // -------------------------------------------------------------------------
  // validateUrl
  // -------------------------------------------------------------------------

  /**
   * Validates that the given string is a supported YouTube URL with a non-empty video ID.
   *
   * Accepted patterns:
   *   - https://www.youtube.com/watch?v=VIDEO_ID
   *   - https://youtu.be/VIDEO_ID
   *   - https://www.youtube.com/shorts/VIDEO_ID
   */
  validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url || url.trim().length === 0) {
      return { valid: false, error: 'URL must not be empty.' };
    }

    // Must be parseable as a URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { valid: false, error: 'The provided string is not a valid URL.' };
    }

    // Must use http or https
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'URL must use the https:// or http:// protocol.' };
    }

    const videoId = extractVideoId(url);
    if (videoId === null) {
      return {
        valid: false,
        error:
          'URL is not a recognised YouTube video URL. Accepted formats: youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…',
      };
    }

    return { valid: true };
  }

  // -------------------------------------------------------------------------
  // fetchMeta
  // -------------------------------------------------------------------------

  /**
   * Fetches video metadata by calling POST /api/download with the given URL.
   * Reads X-Video-Title and X-Video-Duration response headers.
   *
   * @throws Error if the request fails, returns a non-OK status, or required headers are missing.
   */
  async fetchMeta(url: string): Promise<VideoMeta> {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error(`fetchMeta: cannot extract video ID from URL "${url}".`);
    }

    let response: Response;
    try {
      response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    } catch (err) {
      throw new Error(`fetchMeta: network error while calling /api/download — ${String(err)}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json() as { error?: string };
        detail = body.error ? ` — ${body.error}` : '';
      } catch {
        // ignore JSON parse errors; use status text instead
        detail = response.statusText ? ` — ${response.statusText}` : '';
      }
      throw new Error(
        `fetchMeta: /api/download returned HTTP ${response.status}${detail}`,
      );
    }

    const title = response.headers.get('X-Video-Title');
    const durationRaw = response.headers.get('X-Video-Duration');

    if (!title) {
      throw new Error('fetchMeta: response is missing the X-Video-Title header.');
    }
    if (!durationRaw) {
      throw new Error('fetchMeta: response is missing the X-Video-Duration header.');
    }

    const durationSeconds = parseFloat(durationRaw);
    if (isNaN(durationSeconds)) {
      throw new Error(
        `fetchMeta: X-Video-Duration header value "${durationRaw}" is not a valid number.`,
      );
    }

    // Thumbnail URL follows the standard YouTube format
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return {
      videoId,
      title,
      durationSeconds,
      thumbnailUrl,
    };
  }

  // -------------------------------------------------------------------------
  // downloadVideo
  // -------------------------------------------------------------------------

  /**
   * Downloads the video binary from POST /api/download and writes it to OPFS
   * via SessionStore.writeVideo(sessionId, data).
   *
   * @param url       - The YouTube URL to download.
   * @param sessionId - The session ID to use as the OPFS storage key.
   *                    Defaults to the video ID extracted from the URL for
   *                    backwards compatibility, but callers should always
   *                    pass the session UUID so the orchestrator can find it.
   *
   * @throws Error if the download fails or the response body cannot be read.
   */
  async downloadVideo(url: string, sessionId?: string): Promise<void> {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error(`downloadVideo: cannot extract video ID from URL "${url}".`);
    }

    // Use the provided sessionId, falling back to videoId for compatibility.
    const storageKey = sessionId ?? videoId;

    let response: Response;
    try {
      response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    } catch (err) {
      throw new Error(
        `downloadVideo: network error while calling /api/download — ${String(err)}`,
      );
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json() as { error?: string };
        detail = body.error ? ` — ${body.error}` : '';
      } catch {
        detail = response.statusText ? ` — ${response.statusText}` : '';
      }
      throw new Error(
        `downloadVideo: /api/download returned HTTP ${response.status}${detail}`,
      );
    }

    let data: ArrayBuffer;
    try {
      data = await response.arrayBuffer();
    } catch (err) {
      throw new Error(
        `downloadVideo: failed to read response body as ArrayBuffer — ${String(err)}`,
      );
    }

    try {
      await this.store.writeVideo(storageKey, data);
    } catch (err) {
      throw new Error(
        `downloadVideo: failed to write video to OPFS for session "${storageKey}" — ${String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const youTubeImporter = new YouTubeImporter(defaultSessionStore);
