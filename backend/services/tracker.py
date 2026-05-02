"""
Stub for full-video dancer tracking service.
TODO: Implement full tracking with persistent IDs, occlusion handling, and trajectory smoothing.
"""

from pathlib import Path
import json


def track_full_video(
    session_id: str,
    sample_rate: int = 5,
    confidence: float = 0.3,
    tracker: str = "botsort",
    expected_dancer_count: int | None = None,
    smooth_trajectories: bool = True,
) -> dict:
    """Track dancers across the full video with persistent IDs."""
    raise NotImplementedError("Full-video tracking is not yet implemented")


def get_dancers_at_timestamp(
    session_id: str,
    timestamp: float,
    tolerance: float = 0.5,
) -> list[dict]:
    """Get all dancers at a specific timestamp using tracking data."""
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    if not tracking_path.exists():
        raise FileNotFoundError("No tracking data found")

    with open(tracking_path) as f:
        data = json.load(f)

    # Find the closest frame within tolerance
    best = None
    best_diff = float("inf")
    for frame in data.get("frames", []):
        diff = abs(frame["timestamp"] - timestamp)
        if diff < best_diff and diff <= tolerance:
            best = frame
            best_diff = diff

    return best["dancers"] if best else []


def get_tracking_summary(session_id: str) -> dict:
    """Get a summary of all tracked dancers."""
    tracking_path = Path(f"sessions/{session_id}/tracking.json")
    if not tracking_path.exists():
        raise FileNotFoundError("No tracking data found")

    with open(tracking_path) as f:
        return json.load(f)


def visualize_tracking(
    session_id: str,
    show_trajectories: bool = True,
    show_ids: bool = True,
) -> None:
    """Create a visualization video showing tracked dancers."""
    raise NotImplementedError("Tracking visualization is not yet implemented")
