# Requirements Document

## Introduction

The Auto-Scan Formations feature replaces the current pixel-differencing motion detection in FormationAI with an intelligent, position-aware formation scanner. Instead of detecting "stable frames" via grayscale pixel differences, the new scanner samples the video at regular intervals (~3 seconds), runs YOLOv11 pose estimation on each sample to detect dancer positions, and only creates a formation snapshot when the dancer arrangement has meaningfully changed from the previously captured formation. This eliminates duplicate formations and produces a clean, deduplicated timeline of distinct dance formations.

## Glossary

- **Auto_Scanner**: The backend service responsible for periodically sampling video frames, detecting dancer positions via YOLO, comparing positions against the previous formation, and emitting only distinct formation timestamps.
- **Position_Comparator**: The component within the Auto_Scanner that determines whether two sets of dancer positions represent the same formation or a different one, using a configurable distance threshold.
- **Formation_Snapshot**: A record of a distinct dancer arrangement at a specific timestamp, consisting of the timestamp and the normalized positions of all detected dancers.
- **Scan_Interval**: The time gap (in seconds) between consecutive video samples during auto-scanning. Default is 3 seconds.
- **Change_Threshold**: The minimum average positional displacement (in normalized coordinates, 0.0–1.0) between two formation snapshots required to consider them distinct formations.
- **Dancer_Position**: The normalized (0.0–1.0) center coordinates (x, y) of a detected person's bounding box within the video frame.
- **Scan_Progress**: A server-sent event stream or polling response that reports the current progress of an auto-scan operation as a percentage and count of formations found so far.
- **YOLO_Detector**: The existing YOLOv11 pose estimation model used to detect persons in a video frame, exposed via `detect_dancers` in `detector.py`.
- **Scan_Session**: The session-scoped state that tracks an in-progress auto-scan, including intermediate results and cancellation status.

## Requirements

### Requirement 1: Periodic Position-Based Sampling

**User Story:** As a choreographer, I want the auto-scanner to check dancer positions every few seconds throughout the video, so that I get formation snapshots based on where dancers actually are rather than pixel-level motion.

#### Acceptance Criteria

1. WHEN an auto-scan is initiated for a session, THE Auto_Scanner SHALL sample video frames at intervals equal to the Scan_Interval (default 3 seconds) from the start to the end of the video.
2. FOR EACH sampled frame, THE Auto_Scanner SHALL run the YOLO_Detector to extract Dancer_Positions for all detected persons with confidence above 0.4.
3. THE Auto_Scanner SHALL use normalized coordinates (0.0–1.0 range relative to frame dimensions) for all Dancer_Position values.
4. WHEN no persons are detected in a sampled frame, THE Auto_Scanner SHALL skip that frame and continue to the next sample interval without creating a Formation_Snapshot.

### Requirement 2: Formation Change Detection and Deduplication

**User Story:** As a choreographer, I want the scanner to only capture a new formation when dancers have actually moved to different positions, so that I don't get duplicate snapshots of the same arrangement.

#### Acceptance Criteria

1. WHEN the Auto_Scanner detects dancers in a sampled frame and no previous Formation_Snapshot exists, THE Auto_Scanner SHALL create the first Formation_Snapshot at that timestamp.
2. WHEN the Auto_Scanner detects dancers in a sampled frame and a previous Formation_Snapshot exists, THE Position_Comparator SHALL compute the average Euclidean distance between matched dancer positions in the current frame and the previous Formation_Snapshot.
3. WHEN the average positional displacement exceeds the Change_Threshold (default 0.05 in normalized coordinates), THE Auto_Scanner SHALL create a new Formation_Snapshot at the current timestamp.
4. WHEN the average positional displacement is equal to or below the Change_Threshold, THE Auto_Scanner SHALL skip the current frame without creating a Formation_Snapshot.
5. WHEN the number of detected dancers changes between the current frame and the previous Formation_Snapshot, THE Auto_Scanner SHALL treat this as a formation change and create a new Formation_Snapshot.

### Requirement 3: Dancer Matching Across Samples

**User Story:** As a choreographer, I want the scanner to correctly match which dancer is which between consecutive samples, so that position comparisons are accurate even when dancers swap sides.

#### Acceptance Criteria

1. WHEN comparing the current frame's dancers to the previous Formation_Snapshot, THE Position_Comparator SHALL use proximity-based matching to pair each current dancer with the nearest previous dancer.
2. THE Position_Comparator SHALL use a greedy assignment strategy that pairs dancers by shortest Euclidean distance first, preventing duplicate assignments.
3. WHEN a dancer in the current frame cannot be matched to any previous dancer within a distance of 0.5 in normalized coordinates, THE Position_Comparator SHALL treat that dancer as unmatched.

### Requirement 4: Auto-Scan API Endpoint

**User Story:** As a frontend developer, I want a backend endpoint that triggers the position-aware auto-scan and returns the deduplicated formation timestamps, so that the UI can display them for user review.

#### Acceptance Criteria

1. THE Auto_Scanner SHALL expose a POST endpoint at `/video/scan/{session_id}` that replaces the current pixel-differencing scan with the position-aware scan.
2. WHEN the endpoint is called, THE Auto_Scanner SHALL return a JSON response containing the session_id and a list of Formation_Snapshots, each with a timestamp and dancer count.
3. WHEN the endpoint is called with an invalid or nonexistent session_id, THE Auto_Scanner SHALL return an HTTP 404 response with a descriptive error message.
4. WHEN an error occurs during scanning, THE Auto_Scanner SHALL return an HTTP 500 response with a descriptive error message.
5. THE Auto_Scanner SHALL maintain backward compatibility with the existing response format `{ "session_id": str, "auto_timestamps": [{ "timestamp": float }] }` so the frontend TimestampSelector continues to work without modification.

### Requirement 5: Scan Progress Reporting

**User Story:** As a choreographer, I want to see how far along the auto-scan is while it runs, so that I know the system is working and can estimate how long it will take.

#### Acceptance Criteria

1. WHEN an auto-scan is in progress, THE Auto_Scanner SHALL provide progress information including the percentage of the video processed and the number of distinct formations found so far.
2. THE Auto_Scanner SHALL expose a GET endpoint at `/video/scan/{session_id}/progress` that returns the current scan progress.
3. WHEN the scan is not in progress, THE Auto_Scanner SHALL return a response indicating the scan is either not started or already complete.

### Requirement 6: Configurable Scan Parameters

**User Story:** As a choreographer, I want to adjust the scan sensitivity and interval, so that I can tune the scanner for different types of dance videos (fast choreography vs. slow formations).

#### Acceptance Criteria

1. THE Auto_Scanner SHALL accept an optional `scan_interval` parameter (in seconds) on the scan endpoint, with a default value of 3.0 seconds.
2. THE Auto_Scanner SHALL accept an optional `change_threshold` parameter (in normalized coordinates) on the scan endpoint, with a default value of 0.05.
3. WHEN a `scan_interval` value less than 1.0 second is provided, THE Auto_Scanner SHALL reject the request with an HTTP 400 response indicating the minimum allowed interval.
4. WHEN a `change_threshold` value outside the range 0.01 to 0.5 is provided, THE Auto_Scanner SHALL reject the request with an HTTP 400 response indicating the valid range.

### Requirement 7: Frontend Auto-Scan Integration

**User Story:** As a choreographer, I want the auto-scan button in the UI to use the new position-aware scanner and show me progress while it runs, so that I have a smooth experience.

#### Acceptance Criteria

1. WHEN the user clicks the "Auto-scan" button in the TimestampSelector, THE TimestampSelector SHALL call the updated scan endpoint and display a progress indicator showing the percentage complete.
2. WHILE the auto-scan is in progress, THE TimestampSelector SHALL poll the progress endpoint every 2 seconds and update the displayed progress percentage and formation count.
3. WHEN the auto-scan completes, THE TimestampSelector SHALL merge the returned formation timestamps into the existing timestamp list, removing duplicates, and sort them chronologically.
4. WHEN the auto-scan fails, THE TimestampSelector SHALL display an error message and allow the user to retry or add timestamps manually.

### Requirement 8: Position Comparison Correctness (Round-Trip Property)

**User Story:** As a developer, I want to verify that the position comparison logic is correct and consistent, so that formation deduplication is reliable.

#### Acceptance Criteria

1. FOR ALL sets of Dancer_Positions P, THE Position_Comparator SHALL determine that P compared to itself produces an average displacement of 0.0 (identity property).
2. FOR ALL pairs of Dancer_Position sets A and B, THE Position_Comparator SHALL produce the same displacement value regardless of the order of comparison (symmetry property).
3. FOR ALL Dancer_Position sets where every dancer has moved by exactly the Change_Threshold distance, THE Position_Comparator SHALL classify the formation as changed.
4. FOR ALL Dancer_Position sets where every dancer has moved by less than the Change_Threshold distance, THE Position_Comparator SHALL classify the formation as unchanged.
