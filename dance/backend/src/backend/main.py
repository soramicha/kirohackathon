"""
FastAPI backend for dance formation extraction.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import health, process

app = FastAPI(
    title="Dance Formation Extraction API",
    description="API for extracting dance formations from YouTube videos",
    version="0.1.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(process.router, prefix="/api", tags=["process"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Dance Formation Extraction API",
        "version": "0.1.0",
        "docs": "/docs"
    }
