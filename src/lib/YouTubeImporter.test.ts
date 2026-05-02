/**
 * Unit tests for YouTubeImporter.validateUrl
 * Requirements: 1.2, 1.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeImporter } from './YouTubeImporter';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Minimal SessionStore stub (not exercised by validateUrl tests)
// ---------------------------------------------------------------------------

function makeStoreStub(): SessionStore {
  return {
    writeVideo: vi.fn(),
    readVideo: vi.fn(),
    writeFrame: vi.fn(),
    readFrame: vi.fn(),
    writeFormationImage: vi.fn(),
    readFormationImage: vi.fn(),
    saveSession: vi.fn(),
    loadSession: vi.fn(),
    listSessions: vi.fn(),
    deleteSession: vi.fn(),
  } as unknown as SessionStore;
}

// ---------------------------------------------------------------------------
// validateUrl
// ---------------------------------------------------------------------------

describe('YouTubeImporter.validateUrl', () => {
  let importer: YouTubeImporter;

  beforeEach(() => {
    importer = new YouTubeImporter(makeStoreStub());
  });

  // ---- Valid patterns ----

  it('accepts a standard youtube.com/watch?v= URL', () => {
    const result = importer.validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a youtube.com/watch?v= URL without www', () => {
    const result = importer.validateUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.valid).toBe(true);
  });

  it('accepts a youtu.be/ short URL', () => {
    const result = importer.validateUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a youtube.com/shorts/ URL', () => {
    const result = importer.validateUrl('https://www.youtube.com/shorts/abc123XYZ');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a http:// youtube.com/watch URL', () => {
    const result = importer.validateUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.valid).toBe(true);
  });

  // ---- Invalid patterns ----

  it('rejects an empty string', () => {
    const result = importer.validateUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a whitespace-only string', () => {
    const result = importer.validateUrl('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a non-YouTube domain', () => {
    const result = importer.validateUrl('https://vimeo.com/123456789');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a plain string that is not a URL', () => {
    const result = importer.validateUrl('not a url at all');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtube.com/watch URL with missing video ID (no v param)', () => {
    const result = importer.validateUrl('https://www.youtube.com/watch');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtube.com/watch URL with empty video ID (v=)', () => {
    const result = importer.validateUrl('https://www.youtube.com/watch?v=');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtu.be/ URL with no path (no video ID)', () => {
    const result = importer.validateUrl('https://youtu.be/');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtube.com/shorts/ URL with no video ID', () => {
    const result = importer.validateUrl('https://www.youtube.com/shorts/');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtube.com playlist URL (no watch path)', () => {
    const result = importer.validateUrl(
      'https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-',
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a youtube.com channel URL', () => {
    const result = importer.validateUrl('https://www.youtube.com/c/SomeChannel');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a ftp:// URL', () => {
    const result = importer.validateUrl('ftp://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// fetchMeta — basic error handling (no real network calls)
// ---------------------------------------------------------------------------

describe('YouTubeImporter.fetchMeta', () => {
  let importer: YouTubeImporter;

  beforeEach(() => {
    importer = new YouTubeImporter(makeStoreStub());
  });

  it('throws when given an invalid URL', async () => {
    await expect(importer.fetchMeta('not-a-url')).rejects.toThrow();
  });

  it('throws when the server returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Video is private' }),
        headers: { get: () => null },
      }),
    );

    await expect(
      importer.fetchMeta('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow(/403/);

    vi.unstubAllGlobals();
  });

  it('throws when X-Video-Title header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'X-Video-Duration') return '180';
            return null;
          },
        },
      }),
    );

    await expect(
      importer.fetchMeta('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow(/X-Video-Title/);

    vi.unstubAllGlobals();
  });

  it('throws when X-Video-Duration header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'X-Video-Title') return 'My Dance Video';
            return null;
          },
        },
      }),
    );

    await expect(
      importer.fetchMeta('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow(/X-Video-Duration/);

    vi.unstubAllGlobals();
  });

  it('returns a VideoMeta with correct fields on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'X-Video-Title') return 'Awesome Dance';
            if (name === 'X-Video-Duration') return '212.5';
            return null;
          },
        },
      }),
    );

    const meta = await importer.fetchMeta('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(meta.videoId).toBe('dQw4w9WgXcQ');
    expect(meta.title).toBe('Awesome Dance');
    expect(meta.durationSeconds).toBe(212.5);
    expect(meta.thumbnailUrl).toContain('dQw4w9WgXcQ');

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// downloadVideo — basic error handling
// ---------------------------------------------------------------------------

describe('YouTubeImporter.downloadVideo', () => {
  let importer: YouTubeImporter;
  let store: SessionStore;

  beforeEach(() => {
    store = makeStoreStub();
    importer = new YouTubeImporter(store);
  });

  it('throws when given an invalid URL', async () => {
    await expect(importer.downloadVideo('not-a-url')).rejects.toThrow();
  });

  it('throws when the server returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'yt-dlp failed' }),
      }),
    );

    await expect(
      importer.downloadVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });

  it('writes the video binary to SessionStore on success', async () => {
    const fakeBuffer = new ArrayBuffer(8);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeBuffer,
      }),
    );

    await importer.downloadVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(store.writeVideo).toHaveBeenCalledWith('dQw4w9WgXcQ', fakeBuffer);

    vi.unstubAllGlobals();
  });
});
