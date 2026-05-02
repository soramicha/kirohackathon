import cv2
import json
import numpy as np
from pathlib import Path
from typing import Literal


MIN_FORMATION_DURATION = 2.0  # seconds — lowered from 3.0 to catch more formations
SAMPLE_INTERVAL = 2.0          # sample every 2s


def _get_video_path(session_id: str) -> Path:
    session_dir = Path(f"sessions/{session_id}")
    meta_path = session_dir / "metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)
        return Path(meta.get("video_path", str(session_dir / "video.mp4")))
    candidates = list(session_dir.glob("video.*"))
    return candidates[0] if candidates else session_dir / "video.mp4"


def detect_formation_timestamps(session_id: str) -> list[dict]:
    """
    Scan the video and return stable formation timestamps.
    Exposed as a standalone function so the router can call it separately.
    """
    video_path = _get_video_path(session_id)
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    timestamps = _detect_formation_timestamps(cap, fps, duration)
    cap.release()

    # wrap as dicts to match frontend expectation
    return [{"timestamp": ts} for ts in timestamps]


def extract_frames(
    session_id: str,
    mode: Literal["auto", "manual"] = "auto",
    timestamps: list[float] | None = None,
) -> list[dict]:
    """
    Extract JPEG frames from the downloaded video.
    """
    session_dir = Path(f"sessions/{session_id}")
    frames_dir = session_dir / "frames"
    frames_dir.mkdir(exist_ok=True)

    video_path = _get_video_path(session_id)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    if mode == "manual" and timestamps:
        selected_timestamps = timestamps
    else:
        selected_timestamps = _detect_formation_timestamps(cap, fps, duration)

    cap.release()

    # re-open to extract frames at selected timestamps
    cap = cv2.VideoCapture(str(video_path))
    extracted = []

    for ts in selected_timestamps:
        frame_id = f"frame_{int(ts * 1000):08d}"  # millisecond precision
        out_path = frames_dir / f"{frame_id}.jpg"

        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(str(out_path), frame)
            extracted.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "path": str(out_path.relative_to(session_dir)),
            })

    cap.release()

    # persist frame index
    index_path = session_dir / "frames_index.json"
    with open(index_path, "w") as f:
        json.dump(extracted, f, indent=2)

    return extracted


def _detect_formation_timestamps(cap, fps: float, duration: float) -> list[float]:
    """
    Scan the video at SAMPLE_INTERVAL intervals and detect timestamps where
    the scene is stable for at least MIN_FORMATION_DURATION seconds.

    Uses frame difference to detect motion — low motion = stable formation.
    """
    stable_timestamps = []
    prev_gray = None
    stable_start = None
    current_time = 0.0

    while current_time < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if prev_gray is not None:
            diff = cv2.absdiff(prev_gray, gray)
            mean_diff = np.mean(diff)

            is_stable = mean_diff < 12.0  # raised from 8.0 — more tolerant of small movements

            if is_stable:
                if stable_start is None:
                    stable_start = current_time
                elif current_time - stable_start >= MIN_FORMATION_DURATION:
                    # capture the midpoint of the stable window
                    midpoint = stable_start + (current_time - stable_start) / 2
                    if not stable_timestamps or midpoint - stable_timestamps[-1] > MIN_FORMATION_DURATION:
                        stable_timestamps.append(round(midpoint, 2))
            else:
                stable_start = None

        prev_gray = gray
        current_time += SAMPLE_INTERVAL

    return stable_timestamps
