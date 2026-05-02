"""
Audio analysis service for formation detection.
Extracts audio from video and performs beat tracking, onset detection,
and phrase boundary identification using librosa.
"""

import json
import subprocess
import logging
from pathlib import Path

from config import FormationDetectionConfig

logger = logging.getLogger(__name__)


def analyze_audio(session_id: str) -> dict | None:
    """
    Extract audio from video, run beat/onset detection, compute phrase boundaries.

    Returns dict with tempo, beats, onsets, phrase_boundaries, duration.
    Returns None if audio extraction or analysis fails (graceful fallback).
    Caches results to sessions/{session_id}/audio_analysis.json.
    """
    session_dir = Path(f"sessions/{session_id}")
    cache_path = session_dir / "audio_analysis.json"

    # Check cache first
    if cache_path.exists():
        try:
            with open(cache_path) as f:
                cached = json.load(f)
            logger.info(f"Using cached audio analysis for {session_id}")
            return cached
        except (json.JSONDecodeError, KeyError):
            pass  # Re-analyze if cache is corrupt

    # Try importing librosa
    try:
        import librosa
    except ImportError:
        logger.warning("librosa not installed — skipping audio analysis")
        return None

    # Find video file
    video_path = session_dir / "video.mp4"
    if not video_path.exists():
        candidates = list(session_dir.glob("video.*"))
        if not candidates:
            logger.warning(f"No video file found for session {session_id}")
            return None
        video_path = candidates[0]

    # Extract audio to temporary WAV
    wav_path = session_dir / "_temp_audio.wav"
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-vn",                          # no video
                "-acodec", "pcm_s16le",         # PCM 16-bit
                "-ar", str(FormationDetectionConfig.AUDIO_SAMPLE_RATE),
                "-ac", "1",                     # mono
                str(wav_path),
            ],
            capture_output=True,
            timeout=120,
        )
        if result.returncode != 0 or not wav_path.exists():
            logger.warning(f"ffmpeg audio extraction failed: {result.stderr[:200]}")
            return None
    except FileNotFoundError:
        logger.warning("ffmpeg not found — skipping audio analysis")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg audio extraction timed out")
        return None

    try:
        # Load audio
        sr = FormationDetectionConfig.AUDIO_SAMPLE_RATE
        y, sr = librosa.load(str(wav_path), sr=sr)
        audio_duration = librosa.get_duration(y=y, sr=sr)

        # Beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

        # Handle tempo being an array (librosa >= 0.10)
        if hasattr(tempo, "__len__"):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)

        # Onset detection
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()

        # Compute phrase boundaries from beats
        phrase_len = FormationDetectionConfig.PHRASE_LENGTH
        phrase_boundaries = []
        for i in range(0, len(beat_times), phrase_len):
            phrase_boundaries.append(round(beat_times[i], 3))

        analysis = {
            "tempo": round(tempo, 2),
            "beats": [round(b, 3) for b in beat_times],
            "onsets": [round(o, 3) for o in onset_times],
            "phrase_boundaries": phrase_boundaries,
            "duration": round(audio_duration, 3),
        }

        # Cache results
        with open(cache_path, "w") as f:
            json.dump(analysis, f, indent=2)

        logger.info(
            f"Audio analysis complete: tempo={tempo:.1f} BPM, "
            f"{len(beat_times)} beats, {len(phrase_boundaries)} phrases"
        )
        return analysis

    except Exception as e:
        logger.warning(f"Audio analysis failed: {e}")
        return None
    finally:
        # Clean up temp WAV
        if wav_path.exists():
            wav_path.unlink()
