/**
 * Unit tests for MetadataExporter
 * Requirements: 9.2, 9.3
 */

import { describe, it, expect } from 'vitest';
import { MetadataExporter } from './MetadataExporter';
import type { Session, EnvironmentType } from '../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid Session for export tests. */
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-id-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    videoTitle: 'Test Video',
    videoDurationSeconds: 300,
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    timestamps: [
      { id: 'ts-1', valueSeconds: 10, label: '00:00:10' },
      { id: 'ts-2', valueSeconds: 60, label: '00:01:00' },
    ],
    dancerProfiles: [
      {
        id: 'dp-1',
        numericLabel: 1,
        customName: 'Alice',
        visualDescription: 'Dancer in red',
        thumbnailDataUrl: '',
      },
      {
        id: 'dp-2',
        numericLabel: 2,
        customName: undefined,
        visualDescription: 'Dancer in blue',
        thumbnailDataUrl: '',
      },
    ],
    environmentType: 'stage',
    depthCalibration: {
      homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      environmentType: 'stage',
      confidence: 0.9,
      frameIndex: 0,
    },
    formations: [],
    opfsVideoPath: '',
    ...overrides,
  };
}

/** Calls exportSession and JSON round-trips the result. */
function exportAndParse(exporter: MetadataExporter, session: Session): Record<string, unknown> {
  const exported = exporter.exportSession(session);
  return JSON.parse(JSON.stringify(exported)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema field names and data types
// ---------------------------------------------------------------------------

describe('MetadataExporter.exportSession — schema field names and data types', () => {
  const exporter = new MetadataExporter();

  it('exported object has $schema field', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(result).toHaveProperty('$schema');
  });

  it('exported object has schemaVersion field', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(result).toHaveProperty('schemaVersion');
  });

  it('exported object has exportedAt field', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(result).toHaveProperty('exportedAt');
  });

  it('exported object has session field', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(result).toHaveProperty('session');
  });

  it('schemaVersion is "1.0"', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(result.schemaVersion).toBe('1.0');
  });

  it('$schema contains the expected URL', () => {
    const result = exportAndParse(exporter, makeSession());
    expect(typeof result.$schema).toBe('string');
    expect(result.$schema as string).toContain('session-export-v1.json');
  });

  it('exportedAt is a valid ISO 8601 string', () => {
    const result = exportAndParse(exporter, makeSession());
    const date = new Date(result.exportedAt as string);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('session has youtubeUrl field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('youtubeUrl');
  });

  it('session has videoTitle field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('videoTitle');
  });

  it('session has videoDurationSeconds field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('videoDurationSeconds');
  });

  it('session has environmentType field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('environmentType');
  });

  it('session has timestamps field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('timestamps');
  });

  it('session has dancerProfiles field', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(session).toHaveProperty('dancerProfiles');
  });

  it('session.timestamps is an array', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(Array.isArray(session.timestamps)).toBe(true);
  });

  it('session.dancerProfiles is an array', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    expect(Array.isArray(session.dancerProfiles)).toBe(true);
  });

  it('each timestamp has id, valueSeconds, label, formationImageFilename fields', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    const timestamps = session.timestamps as Record<string, unknown>[];
    for (const ts of timestamps) {
      expect(ts).toHaveProperty('id');
      expect(ts).toHaveProperty('valueSeconds');
      expect(ts).toHaveProperty('label');
      expect(ts).toHaveProperty('formationImageFilename');
    }
  });

  it('each dancer profile has id, numericLabel, customName, visualDescription fields', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    const profiles = session.dancerProfiles as Record<string, unknown>[];
    for (const dp of profiles) {
      expect(dp).toHaveProperty('id');
      expect(dp).toHaveProperty('numericLabel');
      expect(dp).toHaveProperty('customName');
      expect(dp).toHaveProperty('visualDescription');
    }
  });

  it('dancer profile customName is a string when set', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    const profiles = session.dancerProfiles as Record<string, unknown>[];
    expect(typeof profiles[0].customName).toBe('string');
  });

  it('dancer profile customName is null when undefined on source', () => {
    const result = exportAndParse(exporter, makeSession());
    const session = result.session as Record<string, unknown>;
    const profiles = session.dancerProfiles as Record<string, unknown>[];
    expect(profiles[1].customName).toBeNull();
  });

  it('session field values match the source session', () => {
    const session = makeSession();
    const result = exportAndParse(exporter, session);
    const exportedSession = result.session as Record<string, unknown>;
    expect(exportedSession.youtubeUrl).toBe(session.youtubeUrl);
    expect(exportedSession.videoTitle).toBe(session.videoTitle);
    expect(exportedSession.videoDurationSeconds).toBe(session.videoDurationSeconds);
    expect(exportedSession.environmentType).toBe(session.environmentType);
  });
});

// ---------------------------------------------------------------------------
// importSession — rejects malformed JSON with a descriptive error
// ---------------------------------------------------------------------------

describe('MetadataExporter.importSession — rejects malformed JSON', () => {
  const exporter = new MetadataExporter();

  it('rejects null with an error', () => {
    expect(() => exporter.importSession(null)).toThrow();
  });

  it('rejects null with a descriptive error message', () => {
    expect(() => exporter.importSession(null)).toThrow(/import error/i);
  });

  it('rejects a string with an error', () => {
    expect(() => exporter.importSession('not an object')).toThrow();
  });

  it('rejects an object missing the session field', () => {
    expect(() => exporter.importSession({ schemaVersion: '1.0' })).toThrow();
  });

  it('rejects a session with missing youtubeUrl', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        videoTitle: 'Test',
        videoDurationSeconds: 100,
        environmentType: 'stage',
        timestamps: [],
        dancerProfiles: [],
      },
    };
    expect(() => exporter.importSession(json)).toThrow(/import error/i);
  });

  it('rejects a session with invalid environmentType', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test',
        videoDurationSeconds: 100,
        environmentType: 'invalid_type',
        timestamps: [],
        dancerProfiles: [],
      },
    };
    expect(() => exporter.importSession(json)).toThrow(/environmentType/i);
  });

  it('rejects a session with non-array timestamps', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test',
        videoDurationSeconds: 100,
        environmentType: 'stage',
        timestamps: 'not-an-array',
        dancerProfiles: [],
      },
    };
    expect(() => exporter.importSession(json)).toThrow(/import error/i);
  });
});

// ---------------------------------------------------------------------------
// importSession — accepts valid JSON and reconstructs a Session
// ---------------------------------------------------------------------------

describe('MetadataExporter.importSession — accepts valid JSON', () => {
  const exporter = new MetadataExporter();

  it('returns a Session with the correct youtubeUrl', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test Video',
        videoDurationSeconds: 300,
        environmentType: 'stage' as EnvironmentType,
        timestamps: [],
        dancerProfiles: [],
      },
    };
    const result = exporter.importSession(json);
    expect(result.youtubeUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('returns a Session with the correct environmentType', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test Video',
        videoDurationSeconds: 300,
        environmentType: 'outdoor',
        timestamps: [],
        dancerProfiles: [],
      },
    };
    const result = exporter.importSession(json);
    expect(result.environmentType).toBe('outdoor');
  });

  it('returns a Session with a generated id (non-empty string)', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test Video',
        videoDurationSeconds: 300,
        environmentType: 'stage',
        timestamps: [],
        dancerProfiles: [],
      },
    };
    const result = exporter.importSession(json);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('returns a Session with empty formations array', () => {
    const json = {
      schemaVersion: '1.0',
      session: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoTitle: 'Test Video',
        videoDurationSeconds: 300,
        environmentType: 'stage',
        timestamps: [],
        dancerProfiles: [],
      },
    };
    const result = exporter.importSession(json);
    expect(result.formations).toEqual([]);
  });
});
