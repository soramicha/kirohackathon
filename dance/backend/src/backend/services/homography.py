"""Homography and coordinate mapping service."""
import cv2
import numpy as np


class HomographyMapper:
    """Map image coordinates to stage coordinates using homography."""
    
    def __init__(self, stage_width: float = 10.0, stage_height: float = 10.0):
        """
        Initialize mapper with stage dimensions.
        
        Args:
            stage_width: Width of stage in normalized units
            stage_height: Height of stage in normalized units
        """
        self.stage_width = stage_width
        self.stage_height = stage_height
    
    def compute_homography(
        self,
        image_corners: list[tuple[float, float]],
    ) -> np.ndarray:
        """
        Compute homography matrix from image corners to stage plane.
        
        Args:
            image_corners: 4 corner points in image coordinates [(x, y), ...]
                          Order: top-left, top-right, bottom-right, bottom-left
            
        Returns:
            Homography matrix (3x3)
        """
        # Define stage corners in normalized coordinates
        stage_corners = np.array([
            [0, 0],
            [self.stage_width, 0],
            [self.stage_width, self.stage_height],
            [0, self.stage_height],
        ], dtype=np.float32)
        
        # Convert image corners to numpy array
        image_pts = np.array(image_corners, dtype=np.float32)
        
        # Compute homography
        H, _ = cv2.findHomography(image_pts, stage_corners)
        
        return H
    
    def map_point(
        self,
        point: tuple[float, float],
        homography: np.ndarray,
    ) -> tuple[float, float]:
        """
        Map a single point from image to stage coordinates.
        
        Args:
            point: Point in image coordinates (x, y)
            homography: Homography matrix
            
        Returns:
            Point in stage coordinates (x, y)
        """
        # Convert to homogeneous coordinates
        pt = np.array([[point[0], point[1]]], dtype=np.float32)
        pt = pt.reshape(-1, 1, 2)
        
        # Apply homography
        transformed = cv2.perspectiveTransform(pt, homography)
        
        return float(transformed[0][0][0]), float(transformed[0][0][1])
    
    def map_detections(
        self,
        detections: list[dict],
        homography: np.ndarray,
    ) -> list[dict]:
        """
        Map all detections from image to stage coordinates.
        
        Args:
            detections: List of detections with x, y positions
            homography: Homography matrix
            
        Returns:
            Detections with mapped stage_x, stage_y coordinates
        """
        mapped = []
        for det in detections:
            stage_x, stage_y = self.map_point((det["x"], det["y"]), homography)
            
            mapped.append({
                **det,
                "stage_x": stage_x,
                "stage_y": stage_y,
            })
        
        return mapped
