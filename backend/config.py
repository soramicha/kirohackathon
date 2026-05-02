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
    
    # YOLO confidence threshold for people detection
    # Higher = only detect very confident detections
    YOLO_CONFIDENCE = 0.4


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


# ============================================================================
# PRESETS
# ============================================================================

class DetectionPresets:
    """
    Pre-configured parameter sets for different use cases.
    """
    
    @staticmethod
    def strict():
        """
        Strict detection - fewer false positives, might miss some formations.
        Best for: Clean practice videos with clear formations.
        """
        FormationDetectionConfig.MIN_FORMATION_DURATION = 4.0
        FormationDetectionConfig.MOTION_THRESHOLD = 6.0
        FormationDetectionConfig.MIN_PEOPLE_COUNT = 3
        FormationDetectionConfig.MIN_SPACING_BETWEEN = 8.0
        FormationDetectionConfig.EDGE_CHANGE_THRESHOLD = 0.12
    
    @staticmethod
    def balanced():
        """
        Balanced detection - good default for most videos.
        Best for: Standard practice videos and performances.
        """
        FormationDetectionConfig.MIN_FORMATION_DURATION = 3.0
        FormationDetectionConfig.MOTION_THRESHOLD = 8.0
        FormationDetectionConfig.MIN_PEOPLE_COUNT = 2
        FormationDetectionConfig.MIN_SPACING_BETWEEN = 5.0
        FormationDetectionConfig.EDGE_CHANGE_THRESHOLD = 0.15
    
    @staticmethod
    def loose():
        """
        Loose detection - catches more formations, more false positives.
        Best for: Fast-paced choreography with quick transitions.
        """
        FormationDetectionConfig.MIN_FORMATION_DURATION = 2.0
        FormationDetectionConfig.MOTION_THRESHOLD = 10.0
        FormationDetectionConfig.MIN_PEOPLE_COUNT = 2
        FormationDetectionConfig.MIN_SPACING_BETWEEN = 3.0
        FormationDetectionConfig.EDGE_CHANGE_THRESHOLD = 0.20
    
    @staticmethod
    def solo():
        """
        Solo performance detection.
        Best for: Single dancer videos.
        """
        FormationDetectionConfig.MIN_FORMATION_DURATION = 3.0
        FormationDetectionConfig.MOTION_THRESHOLD = 7.0
        FormationDetectionConfig.MIN_PEOPLE_COUNT = 1
        FormationDetectionConfig.MIN_SPACING_BETWEEN = 5.0
        FormationDetectionConfig.EDGE_CHANGE_THRESHOLD = 0.15


# Initialize with balanced preset
DetectionPresets.balanced()
