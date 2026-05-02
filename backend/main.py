from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import uvicorn

from routers import video, formations

app = FastAPI(title="FormationAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/video", tags=["video"])
app.include_router(formations.router, prefix="/formations", tags=["formations"])


@app.on_event("startup")
async def warmup():
    """Pre-load YOLOv11 model so the first formation request isn't slow."""
    try:
        from services.detector import _get_model
        _get_model()
        print("YOLOv11 + BoT-SORT ready")
    except Exception as e:
        print(f"YOLO warmup failed: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
