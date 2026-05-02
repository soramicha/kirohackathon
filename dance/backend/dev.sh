#!/bin/bash
# Development server startup script

echo "Starting FastAPI development server..."
uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
