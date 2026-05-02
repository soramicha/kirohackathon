"""Formation generation service with homography mapping."""
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple


class FormationGenerator:
    """Generate top-down formation visualizations."""
    
    def compute_homography(
        self,
        image_corners: List[Dict[str, float]],
        image_width: int,
        image_height: int,
        stage_width: int = 600,
        stage_height: int = 400
    ) -> np.ndarray:
        """Compute homography matrix from image corners to stage coordinates.
        
        Args:
            image_corners: 4 corners in image (relative 0-1 coordinates)
                          [top-left, top-right, bottom-right, bottom-left]
            image_width: Actual width of the source image in pixels
            image_height: Actual height of the source image in pixels
            stage_width: Width of output stage in pixels
            stage_height: Height of output stage in pixels
            
        Returns:
            3x3 homography matrix
        """
        # Source points (image corners) - convert from relative to absolute
        src_points = np.float32([
            [image_corners[0]['x'] * image_width, image_corners[0]['y'] * image_height],  # top-left
            [image_corners[1]['x'] * image_width, image_corners[1]['y'] * image_height],  # top-right
            [image_corners[2]['x'] * image_width, image_corners[2]['y'] * image_height],  # bottom-right
            [image_corners[3]['x'] * image_width, image_corners[3]['y'] * image_height],  # bottom-left
        ])
        
        # Destination points (stage rectangle)
        # Add padding to stage
        padding = 40
        dst_points = np.float32([
            [padding, padding],                                    # top-left
            [stage_width - padding, padding],                      # top-right
            [stage_width - padding, stage_height - padding],       # bottom-right
            [padding, stage_height - padding],                     # bottom-left
        ])
        
        # Compute homography
        H, _ = cv2.findHomography(src_points, dst_points)
        return H
    
    def map_dancer_positions(
        self,
        people: List[Dict[str, Any]],
        homography: np.ndarray,
        stage_width: int = 600,
        stage_height: int = 400
    ) -> List[Dict[str, Any]]:
        """Map dancer positions from image to stage coordinates.
        
        Args:
            people: List of detected people with floor_position
            homography: 3x3 homography matrix
            stage_width: Width of stage
            stage_height: Height of stage
            
        Returns:
            Updated people list with stage_x and stage_y (normalized 0-1)
        """
        mapped_people = []
        
        for person in people:
            # Get floor position (bottom of bounding box)
            # Handle both dict and nested dict formats
            if 'floor_position' in person:
                floor_x = person['floor_position']['x']
                floor_y = person['floor_position']['y']
            elif 'bbox' in person:
                # Fallback: compute from bbox if floor_position not available
                bbox = person['bbox']
                floor_x = bbox['x'] + bbox['width'] / 2
                floor_y = bbox['y'] + bbox['height']
            else:
                print(f"Warning: Person {person.get('id')} has no floor_position or bbox")
                continue
            
            # Apply homography
            point = np.array([[floor_x, floor_y]], dtype=np.float32)
            point = point.reshape(-1, 1, 2)
            mapped_point = cv2.perspectiveTransform(point, homography)
            
            stage_x_px = mapped_point[0][0][0]
            stage_y_px = mapped_point[0][0][1]
            
            # Normalize to 0-1 range
            stage_x = stage_x_px / stage_width
            stage_y = stage_y_px / stage_height
            
            # Clamp to valid range
            stage_x = max(0.0, min(1.0, stage_x))
            stage_y = max(0.0, min(1.0, stage_y))
            
            print(f"Person {person.get('id')}: floor({floor_x:.1f}, {floor_y:.1f}) -> stage({stage_x:.3f}, {stage_y:.3f})")
            
            mapped_people.append({
                **person,
                'stage_x': float(stage_x),
                'stage_y': float(stage_y),
            })
        
        return mapped_people
    
    def generate_formation_image(
        self,
        people: List[Dict[str, Any]],
        width: int = 600,
        height: int = 400
    ) -> np.ndarray:
        """Generate top-down formation visualization.
        
        Args:
            people: List of people with stage_x and stage_y (normalized 0-1)
            width: Image width
            height: Image height
            
        Returns:
            Formation image as numpy array
        """
        # Create blank canvas
        img = np.ones((height, width, 3), dtype=np.uint8) * 243  # Light gray background
        
        # Draw grid
        grid_color = (209, 213, 219)  # Gray
        grid_size = 50
        for x in range(0, width, grid_size):
            cv2.line(img, (x, 0), (x, height), grid_color, 1)
        for y in range(0, height, grid_size):
            cv2.line(img, (0, y), (width, y), grid_color, 1)
        
        # Draw stage border
        padding = 20
        cv2.rectangle(
            img,
            (padding, padding),
            (width - padding, height - padding),
            (55, 65, 81),  # Dark gray
            3
        )
        
        # Draw dancers
        for person in people:
            if 'stage_x' not in person or 'stage_y' not in person:
                continue
            
            # Map normalized coordinates to pixel coordinates
            x = int(padding + person['stage_x'] * (width - 2 * padding))
            y = int(padding + person['stage_y'] * (height - 2 * padding))
            
            # Draw circle for dancer
            cv2.circle(img, (x, y), 20, (59, 130, 246), -1)  # Blue
            cv2.circle(img, (x, y), 20, (255, 255, 255), 2)  # White border
            
            # Draw label
            label = person.get('display_name') or person.get('label', '?')
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.5
            font_thickness = 2
            
            # Get text size for centering
            (text_width, text_height), _ = cv2.getTextSize(label, font, font_scale, font_thickness)
            text_x = x - text_width // 2
            text_y = y + text_height // 2
            
            cv2.putText(img, label, (text_x, text_y), font, font_scale, (255, 255, 255), font_thickness)
        
        return img
