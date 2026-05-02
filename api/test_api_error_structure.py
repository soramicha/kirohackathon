"""
Property test for API error response structure.

Feature: dance-formation-app, Property 7: Compute API error responses are structured

For each API route, simulate error conditions (invalid input, missing file,
bad URL); assert every error response has HTTP status >= 400 and a JSON body
with a non-empty `error` string field.

Validates: Requirements 12.5
"""

# Feature: dance-formation-app, Property 7: Compute API error responses are structured

import io
import json
import sys
import os
import uuid
from email.message import Message

import pytest

# ---------------------------------------------------------------------------
# Helpers to invoke handlers without a real HTTP server
# ---------------------------------------------------------------------------

def _make_headers(d: dict) -> Message:
    """Build an email.message.Message from a plain dict (required by cgi.FieldStorage)."""
    msg = Message()
    for k, v in d.items():
        msg[k] = v
    return msg


class _FakeRFile:
    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)

    def read(self, n=-1):
        return self._buf.read(n)


class _FakeWFile:
    def __init__(self):
        self._buf = io.BytesIO()

    def write(self, data: bytes):
        self._buf.write(data)

    def getvalue(self) -> bytes:
        return self._buf.getvalue()


class _HandlerHarness:
    """
    Minimal harness that drives a BaseHTTPRequestHandler subclass
    without a real socket, capturing status code and response body.
    """

    def __init__(self, handler_class, method: str, body: bytes, headers: dict):
        self._status = None
        self._response_headers = {}
        self._wfile = _FakeWFile()

        h = handler_class.__new__(handler_class)
        h.headers = _make_headers(headers)
        h.rfile = _FakeRFile(body)
        h.wfile = self._wfile
        h.send_response = self._send_response
        h.send_header = self._send_header
        h.end_headers = self._end_headers
        h.log_message = lambda *a, **kw: None

        getattr(h, f"do_{method.upper()}")()

    def _send_response(self, code, message=None):
        self._status = code

    def _send_header(self, key, value):
        self._response_headers[key.lower()] = value

    def _end_headers(self):
        pass

    @property
    def status(self) -> int:
        return self._status

    @property
    def body(self) -> bytes:
        return self._wfile.getvalue()

    def json(self) -> dict:
        return json.loads(self.body)


def _call(handler_class, body: bytes, headers: dict) -> _HandlerHarness:
    return _HandlerHarness(handler_class, "POST", body, headers)


def _multipart_body(fields: dict[str, bytes | str], boundary: str = "testboundary") -> bytes:
    """Build a minimal multipart/form-data body."""
    parts = []
    for name, value in fields.items():
        if isinstance(value, str):
            is_binary = False
            value_bytes = value.encode("utf-8")
        else:
            is_binary = True
            value_bytes = value
        if is_binary:
            header = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{name}.bin"\r\n'
                f"Content-Type: application/octet-stream\r\n"
                f"\r\n"
            ).encode("utf-8")
        else:
            header = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n'
                f"\r\n"
            ).encode("utf-8")
        parts.append(header + value_bytes + b"\r\n")
    return b"".join(parts) + f"--{boundary}--\r\n".encode("utf-8")


def _multipart_headers(boundary: str = "testboundary", extra_length: int = 0) -> dict:
    return {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }


# ---------------------------------------------------------------------------
# Import handlers
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.dirname(__file__))

from download import handler as DownloadHandler
from extract_frames import handler as ExtractFramesHandler
from pose import handler as PoseHandler
from depth import handler as DepthHandler


# ---------------------------------------------------------------------------
# Property 7 helpers
# ---------------------------------------------------------------------------

def _assert_error_structure(harness: _HandlerHarness, label: str):
    """Assert the response is a structured error (status >= 400, JSON with 'error')."""
    assert harness.status is not None, f"{label}: handler did not call send_response"
    assert harness.status >= 400, (
        f"{label}: expected HTTP status >= 400, got {harness.status}. "
        f"Body: {harness.body[:200]}"
    )
    try:
        body = harness.json()
    except json.JSONDecodeError:
        pytest.fail(
            f"{label}: response body is not valid JSON. "
            f"Body: {harness.body[:200]}"
        )
    assert "error" in body, (
        f"{label}: JSON body missing 'error' field. Keys: {list(body.keys())}"
    )
    assert isinstance(body["error"], str) and body["error"].strip(), (
        f"{label}: 'error' field must be a non-empty string. Got: {body['error']!r}"
    )


# ===========================================================================
# Property 7: /api/download error conditions
# ===========================================================================

class TestDownloadErrorStructure:
    """Property 7 — /api/download error responses are structured."""

    def test_missing_url_field(self):
        body = json.dumps({}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: missing url field")

    def test_empty_url(self):
        body = json.dumps({"url": ""}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: empty url")

    def test_non_youtube_url(self):
        body = json.dumps({"url": "https://vimeo.com/123456"}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: non-youtube url")

    def test_invalid_json_body(self):
        body = b"not json at all"
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: invalid json body")

    def test_empty_body(self):
        h = _call(DownloadHandler, b"", {"Content-Type": "application/json", "Content-Length": "0"})
        _assert_error_structure(h, "download: empty body")

    def test_url_with_no_video_id(self):
        body = json.dumps({"url": "https://youtube.com/watch"}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: url with no video id")

    def test_url_lookalike_wrong_domain(self):
        body = json.dumps({"url": "https://evil.com/youtube.com/watch?v=abc"}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "download: url lookalike wrong domain")

    @pytest.mark.parametrize("bad_url", [
        "ftp://youtube.com/watch?v=abc",
        "javascript:alert(1)",
        "   ",
        "https://youtu.be/",
        "https://youtube.com/shorts/",
        "not-a-url",
        "http://",
    ])
    def test_various_invalid_urls(self, bad_url):
        """Property 7: any invalid URL must produce a structured error >= 400."""
        body = json.dumps({"url": bad_url}).encode()
        h = _call(DownloadHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, f"download: bad url {bad_url!r}")


# ===========================================================================
# Property 7: /api/extract-frames error conditions
# ===========================================================================

class TestExtractFramesErrorStructure:
    """Property 7 — /api/extract-frames error responses are structured."""

    def test_wrong_content_type(self):
        body = b"some data"
        h = _call(ExtractFramesHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "extract_frames: wrong content type")

    def test_missing_video_field(self):
        boundary = "testboundary"
        body = _multipart_body({"timestamps": "[0, 5, 10]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: missing video field")

    def test_missing_timestamps_field(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01\x02"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: missing timestamps field")

    def test_invalid_timestamps_json(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01\x02", "timestamps": "not-json"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: invalid timestamps json")

    def test_empty_timestamps_array(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01\x02", "timestamps": "[]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: empty timestamps array")

    def test_timestamps_not_array(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01\x02", "timestamps": '"not-an-array"'}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: timestamps not array")

    def test_empty_video_field(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"", "timestamps": "[1.0]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: empty video field")

    def test_non_numeric_timestamps(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01", "timestamps": '["not-a-number"]'}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, "extract_frames: non-numeric timestamps")

    @pytest.mark.parametrize("timestamps_value", [
        "null",
        "{}",
        '"string"',
        "true",
    ])
    def test_various_invalid_timestamps_types(self, timestamps_value):
        """Property 7: any non-array timestamps value must produce a structured error."""
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01", "timestamps": timestamps_value}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        _assert_error_structure(h, f"extract_frames: timestamps={timestamps_value}")


# ===========================================================================
# Property 7: /api/pose error conditions
# ===========================================================================

class TestPoseErrorStructure:
    """Property 7 — /api/pose error responses are structured."""

    def test_wrong_content_type(self):
        body = b"some data"
        h = _call(PoseHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "pose: wrong content type")

    def test_missing_mode_field(self):
        boundary = "testboundary"
        # Provide a valid JPEG header but no mode
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, "pose: missing mode field")

    def test_invalid_mode_value(self):
        boundary = "testboundary"
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg, "mode": "invalid_mode"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, "pose: invalid mode value")

    def test_missing_frames(self):
        boundary = "testboundary"
        body = _multipart_body({"mode": "full_scan"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, "pose: missing frames")

    def test_non_jpeg_frame(self):
        boundary = "testboundary"
        # PNG magic bytes instead of JPEG
        fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_png, "mode": "full_scan"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, "pose: non-jpeg frame")

    def test_empty_frame(self):
        boundary = "testboundary"
        body = _multipart_body({"frame_0": b"", "mode": "per_frame"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, "pose: empty frame")

    @pytest.mark.parametrize("bad_mode", [
        "",
        "FULL_SCAN",
        "Per_Frame",
        "scan",
        "frame",
        "both",
        "0",
    ])
    def test_various_invalid_modes(self, bad_mode):
        """Property 7: any invalid mode must produce a structured error >= 400."""
        boundary = "testboundary"
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg, "mode": bad_mode}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        _assert_error_structure(h, f"pose: mode={bad_mode!r}")


# ===========================================================================
# Property 7: /api/depth error conditions
# ===========================================================================

class TestDepthErrorStructure:
    """Property 7 — /api/depth error responses are structured."""

    def test_wrong_content_type(self):
        body = b"some data"
        h = _call(DepthHandler, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
        _assert_error_structure(h, "depth: wrong content type")

    def test_missing_frame_field(self):
        boundary = "testboundary"
        body = _multipart_body({"other_field": b"data"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, "depth: missing frame field")

    def test_empty_frame(self):
        boundary = "testboundary"
        body = _multipart_body({"frame": b""}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, "depth: empty frame")

    def test_non_jpeg_frame_png(self):
        boundary = "testboundary"
        fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        body = _multipart_body({"frame": fake_png}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, "depth: non-jpeg frame (png)")

    def test_non_jpeg_frame_text(self):
        boundary = "testboundary"
        body = _multipart_body({"frame": b"this is not an image"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, "depth: non-jpeg frame (text)")

    def test_non_jpeg_frame_pdf(self):
        boundary = "testboundary"
        fake_pdf = b"%PDF-1.4" + b"\x00" * 100
        body = _multipart_body({"frame": fake_pdf}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, "depth: non-jpeg frame (pdf)")

    @pytest.mark.parametrize("bad_data", [
        b"\x00\x00\x00\x00",          # null bytes
        b"GIF89a",                     # GIF magic
        b"BM",                         # BMP magic
        b"RIFF",                       # RIFF/WebP magic
        b"<html>not an image</html>",  # HTML
    ])
    def test_various_non_image_inputs(self, bad_data):
        """Property 7: any non-JPEG input must produce a structured error >= 400."""
        boundary = "testboundary"
        body = _multipart_body({"frame": bad_data}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        _assert_error_structure(h, f"depth: bad data {bad_data[:8]!r}")
