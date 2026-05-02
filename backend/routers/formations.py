from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from services.detector import detect_dancers
from services.transformer import generate_topdown
from services.session import get_session
from pathlib import Path
import zipfile
import os

router = APIRouter()


class FormationRequest(BaseModel):
    session_id: str
    frame_id: str  # e.g. "frame_0042"


class ExportRequest(BaseModel):
    session_id: str


class AddFormationRequest(BaseModel):
    session_id: str
    timestamp: float  # in seconds


@router.post("/analyze")
def analyze_formation(req: FormationRequest):
    """
    For a given frame, detect dancer positions and generate
    the top-down formation view.
    """
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        # Step 1: detect dancers and assign IDs
        dancers = detect_dancers(req.session_id, req.frame_id)

        # Step 2: perspective transform → top-down view
        topdown_path = generate_topdown(req.session_id, req.frame_id, dancers)

        return {
            "session_id": req.session_id,
            "frame_id": req.frame_id,
            "dancer_count": len(dancers),
            "dancers": dancers,  # [{ id, label, x, y, x_top, y_top }]
            "topdown_image": topdown_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-all")
def analyze_all_formations(req: ExportRequest):
    """
    Run YOLOv11 per-frame detection with appearance-based ID matching
    across formations. Fast and consistent dancer IDs.
    """
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    index_path = Path(f"sessions/{req.session_id}/frames_index.json")
    if index_path.exists():
        with open(index_path) as f:
            import json
            frame_index = json.load(f)
    else:
        frames_dir = Path(f"sessions/{req.session_id}/frames")
        frame_index = [{"frame_id": f.stem, "timestamp": 0} for f in sorted(frames_dir.glob("*.jpg"))]

    if not frame_index:
        raise HTTPException(status_code=400, detail="No frames found. Extract frames first.")

    from services.matcher import match_dancers
    import cv2

    results = []
    prev_dancers = None
    prev_img = None

    for entry in frame_index:
        frame_id = entry["frame_id"]
        ts = entry.get("timestamp", 0)
        frame_path = Path(f"sessions/{req.session_id}/frames/{frame_id}.jpg")

        try:
            curr_img = cv2.imread(str(frame_path))
            dancers = detect_dancers(req.session_id, frame_id)

            # Match IDs to previous formation using appearance + proximity
            if prev_dancers is not None and prev_img is not None:
                dancers = match_dancers(prev_dancers, dancers, prev_img, curr_img)

            topdown_path = generate_topdown(req.session_id, frame_id, dancers)

            results.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "dancer_count": len(dancers),
                "dancers": dancers,
                "topdown_image": topdown_path,
            })

            prev_dancers = dancers
            prev_img = curr_img

        except Exception as e:
            results.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "dancer_count": 0,
                "dancers": [],
                "error": str(e),
            })

    return {"session_id": req.session_id, "formations": results}


@router.get("/image/{session_id}/{filepath:path}")
def get_image(session_id: str, filepath: str):
    """Serve a frame or top-down image. filepath can include subdirectories."""
    path = Path(f"sessions/{session_id}") / filepath
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    return FileResponse(str(path))


@router.post("/add-formation")
def add_formation_at_timestamp(req: AddFormationRequest):
    """
    Generate a new formation at a specific timestamp.
    Extracts the frame, detects dancers, and generates top-down view.
    """
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        import cv2
        import json
        
        session_dir = Path(f"sessions/{req.session_id}")
        frames_dir = session_dir / "frames"
        frames_dir.mkdir(exist_ok=True)
        
        # Get video path
        meta_path = session_dir / "metadata.json"
        if meta_path.exists():
            with open(meta_path) as f:
                meta = json.load(f)
            video_path = Path(meta.get("video_path", str(session_dir / "video.mp4")))
        else:
            candidates = list(session_dir.glob("video.*"))
            video_path = candidates[0] if candidates else session_dir / "video.mp4"
        
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Generate frame_id from timestamp
        frame_id = f"frame_{int(req.timestamp * 1000):08d}"
        frame_path = frames_dir / f"{frame_id}.jpg"
        
        # Extract frame at timestamp
        cap = cv2.VideoCapture(str(video_path))
        cap.set(cv2.CAP_PROP_POS_MSEC, req.timestamp * 1000)
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            raise HTTPException(status_code=400, detail=f"Could not extract frame at {req.timestamp}s")
        
        # Save frame
        cv2.imwrite(str(frame_path), frame)
        
        # Detect dancers
        dancers = detect_dancers(req.session_id, frame_id)
        
        # Generate top-down view
        topdown_path = generate_topdown(req.session_id, frame_id, dancers)
        
        # Update frames_index.json
        index_path = session_dir / "frames_index.json"
        if index_path.exists():
            with open(index_path) as f:
                frame_index = json.load(f)
        else:
            frame_index = []
        
        # Add new frame to index (sorted by timestamp)
        new_entry = {
            "frame_id": frame_id,
            "timestamp": req.timestamp,
            "path": f"frames/{frame_id}.jpg",
        }
        
        # Check if frame already exists
        existing_idx = next((i for i, e in enumerate(frame_index) if e["frame_id"] == frame_id), None)
        if existing_idx is not None:
            frame_index[existing_idx] = new_entry
        else:
            frame_index.append(new_entry)
            frame_index.sort(key=lambda x: x["timestamp"])
        
        with open(index_path, "w") as f:
            json.dump(frame_index, f, indent=2)
        
        return {
            "session_id": req.session_id,
            "frame_id": frame_id,
            "timestamp": req.timestamp,
            "dancer_count": len(dancers),
            "dancers": dancers,
            "topdown_image": topdown_path,
            "message": "Formation added successfully",
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
def export_session(req: ExportRequest):
    """
    Bundle all session data (JSON + images) into a zip for download.
    """
    session_dir = Path(f"sessions/{req.session_id}")
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    zip_path = session_dir / "export.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in session_dir.rglob("*"):
            if file.suffix in [".jpg", ".json"] and file != zip_path:
                zf.write(file, file.relative_to(session_dir))

    return FileResponse(str(zip_path), filename=f"formations_{req.session_id}.zip")
