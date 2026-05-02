# Implementation Plan: Dance Formation App

## Overview

Implement a React SPA with Vercel Python serverless functions that lets choreographers analyze dance formations from YouTube videos. The implementation proceeds in layers: project scaffolding → data layer (types, storage) → Vercel API routes → browser processing pipeline → UI components → PDF/JSON export → integration wiring.

## Tasks

- [x] 1. Scaffold project structure and configure tooling
  - Initialize a React + TypeScript project (Vite) with the following directory layout: `src/components/`, `src/hooks/`, `src/store/`, `src/types/`, `src/lib/`, `api/` (Vercel Python functions)
  - Add and configure Vitest, fast-check, and Playwright as dev dependencies
  - Add `pdf-lib`, `idb` (IndexedDB wrapper), and `uuid` as runtime dependencies
  - Create `vercel.json` with Python runtime config and function routes for `/api/download`, `/api/extract-frames`, `/api/pose`, `/api/depth`
  - Create `requirements.txt` for Python functions: `yt-dlp`, `ultralytics`, `transformers`, `torch`, `ffmpeg-python`, `opencv-python-headless`
  - _Requirements: 11.1, 11.2_

- [x] 2. Define core TypeScript types and interfaces
  - [x] 2.1 Create `src/types/index.ts` with all shared types
    - Implement `VideoMeta`, `Timestamp`, `DancerProfile`, `FloorCoordinate`, `PixelCoordinate`, `Session`, `SessionSummary`, `DepthCalibration`, `Formation`, `DancerPosition`, `EnvironmentType`, `ProcessingStep`, `OrchestratorState`, `HomographyMatrix`, and `Result<T, E>` types exactly as specified in the design
    - _Requirements: 1.5, 2.2, 3.4, 4.1, 6.1, 7.1, 8.3_

- [x] 3. Implement SessionStore (OPFS + IndexedDB)
  - [x] 3.1 Create `src/store/SessionStore.ts`
    - Implement `writeVideo`, `readVideo`, `writeFrame`, `readFrame`, `writeFormationImage`, `readFormationImage` using the OPFS API with the directory layout `/sessions/{sessionId}/video.mp4`, `/sessions/{sessionId}/frames/{timestampId}.jpg`, `/sessions/{sessionId}/formations/{timestampId}.png`
    - Implement `saveSession`, `loadSession`, `listSessions`, `deleteSession` using IndexedDB (via `idb`); `deleteSession` must remove both OPFS files and IndexedDB records atomically
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 3.2 Write property test for session deletion (Property 4)
    - **Property 4: Session deletion removes all associated data**
    - Generate random sessions with OPFS binary entries and IndexedDB records; call `deleteSession`; assert the session is absent from `listSessions()` and all OPFS paths are gone
    - Use fast-check `fc.record` arbitraries for session generation
    - Tag: `// Feature: dance-formation-app, Property 4: Session deletion removes all associated data`
    - **Validates: Requirements 8.6**

  - [x] 3.3 Write property test for dancer position storage round-trip (Property 5)
    - **Property 5: Dancer position storage round-trip**
    - Generate random `DancerPosition[]` arrays; store via `SessionStore`; read back; assert dancer IDs, pixel coordinates, and `absent` flags are identical
    - Tag: `// Feature: dance-formation-app, Property 5: Dancer position storage round-trip`
    - **Validates: Requirements 6.4**

  - [x] 3.4 Write unit tests for SessionStore
    - Test OPFS read/write with mocked `navigator.storage.getDirectory`
    - Test IndexedDB operations with an in-memory IDB mock
    - Test that `deleteSession` on a non-existent session does not throw
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement YouTubeImporter
  - [x] 5.1 Create `src/lib/YouTubeImporter.ts`
    - Implement `validateUrl(url)`: accept standard `youtube.com/watch?v=`, `youtu.be/`, and `youtube.com/shorts/` patterns; return `{ valid: false, error: "..." }` for all other inputs
    - Implement `fetchMeta(url)`: call `/api/download` with `{ url }` and read `X-Video-Title` and `X-Video-Duration` response headers to populate `VideoMeta`
    - Implement `downloadVideo(url)`: stream the binary response from `/api/download` and write it to OPFS via `SessionStore.writeVideo`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 5.2 Write unit tests for YouTubeImporter.validateUrl
    - Test valid URL patterns (watch, short URL, shorts)
    - Test invalid inputs: empty string, non-YouTube domain, missing video ID, private playlist URL
    - _Requirements: 1.2, 1.3_

- [x] 6. Implement TimestampSelector
  - [x] 6.1 Create `src/lib/TimestampSelector.ts`
    - Implement `addTimestamp(valueSeconds, durationSeconds)`: return `Result<Timestamp, string>` — reject if `valueSeconds < 0` or `valueSeconds > durationSeconds`; on success assign a UUID `id` and format `label` as `HH:MM:SS`; append to internal list
    - Implement `removeTimestamp(id)` and `getTimestamps()`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7_

  - [x] 6.2 Write property test for timestamp out-of-range rejection (Property 1)
    - **Property 1: Timestamp validation rejects out-of-range values**
    - Generate `(duration, timestamp)` pairs where `timestamp < 0` or `timestamp > duration`; assert `addTimestamp` returns an error result and list length is unchanged
    - Tag: `// Feature: dance-formation-app, Property 1: Timestamp validation rejects out-of-range values`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 6.3 Write property test for timestamp in-range acceptance (Property 2)
    - **Property 2: Timestamp validation accepts in-range values**
    - Generate `(duration, timestamp)` pairs where `0 ≤ timestamp ≤ duration`; assert `addTimestamp` returns a success result and list length increases by exactly one
    - Tag: `// Feature: dance-formation-app, Property 2: Timestamp validation accepts in-range values`
    - **Validates: Requirements 2.4**

  - [x] 6.4 Write unit tests for TimestampSelector
    - Test boundary values: `T = 0`, `T = D`, `T = D + 1`, `T = -1`
    - Test `removeTimestamp` on existing and non-existing IDs
    - Test `getTimestamps` returns a copy (mutation safety)
    - _Requirements: 2.4, 2.5, 2.6_

- [x] 7. Implement FormationMapper
  - [x] 7.1 Create `src/lib/FormationMapper.ts`
    - Implement `computeHomography(depthCalibration)`: derive a 3×3 perspective homography matrix from the stored `DepthCalibration.homographyMatrix`
    - Implement `projectToFloor(pixelCoords, H)`: apply the homography to each pixel coordinate and normalize results to [0, 1] × [0, 1]; clamp any out-of-range values to the unit square
    - Implement `renderFormationImage(coords, profiles)`: draw to an `HTMLCanvasElement` — render a floor grid, place a labeled circle for each dancer at their normalized position, use `DancerProfile.customName ?? numericLabel` as the label
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Write property test for floor coordinate normalization (Property 6)
    - **Property 6: Formation floor coordinates are normalized**
    - Generate random pixel coordinate arrays and valid homography matrices; call `projectToFloor`; assert every resulting `x` and `y` is in `[0, 1]`
    - Tag: `// Feature: dance-formation-app, Property 6: Formation floor coordinates are normalized`
    - **Validates: Requirements 7.1, 7.2**

  - [x] 7.3 Write unit tests for FormationMapper
    - Test `projectToFloor` with identity homography (pixel coords map to themselves after normalization)
    - Test `renderFormationImage` returns a non-null canvas with correct dimensions
    - _Requirements: 7.1, 7.3_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement metadata JSON serialization
  - [x] 9.1 Create `src/lib/MetadataExporter.ts`
    - Implement `exportSession(session)`: serialize a `Session` to the documented JSON schema (`session-export-v1.json`); populate `formationImageFilename` from OPFS path where available; set missing optional fields to `null` (not omitted)
    - Implement `importSession(json)`: parse and validate the JSON; reconstruct a `Session` object with equivalent `youtubeUrl`, `timestamps`, `dancerProfiles`, and `environmentType`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 9.2 Write property test for session JSON round-trip (Property 3)
    - **Property 3: Session metadata JSON round-trip**
    - Generate random valid `Session` objects; call `exportSession` then `importSession`; assert `youtubeUrl`, `timestamps`, `dancerProfiles`, and `environmentType` are equivalent
    - Tag: `// Feature: dance-formation-app, Property 3: Session metadata JSON round-trip`
    - **Validates: Requirements 9.3, 9.4**

  - [x] 9.3 Write property test for null-filling of incomplete sessions (Property 8)
    - **Property 8: Incomplete session export uses null for missing fields**
    - Generate sessions with varying degrees of completeness (missing `formationImageFilename`, missing `customName`, etc.); call `exportSession`; assert all optional fields are present with `null` rather than absent
    - Tag: `// Feature: dance-formation-app, Property 8: Incomplete session export uses null for missing fields`
    - **Validates: Requirements 9.5**

  - [x] 9.4 Write unit tests for MetadataExporter
    - Test schema field names and data types match the documented schema
    - Test `importSession` rejects malformed JSON with a descriptive error
    - _Requirements: 9.2, 9.3_

- [x] 10. Implement Vercel Python API routes
  - [x] 10.1 Create `api/download.py`
    - Accept `POST { "url": "..." }`; validate URL format; invoke `yt-dlp` via subprocess with `--format bestvideo[height<=1080]+bestaudio/best -o /tmp/{videoId}.mp4`; stream the file back as `application/octet-stream`; set `X-Video-Title` and `X-Video-Duration` response headers; return structured JSON error envelope on failure
    - _Requirements: 1.4, 1.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 10.2 Create `api/extract_frames.py`
    - Accept `multipart/form-data` with a video file and a JSON `timestamps` array; use `ffmpeg-python` to seek and extract one JPEG per timestamp at minimum 720p; return frames as `multipart/form-data`; return structured JSON error envelope on failure
    - _Requirements: 5.1, 5.2, 5.4, 12.1, 12.2, 12.4, 12.5_

  - [x] 10.3 Create `api/pose.py`
    - Accept `multipart/form-data` with one or more JPEG frames and a `mode` field (`full_scan` | `per_frame`); load `yolov8m-pose.pt` from Hugging Face Hub; run `model.track(source, tracker="botsort.yaml")`; return the `tracks` JSON structure defined in the design; return structured JSON error envelope on failure
    - _Requirements: 3.2, 3.3, 6.2, 6.3, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 10.4 Create `api/depth.py`
    - Accept `multipart/form-data` with one JPEG frame; load `depth-anything/Depth-Anything-V2-Small-hf` via `transformers`; run inference; normalize depth map to [0, 1]; return `{ depthMap, width, height }` JSON; return structured JSON error envelope on failure
    - _Requirements: 4.2, 4.3, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 10.5 Write property test for API error response structure (Property 7)
    - **Property 7: Compute API error responses are structured**
    - For each API route, simulate error conditions (invalid input, missing file, bad URL); assert every error response has HTTP status ≥ 400 and a JSON body with a non-empty `error` string field
    - Tag: `// Feature: dance-formation-app, Property 7: Compute API error responses are structured`
    - **Validates: Requirements 12.5**

  - [x] 10.6 Write unit tests for API input validation
    - Test `download.py` rejects non-YouTube URLs with 400
    - Test `extract_frames.py` rejects missing video file with 400
    - Test `pose.py` rejects invalid `mode` value with 400
    - Test `depth.py` rejects non-image input with 400
    - _Requirements: 12.5_

- [ ] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement ProcessingOrchestrator
  - [x] 12.1 Create `src/lib/ProcessingOrchestrator.ts`
    - Implement the state machine with steps: `idle → downloading → extracting_frames → scanning_dancers → analyzing_depth → detecting_positions → mapping_formations → complete | error`
    - Track completed steps so retries resume from the failed step rather than restarting
    - Expose `getState(): OrchestratorState` (step + progress 0–100 + optional error message)
    - Coordinate calls to `YouTubeImporter`, `/api/extract-frames`, `/api/pose` (full_scan then per_frame), `/api/depth`, `FormationMapper`, and `SessionStore` in the correct sequence
    - On per-step API error, transition to `error` state with a user-facing message; do not swallow errors silently
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1, 12.2_

  - [x] 12.2 Write unit tests for ProcessingOrchestrator state transitions
    - Test that each step transitions to the next on success
    - Test that an API error transitions to `error` state with a non-empty error message
    - Test that a retry after error resumes from the failed step (not from `idle`)
    - _Requirements: 3.1, 5.4, 6.5_

- [x] 13. Build React UI components
  - [x] 13.1 Create `src/components/YouTubeImporterPanel.tsx`
    - Render a URL text input and a "Load Video" button
    - On submit, call `YouTubeImporter.validateUrl`; display inline error on failure
    - On success, display video title, duration, and thumbnail for user confirmation
    - Show a loading indicator while `downloadVideo` is in progress
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 13.2 Create `src/components/TimestampSelectorPanel.tsx`
    - Render an HH:MM:SS text input and an "Add Timestamp" button
    - Display the current list of timestamps with a remove (×) button per entry
    - Show inline validation error when `addTimestamp` returns an error result
    - Disable the "Proceed" button when the timestamp list is empty
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7_

  - [x] 13.3 Create `src/components/DancerProfileManager.tsx`
    - Display a card per detected dancer showing their thumbnail, numeric label, AI-generated visual description, and an editable name field
    - On name change, call `SessionStore` to persist the updated `DancerProfile`
    - Show total dancer count; provide a numeric input to manually adjust the count (requirement 3.9)
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 13.4 Create `src/components/EnvironmentPanel.tsx`
    - Display detected environment type and depth calibration confidence
    - Render a dropdown to override environment type (`stage`, `studio`, `outdoor`, `unknown`, `manual`)
    - If confidence is below threshold, automatically show the override prompt
    - _Requirements: 4.1, 4.4, 4.5, 4.6_

  - [x] 13.5 Create `src/components/FormationViewer.tsx`
    - For each timestamp, display the extracted frame thumbnail alongside the rendered `Formation_Image` canvas
    - Overlay dancer identifiers on the frame image (requirement 6.6)
    - Show a "formation unavailable" notice when `Formation_Image` is absent for a timestamp
    - _Requirements: 5.5, 6.6, 7.3, 7.4, 7.5, 7.6_

  - [x] 13.6 Create `src/components/SessionListPanel.tsx`
    - List all stored sessions from `SessionStore.listSessions()` with title and creation date
    - Provide "Load" and "Delete" buttons per session; show a confirmation dialog before deletion
    - _Requirements: 8.5, 8.6, 8.7_

  - [x] 13.7 Create `src/components/ProcessingProgressBar.tsx`
    - Display current `ProcessingStep` label and numeric progress (0–100%)
    - Show error state with the error message and a "Retry" button
    - _Requirements: 3.5, 5.5_

- [x] 14. Implement PDFExporter
  - [x] 14.1 Create `src/lib/PDFExporter.ts`
    - Implement `export(session)` using `pdf-lib`:
      - Page 1 (cover): video title, YouTube URL, total dancer count, export date
      - One page per timestamp: extracted frame image, Formation_Image (or frame + note if unavailable), dancer identifier/name list, timestamp value
    - Read binary image data from OPFS via `SessionStore` for each frame and formation image
    - Return `Uint8Array` of PDF bytes; trigger browser download with filename `{videoTitle}_{exportDate}.pdf`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 14.2 Write unit tests for PDFExporter
    - Test that the returned `Uint8Array` starts with the PDF magic bytes (`%PDF`)
    - Test cover page contains video title and dancer count
    - Test that a timestamp with no Formation_Image produces a page with the fallback note
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [x] 15. Wire everything together in the main App
  - [x] 15.1 Create `src/App.tsx` with step-based navigation
    - Render steps in sequence: URL input → timestamp selection → processing (with progress bar) → dancer profile review → environment confirmation → formation viewer → export controls
    - Instantiate and pass `ProcessingOrchestrator`, `SessionStore`, `YouTubeImporter`, `TimestampSelector`, `FormationMapper`, `MetadataExporter`, and `PDFExporter` as shared instances (or via React context)
    - Wire "Download Metadata" button to `MetadataExporter.exportSession` + browser `Blob` download
    - Wire "Export PDF" button to `PDFExporter.export` + browser `Blob` download
    - Wire `SessionListPanel` to allow loading a previous session and restoring all UI state
    - _Requirements: 1.1, 2.1, 3.5, 4.4, 5.5, 8.5, 9.1, 10.1_

  - [x] 15.2 Write Playwright end-to-end test: happy path
    - Navigate to the app; enter a valid YouTube URL; add two timestamps; click "Process"; wait for `complete` state; verify Formation_Images are displayed; click "Export PDF"; verify a file download is triggered
    - _Requirements: 1.1, 2.1, 7.3, 10.1_

  - [x] 15.3 Write Playwright end-to-end test: invalid URL error path
    - Enter an invalid URL; assert the inline error message is displayed and the "Load Video" button remains enabled
    - _Requirements: 1.3_

  - [x] 15.4 Write Playwright end-to-end test: session persistence
    - Complete processing; reload the page; open the session list; load the saved session; verify timestamps and dancer profiles are restored
    - _Requirements: 8.5_

- [ ] 16. Final checkpoint — Ensure all tests pass
  - Run `vitest --run` and `playwright test`; ensure all tests pass. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests use `fast-check` and must be tagged with the property number and requirements clause
- Unit tests use Vitest; end-to-end tests use Playwright
- The Vercel Python functions load model weights from Hugging Face Hub at cold-start — no weights are bundled
- OPFS and IndexedDB APIs must be mocked in the Vitest environment (jsdom does not implement them natively)
