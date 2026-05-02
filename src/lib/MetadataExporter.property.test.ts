// Feature: dance-formation-app, Property 3: Session metadata JSON round-trip

/**
 * Property-based tests for MetadataExporter — Property 3
 *
 * Property 3: Session metadata JSON round-trip
 *
 * For any valid Session object, calling exportSession then importSession
 * SHALL produce an equivalent session with identical youtubeUrl, timestamps,
 * dancerProfiles, and environmentType.
 *
 * **Validates: Requirements 9.3, 9.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MetadataExporter } from './MetadataExporter';
import type { Session, Timestamp, DancerProfile, EnvironmentType } from '../types/index';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A few valid YouTube URL patterns. */
const youtubeUrlArb: fc.Arbitrary<string> = fc.constantFrom(
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=abcdefghijk',
  'https://youtu.be/XXXXXXXXXXX',
);

/** Generates a single Timestamp record. */
const timestampArb: fc.Arbitrary<Timestamp> = fc.record({
  id: fc.uuid(),
  valueSeconds: fc.float({ min: 0, max: Math.fround(7200), noNaN: true }),
  label: fc.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
});

/** Generates a single DancerProfile record (no customName — tests undefined→undefined). */
const dancerProfileArb: fc.Arbitrary<DancerProfile> = fc.record({
  id: fc.uuid(),
  numericLabel: fc.integer({ min: 1, max: 99 }),
  visualDescription: fc.string({ minLength: 1, maxLength: 80 }),
  thumbnailDataUrl: fc.constant(''),
  // customName intentionally omitted so it is undefined — the round-trip must
  // preserve undefined (exported as null, imported back as undefined).
});

/** Generates a valid EnvironmentType. */
const environmentTypeArb: fc.Arbitrary<EnvironmentType> = fc.constantFrom(
  'stage',
  'studio',
  'outdoor',
  'unknown',
  'manual',
);

/**
 * Generates a minimal but valid Session object containing only the fields
 * that exportSession / importSession round-trip.
 */
const sessionArb: fc.Arbitrary<Session> = fc.record({
  id: fc.uuid(),
  createdAt: fc.constant(new Date(0).toISOString()),
  updatedAt: fc.constant(new Date(0).toISOString()),
  youtubeUrl: youtubeUrlArb,
  videoId: fc.constant('dQw4w9WgXcQ'),
  videoTitle: fc.string({ minLength: 1, maxLength: 60 }),
  videoDurationSeconds: fc.float({ min: 1, max: Math.fround(7200), noNaN: true }),
  thumbnailUrl: fc.constant(''),
  timestamps: fc.array(timestampArb, { minLength: 0, maxLength: 5 }),
  dancerProfiles: fc.array(dancerProfileArb, { minLength: 0, maxLength: 5 }),
  environmentType: environmentTypeArb,
  depthCalibration: fc.constant({
    homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    environmentType: 'unknown' as EnvironmentType,
    confidence: 0,
    frameIndex: 0,
  }),
  formations: fc.constant([]),
  opfsVideoPath: fc.constant(''),
});

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('MetadataExporter — Property 3: Session metadata JSON round-trip', () => {
  it(
    'Property 3: exportSession then importSession preserves youtubeUrl, timestamps, dancerProfiles, and environmentType',
    () => {
      const exporter = new MetadataExporter();

      fc.assert(
        fc.property(sessionArb, (session) => {
          // Round-trip: export → JSON stringify/parse → import
          const exported = exporter.exportSession(session);
          const json = JSON.parse(JSON.stringify(exported));
          const imported = exporter.importSession(json);

          // 1. youtubeUrl must be identical
          expect(imported.youtubeUrl).toBe(session.youtubeUrl);

          // 2. environmentType must be identical
          expect(imported.environmentType).toBe(session.environmentType);

          // 3. timestamps: same length, same id / valueSeconds / label per entry
          expect(imported.timestamps).toHaveLength(session.timestamps.length);
          for (let i = 0; i < session.timestamps.length; i++) {
            const orig = session.timestamps[i];
            const imp = imported.timestamps[i];
            expect(imp.id).toBe(orig.id);
            expect(imp.valueSeconds).toBe(orig.valueSeconds);
            expect(imp.label).toBe(orig.label);
          }

          // 4. dancerProfiles: same length, same id / numericLabel / visualDescription
          //    and equivalent customName (undefined in original → undefined in imported)
          expect(imported.dancerProfiles).toHaveLength(session.dancerProfiles.length);
          for (let i = 0; i < session.dancerProfiles.length; i++) {
            const orig = session.dancerProfiles[i];
            const imp = imported.dancerProfiles[i];
            expect(imp.id).toBe(orig.id);
            expect(imp.numericLabel).toBe(orig.numericLabel);
            expect(imp.visualDescription).toBe(orig.visualDescription);
            // customName: undefined in original must remain undefined after import
            expect(imp.customName).toBe(orig.customName);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});

// Feature: dance-formation-app, Property 8: Incomplete session export uses null for missing fields

/**
 * Property-based tests for MetadataExporter — Property 8
 *
 * Property 8: Incomplete session export uses null for missing fields
 *
 * For any Session where one or more optional fields (e.g., `formationImageFilename`)
 * have not been populated, the exported JSON SHALL include those fields with a `null`
 * value rather than omitting them.
 *
 * Specifically:
 * 1. Every timestamp entry in the exported JSON has a `formationImageFilename` key (even if null)
 * 2. Every dancer profile entry in the exported JSON has a `customName` key (even if null)
 * 3. When a timestamp has no matching formation, `formationImageFilename` is null (not undefined, not absent)
 * 4. When a dancer profile has no `customName`, `customName` is null (not undefined, not absent)
 *
 * **Validates: Requirements 9.5**
 */

import type { Formation } from '../types/index';

// ---------------------------------------------------------------------------
// Arbitraries for Property 8
// ---------------------------------------------------------------------------

/** Generates a Timestamp with an optional matching Formation. */
const timestampWithOptionalFormationArb = fc.record({
  timestamp: timestampArb,
  hasFormation: fc.boolean(),
});

/** Generates a DancerProfile with an optional customName. */
const dancerProfileWithOptionalNameArb: fc.Arbitrary<DancerProfile> = fc.oneof(
  // Profile without customName (undefined)
  fc.record({
    id: fc.uuid(),
    numericLabel: fc.integer({ min: 1, max: 99 }),
    visualDescription: fc.string({ minLength: 1, maxLength: 80 }),
    thumbnailDataUrl: fc.constant(''),
  }),
  // Profile with customName set
  fc.record({
    id: fc.uuid(),
    numericLabel: fc.integer({ min: 1, max: 99 }),
    customName: fc.string({ minLength: 1, maxLength: 40 }),
    visualDescription: fc.string({ minLength: 1, maxLength: 80 }),
    thumbnailDataUrl: fc.constant(''),
  }),
);

/**
 * Generates a Session with varying degrees of completeness:
 * - Some timestamps may have a matching formation, others may not
 * - Some dancer profiles may have a customName, others may not
 */
const incompleteSessionArb: fc.Arbitrary<{
  session: Session;
  timestampsWithFormation: Set<string>;
  dancerIdsWithoutName: Set<string>;
}> = fc
  .record({
    id: fc.uuid(),
    createdAt: fc.constant(new Date(0).toISOString()),
    updatedAt: fc.constant(new Date(0).toISOString()),
    youtubeUrl: youtubeUrlArb,
    videoId: fc.constant('dQw4w9WgXcQ'),
    videoTitle: fc.string({ minLength: 1, maxLength: 60 }),
    videoDurationSeconds: fc.float({ min: 1, max: Math.fround(7200), noNaN: true }),
    thumbnailUrl: fc.constant(''),
    timestampEntries: fc.array(timestampWithOptionalFormationArb, {
      minLength: 0,
      maxLength: 5,
    }),
    dancerProfiles: fc.array(dancerProfileWithOptionalNameArb, {
      minLength: 0,
      maxLength: 5,
    }),
    environmentType: environmentTypeArb,
    depthCalibration: fc.constant({
      homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      environmentType: 'unknown' as EnvironmentType,
      confidence: 0,
      frameIndex: 0,
    }),
    opfsVideoPath: fc.constant(''),
  })
  .map((raw) => {
    const timestamps = raw.timestampEntries.map((e) => e.timestamp);
    const timestampsWithFormation = new Set<string>();

    const formations: Formation[] = raw.timestampEntries
      .filter((e) => e.hasFormation)
      .map((e) => {
        timestampsWithFormation.add(e.timestamp.id);
        return {
          timestampId: e.timestamp.id,
          timestampSeconds: e.timestamp.valueSeconds,
          dancerPositions: [],
          opfsFramePath: `frames/${e.timestamp.id}.jpg`,
          opfsFormationImagePath: `formations/${e.timestamp.id}.png`,
        };
      });

    const dancerIdsWithoutName = new Set<string>(
      raw.dancerProfiles
        .filter((dp) => dp.customName === undefined)
        .map((dp) => dp.id),
    );

    const session: Session = {
      id: raw.id,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      youtubeUrl: raw.youtubeUrl,
      videoId: raw.videoId,
      videoTitle: raw.videoTitle,
      videoDurationSeconds: raw.videoDurationSeconds,
      thumbnailUrl: raw.thumbnailUrl,
      timestamps,
      dancerProfiles: raw.dancerProfiles,
      environmentType: raw.environmentType,
      depthCalibration: raw.depthCalibration,
      formations,
      opfsVideoPath: raw.opfsVideoPath,
    };

    return { session, timestampsWithFormation, dancerIdsWithoutName };
  });

// ---------------------------------------------------------------------------
// Property 8 test
// ---------------------------------------------------------------------------

describe('MetadataExporter — Property 8: Incomplete session export uses null for missing fields', () => {
  it(
    'Property 8: exportSession always includes formationImageFilename and customName keys, using null when absent',
    () => {
      const exporter = new MetadataExporter();

      fc.assert(
        fc.property(incompleteSessionArb, ({ session, timestampsWithFormation, dancerIdsWithoutName }) => {
          const exported = exporter.exportSession(session) as {
            session: {
              timestamps: Array<Record<string, unknown>>;
              dancerProfiles: Array<Record<string, unknown>>;
            };
          };

          const exportedSession = exported.session;

          // 1. Every timestamp entry has a `formationImageFilename` key
          for (const ts of exportedSession.timestamps) {
            expect(Object.prototype.hasOwnProperty.call(ts, 'formationImageFilename')).toBe(true);
          }

          // 2. Every dancer profile entry has a `customName` key
          for (const dp of exportedSession.dancerProfiles) {
            expect(Object.prototype.hasOwnProperty.call(dp, 'customName')).toBe(true);
          }

          // 3. Timestamps without a matching formation have formationImageFilename === null
          for (const ts of exportedSession.timestamps) {
            const tsId = ts['id'] as string;
            if (!timestampsWithFormation.has(tsId)) {
              expect(ts['formationImageFilename']).toBeNull();
            }
          }

          // 4. Dancer profiles without a customName have customName === null
          for (const dp of exportedSession.dancerProfiles) {
            const dpId = dp['id'] as string;
            if (dancerIdsWithoutName.has(dpId)) {
              expect(dp['customName']).toBeNull();
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
