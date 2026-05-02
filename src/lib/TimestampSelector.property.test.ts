// Feature: dance-formation-app, Property 1: Timestamp validation rejects out-of-range values

/**
 * Property-based tests for TimestampSelector — Property 1
 *
 * Property 1: Timestamp validation rejects out-of-range values
 *
 * Validates: Requirements 2.4, 2.5
 *
 * For any (duration, timestamp) pair where timestamp < 0 OR timestamp > duration,
 * addTimestamp SHALL:
 *   (a) return an error result (ok: false), and
 *   (b) leave the timestamp list length unchanged.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TimestampSelector } from './TimestampSelector';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates (duration, timestamp) pairs where the timestamp is out of range:
 *   - Either timestamp < 0 (negative)
 *   - Or timestamp > duration (exceeds video length)
 *
 * fc.float requires 32-bit float boundaries, so Math.fround is used on all
 * min/max constants.
 */
const outOfRangePairArb = fc.oneof(
  // Negative timestamp: duration is positive, timestamp is negative
  fc.tuple(
    fc.float({ min: Math.fround(0.1), max: Math.fround(3600), noNaN: true }),
    fc.float({ min: Math.fround(-3600), max: Math.fround(-0.001), noNaN: true }),
  ),
  // Timestamp exceeding duration: both in [0, 3600], filtered so t > d
  fc.tuple(
    fc.float({ min: Math.fround(0), max: Math.fround(3600), noNaN: true }),
    fc.float({ min: Math.fround(0), max: Math.fround(3600), noNaN: true }),
  ).filter(([d, t]) => t > d),
);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('TimestampSelector — Property 1: Timestamp validation rejects out-of-range values', () => {
  it(
    'Property 1: addTimestamp returns ok:false and list length is unchanged for out-of-range timestamps',
    () => {
      fc.assert(
        fc.property(outOfRangePairArb, ([duration, timestamp]) => {
          const selector = new TimestampSelector();

          // Record list length before the call
          const lengthBefore = selector.getTimestamps().length;

          // Attempt to add the out-of-range timestamp
          const result = selector.addTimestamp(timestamp, duration);

          // (a) Must return an error result
          expect(result.ok).toBe(false);

          // (b) List length must be unchanged
          expect(selector.getTimestamps().length).toBe(lengthBefore);
        }),
        { numRuns: 100 },
      );
    },
  );
});

// Feature: dance-formation-app, Property 2: Timestamp validation accepts in-range values

/**
 * Property-based tests for TimestampSelector — Property 2
 *
 * Property 2: Timestamp validation accepts in-range values
 *
 * Validates: Requirements 2.4
 *
 * For any (duration, timestamp) pair where 0 ≤ timestamp ≤ duration,
 * addTimestamp SHALL:
 *   (a) return a success result (ok: true), and
 *   (b) increase the timestamp list length by exactly one.
 */

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates (duration, timestamp) pairs where the timestamp is in range:
 *   0 ≤ timestamp ≤ duration
 *
 * Strategy:
 *   1. Generate a duration in [0.1, 3600] (32-bit float).
 *   2. Generate a ratio in [0, 1] and multiply by duration to get a timestamp
 *      that is guaranteed to be within [0, duration].
 */
const inRangePairArb = fc
  .float({ min: Math.fround(0.1), max: Math.fround(3600), noNaN: true })
  .chain((duration) =>
    fc
      .float({ min: 0, max: 1, noNaN: true })
      .map((ratio) => [duration, ratio * duration] as [number, number]),
  );

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('TimestampSelector — Property 2: Timestamp validation accepts in-range values', () => {
  it(
    'Property 2: addTimestamp returns ok:true and list length increases by one for in-range timestamps',
    () => {
      fc.assert(
        fc.property(inRangePairArb, ([duration, timestamp]) => {
          const selector = new TimestampSelector();

          // Record list length before the call
          const lengthBefore = selector.getTimestamps().length;

          // Attempt to add the in-range timestamp
          const result = selector.addTimestamp(timestamp, duration);

          // (a) Must return a success result
          expect(result.ok).toBe(true);

          // (b) List length must increase by exactly one
          expect(selector.getTimestamps().length).toBe(lengthBefore + 1);
        }),
        { numRuns: 100 },
      );
    },
  );
});
