/**
 * Unit tests for SessionStore (Task 3.4)
 *
 * OPFS and IndexedDB are not available in jsdom, so we mock them here.
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from '../types/index';

// ---------------------------------------------------------------------------
// IDB mock — module-level so vi.mock factory can reference it
// ---------------------------------------------------------------------------

// Mutable in-memory store shared across tests; reset in beforeEach
let idbStore: Map<string, unknown>;

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    put: vi.fn(async (_storeName: string, value: { id: string }) => {
      idbStore.set(value.id, value);
    }),
    get: vi.fn(async (_storeName: string, key: string) => {
      return idbStore.get(key);
    }),
    getAll: vi.fn(async (_storeName: string) => {
      return [...idbStore.values()];
    }),
    delete: vi.fn(async (_storeName: string, key: string) => {
      idbStore.delete(key);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// OPFS mock — in-memory file system
// ---------------------------------------------------------------------------

let opfsFiles: Map<string, ArrayBuffer>;

function makeFileHandle(path: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name: path.split('/').pop()!,
    getFile: async () => {
      const data = opfsFiles.get(path);
      if (data === undefined) {
        throw new DOMException('File not found', 'NotFoundError');
      }
      return new File([data], path.split('/').pop()!, {});
    },
    createWritable: async () => {
      const chunks: ArrayBuffer[] = [];
      return {
        write: async (chunk: ArrayBuffer) => {
          chunks.push(chunk);
        },
        close: async () => {
          const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(new Uint8Array(c), offset);
            offset += c.byteLength;
          }
          opfsFiles.set(path, merged.buffer);
        },
      } as unknown as FileSystemWritableFileStream;
    },
    isSameEntry: async () => false,
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
  } as unknown as FileSystemFileHandle;
}

function makeDirectoryHandle(prefix: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: prefix.split('/').pop() ?? '',
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      const childPrefix = prefix ? `${prefix}/${name}` : name;
      const exists = [...opfsFiles.keys()].some(
        (k) => k.startsWith(childPrefix + '/') || k === childPrefix,
      );
      if (!exists && !opts?.create) {
        throw new DOMException(`Directory not found: ${childPrefix}`, 'NotFoundError');
      }
      return makeDirectoryHandle(childPrefix);
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      const filePath = prefix ? `${prefix}/${name}` : name;
      if (!opfsFiles.has(filePath) && !opts?.create) {
        throw new DOMException(`File not found: ${filePath}`, 'NotFoundError');
      }
      return makeFileHandle(filePath);
    },
    removeEntry: async (name: string, opts?: { recursive?: boolean }) => {
      const target = prefix ? `${prefix}/${name}` : name;
      if (opts?.recursive) {
        for (const key of [...opfsFiles.keys()]) {
          if (key === target || key.startsWith(target + '/')) {
            opfsFiles.delete(key);
          }
        }
      } else {
        if (!opfsFiles.has(target)) {
          throw new DOMException(`Not found: ${target}`, 'NotFoundError');
        }
        opfsFiles.delete(target);
      }
    },
    resolve: async () => null,
    keys: async function* () {},
    values: async function* () {},
    entries: async function* () {},
    [Symbol.asyncIterator]: async function* () {},
    isSameEntry: async () => false,
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
  } as unknown as FileSystemDirectoryHandle;
}

// ---------------------------------------------------------------------------
// Helpers — build minimal Session fixtures
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
    videoId: 'abc123',
    videoTitle: 'Test Video',
    videoDurationSeconds: 120,
    thumbnailUrl: 'https://img.youtube.com/vi/abc123/0.jpg',
    timestamps: [],
    dancerProfiles: [],
    environmentType: 'stage',
    depthCalibration: {
      homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      environmentType: 'stage',
      confidence: 0.9,
      frameIndex: 0,
    },
    formations: [],
    opfsVideoPath: '/sessions/session-1/video.mp4',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SessionStore', () => {
  let SessionStore: typeof import('./SessionStore').SessionStore;

  beforeEach(async () => {
    // Reset in-memory stores
    idbStore = new Map();
    opfsFiles = new Map();

    // Mock navigator.storage.getDirectory
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(async () => makeDirectoryHandle('')),
      },
    });

    // Re-import SessionStore fresh each test so the lazy _db is reset
    vi.resetModules();
    const mod = await import('./SessionStore');
    SessionStore = mod.SessionStore;
  });

  // -------------------------------------------------------------------------
  // OPFS — writeVideo / readVideo
  // -------------------------------------------------------------------------

  describe('writeVideo / readVideo', () => {
    it('writes and reads back the same binary data', async () => {
      const store = new SessionStore();
      const data = new Uint8Array([1, 2, 3, 4]).buffer;

      await store.writeVideo('session-1', data);
      const result = await store.readVideo('session-1');

      expect(result).not.toBeNull();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('returns null when video file does not exist', async () => {
      const store = new SessionStore();
      const result = await store.readVideo('nonexistent-session');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // OPFS — writeFrame / readFrame
  // -------------------------------------------------------------------------

  describe('writeFrame / readFrame', () => {
    it('writes and reads back frame data', async () => {
      const store = new SessionStore();
      const data = new Uint8Array([10, 20, 30]).buffer;

      await store.writeFrame('session-1', 'ts-001', data);
      const result = await store.readFrame('session-1', 'ts-001');

      expect(result).not.toBeNull();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([10, 20, 30]));
    });

    it('returns null when frame file does not exist', async () => {
      const store = new SessionStore();
      const result = await store.readFrame('session-1', 'ts-missing');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // OPFS — writeFormationImage / readFormationImage
  // -------------------------------------------------------------------------

  describe('writeFormationImage / readFormationImage', () => {
    it('writes and reads back formation image data', async () => {
      const store = new SessionStore();
      const data = new Uint8Array([255, 0, 128]).buffer;

      await store.writeFormationImage('session-1', 'ts-001', data);
      const result = await store.readFormationImage('session-1', 'ts-001');

      expect(result).not.toBeNull();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([255, 0, 128]));
    });

    it('returns null when formation image does not exist', async () => {
      const store = new SessionStore();
      const result = await store.readFormationImage('session-1', 'ts-missing');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // IndexedDB — saveSession / loadSession
  // -------------------------------------------------------------------------

  describe('saveSession / loadSession', () => {
    it('saves and loads a session by ID', async () => {
      const store = new SessionStore();
      const session = makeSession();

      await store.saveSession(session);
      const loaded = await store.loadSession('session-1');

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('session-1');
      expect(loaded!.videoTitle).toBe('Test Video');
    });

    it('returns null for a non-existent session ID', async () => {
      const store = new SessionStore();
      const loaded = await store.loadSession('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('upserts an existing session (overwrites on save)', async () => {
      const store = new SessionStore();
      const session = makeSession({ videoTitle: 'Original Title' });
      await store.saveSession(session);

      const updated = makeSession({ videoTitle: 'Updated Title' });
      await store.saveSession(updated);

      const loaded = await store.loadSession('session-1');
      expect(loaded!.videoTitle).toBe('Updated Title');
    });
  });

  // -------------------------------------------------------------------------
  // IndexedDB — listSessions
  // -------------------------------------------------------------------------

  describe('listSessions', () => {
    it('returns an empty array when no sessions are stored', async () => {
      const store = new SessionStore();
      const list = await store.listSessions();
      expect(list).toEqual([]);
    });

    it('returns SessionSummary[] derived from stored sessions', async () => {
      const store = new SessionStore();
      const session = makeSession({
        timestamps: [{ id: 'ts-1', valueSeconds: 10, label: '00:00:10' }],
        dancerProfiles: [
          {
            id: 'd-1',
            numericLabel: 1,
            visualDescription: 'Dancer in red',
            thumbnailDataUrl: '',
          },
        ],
      });
      await store.saveSession(session);

      const list = await store.listSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('session-1');
      expect(list[0].videoTitle).toBe('Test Video');
      expect(list[0].timestampCount).toBe(1);
      expect(list[0].dancerCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // deleteSession
  // -------------------------------------------------------------------------

  describe('deleteSession', () => {
    it('removes the session from listSessions after deletion', async () => {
      const store = new SessionStore();
      const session = makeSession();
      await store.saveSession(session);

      // Write some OPFS data so the directory exists
      await store.writeVideo('session-1', new Uint8Array([1]).buffer);

      await store.deleteSession('session-1');

      const list = await store.listSessions();
      expect(list).toHaveLength(0);
    });

    it('removes OPFS files after deletion', async () => {
      const store = new SessionStore();
      await store.writeVideo('session-1', new Uint8Array([1]).buffer);
      await store.writeFrame('session-1', 'ts-1', new Uint8Array([2]).buffer);

      await store.deleteSession('session-1');

      // OPFS files should be gone
      const video = await store.readVideo('session-1');
      const frame = await store.readFrame('session-1', 'ts-1');
      expect(video).toBeNull();
      expect(frame).toBeNull();
    });

    it('does not throw when deleting a non-existent session', async () => {
      const store = new SessionStore();
      await expect(store.deleteSession('nonexistent')).resolves.not.toThrow();
    });

    it('loadSession returns null after deletion', async () => {
      const store = new SessionStore();
      const session = makeSession();
      await store.saveSession(session);
      await store.deleteSession('session-1');

      const loaded = await store.loadSession('session-1');
      expect(loaded).toBeNull();
    });
  });
});
