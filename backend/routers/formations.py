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


class AnalyzeAllRequest(BaseModel):
    session_id: str
    dancer_count: int = None  # optional, for manual override


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
