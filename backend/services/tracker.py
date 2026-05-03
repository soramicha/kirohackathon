"""
Person-based tracking using YOLOv11 + BoT-SORT with ReID.

Instead of matching by position/color between independent frames,
this runs the tracker sequentially through the video so each person
gets a persistent ID based on their visual appearance embedding.
"""

import cv2
import json
import numpy as np
from pathlib import Path
from ultralytics import YOLO

MODEL_NAME = "yolo11n-pose.pt"
TRACKER_CONFIG = str(Path(__file__).parent.parent / "botsort_reid.yaml")

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = YOLO(MODEL_NAME)
    return _model


def track_video(
    session_id: str,
    video_path: str,
    target_timestamps: list[float],
    expected_count: int = None,
) -> dict:
    """
    Run YOLOv11 + BoT-SORT with ReID through the video sequentially.
    Returns dancer positions at each target timestamp with persistent IDs.

    The tracker processes every Nth frame to maintain ID continuity,
    but only returns full results at the requested timestamps.

    Returns: { timestamp: [{ id, label, x, y, bbox, confidence, x_top, y_top }] }
    """
    model = _get_model()
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if fps <= 0:
        cap.release()
        return {}

    # Convert timestamps to frame numbers
    target_frames = {}
    for ts in sorted(target_timestamps):
        frame_num = int(ts * fps)
        frame_num = min(frame_num, total_frames - 1)
        target_frames[frame_num] = ts

    max_target = max(target_frames.keys()) if target_frames else 0

    # Process every Nth frame to keep tracking alive between timestamps
    # but not every single frame (too slow)
    SKIP = max(1, int(fps / 4))  # ~4 frames per second — enough for tracking continuity

    results_by_ts = {}
    frame_idx = 0

    while frame_idx <= max_target + int(fps):
        ret, frame = cap.read()
        if not ret:
            break

        # Only run tracker on every Nth frame OR on target frames
        is_target = frame_idx in target_frames
        is_sample = (frame_idx % SKIP == 0)

        if is_target or is_sample:
            h, w = frame.shape[:2]

            track_results = model.track(
                frame,
                persist=True,
                tracker=TRACKER_CONFIG,
                verbose=False,
                conf=0.25,
                classes=[0],  # persons only
            )[0]

            if is_target:
                ts = target_frames[frame_idx]
                dancers = _extract_dancers(track_results, w, h)
                results_by_ts[ts] = dancers

        frame_idx += 1

    cap.release()

    # If expected_count is set, add offstage placeholders for missing dancers
    if expected_count:
        all_seen_ids = set()
        for ts, dancers in results_by_ts.items():
            for d in dancers:
                all_seen_ids.add(d["id"])

        for ts in results_by_ts:
            current_ids = {d["id"] for d in results_by_ts[ts]}
            missing = all_seen_ids - current_ids

            # Also add IDs up to expected_count if we haven't seen enough
            max_id = max(all_seen_ids) if all_seen_ids else 0
            while len(all_seen_ids) < expected_count:
                max_id += 1
                all_seen_ids.add(max_id)
                missing.add(max_id)

            for mid in sorted(missing):
                if mid not in current_ids:
                    idx = len(results_by_ts[ts])
                    results_by_ts[ts].append({
                        "id": mid,
                        "label": f"Dancer {mid} (offstage)",
                        "x": 1.2 + (idx % 2) * 0.15,
                        "y": 0.1 + idx * 0.12,
                        "bbox": [0, 0, 0, 0],
                        "keypoints": [],
                        "confidence": 0.0,
                        "offstage": True,
                    })

    return results_by_ts


def _extract_dancers(track_results, w: int, h: int) -> list[dict]:
    """Extract dancer data from YOLO track results."""
    dancers = []

    if track_results.boxes is None or track_results.boxes.id is None:
        return dancers

    for i, (box, track_id, conf) in enumerate(zip(
        track_results.boxes.xyxy,
        track_results.boxes.id,
        track_results.boxes.conf,
    )):
        x1, y1, x2, y2 = [float(v) for v in box]
        cx = (x1 + x2) / 2 / w
        cy = (y1 + y2) / 2 / h
        tid = int(track_id)

        h_zone = "top" if cy < 0.33 else ("middle" if cy < 0.66 else "bottom")
        v_zone = "left" if cx < 0.33 else ("center" if cx < 0.66 else "right")

        keypoints = []
        if track_results.keypoints is not None and i < len(track_results.keypoints.xy):
            kps = track_results.keypoints.xy[i].tolist()
            keypoints = [{"x": round(kp[0] / w, 4), "y": round(kp[1] / h, 4)} for kp in kps]

        dancers.append({
            "id": tid,
            "label": f"Dancer {tid} ({h_zone}-{v_zone})",
            "x": round(cx, 4),
            "y": round(cy, 4),
            "bbox": [round(x1), round(y1), round(x2), round(y2)],
            "keypoints": keypoints,
            "confidence": round(float(conf), 3),
        })

    return sorted(dancers, key=lambda d: d["id"])
