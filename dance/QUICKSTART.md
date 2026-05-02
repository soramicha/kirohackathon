# Quick Start Guide

## Frontend Setup (Next.js)

### 1. Install Dependencies

```bash
cd dance
pnpm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set the backend URL (once backend is running):

```
BACKEND_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## Using the Application

### Step 1: Load a Video

1. Enter a YouTube video URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
2. Click "Load Video"
3. The video will appear in an embedded player

### Step 2: Capture Timestamps

1. Play the video and pause at moments where you want to extract formations
2. Click "Capture Timestamp" to save the current time
3. Repeat for multiple timestamps (1-3 recommended for MVP)

### Step 3: Process a Timestamp

1. Click "Process" on any captured timestamp
2. The backend will:
   - Extract the frame from YouTube
   - Run YOLOv8 person detection
   - Return detected dancers with bounding boxes

### Step 4: Review & Edit Labels

1. Review the detected dancers overlaid on the frame
2. Optionally edit the labels (e.g., "Person 1" → "Lead Dancer")
3. Click "Confirm & Continue to Stage Mapping"

### Step 5: Calibrate Stage

1. Click on the four corners of the stage in order:
   - Top-Left
   - Top-Right
   - Bottom-Right
   - Bottom-Left
2. Click "Confirm & Generate Formation"

### Step 6: View Formation

1. The top-down formation visualization will appear
2. Dancers are shown as labeled circles on a grid
3. Export options:
   - **Export as JSON**: Download formation data
   - **Export as PDF**: Generate a formatted report (future)

## Component Overview

### Core Components

- **VideoInput**: YouTube URL input form
- **VideoPlayer**: Embedded YouTube player with timestamp capture
- **TimestampList**: List of captured timestamps with status
- **DetectionOverlay**: Frame with detected dancers and bounding boxes
- **StageCalibration**: Interactive 4-point stage corner selection
- **FormationVisualization**: Canvas-based top-down formation view

### API Routes

- `POST /api/process-frame`: Extract frame and detect dancers
- `POST /api/generate-formation`: Generate formation with stage mapping

## Mock Data Mode

The frontend currently uses mock data for API responses until the backend is ready. This allows you to:

- Test the complete user flow
- Verify UI/UX design
- Develop frontend features independently

Mock responses are defined in:
- `app/api/process-frame/route.ts`
- `app/api/generate-formation/route.ts`

## Backend Integration

Once the Python FastAPI backend is running:

1. Update `BACKEND_URL` in `.env.local`
2. Remove mock response code from API routes
3. Uncomment the actual backend fetch calls

The API routes will proxy requests to the Python backend.

## Troubleshooting

### YouTube video not loading

- Check that the URL is valid
- Ensure the video is not age-restricted or private
- Try a different video

### TypeScript errors

```bash
pnpm run build
```

This will show any type errors that need fixing.

### Styling issues

Tailwind CSS 4 is configured. If styles aren't applying:

```bash
# Clear Next.js cache
rm -rf .next
pnpm dev
```

## Next Steps

1. **Backend Integration**: Connect to Python FastAPI service
2. **Database**: Add Postgres for storing videos and formations
3. **Object Storage**: Add S3-compatible storage for images
4. **Authentication**: Add user accounts (optional for MVP)
5. **PDF Export**: Implement PDF generation with formation data

## Deployment

### Deploy to Vercel

```bash
vercel deploy
```

Configure environment variables in Vercel dashboard:
- `BACKEND_URL`: URL of deployed Python backend

### Backend Deployment

The Python backend should be deployed to:
- Render
- Railway
- Fly.io

See `backend/README.md` for backend deployment instructions.
