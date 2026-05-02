import { NextRequest, NextResponse } from 'next/server';

// API route to generate formation visualization
// This proxies to the Python FastAPI backend

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { video_id, timestamp, people, stage_corners } = body;

    if (!video_id || timestamp === undefined || !people || !stage_corners) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Call Python FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/api/generate-formation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id, timestamp, people, stage_corners }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return NextResponse.json(
        { error: errorData.detail || 'Backend processing failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ formation: data });

  } catch (error) {
    console.error('Error generating formation:', error);
    
    // Check if backend is unreachable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Backend service is not available. Make sure the Python backend is running.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to generate formation' },
      { status: 500 }
    );
  }
}
