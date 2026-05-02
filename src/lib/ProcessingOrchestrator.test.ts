/**
 * Unit tests for ProcessingOrchestrator state transitions.
 *
 * Requirements: 3.1, 5.4, 6.5
 *
 * Tests verify:
 *   - Each step transitions to the next on success
 *   - An API error transitions to `error` state with a non-empty error message
 *   - A retry after error resumes from the failed step (not from `idle`)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessingOrchestrator, type ProcessingInput } from './ProcessingOrchestrator';
import type { YouTubeImporter } from './YouTubeImporter';
import type { FormationMapper } from './FormationMapper';
import type { SessionStore } from '../store/SessionStore';
import type {
  Session,
  DancerProfile,
  DepthCalibration,
  FloorCoordinate,
} from '../types/index';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'test-session-id';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const TIMESTAMP_1 = { id: 'ts-1', valueSeconds: 10, label: '00:00:10' };
const TIMESTAMP_2 = { id: 'ts-2', valueSeconds: 30, label: '00:00:30' };

const PROCESSING_INPUT: ProcessingInput = {
  sessionId: SESSION_ID,
  youtubeUrl: YOUTUBE_URL,
  timestamps: [TIMESTAMP_1, TIMESTAMP_2],
  videoDurationSeconds: 120,
};

const FAKE_VIDEO_BUFFER = new ArrayBuffer(16);
const FAKE_FRAME_BUFFER = new ArrayBuffer(8);

const MOCK_POSE_RESPONSE = {
  tracks: [
    {
      trackId: 'dancer-1',
      detections: [
        { frameIndex: 0, bbox: [10, 10, 50, 100] as [number, number, number, number], keypoints: [], centroid: [30, 55] as [number, number] },
        { frameIndex: 1, bbox: [20, 10, 60, 100] as [number, number, number, number], keypoints: [], centroid: [40, 55] as [number, number] },
      ],
    },
    {
      trackId: 'dancer-2',
      detections: [
        { frameIndex: 0, bbox: [100, 10, 140, 100] as [number, number, number, number], keypoints: [], centroid: [120, 55] as [number, number] },
        { frameIndex: 1, bbox: [110, 10, 150, 100] as [number, number, number, number], keypoints: [], centroid: [130, 55] as [number, number] },
      ],
    },
  ],
};

const MOCK_DEPTH_RESPONSE = {
  depthMap: [[0.5, 0.6], [0.4, 0.7]],
  width: 1280,
  height: 720,
};

const MOCK_DANCER_PROFILES: DancerProfile[] = [
  { id: 'dancer-1', numericLabel: 1, visualDescription: 'Dancer 1', thumbnailDataUrl: '' },
  { id: 'dancer-2', numericLabel: 2, visualDescription: 'Dancer 2', thumbnailDataUrl: '' },
];

const MOCK_DEPTH_CALIBRATION: DepthCalibration = {
  homographyMatrix: [[1 / 1280, 0, 0], [0, 1 / 720, 0], [0, 0, 1]],
  environmentType: 'unknown',
  confidence: 0.5,
  frameIndex: 0,
};

const MOCK_SESSION: Session = {
  id: SESSION_ID,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  youtubeUrl: YOUTUBE_URL,
  videoId: 'dQw4w9WgXcQ',
  videoTitle: 'Test Video',
  videoDurationSeconds: 120,
  thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  timestamps: [TIMESTAMP_1, TIMESTAMP_2],
  dancerProfiles: MOCK_DANCER_PROFILES,
  environmentType: 'unknown',
  depthCalibration: MOCK_DEPTH_CALIBRATION,
  formations: [],
  opfsVideoPath: `sessions/${SESSION_ID}/video.mp4`,
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeImporterMock(overrides: Partial<YouTubeImporter> = {}): YouTubeImporter {
  return {
    validateUrl: vi.fn().mockReturnValue({ valid: true }),
    fetchMeta: vi.fn().mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'Test Video',
      durationSeconds: 120,
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    }),
    downloadVideo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as YouTubeImporter;
}

function makeMapperMock(overrides: Partial<FormationMapper> = {}): FormationMapper {
  const mockCanvas = {
    width: 800,
    height: 600,
    toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
      const blob = new Blob([new Uint8Array(4)], { type: 'image/png' });
      cb(blob);
    }),
  } as unknown as HTMLCanvasElement;

  return {
    computeHomography: vi.fn().mockReturnValue([[1 / 1280, 0, 0], [0, 1 / 720, 0], [0, 0, 1]]),
    projectToFloor: vi.fn().mockReturnValue([
      { dancerId: 'dancer-1', x: 0.3, y: 0.5 },
      { dancerId: 'dancer-2', x: 0.7, y: 0.5 },
    ] as FloorCoordinate[]),
    renderFormationImage: vi.fn().mockReturnValue(mockCanvas),
    ...overrides,
  } as unknown as FormationMapper;
}

function makeStoreMock(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    writeVideo: vi.fn().mockResolvedValue(undefined),
    readVideo: vi.fn().mockResolvedValue(FAKE_VIDEO_BUFFER),
    writeFrame: vi.fn().mockResolvedValue(undefined),
    readFrame: vi.fn().mockResolvedValue(FAKE_FRAME_BUFFER),
    writeFormationImage: vi.fn().mockResolvedValue(undefined),
    readFormationImage: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(MOCK_SESSION),
    listSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionStore;
}

/**
 * Stubs the global `fetch` to return a successful multipart response for
 * /api/extract-frames and JSON responses for /api/pose and /api/depth.
 */
function stubFetchSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url === '/api/extract-frames') {
        const boundary = 'test-boundary';
        const frameData = 'fake-jpeg-data';
        const body =
          `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n${frameData}\r\n` +
          `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n${frameData}\r\n` +
          `--${boundary}--`;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) =>
              name === 'content-type'
                ? `multipart/form-data; boundary=${boundary}`
                : null,
          },
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
          clone: () => ({
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
          }),
        });
      }

      if (url === '/api/pose') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(MOCK_POSE_RESPONSE),
        });
      }

      if (url === '/api/depth') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(MOCK_DEPTH_RESPONSE),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch call to ${url}`));
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessingOrchestrator', () => {
  let importer: YouTubeImporter;
  let mapper: FormationMapper;
  let store: SessionStore;
  let orchestrator: ProcessingOrchestrator;

  beforeEach(() => {
    vi.unstubAllGlobals();
    importer = makeImporterMock();
    mapper = makeMapperMock();
    store = makeStoreMock();
    orchestrator = new ProcessingOrchestrator(importer, mapper, store);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in idle state with 0 progress', () => {
      const state = orchestrator.getState();
      expect(state.step).toBe('idle');
      expect(state.progress).toBe(0);
      expect(state.error).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — full pipeline
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('transitions through all steps and reaches complete', async () => {
      stubFetchSuccess();

      const stateHistory: string[] = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push(s.step);
      });

      expect(orchestrator.getState().step).toBe('complete');
      expect(orchestrator.getState().progress).toBe(100);
      expect(orchestrator.getState().error).toBeUndefined();

      // Verify all expected steps appeared in order
      const expectedSteps = [
        'downloading',
        'extracting_frames',
        'scanning_dancers',
        'analyzing_depth',
        'detecting_positions',
        'mapping_formations',
        'complete',
      ];
      for (const step of expectedSteps) {
        expect(stateHistory).toContain(step);
      }

      // Verify ordering
      const firstDownloading = stateHistory.indexOf('downloading');
      const firstExtracting = stateHistory.indexOf('extracting_frames');
      const firstScanning = stateHistory.indexOf('scanning_dancers');
      const firstDepth = stateHistory.indexOf('analyzing_depth');
      const firstDetecting = stateHistory.indexOf('detecting_positions');
      const firstMapping = stateHistory.indexOf('mapping_formations');
      const firstComplete = stateHistory.indexOf('complete');

      expect(firstDownloading).toBeLessThan(firstExtracting);
      expect(firstExtracting).toBeLessThan(firstScanning);
      expect(firstScanning).toBeLessThan(firstDepth);
      expect(firstDepth).toBeLessThan(firstDetecting);
      expect(firstDetecting).toBeLessThan(firstMapping);
      expect(firstMapping).toBeLessThan(firstComplete);

      vi.unstubAllGlobals();
    });

    it('calls downloadVideo on the importer', async () => {
      stubFetchSuccess();
      await orchestrator.process(PROCESSING_INPUT);
      expect(importer.downloadVideo).toHaveBeenCalledWith(YOUTUBE_URL);
      vi.unstubAllGlobals();
    });

    it('calls writeFormationImage for each timestamp', async () => {
      stubFetchSuccess();
      await orchestrator.process(PROCESSING_INPUT);
      expect(store.writeFormationImage).toHaveBeenCalledTimes(PROCESSING_INPUT.timestamps.length);
      vi.unstubAllGlobals();
    });

    it('calls saveSession to persist the final session', async () => {
      stubFetchSuccess();
      await orchestrator.process(PROCESSING_INPUT);
      expect(store.saveSession).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // Error transitions
  // -------------------------------------------------------------------------

  describe('error transitions', () => {
    it('transitions to error state when downloadVideo throws', async () => {
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('yt-dlp failed'),
      );

      const stateHistory: Array<{ step: string; error?: string }> = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push({ step: s.step, error: s.error });
      });

      const finalState = orchestrator.getState();
      expect(finalState.step).toBe('error');
      expect(finalState.error).toBeTruthy();
      expect(finalState.error!.length).toBeGreaterThan(0);
    });

    it('error message contains the step name when downloading fails', async () => {
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('network timeout'),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const { error } = orchestrator.getState();
      expect(error).toMatch(/downloading/i);
    });

    it('transitions to error state when /api/extract-frames returns 400', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            return Promise.resolve({
              ok: false,
              status: 400,
              statusText: 'Bad Request',
              json: () => Promise.resolve({ error: 'Missing video file' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const finalState = orchestrator.getState();
      expect(finalState.step).toBe('error');
      expect(finalState.error).toBeTruthy();
      expect(finalState.error!.length).toBeGreaterThan(0);

      vi.unstubAllGlobals();
    });

    it('error message contains the step name when extracting_frames fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            return Promise.resolve({
              ok: false,
              status: 422,
              statusText: 'Unprocessable Entity',
              json: () => Promise.resolve({ error: 'Frame extraction failed' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const { error } = orchestrator.getState();
      expect(error).toMatch(/extracting.frames/i);

      vi.unstubAllGlobals();
    });

    it('transitions to error state when /api/pose returns 500', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            const boundary = 'b';
            const body = `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\ndata\r\n--${boundary}--`;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: (n: string) => n === 'content-type' ? `multipart/form-data; boundary=${boundary}` : null },
              arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
              clone: () => ({ arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer) }),
            });
          }
          if (url === '/api/pose') {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              json: () => Promise.resolve({ error: 'Model inference failed' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const finalState = orchestrator.getState();
      expect(finalState.step).toBe('error');
      expect(finalState.error).toBeTruthy();

      vi.unstubAllGlobals();
    });

    it('transitions to error state when /api/depth returns 422', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            const boundary = 'b';
            const body = `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\ndata\r\n--${boundary}--`;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: (n: string) => n === 'content-type' ? `multipart/form-data; boundary=${boundary}` : null },
              arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
              clone: () => ({ arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer) }),
            });
          }
          if (url === '/api/pose') {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: () => null },
              json: () => Promise.resolve(MOCK_POSE_RESPONSE),
            });
          }
          if (url === '/api/depth') {
            return Promise.resolve({
              ok: false,
              status: 422,
              statusText: 'Unprocessable Entity',
              json: () => Promise.resolve({ error: 'Depth estimation failed' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const finalState = orchestrator.getState();
      expect(finalState.step).toBe('error');
      expect(finalState.error).toBeTruthy();

      vi.unstubAllGlobals();
    });

    it('transitions to error state when writeFormationImage throws', async () => {
      stubFetchSuccess();
      (store.writeFormationImage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('OPFS quota exceeded'),
      );

      await orchestrator.process(PROCESSING_INPUT);

      const finalState = orchestrator.getState();
      expect(finalState.step).toBe('error');
      expect(finalState.error).toBeTruthy();

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // Retry — resumes from failed step
  // -------------------------------------------------------------------------

  describe('retry behavior', () => {
    it('resumes from the failed step (downloading) and completes on retry', async () => {
      // First run: download fails
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('network error'),
      );

      await orchestrator.process(PROCESSING_INPUT);
      expect(orchestrator.getState().step).toBe('error');

      // Fix the download mock and retry
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      stubFetchSuccess();

      const stateHistory: string[] = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push(s.step);
      });

      // Should reach complete
      expect(orchestrator.getState().step).toBe('complete');

      // The failed step (downloading) should be retried
      expect(stateHistory).toContain('downloading');

      // All subsequent steps should also appear
      expect(stateHistory).toContain('extracting_frames');
      expect(stateHistory).toContain('complete');

      // downloadVideo should have been called twice total (once failing, once succeeding)
      expect(importer.downloadVideo).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('skips downloading on retry when it already completed, re-runs extracting_frames', async () => {
      // First run: extract-frames fails (downloading succeeds first)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              json: () => Promise.resolve({ error: 'ffmpeg crashed' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);
      expect(orchestrator.getState().step).toBe('error');

      vi.unstubAllGlobals();

      // Retry with all APIs working
      stubFetchSuccess();

      const stateHistory: string[] = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push(s.step);
      });

      expect(orchestrator.getState().step).toBe('complete');

      // downloading should NOT appear again (it completed in the first run)
      expect(stateHistory).not.toContain('downloading');

      // extracting_frames (the failed step) and beyond should appear
      expect(stateHistory).toContain('extracting_frames');
      expect(stateHistory).toContain('scanning_dancers');
      expect(stateHistory).toContain('complete');

      // downloadVideo should only have been called once (in the first run)
      expect(importer.downloadVideo).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('does not restart from idle on retry', async () => {
      // First run: download fails
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('timeout'),
      );

      await orchestrator.process(PROCESSING_INPUT);
      expect(orchestrator.getState().step).toBe('error');

      // Retry
      (importer.downloadVideo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      stubFetchSuccess();

      const stateHistory: string[] = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push(s.step);
      });

      // 'idle' should never appear in the state history during a retry
      expect(stateHistory).not.toContain('idle');

      vi.unstubAllGlobals();
    });

    it('resumes from the correct step after analyzing_depth fails', async () => {
      // First run: depth fails
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url === '/api/extract-frames') {
            const boundary = 'b';
            const body = `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\ndata\r\n--${boundary}--`;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: (n: string) => n === 'content-type' ? `multipart/form-data; boundary=${boundary}` : null },
              arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
              clone: () => ({ arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer) }),
            });
          }
          if (url === '/api/pose') {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: { get: () => null },
              json: () => Promise.resolve(MOCK_POSE_RESPONSE),
            });
          }
          if (url === '/api/depth') {
            return Promise.resolve({
              ok: false,
              status: 504,
              statusText: 'Gateway Timeout',
              json: () => Promise.resolve({ error: 'Function timed out' }),
            });
          }
          return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }),
      );

      await orchestrator.process(PROCESSING_INPUT);
      expect(orchestrator.getState().step).toBe('error');

      vi.unstubAllGlobals();

      // Retry with all APIs working
      stubFetchSuccess();

      const stateHistory: string[] = [];
      await orchestrator.process(PROCESSING_INPUT, (s) => {
        stateHistory.push(s.step);
      });

      expect(orchestrator.getState().step).toBe('complete');

      // Steps before analyzing_depth should NOT re-run
      expect(stateHistory).not.toContain('downloading');
      expect(stateHistory).not.toContain('extracting_frames');
      expect(stateHistory).not.toContain('scanning_dancers');

      // analyzing_depth and beyond should appear
      expect(stateHistory).toContain('analyzing_depth');
      expect(stateHistory).toContain('detecting_positions');
      expect(stateHistory).toContain('mapping_formations');
      expect(stateHistory).toContain('complete');

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // getState snapshot isolation
  // -------------------------------------------------------------------------

  describe('getState', () => {
    it('returns a snapshot — mutating the returned object does not affect internal state', () => {
      const state = orchestrator.getState();
      state.step = 'complete';
      state.progress = 99;

      const freshState = orchestrator.getState();
      expect(freshState.step).toBe('idle');
      expect(freshState.progress).toBe(0);
    });
  });
});
