/**
 * Persists a TimestampSession to disk as:
 *   outputs/<session-id>/metadata.json
 *
 * The `outputs/` folder lives at the project root (next to package.json).
 * It is created automatically if it doesn't exist.
 */

import fs from "fs";
import path from "path";
import { TimestampSession } from "@/types";

// Project root = two levels up from lib/
const PROJECT_ROOT = path.resolve(process.cwd());
const OUTPUTS_DIR = path.join(PROJECT_ROOT, "outputs");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write session metadata to outputs/<id>/metadata.json
 * Returns the absolute path of the written file.
 */
export function persistSession(session: TimestampSession): string {
  const sessionDir = path.join(OUTPUTS_DIR, session.id);
  ensureDir(sessionDir);

  const filePath = path.join(sessionDir, "metadata.json");

  const payload = {
    id: session.id,
    url: session.url,
    createdAt: session.createdAt,
    timestampCount: session.timestamps.length,
    timestamps: session.timestamps.map((t) => ({
      id: t.id,
      time: t.time,
      label: t.label || null,
    })),
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

/**
 * Read a session's metadata.json back from disk.
 * Returns null if the file doesn't exist.
 */
export function readPersistedSession(id: string): TimestampSession | null {
  const filePath = path.join(OUTPUTS_DIR, id, "metadata.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as TimestampSession;
  } catch {
    return null;
  }
}

/**
 * List all session IDs that have been persisted to disk.
 */
export function listPersistedSessionIds(): string[] {
  ensureDir(OUTPUTS_DIR);
  return fs
    .readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
