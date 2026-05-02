/**
 * ProcessingOrchestrator — coordinates the multi-step video processing pipeline.
 *
 * State machine:
 *   idle → downloading → extracting_frames → scanning_dancers → analyzing_depth
 *        → detecting_positions → mapping_formations → complete | error
 *
 * Completed steps are tracked so that a retry resumes from the failed step
 * rather than restarting from the beginning.
 *
 * Requirements: 3.1, 4.1, 5.1, 6.1, 7.1, 12.2
 */

import type {
  OrchestratorState,
  ProcessingStep,
  Session,
  Timestamp,
  DancerProfile,
  DancerPosition,
  Formation,
  DepthCalibration,
  EnvironmentType,
  PixelCoordinate,
} from '../types/index';
import type { YouTubeImporter } from './YouTubeImporter';
import type { FormationMapper } from './FormationMapper';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Step ordering — used to determine which steps have already completed
// ---------------------------------------------------------------------------

const STEP_ORDER: ProcessingStep[] = [
  'idle',
  'downloading',
  'extracting_frames',
  'scanning_dancers',
  'analyzing_depth',
  'detecting_positions',
  'mapping_formations',
  'complete',
];

function stepIndex(step: ProcessingStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx === -1 ? -1 : idx;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface TrackDetection {
  frameIndex: number;
  bbox: [number, number, number, number];
  keypoints: [number, number, number][];
  centroid: [number, number];
}

interface Track {
  trackId: string;
  detections: TrackDetection[];
}

interface PoseApiResponse {
  tracks: Track[];
}

interface DepthApiResponse {
  depthMap: number[][];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// ProcessingInput — everything the orchestrator needs to run
// ---------------------------------------------------------------------------

export interface ProcessingInput {
  sessionId: string;
  youtubeUrl: string;
  timestamps: Timestamp[];
  videoDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// ProcessingOrchestrator class
// ---------------------------------------------------------------------------

export class ProcessingOrchestrator {
  private state: OrchestratorState = { step: 'idle', progress: 0 };

  /**
   * Tracks the highest step index that has been successfully completed.
   * -1 means nothing has completed yet.
   */
  private lastCompletedStepIndex: number = -1;

  private readonly importer: YouTubeImporter;
  private readonly mapper: FormationMapper;
  private readonly store: SessionStore;

  constructor(
    importer: YouTubeImporter,
    mapper: FormationMapper,
    store: SessionStore,
  ) {
    this.importer = importer;
    this.mapper = mapper;
    this.store = store;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns a snapshot of the current orchestrator state. */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Starts (or resumes) the processing pipeline for the given input.
   *
   * If a previous run failed, this method resumes from the failed step rather
   * than restarting from the beginning.
   *
   * @param input - Session ID, YouTube URL, selected timestamps, and video duration.
   * @param onStateChange - Optional callback invoked whenever state changes.
   */
  async process(
    input: ProcessingInput,
    onStateChange?: (state: OrchestratorState) => void,
  ): Promise<void> {
    const notify = (step: ProcessingStep, progress: number, error?: string) => {
      this.state = { step, progress, ...(error !== undefined ? { error } : {}) };
      onStateChange?.(this.getState());
    };

    // Determine the resume point based on the last completed step.
    const resumeFrom = this.lastCompletedStepIndex + 1; // index of the first step to run

    try {
      // ------------------------------------------------------------------
      // Step: downloading
      // ------------------------------------------------------------------
      if (stepIndex('downloading') >= resumeFrom) {
        notify('downloading', 0);
        try {
          await this.importer.downloadVideo(input.youtubeUrl, input.sessionId);
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('downloading', err));
          return;
        }
        this.lastCompletedStepIndex = stepIndex('downloading');
        notify('downloading', 100);
      }

      // ------------------------------------------------------------------
      // Step: extracting_frames
      // ------------------------------------------------------------------
      if (stepIndex('extracting_frames') >= resumeFrom) {
        notify('extracting_frames', 0);

        let frameBuffers: ArrayBuffer[];
        try {
          frameBuffers = await this.extractFrames(input.sessionId, input.timestamps);
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('extracting_frames', err));
          return;
        }

        // Persist each frame to OPFS
        for (let i = 0; i < input.timestamps.length; i++) {
          try {
            await this.store.writeFrame(
              input.sessionId,
              input.timestamps[i].id,
              frameBuffers[i],
            );
          } catch (err) {
            notify(
              'error',
              this.state.progress,
              buildErrorMessage('extracting_frames', err),
            );
            return;
          }
          notify('extracting_frames', Math.round(((i + 1) / input.timestamps.length) * 100));
        }

        this.lastCompletedStepIndex = stepIndex('extracting_frames');
      }

      // ------------------------------------------------------------------
      // Step: scanning_dancers  (full-video pose scan)
      // ------------------------------------------------------------------
      let tracks: Track[] = [];
      if (stepIndex('scanning_dancers') >= resumeFrom) {
        notify('scanning_dancers', 0);

        let poseResponse: PoseApiResponse;
        try {
          poseResponse = await this.runPoseScan(input.sessionId, 'full_scan');
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('scanning_dancers', err));
          return;
        }

        tracks = poseResponse.tracks;
        this.lastCompletedStepIndex = stepIndex('scanning_dancers');
        notify('scanning_dancers', 100);
      }

      // ------------------------------------------------------------------
      // Step: analyzing_depth
      // ------------------------------------------------------------------
      let depthCalibration: DepthCalibration | null = null;
      if (stepIndex('analyzing_depth') >= resumeFrom) {
        notify('analyzing_depth', 0);

        let depthResponse: DepthApiResponse;
        try {
          depthResponse = await this.runDepthAnalysis(input.sessionId);
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('analyzing_depth', err));
          return;
        }

        depthCalibration = buildDepthCalibration(depthResponse);
        this.lastCompletedStepIndex = stepIndex('analyzing_depth');
        notify('analyzing_depth', 100);
      }

      // ------------------------------------------------------------------
      // Step: detecting_positions  (per-frame pose detection)
      // ------------------------------------------------------------------
      let perFrameTracks: Track[] = [];
      if (stepIndex('detecting_positions') >= resumeFrom) {
        notify('detecting_positions', 0);

        let perFrameResponse: PoseApiResponse;
        try {
          perFrameResponse = await this.runPoseScan(input.sessionId, 'per_frame');
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('detecting_positions', err));
          return;
        }

        perFrameTracks = perFrameResponse.tracks;

        // Persist dancer positions for each timestamp
        const session = await this.store.loadSession(input.sessionId);
        if (session) {
          const updatedSession = {
            ...session,
            updatedAt: new Date().toISOString(),
            dancerProfiles: buildDancerProfiles(tracks.length > 0 ? tracks : perFrameTracks),
          };
          try {
            await this.store.saveSession(updatedSession);
          } catch (err) {
            notify(
              'error',
              this.state.progress,
              buildErrorMessage('detecting_positions', err),
            );
            return;
          }
        }

        this.lastCompletedStepIndex = stepIndex('detecting_positions');
        notify('detecting_positions', 100);
      }

      // ------------------------------------------------------------------
      // Step: mapping_formations
      // ------------------------------------------------------------------
      if (stepIndex('mapping_formations') >= resumeFrom) {
        notify('mapping_formations', 0);

        const session = await this.store.loadSession(input.sessionId);
        const calibration = depthCalibration ?? session?.depthCalibration ?? buildDefaultCalibration();
        const profiles = session?.dancerProfiles ?? [];

        let H;
        try {
          H = this.mapper.computeHomography(calibration);
        } catch (err) {
          notify('error', this.state.progress, buildErrorMessage('mapping_formations', err));
          return;
        }

        const formations: Formation[] = [];

        for (let i = 0; i < input.timestamps.length; i++) {
          const ts = input.timestamps[i];
          const frameTracks = perFrameTracks.length > 0 ? perFrameTracks : tracks;

          // Build pixel coordinates for this frame from track detections
          const pixelCoords: PixelCoordinate[] = buildPixelCoords(frameTracks, i);

          // Project to floor
          const floorCoords = this.mapper.projectToFloor(pixelCoords, H);

          // Build dancer positions (mark absent dancers)
          const dancerPositions: DancerPosition[] = buildDancerPositions(
            pixelCoords,
            floorCoords,
            profiles,
          );

          // Render formation image and persist to OPFS
          const canvas = this.mapper.renderFormationImage(floorCoords, profiles);
          const formationImageBuffer = await canvasToArrayBuffer(canvas);

          try {
            await this.store.writeFormationImage(input.sessionId, ts.id, formationImageBuffer);
          } catch (err) {
            notify(
              'error',
              this.state.progress,
              buildErrorMessage('mapping_formations', err),
            );
            return;
          }

          const opfsFramePath = `sessions/${input.sessionId}/frames/${ts.id}.jpg`;
          const opfsFormationImagePath = `sessions/${input.sessionId}/formations/${ts.id}.png`;

          formations.push({
            timestampId: ts.id,
            timestampSeconds: ts.valueSeconds,
            dancerPositions,
            opfsFramePath,
            opfsFormationImagePath,
          });

          notify('mapping_formations', Math.round(((i + 1) / input.timestamps.length) * 100));
        }

        // Persist updated session with formations
        const latestSession = await this.store.loadSession(input.sessionId);
        if (latestSession) {
          const updatedSession: Session = {
            ...latestSession,
            updatedAt: new Date().toISOString(),
            depthCalibration: calibration,
            formations,
          };
          try {
            await this.store.saveSession(updatedSession);
          } catch (err) {
            notify(
              'error',
              this.state.progress,
              buildErrorMessage('mapping_formations', err),
            );
            return;
          }
        }

        this.lastCompletedStepIndex = stepIndex('mapping_formations');
      }

      // ------------------------------------------------------------------
      // Complete
      // ------------------------------------------------------------------
      this.lastCompletedStepIndex = stepIndex('complete');
      notify('complete', 100);
    } catch (err) {
      // Catch-all for unexpected errors not handled in individual steps
      notify('error', this.state.progress, buildErrorMessage(this.state.step, err));
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers — API calls
  // -------------------------------------------------------------------------

  /**
   * Calls POST /api/extract-frames with the video from OPFS and the timestamp list.
   * Returns one ArrayBuffer per timestamp (JPEG frames).
   */
  private async extractFrames(
    sessionId: string,
    timestamps: Timestamp[],
  ): Promise<ArrayBuffer[]> {
    const videoBuffer = await this.store.readVideo(sessionId);
    if (!videoBuffer) {
      throw new Error(
        `extractFrames: no video found in OPFS for session "${sessionId}". ` +
        'Ensure the downloading step completed successfully.',
      );
    }

    const formData = new FormData();
    formData.append('video', new Blob([videoBuffer], { type: 'video/mp4' }), 'video.mp4');
    formData.append(
      'timestamps',
      JSON.stringify(timestamps.map((ts) => ts.valueSeconds)),
    );

    let response: Response;
    try {
      response = await fetch('/api/extract-frames', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      throw new Error(`extractFrames: network error — ${String(err)}`);
    }

    if (!response.ok) {
      const detail = await extractApiError(response);
      throw new Error(`extractFrames: /api/extract-frames returned HTTP ${response.status}${detail}`);
    }

    // Parse multipart/form-data response — one JPEG per timestamp
    return parseMultipartFrames(response, timestamps.length);
  }

  /**
   * Calls POST /api/pose with the frames from OPFS.
   * mode: 'full_scan' for the initial full-video scan, 'per_frame' for per-timestamp detection.
   */
  private async runPoseScan(
    sessionId: string,
    mode: 'full_scan' | 'per_frame',
  ): Promise<PoseApiResponse> {
    const session = await this.store.loadSession(sessionId);
    const timestamps = session?.timestamps ?? [];

    const formData = new FormData();
    formData.append('mode', mode);

    if (mode === 'per_frame' && timestamps.length > 0) {
      // Attach each extracted frame
      for (const ts of timestamps) {
        const frameBuffer = await this.store.readFrame(sessionId, ts.id);
        if (frameBuffer) {
          formData.append(
            'frames',
            new Blob([frameBuffer], { type: 'image/jpeg' }),
            `${ts.id}.jpg`,
          );
        }
      }
    } else {
      // full_scan: attach the full video
      const videoBuffer = await this.store.readVideo(sessionId);
      if (videoBuffer) {
        formData.append('video', new Blob([videoBuffer], { type: 'video/mp4' }), 'video.mp4');
      }
    }

    let response: Response;
    try {
      response = await fetch('/api/pose', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      throw new Error(`runPoseScan (${mode}): network error — ${String(err)}`);
    }

    if (!response.ok) {
      const detail = await extractApiError(response);
      throw new Error(
        `runPoseScan (${mode}): /api/pose returned HTTP ${response.status}${detail}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new Error(`runPoseScan (${mode}): failed to parse JSON response — ${String(err)}`);
    }

    return json as PoseApiResponse;
  }

  /**
   * Calls POST /api/depth with the first available frame from OPFS.
   */
  private async runDepthAnalysis(sessionId: string): Promise<DepthApiResponse> {
    const session = await this.store.loadSession(sessionId);
    const firstTimestamp = session?.timestamps?.[0];

    const formData = new FormData();

    if (firstTimestamp) {
      const frameBuffer = await this.store.readFrame(sessionId, firstTimestamp.id);
      if (frameBuffer) {
        formData.append(
          'frame',
          new Blob([frameBuffer], { type: 'image/jpeg' }),
          `${firstTimestamp.id}.jpg`,
        );
      }
    }

    let response: Response;
    try {
      response = await fetch('/api/depth', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      throw new Error(`runDepthAnalysis: network error — ${String(err)}`);
    }

    if (!response.ok) {
      const detail = await extractApiError(response);
      throw new Error(
        `runDepthAnalysis: /api/depth returned HTTP ${response.status}${detail}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new Error(`runDepthAnalysis: failed to parse JSON response — ${String(err)}`);
    }

    return json as DepthApiResponse;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Builds a user-facing error message for a given processing step and raw error.
 */
function buildErrorMessage(step: ProcessingStep | string, err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const stepLabel = step.replace(/_/g, ' ');
  return `Error during ${stepLabel}: ${base}`;
}

/**
 * Extracts a descriptive error string from a non-OK API response.
 */
async function extractApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ? ` — ${body.error}` : ` — ${response.statusText}`;
  } catch {
    return response.statusText ? ` — ${response.statusText}` : '';
  }
}

/**
 * Parses a multipart/form-data response and returns one ArrayBuffer per frame.
 * Falls back to treating the entire body as a single frame if parsing fails.
 */
async function parseMultipartFrames(
  response: Response,
  expectedCount: number,
): Promise<ArrayBuffer[]> {
  const contentType = response.headers.get('content-type') ?? '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);

  if (!boundaryMatch) {
    // Fallback: single frame returned as raw binary
    const buffer = await response.arrayBuffer();
    return Array(expectedCount).fill(buffer);
  }

  const boundary = boundaryMatch[1];
  const bodyBuffer = await response.arrayBuffer();
  const bodyBytes = new Uint8Array(bodyBuffer);
  const decoder = new TextDecoder('utf-8');
  const bodyText = decoder.decode(bodyBytes);

  const parts: ArrayBuffer[] = [];
  const delimiter = `--${boundary}`;
  const sections = bodyText.split(delimiter);

  for (const section of sections) {
    if (section.trim() === '' || section.trim() === '--') continue;

    // Find the blank line separating headers from body
    const headerBodySplit = section.indexOf('\r\n\r\n');
    if (headerBodySplit === -1) continue;

    const bodyStart = headerBodySplit + 4; // skip \r\n\r\n
    const bodyEnd = section.endsWith('\r\n') ? section.length - 2 : section.length;

    // Re-encode the body portion back to bytes
    const encoder = new TextEncoder();
    const partBytes = encoder.encode(section.slice(bodyStart, bodyEnd));
    parts.push(partBytes.buffer);
  }

  // If parsing yielded no parts, fall back to the raw body
  if (parts.length === 0) {
    const buffer = await response.clone().arrayBuffer().catch(() => new ArrayBuffer(0));
    return Array(expectedCount).fill(buffer);
  }

  return parts;
}

/**
 * Converts an HTMLCanvasElement to an ArrayBuffer (PNG).
 */
async function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvasToArrayBuffer: canvas.toBlob returned null'));
        return;
      }
      blob.arrayBuffer().then(resolve).catch(reject);
    }, 'image/png');
  });
}

/**
 * Builds a minimal DepthCalibration from a depth API response.
 * Uses an identity homography as a placeholder; the Formation_Mapper will
 * apply the actual perspective transform once the user confirms the environment.
 */
function buildDepthCalibration(depthResponse: DepthApiResponse): DepthCalibration {
  // Derive a simple scale-based homography from the depth map dimensions.
  // The actual calibration is refined by the user in the EnvironmentPanel.
  const w = depthResponse.width || 1280;
  const h = depthResponse.height || 720;

  // Normalizing homography: maps pixel (x, y) → (x/w, y/h)
  const homographyMatrix: number[][] = [
    [1 / w, 0,     0],
    [0,     1 / h, 0],
    [0,     0,     1],
  ];

  return {
    homographyMatrix,
    environmentType: 'unknown' as EnvironmentType,
    confidence: 0.5,
    frameIndex: 0,
  };
}

/**
 * Returns a default identity-based DepthCalibration when no depth data is available.
 */
function buildDefaultCalibration(): DepthCalibration {
  return {
    homographyMatrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    environmentType: 'unknown' as EnvironmentType,
    confidence: 0,
    frameIndex: 0,
  };
}

/**
 * Builds DancerProfile[] from the track list returned by the pose API.
 */
function buildDancerProfiles(tracks: Track[]): DancerProfile[] {
  return tracks.map((track, index) => ({
    id: track.trackId,
    numericLabel: index + 1,
    customName: undefined,
    visualDescription: `Dancer ${index + 1}`,
    thumbnailDataUrl: '',
  }));
}

/**
 * Extracts pixel centroid coordinates for a given frame index from the track list.
 */
function buildPixelCoords(tracks: Track[], frameIndex: number): PixelCoordinate[] {
  const coords: PixelCoordinate[] = [];

  for (const track of tracks) {
    const detection = track.detections.find((d) => d.frameIndex === frameIndex);
    if (detection) {
      coords.push({
        dancerId: track.trackId,
        x: detection.centroid[0],
        y: detection.centroid[1],
      });
    }
  }

  return coords;
}

/**
 * Builds DancerPosition[] by combining pixel and floor coordinates.
 * Dancers present in profiles but absent from detections are marked absent.
 */
function buildDancerPositions(
  pixelCoords: PixelCoordinate[],
  floorCoords: { dancerId: string; x: number; y: number }[],
  profiles: DancerProfile[],
): DancerPosition[] {
  const positions: DancerPosition[] = [];

  // Add detected dancers
  for (const pixel of pixelCoords) {
    const floor = floorCoords.find((f) => f.dancerId === pixel.dancerId);
    positions.push({
      dancerId: pixel.dancerId,
      pixelCoordinate: [pixel.x, pixel.y],
      floorCoordinate: floor ? [floor.x, floor.y] : [0, 0],
      absent: false,
    });
  }

  // Mark absent dancers (in profiles but not detected in this frame)
  const detectedIds = new Set(pixelCoords.map((p) => p.dancerId));
  for (const profile of profiles) {
    if (!detectedIds.has(profile.id)) {
      positions.push({
        dancerId: profile.id,
        pixelCoordinate: [0, 0],
        floorCoordinate: [0, 0],
        absent: true,
      });
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

import { youTubeImporter } from './YouTubeImporter';
import { formationMapper } from './FormationMapper';
import { sessionStore } from '../store/SessionStore';

export const processingOrchestrator = new ProcessingOrchestrator(
  youTubeImporter,
  formationMapper,
  sessionStore,
);
