# Implementation Tasks

## Task 1: Add dependencies and configuration
- [x] Add `librosa` to `backend/requirements.txt` and `backend/pyproject.toml`
- [x] Add enhanced detection parameters to `FormationDetectionConfig` in `backend/config.py`: `PHRASE_LENGTH`, `VELOCITY_SEARCH_WINDOW`, `HULL_STABILITY_THRESHOLD`, `CAMERA_MOTION_THRESHOLD`, `AUDIO_SAMPLE_RATE`, `SCENE_CUT_THRESHOLD`

## Task 2: Implement audio analyzer service
- [x] Create `backend/services/audio_analyzer.py`
- [x] Implement `analyze_audio(session_id)` function:
  - Extract audio from video.mp4 to temporary WAV using ffmpeg subprocess
  - Load audio with librosa at 22050 Hz sample rate
  - Run `librosa.beat.beat_track()` to get tempo and beat positions
  - Run `librosa.onset.onset_detect()` to get onset timestamps
  - Compute phrase boundaries from beats at `PHRASE_LENGTH` intervals (every 8 beats)
  - Cache results to `sessions/{session_id}/audio_analysis.json`
  - Delete temporary WAV file after analysis
  - Return dict with `tempo`, `beats`, `onsets`, `phrase_boundaries`, `duration`
- [x] Implement cache check: if `audio_analysis.json` exists, load and return it
- [x] Implement graceful fallback: return `None` if ffmpeg fails, audio extraction fails, or librosa is not installed

## Task 3: Implement per-dancer velocity tracking
- [x] Add `_compute_velocity_curve(cap, fps, duration, config)` function to `backend/services/extractor.py`
- [x] For each sampled frame at `SAMPLE_INTERVAL`:
  - Run YOLO detection (reuse model from `_get_model()`)
  - Extract bounding box centroids, normalize to [0,1] range relative to frame dimensions
  - Match centroids to previous frame using nearest-neighbor matching (scipy `linear_sum_assignment` / Hungarian algorithm)
  - Compute displacement for matched dancers only
  - Detect scene cuts via histogram comparison (`cv2.compareHist`), discard velocity for cut frames
  - Exclude dancers that appear/disappear (unmatched) from velocity calculation
  - Compute `group_velocity[t]` = mean of all matched dancer displacements
- [x] Return dict with `timestamps`, `group_velocity`, `dancer_counts`, `dancer_positions` (list of centroid lists per frame)

## Task 4: Implement convex hull stability analysis
- [x] Add `_compute_hull_stability(dancer_positions, window=5)` function to `backend/services/extractor.py`
- [x] For each frame's dancer positions:
  - If >= 3 dancers: compute `scipy.spatial.ConvexHull` area, normalize by frame area
  - If < 3 dancers: set hull area to 0 (skip hull signal)
- [x] Compute stability score over sliding window of ±`window` frames:
  - `variance` = np.var(hull_areas[i-window:i+window])
  - `stability_score` = 1.0 / (1.0 + variance * scale_factor)
- [x] Return list of stability scores aligned with input timestamps

## Task 5: Implement signal fusion algorithm
- [x] Add `_fuse_signals(phrase_boundaries, timestamps, group_velocity, dancer_counts, hull_stability, config)` function to `backend/services/extractor.py`
- [x] When phrase_boundaries are available (audio signal present):
  - For each phrase boundary, find the frame index closest to it
  - Search within ±`VELOCITY_SEARCH_WINDOW` frames for the local minimum of `group_velocity`
  - Check that `hull_stability` at that minimum exceeds `HULL_STABILITY_THRESHOLD` (skip check if hull data unavailable)
  - Check that `dancer_counts` at that frame >= `MIN_PEOPLE_COUNT`
  - If all checks pass, record as confirmed formation with signals list
  - Enforce `MIN_SPACING_BETWEEN` between confirmed formations
- [x] When no phrase_boundaries (audio fallback):
  - Find all local minima of `group_velocity` using `scipy.signal.argrelmin`
  - Filter by hull stability threshold
  - Filter by dancer count
  - Enforce minimum spacing
- [x] Return list of dicts: `{"timestamp": float, "signals": list[str]}`

## Task 6: Implement enhanced detection entry point
- [x] Add `_detect_formations_enhanced(session_id, cap, fps, duration)` function to `backend/services/extractor.py`
- [x] Orchestrate the pipeline:
  1. Call `audio_analyzer.analyze_audio(session_id)` — handle None return (no audio)
  2. Call `_compute_velocity_curve(cap, fps, duration, config)` — get velocity + positions
  3. Call `_compute_hull_stability(velocity_data["dancer_positions"])` — get stability scores
  4. Call `_fuse_signals(...)` with all computed data
  5. Return timestamps in same format as current detector
- [x] Make `detect_formation_timestamps()` use enhanced detection by default with legacy fallback

## Task 7: Update API response format
- [x] Include signal metadata in scan response (`"signals"` field per timestamp)
- [x] Scan endpoint returns timestamps with signals automatically from enhanced detector

## Task 8: Scene cut and camera motion filtering
- [x] In `_compute_velocity_curve()`, add histogram-based scene cut detection:
  - Compute HSV histogram for each frame using `cv2.calcHist`
  - Compare consecutive histograms with `cv2.compareHist` (correlation method)
  - If correlation drops below threshold, mark as scene cut and discard velocity for that transition
- [x] Add basic camera motion compensation:
  - Compute median displacement of all detected bounding boxes between frames
  - If median displacement exceeds `CAMERA_MOTION_THRESHOLD`, subtract it from individual dancer velocities
  - This approximates background/camera motion without full optical flow
