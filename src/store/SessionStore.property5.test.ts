/**
 * Property-based tests for SessionStore — Property 5
 *
 * // Feature: dance-formation-app, Property 5: Dancer position storage round-trip
 *
 * Validates: Requirements 6.4
 *
 * For any set of dancer positions detected in a frame, storing them via
 * SessionStore and then reading them back SHALL produce an equivalent set of
 * positions with the same dancer IDs, pixel coordinates, and absence flags.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { Session, DancerPosition, Formation } from '../types/index';

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

/** UUID-like string arbitrary. */
const uuidArb = fc.uuid();

/**
 * Arbitrary for a single DancerPosition record.
 * - dancerId: UUID-like string
 * - pixelCoordinate: [x, y] integers in [0, 1920] × [0, 1080]
 * - floorCoordinate: [x, y] floats in [0, 1]
 * - absent: random boolean
 */
const dancerPositionArb: fc.Arbitrary<DancerPosition> = fc.record({
  dancerId: uuidArb,
  pixelCoordinate: fc.tuple(
    fc.integer({ min: 0, max: 1920 }),
    fc.integer({ min: 0, max: 1080 }),
  ) as fc.Arbitrary<[number, number]>,
  floorCoordinate: fc.tuple(
    fc.float({ min: 0, max: 1, noNaN: true }),
    fc.float({ min: 0, max: 1, noNaN: true }),
  ) as fc.Arbitrary<[number, number]>,
  absent: fc.boolean(),
});

/**
 * Arbitrary for a Session that contains one Formation with a random set of
 * DancerPosition records. The session has a single timestamp so the formation
 * structure is minimal but valid.
 */
const sessionWithDancerPositionsArb = fc
  .record({
    sessionId: uuidArb,
    timestampId: uuidArb,
    dancerPositions: fc.array(dancerPositionArb, { minLength: 0, maxLength: 10 }),
  })
  .map(({ sessionId, timestampId, dancerPositions }) => {
    const formation: Formation = {
      timestampId,
      timestampSeconds: 0,
      dancerPositions,
      opfsFramePath: `sessions/${sessionId}/frames/${timestampId}.jpg`,
      opfsFormationImagePath: `sessions/${sessionId}/formations/${timestampId}.png`,
    };

    const session: Session = {
      id: sessionId,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      youtubeUrl: `https://www.youtube.com/watch?v=${sessionId.slice(0, 11)}`,
      videoId: sessionId.slice(0, 11),
      videoTitle: `Video ${sessionId.slice(0, 8)}`,
      videoDurationSeconds: 120,
      thumbnailUrl: `https://img.youtube.com/vi/${sessionId.slice(0, 11)}/0.jpg`,
      timestamps: [
        {
          id: timestampId,
          valueSeconds: 0,
          label: '00:00:00',
        },
      ],
      dancerProfiles: [],
      environmentType: 'stage',
      depthCalibration: {
        homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        environmentType: 'stage',
        confidence: 0.9,
        frameIndex: 0,
      },
      formations: [formation],
      opfsVideoPath: `sessions/${sessionId}/video.mp4`,
    };

    return { session, dancerPositions };
  });

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SessionStore — Property 5: Dancer position storage round-trip', () => {
  // Feature: dance-formation-app, Property 5: Dancer position storage round-trip

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
    'Property 5: dancer positions survive a saveSession / loadSession round-trip with identical IDs, pixel coordinates, floor coordinates, and absent flags',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionWithDancerPositionsArb,
          async ({ session, dancerPositions }) => {
            // Re-initialise stores for each property iteration
            idbStore = new Map();
            opfsFiles = new Map();

            const store = new SessionStore();

            // --- Act: save the session ---
            await store.saveSession(session);

            // --- Act: load the session back ---
            const loaded = await store.loadSession(session.id);

            // The session must be found
            expect(loaded).not.toBeNull();

            // There must be exactly one formation
            expect(loaded!.formations).toHaveLength(1);

            const loadedPositions = loaded!.formations[0].dancerPositions;

            // The number of dancer positions must be preserved
            expect(loadedPositions).toHaveLength(dancerPositions.length);

            // Each position must be identical to the original
            for (let i = 0; i < dancerPositions.length; i++) {
              const original = dancerPositions[i];
              const restored = loadedPositions[i];

              // Dancer ID must be identical
              expect(restored.dancerId).toBe(original.dancerId);

              // Pixel coordinates must be identical
              expect(restored.pixelCoordinate[0]).toBe(original.pixelCoordinate[0]);
              expect(restored.pixelCoordinate[1]).toBe(original.pixelCoordinate[1]);

              // Floor coordinates must be identical
              expect(restored.floorCoordinate[0]).toBe(original.floorCoordinate[0]);
              expect(restored.floorCoordinate[1]).toBe(original.floorCoordinate[1]);

              // Absent flag must be identical
              expect(restored.absent).toBe(original.absent);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
