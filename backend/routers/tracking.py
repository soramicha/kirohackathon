"""
API endpoints for full-video dancer tracking.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from services.tracker import (
    track_full_video,
    get_dancers_at_timestamp,
    get_tracking_summary,
    visualize_tracking,
)
from services.session import get_session, update_session

router = APIRouter()


class TrackRequest(BaseModel):
    sample_rate: int = 5  # process every Nth frame
    confidence: float = 0.3  # lower to catch occlusions
    tracker: str = "botsort"  # or "bytetrack"
    expected_dancer_count: int | None = None  # Auto-detect if None
    smooth_trajectories: bool = True  # Apply trajectory smoothing


class TimestampQuery(BaseModel):
    timestamp: float
    tolerance: float = 0.5


@router.post("/track/{session_id}")
def start_tracking(session_id: str, req: TrackRequest, background_tasks: BackgroundTasks):
    """
    Start full-video tracking for a session.
    
    This processes the entire video and maintains consistent dancer IDs
    throughout, handling occlusions and temporary disappearances.
    
    Addresses three key issues:
    1. **Occlusion handling** - Infers positions when dancers are blocked by others
    2. **Dancer count validation** - Ensures correct number of dancers throughout
    3. **Trajectory smoothing** - Filters noise for accurate movement tracking
    
    Parameters:
    - sample_rate: Process every Nth frame (5 = ~6fps for 30fps video)
      - Lower = more accurate but slower (e.g., 3)
      - Higher = faster but might miss quick movements (e.g., 10)
    - confidence: YOLO confidence threshold (0.3 recommended for occlusions)
      - Lower = catches more occluded dancers but more false positives
      - Higher = only confident detections
    - tracker: "botsort" (recommended) or "bytetrack"
    - expected_dancer_count: Expected number of dancers (auto-detected if None)
      - Set this if you know the exact number for better validation
      - Leave as None to auto-detect from most common count
    - smooth_trajectories: Apply Savitzky-Golay filter to smooth movement (default: True)
      - Removes jitter and noise from tracking
      - Preserves actual movement patterns
    
    Processing time: ~2-5 minutes for a 4-minute video (depends on sample_rate)
    
    Returns immediately with status. Check /tracking/status/{session_id} for progress.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if already tracking
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    if tracking_path.exists():
        return {
            "message": "Tracking data already exists",
            "session_id": session_id,
            "status": "completed",
        }
    
    # Start tracking in background
    def run_tracking():
        try:
            update_session(session_id, {"tracking_status": "processing"})
            result = track_full_video(
                session_id,
                sample_rate=req.sample_rate,
                confidence=req.confidence,
                tracker=req.tracker,
                expected_dancer_count=req.expected_dancer_count,
                smooth_trajectories=req.smooth_trajectories,
            )
            update_session(session_id, {
                "tracking_status": "completed",
                "total_tracks": result["total_tracks"],
                "expected_dancer_count": result["expected_dancer_count"],
                "dancer_count_issues": len(result["dancer_count_issues"]),
            })
        except Exception as e:
            update_session(session_id, {
                "tracking_status": "failed",
                "tracking_error": str(e),
            })
    
    background_tasks.add_task(run_tracking)
    
    return {
        "message": "Tracking started",
        "session_id": session_id,
        "status": "processing",
        "estimated_time": "2-5 minutes",
        "config": {
            "sample_rate": req.sample_rate,
            "confidence": req.confidence,
            "tracker": req.tracker,
            "expected_dancer_count": req.expected_dancer_count or "auto-detect",
            "smooth_trajectories": req.smooth_trajectories,
        }
    }


@router.get("/status/{session_id}")
def get_tracking_status(session_id: str):
    """
    Check the status of tracking for a session.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    
    if tracking_path.exists():
        return {
            "session_id": session_id,
            "status": "completed",
            "total_tracks": session.get("total_tracks", 0),
        }
    
    status = session.get("tracking_status", "not_started")
    
    return {
        "session_id": session_id,
        "status": status,
        "error": session.get("tracking_error") if status == "failed" else None,
    }


@router.get("/summary/{session_id}")
def get_summary(session_id: str):
    """
    Get a summary of all tracked dancers.
    
    Returns:
    - List of all dancers with their IDs, descriptions, and appearance times
    - Occlusion rates
    - Trajectory samples
    """
    try:
        summary = get_tracking_summary(session_id)
        return summary
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="No tracking data found. Run /tracking/track/{session_id} first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dancers-at-timestamp/{session_id}")
def get_dancers_at_time(session_id: str, query: TimestampQuery):
    """
    Get all dancers at a specific timestamp using tracking data.
    
    This uses the full-video tracking to provide:
    - Consistent IDs across the video
    - Interpolated positions for occluded dancers
    - Occlusion flags
    
    Parameters:
    - timestamp: Target time in seconds
    - tolerance: Time window to search (default 0.5s)
    
    Returns:
    - List of dancers with positions, IDs, and occlusion info
    - Interpolated positions for dancers not directly visible
    """
    try:
        dancers = get_dancers_at_timestamp(
            session_id,
            query.timestamp,
            query.tolerance,
        )
        return {
            "session_id": session_id,
            "timestamp": query.timestamp,
            "dancer_count": len(dancers),
            "dancers": dancers,
        }
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="No tracking data found. Run /tracking/track/{session_id} first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/visualize/{session_id}")
def create_visualization(
    session_id: str,
    background_tasks: BackgroundTasks,
    show_trajectories: bool = True,
    show_ids: bool = True,
):
    """
    Create a visualization video showing tracked dancers with IDs and trajectories.
    
    This generates a new video with:
    - Bounding boxes around each dancer
    - Persistent IDs displayed
    - Trajectory trails showing movement
    - Occlusion indicators (dashed boxes)
    
    Processing time: ~1-2 minutes for a 4-minute video
    
    Returns immediately. Download from /tracking/visualization/{session_id} when ready.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    if not tracking_path.exists():
        raise HTTPException(
            status_code=404,
            detail="No tracking data found. Run /tracking/track/{session_id} first."
        )
    
    def run_visualization():
        try:
            update_session(session_id, {"viz_status": "processing"})
            visualize_tracking(
                session_id,
                show_trajectories=show_trajectories,
                show_ids=show_ids,
            )
            update_session(session_id, {"viz_status": "completed"})
        except Exception as e:
            update_session(session_id, {
                "viz_status": "failed",
                "viz_error": str(e),
            })
    
    background_tasks.add_task(run_visualization)
    
    return {
        "message": "Visualization started",
        "session_id": session_id,
        "status": "processing",
    }


@router.get("/visualization/{session_id}")
def download_visualization(session_id: str):
    """
    Download the tracking visualization video.
    """
    viz_path = Path(f"sessions/{session_id}/tracking_viz.mp4")
    if not viz_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Visualization not found. Run /tracking/visualize/{session_id} first."
        )
    
    return FileResponse(
        str(viz_path),
        media_type="video/mp4",
        filename=f"tracking_{session_id}.mp4",
    )


@router.delete("/tracking/{session_id}")
def delete_tracking_data(session_id: str):
    """
    Delete tracking data for a session to free up space or re-run tracking.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    viz_path = Path(f"sessions/{session_id}/tracking_viz.mp4")
    
    deleted = []
    if tracking_path.exists():
        tracking_path.unlink()
        deleted.append("tracking.json")
    
    if viz_path.exists():
        viz_path.unlink()
        deleted.append("tracking_viz.mp4")
    
    if deleted:
        update_session(session_id, {
            "tracking_status": "deleted",
            "viz_status": "deleted",
        })
        return {
            "message": "Tracking data deleted",
            "deleted_files": deleted,
        }
    else:
        return {
            "message": "No tracking data to delete",
            "deleted_files": [],
        }
