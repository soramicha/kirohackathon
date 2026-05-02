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

            # Save dancers AFTER topdown so x_top/y_top are persisted
            out_path = Path(f"sessions/{req.session_id}/formations/{frame_id}_dancers.json")
            with open(out_path, "w") as f:
                import json as _json
                _json.dump(dancers, f, indent=2)

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


@router.post("/export")
def export_session(req: ExportRequest):
    """
    Generate a PDF of all formations and return it for download.
    """
    session_dir = Path(f"sessions/{req.session_id}")
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    # load formations from saved dancer JSON files
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
                dancers = json.load(f)
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
