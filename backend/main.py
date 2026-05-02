import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

"""from fastapi import FastAPI, HTTPException
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
    try:
        from services.detector import _get_model
        model = _get_model()
        print(f"YOLOv11 ready — {model.model_name if hasattr(model, 'model_name') else 'loaded'}")
    except Exception as e:
        print(f"YOLO warmup failed (non-fatal): {e}")
        print("Tip: run `pip install torch torchvision ultralytics>=8.4.0` to fix")


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
"""