"""Dance Formation Extraction Backend."""
from backend.main import app

__version__ = "0.1.0"

__all__ = ["app"]


def main():
    """Entry point for running the server."""
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
