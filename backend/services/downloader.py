import yt_dlp
import json
import os
import base64
from pathlib import Path


def get_cookie_options():
    """
    Get cookie configuration for yt-dlp to avoid bot detection.
    Priority:
    1. Environment variable (YOUTUBE_COOKIES_BASE64) - for production
    2. Manual cookie file (cookies.txt) - for local with manual export
    3. Browser cookies (Chrome) - for local development only
    4. No cookies (fallback)
    """
    cookie_opts = {}
    
    # Method 1: Environment variable (PRODUCTION)
    cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
    if cookies_b64:
        try:
            cookie_file = Path("cookies.txt")
            cookies_content = base64.b64decode(cookies_b64)
            cookie_file.write_bytes(cookies_content)
            print(f"[downloader] ✅ Using cookies from environment variable")
            cookie_opts["cookiefile"] = str(cookie_file)
            return cookie_opts
        except Exception as e:
            print(f"[downloader] ❌ Failed to decode cookies from env: {e}")
    
    # Method 2: Manual cookie file
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        print(f"[downloader] ✅ Using cookie file: {cookie_file}")
        cookie_opts["cookiefile"] = str(cookie_file)
        return cookie_opts
    
    # Method 3: Browser cookies (LOCAL DEVELOPMENT ONLY)
    # Skip browser detection in production environments
    is_production = (
        os.getenv("RENDER") or 
        os.getenv("RAILWAY_ENVIRONMENT") or 
        os.getenv("VERCEL") or 
        os.getenv("HEROKU_APP_NAME") or
        os.getenv("FLY_APP_NAME")
    )
    
    if not is_production:
        # Check common browser locations
        browsers_to_try = [
            ("chrome", None),
            ("firefox", None),
            ("edge", None),
        ]
        
        for browser, profile in browsers_to_try:
            try:
                print(f"[downloader] 🔍 Attempting to use {browser} cookies...")
                cookie_opts["cookiesfrombrowser"] = (browser, profile) if profile else (browser,)
                return cookie_opts
            except Exception as e:
                print(f"[downloader] ❌ Could not access {browser} cookies: {e}")
                continue
    else:
        print("[downloader] 🌐 Production environment detected - skipping browser cookie detection")
    
    # Method 4: No cookies (fallback)
    print("[downloader] ⚠️  WARNING: No cookies available - downloads may trigger bot detection")
    print("[downloader] 📝 For production, set YOUTUBE_COOKIES_BASE64 environment variable")
    print("[downloader] 📖 See RENDER-DEPLOYMENT.md for instructions")
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
    print(f"[downloader] 🎬 Starting download for: {url}")
    cookie_opts = get_cookie_options()
    
    if cookie_opts:
        print(f"[downloader] 🍪 Cookie options: {list(cookie_opts.keys())}")
    else:
        print(f"[downloader] ⚠️  No cookie options set")
    
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

    print(f"[downloader] ✅ Download complete: {metadata['title']}")
    
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
