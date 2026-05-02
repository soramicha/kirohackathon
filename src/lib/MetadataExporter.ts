/**
 * MetadataExporter — serializes and deserializes Session objects to/from the
 * documented JSON export schema (session-export-v1.json).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  Timestamp,
  DancerProfile,
  EnvironmentType,
  DepthCalibration,
} from '../types/index';

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

const SCHEMA_URL = 'https://dance-formation-app/schemas/session-export-v1.json';
const SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Export schema types (internal)
// ---------------------------------------------------------------------------

interface ExportedTimestamp {
  id: string;
  valueSeconds: number;
  label: string;
  formationImageFilename: string | null;
}

interface ExportedDancerProfile {
  id: string;
  numericLabel: number;
  customName: string | null;
  visualDescription: string;
}

interface ExportedSession {
  youtubeUrl: string;
  videoTitle: string;
  videoDurationSeconds: number;
  environmentType: string;
  timestamps: ExportedTimestamp[];
  dancerProfiles: ExportedDancerProfile[];
}

interface ExportEnvelope {
  $schema: string;
  schemaVersion: string;
  exportedAt: string;
  session: ExportedSession;
}

// ---------------------------------------------------------------------------
// Default identity depth calibration
// ---------------------------------------------------------------------------

const DEFAULT_DEPTH_CALIBRATION: DepthCalibration = {
  homographyMatrix: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  environmentType: 'unknown',
  confidence: 0,
  frameIndex: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the YouTube video ID from a URL.
 * Supports watch?v=, youtu.be/, and shorts/ patterns.
 * Returns empty string if no ID can be extracted.
 */
function extractVideoId(youtubeUrl: string): string {
  try {
    // youtu.be/<id>
    const shortMatch = youtubeUrl.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];

    // youtube.com/watch?v=<id>
    const watchMatch = youtubeUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];

    // youtube.com/shorts/<id>
    const shortsMatch = youtubeUrl.match(/shorts\/([A-Za-z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
  } catch {
    // fall through
  }
  return '';
}

/**
 * Derives a thumbnail URL from a YouTube video ID.
 * Returns empty string if videoId is empty.
 */
function thumbnailUrlFromVideoId(videoId: string): string {
  if (!videoId) return '';
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ---------------------------------------------------------------------------
// Validation helpers for importSession
// ---------------------------------------------------------------------------

function assertString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new Error(
      `Import error: expected string at "${fieldPath}", got ${typeof value}.`
    );
  }
  return value;
}

function assertNumber(value: unknown, fieldPath: string): number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(
      `Import error: expected finite number at "${fieldPath}", got ${typeof value}.`
    );
  }
  return value;
}

function assertArray(value: unknown, fieldPath: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Import error: expected array at "${fieldPath}", got ${typeof value}.`
    );
  }
  return value;
}

function assertObject(value: unknown, fieldPath: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `Import error: expected object at "${fieldPath}", got ${value === null ? 'null' : typeof value}.`
    );
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MetadataExporter class
// ---------------------------------------------------------------------------

export class MetadataExporter {
  // -------------------------------------------------------------------------
  // exportSession
  // -------------------------------------------------------------------------

  /**
   * Serializes a Session to the documented JSON export schema.
   *
   * - `formationImageFilename`: resolved from `session.formations` by matching
   *   `timestampId`; uses `opfsFormationImagePath` when found, otherwise `null`.
   * - `customName`: always present — `null` when `DancerProfile.customName` is
   *   undefined, otherwise the string value.
   * - All optional fields are present with `null` rather than absent.
   *
   * @param session - The Session to export.
   * @returns A plain object conforming to the export schema.
   */
  exportSession(session: Session): object {
    const now = new Date().toISOString();

    // Build a lookup map from timestampId → opfsFormationImagePath
    const formationMap = new Map<string, string>();
    for (const formation of session.formations) {
      formationMap.set(formation.timestampId, formation.opfsFormationImagePath);
    }

    const exportedTimestamps: ExportedTimestamp[] = session.timestamps.map((ts) => {
      const opfsPath = formationMap.get(ts.id);
      return {
        id: ts.id,
        valueSeconds: ts.valueSeconds,
        label: ts.label,
        formationImageFilename: opfsPath !== undefined ? opfsPath : null,
      };
    });

    const exportedDancerProfiles: ExportedDancerProfile[] = session.dancerProfiles.map(
      (dp) => ({
        id: dp.id,
        numericLabel: dp.numericLabel,
        customName: dp.customName !== undefined ? dp.customName : null,
        visualDescription: dp.visualDescription,
      })
    );

    const envelope: ExportEnvelope = {
      $schema: SCHEMA_URL,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now,
      session: {
        youtubeUrl: session.youtubeUrl,
        videoTitle: session.videoTitle,
        videoDurationSeconds: session.videoDurationSeconds,
        environmentType: session.environmentType,
        timestamps: exportedTimestamps,
        dancerProfiles: exportedDancerProfiles,
      },
    };

    return envelope;
  }

  // -------------------------------------------------------------------------
  // importSession
  // -------------------------------------------------------------------------

  /**
   * Parses and validates the export JSON, then reconstructs a Session object.
   *
   * Fields not present in the export schema receive sensible defaults:
   * - `id`: new UUID
   * - `videoId`: extracted from `youtubeUrl` or empty string
   * - `createdAt` / `updatedAt`: current ISO timestamp
   * - `thumbnailUrl`: derived from videoId or empty string
   * - `depthCalibration`: identity matrix defaults
   * - `formations`: empty array
   * - `opfsVideoPath`: empty string
   *
   * @param json - The raw parsed JSON value (unknown type for safety).
   * @returns A reconstructed Session object.
   * @throws {Error} if the JSON is malformed or missing required fields.
   */
  importSession(json: unknown): Session {
    const root = assertObject(json, '$root');

    // Validate schema version (warn but don't reject on mismatch)
    if (root.schemaVersion !== SCHEMA_VERSION) {
      // Accept it anyway — forward-compatible by design
    }

    const sessionData = assertObject(root.session, 'session');

    const youtubeUrl = assertString(sessionData.youtubeUrl, 'session.youtubeUrl');
    const videoTitle = assertString(sessionData.videoTitle, 'session.videoTitle');
    const videoDurationSeconds = assertNumber(
      sessionData.videoDurationSeconds,
      'session.videoDurationSeconds'
    );
    const environmentTypeRaw = assertString(
      sessionData.environmentType,
      'session.environmentType'
    );

    // Validate environmentType is one of the allowed values
    const validEnvironmentTypes: EnvironmentType[] = [
      'stage',
      'studio',
      'outdoor',
      'unknown',
      'manual',
    ];
    if (!validEnvironmentTypes.includes(environmentTypeRaw as EnvironmentType)) {
      throw new Error(
        `Import error: invalid environmentType "${environmentTypeRaw}". ` +
          `Must be one of: ${validEnvironmentTypes.join(', ')}.`
      );
    }
    const environmentType = environmentTypeRaw as EnvironmentType;

    // Parse timestamps
    const rawTimestamps = assertArray(sessionData.timestamps, 'session.timestamps');
    const timestamps: Timestamp[] = rawTimestamps.map((item, i) => {
      const ts = assertObject(item, `session.timestamps[${i}]`);
      return {
        id: assertString(ts.id, `session.timestamps[${i}].id`),
        valueSeconds: assertNumber(ts.valueSeconds, `session.timestamps[${i}].valueSeconds`),
        label: assertString(ts.label, `session.timestamps[${i}].label`),
      };
    });

    // Parse dancerProfiles
    const rawProfiles = assertArray(
      sessionData.dancerProfiles,
      'session.dancerProfiles'
    );
    const dancerProfiles: DancerProfile[] = rawProfiles.map((item, i) => {
      const dp = assertObject(item, `session.dancerProfiles[${i}]`);
      const id = assertString(dp.id, `session.dancerProfiles[${i}].id`);
      const numericLabel = assertNumber(
        dp.numericLabel,
        `session.dancerProfiles[${i}].numericLabel`
      );
      const visualDescription = assertString(
        dp.visualDescription,
        `session.dancerProfiles[${i}].visualDescription`
      );

      // customName may be null (exported as null) or a string
      let customName: string | undefined;
      if (dp.customName === null || dp.customName === undefined) {
        customName = undefined;
      } else {
        customName = assertString(dp.customName, `session.dancerProfiles[${i}].customName`);
      }

      return {
        id,
        numericLabel,
        customName,
        visualDescription,
        // thumbnailDataUrl is not in the export schema — default to empty string
        thumbnailDataUrl: '',
      };
    });

    // Derive fields not present in the export schema
    const now = new Date().toISOString();
    const videoId = extractVideoId(youtubeUrl);
    const thumbnailUrl = thumbnailUrlFromVideoId(videoId);

    const depthCalibration: DepthCalibration = {
      ...DEFAULT_DEPTH_CALIBRATION,
      environmentType,
    };

    const session: Session = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      youtubeUrl,
      videoId,
      videoTitle,
      videoDurationSeconds,
      thumbnailUrl,
      timestamps,
      dancerProfiles,
      environmentType,
      depthCalibration,
      formations: [],
      opfsVideoPath: '',
    };

    return session;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const metadataExporter = new MetadataExporter();
