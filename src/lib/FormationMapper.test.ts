/**
 * Unit tests for FormationMapper
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormationMapper } from './FormationMapper';
import type {
  DepthCalibration,
  PixelCoordinate,
  FloorCoordinate,
  DancerProfile,
} from '../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Identity 3×3 homography matrix. */
const IDENTITY_H = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Builds a minimal DepthCalibration with the given homography matrix. */
function makeCalibration(matrix: number[][]): DepthCalibration {
  return {
    homographyMatrix: matrix,
    environmentType: 'stage',
    confidence: 0.9,
    frameIndex: 0,
  };
}

/** Builds a minimal DancerProfile. */
function makeProfile(
  id: string,
  numericLabel: number,
  customName?: string
): DancerProfile {
  return {
    id,
    numericLabel,
    customName,
    visualDescription: 'test dancer',
    thumbnailDataUrl: '',
  };
}

// ---------------------------------------------------------------------------
// computeHomography
// ---------------------------------------------------------------------------

describe('FormationMapper.computeHomography', () => {
  let mapper: FormationMapper;

  beforeEach(() => {
    mapper = new FormationMapper();
  });

  it('returns the stored 3×3 matrix unchanged', () => {
    const H = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const result = mapper.computeHomography(makeCalibration(H));
    expect(result).toEqual(H);
  });

  it('returns the identity matrix when calibration stores identity', () => {
    const result = mapper.computeHomography(makeCalibration(IDENTITY_H));
    expect(result).toEqual(IDENTITY_H);
  });

  it('throws when the matrix has fewer than 3 rows', () => {
    const bad = [[1, 0, 0], [0, 1, 0]];
    expect(() => mapper.computeHomography(makeCalibration(bad))).toThrow();
  });

  it('throws when the matrix has more than 3 rows', () => {
    const bad = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]];
    expect(() => mapper.computeHomography(makeCalibration(bad))).toThrow();
  });

  it('throws when a row has fewer than 3 columns', () => {
    const bad = [[1, 0], [0, 1, 0], [0, 0, 1]];
    expect(() => mapper.computeHomography(makeCalibration(bad))).toThrow();
  });

  it('throws when a row has more than 3 columns', () => {
    const bad = [[1, 0, 0, 0], [0, 1, 0], [0, 0, 1]];
    expect(() => mapper.computeHomography(makeCalibration(bad))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// projectToFloor
// ---------------------------------------------------------------------------

describe('FormationMapper.projectToFloor', () => {
  let mapper: FormationMapper;

  beforeEach(() => {
    mapper = new FormationMapper();
  });

  it('returns an empty array for empty input', () => {
    const result = mapper.projectToFloor([], IDENTITY_H);
    expect(result).toEqual([]);
  });

  it('preserves dancerId from input coordinates', () => {
    const coords: PixelCoordinate[] = [{ dancerId: 'dancer-1', x: 0.5, y: 0.5 }];
    const result = mapper.projectToFloor(coords, IDENTITY_H);
    expect(result[0].dancerId).toBe('dancer-1');
  });

  it('maps (0.5, 0.5) through identity homography to (0.5, 0.5)', () => {
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0.5, y: 0.5 }];
    const result = mapper.projectToFloor(coords, IDENTITY_H);
    expect(result[0].x).toBeCloseTo(0.5);
    expect(result[0].y).toBeCloseTo(0.5);
  });

  it('maps (0, 0) through identity homography to (0, 0)', () => {
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0, y: 0 }];
    const result = mapper.projectToFloor(coords, IDENTITY_H);
    expect(result[0].x).toBeCloseTo(0);
    expect(result[0].y).toBeCloseTo(0);
  });

  it('clamps negative projected x to 0', () => {
    const H = [
      [1, 0, -100],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0, y: 0 }];
    const result = mapper.projectToFloor(coords, H);
    expect(result[0].x).toBe(0);
  });

  it('clamps projected x > 1 to 1', () => {
    const H = [
      [1, 0, 100],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0, y: 0 }];
    const result = mapper.projectToFloor(coords, H);
    expect(result[0].x).toBe(1);
  });

  it('clamps negative projected y to 0', () => {
    const H = [
      [1, 0, 0],
      [0, 1, -100],
      [0, 0, 1],
    ];
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0, y: 0 }];
    const result = mapper.projectToFloor(coords, H);
    expect(result[0].y).toBe(0);
  });

  it('clamps projected y > 1 to 1', () => {
    const H = [
      [1, 0, 0],
      [0, 1, 100],
      [0, 0, 1],
    ];
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0, y: 0 }];
    const result = mapper.projectToFloor(coords, H);
    expect(result[0].y).toBe(1);
  });

  it('applies perspective division correctly', () => {
    const H = [
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 2],
    ];
    const coords: PixelCoordinate[] = [{ dancerId: 'd1', x: 0.2, y: 0.1 }];
    const result = mapper.projectToFloor(coords, H);
    expect(result[0].x).toBeCloseTo(0.2);
    expect(result[0].y).toBeCloseTo(0.15);
  });

  it('returns the same number of coordinates as input', () => {
    const coords: PixelCoordinate[] = [
      { dancerId: 'd1', x: 0.1, y: 0.2 },
      { dancerId: 'd2', x: 0.5, y: 0.5 },
      { dancerId: 'd3', x: 0.9, y: 0.8 },
    ];
    const result = mapper.projectToFloor(coords, IDENTITY_H);
    expect(result).toHaveLength(3);
  });

  it('all output coordinates are in [0, 1]', () => {
    const coords: PixelCoordinate[] = [
      { dancerId: 'd1', x: 0, y: 0 },
      { dancerId: 'd2', x: 0.5, y: 0.5 },
      { dancerId: 'd3', x: 1, y: 1 },
    ];
    const result = mapper.projectToFloor(coords, IDENTITY_H);
    for (const fc of result) {
      expect(fc.x).toBeGreaterThanOrEqual(0);
      expect(fc.x).toBeLessThanOrEqual(1);
      expect(fc.y).toBeGreaterThanOrEqual(0);
      expect(fc.y).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// renderFormationImage
// ---------------------------------------------------------------------------

describe('FormationMapper.renderFormationImage', () => {
  let mapper: FormationMapper;

  beforeEach(() => {
    mapper = new FormationMapper();
  });

  it('returns an HTMLCanvasElement', () => {
    const canvas = mapper.renderFormationImage([], []);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('returns a canvas with width 800', () => {
    const canvas = mapper.renderFormationImage([], []);
    expect(canvas.width).toBe(800);
  });

  it('returns a canvas with height 600', () => {
    const canvas = mapper.renderFormationImage([], []);
    expect(canvas.height).toBe(600);
  });

  it('returns a non-null canvas when coords and profiles are empty', () => {
    const canvas = mapper.renderFormationImage([], []);
    expect(canvas).not.toBeNull();
  });

  it('renders without throwing when coords have matching profiles', () => {
    const coords: FloorCoordinate[] = [
      { dancerId: 'p1', x: 0.25, y: 0.5 },
      { dancerId: 'p2', x: 0.75, y: 0.5 },
    ];
    const profiles: DancerProfile[] = [
      makeProfile('p1', 1, 'Alice'),
      makeProfile('p2', 2),
    ];
    expect(() => mapper.renderFormationImage(coords, profiles)).not.toThrow();
  });

  it('renders without throwing when no matching profile is found', () => {
    const coords: FloorCoordinate[] = [{ dancerId: 'unknown', x: 0.5, y: 0.5 }];
    const profiles: DancerProfile[] = [];
    expect(() => mapper.renderFormationImage(coords, profiles)).not.toThrow();
  });

  it('renders without throwing for a single dancer at each corner', () => {
    const coords: FloorCoordinate[] = [
      { dancerId: 'd1', x: 0, y: 0 },
      { dancerId: 'd2', x: 1, y: 0 },
      { dancerId: 'd3', x: 0, y: 1 },
      { dancerId: 'd4', x: 1, y: 1 },
    ];
    const profiles = coords.map((c, i) => makeProfile(c.dancerId, i + 1));
    expect(() => mapper.renderFormationImage(coords, profiles)).not.toThrow();
  });
});
