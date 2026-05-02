"""Person detection service using YOLO."""
from typing import List, Dict, Any
import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """Detect people in images using YOLOv8."""
    
    def __init__(self, model_name: str = "yolov8n.pt"):
        """Initialize detector.
        
        Args:
            model_name: YOLO model to use (yolov8n, yolov8s, yolov8m, etc.)
        """
        self.model = YOLO(model_name)
        self.person_class_id = 0  # COCO dataset person class
    
    def detect_people(self, image: np.ndarray, confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Detect people in an image.
        
        Args:
            image: Image as numpy array (BGR format from cv2)
            confidence_threshold: Minimum confidence for detection
            
        Returns:
            List of detected people with bounding boxes and positions
        """
        # Run inference with optimized settings for dance groups
        # - imgsz: Larger image size for better small person detection
        # - conf: Lower confidence threshold to catch partially visible people
        # - iou: Lower IoU threshold to handle overlapping dancers
        results = self.model(
            image, 
            verbose=False,
            imgsz=1280,  # Larger than default 640 for better detection
            conf=confidence_threshold,
            iou=0.3,  # Lower IoU threshold (default 0.45) to keep overlapping detections
            max_det=50,  # Increase max detections (default 300, but we limit to 50 for performance)
        )
        
        people = []
        for result in results:
            boxes = result.boxes
            
            for i, box in enumerate(boxes):
                # Filter for person class only
                class_id = int(box.cls[0])
                if class_id != self.person_class_id:
                    continue
                
                # Filter by confidence
                confidence = float(box.conf[0])
                if confidence < confidence_threshold:
                    continue
                
                # Get bounding box coordinates
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                
                # Compute center and bottom positions
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                bottom_x = center_x
                bottom_y = y2  # Bottom of bounding box (floor position)
                
                person = {
                    'id': i + 1,
                    'label': f'Person {i + 1}',
                    'confidence': confidence,
                    'bbox': {
                        'x': float(x1),
                        'y': float(y1),
                        'width': float(x2 - x1),
                        'height': float(y2 - y1),
                    },
                    'center': {
                        'x': float(center_x),
                        'y': float(center_y),
                    },
                    'floor_position': {
                        'x': float(bottom_x),
                        'y': float(bottom_y),
                    }
                }
                people.append(person)
        
        return people
    
    def draw_detections(self, image: np.ndarray, people: List[Dict[str, Any]]) -> np.ndarray:
        """Draw bounding boxes and labels on image.
        
        Args:
            image: Image as numpy array
            people: List of detected people
            
        Returns:
            Image with drawn detections
        """
        import cv2
        
        output = image.copy()
        
        for person in people:
            bbox = person['bbox']
            x1 = int(bbox['x'])
            y1 = int(bbox['y'])
            x2 = int(x1 + bbox['width'])
            y2 = int(y1 + bbox['height'])
            
            # Draw bounding box
            cv2.rectangle(output, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Draw label
            label = person['label']
            confidence = person['confidence']
            text = f"{label} ({confidence:.2f})"
            
            # Background for text
            (text_width, text_height), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(output, (x1, y1 - text_height - 10), (x1 + text_width, y1), (0, 255, 0), -1)
            
            # Text
            cv2.putText(output, text, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
            
            # Draw floor position marker
            floor_x = int(person['floor_position']['x'])
            floor_y = int(person['floor_position']['y'])
            cv2.circle(output, (floor_x, floor_y), 5, (255, 0, 0), -1)
        
        return output
