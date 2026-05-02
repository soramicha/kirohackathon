// Feature: dance-formation-app, Property 6: Formation floor coordinates are normalized

/**
 * Property-based tests for FormationMapper — Property 6
 *
 * Property 6: Formation floor coordinates are normalized
 *
 * Validates: Requirements 7.1, 7.2
 *
 * For any set of pixel coordinates projected through FormationMapper.projectToFloor,
 * all resulting floor coordinates SHALL have x ∈ [0, 1] and y ∈ [0, 1].
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { FormationMapper } from './FormationMapper';
import type { PixelCoordinate, HomographyMatrix } from '../types/index';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a single pixel coordinate with a stable dancer ID.
 * Pixel values are in a realistic range (0–1920 × 0–1080) but can be any
 * finite float — the homography may project them outside [0,1], which is
 * exactly what the clamping behavior must handle.
 */
const pixelCoordArb: fc.Arbitrary<PixelCoordinate> = fc.record({
  dancerId: fc.uuid(),
  x: fc.float({ min: Math.fround(-1920), max: Math.fround(1920), noNaN: true }),
  y: fc.float({ min: Math.fround(-1080), max: Math.fround(1080), noNaN: true }),
});

/**
 * Generates a valid 3×3 homography matrix.
 *
 * Constraints:
 * - All entries are finite 32-bit floats in a reasonable range to avoid
 *   extreme numerical instability.
 * - The bottom-right entry (H[2][2]) is kept positive so that the
 *   perspective division w' is non-zero for typical inputs.
 */
const homographyArb: fc.Arbitrary<HomographyMatrix> = fc.tuple(
  // Row 0
  fc.tuple(
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
  ),
  // Row 1
  fc.tuple(
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
    fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
  ),
  // Row 2 — keep H[2][2] positive to avoid degenerate perspective division
  fc.tuple(
    fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true }),
    fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true }),
    fc.float({ min: Math.fround(0.1), max: Math.fround(2), noNaN: true }),
  ),
).map(([r0, r1, r2]) => [
  [r0[0], r0[1], r0[2]],
  [r1[0], r1[1], r1[2]],
  [r2[0], r2[1], r2[2]],
]);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('FormationMapper — Property 6: Formation floor coordinates are normalized', () => {
  it(
    'Property 6: all projected floor coordinates have x ∈ [0, 1] and y ∈ [0, 1]',
    () => {
      const mapper = new FormationMapper();

      fc.assert(
        fc.property(
          fc.array(pixelCoordArb, { minLength: 0, maxLength: 20 }),
          homographyArb,
          (pixelCoords, H) => {
            const floorCoords = mapper.projectToFloor(pixelCoords, H);

            // Same number of outputs as inputs
            expect(floorCoords).toHaveLength(pixelCoords.length);

            // Every coordinate must be in [0, 1]
            for (const coord of floorCoords) {
              expect(coord.x).toBeGreaterThanOrEqual(0);
              expect(coord.x).toBeLessThanOrEqual(1);
              expect(coord.y).toBeGreaterThanOrEqual(0);
              expect(coord.y).toBeLessThanOrEqual(1);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
