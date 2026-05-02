import sys
sys.path.insert(0, '.')
from download import _is_valid_youtube_url, _extract_video_id

valid = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/abc123",
    "https://youtube.com/shorts/abc123",
    "https://www.youtube.com/watch?v=abc&list=PL123",
]

invalid = [
    "",
    "https://vimeo.com/123456",
    "https://youtube.com/",
    "https://youtube.com/watch",
    "https://youtube.com/watch?list=PL123",
    "not-a-url",
    "https://evil.com/youtube.com/watch?v=abc",
]

all_pass = True

print("=== Valid URLs ===")
for u in valid:
    result = _is_valid_youtube_url(u)
    status = "PASS" if result else "FAIL"
    if not result:
        all_pass = False
    print(f"  [{status}] {u}")

print("\n=== Invalid URLs ===")
for u in invalid:
    result = _is_valid_youtube_url(u)
    status = "PASS" if not result else "FAIL"
    if result:
        all_pass = False
    print(f"  [{status}] {repr(u)}")

print("\n=== Video ID extraction ===")
cases = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/abc123", "abc123"),
]
for url, expected in cases:
    got = _extract_video_id(url)
    status = "PASS" if got == expected else f"FAIL (got {repr(got)})"
    if got != expected:
        all_pass = False
    print(f"  [{status}] {url}")

print(f"\n{'All tests passed!' if all_pass else 'SOME TESTS FAILED'}")
sys.exit(0 if all_pass else 1)
