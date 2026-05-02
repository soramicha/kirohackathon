/**
 * FormationMapper — applies perspective homography to produce top-down floor
 * coordinates and renders formation images to an HTML Canvas.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type {
  DepthCalibration,
  HomographyMatrix,
  PixelCoordinate,
  FloorCoordinate,
  DancerProfile,
} from '../types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/** Radius (px) of each dancer circle on the formation canvas. */
const DANCER_RADIUS = 14;

/** Font used for dancer labels. */
const LABEL_FONT = 'bold 12px sans-serif';

/** Grid line color. */
const GRID_COLOR = '#d0d0d0';

/** Default dancer fill color. */
const DANCER_FILL = '#4a90d9';

/** Dancer label text color. */
const LABEL_COLOR = '#ffffff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamps `value` to the closed interval [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Multiplies a 3×3 matrix by a 3-element column vector.
 *
 * Returns the resulting 3-element vector [x', y', w'].
 */
function matVec3(M: number[][], v: [number, number, number]): [number, number, number] {
  const x = M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2];
  const y = M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2];
  const w = M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2];
  return [x, y, w];
}

// ---------------------------------------------------------------------------
// FormationMapper class
// ---------------------------------------------------------------------------

export class FormationMapper {
  // -------------------------------------------------------------------------
  // computeHomography
  // -------------------------------------------------------------------------

  /**
   * Derives a 3×3 perspective homography matrix from the stored calibration.
   *
   * The `DepthCalibration.homographyMatrix` already contains the computed
   * homography, so this method validates the shape and returns it directly.
   *
   * @throws {Error} if the matrix is not exactly 3×3.
   */
  computeHomography(depthCalibration: DepthCalibration): HomographyMatrix {
    const H = depthCalibration.homographyMatrix;

    if (!Array.isArray(H) || H.length !== 3) {
      throw new Error(
        `HomographyMatrix must have exactly 3 rows, got ${Array.isArray(H) ? H.length : typeof H}.`
      );
    }

    for (let i = 0; i < 3; i++) {
      if (!Array.isArray(H[i]) || H[i].length !== 3) {
        throw new Error(
          `HomographyMatrix row ${i} must have exactly 3 columns, got ${
            Array.isArray(H[i]) ? H[i].length : typeof H[i]
          }.`
        );
      }
    }

    return H;
  }

  // -------------------------------------------------------------------------
  // projectToFloor
  // -------------------------------------------------------------------------

  /**
   * Applies the 3×3 homography matrix H to each pixel coordinate using
   * perspective projection:
   *
   *   [x', y', w'] = H * [px, py, 1]
   *   normalized_x = x' / w'
   *   normalized_y = y' / w'
   *
   * Results are clamped to [0, 1] × [0, 1].
   *
   * @param pixelCoords - Array of pixel coordinates with dancer IDs.
   * @param H           - 3×3 homography matrix.
   * @returns Array of floor coordinates with the same dancer IDs.
   */
  projectToFloor(pixelCoords: PixelCoordinate[], H: HomographyMatrix): FloorCoordinate[] {
    return pixelCoords.map((coord) => {
      const [xPrime, yPrime, wPrime] = matVec3(H, [coord.x, coord.y, 1]);

      // Guard against degenerate w (perspective division by zero).
      const w = wPrime === 0 ? 1e-10 : wPrime;

      const normalizedX = clamp(xPrime / w, 0, 1);
      const normalizedY = clamp(yPrime / w, 0, 1);

      return {
        dancerId: coord.dancerId,
        x: normalizedX,
        y: normalizedY,
      };
    });
  }

  // -------------------------------------------------------------------------
  // renderFormationImage
  // -------------------------------------------------------------------------

  /**
   * Renders a top-down formation diagram to an HTMLCanvasElement (800×600 px).
   *
   * - Draws a light-gray floor grid (lines every 10% of width/height).
   * - Places a filled circle for each dancer at their normalized position
   *   (scaled to canvas dimensions).
   * - Labels each circle with `DancerProfile.customName ?? numericLabel`.
   *   Falls back to the array index when no matching profile is found.
   *
   * @param coords   - Normalized floor coordinates for each dancer.
   * @param profiles - Dancer profiles used for label lookup.
   * @returns The rendered HTMLCanvasElement.
   */
  renderFormationImage(
    coords: FloorCoordinate[],
    profiles: DancerProfile[]
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Return blank canvas if context is unavailable (e.g., headless env without canvas support).
      return canvas;
    }

    // -- Background ----------------------------------------------------------
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // -- Floor grid ----------------------------------------------------------
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // Vertical lines at 10% intervals (0%, 10%, …, 100%)
    for (let i = 0; i <= 10; i++) {
      const x = Math.round((i / 10) * CANVAS_WIDTH);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Horizontal lines at 10% intervals
    for (let i = 0; i <= 10; i++) {
      const y = Math.round((i / 10) * CANVAS_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // -- Dancer circles & labels --------------------------------------------
    coords.forEach((coord, index) => {
      // Look up the matching profile by dancerId.
      const profile = profiles.find((p) => p.id === coord.dancerId);

      // Determine label: customName → numericLabel → array index.
      const label =
        profile != null
          ? String(profile.customName ?? profile.numericLabel)
          : String(index);

      // Scale normalized coordinates to canvas pixels.
      const cx = coord.x * CANVAS_WIDTH;
      const cy = coord.y * CANVAS_HEIGHT;

      // Draw filled circle.
      ctx.beginPath();
      ctx.arc(cx, cy, DANCER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = DANCER_FILL;
      ctx.fill();
      ctx.strokeStyle = '#2c5f8a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label centered inside the circle.
      ctx.font = LABEL_FONT;
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    });

    return canvas;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const formationMapper = new FormationMapper();
