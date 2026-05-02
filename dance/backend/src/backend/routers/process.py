"""Video processing endpoints."""
import base64
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict

from ..services.frame_extractor import FrameExtractor
from ..services.detector import PersonDetector
from ..services.formation import FormationGenerator

router = APIRouter()

# Initialize services
frame_extractor = FrameExtractor()
person_detector = PersonDetector()
formation_generator = FormationGenerator()


class ProcessFrameRequest(BaseModel):
    """Request model for frame processing."""
    video_id: str
    timestamp: float


class DetectedPerson(BaseModel):
    """Detected person model."""
    id: int
    label: str
    confidence: float
    bbox: dict[str, float]
    center: dict[str, float]
    floor_position: dict[str, float]


class ProcessFrameResponse(BaseModel):
    """Response model for frame processing."""
    frame: int
    timestamp_sec: float
    screenshot_url: str
    people: list[DetectedPerson]


@router.post("/process-frame", response_model=ProcessFrameResponse)
async def process_frame(request: ProcessFrameRequest):
    """
    Process a single frame from a YouTube video.
    
    Steps:
    1. Extract frame at timestamp
    2. Run YOLO detection with optimized settings for dance groups
    3. Return detected people with bounding boxes
    
    Note: For large groups (7+) or partially visible dancers,
    consider lowering confidence threshold or using manual correction.
    """
    try:
        # Construct YouTube URL from video_id
        video_url = f"https://www.youtube.com/watch?v={request.video_id}"
        
        # Extract frame
        frame_data = frame_extractor.extract_frame_at_timestamp(
            video_url=video_url,
            timestamp_sec=request.timestamp,
            output_format="numpy"
        )
        
        frame_image = frame_data['data']
        
        # Detect people with lower confidence threshold for large groups
        # Default 0.5, but can go as low as 0.3 for crowded scenes
        confidence = 0.35  # Lowered from 0.5 to catch more dancers
        people = person_detector.detect_people(frame_image, confidence_threshold=confidence)
        
        # Draw detections on frame
        annotated_frame = person_detector.draw_detections(frame_image, people)
        
        # Convert annotated frame to base64 for frontend
        _, buffer = cv2.imencode('.jpg', annotated_frame)
        frame_b64 = base64.b64encode(buffer).decode('utf-8')
        screenshot_url = f"data:image/jpeg;base64,{frame_b64}"
        
        # Calculate frame number (assuming 30fps)
        frame_number = int(request.timestamp * 30)
        
        return ProcessFrameResponse(
            frame=frame_number,
            timestamp_sec=request.timestamp,
            screenshot_url=screenshot_url,
            people=[DetectedPerson(**person) for person in people]
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process frame: {str(e)}"
        )


@router.post("/extract-frame")
async def extract_frame(video_url: str, timestamp_sec: float):
    """
    Extract a single frame from YouTube video.
    
    Returns the frame as base64.
    """
    try:
        frame_data = frame_extractor.extract_frame_at_timestamp(
            video_url=video_url,
            timestamp_sec=timestamp_sec,
            output_format="base64"
        )
        
        return {
            "timestamp_sec": timestamp_sec,
            "frame_data": frame_data['data'],
            "mime_type": frame_data['mime_type']
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract frame: {str(e)}"
        )



class GenerateFormationRequest(BaseModel):
    """Request model for formation generation."""
    video_id: str
    timestamp: float
    people: List[Dict]
    stage_corners: List[Dict[str, float]]


class FormationResponse(BaseModel):
    """Response model for formation generation."""
    id: str
    video_id: str
    timestamp_sec: float
    screenshot_url: str
    formation_image_url: str
    people: List[Dict]
    stage_corners: List[Dict[str, float]]


@router.post("/generate-formation", response_model=FormationResponse)
async def generate_formation(request: GenerateFormationRequest):
    """
    Generate formation visualization with stage mapping.
    
    Steps:
    1. Get actual image dimensions from the frame
    2. Compute homography from stage corners
    3. Map dancer positions to stage coordinates
    4. Generate top-down formation visualization
    """
    try:
        # Re-extract the frame to get actual dimensions
        video_url = f"https://www.youtube.com/watch?v={request.video_id}"
        frame_data = frame_extractor.extract_frame_at_timestamp(
            video_url=video_url,
            timestamp_sec=request.timestamp,
            output_format="numpy"
        )
        frame_image = frame_data['data']
        image_height, image_width = frame_image.shape[:2]
        
        print(f"Image dimensions: {image_width}x{image_height}")
        print(f"Stage corners (relative): {request.stage_corners}")
        print(f"Number of people: {len(request.people)}")
        
        # Compute homography matrix with actual image dimensions
        homography = formation_generator.compute_homography(
            image_corners=request.stage_corners,
            image_width=image_width,
            image_height=image_height,
            stage_width=600,
            stage_height=400
        )
        
        print(f"Homography matrix:\n{homography}")
        
        # Map dancer positions to stage coordinates
        mapped_people = formation_generator.map_dancer_positions(
            people=request.people,
            homography=homography,
            stage_width=600,
            stage_height=400
        )
        
        # Generate formation visualization
        formation_img = formation_generator.generate_formation_image(
            people=mapped_people,
            width=600,
            height=400
        )
        
        # Convert formation image to base64
        _, buffer = cv2.imencode('.jpg', formation_img)
        formation_b64 = base64.b64encode(buffer).decode('utf-8')
        formation_url = f"data:image/jpeg;base64,{formation_b64}"
        
        # Get screenshot URL from first person's data (if available)
        # Or we could re-extract the frame here
        screenshot_url = ""  # Frontend already has this
        
        return FormationResponse(
            id=f"formation-{request.video_id}-{request.timestamp}",
            video_id=request.video_id,
            timestamp_sec=request.timestamp,
            screenshot_url=screenshot_url,
            formation_image_url=formation_url,
            people=mapped_people,
            stage_corners=request.stage_corners
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate formation: {str(e)}"
        )
