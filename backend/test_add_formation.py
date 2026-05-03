#!/usr/bin/env python3
"""
Test script for the add-formation endpoint.
Tests the backend functionality directly.
"""

import sys
import json
import requests
from pathlib import Path


def test_add_formation(session_id: str, timestamp: float):
    """Test adding a formation at a specific timestamp"""
    
    print("=" * 60)
    print("🧪 Testing Add Formation Endpoint")
    print("=" * 60)
    print()
    
    # Check if session exists
    session_dir = Path(f"sessions/{session_id}")
    if not session_dir.exists():
        print(f"❌ Session not found: {session_id}")
        print(f"   Available sessions:")
        sessions_root = Path("sessions")
        if sessions_root.exists():
            for s in sessions_root.iterdir():
                if s.is_dir():
                    print(f"   - {s.name}")
        return False
    
    print(f"✅ Session found: {session_id}")
    
    # Check if video exists
    video_files = list(session_dir.glob("video.*"))
    if not video_files:
        print(f"❌ No video file found in session")
        return False
    
    print(f"✅ Video found: {video_files[0].name}")
    
    # Get video duration from metadata
    meta_path = session_dir / "metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)
        duration = meta.get("duration", 0)
        print(f"✅ Video duration: {duration}s")
        
        if timestamp > duration:
            print(f"⚠️  Warning: Timestamp {timestamp}s exceeds duration {duration}s")
    
    print()
    print(f"📍 Testing timestamp: {timestamp}s")
    print()
    
    # Make API request
    url = "http://localhost:8000/formations/add-formation"
    payload = {
        "session_id": session_id,
        "timestamp": timestamp
    }
    
    print(f"🔧 POST {url}")
    print(f"   Payload: {json.dumps(payload, indent=2)}")
    print()
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"📊 Response Status: {response.status_code}")
        print()
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Success!")
            print()
            print(f"   Frame ID: {result['frame_id']}")
            print(f"   Timestamp: {result['timestamp']}s")
            print(f"   Dancer Count: {result['dancer_count']}")
            print(f"   Top-down Image: {result['topdown_image']}")
            print()
            
            # Check if files were created
            frame_path = session_dir / "frames" / f"{result['frame_id']}.jpg"
            if frame_path.exists():
                print(f"✅ Frame saved: {frame_path}")
            else:
                print(f"❌ Frame not found: {frame_path}")
            
            topdown_path = session_dir / "formations" / f"{result['frame_id']}_topdown.jpg"
            if topdown_path.exists():
                print(f"✅ Top-down saved: {topdown_path}")
            else:
                print(f"❌ Top-down not found: {topdown_path}")
            
            dancers_path = session_dir / "formations" / f"{result['frame_id']}_dancers.json"
            if dancers_path.exists():
                print(f"✅ Dancers JSON saved: {dancers_path}")
            else:
                print(f"❌ Dancers JSON not found: {dancers_path}")
            
            # Check frames_index.json
            index_path = session_dir / "frames_index.json"
            if index_path.exists():
                with open(index_path) as f:
                    index = json.load(f)
                frame_in_index = any(e["frame_id"] == result["frame_id"] for e in index)
                if frame_in_index:
                    print(f"✅ Frame added to index")
                else:
                    print(f"❌ Frame not in index")
            
            print()
            print("🎉 Formation added successfully!")
            return True
            
        else:
            print(f"❌ Error: {response.status_code}")
            try:
                error = response.json()
                print(f"   Detail: {error.get('detail', 'Unknown error')}")
            except:
                print(f"   Response: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error")
        print("   Is the backend running?")
        print("   Start it with: python main.py")
        return False
    except requests.exceptions.Timeout:
        print("❌ Request Timeout")
        print("   The request took too long (>30s)")
        return False
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        return False


def list_sessions():
    """List all available sessions"""
    print("=" * 60)
    print("📁 Available Sessions")
    print("=" * 60)
    print()
    
    sessions_root = Path("sessions")
    if not sessions_root.exists():
        print("❌ No sessions directory found")
        return
    
    sessions = [s for s in sessions_root.iterdir() if s.is_dir()]
    if not sessions:
        print("❌ No sessions found")
        return
    
    for session_dir in sorted(sessions):
        session_id = session_dir.name
        meta_path = session_dir / "metadata.json"
        
        if meta_path.exists():
            with open(meta_path) as f:
                meta = json.load(f)
            title = meta.get("title", "Unknown")
            duration = meta.get("duration", 0)
            print(f"✅ {session_id}")
            print(f"   Title: {title}")
            print(f"   Duration: {duration}s")
        else:
            print(f"⚠️  {session_id} (no metadata)")
        
        # Count frames
        frames_dir = session_dir / "frames"
        if frames_dir.exists():
            frame_count = len(list(frames_dir.glob("*.jpg")))
            print(f"   Frames: {frame_count}")
        
        print()


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python test_add_formation.py list")
        print("  python test_add_formation.py <session_id> <timestamp>")
        print()
        print("Examples:")
        print("  python test_add_formation.py list")
        print("  python test_add_formation.py 92b993615723 30")
        print("  python test_add_formation.py 92b993615723 45.5")
        sys.exit(1)
    
    if sys.argv[1] == "list":
        list_sessions()
        return
    
    session_id = sys.argv[1]
    
    if len(sys.argv) < 3:
        print("❌ Missing timestamp argument")
        print()
        print("Usage: python test_add_formation.py <session_id> <timestamp>")
        print("Example: python test_add_formation.py 92b993615723 30")
        sys.exit(1)
    
    try:
        timestamp = float(sys.argv[2])
    except ValueError:
        print(f"❌ Invalid timestamp: {sys.argv[2]}")
        print("   Timestamp must be a number (e.g., 30 or 45.5)")
        sys.exit(1)
    
    success = test_add_formation(session_id, timestamp)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
