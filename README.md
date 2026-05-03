# FormationAI

> Turn any dance video into a top-down formation map — built for student choreographers at large-scale showcases like Cal Poly's Illuminate, LanternFest, and CultureFest.

---

## The Problem

Cal Poly's showcases bring together dozens of non-audition dance groups on one stage. Student choreographers are managing 50–80 people with no professional tools — drawing diagrams by hand, pausing and rewinding videos, guessing at spacing. We fix that.

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 20.17+
- ffmpeg (required for video merging)
- uv (Python package manager) - [Install uv](https://docs.astral.sh/uv/getting-started/installation/)

Install ffmpeg on Windows:
```
winget install ffmpeg
```

Install uv:
```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Or with pip
pip install uv
```

### Backend Setup

#### Using uv (recommended)
```bash
cd backend
uv sync
uv run python main.py
```

#### Using pip (alternative)
```bash
cd backend
pip install -r requirements.txt
python main.py
```

Backend runs on `http://localhost:8000`. YOLOv11 model (~7MB) downloads automatically on first startup.

> **Note:** If you see `YOLO warmup failed` on startup with pip, run:
> ```bash
> pip install torch torchvision ultralytics>=8.4.0
> ```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

### Environment
Copy the example env file:
```bash
cp frontend/.env.example frontend/.env
```
Default points to `http://localhost:8000` — no changes needed for local dev.

---

## Formation Detection

The app includes **auto-detection** of stable formations using multi-signal analysis:
- Motion detection (frame difference)
- People counting (YOLO)
- Scene cut detection (edge analysis)
- Temporal stability requirements

### Detection Presets

Choose from three presets in the UI:
- **Strict** - Fewer false positives, best for clean practice videos
- **Balanced** - Good default for most videos (recommended)
- **Loose** - Catches more formations, best for fast choreography

### Fine-Tuning Detection

Getting too many false positives? See [DETECTION_TUNING.md](backend/DETECTION_TUNING.md) for:
- Parameter explanations
- Troubleshooting guide
- Example configurations for different video types
- How to customize detection behavior

---

## Full-Video Tracking (NEW!)

Track dancers throughout the entire video with **persistent IDs** and **occlusion handling**:

### Key Features
- ✅ **Persistent IDs** - Same dancer keeps same ID from start to finish
- ✅ **Occlusion Handling** - Infers positions when dancers are hidden behind others
- ✅ **Trajectory Tracking** - Records complete movement paths
- ✅ **Re-identification** - Matches dancers after temporary occlusion

### Quick Start

```bash
# Start tracking (takes 2-5 minutes for 4-min video)
POST /tracking/track/{session_id}
{
  "sample_rate": 5,
  "confidence": 0.3,
  "tracker": "botsort"
}

# Get dancers at any timestamp with consistent IDs
POST /tracking/dancers-at-timestamp/{session_id}
{
  "timestamp": 45.5
}

# Create visualization video with IDs and trajectories
POST /tracking/visualize/{session_id}
```

### When to Use

**Use Per-Frame Detection (current default):**
- Quick results needed (seconds)
- Only specific timestamps matter
- No occlusions in video

**Use Full-Video Tracking:**
- Need consistent IDs across video
- Dancers frequently occluded
- Analyzing full choreography
- Can wait 2-5 minutes

See [TRACKING_SYSTEM.md](backend/TRACKING_SYSTEM.md) for complete documentation.

---



### 1. Video Ingestion
- [ ] Accept a YouTube URL as input
- [ ] Download video server-side (yt-dlp)
- [ ] Extract and store video metadata (title, duration, thumbnail)

### 2. Timestamp Selection
- [ ] Auto-detect formation timestamps (stable groupings held 3+ seconds)
- [ ] Allow users to manually select/override timestamps from the video timeline
- [ ] Generate a screenshot (JPEG) for each selected timestamp

### 3. Dancer Detection & Identification
- [ ] Scan the full video to count total number of dancers
- [ ] Tag each dancer with a consistent ID across frames (number + AI-generated description e.g. "Dancer 3 — red shirt, left side")
- [ ] Generate a name-to-person mapping (ID → visual description)
- [ ] Display tagged screenshots so users can verify accuracy

### 4. Environment Detection
- [ ] Identify the stage/floor plane from the video (used to calibrate depth perception)
- [ ] Extract camera angle and perspective reference points

### 5. Formation Extraction
- [ ] For each timestamp screenshot, detect dancer positions (x, y in frame)
- [ ] Apply perspective transform (homography) to convert front-facing camera view → top-down bird's-eye view
- [ ] Render top-down formation diagram with numbered dancer dots

### 6. Data Export
- [ ] Store all data locally per session
- [ ] Export as JSON: `{ timestamp, screenshot_path, formation: [{ id, label, x, y }] }`
- [ ] Allow download of JSON + associated JPEGs as a zip

### 7. Deployment
- [ ] Deploy frontend on Vercel
- [ ] Deploy backend (FastAPI) on Railway or Render

---

## Stage 2: Later (Post-MVP)

- [ ] Stage dimension input (e.g. 20ft x 30ft) to scale the top-down view accurately
- [ ] Multi-video support (compare formations across rehearsals)
- [ ] Formation timeline scrubber — animated playback of formation changes
- [ ] Export to PDF formation sheet (printable for rehearsal)
- [ ] Shareable links per formation set
- [ ] Support for other video sources (direct upload, Vimeo)
- [ ] Choreographer notes per formation
- [ ] Multi-group support for full showcase planning (multiple acts, shared stage)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Tailwind, deployed on Vercel |
| Backend | FastAPI (Python), deployed on Railway |
| Video Download | yt-dlp (server-side) |
| Pose Estimation | YOLOv8-pose or MediaPipe |
| Dancer Tracking | ByteTrack (consistent IDs across frames) |
| Depth / Perspective | Depth Anything v2 API + OpenCV homography |
| Storage | Local filesystem per session (S3 later) |
| Export | JSON + JPEG zip download |

---

## Team

| Person | Responsibility |
|--------|---------------|
| 1 | Frontend — UI, timeline, formation canvas renderer |
| 2 | Backend — API, video pipeline, file storage, deployment |
| 3 | ML — pose estimation, dancer tracking, ID assignment |
| 4 | CV — environment detection, perspective transform, top-down mapping |

---

## Demo Flow (Hackathon)

1. Paste a YouTube link to a K-pop or Illuminate-style practice video
2. App processes video, detects dancers, assigns IDs
3. User sees timestamped formation list — clicks a timestamp
4. Side-by-side view: original screenshot (left) + top-down formation map (right)
5. Download JSON + images

---

## The Pitch

*"Cal Poly's Illuminate, LanternFest, and CultureFest bring together dozens of dance groups on one stage — non-audition, open to everyone, celebrating culture and community. The student choreographers making it happen are managing 50–80 people with no professional tools. We built the tool that gives them a professional workflow."*
