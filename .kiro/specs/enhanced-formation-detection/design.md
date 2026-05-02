# Design Document

## Overview

This design adds a multi-signal formation detection pipeline to the existing `extractor.py` system. The architecture introduces three new service modules (audio analyzer, velocity tracker, hull analyzer) that feed into a fusion function within the extractor. The existing detection path is preserved untouched — the new logic is only invoked when the `"audio_aware"` preset is selected.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  extractor.py                        │
│                                                      │
│  detect_formation_timestamps(session_id)             │
│       │                                              │
│       ├── preset != "audio_aware"                    │
│       │   └── _detect_formation_timestamps() [existing] │
│       │                                              │
│       └── preset == "audio_aware"                    │
│           └── _detect_formations_enhanced()          │
│               │                                      │
│               ├── audio_analyzer.analyze_audio()     │
│               │   → phrase_boundaries[], tempo, beats│
│               │                                      │
│               ├── _compute_velocity_curve()          │
│               │   → group_velocity[], dancer_counts[]│
│               │                                      │
│               ├── _compute_hull_stability()          │
│               │   → hull_areas[], stability_scores[] │
│               │                                      │
│               └── _fuse_signals()                    │
│                   → confirmed_timestamps[]           │
└─────────────────────────────────────────────────────┘
```

## New Files

### `backend/services/audio_analyzer.py`

Responsible for audio extraction and rhythmic analysis.

```python
def analyze_audio(session_id: str) -> dict:
    """
    Extract audio from video, run beat/onset detection, compute phrase boundaries.
    
    Returns:
        {
            "tempo": float,              # BPM
            "beats": list[float],        # beat timestamps in seconds
            "onsets": list[float],        # onset timestamps in seconds
            "phrase_boundaries": list[float],  # phrase boundary timestamps
            "duration": float,           # audio duration in seconds
        }
    
    Caches result to sessions/{session_id}/audio_analysis.json.
    Falls back gracefully if ffmpeg or audio extraction fails.
    """
    # 1. Check cache: sessions/{session_id}/audio_analysis.json
    # 2. Extract audio: ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 22050 -ac 1 temp_audio.wav
    # 3. Load with librosa.load(wav_path, sr=22050)
    # 4. Beat tracking: librosa.beat.beat_track(y=y, sr=sr)
    # 5. Onset detection: librosa.onset.onset_detect(y=y, sr=sr, units='time')
    # 6. Compute phrase boundaries from beats at PHRASE_LENGTH intervals
    # 7. Cache results, delete temp WAV
    # 8. Return analysis dict
```

### Modified Files

### `backend/services/extractor.py` — New functions added

```python
def _detect_formations_enhanced(session_id: str, cap, fps: float, duration: float) -> list[float]:
    """
    Enhanced detection using audio + velocity + hull signals.
    Called when preset is "audio_aware".
    """
    # 1. Run audio analysis (with fallback)
    # 2. Sample video and compute velocity curve + hull areas
    # 3. Fuse signals to produce timestamps

def _compute_velocity_curve(cap, fps: float, duration: float, config) -> dict:
    """
    Sample video frames, detect dancers via YOLO, compute per-dancer velocities.
    
    Returns:
        {
            "timestamps": list[float],       # sample timestamps
            "group_velocity": list[float],   # mean dancer speed at each sample
            "dancer_counts": list[int],      # people count at each sample
            "dancer_positions": list[list],  # per-frame dancer centroids (for hull)
        }
    """
    # For each sampled frame:
    #   1. Run YOLO detection (reuse for people counting)
    #   2. Extract bounding box centroids, normalize to [0,1]
    #   3. Match centroids to previous frame by proximity (Hungarian algorithm)
    #   4. Compute displacement for matched dancers
    #   5. Detect scene cuts via histogram comparison, discard those transitions
    #   6. Store group_velocity = mean(displacements) for this frame

def _compute_hull_stability(dancer_positions: list[list], window: int = 5) -> list[float]:
    """
    Compute convex hull area at each frame and stability score over sliding window.
    
    Returns list of stability scores (higher = more stable) aligned with timestamps.
    """
    # For each frame:
    #   1. If >= 3 dancers: compute ConvexHull area (scipy.spatial.ConvexHull)
    #   2. Normalize area by frame dimensions
    #   3. Compute variance of hull area in [i-window, i+window]
    #   4. stability_score = 1.0 / (1.0 + variance)

def _fuse_signals(
    phrase_boundaries: list[float] | None,
    timestamps: list[float],
    group_velocity: list[float],
    dancer_counts: list[int],
    hull_stability: list[float],
    config,
) -> list[dict]:
    """
    Combine signals to produce confirmed formation timestamps.
    
    Algorithm:
    1. If phrase_boundaries available:
       - For each boundary, find velocity minimum in ±VELOCITY_SEARCH_WINDOW
       - Check hull stability at that minimum
       - Check dancer count >= MIN_PEOPLE_COUNT
       - If all pass, confirm as formation
    2. If no audio (fallback):
       - Find all local minima of group_velocity
       - Filter by hull stability threshold
       - Filter by dancer count
       - Enforce MIN_SPACING_BETWEEN
    3. Return list of dicts with timestamp and contributing signals
    """
```

### `backend/config.py` — New parameters added to FormationDetectionConfig

```python
# Enhanced detection parameters (used with "audio_aware" preset)
PHRASE_LENGTH = 8                    # counts per phrase (8-count standard)
VELOCITY_SEARCH_WINDOW = 10         # frames to search around phrase boundary
HULL_STABILITY_THRESHOLD = 0.7      # minimum stability score to confirm
CAMERA_MOTION_THRESHOLD = 0.02      # normalized background motion threshold
AUDIO_SAMPLE_RATE = 22050           # librosa sample rate for audio analysis
```

### `backend/config.py` — New preset added to DetectionPresets

```python
@staticmethod
def audio_aware():
    """
    Audio-aware detection — uses music structure + dancer velocity + hull stability.
    Best for: Music-driven choreography with clear phrase structure.
    """
    FormationDetectionConfig.MIN_FORMATION_DURATION = 2.0  # shorter, audio handles timing
    FormationDetectionConfig.MOTION_THRESHOLD = 8.0
    FormationDetectionConfig.MIN_PEOPLE_COUNT = 2
    FormationDetectionConfig.MIN_SPACING_BETWEEN = 4.0     # tighter, audio-gated
    FormationDetectionConfig.EDGE_CHANGE_THRESHOLD = 0.15
    FormationDetectionConfig.PHRASE_LENGTH = 8
    FormationDetectionConfig.VELOCITY_SEARCH_WINDOW = 10
    FormationDetectionConfig.HULL_STABILITY_THRESHOLD = 0.7
```

## Data Flow

1. User selects `"audio_aware"` preset via `/video/scan/{session_id}`
2. `detect_formation_timestamps()` routes to `_detect_formations_enhanced()`
3. Audio analyzer extracts audio → computes beats → derives phrase boundaries
4. Video is sampled at `SAMPLE_INTERVAL` rate, YOLO runs on each frame
5. Velocity curve and hull areas are computed from YOLO detections
6. Fusion algorithm searches near each phrase boundary for velocity minima confirmed by hull stability
7. Results returned in same format as current detector, with optional signal metadata

## Dependencies

- **librosa** (new) — audio analysis, beat tracking, onset detection
- **ffmpeg** (system) — audio extraction from video (already likely available for yt-dlp)
- **scipy** (existing) — ConvexHull computation, already in requirements.txt
- **numpy** (existing) — signal processing

## Error Handling

- If ffmpeg is not installed or audio extraction fails → fall back to velocity + hull only (no audio)
- If librosa is not installed → fall back to Current_Detector entirely
- If video has no audio track → fall back to velocity + hull only
- If fewer than 3 dancers detected → skip hull analysis, use audio + velocity only
- All fallbacks are silent (logged but don't raise errors)

## API Changes

The `/video/scan/{session_id}` endpoint already accepts a `preset` parameter. The only change is accepting `"audio_aware"` as a new valid value. The response format gains an optional `"signals"` field per timestamp:

```json
{
  "session_id": "abc123",
  "auto_timestamps": [
    {
      "timestamp": 12.5,
      "signals": ["audio_phrase", "velocity_minimum", "hull_stable"]
    }
  ],
  "preset_used": "audio_aware"
}
```
