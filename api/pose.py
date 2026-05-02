"""
Vercel Python serverless function: POST /api/pose

Accepts multipart/form-data with:
  - frame_0, frame_1, ... : JPEG image files
  - mode: "full_scan" | "per_frame"

Runs YOLOv8-pose + BoT-SORT tracking on the provided frames.

In full_scan mode: builds stable track IDs across all provided frames
  (caller should send sampled frames at ~2 fps across the full video).
In per_frame mode: matches detections to existing track IDs using the
  established gallery.

Returns JSON:
  {
    "tracks": [
      {
        "trackId": "1",
        "detections": [
          {
            "frameIndex": 0,
            "bbox": [x1, y1, x2, y2],
            "keypoints": [[x, y, confidence], ...],  // 17 COCO keypoints
            "centroid": [cx, cy]
          }
        ]
      }
    ]
  }

Error envelope format:
  { "error": "...", "code": "...", "details": {} }

HTTP status codes:
  400 — invalid input (missing frames, invalid mode)
  422 — processing failure (model inference failed)
  500 — unexpected server error
"""

from http.server import BaseHTTPRequestHandler
import cgi
import io
import json
import os
import re
import tempfile
import uuid


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_MODES = {"full_scan", "per_frame"}
MODEL_NAME = "yolov8m-pose.pt"
# Number of COCO keypoints
NUM_KEYPOINTS = 17


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

def _error_body(error: str, code: str, details: dict | None = None) -> bytes:
    return json.dumps(
        {"error": error, "code": code, "details": details or {}}
    ).encode("utf-8")


# ---------------------------------------------------------------------------
# Model loading (lazy, cached at module level for warm invocations)
# ---------------------------------------------------------------------------

_model = None


def _get_model():
    """Load and cache the YOLOv8-pose model."""
    global _model
    if _model is None:
        from ultralytics import YOLO
        _model = YOLO(MODEL_NAME)
    return _model


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def _run_tracking(image_paths: list[str], mode: str) -> list[dict]:
    """
    Run YOLOv8-pose + BoT-SORT tracking on *image_paths*.

    Returns a list of track dicts matching the API response schema.
    Raises RuntimeError on inference failure.
    """
    try:
        model = _get_model()
    except Exception as exc:
        raise RuntimeError(f"Failed to load model: {exc}") from exc

    try:
        # Run tracking across all frames
        results = model.track(
            source=image_paths,
            tracker="botsort.yaml",
            persist=True,          # maintain track state across frames
            verbose=False,
        )
    except Exception as exc:
        raise RuntimeError(f"Model inference failed: {exc}") from exc

    # Aggregate detections by track ID
    tracks_by_id: dict[str, dict] = {}

    for frame_idx, result in enumerate(results):
        if result.boxes is None:
            continue

        boxes = result.boxes
        keypoints_data = result.keypoints  # may be None

        # boxes.id contains track IDs (may be None if no detections)
        track_ids = boxes.id
        if track_ids is None:
            continue

        track_ids_list = track_ids.cpu().numpy().tolist()
        xyxy_list = boxes.xyxy.cpu().numpy().tolist()
        conf_list = boxes.conf.cpu().numpy().tolist()

        # Extract keypoints if available
        kp_list = None
        if keypoints_data is not None and keypoints_data.xy is not None:
            kp_xy = keypoints_data.xy.cpu().numpy()       # (N, 17, 2)
            kp_conf = keypoints_data.conf.cpu().numpy() if keypoints_data.conf is not None else None  # (N, 17)
            kp_list = (kp_xy, kp_conf)

        for det_idx, (track_id, bbox) in enumerate(zip(track_ids_list, xyxy_list)):
            track_id_str = str(int(track_id))
            x1, y1, x2, y2 = bbox
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2

            # Build keypoints array [[x, y, conf], ...]
            keypoints = []
            if kp_list is not None and det_idx < len(kp_list[0]):
                kp_xy_det = kp_list[0][det_idx]  # (17, 2)
                kp_conf_det = kp_list[1][det_idx] if kp_list[1] is not None else None  # (17,)
                for kp_idx in range(NUM_KEYPOINTS):
                    kx, ky = float(kp_xy_det[kp_idx][0]), float(kp_xy_det[kp_idx][1])
                    kc = float(kp_conf_det[kp_idx]) if kp_conf_det is not None else 0.0
                    keypoints.append([kx, ky, kc])
            else:
                # Pad with zeros if keypoints unavailable
                keypoints = [[0.0, 0.0, 0.0]] * NUM_KEYPOINTS

            detection = {
                "frameIndex": frame_idx,
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "keypoints": keypoints,
                "centroid": [float(cx), float(cy)],
            }

            if track_id_str not in tracks_by_id:
                tracks_by_id[track_id_str] = {
                    "trackId": track_id_str,
                    "detections": [],
                }
            tracks_by_id[track_id_str]["detections"].append(detection)

    return list(tracks_by_id.values())


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler for POST /api/pose."""

    def do_POST(self):  # noqa: N802
        try:
            self._handle_post()
        except Exception as exc:  # pylint: disable=broad-except
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    f"Unexpected server error: {exc}",
                    "INTERNAL_ERROR",
                )
            )

    def _handle_post(self):
        content_type = self.headers.get("Content-Type", "")

        # ------------------------------------------------------------------
        # 1. Validate Content-Type
        # ------------------------------------------------------------------
        if "multipart/form-data" not in content_type:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Content-Type must be multipart/form-data.",
                    "INVALID_CONTENT_TYPE",
                )
            )
            return

        # ------------------------------------------------------------------
        # 2. Parse multipart body
        # ------------------------------------------------------------------
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""

        environ = {
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": str(len(raw_body)),
        }

        try:
            form = cgi.FieldStorage(
                fp=io.BytesIO(raw_body),
                headers=self.headers,
                environ=environ,
            )
        except Exception as exc:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    f"Failed to parse multipart body: {exc}",
                    "PARSE_ERROR",
                )
            )
            return

        # ------------------------------------------------------------------
        # 3. Validate 'mode' field
        # ------------------------------------------------------------------
        mode = form.getvalue("mode", "").strip()
        if mode not in VALID_MODES:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    f"Invalid 'mode' value: {repr(mode)}. "
                    f"Must be one of: {', '.join(sorted(VALID_MODES))}.",
                    "INVALID_MODE",
                    {"received": mode, "valid_values": sorted(VALID_MODES)},
                )
            )
            return

        # ------------------------------------------------------------------
        # 4. Collect frame files (frame_0, frame_1, ...)
        # ------------------------------------------------------------------
        frame_fields = []
        idx = 0
        while f"frame_{idx}" in form:
            frame_fields.append(form[f"frame_{idx}"])
            idx += 1

        # Also accept generic 'frame' field (single frame)
        if not frame_fields and "frame" in form:
            frame_fields.append(form["frame"])

        if not frame_fields:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "No frame files provided. "
                    "Include at least one JPEG as 'frame_0' (or 'frame_1', etc.).",
                    "MISSING_FRAMES",
                )
            )
            return

        # Validate each frame is non-empty
        frame_data_list = []
        for i, field in enumerate(frame_fields):
            data = field.file.read() if hasattr(field, "file") else b""
            # cgi.FieldStorage may return str for text-like fields; normalize to bytes
            if isinstance(data, str):
                data = data.encode("latin-1")
            if not data:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        f"Frame at index {i} is empty.",
                        "EMPTY_FRAME",
                        {"frame_index": i},
                    )
                )
                return
            # Basic JPEG magic bytes check (FF D8)
            if not data.startswith(b"\xff\xd8"):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        f"Frame at index {i} does not appear to be a valid JPEG image.",
                        "INVALID_FRAME_FORMAT",
                        {"frame_index": i},
                    )
                )
                return
            frame_data_list.append(data)

        # ------------------------------------------------------------------
        # 5. Write frames to temp directory and run inference
        # ------------------------------------------------------------------
        session_id = uuid.uuid4().hex
        tmp_dir = tempfile.mkdtemp(prefix=f"pose_{session_id}_")

        try:
            image_paths = []
            for i, data in enumerate(frame_data_list):
                path = os.path.join(tmp_dir, f"frame_{i}.jpg")
                with open(path, "wb") as f:
                    f.write(data)
                image_paths.append(path)

            try:
                tracks = _run_tracking(image_paths, mode)
            except RuntimeError as exc:
                self.send_response(422)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        f"Pose estimation failed: {exc}",
                        "INFERENCE_FAILED",
                        {"detail": str(exc)[:500]},
                    )
                )
                return

            # ------------------------------------------------------------------
            # 6. Return tracks JSON
            # ------------------------------------------------------------------
            response_body = json.dumps({"tracks": tracks}).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)

        finally:
            import shutil
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

    def log_message(self, format, *args):  # noqa: A002
        """Suppress default BaseHTTPRequestHandler access log noise."""
        pass
