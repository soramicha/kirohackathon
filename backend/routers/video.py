from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.downloader import download_video, get_metadata
from services.extractor import extract_frames, detect_formation_timestamps
from services.session import create_session, get_session, update_session

router = APIRouter()


class VideoRequest(BaseModel):
    url: str


class TimestampRequest(BaseModel):
    session_id: str
    timestamps: list[float]  # in seconds


@router.post("/process")
def process_video(req: VideoRequest):
    """
    Download video and return metadata immediately. Ready for manual timestamps.
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


@router.post("/scan/{session_id}")
def scan_formations(session_id: str):
    """
    Step 2: Scan the downloaded video for stable formation timestamps.
    Run this after /process returns — takes 10-30s depending on video length.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        timestamps = detect_formation_timestamps(session_id)
        update_session(session_id, {"status": "scanned", "auto_timestamps": timestamps})
        return {"session_id": session_id, "auto_timestamps": timestamps}
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
