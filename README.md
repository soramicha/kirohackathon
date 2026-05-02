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

Install ffmpeg on Windows:
```
winget install ffmpeg
```

### Backend Setup
```bash
pip install -r backend/requirements.txt
python backend/main.py
```
Backend runs on `http://localhost:8000`. YOLOv11 model (~7MB) downloads automatically on first startup.

> **Note:** If you see `YOLO warmup failed` on startup, run:
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
