# Dance Formation Extractor - Backend

Python FastAPI service for video processing and dancer detection.

## Features

- **Frame Extraction**: Extract frames from YouTube videos using yt-dlp
- **Person Detection**: YOLOv8-based person detection
- **Position Mapping**: Compute dancer positions and homography
- **Formation Generation**: Create top-down formation visualizations

## Tech Stack

- **Framework**: FastAPI
- **ML**: YOLOv8 (Ultralytics)
- **Video**: yt-dlp, OpenCV
- **Language**: Python 3.13+

## Getting Started

### Prerequisites

- Python 3.13+
- uv (Python package manager)
- ffmpeg (for video processing)

### Install ffmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Installation

```bash
cd backend

# Install dependencies with uv
uv sync
```

### Run Development Server

```bash
# Activate virtual environment
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Run server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at [http://localhost:8000](http://localhost:8000)

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## API Endpoints

### POST `/api/process-frame`

Extract frame and detect dancers at a specific timestamp.

**Request:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "timestamp": 10.5
}
```

**Response:**
```json
{
  "frame": 315,
  "timestamp_sec": 10.5,
  "screenshot_url": "data:image/jpeg;base64,...",
  "people": [
    {
      "id": 1,
      "label": "Person 1",
      "confidence": 0.95,
      "bbox": {
        "x": 100,
        "y": 150,
        "width": 80,
        "height": 200
      },
      "center": {
        "x": 140,
        "y": 250
      },
      "floor_position": {
        "x": 140,
        "y": 350
      }
    }
  ]
}
```

### POST `/api/generate-formation`

Generate formation visualization with stage mapping.

**Request:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "timestamp": 10.5,
  "people": [...],
  "stage_corners": [
    {"x": 100, "y": 50},
    {"x": 700, "y": 50},
    {"x": 700, "y": 450},
    {"x": 100, "y": 450}
  ]
}
```

## Project Structure

```
backend/
├── src/
│   └── backend/
│       ├── __init__.py
│       ├── main.py           # FastAPI app
│       ├── routers/
│       │   └── process.py    # Processing endpoints
│       └── services/
│           ├── frame_extractor.py  # YouTube frame extraction
│           ├── detector.py         # YOLO person detection
│           └── formation.py        # Formation generation
├── pyproject.toml
└── README.md
```

## How It Works

### Frame Extraction

1. User provides YouTube video ID and timestamp
2. Backend uses `yt-dlp` to get direct video stream URL
3. `ffmpeg` extracts the specific frame at the timestamp
4. Frame is cached locally to avoid re-downloading

### Person Detection

1. Extracted frame is passed to YOLOv8 model
2. Model detects all people in the frame
3. Bounding boxes, confidence scores, and positions are computed
4. Results include:
   - Bounding box (x, y, width, height)
   - Center position (for general positioning)
   - Floor position (bottom of bbox, for stage mapping)

### Formation Generation

1. User selects 4 stage corners in the frame
2. Backend computes homography matrix
3. Dancer floor positions are mapped to stage coordinates
4. Top-down formation visualization is generated

## Configuration

### Environment Variables

Create `.env` file:

```bash
# Cache directory for downloaded frames
FRAME_CACHE_DIR=/tmp/dance_frames

# YOLO model (yolov8n, yolov8s, yolov8m, yolov8l, yolov8x)
YOLO_MODEL=yolov8n.pt

# Detection confidence threshold
DETECTION_CONFIDENCE=0.5
```

### YOLO Models

- `yolov8n.pt` - Nano (fastest, least accurate) - **Recommended for MVP**
- `yolov8s.pt` - Small
- `yolov8m.pt` - Medium
- `yolov8l.pt` - Large
- `yolov8x.pt` - Extra Large (slowest, most accurate)

The model will be automatically downloaded on first use.

## Troubleshooting

### yt-dlp errors

```bash
# Update yt-dlp
uv pip install --upgrade yt-dlp
```

### YOLO model download issues

```bash
# Manually download model
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

### ffmpeg not found

Make sure ffmpeg is installed and in your PATH:

```bash
ffmpeg -version
```

## Deployment

### Docker (Recommended)

```dockerfile
FROM python:3.13-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv
RUN pip install uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY src ./src

# Install dependencies
RUN uv sync --frozen

# Run server
CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Deploy to Render/Railway/Fly.io

1. Push code to GitHub
2. Connect repository to hosting platform
3. Set build command: `uv sync`
4. Set start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables

## Performance Notes

- Frame extraction: ~2-5 seconds (first time), <1 second (cached)
- YOLO detection: ~0.1-0.5 seconds (CPU), ~0.01-0.05 seconds (GPU)
- Total processing time: ~2-6 seconds per frame

## Future Enhancements

- GPU support for faster detection
- Video segment caching
- Multi-frame tracking (ByteTrack)
- Formation shape analysis
- Batch processing
