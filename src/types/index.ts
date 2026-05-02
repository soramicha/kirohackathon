/**
 * Shared TypeScript types for the Dance Formation App.
 * These types are used across the browser tier (React SPA) and serve as
 * the canonical data model for all session, formation, and processing data.
 */

// ---------------------------------------------------------------------------
// Video & Import
// ---------------------------------------------------------------------------

export interface VideoMeta {
  videoId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

export interface Timestamp {
  id: string;
  valueSeconds: number;
  label: string; // HH:MM:SS display
}

// ---------------------------------------------------------------------------
// Dancer
// ---------------------------------------------------------------------------

export interface DancerProfile {
  id: string;           // stable track ID from BoT-SORT
  numericLabel: number; // assigned sequential number
  customName?: string;
  visualDescription: string; // AI-generated description
  thumbnailDataUrl: string;  // crop from first detection
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export interface FloorCoordinate {
  dancerId: string;
  x: number; // normalized 0–1 on floor plane
  y: number;
}

export interface PixelCoordinate {
  dancerId: string;
  x: number; // pixel x coordinate
  y: number; // pixel y coordinate
}

// ---------------------------------------------------------------------------
// Environment & Depth
// ---------------------------------------------------------------------------

export type EnvironmentType = 'stage' | 'studio' | 'outdoor' | 'unknown' | 'manual';

export interface DepthCalibration {
  homographyMatrix: number[][]; // 3×3
  environmentType: EnvironmentType;
  confidence: number;  // 0–1
  frameIndex: number;  // which frame was used for calibration
}

/** A 3×3 homography matrix used for perspective transformation. */
export type HomographyMatrix = number[][];

// ---------------------------------------------------------------------------
// Formation
// ---------------------------------------------------------------------------

export interface DancerPosition {
  dancerId: string;
  pixelCoordinate: [number, number];
  floorCoordinate: [number, number]; // normalized 0–1
  absent: boolean;
}

export interface Formation {
  timestampId: string;
  timestampSeconds: number;
  dancerPositions: DancerPosition[];
  opfsFramePath: string;
  opfsFormationImagePath: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface Session {
  id: string;                    // UUID
  createdAt: string;             // ISO 8601
  updatedAt: string;
  youtubeUrl: string;
  videoId: string;
  videoTitle: string;
  videoDurationSeconds: number;
  thumbnailUrl: string;
  timestamps: Timestamp[];
  dancerProfiles: DancerProfile[];
  environmentType: EnvironmentType;
  depthCalibration: DepthCalibration;
  formations: Formation[];
  opfsVideoPath: string;         // path within OPFS
}

export interface SessionSummary {
  id: string;
  videoTitle: string;
  youtubeUrl: string;
  createdAt: string;
  updatedAt: string;
  timestampCount: number;
  dancerCount: number;
}

// ---------------------------------------------------------------------------
// Processing Orchestrator
// ---------------------------------------------------------------------------

export type ProcessingStep =
  | 'idle'
  | 'downloading'
  | 'extracting_frames'
  | 'scanning_dancers'
  | 'analyzing_depth'
  | 'detecting_positions'
  | 'mapping_formations'
  | 'complete'
  | 'error';

export interface OrchestratorState {
  step: ProcessingStep;
  progress: number; // 0–100
  error?: string;
}

// ---------------------------------------------------------------------------
// Result type — discriminated union for error handling
// ---------------------------------------------------------------------------

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
