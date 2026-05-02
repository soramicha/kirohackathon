import cv2
import json
import numpy as np
from pathlib import Path
from typing import Literal
from config import FormationDetectionConfig


# Detection parameters (imported from config.py)
# Adjust these in config.py to tune detection behavior


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
    Scan the video and detect stable formation timestamps using multiple signals:
    1. Low motion (frame difference)
    2. Presence of multiple people (YOLO detection)
    3. No scene cuts or camera changes (edge detection)
    4. Minimum spacing between formations
    
    This reduces false positives from transitions, empty frames, and single-person shots.
    """
    from services.detector import _get_model
    
    config = FormationDetectionConfig
    
    stable_timestamps = []
    prev_gray = None
    prev_edges = None
    stable_start = None
    stable_people_count = 0
    current_time = 0.0
    
    # Load YOLO model for people counting
    model = _get_model()

    while current_time < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)
        ret, frame = cap.read()
        if not ret:
            break

        # 1. Motion detection (frame difference)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        # 2. Edge detection for scene cuts
        edges = cv2.Canny(gray, 50, 150)
        
        # 3. People counting (run YOLO every sample)
        results = model(frame, verbose=False, conf=config.YOLO_CONFIDENCE, classes=[0])[0]
        people_count = len(results.boxes) if results.boxes is not None else 0

        is_stable = False
        has_scene_cut = False
        
        if prev_gray is not None and prev_edges is not None:
            # Check motion stability
            diff = cv2.absdiff(prev_gray, gray)
            mean_diff = np.mean(diff)
            
            # Check for scene cuts (sudden edge changes)
            edge_diff = cv2.absdiff(prev_edges, edges)
            edge_change_ratio = np.count_nonzero(edge_diff) / edge_diff.size
            has_scene_cut = edge_change_ratio > config.EDGE_CHANGE_THRESHOLD
            
            # A frame is stable if:
            # - Low motion
            # - Multiple people present
            # - No scene cut
            is_stable = (
                mean_diff < config.MOTION_THRESHOLD and 
                people_count >= config.MIN_PEOPLE_COUNT and
                not has_scene_cut
            )

            if is_stable:
                if stable_start is None:
                    stable_start = current_time
                    stable_people_count = people_count
                elif current_time - stable_start >= config.MIN_FORMATION_DURATION:
                    # Capture the midpoint of the stable window
                    midpoint = stable_start + (current_time - stable_start) / 2
                    
                    # Only add if:
                    # - No previous timestamps, OR
                    # - Sufficient spacing from last timestamp
                    if not stable_timestamps or midpoint - stable_timestamps[-1] >= config.MIN_SPACING_BETWEEN:
                        stable_timestamps.append(round(midpoint, 2))
                        # Reset to look for next formation
                        stable_start = None
            else:
                # Reset if stability breaks
                stable_start = None
                stable_people_count = 0

        prev_gray = gray
        prev_edges = edges
        current_time += config.SAMPLE_INTERVAL

    return stable_timestamps
