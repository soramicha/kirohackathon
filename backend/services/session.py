import hashlib
import json
from pathlib import Path
from datetime import datetime


SESSIONS_DIR = Path("sessions")


def create_session(url: str) -> str:
    """
    Create a new session directory for a YouTube URL.
    Session ID is a short hash of the URL + timestamp to allow re-processing.
    """
    raw = f"{url}-{datetime.utcnow().isoformat()}"
    session_id = hashlib.md5(raw.encode()).hexdigest()[:12]

    session_dir = SESSIONS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "frames").mkdir(exist_ok=True)
    (session_dir / "formations").mkdir(exist_ok=True)

    session_data = {
        "session_id": session_id,
        "url": url,
        "created_at": datetime.utcnow().isoformat(),
        "status": "created",
    }

    with open(session_dir / "session.json", "w") as f:
        json.dump(session_data, f, indent=2)

    return session_id


def get_session(session_id: str) -> dict | None:
    session_path = SESSIONS_DIR / session_id / "session.json"
    if not session_path.exists():
        return None
    with open(session_path) as f:
        return json.load(f)


def update_session(session_id: str, updates: dict):
    session = get_session(session_id)
    if session:
        session.update(updates)
        session_path = SESSIONS_DIR / session_id / "session.json"
        with open(session_path, "w") as f:
            json.dump(session, f, indent=2)
