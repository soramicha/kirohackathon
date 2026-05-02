# Dance Formation Extractor - Frontend

A Next.js web application for extracting dance formations from YouTube videos.

## Features

- **Video Input**: Load YouTube videos via URL
- **Timestamp Capture**: Select specific moments in the video
- **Dancer Detection**: Automatic person detection using YOLOv8 (backend)
- **Label Editing**: Customize dancer labels
- **Stage Calibration**: Define stage boundaries with 4-point selection
- **Formation Visualization**: Top-down view of dancer positions
- **Export**: Save formations as JSON or PDF

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Copy `.env.local.example` to `.env.local` and configure:

```bash
cp .env.local.example .env.local
```

## Project Structure

```
dance/
├── app/
│   ├── api/              # API routes (proxy to Python backend)
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main application page
├── components/           # React components
│   ├── VideoInput.tsx
│   ├── VideoPlayer.tsx
│   ├── TimestampList.tsx
│   ├── DetectionOverlay.tsx
│   ├── StageCalibration.tsx
│   └── FormationVisualization.tsx
├── lib/
│   └── types.ts          # TypeScript type definitions
└── docs/
    └── PRD.md            # Product Requirements Document
```

## User Flow

1. Enter YouTube video URL
2. Video loads in embedded player
3. Capture timestamps at desired moments
4. Process timestamp → backend extracts frame and detects dancers
5. Review and edit dancer labels
6. Select 4 stage corners for calibration
7. View top-down formation visualization
8. Export as JSON or PDF

## API Routes

### POST `/api/process-frame`

Extract frame and detect dancers at a specific timestamp.

**Request:**
```json
{
  "video_id": "string",
  "timestamp": number
}
```

**Response:**
```json
{
  "frame": number,
  "timestamp_sec": number,
  "screenshot_url": "string",
  "people": [
    {
      "id": number,
      "label": "string",
      "bbox": { "x": number, "y": number, "width": number, "height": number }
    }
  ]
}
```

### POST `/api/generate-formation`

Generate formation visualization with stage mapping.

**Request:**
```json
{
  "video_id": "string",
  "timestamp": number,
  "people": [...],
  "stage_corners": [{ "x": number, "y": number }]
}
```

**Response:**
```json
{
  "formation": {
    "id": "string",
    "video_id": "string",
    "timestamp_sec": number,
    "people": [...],
    "stage_corners": [...]
  }
}
```

## Backend Integration

The frontend communicates with a Python FastAPI backend for:
- Frame extraction from YouTube (yt-dlp)
- YOLOv8 person detection
- Homography computation
- Formation image generation

Backend URL is configured via `BACKEND_URL` environment variable.

## Development Notes

- API routes currently return mock data until backend is ready
- YouTube IFrame API is used for video playback and timestamp capture
- Canvas API is used for formation visualization
- All components are client-side rendered (`'use client'`)

## Deployment

Deploy to Vercel:

```bash
vercel deploy
```

Configure environment variables in Vercel dashboard.

## Future Enhancements

- Multi-frame tracking (ByteTrack)
- Formation shape analysis
- PDF export with multiple formations
- File upload support
- Formation comparison view
