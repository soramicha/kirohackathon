#!/bin/bash

# Start script for Dance Formation Extractor backend

echo "🎭 Starting Dance Formation Extractor Backend..."

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ Error: ffmpeg is not installed"
    echo "Please install ffmpeg:"
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Installing dependencies..."
    uv sync
fi

# Activate virtual environment and start server
echo "🚀 Starting FastAPI server on http://localhost:8000"
source .venv/bin/activate
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
