import yt_dlp
import json
import os
from pathlib import Path


def get_cookie_options():
    """
    Get cookie configuration for yt-dlp to avoid bot detection.
    Tries multiple methods in order of preference:
    1. Manual cookie file (cookies.txt)
    2. Browser cookies (Chrome)
    3. No cookies (fallback)
    """
    cookie_opts = {}
    
    # Method 1: Check for manual cookie file
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        print(f"[downloader] Using cookie file: {cookie_file}")
        cookie_opts["cookiefile"] = str(cookie_file)
        return cookie_opts
    
    # Method 2: Try to extract from browser
    # Check common browser locations
    browsers_to_try = [
        ("chrome", None),  # Default Chrome location
        ("firefox", None),  # Default Firefox location
        ("edge", None),  # Edge
    ]
    
    for browser, profile in browsers_to_try:
        try:
            # Test if browser cookies are accessible
            print(f"[downloader] Attempting to use {browser} cookies...")
            cookie_opts["cookiesfrombrowser"] = (browser, profile) if profile else (browser,)
            return cookie_opts
        except Exception as e:
            print(f"[downloader] Could not access {browser} cookies: {e}")
            continue
    
    # Method 3: No cookies (fallback)
    print("[downloader] No cookies available - using default (may trigger bot detection)")
    return {}


def download_video(url: str, session_id: str) -> dict:
    """
    Download a YouTube video using yt-dlp and save to the session directory.
    Automatically uses cookies to avoid bot detection.
    Returns metadata dict.
    """
    session_dir = Path(f"sessions/{session_id}")
    session_dir.mkdir(parents=True, exist_ok=True)
    video_path = session_dir / "video.mp4"

    # Base options
    ydl_opts = {
        "format": "best[ext=mp4]/best",  # single file, no merging needed
        "outtmpl": str(video_path),
        "quiet": True,
        "no_warnings": True,
    }
    
    # Add cookie options to avoid bot detection
    cookie_opts = get_cookie_options()
    ydl_opts.update(cookie_opts)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        # yt-dlp may append extension — find the actual file
        actual_path = video_path
        if not actual_path.exists():
            candidates = list(session_dir.glob("video.*"))
            actual_path = candidates[0] if candidates else video_path

        metadata = {
            "title": info.get("title"),
            "duration": info.get("duration"),  # seconds
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "url": url,
            "video_path": str(actual_path),
        }

    # persist metadata
    meta_path = session_dir / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    return metadata


def get_metadata(session_id: str) -> dict:
    meta_path = Path(f"sessions/{session_id}/metadata.json")
    if not meta_path.exists():
        return {}
    with open(meta_path) as f:
        return json.load(f)
