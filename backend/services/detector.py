import cv2
import json
import numpy as np
from pathlib import Path
from ultralytics import YOLO

# YOLOv11 pose model — medium for better accuracy with groups
MODEL_NAME = "yolo11m-pose.pt"

_model = None
_detect_model = None


def _get_model():
    """Get the medium pose model for per-frame dancer detection."""
    global _model
    if _model is None:
        _model = YOLO(MODEL_NAME)  # downloads automatically on first run
    return _model


def _get_detect_model():
    """Get a lightweight detection-only model for fast scanning (velocity curve)."""
    global _detect_model
    if _detect_model is None:
        # Use the nano detection model for fast scanning — we only need bounding boxes
        _detect_model = YOLO("yolo11n.pt")
    return _detect_model


def detect_dancers(session_id: str, frame_id: str) -> list[dict]:
    """
    Run YOLOv11 pose estimation on a single frame.
    Returns dancers with consistent IDs, positions, and keypoints.

    Uses a multi-pass approach when expected dancer count is known:
    1. First pass at normal confidence (0.25)
    2. If under expected count, second pass at lower confidence (0.15)
    3. Trim extras by confidence if over expected count
    """
    session_dir = Path(f"sessions/{session_id}")
    frame_path = session_dir / "frames" / f"{frame_id}.jpg"

    if not frame_path.exists():
        raise FileNotFoundError(f"Frame not found: {frame_path}")

    img = cv2.imread(str(frame_path))
    h, w = img.shape[:2]

    model = _get_model()
    expected_count = _get_expected_count(session_id)

    # First pass — normal confidence
    dancers = _run_detection(model, img, h, w, conf_threshold=0.25)

    # If we're under expected count, try a lower confidence pass
    if expected_count and len(dancers) < expected_count:
        dancers_low = _run_detection(model, img, h, w, conf_threshold=0.15)
        # Merge: keep all from first pass, add new detections from low-conf pass
        # that don't overlap with existing ones
        existing_positions = [(d["x"], d["y"]) for d in dancers]
        for d in dancers_low:
            is_duplicate = False
            for ex, ey in existing_positions:
                dist = np.sqrt((d["x"] - ex) ** 2 + (d["y"] - ey) ** 2)
                if dist < 0.05:  # within 5% of frame = same person
                    is_duplicate = True
                    break
            if not is_duplicate:
                dancers.append(d)
                existing_positions.append((d["x"], d["y"]))
            if len(dancers) >= expected_count:
                break

    # Trim to expected dancer count if we have too many detections
    if expected_count and len(dancers) > expected_count:
        dancers.sort(key=lambda d: d["confidence"], reverse=True)
        dancers = dancers[:expected_count]

    # sort left-to-right for consistent numbering within a frame
    dancers.sort(key=lambda d: d["x"])
    for i, d in enumerate(dancers):
        d["id"] = i + 1
        zone = d["label"].split("(")[-1].rstrip(")")
        d["label"] = f"Dancer {i + 1} ({zone})"

    # persist
    out_path = session_dir / "formations" / f"{frame_id}_dancers.json"
    out_path.parent.mkdir(exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dancers, f, indent=2)

    return dancers


def _run_detection(model, img, h: int, w: int, conf_threshold: float = 0.25) -> list[dict]:
    """Run YOLO detection on an image and return dancer dicts."""
    results = model(img, verbose=False, conf=conf_threshold)[0]

    dancers = []
    if results.boxes is not None:
        for i, (box, conf, cls) in enumerate(zip(
            results.boxes.xyxy,
            results.boxes.conf,
            results.boxes.cls
        )):
            if int(cls) != 0:  # person class only
                continue

            x1, y1, x2, y2 = [float(v) for v in box]
            cx = (x1 + x2) / 2 / w
            cy = (y1 + y2) / 2 / h

            # Filter out very small detections (likely noise)
            box_w = (x2 - x1) / w
            box_h = (y2 - y1) / h
            if box_w < 0.02 or box_h < 0.04:
                continue

            h_zone = "top" if cy < 0.33 else ("middle" if cy < 0.66 else "bottom")
            v_zone = "left" if cx < 0.33 else ("center" if cx < 0.66 else "right")

            keypoints = []
            if results.keypoints is not None and i < len(results.keypoints.xy):
                kps = results.keypoints.xy[i].tolist()
                keypoints = [{"x": round(kp[0] / w, 4), "y": round(kp[1] / h, 4)} for kp in kps]

            dancers.append({
                "id": i + 1,
                "label": f"Dancer {i + 1} ({h_zone}-{v_zone})",
                "x": round(cx, 4),
                "y": round((y1 + y2) / 2 / h, 4),
                "bbox": [round(x1), round(y1), round(x2), round(y2)],
                "keypoints": keypoints,
                "confidence": round(float(conf), 3),
            })

    return dancers


def _get_expected_count(session_id: str) -> int | None:
    """Read expected dancer count from session directory."""
    count_path = Path(f"sessions/{session_id}/expected_dancer_count.json")
    if count_path.exists():
        try:
            with open(count_path) as f:
                data = json.load(f)
            return data.get("expected_count")
        except Exception:
            return None
    return None


def track_dancers_in_clip(session_id: str, video_path: str, timestamps: list[float]) -> dict:
    """
    Use YOLOv11 + BoT-SORT to track dancers across the full video clip
    and return consistent IDs at each requested timestamp.

    Returns: { timestamp -> [{ id, x, y, bbox, keypoints }] }
    """
    model = _get_model()
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)

    # Convert timestamps to frame numbers
    target_frames = {int(ts * fps): ts for ts in timestamps}
    max_frame = max(target_frames.keys()) + int(fps * 2)

    results_by_ts = {}
    frame_idx = 0

    while frame_idx <= max_frame:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx in target_frames:
            ts = target_frames[frame_idx]
            h, w = frame.shape[:2]

            # Run tracker on this frame — BoT-SORT maintains IDs across frames
            track_results = model.track(
                frame,
                persist=True,
                tracker="botsort.yaml",
                verbose=False,
                conf=0.4,
                classes=[0],  # persons only
            )[0]

            dancers = []
            if track_results.boxes is not None and track_results.boxes.id is not None:
                for box, track_id, conf in zip(
                    track_results.boxes.xyxy,
                    track_results.boxes.id,
                    track_results.boxes.conf,
                ):
                    x1, y1, x2, y2 = [float(v) for v in box]
                    cx = (x1 + x2) / 2 / w
                    cy = (y1 + y2) / 2 / h
                    tid = int(track_id)

                    h_zone = "top" if cy < 0.33 else ("middle" if cy < 0.66 else "bottom")
                    v_zone = "left" if cx < 0.33 else ("center" if cx < 0.66 else "right")

                    dancers.append({
                        "id": tid,
                        "label": f"Dancer {tid} ({h_zone}-{v_zone})",
                        "x": round(cx, 4),
                        "y": round(cy, 4),
                        "bbox": [round(x1), round(y1), round(x2), round(y2)],
                        "confidence": round(float(conf), 3),
                        "keypoints": [],
                    })

            results_by_ts[ts] = sorted(dancers, key=lambda d: d["id"])

        frame_idx += 1

    cap.release()
    return results_by_ts
