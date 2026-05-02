/**
 * SessionStore — abstraction layer over OPFS (binary data) and IndexedDB (structured data).
 *
 * OPFS layout:
 *   /sessions/{sessionId}/video.mp4
 *   /sessions/{sessionId}/frames/{timestampId}.jpg
 *   /sessions/{sessionId}/formations/{timestampId}.png
 *
 * IndexedDB:
 *   database: "dance-formation-app", version: 1, store: "sessions"
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Session, SessionSummary } from '../types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'dance-formation-app';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

// ---------------------------------------------------------------------------
// Helpers — OPFS path resolution
// ---------------------------------------------------------------------------

function videoPath(sessionId: string): string[] {
  return ['sessions', sessionId, 'video.mp4'];
}

function framePath(sessionId: string, timestampId: string): string[] {
  return ['sessions', sessionId, 'frames', `${timestampId}.jpg`];
}

function formationImagePath(sessionId: string, timestampId: string): string[] {
  return ['sessions', sessionId, 'formations', `${timestampId}.png`];
}

/**
 * Resolve a path array to a FileSystemFileHandle inside OPFS.
 * Creates intermediate directories when `create` is true.
 */
async function resolveOPFSFile(
  segments: string[],
  create: boolean,
): Promise<FileSystemFileHandle> {
  const root = await navigator.storage.getDirectory();
  let dir: FileSystemDirectoryHandle = root;

  // Walk all segments except the last (which is the filename)
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i], { create });
  }

  const filename = segments[segments.length - 1];
  return dir.getFileHandle(filename, { create });
}

/**
 * Attempt to remove a file from OPFS. Silently ignores NotFoundError.
 */
async function removeOPFSFile(segments: string[]): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    let dir: FileSystemDirectoryHandle = root;

    for (let i = 0; i < segments.length - 1; i++) {
      dir = await dir.getDirectoryHandle(segments[i], { create: false });
    }

    const filename = segments[segments.length - 1];
    await dir.removeEntry(filename);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return; // already gone — that's fine
    }
    throw err;
  }
}

/**
 * Attempt to remove a directory (and all its contents) from OPFS.
 * Silently ignores NotFoundError.
 */
async function removeOPFSDirectory(segments: string[]): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    let parent: FileSystemDirectoryHandle = root;

    for (let i = 0; i < segments.length - 1; i++) {
      parent = await parent.getDirectoryHandle(segments[i], { create: false });
    }

    const dirName = segments[segments.length - 1];
    await parent.removeEntry(dirName, { recursive: true });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SessionStore class
// ---------------------------------------------------------------------------

export class SessionStore {
  private _db: IDBPDatabase | null = null;

  // -------------------------------------------------------------------------
  // IndexedDB initialisation (lazy)
  // -------------------------------------------------------------------------

  private async db(): Promise<IDBPDatabase> {
    if (this._db) return this._db;

    this._db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });

    return this._db;
  }

  // -------------------------------------------------------------------------
  // OPFS — binary data
  // -------------------------------------------------------------------------

  /**
   * Write video binary to `/sessions/{sessionId}/video.mp4`.
   */
  async writeVideo(sessionId: string, data: ArrayBuffer): Promise<void> {
    const fileHandle = await resolveOPFSFile(videoPath(sessionId), true);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /**
   * Read video binary from `/sessions/{sessionId}/video.mp4`.
   * Returns null if the file does not exist.
   */
  async readVideo(sessionId: string): Promise<ArrayBuffer | null> {
    try {
      const fileHandle = await resolveOPFSFile(videoPath(sessionId), false);
      const file = await fileHandle.getFile();
      return file.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return null;
      }
      throw new Error(
        `SessionStore.readVideo: failed to read video for session "${sessionId}": ${String(err)}`,
      );
    }
  }

  /**
   * Write a frame image to `/sessions/{sessionId}/frames/{timestampId}.jpg`.
   */
  async writeFrame(
    sessionId: string,
    timestampId: string,
    data: ArrayBuffer,
  ): Promise<void> {
    const fileHandle = await resolveOPFSFile(
      framePath(sessionId, timestampId),
      true,
    );
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /**
   * Read a frame image from `/sessions/{sessionId}/frames/{timestampId}.jpg`.
   * Returns null if the file does not exist.
   */
  async readFrame(
    sessionId: string,
    timestampId: string,
  ): Promise<ArrayBuffer | null> {
    try {
      const fileHandle = await resolveOPFSFile(
        framePath(sessionId, timestampId),
        false,
      );
      const file = await fileHandle.getFile();
      return file.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return null;
      }
      throw new Error(
        `SessionStore.readFrame: failed to read frame "${timestampId}" for session "${sessionId}": ${String(err)}`,
      );
    }
  }

  /**
   * Write a formation image to `/sessions/{sessionId}/formations/{timestampId}.png`.
   */
  async writeFormationImage(
    sessionId: string,
    timestampId: string,
    data: ArrayBuffer,
  ): Promise<void> {
    const fileHandle = await resolveOPFSFile(
      formationImagePath(sessionId, timestampId),
      true,
    );
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /**
   * Read a formation image from `/sessions/{sessionId}/formations/{timestampId}.png`.
   * Returns null if the file does not exist.
   */
  async readFormationImage(
    sessionId: string,
    timestampId: string,
  ): Promise<ArrayBuffer | null> {
    try {
      const fileHandle = await resolveOPFSFile(
        formationImagePath(sessionId, timestampId),
        false,
      );
      const file = await fileHandle.getFile();
      return file.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return null;
      }
      throw new Error(
        `SessionStore.readFormationImage: failed to read formation image "${timestampId}" for session "${sessionId}": ${String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // IndexedDB — structured data
  // -------------------------------------------------------------------------

  /**
   * Upsert a Session record in IndexedDB.
   */
  async saveSession(session: Session): Promise<void> {
    const database = await this.db();
    await database.put(STORE_NAME, session);
  }

  /**
   * Retrieve a Session by ID. Returns null if not found.
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const database = await this.db();
    const record = await database.get(STORE_NAME, sessionId);
    return record ?? null;
  }

  /**
   * Return a SessionSummary[] derived from all stored sessions.
   */
  async listSessions(): Promise<SessionSummary[]> {
    const database = await this.db();
    const all: Session[] = await database.getAll(STORE_NAME);
    return all.map((s) => ({
      id: s.id,
      videoTitle: s.videoTitle,
      youtubeUrl: s.youtubeUrl,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      timestampCount: s.timestamps.length,
      dancerCount: s.dancerProfiles.length,
    }));
  }

  /**
   * Atomically remove all OPFS files and the IndexedDB record for a session.
   *
   * Strategy (best-effort atomicity):
   *   1. Delete the OPFS session directory (recursive).
   *   2. Delete the IndexedDB record.
   *
   * If either step fails the error is re-thrown so the caller can handle it.
   * Deleting a non-existent session is a no-op (no error thrown).
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Step 1 — remove OPFS directory tree for this session
    await removeOPFSDirectory(['sessions', sessionId]);

    // Step 2 — remove IndexedDB record
    const database = await this.db();
    await database.delete(STORE_NAME, sessionId);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const sessionStore = new SessionStore();
