import { NextRequest, NextResponse } from 'next/server';

// API route to process a frame at a specific timestamp
// This proxies to the Python FastAPI backend

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { video_id, timestamp } = body;

    if (!video_id || timestamp === undefined) {
      return NextResponse.json(
        { error: 'Missing video_id or timestamp' },
        { status: 400 }
      );
    }

    // Call Python FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/api/process-frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id, timestamp }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return NextResponse.json(
        { error: errorData.detail || 'Backend processing failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error processing frame:', error);
    
    // Check if backend is unreachable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Backend service is not available. Make sure the Python backend is running.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to process frame' },
      { status: 500 }
    );
  }
}
