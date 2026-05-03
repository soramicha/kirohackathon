# Implementation Plan: Auto-Scan Formations

## Overview

Replace the pixel-differencing formation detection with a position-aware scanner that uses YOLOv11 pose estimation to detect distinct dancer formations. The implementation creates a new `scanner.py` service module, updates the scan API endpoint with configurable parameters and progress reporting, and enhances the frontend with progress polling during auto-scan.

## Tasks

- [x] 1. Create `backend/services/scanner.py` with core position comparison logic
  - [x] 1.1 Implement `_match_positions_greedy` function
    - Greedy nearest-neighbor matching between two position sets
    - Accept `prev` and `curr` lists of `{"x": float, "y": float}` dicts and a `max_distance` parameter (default 0.5)
    - Return `(matched_pairs, unmatched_curr)` where matched_pairs is `[(prev_idx, curr_idx), ...]`
    - Pair dancers by shortest Euclidean distance first, no duplicate assignments
    - Dancers beyond `max_distance` from all candidates are returned as unmatched
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Implement `_compare_formations` function
    - Accept `prev_positions`, `curr_positions`, and `change_threshold` parameters
    - Return `True` if the formation has changed (new snapshot needed)
    - If dancer count differs between frames, always return `True`
    - Use `_match_positions_greedy` to pair dancers, compute average Euclidean displacement of matched pairs
    - Return `True` if average displacement strictly exceeds `change_threshold`
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.3 Write property tests for greedy matching (Properties 5, 6)
    - **Property 5: Greedy Matching No-Duplicate Assignment**
    - **Property 6: Greedy Matching Max-Distance Cutoff**
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 1.4 Write property tests for position comparison (Properties 2, 3, 4, 8, 9, 10, 11)
    - **Property 2: Average Displacement Computation Correctness**
    - **Property 3: Threshold Classification Correctness**
    - **Property 4: Dancer Count Change Detection**
    - **Property 8: Position Comparison Identity**
    - **Property 9: Position Comparison Symmetry**
    - **Property 10: Boundary Threshold — Exact Threshold Means Changed**
    - **Property 11: Boundary Threshold — Below Threshold Means Unchanged**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4**

- [x] 2. Implement scanner orchestration and progress tracking in `scanner.py`
  - [x] 2.1 Implement in-memory progress store and `get_scan_progress` function
    - Module-level `_scan_progress: dict[str, dict]` keyed by session_id
    - Return `{"status": "scanning"|"complete"|"not_started"|"error", "percent": float, "formations_found": int, "error": str|None}`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.2 Implement `_detect_positions_in_frame` helper function
    - Accept an open `cv2.VideoCapture`, timestamp in ms, the YOLO model, and frame dimensions
    - Seek to timestamp, read frame, run YOLO model inference (confidence >= 0.4, person class only)
    - Return list of `{"x": float, "y": float, "bbox": [x1,y1,x2,y2]}` with normalized coordinates, or `None` if no persons detected or frame read fails
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ]* 2.3 Write property test for coordinate normalization (Property 1)
    - **Property 1: Coordinate Normalization Bounds**
    - **Validates: Requirements 1.3**

  - [x] 2.4 Implement `scan_formations` main function
    - Accept `session_id`, `scan_interval` (default 3.0), and `change_threshold` (default 0.05)
    - Load video via session metadata, compute duration and sample count
    - Loop through video at `scan_interval` steps, calling `_detect_positions_in_frame` at each step
    - Use `_compare_formations` to decide whether to emit a new Formation_Snapshot
    - First detection with dancers always creates a snapshot
    - Update progress store after each sample
    - Set progress to "complete" on success, "error" on failure
    - Guard against concurrent scans for the same session (set status to "scanning" at start, reject if already "scanning")
    - Return list of `{"timestamp": float, "dancer_count": int}`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update `backend/routers/video.py` with new scan and progress endpoints
  - [x] 4.1 Add `ScanRequest` model and update `scan_formations` endpoint
    - Add Pydantic `ScanRequest` model with `scan_interval: float = 3.0` and `change_threshold: float = 0.05`
    - Validate `scan_interval >= 1.0` (HTTP 400 if violated)
    - Validate `change_threshold` in `[0.01, 0.5]` (HTTP 400 if violated)
    - Replace the call to `detect_formation_timestamps` with `scanner.scan_formations`
    - Return HTTP 409 if scan already in progress for the session
    - Maintain backward-compatible response format `{"session_id": str, "auto_timestamps": [{"timestamp": float}]}`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Add `get_scan_progress` GET endpoint
    - New GET endpoint at `/scan/{session_id}/progress`
    - Return progress from `scanner.get_scan_progress`
    - Return HTTP 404 if session not found
    - _Requirements: 5.2, 5.3_

  - [ ]* 4.3 Write unit tests for scan and progress API endpoints
    - Test 404 for invalid session_id on both endpoints
    - Test 400 for invalid `scan_interval` and `change_threshold` values
    - Test 409 for concurrent scan attempt
    - Test successful scan response format matches backward-compatible structure
    - Test progress endpoint returns correct states (not_started, scanning, complete, error)
    - Mock `scanner.scan_formations` to avoid YOLO dependency in tests
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_

- [x] 5. Update `frontend/src/api.js` with scan params and progress polling
  - [x] 5.1 Update `scanFormations` to accept optional params and add `getScanProgress`
    - Update `scanFormations` to accept an optional `params` object and POST it as the request body
    - Add `getScanProgress(session_id)` function that GETs `/video/scan/${session_id}/progress`
    - _Requirements: 7.1, 7.2_

  - [ ]* 5.2 Write property test for timestamp merge (Property 7)
    - **Property 7: Timestamp Merge Correctness**
    - Implement as a JavaScript property test (fast-check) or Python test depending on where the merge logic lives
    - **Validates: Requirements 7.3**

- [x] 6. Update `frontend/src/components/TimestampSelector.jsx` with progress UI
  - [x] 6.1 Add progress state and polling logic to `handleAutoScan`
    - Add state variables for scan progress (`scanProgress`, `pollError`)
    - On auto-scan click: fire POST to scan endpoint, immediately start polling `getScanProgress` every 2 seconds
    - On each poll: update progress percentage and formations found count
    - Stop polling when status is "complete" or "error"
    - On completion: merge returned timestamps into existing list (deduplicated, sorted)
    - On error: display error message in red banner, allow retry
    - After 3 consecutive poll failures: stop polling and show warning
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 6.2 Add progress bar UI to the auto-scan section
    - Show a progress bar with percentage when scanning is in progress
    - Display "X formations found" count below the progress bar
    - Replace the spinner with the progress bar during active scan
    - Keep the existing error display and retry behavior
    - _Requirements: 7.1, 7.2_

  - [ ]* 6.3 Write unit tests for TimestampSelector progress behavior
    - Test that auto-scan button triggers scan and shows progress bar
    - Test that progress polling updates the UI at 2s intervals
    - Test that timestamps are merged and deduplicated on completion
    - Test error display and retry behavior
    - Use Vitest + React Testing Library, mock api calls
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 11 correctness properties from the design using Hypothesis (Python) and optionally fast-check (JavaScript)
- Unit tests validate specific examples, edge cases, and API contract
- The scanner module is self-contained — existing `extractor.py` remains untouched for backward compatibility
