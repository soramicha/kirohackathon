"""
Configuration for FormationAI detection algorithms.
Adjust these parameters to fine-tune formation detection behavior.
"""

# ============================================================================
# FORMATION DETECTION PARAMETERS
# ============================================================================

class FormationDetectionConfig:
    """
    Parameters for auto-detecting stable formations in dance videos.
    
    Tuning guide:
    - Increase MIN_FORMATION_DURATION to require longer stable periods (fewer detections)
    - Decrease MOTION_THRESHOLD to be more strict about movement (fewer detections)
    - Increase MIN_PEOPLE_COUNT to only detect group formations (fewer detections)
    - Increase MIN_SPACING_BETWEEN to spread out detections more (fewer detections)
    - Decrease SAMPLE_INTERVAL for more precision (slower, but more accurate)
    """
    
    # Minimum duration (seconds) a formation must be held to be detected
    # Higher = fewer false positives, but might miss quick formations
    MIN_FORMATION_DURATION = 3.0
    
    # How often to sample the video (seconds)
    # Lower = more precise detection but slower processing
    SAMPLE_INTERVAL = 1.0
    
    # Motion threshold (mean pixel difference)
    # Lower = stricter (less tolerant of movement)
    # Typical range: 5.0 (very strict) to 15.0 (very loose)
    MOTION_THRESHOLD = 8.0
    
    # Minimum number of people required to consider it a formation
    # Set to 1 for solo performances, 2+ for group choreography
    MIN_PEOPLE_COUNT = 2
    
    # Maximum edge change ratio to detect scene cuts/camera changes
    # Higher = more tolerant of camera movement
    # Typical range: 0.10 (strict) to 0.25 (loose)
    EDGE_CHANGE_THRESHOLD = 0.15
    
    # Minimum seconds between detected formations
    # Prevents detecting multiple timestamps in the same formation
    MIN_SPACING_BETWEEN = 5.0
    
    # YOLO confidence threshold for people detection during scanning
    # Lower = catches more people but more false positives
    # The per-frame detector uses its own multi-pass thresholds (0.25 / 0.15)
    YOLO_CONFIDENCE = 0.25

    # ---- Enhanced detection parameters (audio + velocity + hull) ----

    # Phrase length in beats (8-count is standard in most choreography)
    PHRASE_LENGTH = 8

    # Number of frames to search around each phrase boundary for velocity minimum
    VELOCITY_SEARCH_WINDOW = 10

    # Minimum hull stability score to confirm a formation (0-1, higher = stricter)
    HULL_STABILITY_THRESHOLD = 0.7

    # Normalized background motion threshold for camera motion compensation
    # If median dancer displacement exceeds this, treat as camera motion
    CAMERA_MOTION_THRESHOLD = 0.02

    # Audio sample rate for librosa analysis
    AUDIO_SAMPLE_RATE = 22050

    # Histogram correlation threshold for scene cut detection
    # Lower = more sensitive to cuts (0.0 to 1.0)
    SCENE_CUT_THRESHOLD = 0.5

    # Minimum fraction of dancers that must have swapped positions to detect
    # a formation change (0.0 to 1.0). E.g., 0.2 = at least 20% of dancers
    # moved to a different dancer's previous position.
    SWAP_DETECTION_THRESHOLD = 0.15


# ============================================================================
# DANCER DETECTION PARAMETERS
# ============================================================================

class DancerDetectionConfig:
    """Parameters for per-frame dancer detection."""
    
    # Minimum confidence for YOLO detections
    CONFIDENCE_THRESHOLD = 0.4
    
    # Only detect person class (class 0 in COCO)
    DETECT_CLASSES = [0]


# ============================================================================
# APPEARANCE MATCHING PARAMETERS
# ============================================================================

class AppearanceMatchingConfig:
    """Parameters for matching dancers across frames."""
    
    # Weight for appearance similarity (color histogram)
    APPEARANCE_WEIGHT = 0.7
    
    # Weight for proximity (position similarity)
    PROXIMITY_WEIGHT = 0.3
    
    # Maximum normalized distance to consider a match
    # (diagonal of frame = ~1.41, so 0.5 = ~35% of diagonal)
    MAX_MATCH_DISTANCE = 0.5


