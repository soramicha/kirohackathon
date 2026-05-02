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


def _spread_overlapping(dancers: list[dict], min_dist: float = 0.06) -> list[dict]:
    """
    If two dancers have nearly identical x_top/y_top positions (stacked in single file),
    nudge them apart so they're individually visible on the canvas.
    """
    if len(dancers) < 2:
        return dancers

    result = [d.copy() for d in dancers]
    for i in range(len(result)):
        for j in range(i + 1, len(result)):
            xi = result[i].get("x_top", result[i].get("x", 0.5))
            yi = result[i].get("y_top", result[i].get("y", 0.5))
            xj = result[j].get("x_top", result[j].get("x", 0.5))
            yj = result[j].get("y_top", result[j].get("y", 0.5))

            dx = xj - xi
            dy = yj - yi
            dist = (dx**2 + dy**2) ** 0.5

            if dist < min_dist and dist > 0:
                # push them apart along their axis
                scale = (min_dist - dist) / 2 / dist
                result[i]["x_top"] = round(max(0.02, min(0.98, xi - dx * scale)), 4)
                result[i]["y_top"] = round(max(0.02, min(0.98, yi - dy * scale)), 4)
                result[j]["x_top"] = round(max(0.02, min(0.98, xj + dx * scale)), 4)
                result[j]["y_top"] = round(max(0.02, min(0.98, yj + dy * scale)), 4)
            elif dist == 0:
                # exactly same position — spread horizontally
                offset = min_dist * (j - i) * 0.5
                result[j]["x_top"] = round(min(0.98, xj + offset), 4)

    return result


class FormationRequest(BaseModel):
    session_id: str
    frame_id: str  # e.g. "frame_0042"


class AnalyzeAllRequest(BaseModel):
    session_id: str
    dancer_count: int = None  # optional, for manual override


class AddFormationRequest(BaseModel):
    session_id: str
    timestamp: float  # in seconds


class DeleteFormationRequest(BaseModel):
    session_id: str
    frame_id: str  # e.g. "frame_00030000"


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


class ExportRequest(BaseModel):
    session_id: str


@router.post("/analyze-all")
def analyze_all_formations(req: AnalyzeAllRequest):
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
    is_first_frame = True

    for entry in frame_index:
        frame_id = entry["frame_id"]
        ts = entry.get("timestamp", 0)
        frame_path = Path(f"sessions/{req.session_id}/frames/{frame_id}.jpg")

        try:
            curr_img = cv2.imread(str(frame_path))
            # Only add offstage dancers to the first frame
            expected_count = req.dancer_count if is_first_frame else None
            dancers = detect_dancers(req.session_id, frame_id, expected_count)

            # Match IDs to previous formation using appearance + proximity
            if prev_dancers is not None and prev_img is not None:
                dancers = match_dancers(prev_dancers, dancers, prev_img, curr_img, req.dancer_count)
            elif req.dancer_count and len(dancers) < req.dancer_count:
                # First formation or no previous dancers - ensure we have expected count
                missing_count = req.dancer_count - len(dancers)
                used_ids = {d["id"] for d in dancers} if dancers else set()
                next_new_id = max(used_ids, default=0) + 1
                
                # Find the next available ID that's not already used
                while next_new_id in used_ids:
                    next_new_id += 1
                
                # Add missing dancers to offstage area
                for i in range(missing_count):
                    # Simple vertical spacing with good padding
                    offstage_x = 1.2 + (i % 2) * 0.15  # 2 columns with good spacing
                    offstage_y = 0.1 + (i * 0.12)      # vertical spacing with padding
                    
                    dancers.append({
                        "id": next_new_id,
                        "label": f"Dancer {next_new_id} (offstage)",
                        "x": offstage_x,
                        "y": offstage_y,
                        "bbox": [0, 0, 0, 0],  # no actual detection
                        "keypoints": [],
                        "confidence": 0.0,
                        "manual": True,  # flag to indicate this was manually added
                        "offstage": True  # flag to indicate this is offstage
                    })
                    next_new_id += 1

            topdown_path = generate_topdown(req.session_id, frame_id, dancers)

            # Save dancers AFTER topdown so x_top/y_top are persisted
            out_path = Path(f"sessions/{req.session_id}/formations/{frame_id}_dancers.json")
            with open(out_path, "w") as f:
                import json as _json
                _json.dump(dancers, f, indent=2)

            # Spread overlapping dancers so they're always visible
            dancers = _spread_overlapping(dancers)

            results.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "dancer_count": len(dancers),
                "dancers": dancers,
                "topdown_image": topdown_path,
            })

            prev_dancers = dancers
            prev_img = curr_img
            is_first_frame = False

        except Exception as e:
            # Even when there's an error, ensure we have the expected number of dancers
            error_dancers = []
            if req.dancer_count:
                for i in range(req.dancer_count):
                    # Simple vertical spacing with good padding
                    offstage_x = 1.2 + (i % 2) * 0.15  # 2 columns with good spacing
                    offstage_y = 0.1 + (i * 0.12)      # vertical spacing with padding
                    
                    error_dancers.append({
                        "id": i + 1,
                        "label": f"Dancer {i + 1} (offstage)",
                        "x": offstage_x,
                        "y": offstage_y,
                        "bbox": [0, 0, 0, 0],  # no actual detection
                        "keypoints": [],
                        "confidence": 0.0,
                        "manual": True,  # flag to indicate this was manually added
                        "offstage": True,  # flag to indicate this is offstage
                        "error_generated": True  # flag to indicate this was created due to error
                    })
            
            results.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "dancer_count": len(error_dancers),
                "dancers": error_dancers,
                "error": str(e),
            })
            is_first_frame = False

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


@router.post("/delete-formation")
def delete_formation(req: DeleteFormationRequest):
    """
    Delete a formation and its associated files.
    Removes frame image, top-down view, dancers JSON, and updates the index.
    """
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        import json
        
        session_dir = Path(f"sessions/{req.session_id}")
        
        # Delete frame image
        frame_path = session_dir / "frames" / f"{req.frame_id}.jpg"
        if frame_path.exists():
            frame_path.unlink()
        
        # Delete top-down image
        topdown_path = session_dir / "formations" / f"{req.frame_id}_topdown.jpg"
        if topdown_path.exists():
            topdown_path.unlink()
        
        # Delete dancers JSON
        dancers_path = session_dir / "formations" / f"{req.frame_id}_dancers.json"
        if dancers_path.exists():
            dancers_path.unlink()
        
        # Update frames_index.json
        index_path = session_dir / "frames_index.json"
        if index_path.exists():
            with open(index_path) as f:
                frame_index = json.load(f)
            
            # Remove the frame from index
            frame_index = [e for e in frame_index if e["frame_id"] != req.frame_id]
            
            with open(index_path, "w") as f:
                json.dump(frame_index, f, indent=2)
        
        return {
            "session_id": req.session_id,
            "frame_id": req.frame_id,
            "message": "Formation deleted successfully",
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
def export_session(req: ExportRequest):
    """
    Generate a PDF of all formations using the current session's analyzed data.
    """
    session_dir = Path(f"sessions/{req.session_id}")
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    index_path = session_dir / "frames_index.json"
    if not index_path.exists():
        raise HTTPException(status_code=400, detail="No formations found. Run analysis first.")

    import json
    from services.pdf_exporter import generate_pdf
    from services.downloader import get_metadata

    with open(index_path) as f:
        frame_index = json.load(f)

    formations = []
    for entry in frame_index:
        frame_id = entry["frame_id"]
        dancer_path = session_dir / "formations" / f"{frame_id}_dancers.json"

        dancers = []
        if dancer_path.exists():
            with open(dancer_path) as f:
                raw = json.load(f)
                # only include dancers that have valid x_top/y_top from current run
                dancers = [d for d in raw if d.get("x_top") is not None]

        formations.append({
            "frame_id": frame_id,
            "timestamp": entry.get("timestamp", 0),
            "dancers": dancers,
        })

    metadata = get_metadata(req.session_id)
    pdf_path = generate_pdf(req.session_id, formations, metadata)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"formations_{req.session_id}.pdf"
    )
