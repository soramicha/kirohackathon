/**
 * Property-based tests for SessionStore — Property 4
 *
 * // Feature: dance-formation-app, Property 4: Session deletion removes all associated data
 *
 * Validates: Requirements 8.6
 *
 * For any Session that has been saved (with associated OPFS binary files and
 * IndexedDB records), calling deleteSession(sessionId) SHALL result in:
 *   (a) the session no longer appearing in listSessions(), and
 *   (b) all OPFS paths associated with that session being absent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { Session, Timestamp, DancerProfile } from '../types/index';

// ---------------------------------------------------------------------------
// IDB mock — module-level so vi.mock factory can reference it
// ---------------------------------------------------------------------------

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
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** Generate a UUID-like string using fast-check's built-in uuid arbitrary. */
const uuidArb = fc.uuid();

/** Generate a small non-empty ArrayBuffer (1–16 bytes). */
const binaryArb = fc
  .uint8Array({ minLength: 1, maxLength: 16 })
  .map((arr) => arr.buffer as ArrayBuffer);

/** Generate a Timestamp record. */
const timestampArb: fc.Arbitrary<Timestamp> = fc.record({
  id: uuidArb,
  valueSeconds: fc.integer({ min: 0, max: 3600 }),
  label: fc.constant('00:00:00'),
});

/** Generate a DancerProfile record. */
const dancerProfileArb: fc.Arbitrary<DancerProfile> = fc.record({
  id: uuidArb,
  numericLabel: fc.integer({ min: 1, max: 20 }),
  customName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  visualDescription: fc.string({ minLength: 1, maxLength: 50 }),
  thumbnailDataUrl: fc.constant('data:image/png;base64,abc'),
});

/**
 * Arbitrary for a session together with random binary data for each OPFS path.
 * Generates:
 *   - sessionId: UUID-like string
 *   - timestamps: 0–3 entries
 *   - dancerProfiles: 0–5 entries
 *   - videoBinary: random bytes for the video file
 *   - frameBinaries: one binary per timestamp
 *   - formationBinaries: one binary per timestamp
 */
const sessionWithBinariesArb = fc
  .record({
    sessionId: uuidArb,
    timestamps: fc.array(timestampArb, { minLength: 0, maxLength: 3 }),
    dancerProfiles: fc.array(dancerProfileArb, { minLength: 0, maxLength: 5 }),
    videoBinary: binaryArb,
  })
  .chain(({ sessionId, timestamps, dancerProfiles, videoBinary }) => {
    const frameArbs = timestamps.map(() => binaryArb);
    const formationArbs = timestamps.map(() => binaryArb);

    return fc
      .tuple(
        fc.tuple(...(frameArbs.length > 0 ? frameArbs : [fc.constant(new ArrayBuffer(0))])),
        fc.tuple(...(formationArbs.length > 0 ? formationArbs : [fc.constant(new ArrayBuffer(0))])),
      )
      .map(([frameTuple, formationTuple]) => {
        const frameBinaries: ArrayBuffer[] = timestamps.length > 0
          ? (frameTuple as ArrayBuffer[])
          : [];
        const formationBinaries: ArrayBuffer[] = timestamps.length > 0
          ? (formationTuple as ArrayBuffer[])
          : [];

        const session: Session = {
          id: sessionId,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          youtubeUrl: `https://www.youtube.com/watch?v=${sessionId.slice(0, 11)}`,
          videoId: sessionId.slice(0, 11),
          videoTitle: `Video ${sessionId.slice(0, 8)}`,
          videoDurationSeconds: 120,
          thumbnailUrl: `https://img.youtube.com/vi/${sessionId.slice(0, 11)}/0.jpg`,
          timestamps,
          dancerProfiles,
          environmentType: 'stage',
          depthCalibration: {
            homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            environmentType: 'stage',
            confidence: 0.9,
            frameIndex: 0,
          },
          formations: timestamps.map((ts) => ({
            timestampId: ts.id,
            timestampSeconds: ts.valueSeconds,
            dancerPositions: [],
            opfsFramePath: `sessions/${sessionId}/frames/${ts.id}.jpg`,
            opfsFormationImagePath: `sessions/${sessionId}/formations/${ts.id}.png`,
          })),
          opfsVideoPath: `sessions/${sessionId}/video.mp4`,
        };

        return { session, videoBinary, frameBinaries, formationBinaries };
      });
  });

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SessionStore — Property 4: Session deletion removes all associated data', () => {
  // Feature: dance-formation-app, Property 4: Session deletion removes all associated data

  let SessionStore: typeof import('./SessionStore').SessionStore;

  beforeEach(async () => {
    idbStore = new Map();
    opfsFiles = new Map();

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(async () => makeDirectoryHandle('')),
      },
    });

    vi.resetModules();
    const mod = await import('./SessionStore');
    SessionStore = mod.SessionStore;
  });

  it(
    'Property 4: deleteSession removes session from listSessions and all OPFS paths are absent',
    async () => {
      await fc.assert(
        fc.asyncProperty(sessionWithBinariesArb, async ({ session, videoBinary, frameBinaries, formationBinaries }) => {
          // Re-initialise stores for each property iteration
          idbStore = new Map();
          opfsFiles = new Map();

          const store = new SessionStore();

          // --- Setup: write all OPFS binaries and save the IDB record ---

          // Write video
          await store.writeVideo(session.id, videoBinary);

          // Write frames and formation images for each timestamp
          for (let i = 0; i < session.timestamps.length; i++) {
            const ts = session.timestamps[i];
            await store.writeFrame(session.id, ts.id, frameBinaries[i]);
            await store.writeFormationImage(session.id, ts.id, formationBinaries[i]);
          }

          // Save session to IndexedDB
          await store.saveSession(session);

          // Verify the session is present before deletion
          const beforeList = await store.listSessions();
          const presentBefore = beforeList.some((s) => s.id === session.id);
          expect(presentBefore).toBe(true);

          // --- Act: delete the session ---
          await store.deleteSession(session.id);

          // --- Assert (a): session absent from listSessions ---
          const afterList = await store.listSessions();
          const presentAfter = afterList.some((s) => s.id === session.id);
          expect(presentAfter).toBe(false);

          // --- Assert (b): all OPFS paths are gone ---

          // Video must be null
          const videoResult = await store.readVideo(session.id);
          expect(videoResult).toBeNull();

          // Each frame and formation image must be null
          for (const ts of session.timestamps) {
            const frameResult = await store.readFrame(session.id, ts.id);
            expect(frameResult).toBeNull();

            const formationResult = await store.readFormationImage(session.id, ts.id);
            expect(formationResult).toBeNull();
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
