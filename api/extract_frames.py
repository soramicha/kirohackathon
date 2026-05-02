"""
Vercel Python serverless function: POST /api/extract-frames

Accepts multipart/form-data with:
  - video: binary video file
  - timestamps: JSON array of numbers (seconds)

Extracts one JPEG frame per timestamp using ffmpeg-python at minimum 720p.
Returns frames as multipart/form-data (one part per timestamp, in order).

Error envelope format:
  { "error": "...", "code": "...", "details": {} }

HTTP status codes:
  400 — invalid input (missing video, missing timestamps, malformed JSON)
  422 — processing failure (ffmpeg failed for a timestamp)
  500 — unexpected server error
"""

from http.server import BaseHTTPRequestHandler
import cgi
import email.generator
import email.mime.multipart
import email.mime.image
import io
import json
import os
import re
import subprocess
import tempfile
import uuid


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

def _error_body(error: str, code: str, details: dict | None = None) -> bytes:
    return json.dumps(
        {"error": error, "code": code, "details": details or {}}
    ).encode("utf-8")


# ---------------------------------------------------------------------------
# ffmpeg helpers
# ---------------------------------------------------------------------------

def _ffmpeg_available() -> bool:
    """Return True if ffmpeg is available on PATH."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _extract_frame(video_path: str, timestamp_seconds: float, output_path: str) -> None:
    """
    Extract a single JPEG frame from *video_path* at *timestamp_seconds*.

    Uses ffmpeg with scale filter to ensure minimum 720p height.
    Raises RuntimeError on failure.
    """
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",                          # overwrite output
            "-ss", str(timestamp_seconds), # seek before input (fast)
            "-i", video_path,
            "-vframes", "1",               # extract exactly one frame
            # Scale: if height < 720, scale up; otherwise keep original
            "-vf", "scale='if(lt(ih,720),-2,iw)':'if(lt(ih,720),720,ih)'",
            "-q:v", "2",                   # JPEG quality (2 = high)
            output_path,
        ],
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(stderr)


def _get_video_duration(video_path: str) -> float | None:
    """Return video duration in seconds using ffprobe, or None on failure."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                video_path,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode == 0:
            info = json.loads(result.stdout.decode("utf-8"))
            duration = info.get("format", {}).get("duration")
            if duration is not None:
                return float(duration)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Multipart response builder
# ---------------------------------------------------------------------------

def _build_multipart_response(frames: list[dict]) -> tuple[str, bytes]:
    """
    Build a multipart/form-data response body from a list of frame dicts.

    Each dict has:
      - timestamp_index: int
      - timestamp_seconds: float
      - jpeg_data: bytes

    Returns (content_type_header, body_bytes).
    """
    boundary = uuid.uuid4().hex
    parts = []

    for frame in frames:
        idx = frame["timestamp_index"]
        ts = frame["timestamp_seconds"]
        data = frame["jpeg_data"]

        part_headers = (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"frame_{idx}\"; "
            f"filename=\"frame_{idx}.jpg\"\r\n"
            f"Content-Type: image/jpeg\r\n"
            f"X-Timestamp-Index: {idx}\r\n"
            f"X-Timestamp-Seconds: {ts}\r\n"
            f"\r\n"
        )
        parts.append(part_headers.encode("utf-8") + data + b"\r\n")

    body = b"".join(parts) + f"--{boundary}--\r\n".encode("utf-8")
    content_type = f"multipart/form-data; boundary={boundary}"
    return content_type, body


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler for POST /api/extract-frames."""

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
        # 3. Extract 'video' field
        # ------------------------------------------------------------------
        if "video" not in form:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Missing required field: 'video'.",
                    "MISSING_VIDEO",
                )
            )
            return

        video_field = form["video"]
        video_data = video_field.file.read() if hasattr(video_field, "file") else b""

        # cgi.FieldStorage may return str for text-like fields; normalize to bytes
        if isinstance(video_data, str):
            video_data = video_data.encode("latin-1")

        if not video_data:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The 'video' field is empty.",
                    "EMPTY_VIDEO",
                )
            )
            return

        # ------------------------------------------------------------------
        # 4. Extract 'timestamps' field
        # ------------------------------------------------------------------
        if "timestamps" not in form:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Missing required field: 'timestamps'.",
                    "MISSING_TIMESTAMPS",
                )
            )
            return

        timestamps_raw = form.getvalue("timestamps", "")
        try:
            timestamps = json.loads(timestamps_raw)
        except (json.JSONDecodeError, TypeError):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The 'timestamps' field must be a valid JSON array of numbers.",
                    "INVALID_TIMESTAMPS",
                )
            )
            return

        if not isinstance(timestamps, list) or len(timestamps) == 0:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The 'timestamps' field must be a non-empty JSON array.",
                    "INVALID_TIMESTAMPS",
                )
            )
            return

        # Validate all timestamps are numeric
        for ts in timestamps:
            if not isinstance(ts, (int, float)):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        f"All timestamps must be numbers; got {type(ts).__name__}.",
                        "INVALID_TIMESTAMP_TYPE",
                    )
                )
                return

        # ------------------------------------------------------------------
        # 5. Check ffmpeg availability
        # ------------------------------------------------------------------
        if not _ffmpeg_available():
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "ffmpeg is not installed on this server.",
                    "FFMPEG_NOT_FOUND",
                )
            )
            return

        # ------------------------------------------------------------------
        # 6. Write video to temp file and extract frames
        # ------------------------------------------------------------------
        session_id = uuid.uuid4().hex
        tmp_dir = tempfile.mkdtemp(prefix=f"extract_{session_id}_")

        try:
            video_path = os.path.join(tmp_dir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(video_data)

            frames = []
            failed_timestamps = []

            for idx, ts_seconds in enumerate(timestamps):
                output_path = os.path.join(tmp_dir, f"frame_{idx}.jpg")
                try:
                    _extract_frame(video_path, float(ts_seconds), output_path)
                    if os.path.exists(output_path):
                        with open(output_path, "rb") as f:
                            jpeg_data = f.read()
                        frames.append({
                            "timestamp_index": idx,
                            "timestamp_seconds": float(ts_seconds),
                            "jpeg_data": jpeg_data,
                        })
                    else:
                        failed_timestamps.append({
                            "index": idx,
                            "seconds": ts_seconds,
                            "reason": "Output file not created",
                        })
                except RuntimeError as exc:
                    failed_timestamps.append({
                        "index": idx,
                        "seconds": ts_seconds,
                        "reason": str(exc)[:300],
                    })

            # If ALL timestamps failed, return 422
            if len(frames) == 0:
                self.send_response(422)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        "Failed to extract frames for all requested timestamps.",
                        "FRAME_EXTRACTION_FAILED",
                        {"failed_timestamps": failed_timestamps},
                    )
                )
                return

            # ------------------------------------------------------------------
            # 7. Build and send multipart response
            # ------------------------------------------------------------------
            content_type_header, body = _build_multipart_response(frames)

            self.send_response(200)
            self.send_header("Content-Type", content_type_header)
            self.send_header("Content-Length", str(len(body)))
            # Report any partial failures in a header
            if failed_timestamps:
                self.send_header(
                    "X-Failed-Timestamps",
                    json.dumps(failed_timestamps)[:500],
                )
            self.end_headers()
            self.wfile.write(body)

        finally:
            # Clean up temp directory
            import shutil
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

    def log_message(self, format, *args):  # noqa: A002
        """Suppress default BaseHTTPRequestHandler access log noise."""
        pass
