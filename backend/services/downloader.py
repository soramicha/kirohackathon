import yt_dlp
import json
from pathlib import Path


def download_video(url: str, session_id: str) -> dict:
    """
    Download a YouTube video using yt-dlp and save to the session directory.
    Returns metadata dict.
    """
    session_dir = Path(f"sessions/{session_id}")
    session_dir.mkdir(parents=True, exist_ok=True)
    video_path = session_dir / "video.mp4"

    ydl_opts = {
        "format": "best[ext=mp4]/best",  # single file, no merging needed, no ffmpeg required
        "outtmpl": str(video_path),
        "quiet": True,
        "no_warnings": True,
    }

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
