from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.downloader import download_video, get_metadata, resize_video_if_needed
from services.extractor import extract_frames, detect_formation_timestamps
from services.session import create_session, get_session, update_session
from config import DetectionPresets, FormationDetectionConfig
from pathlib import Path
import os
import shutil
import cv2

router = APIRouter()


class VideoRequest(BaseModel):
    url: str


class TimestampRequest(BaseModel):
    session_id: str
    timestamps: list[float]  # in seconds


class ScanRequest(BaseModel):
    preset: str | None = None  # "strict", "balanced", "loose", "solo"


@router.post("/process")
def process_video(req: VideoRequest):
    """
    Download video from URL and return metadata immediately. Ready for manual timestamps.
    """
    try:
        session_id = create_session(req.url)
        metadata = download_video(req.url, session_id)
        update_session(session_id, {"status": "downloaded"})
        return {
            "session_id": session_id,
            "metadata": metadata,
            "auto_timestamps": [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file directly instead of using a URL.
    Accepts: mp4, mov, avi, webm, mkv
    Max size: 500MB
    """
    # Validate file type
    allowed_extensions = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type '{file_ext}'. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Validate file size (max 500MB)
    max_size = 500 * 1024 * 1024
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({file_size / (1024*1024):.1f}MB). Maximum size is 500MB."
        )
    
    try:
        # Create session
        session_id = create_session(f"upload:{file.filename}")
        session_dir = Path(f"sessions/{session_id}")
        session_dir.mkdir(parents=True, exist_ok=True)
        
        # Save uploaded file
        video_path = session_dir / "video.mp4"
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"Uploaded video saved: {video_path}")
        
        # Resize video if needed (max height 480px - standard definition)
        video_path = resize_video_if_needed(video_path, max_height=480)
        
        # Extract metadata using OpenCV
        cap = cv2.VideoCapture(str(video_path))
        
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video file. File may be corrupted.")
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = total_frames / fps if fps > 0 else 0
        cap.release()
        
        if duration == 0:
            raise HTTPException(status_code=400, detail="Could not determine video duration. File may be invalid.")
        
        # Create metadata
        metadata = {
            "title": file.filename,
            "duration": duration,
            "thumbnail": None,
            "uploader": "File Upload",
            "url": f"upload:{file.filename}",
            "video_path": str(video_path),
            "width": width,
            "height": height,
            "fps": fps,
        }
        
        # Save metadata
        import json
        meta_path = session_dir / "metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)
        
        update_session(session_id, {"status": "uploaded"})
        
        return {
            "session_id": session_id,
            "metadata": metadata,
            "auto_timestamps": [],
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/scan/{session_id}")
def scan_formations(session_id: str, req: ScanRequest | None = None):
    """
    Scan the downloaded video for formation timestamps.
    Always uses loose detection to catch the most formations.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Always use loose preset for best coverage
    DetectionPresets.loose()
    
    try:
        timestamps = detect_formation_timestamps(session_id)
        update_session(session_id, {"status": "scanned", "auto_timestamps": timestamps})
        return {
            "session_id": session_id, 
            "auto_timestamps": timestamps,
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
