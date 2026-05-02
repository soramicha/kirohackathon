import cv2
import json
import numpy as np
from pathlib import Path
from ultralytics import YOLO

# YOLOv11 pose model — better accuracy than v8n, same package
MODEL_NAME = "yolo11n-pose.pt"

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = YOLO(MODEL_NAME)  # downloads automatically on first run
    return _model


def detect_dancers(session_id: str, frame_id: str) -> list[dict]:
    """
    Run YOLOv11 pose estimation on a single frame.
    Returns dancers with consistent IDs, positions, and keypoints.
    """
    session_dir = Path(f"sessions/{session_id}")
    frame_path = session_dir / "frames" / f"{frame_id}.jpg"

    if not frame_path.exists():
        raise FileNotFoundError(f"Frame not found: {frame_path}")

    img = cv2.imread(str(frame_path))
    h, w = img.shape[:2]

    model = _get_model()
    results = model(img, verbose=False)[0]

    dancers = []
    if results.boxes is not None:
        for i, (box, conf, cls) in enumerate(zip(
            results.boxes.xyxy,
            results.boxes.conf,
            results.boxes.cls
        )):
            if int(cls) != 0:  # person class only
                continue
            if float(conf) < 0.25:  # lowered from 0.4 — catches more dancers in darker/distant shots
                continue

            x1, y1, x2, y2 = [float(v) for v in box]
            cx = (x1 + x2) / 2 / w
            cy = (y1 + y2) / 2 / h

            # positional zone label
            h_zone = "top" if cy < 0.33 else ("middle" if cy < 0.66 else "bottom")
            v_zone = "left" if cx < 0.33 else ("center" if cx < 0.66 else "right")

            keypoints = []
            if results.keypoints is not None and i < len(results.keypoints.xy):
                kps = results.keypoints.xy[i].tolist()
                keypoints = [{"x": round(kp[0] / w, 4), "y": round(kp[1] / h, 4)} for kp in kps]

            dancers.append({
                "id": i + 1,  # will be re-assigned after sort
                "label": f"Dancer {i + 1} ({h_zone}-{v_zone})",
                "x": round(cx, 4),
                "y": round((y1 + y2) / 2 / h, 4),
                "bbox": [round(x1), round(y1), round(x2), round(y2)],
                "keypoints": keypoints,
                "confidence": round(float(conf), 3),
            })

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
