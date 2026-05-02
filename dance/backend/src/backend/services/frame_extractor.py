"""Frame extraction service using yt-dlp."""
import os
import tempfile
from pathlib import Path
import subprocess
import base64
from typing import Optional

import cv2
import numpy as np


class FrameExtractor:
    """Extract frames from YouTube videos."""
    
    def __init__(self, cache_dir: Optional[str] = None):
        """Initialize frame extractor.
        
        Args:
            cache_dir: Directory to cache downloaded videos/frames
        """
        self.cache_dir = Path(cache_dir) if cache_dir else Path(tempfile.gettempdir()) / "dance_frames"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def extract_frame_at_timestamp(
        self,
        video_url: str,
        timestamp_sec: float,
        output_format: str = "base64"
    ) -> dict:
        """Extract a single frame from YouTube video at specific timestamp.
        
        Args:
            video_url: YouTube video URL
            timestamp_sec: Timestamp in seconds
            output_format: "base64" or "file" or "numpy"
            
        Returns:
            dict with frame data and metadata
        """
        # Create unique filename based on video URL and timestamp
        video_id = self._extract_video_id(video_url)
        frame_filename = f"{video_id}_{timestamp_sec:.2f}.jpg"
        frame_path = self.cache_dir / frame_filename
        
        # Check if frame already cached
        if frame_path.exists():
            return self._load_cached_frame(frame_path, output_format)
        
        # Extract frame using yt-dlp + ffmpeg
        try:
            self._extract_frame_ytdlp(video_url, timestamp_sec, frame_path)
            return self._load_cached_frame(frame_path, output_format)
        except Exception as e:
            raise RuntimeError(f"Failed to extract frame: {str(e)}")
    
    def _extract_video_id(self, video_url: str) -> str:
        """Extract YouTube video ID from URL."""
        import re
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)',
            r'youtube\.com\/embed\/([^&\n?#]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, video_url)
            if match:
                return match.group(1)
        raise ValueError(f"Could not extract video ID from URL: {video_url}")
    
    def _extract_frame_ytdlp(self, video_url: str, timestamp_sec: float, output_path: Path):
        """Extract frame using yt-dlp and ffmpeg.
        
        This downloads the video segment and extracts the specific frame.
        """
        # Use yt-dlp to get video stream URL
        # Then use ffmpeg to extract frame at timestamp
        
        # Method 1: Direct extraction with yt-dlp + ffmpeg
        cmd = [
            'yt-dlp',
            '--quiet',
            '--no-warnings',
            '--format', 'best[height<=720]',  # Limit quality for speed
            '--output', '-',  # Output to stdout
            video_url,
            '|',
            'ffmpeg',
            '-ss', str(timestamp_sec),
            '-i', 'pipe:0',
            '-frames:v', '1',
            '-q:v', '2',  # High quality JPEG
            '-y',
            str(output_path)
        ]
        
        # Alternative: Two-step process (more reliable)
        # Step 1: Get direct video URL
        get_url_cmd = [
            'yt-dlp',
            '--quiet',
            '--no-warnings',
            '--format', 'best[height<=720]',
            '--get-url',
            video_url
        ]
        
        result = subprocess.run(get_url_cmd, capture_output=True, text=True, check=True)
        direct_url = result.stdout.strip()
        
        # Step 2: Extract frame with ffmpeg
        extract_cmd = [
            'ffmpeg',
            '-ss', str(timestamp_sec),
            '-i', direct_url,
            '-frames:v', '1',
            '-q:v', '2',
            '-y',
            str(output_path)
        ]
        
        subprocess.run(extract_cmd, capture_output=True, check=True)
        
        if not output_path.exists():
            raise RuntimeError("Frame extraction failed - output file not created")
    
    def _load_cached_frame(self, frame_path: Path, output_format: str) -> dict:
        """Load frame from cache in requested format."""
        if output_format == "base64":
            with open(frame_path, 'rb') as f:
                frame_bytes = f.read()
            frame_b64 = base64.b64encode(frame_bytes).decode('utf-8')
            return {
                'format': 'base64',
                'data': frame_b64,
                'mime_type': 'image/jpeg',
                'path': str(frame_path)
            }
        
        elif output_format == "file":
            return {
                'format': 'file',
                'path': str(frame_path),
                'mime_type': 'image/jpeg'
            }
        
        elif output_format == "numpy":
            frame = cv2.imread(str(frame_path))
            if frame is None:
                raise RuntimeError(f"Failed to load frame from {frame_path}")
            return {
                'format': 'numpy',
                'data': frame,
                'shape': frame.shape,
                'path': str(frame_path)
            }
        
        else:
            raise ValueError(f"Unsupported output format: {output_format}")
    
    def clear_cache(self):
        """Clear all cached frames."""
        import shutil
        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
