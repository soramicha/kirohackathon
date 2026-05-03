from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.downloader import download_video, get_metadata
from services.extractor import extract_frames, detect_formation_timestamps
from services.session import create_session, get_session, update_session
from config import DetectionPresets, FormationDetectionConfig
from pathlib import Path
import os

router = APIRouter()


class VideoRequest(BaseModel):
    url: str
    cookies: str | None = None  # Optional cookies from frontend


class TimestampRequest(BaseModel):
    session_id: str
    timestamps: list[float]  # in seconds


class ScanRequest(BaseModel):
    preset: str | None = None  # "strict", "balanced", "loose", "solo"


@router.post("/process")
def process_video(req: VideoRequest):
    """
    Download video and return metadata immediately. Ready for manual timestamps.
    """
    try:
        session_id = create_session(req.url)
        metadata = download_video(req.url, session_id, user_cookies=req.cookies)
        update_session(session_id, {"status": "downloaded"})
        return {
            "session_id": session_id,
            "metadata": metadata,
            "auto_timestamps": [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/{session_id}")
def scan_formations(session_id: str, req: ScanRequest | None = None):
    """
    Step 2: Scan the downloaded video for stable formation timestamps.
    Run this after /process returns — takes 10-30s depending on video length.
    
    Optional preset parameter:
    - "strict": Fewer false positives, might miss some formations
    - "balanced": Good default (default if not specified)
    - "loose": Catches more formations, more false positives
    - "solo": For single dancer videos
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Apply preset if specified
    if req and req.preset:
        preset_map = {
            "strict": DetectionPresets.strict,
            "balanced": DetectionPresets.balanced,
            "loose": DetectionPresets.loose,
            "solo": DetectionPresets.solo,
        }
        if req.preset not in preset_map:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid preset. Choose from: {list(preset_map.keys())}"
            )
        preset_map[req.preset]()
    
    try:
        timestamps = detect_formation_timestamps(session_id)
        update_session(session_id, {"status": "scanned", "auto_timestamps": timestamps})
        return {
            "session_id": session_id, 
            "auto_timestamps": timestamps,
            "preset_used": req.preset if req else "balanced",
            "config": {
                "min_formation_duration": FormationDetectionConfig.MIN_FORMATION_DURATION,
                "motion_threshold": FormationDetectionConfig.MOTION_THRESHOLD,
                "min_people_count": FormationDetectionConfig.MIN_PEOPLE_COUNT,
                "min_spacing_between": FormationDetectionConfig.MIN_SPACING_BETWEEN,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-frames")
def extract_specific_frames(req: TimestampRequest):
    """
    Extract frames at user-specified timestamps for a given session.
    """
    try:
        frames = extract_frames(
            req.session_id, mode="manual", timestamps=req.timestamps
        )
        return {"session_id": req.session_id, "frames": frames}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
def get_session_info(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/stream/{session_id}")
async def stream_video(session_id: str, request: Request):
    """
    Stream the session video file with HTTP range request support for seeking.
    Returns proper headers for browser <video> element compatibility.
    """
    video_path = Path(f"sessions/{session_id}/video.mp4")
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found for this session")

    file_size = video_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        # Parse range header: "bytes=start-end"
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        content_length = end - start + 1

        def iter_range():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 64 * 1024  # 64KB chunks
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Cache-Control": "public, max-age=86400",
            },
        )
    else:
        # No range requested — stream the whole file
        def iter_file():
            with open(video_path, "rb") as f:
                chunk_size = 64 * 1024
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data

        return StreamingResponse(
            iter_file(),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Cache-Control": "public, max-age=86400",
            },
        )
