"""
Vercel Python serverless function: POST /api/download

Downloads a YouTube video using yt-dlp and streams it back as
application/octet-stream with X-Video-Title and X-Video-Duration headers.

Error envelope format:
  { "error": "...", "code": "...", "details": {} }

HTTP status codes:
  400 — invalid input (bad URL, missing URL)
  403 — video inaccessible (private, age-restricted)
  422 — processing failure (yt-dlp failed)
  500 — unexpected server error
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import subprocess
import tempfile


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------

_YOUTUBE_PATTERNS = [
    re.compile(r"^https?://(www\.)?youtube\.com/watch\?.*v=[\w-]+"),
    re.compile(r"^https?://youtu\.be/[\w-]+"),
    re.compile(r"^https?://(www\.)?youtube\.com/shorts/[\w-]+"),
]


def _is_valid_youtube_url(url: str) -> bool:
    """Return True if *url* matches a recognised YouTube URL pattern."""
    return any(p.match(url) for p in _YOUTUBE_PATTERNS)


def _extract_video_id(url: str) -> str | None:
    """Extract the YouTube video ID from a URL, or return None."""
    # youtu.be/<id>
    m = re.search(r"youtu\.be/([\w-]+)", url)
    if m:
        return m.group(1)
    # youtube.com/shorts/<id>
    m = re.search(r"/shorts/([\w-]+)", url)
    if m:
        return m.group(1)
    # youtube.com/watch?v=<id>
    m = re.search(r"[?&]v=([\w-]+)", url)
    if m:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# yt-dlp helpers
# ---------------------------------------------------------------------------

def _ytdlp_available() -> bool:
    """Return True if yt-dlp is available on PATH."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _fetch_metadata(url: str) -> dict:
    """
    Run ``yt-dlp --dump-json`` to retrieve video metadata.

    Returns a dict with at least ``title`` and ``duration`` keys.
    Raises RuntimeError on failure.
    """
    result = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-playlist", url],
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(stderr)
    return json.loads(result.stdout.decode("utf-8"))


def _download_video(url: str, output_path: str) -> None:
    """
    Invoke yt-dlp to download *url* to *output_path*.

    Raises RuntimeError on failure.
    """
    result = subprocess.run(
        [
            "yt-dlp",
            "--no-playlist",
            "--format", "bestvideo[height<=1080]+bestaudio/best",
            "--merge-output-format", "mp4",
            "-o", output_path,
            url,
        ],
        capture_output=True,
        timeout=300,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(stderr)


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

def _error_body(error: str, code: str, details: dict | None = None) -> bytes:
    return json.dumps(
        {"error": error, "code": code, "details": details or {}}
    ).encode("utf-8")


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler for POST /api/download."""

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
        # ------------------------------------------------------------------
        # 1. Parse request body
        # ------------------------------------------------------------------
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""

        try:
            data = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body("Request body must be valid JSON.", "INVALID_JSON")
            )
            return

        url = data.get("url", "").strip() if isinstance(data, dict) else ""

        # ------------------------------------------------------------------
        # 2. Validate URL
        # ------------------------------------------------------------------
        if not url:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Missing required field: 'url'.",
                    "MISSING_URL",
                )
            )
            return

        if not _is_valid_youtube_url(url):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "The provided URL is not a valid YouTube URL. "
                    "Accepted formats: youtube.com/watch?v=, youtu.be/, "
                    "youtube.com/shorts/",
                    "INVALID_YOUTUBE_URL",
                )
            )
            return

        # ------------------------------------------------------------------
        # 3. Check yt-dlp availability
        # ------------------------------------------------------------------
        if not _ytdlp_available():
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "yt-dlp is not installed on this server.",
                    "YTDLP_NOT_FOUND",
                )
            )
            return

        # ------------------------------------------------------------------
        # 4. Fetch video metadata
        # ------------------------------------------------------------------
        try:
            meta = _fetch_metadata(url)
        except RuntimeError as exc:
            stderr_text = str(exc).lower()
            # Detect access-restricted videos
            if any(
                kw in stderr_text
                for kw in ("private", "age-restricted", "age restricted",
                           "members only", "unavailable", "not available",
                           "sign in", "login required")
            ):
                self.send_response(403)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        "The video is private, age-restricted, or otherwise "
                        "inaccessible.",
                        "VIDEO_INACCESSIBLE",
                        {"ytdlp_error": str(exc)[:500]},
                    )
                )
            else:
                self.send_response(422)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        "Failed to retrieve video metadata.",
                        "METADATA_FETCH_FAILED",
                        {"ytdlp_error": str(exc)[:500]},
                    )
                )
            return

        video_title = meta.get("title", "unknown")
        video_duration = meta.get("duration", 0)  # seconds (int or float)
        video_id = meta.get("id") or _extract_video_id(url) or "video"

        # ------------------------------------------------------------------
        # 5. Download video to /tmp
        # ------------------------------------------------------------------
        output_path = f"/tmp/{video_id}.mp4"

        try:
            _download_video(url, output_path)
        except RuntimeError as exc:
            stderr_text = str(exc).lower()
            if any(
                kw in stderr_text
                for kw in ("private", "age-restricted", "age restricted",
                           "members only", "unavailable", "not available",
                           "sign in", "login required")
            ):
                self.send_response(403)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        "The video is private, age-restricted, or otherwise "
                        "inaccessible.",
                        "VIDEO_INACCESSIBLE",
                        {"ytdlp_error": str(exc)[:500]},
                    )
                )
            else:
                self.send_response(422)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    _error_body(
                        "yt-dlp failed to download the video.",
                        "DOWNLOAD_FAILED",
                        {"ytdlp_error": str(exc)[:500]},
                    )
                )
            return

        # ------------------------------------------------------------------
        # 6. Stream file back
        # ------------------------------------------------------------------
        if not os.path.exists(output_path):
            self.send_response(422)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                _error_body(
                    "Download appeared to succeed but output file is missing.",
                    "OUTPUT_FILE_MISSING",
                )
            )
            return

        file_size = os.path.getsize(output_path)

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(file_size))
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{video_id}.mp4"',
        )
        # Metadata headers consumed by the browser-side YouTubeImporter
        self.send_header("X-Video-Title", _safe_header_value(video_title))
        self.send_header("X-Video-Duration", str(int(video_duration)))
        # Allow browser JS to read these custom headers
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-Video-Title, X-Video-Duration",
        )
        self.end_headers()

        with open(output_path, "rb") as f:
            while True:
                chunk = f.read(65536)  # 64 KiB chunks
                if not chunk:
                    break
                self.wfile.write(chunk)

        # Clean up temp file after streaming
        try:
            os.remove(output_path)
        except OSError:
            pass  # best-effort cleanup

    def log_message(self, format, *args):  # noqa: A002
        """Suppress default BaseHTTPRequestHandler access log noise."""
        pass


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _safe_header_value(value: str) -> str:
    """
    Strip characters that are illegal in HTTP header values
    (control characters, newlines).
    """
    return re.sub(r"[\r\n\x00-\x1f\x7f]", "", value)
