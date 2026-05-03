import yt_dlp
import json
import os
import cv2
import tempfile
import shutil
from pathlib import Path

# Path to a Netscape-format cookies.txt file for YouTube authentication.
# Set via YOUTUBE_COOKIES_FILE env var, or place a cookies.txt in the backend dir.
COOKIES_FILE = os.environ.get("YOUTUBE_COOKIES_FILE", "cookies.txt")


def resize_video_if_needed(video_path: Path, max_height: int = 480) -> Path:
    """
    Resize video to max height while maintaining aspect ratio.
    Uses high-quality encoding settings.
    Returns the path to the resized video (or original if no resize needed).
    """
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        print(f"Warning: Could not open video for resizing: {video_path}")
        return video_path
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    # Check if resize is needed
    if height <= max_height:
        cap.release()
        print(f"Video height ({height}px) is already <= {max_height}px, no resize needed")
        return video_path
    
    # Calculate new dimensions
    new_height = max_height
    new_width = int(width * (new_height / height))
    # Ensure dimensions are even (required for some codecs)
    new_width = new_width if new_width % 2 == 0 else new_width + 1
    new_height = new_height if new_height % 2 == 0 else new_height + 1
    
    print(f"Resizing video from {width}x{height} to {new_width}x{new_height}")
    
    # Create temporary output path
    temp_path = video_path.parent / f"{video_path.stem}_resized.mp4"
    
    # Use H.264 codec with high quality settings
    # avc1 is H.264 which provides much better quality than mp4v
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(str(temp_path), fourcc, fps, (new_width, new_height))
    
    if not out.isOpened():
        print("Warning: Could not open video writer with avc1, trying mp4v")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(temp_path), fourcc, fps, (new_width, new_height))
    
    # Process frames
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Resize frame with high-quality interpolation
        # INTER_LANCZOS4 provides best quality for downscaling
        resized_frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
        out.write(resized_frame)
        frame_count += 1
        
        if frame_count % 100 == 0:
            print(f"  Processed {frame_count} frames...")
    
    cap.release()
    out.release()
    
    print(f"✓ Resized {frame_count} frames")
    
    # Replace original with resized
    video_path.unlink()
    temp_path.rename(video_path)
    
    return video_path


def download_video(url: str, session_id: str) -> dict:
    """
    Download a YouTube video using yt-dlp and save to the session directory.
    Resizes to max height of 500px to save space.
    Returns metadata dict.
    """
    session_dir = Path(f"sessions/{session_id}")
    session_dir.mkdir(parents=True, exist_ok=True)
    video_path = session_dir / "video.mp4"

    # Try multiple format strategies in order of preference
    format_strategies = [
        # Strategy 1: Best quality with merging (requires ffmpeg)
        {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "merge_output_format": "mp4",
            "description": "Best quality MP4 with merging"
        },
        # Strategy 2: Best single file (no merging)
        {
            "format": "best[ext=mp4]/best",
            "description": "Best single MP4 file"
        },
        # Strategy 3: Universal fallback (any format)
        {
            "format": "best",
            "description": "Best available format"
        },
    ]

    # Handle cookies
    cookies_path = Path(COOKIES_FILE)
    temp_cookie_path = None
    
    if cookies_path.exists():
        try:
            # Copy to writable temp location (yt-dlp may try to update cookies)
            temp_cookie_path = Path(tempfile.gettempdir()) / f"cookies_{session_id}.txt"
            shutil.copyfile(cookies_path, temp_cookie_path)
            print(f"✓ Using cookies from: {cookies_path}")
        except Exception as e:
            print(f"⚠ Could not copy cookies: {e}")
            temp_cookie_path = None
    else:
        print("ℹ No cookies file - proceeding without authentication")

    # Try each format strategy until one works
    last_error = None
    for i, strategy in enumerate(format_strategies, 1):
        try:
            print(f"→ Attempt {i}/{len(format_strategies)}: {strategy['description']}")
            
            ydl_opts = {
                "format": strategy["format"],
                "outtmpl": str(video_path),
                "quiet": True,
                "no_warnings": True,
            }
            
            # Add merge format if specified
            if "merge_output_format" in strategy:
                ydl_opts["merge_output_format"] = strategy["merge_output_format"]
            
            # Add cookies if available
            if temp_cookie_path and temp_cookie_path.exists():
                ydl_opts["cookiefile"] = str(temp_cookie_path)

        # Resize video if needed
        actual_path = resize_video_if_needed(actual_path, max_height=480)

        metadata = {
            "title": info.get("title"),
            "duration": info.get("duration"),  # seconds
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "url": url,
            "video_path": str(actual_path),
        }

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

                print(f"✓ Success with strategy {i}: {strategy['description']}")
                
                # Clean up temp cookies
                if temp_cookie_path and temp_cookie_path.exists():
                    try:
                        temp_cookie_path.unlink()
                    except:
                        pass
                
                return metadata
                
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            print(f"✗ Strategy {i} failed: {str(e)[:100]}")
            
            # If cookies are causing issues, disable them for next attempts
            if temp_cookie_path and ("format is not available" in error_str or "sign in" in error_str):
                print("  → Cookies may be causing issues, disabling for next attempts")
                if temp_cookie_path.exists():
                    try:
                        temp_cookie_path.unlink()
                    except:
                        pass
                temp_cookie_path = None
            
            continue
    
    # All strategies failed
    error_msg = f"All download strategies failed. Last error: {last_error}"
    print(f"✗ {error_msg}")
    raise Exception(error_msg)


def get_metadata(session_id: str) -> dict:
    meta_path = Path(f"sessions/{session_id}/metadata.json")
    if not meta_path.exists():
        return {}
    with open(meta_path) as f:
        return json.load(f)
