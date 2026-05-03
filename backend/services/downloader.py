import yt_dlp
import json
import os
import base64
import tempfile
from pathlib import Path

# Path to a Netscape-format cookies.txt file for YouTube authentication.
# Set via YOUTUBE_COOKIES_FILE env var, or place a cookies.txt in the backend dir.
COOKIES_FILE = os.environ.get("YOUTUBE_COOKIES_FILE", "cookies.txt")


def get_cookies_file():
    """Get cookies file path, handling deployed environment with base64 encoded cookies."""
    
    # Check for base64 encoded cookies in environment (for deployed environments)
    cookies_b64 = os.environ.get("YOUTUBE_COOKIES_B64")
    if cookies_b64:
        try:
            # Decode base64 cookies and write to temp file
            cookies_content = base64.b64decode(cookies_b64).decode('utf-8')
            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            temp_file.write(cookies_content)
            temp_file.close()
            print(f"Using environment cookies (temp file: {temp_file.name})")
            return temp_file.name
        except Exception as e:
            print(f"Failed to decode cookies from environment: {e}")
    
    # Fallback to local cookies file
    cookies_path = Path(COOKIES_FILE)
    if cookies_path.exists():
        print(f"Using local cookies file: {cookies_path}")
        return str(cookies_path)
    
    return None


def download_video(url: str, session_id: str, user_cookies: str = None) -> dict:
    """
    Download a YouTube video using yt-dlp and save to the session directory.
    Returns metadata dict.
    """
    session_dir = Path(f"sessions/{session_id}")
    session_dir.mkdir(parents=True, exist_ok=True)
    video_path = session_dir / "video.mp4"

    ydl_opts = {
        "format": "best[ext=mp4]/best",
        "outtmpl": str(video_path),
        "quiet": True,
        "no_warnings": True,
    }

    # Priority order for cookies:
    # 1. User cookies from frontend (fresh, highest priority)
    # 2. Environment cookies (for deployed environments)
    # 3. Local cookies file
    # 4. Browser cookies (local development only)
    
    cookies_file = None
    
    if user_cookies:
        # User provided fresh cookies from their browser
        try:
            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            temp_file.write(user_cookies)
            temp_file.close()
            cookies_file = temp_file.name
            print(f"Using fresh user cookies (temp file: {cookies_file})")
        except Exception as e:
            print(f"Failed to create user cookies file: {e}")
    
    if not cookies_file:
        # Fallback to existing cookie methods
        cookies_file = get_cookies_file()
    
    if cookies_file:
        ydl_opts["cookiefile"] = cookies_file
    else:
        print("No cookies available, trying browser cookies...")
        # Try browsers in order — Firefox doesn't lock DB while running, Chrome does
        # Note: Browser cookies won't work in deployed environments (no GUI browsers)
        browser_success = False
        for browser in ["firefox", "edge", "chrome"]:
            try:
                print(f"Trying {browser} cookies...")
                test_opts = {**ydl_opts, "cookiesfrombrowser": (browser,), "skip_download": True}
                with yt_dlp.YoutubeDL(test_opts) as ydl:
                    ydl.extract_info(url, download=False)
                ydl_opts["cookiesfrombrowser"] = (browser,)
                print(f"Successfully using {browser} cookies")
                browser_success = True
                break
            except Exception as e:
                print(f"Failed to use {browser} cookies: {str(e)}")
                continue
        
        if not browser_success:
            print("Warning: No browser cookies available. Download may fail for age-restricted or private videos.")
            print("For deployed environments, set YOUTUBE_COOKIES_B64 environment variable with base64-encoded cookies.")

    try:
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

    except Exception as e:
        error_msg = str(e)
        if "Sign in to confirm you're not a bot" in error_msg:
            raise Exception(
                "YouTube bot detection triggered. Please sign into YouTube in your browser and try again. "
                "The system will automatically use your fresh authentication cookies."
            )
        elif "cookies" in error_msg.lower():
            raise Exception(
                f"Cookie authentication failed: {error_msg}. "
                "Please make sure you're signed into YouTube in your browser."
            )
        else:
            raise Exception(f"Video download failed: {error_msg}")
    finally:
        # Clean up temporary user cookies file
        if user_cookies and cookies_file and cookies_file.startswith('/tmp'):
            try:
                os.unlink(cookies_file)
            except:
                pass

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
