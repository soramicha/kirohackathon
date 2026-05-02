"""
Unit tests for API input validation.

Tests:
  - download.py rejects non-YouTube URLs with 400
  - extract_frames.py rejects missing video file with 400
  - pose.py rejects invalid mode value with 400
  - depth.py rejects non-image input with 400

Requirements: 12.5
"""

import io
import json
import sys
import os
from email.message import Message

import pytest

# ---------------------------------------------------------------------------
# Shared harness (same as in test_api_error_structure.py)
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


def _multipart_body(fields: dict, boundary: str = "testboundary") -> bytes:
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


def _multipart_headers(boundary: str = "testboundary") -> dict:
    return {"Content-Type": f"multipart/form-data; boundary={boundary}"}


# ---------------------------------------------------------------------------
# Import handlers
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.dirname(__file__))

from download import handler as DownloadHandler, _is_valid_youtube_url, _extract_video_id
from extract_frames import handler as ExtractFramesHandler
from pose import handler as PoseHandler
from depth import handler as DepthHandler


# ===========================================================================
# download.py — URL validation unit tests
# ===========================================================================

class TestDownloadUrlValidation:
    """Unit tests: download.py rejects non-YouTube URLs with 400."""

    # --- _is_valid_youtube_url pure function tests ---

    @pytest.mark.parametrize("url", [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/abc123",
        "https://youtube.com/shorts/abc123",
        "https://www.youtube.com/watch?v=abc&list=PL123",
    ])
    def test_valid_youtube_urls_accepted(self, url):
        assert _is_valid_youtube_url(url) is True, f"Expected valid: {url}"

    @pytest.mark.parametrize("url", [
        "",
        "https://vimeo.com/123456",
        "https://youtube.com/",
        "https://youtube.com/watch",
        "https://youtube.com/watch?list=PL123",
        "not-a-url",
        "https://evil.com/youtube.com/watch?v=abc",
        "https://youtu.be/",
        "https://youtube.com/shorts/",
        "ftp://youtube.com/watch?v=abc",
    ])
    def test_invalid_urls_rejected(self, url):
        assert _is_valid_youtube_url(url) is False, f"Expected invalid: {url}"

    # --- HTTP handler returns 400 for non-YouTube URLs ---

    @pytest.mark.parametrize("bad_url", [
        "https://vimeo.com/123456",
        "https://dailymotion.com/video/abc",
        "https://evil.com/youtube.com/watch?v=abc",
        "not-a-url",
        "ftp://youtube.com/watch?v=abc",
    ])
    def test_handler_rejects_non_youtube_url_with_400(self, bad_url):
        body = json.dumps({"url": bad_url}).encode()
        h = _call(DownloadHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400, (
            f"Expected 400 for non-YouTube URL {bad_url!r}, got {h.status}"
        )
        resp = h.json()
        assert "error" in resp
        assert resp["error"].strip()

    def test_handler_rejects_missing_url_with_400(self):
        body = json.dumps({}).encode()
        h = _call(DownloadHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400
        resp = h.json()
        assert "error" in resp

    def test_handler_rejects_empty_url_with_400(self):
        body = json.dumps({"url": ""}).encode()
        h = _call(DownloadHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400
        resp = h.json()
        assert "error" in resp

    def test_handler_rejects_invalid_json_with_400(self):
        body = b"not json"
        h = _call(DownloadHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400

    # --- _extract_video_id unit tests ---

    @pytest.mark.parametrize("url,expected_id", [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/abc123", "abc123"),
        ("https://youtube.com/watch?v=abc&list=PL123", "abc"),
    ])
    def test_extract_video_id(self, url, expected_id):
        assert _extract_video_id(url) == expected_id

    def test_extract_video_id_returns_none_for_unknown(self):
        assert _extract_video_id("https://vimeo.com/123") is None


# ===========================================================================
# extract_frames.py — input validation unit tests
# ===========================================================================

class TestExtractFramesInputValidation:
    """Unit tests: extract_frames.py rejects missing video file with 400."""

    def test_rejects_missing_video_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"timestamps": "[0, 5]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400
        resp = h.json()
        assert "error" in resp
        assert resp["error"].strip()

    def test_rejects_missing_timestamps_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01\x02"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400
        resp = h.json()
        assert "error" in resp

    def test_rejects_empty_video_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"", "timestamps": "[1.0]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400
        resp = h.json()
        assert "error" in resp

    def test_rejects_malformed_timestamps_json_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01", "timestamps": "not-json"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400

    def test_rejects_empty_timestamps_array_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01", "timestamps": "[]"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400

    def test_rejects_wrong_content_type_with_400(self):
        body = json.dumps({"video": "base64data", "timestamps": [0]}).encode()
        h = _call(ExtractFramesHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400

    def test_rejects_non_numeric_timestamps_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"video": b"\x00\x01", "timestamps": '["abc"]'}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        assert h.status == 400

    def test_error_response_has_error_field(self):
        """All 400 responses must include a non-empty 'error' string."""
        boundary = "testboundary"
        body = _multipart_body({"timestamps": "[0]"}, boundary)  # missing video
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(ExtractFramesHandler, body, headers)
        resp = h.json()
        assert isinstance(resp.get("error"), str)
        assert resp["error"].strip()


# ===========================================================================
# pose.py — input validation unit tests
# ===========================================================================

class TestPoseInputValidation:
    """Unit tests: pose.py rejects invalid mode value with 400."""

    @pytest.mark.parametrize("bad_mode", [
        "invalid_mode",
        "FULL_SCAN",
        "Per_Frame",
        "scan",
        "frame",
        "both",
        "",
        "0",
        "null",
    ])
    def test_rejects_invalid_mode_with_400(self, bad_mode):
        boundary = "testboundary"
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg, "mode": bad_mode}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        assert h.status == 400, (
            f"Expected 400 for mode={bad_mode!r}, got {h.status}"
        )
        resp = h.json()
        assert "error" in resp
        assert resp["error"].strip()

    def test_rejects_missing_mode_with_400(self):
        boundary = "testboundary"
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        assert h.status == 400

    def test_rejects_missing_frames_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"mode": "full_scan"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        assert h.status == 400

    def test_rejects_non_jpeg_frame_with_400(self):
        boundary = "testboundary"
        fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_png, "mode": "full_scan"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        assert h.status == 400

    def test_rejects_empty_frame_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"frame_0": b"", "mode": "per_frame"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        assert h.status == 400

    def test_rejects_wrong_content_type_with_400(self):
        body = b"some data"
        h = _call(PoseHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400

    def test_valid_mode_values_accepted(self):
        """full_scan and per_frame are the only valid modes — they should not 400 on mode."""
        for valid_mode in ("full_scan", "per_frame"):
            boundary = "testboundary"
            fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
            body = _multipart_body({"frame_0": fake_jpeg, "mode": valid_mode}, boundary)
            headers = _multipart_headers(boundary)
            headers["Content-Length"] = str(len(body))
            h = _call(PoseHandler, body, headers)
            # Should not be a 400 due to mode validation
            # (may be 422 if model not available, or 500 — but not 400 for mode)
            if h.status == 400:
                resp = h.json()
                assert resp.get("code") != "INVALID_MODE", (
                    f"Valid mode {valid_mode!r} was rejected as invalid"
                )

    def test_error_response_has_error_field(self):
        boundary = "testboundary"
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame_0": fake_jpeg, "mode": "bad_mode"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(PoseHandler, body, headers)
        resp = h.json()
        assert isinstance(resp.get("error"), str)
        assert resp["error"].strip()


# ===========================================================================
# depth.py — input validation unit tests
# ===========================================================================

class TestDepthInputValidation:
    """Unit tests: depth.py rejects non-image input with 400."""

    @pytest.mark.parametrize("bad_data,label", [
        (b"\x89PNG\r\n\x1a\n" + b"\x00" * 100, "PNG"),
        (b"GIF89a" + b"\x00" * 100, "GIF"),
        (b"BM" + b"\x00" * 100, "BMP"),
        (b"%PDF-1.4" + b"\x00" * 100, "PDF"),
        (b"<html>not an image</html>", "HTML"),
        (b"this is plain text", "text"),
        (b"\x00\x00\x00\x00", "null bytes"),
        (b"RIFF" + b"\x00" * 100, "RIFF/WebP"),
    ])
    def test_rejects_non_jpeg_input_with_400(self, bad_data, label):
        boundary = "testboundary"
        body = _multipart_body({"frame": bad_data}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        assert h.status == 400, (
            f"Expected 400 for {label} input, got {h.status}"
        )
        resp = h.json()
        assert "error" in resp
        assert resp["error"].strip()

    def test_rejects_missing_frame_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"other": b"data"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        assert h.status == 400

    def test_rejects_empty_frame_with_400(self):
        boundary = "testboundary"
        body = _multipart_body({"frame": b""}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        assert h.status == 400

    def test_rejects_wrong_content_type_with_400(self):
        body = b"some data"
        h = _call(DepthHandler, body, {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        })
        assert h.status == 400

    def test_error_response_has_error_field(self):
        boundary = "testboundary"
        body = _multipart_body({"frame": b"not-an-image"}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        resp = h.json()
        assert isinstance(resp.get("error"), str)
        assert resp["error"].strip()

    def test_jpeg_magic_bytes_pass_format_check(self):
        """A valid JPEG magic header should not be rejected at the format check stage."""
        boundary = "testboundary"
        # Minimal JPEG: FF D8 header (will fail at inference, not at format check)
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        body = _multipart_body({"frame": fake_jpeg}, boundary)
        headers = _multipart_headers(boundary)
        headers["Content-Length"] = str(len(body))
        h = _call(DepthHandler, body, headers)
        # Should not be 400 for format reasons (may be 422 if model unavailable)
        if h.status == 400:
            resp = h.json()
            assert resp.get("code") != "INVALID_FRAME_FORMAT", (
                "Valid JPEG magic bytes were rejected as invalid format"
            )
