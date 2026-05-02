"""
Vercel Python serverless function: POST /api/depth

Accepts multipart/form-data with:
  - frame: one JPEG image file

Runs Depth Anything V2 (Small) to produce a monocular depth map.
Normalizes the depth map to [0, 1].

Returns JSON:
  {
    "depthMap": [[...], ...],  // 2D array, values in [0, 1]
    "width": <int>,
    "height": <int>
  }

Error envelope format:
  { "error": "...", "code": "...", "details": {} }

HTTP status codes:
  400 — invalid input (missing frame, non-image input)
  422 — processing failure (model inference failed)
  500 — unexpected server error
"""

from http.server import BaseHTTPRequestHandler
import cgi
import io
import json
import os
import tempfile
import uuid


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"


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

_pipe = None


def _get_pipeline():
    """Load and cache the Depth Anything V2 pipeline."""
    global _pipe
    if _pipe is None:
        from transformers import pipeline
        _pipe = pipeline(
            task="depth-estimation",
            model=MODEL_ID,
        )
    return _pipe


# ---------------------------------------------------------------------------
# Inference helper
# ---------------------------------------------------------------------------

def _run_depth_estimation(image_bytes: bytes) -> dict:
    """
    Run Depth Anything V2 on *image_bytes* (JPEG).

    Returns { "depthMap": [[...]], "width": int, "height": int }
    with depth values normalized to [0, 1].

    Raises RuntimeError on failure.
    """
    try:
        from PIL import Image
        import numpy as np
    except ImportError as exc:
        raise RuntimeError(f"Required library not available: {exc}") from exc

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise RuntimeError(f"Failed to decode image: {exc}") from exc

    width, height = image.size

    try:
        pipe = _get_pipeline()
        result = pipe(image)
    except Exception as exc:
        raise RuntimeError(f"Depth estimation inference failed: {exc}") from exc

    # The pipeline returns a dict with a "depth" key containing a PIL Image
    # or a "predicted_depth" tensor depending on the transformers version.
    depth_image = result.get("depth") or result.get("predicted_depth")

    if depth_image is None:
        raise RuntimeError(
            "Depth estimation returned no depth map. "
            f"Available keys: {list(result.keys())}"
        )

    # Convert to numpy array
    try:
        if hasattr(depth_image, "numpy"):
            # torch tensor
            depth_array = depth_image.squeeze().numpy()
        elif hasattr(depth_image, "convert"):
            # PIL Image — convert to grayscale float array
            depth_array = np.array(depth_image.convert("L"), dtype=np.float32)
        else:
            depth_array = np.array(depth_image, dtype=np.float32)
    except Exception as exc:
        raise RuntimeError(f"Failed to convert depth map to array: {exc}") from exc

    depth_array = depth_array.astype(float)

    # Normalize to [0, 1]
    d_min = float(depth_array.min())
    d_max = float(depth_array.max())

    if d_max - d_min < 1e-8:
        # Flat depth map — return all zeros
        normalized = [[0.0] * depth_array.shape[1]] * depth_array.shape[0]
    else:
        normalized_array = (depth_array - d_min) / (d_max - d_min)
        # Convert to nested Python list (JSON-serializable)
        normalized = normalized_array.tolist()

    # Use depth map dimensions (may differ from input if model resizes)
    if hasattr(depth_array, "shape"):
        map_height, map_width = int(depth_array.shape[0]), int(depth_array.shape[1])
    else:
        map_height, map_width = height, width

    return {
        "depthMap": normalized,
        "width": map_width,
        "height": map_height,
    }


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler for POST /api/depth."""

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
        # 3. Extract 'frame' field
        # ------------------------------------------------------------------
        if "frame" not in form:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Missing required field: 'frame'.",
                    "MISSING_FRAME",
                )
            )
            return

        frame_field = form["frame"]
        frame_data = frame_field.file.read() if hasattr(frame_field, "file") else b""

        # cgi.FieldStorage may return str for text-like fields; normalize to bytes
        if isinstance(frame_data, str):
            frame_data = frame_data.encode("latin-1")

        if not frame_data:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The 'frame' field is empty.",
                    "EMPTY_FRAME",
                )
            )
            return

        # Validate JPEG magic bytes (FF D8)
        if not frame_data.startswith(b"\xff\xd8"):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The 'frame' field does not appear to be a valid JPEG image. "
                    "Only JPEG images are accepted.",
                    "INVALID_FRAME_FORMAT",
                )
            )
            return

        # ------------------------------------------------------------------
        # 4. Run depth estimation
        # ------------------------------------------------------------------
        try:
            result = _run_depth_estimation(frame_data)
        except RuntimeError as exc:
            self.send_response(422)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    f"Depth estimation failed: {exc}",
                    "INFERENCE_FAILED",
                    {"detail": str(exc)[:500]},
                )
            )
            return

        # ------------------------------------------------------------------
        # 5. Return JSON response
        # ------------------------------------------------------------------
        response_body = json.dumps(result).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def log_message(self, format, *args):  # noqa: A002
        """Suppress default BaseHTTPRequestHandler access log noise."""
        pass
