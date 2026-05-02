# Requirements Document

## Introduction

This feature enhances the formation detection algorithm in FormationAI by replacing the current single-signal motion-threshold approach with a multi-signal detection system. The current detector (`extractor.py`) uses frame differencing, YOLO person counting, and edge-based scene cut detection to find stable formations. While functional, it produces false positives from camera movement and misses formations where dancers settle gradually.

The enhanced system combines three high-value signals: audio phrase boundary detection (leveraging the fact that choreography is phrase-locked to music), per-dancer velocity tracking (more reliable than whole-frame motion), and convex hull stabilization (geometric confirmation of formation holds). These signals are fused to produce significantly more accurate formation timestamps with fewer false triggers.

The existing detection presets (strict, balanced, loose, solo) and configuration system in `config.py` will be preserved. The enhanced algorithm will be available as a new detection mode that can be selected alongside or instead of the current approach.

## Glossary

- **Audio_Analyzer**: The service that extracts audio from video and performs beat tracking, onset detection, and phrase boundary identification using librosa
- **Velocity_Tracker**: The component that computes per-dancer movement speed over time using YOLO bounding box centroids from consecutive frames
- **Hull_Analyzer**: The component that computes the convex hull of all dancer positions and measures its area stability over time
- **Phrase_Boundary**: A point in the music where a rhythmic phrase (typically 8-count or 16-count) begins or ends — the most likely moment for a formation change
- **Group_Velocity**: The mean speed of all tracked dancer centroids at a given frame, where near-zero values indicate a formation hold
- **Formation_Candidate**: A timestamp identified by the fusion of audio and motion signals as a likely formation hold moment
- **Signal_Fusion**: The process of combining audio phrase boundaries with motion velocity minima to confirm formation timestamps
- **Current_Detector**: The existing detection algorithm in `_detect_formation_timestamps()` that uses frame differencing and YOLO counting

## Requirements

### Requirement 1: Audio Extraction and Beat Tracking

**User Story:** As a choreographer, I want the system to analyze the music in my video, so that formation detection aligns with the rhythmic structure of the choreography.

#### Acceptance Criteria

1. WHEN a video file exists for a session, THE Audio_Analyzer SHALL extract the audio track to a temporary WAV file using ffmpeg
2. THE Audio_Analyzer SHALL compute beat positions and tempo using librosa's beat tracking
3. THE Audio_Analyzer SHALL detect onset events (hits, accents) in the audio signal
4. THE Audio_Analyzer SHALL identify phrase boundaries at 8-count intervals derived from the detected tempo
5. IF audio extraction fails (e.g., silent video, corrupt audio), THEN THE system SHALL fall back to the Current_Detector without audio signals
6. THE Audio_Analyzer SHALL cache the extracted audio analysis results in the session directory as `audio_analysis.json` to avoid recomputation

### Requirement 2: Per-Dancer Velocity Tracking

**User Story:** As a choreographer, I want the system to track individual dancer movement rather than whole-frame motion, so that camera movement and costume flutter don't cause false detections.

#### Acceptance Criteria

1. THE Velocity_Tracker SHALL detect dancers using YOLO at each sampled frame and track bounding box centroids across consecutive frames
2. THE Velocity_Tracker SHALL compute per-dancer velocity as the displacement of each dancer's bounding box centroid between consecutive sampled frames
3. THE Velocity_Tracker SHALL compute Group_Velocity as the mean of all per-dancer velocities at each sampled frame
4. THE Velocity_Tracker SHALL normalize velocities relative to frame dimensions so that results are resolution-independent
5. THE Velocity_Tracker SHALL use bounding box center points (approximating torso position) rather than extremity positions to filter out in-place movement like arm waves
6. WHEN a dancer appears or disappears between frames (occlusion, entering/exiting), THE Velocity_Tracker SHALL exclude that dancer from the velocity calculation for that frame pair

### Requirement 3: Convex Hull Stability Analysis

**User Story:** As a choreographer, I want the system to confirm formations by checking that the group's spatial arrangement has stabilized, so that detections are geometrically validated.

#### Acceptance Criteria

1. THE Hull_Analyzer SHALL compute the convex hull area of all detected dancer positions at each sampled frame
2. THE Hull_Analyzer SHALL compute a stability score as the inverse of hull area variance over a sliding window of ±5 frames around each Formation_Candidate
3. WHEN the hull area variance within the window is below a configurable threshold, THE Hull_Analyzer SHALL confirm the Formation_Candidate as stable
4. WHEN fewer than 3 dancers are detected, THE Hull_Analyzer SHALL skip hull analysis and rely solely on audio and velocity signals
5. THE Hull_Analyzer SHALL normalize hull area relative to frame dimensions for resolution independence

### Requirement 4: Multi-Signal Fusion Algorithm

**User Story:** As a choreographer, I want the system to combine audio, motion, and geometric signals to find formations, so that detection is more accurate than any single signal alone.

#### Acceptance Criteria

1. THE Signal_Fusion SHALL use audio Phrase_Boundaries as the primary search grid for formation candidates
2. FOR EACH Phrase_Boundary, THE Signal_Fusion SHALL search within a configurable window (default ±10 frames) for the local minimum of Group_Velocity
3. THE Signal_Fusion SHALL confirm each candidate using the Hull_Analyzer stability score
4. THE Signal_Fusion SHALL enforce minimum spacing between confirmed formations (using the existing `MIN_SPACING_BETWEEN` config parameter)
5. THE Signal_Fusion SHALL require a minimum number of people (using the existing `MIN_PEOPLE_COUNT` config parameter) at each candidate timestamp
6. WHEN no audio signal is available, THE Signal_Fusion SHALL fall back to detecting Group_Velocity minima directly, confirmed by hull stability
7. THE Signal_Fusion SHALL return timestamps sorted chronologically with the same output format as the Current_Detector (`list[dict]` with `"timestamp"` keys)

### Requirement 5: Scene Cut and Camera Motion Filtering

**User Story:** As a choreographer, I want the system to ignore camera cuts and camera pans, so that these don't produce false formation detections.

#### Acceptance Criteria

1. THE system SHALL detect scene cuts using histogram difference between consecutive frames
2. WHEN a scene cut is detected, THE Velocity_Tracker SHALL discard velocity data for that frame transition
3. THE system SHALL detect sustained camera motion by comparing background optical flow magnitude against a threshold
4. WHEN sustained camera motion is detected, THE Velocity_Tracker SHALL compensate dancer velocities by subtracting the estimated camera motion vector
5. THE existing `EDGE_CHANGE_THRESHOLD` config parameter SHALL continue to be used for scene cut sensitivity

### Requirement 6: Enhanced Detection Configuration

**User Story:** As a choreographer, I want to select the enhanced detection mode and tune its parameters, so that I can optimize detection for different video types.

#### Acceptance Criteria

1. THE system SHALL expose the enhanced detection as a new preset called `"audio_aware"` in the existing `DetectionPresets` class
2. THE `config.py` SHALL include new configuration parameters: `PHRASE_LENGTH` (default 8 counts), `VELOCITY_SEARCH_WINDOW` (default 10 frames), `HULL_STABILITY_THRESHOLD`, and `CAMERA_MOTION_THRESHOLD`
3. THE `/video/scan/{session_id}` endpoint SHALL accept `"audio_aware"` as a valid preset value
4. WHEN the `"audio_aware"` preset is selected, THE system SHALL use the multi-signal fusion algorithm
5. WHEN any other preset is selected, THE system SHALL use the Current_Detector (preserving backward compatibility)
6. THE system SHALL return additional metadata in the scan response indicating which signals contributed to each detected formation (e.g., `"signals": ["audio_phrase", "velocity_minimum", "hull_stable"]`)

### Requirement 7: Performance and Caching

**User Story:** As a choreographer, I want the enhanced detection to complete in a reasonable time, so that I don't have to wait excessively for results.

#### Acceptance Criteria

1. THE enhanced detection SHALL complete within 2x the processing time of the Current_Detector for the same video
2. THE Audio_Analyzer results SHALL be cached in `audio_analysis.json` and reused across multiple scan runs
3. THE system SHALL reuse YOLO detections from the velocity tracking phase for people counting (no duplicate inference)
4. WHEN the video has already been scanned with the enhanced detector, THE system SHALL offer to reuse cached audio analysis
5. THE temporary WAV file extracted for audio analysis SHALL be deleted after analysis is complete to conserve disk space
