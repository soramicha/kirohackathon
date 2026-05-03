# Dance Formation Extraction from Video — MVP PRD

## 1. Overview

This project aims to build a web application that allows users to extract dance formations from YouTube videos at selected timestamps and convert them into top-down formation visualizations.

The MVP focuses on **snapshot-based formation extraction**, not full choreography understanding or multi-frame tracking.

---

## 2. Goals

### Primary Goal

Enable users to:

* Select timestamps from a video
* Automatically detect dancers in each frame
* Convert their positions into a top-down formation map

### Success Criteria

* User can extract at least 1–3 formations from a video
* Each formation displays:

  * Detected dancers
  * Numbered labels
  * Top-down mapped positions
* System produces a clear visual transformation from video → formation

---

## 3. Non-Goals (MVP Scope Cuts)

The following are explicitly **out of scope** for the MVP:

* Full video tracking across time (ByteTrack integration)
* Persistent dancer identity across timestamps
* Formation shape analysis (lines, V-shapes, circles)
* Formation transition detection
* Symmetry measurement
* File upload support (YouTube only for MVP)
* Facial recognition
* Accurate 3D reconstruction
* Audio synchronization
* Automatic deduplication of formations

---

## 4. User Flow

1. User inputs a YouTube video link
2. Video is displayed in embedded player
3. User selects timestamps
4. System extracts frames at selected timestamps
5. For each frame:

   * Detect dancers
   * Assign numeric labels
6. User confirms or edits labels
7. User marks stage corners (4 points)
8. System maps dancer positions to top-down coordinates
9. System renders formation visualization
10. User exports results (optional PDF or JSON)

---

## 5. Core Features

### 5.1 Video Input

* Accept YouTube link only (MVP)
* Display embedded video player

### 5.2 Timestamp Selection

* Button to capture current timestamp
* Store timestamps locally or in DB

### 5.3 Frame Extraction

* Extract image at each timestamp
* Store as image asset

### 5.4 Dancer Detection

* Use YOLOv8 (or YOLOv11/RT-DETR as alternatives)
* Output:

  * Bounding boxes
  * Person count
* Assign numeric IDs (1..N) per frame
* Compute position from center of bounding box

### 5.5 Labeling UI

* Overlay numbers on detected dancers
* Allow user to rename labels (optional)

### 5.6 Stage Calibration

* User selects 4 stage corners
* Compute homography

### 5.7 Position Mapping

* Estimate dancer floor position (bottom of bounding box)
* Map to normalized stage coordinates (x, y)

### 5.8 Formation Visualization

* Render top-down stage grid
* Plot dancers as labeled circles
* Maintain consistent layout

### 5.9 Export (Optional)

* Generate PDF containing:

  * Original screenshot
  * Labeled screenshot
  * Top-down formation
  * Metadata (timestamp, video)
* Generate JSON output:

  ```json
  {
    "frame": 120,
    "timestamp_sec": 4.0,
    "people": [
      { "id": 1, "x": 320, "y": 210 },
      { "id": 2, "x": 500, "y": 220 },
      { "id": 3, "x": 700, "y": 205 }
    ]
  }
  ```

---

## 6. Data Model

### Video

* id
* source_url
* title
* created_at

### Formation

* id
* video_id
* timestamp_sec
* screenshot_url
* formation_image_url
* metadata_json

### Person

* id
* formation_id
* label (AI-generated)
* display_name (user-defined)
* bbox_json
* stage_x
* stage_y

---

## 7. System Architecture

### Overview

```
┌─────────────────┐
│   Frontend      │
│   (Next.js)     │  ← User interaction, video playback
│   Vercel        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Backend API    │
│  (Next.js API)  │  ← Orchestration, DB, auth
│  Vercel         │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Processing      │
│ Worker          │  ← Heavy ML processing
│ (Python/FastAPI)│
│ Render/Railway  │
└─────────────────┘
```

### Frontend (Next.js on Vercel)

* **Tech**: Next.js 14+ with App Router
* **Deployment**: Vercel
* **Responsibilities**:
  * UI/UX
  * YouTube video embedding
  * Timestamp selection interface
  * Formation visualization (Canvas/SVG)
  * Result display

### Backend API (Next.js API Routes on Vercel)

* **Tech**: Next.js API routes (serverless)
* **Deployment**: Vercel
* **Responsibilities**:
  * Job creation and orchestration
  * Metadata storage (video, formations, timestamps)
  * Authentication (if needed)
  * Proxy requests to Python worker
  * Result retrieval and caching

### Processing Worker (Python Service)

* **Tech**: FastAPI or Flask
* **Deployment**: Render, Railway, or Fly.io (containerized)
* **Responsibilities**:
  * Frame extraction from YouTube (yt-dlp or similar)
  * YOLOv8 person detection
  * Coordinate mapping and homography
  * Formation image generation
  * Return processed results to Next.js API

**Why separate Python service:**
- Native ML ecosystem (PyTorch, OpenCV, Ultralytics)
- No serverless timeout/size constraints
- Easy to add GPU support later
- Can scale independently

### Storage

* **Database**: Postgres (Supabase or Vercel Postgres)
  * Video metadata
  * Formation data
  * Dancer positions
* **Object Storage**: S3-compatible (Supabase Storage or Vercel Blob)
  * Extracted frames
  * Generated formation images
  * Optional: cached video segments

### Communication Flow

1. User selects timestamp in Next.js frontend
2. Frontend calls Next.js API route
3. API route sends request to Python worker
4. Python worker:
   - Downloads/extracts frame from YouTube
   - Runs YOLOv8 detection
   - Computes positions and homography
   - Generates formation visualization
   - Uploads results to object storage
5. Python worker returns URLs/data to API route
6. API route stores metadata in database
7. Frontend displays results to user

---

## 8. Technical Approach

### Detection

* **Primary**: YOLOv8 for person detection
* **Alternatives**: YOLOv11 or RT-DETR
* Extract bounding boxes for each detected person
* Run on Python worker (CPU for MVP, GPU optional)

### Frame Extraction

* Use `yt-dlp` or YouTube API to download/extract frames
* Extract single frame at specified timestamp
* Store temporarily or cache in object storage

### Coordinate Estimation

* Use center of bounding box as dancer position (MVP)
* Alternative: Use bottom of bounding box as floor contact point

### Stage Mapping

* Compute homography from user-selected corners
* Map image coordinates → stage plane
* Normalize positions relative to frame

### Visualization

* Canvas or SVG rendering in Next.js frontend
* Top-down view with labeled circles
* Optional: Grid overlay for stage reference

### Processing Pipeline

```
User selects timestamp in Next.js
    ↓
Next.js API → Python Worker
    ↓
Extract frame from YouTube (yt-dlp)
    ↓
YOLOv8 detection (bounding boxes)
    ↓
Compute positions (center of each box)
    ↓
Apply homography (stage mapping)
    ↓
Generate formation visualization
    ↓
Upload to object storage
    ↓
Return URLs/data to Next.js
    ↓
Display to user
```

---

## 9. Risks & Mitigations

| Risk                     | Mitigation                                      |
| ------------------------ | ----------------------------------------------- |
| Missed detections        | Allow manual correction                         |
| Incorrect positions      | Use simple approximations (center of bbox)      |
| Poor perspective mapping | Require user-defined stage corners             |
| Occlusion issues         | Accept limitations in MVP, improve post-launch  |
| Camera motion            | Normalize positions relative to frame           |
| Time constraints         | Limit to snapshot-based approach                |

---

## 10. Milestones (12-Hour Hackathon)

### Phase 1 (0–4 hrs)

* Set up Next.js frontend (Vercel)
* Set up Python FastAPI service (local dev)
* YouTube video embedding + timestamp capture
* Basic API communication between Next.js ↔ Python

### Phase 2 (4–8 hrs)

* Frame extraction from YouTube (Python worker)
* YOLOv8 person detection integration
* Label overlay on detected dancers
* Stage corner selection UI

### Phase 3 (8–12 hrs)

* Homography computation + coordinate mapping
* Formation visualization (Canvas/SVG)
* Deploy Python service to Render/Railway
* UI polish and end-to-end testing

### Deployment Checklist

- [ ] Next.js frontend deployed to Vercel
- [ ] Python worker deployed to Render/Railway
- [ ] Database provisioned (Supabase/Vercel Postgres)
- [ ] Object storage configured
- [ ] Environment variables set
- [ ] API endpoints tested end-to-end

---

## 11. Future Enhancements (Post-MVP)

### Tracking & Identity

* **ByteTrack integration** for consistent dancer IDs across frames
* Multi-frame tracking for full video analysis
* Identity persistence across timestamps

### Formation Analysis

* Shape detection (lines, V-shapes, circles)
* Formation transition detection
* Symmetry measurement
* Spacing analysis
* Center of formation computation

### Additional Features

* File upload support (in addition to YouTube)
* Formation deduplication
* Audio synchronization
* ArrangeUs export integration

### Technical Improvements

* Handle camera motion with advanced stabilization
* Improve occlusion handling with pose estimation
* 3D reconstruction for better depth perception

---

## 12. Demo Plan

1. Load video
2. Select timestamps
3. Show extracted frame
4. Show detected dancers
5. Show top-down formation
6. Highlight transformation

---

## 13. Key Value Proposition

"Turn rehearsal footage into instant formation maps for choreography planning."