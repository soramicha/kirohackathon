import yt_dlp
import json
import os
import cv2
from pathlib import Path

# Path to a Netscape-format cookies.txt file for YouTube authentication.
# Set via YOUTUBE_COOKIES_FILE env var, or place a cookies.txt in the backend dir.
COOKIES_FILE = os.environ.get("YOUTUBE_COOKIES_FILE", "cookies.txt")


def resize_video_if_needed(video_path: Path, max_height: int = 480) -> Path:
    """
    Resize video to max height while maintaining aspect ratio.
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
    
    print(f"Resizing video from {width}x{height} to {new_width}x{new_height}")
    
    # Create temporary output path
    temp_path = video_path.parent / f"{video_path.stem}_resized.mp4"
    
    # Setup video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(temp_path), fourcc, fps, (new_width, new_height))
    
    # Process frames
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Resize frame
        resized_frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
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

    ydl_opts = {
        "format": "best[ext=mp4]/best",
        "outtmpl": str(video_path),
        "quiet": True,
        "no_warnings": True,
    }

    # Use cookies file if available (takes priority)
    cookies_path = Path(COOKIES_FILE)
    if cookies_path.exists():
        ydl_opts["cookiefile"] = str(cookies_path)
    else:
        # Try browsers in order — Firefox doesn't lock DB while running, Chrome does
        for browser in ["firefox", "edge", "chrome"]:
            try:
                test_opts = {**ydl_opts, "cookiesfrombrowser": (browser,), "skip_download": True}
                with yt_dlp.YoutubeDL(test_opts) as ydl:
                    ydl.extract_info(url, download=False)
                ydl_opts["cookiesfrombrowser"] = (browser,)
                break
            except Exception:
                continue

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        # yt-dlp may append extension — find the actual file
        actual_path = video_path
        if not actual_path.exists():
            candidates = list(session_dir.glob("video.*"))
            actual_path = candidates[0] if candidates else video_path

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
