import cv2
import numpy as np
from pathlib import Path


def compute_appearance(img: np.ndarray, bbox: list) -> np.ndarray:
    """
    Compute a color histogram for a dancer's bounding box crop.
    Uses HSV color space — robust to lighting changes.
    Focuses on the torso region (middle 50%) to avoid floor/background.
    Returns None for invalid/empty bboxes (e.g., offstage dancers).
    """
    x1, y1, x2, y2 = [int(v) for v in bbox]
    
    # Check for invalid/empty bbox (offstage dancers)
    if x1 == 0 and y1 == 0 and x2 == 0 and y2 == 0:
        return None
    
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return None

    # Focus on torso — middle vertical 50%
    h = crop.shape[0]
    torso = crop[h // 4: 3 * h // 4, :]
    if torso.size == 0:
        torso = crop

    hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)

    # H: 32 bins, S: 32 bins, V: 16 bins = 80 dims but we use H+S only
    h_hist = cv2.calcHist([hsv], [0], None, [32], [0, 180]).flatten()
    s_hist = cv2.calcHist([hsv], [1], None, [32], [0, 256]).flatten()

    feat = np.concatenate([h_hist, s_hist])
    norm = np.linalg.norm(feat)
    return feat / norm if norm > 0 else None


def appearance_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two appearance vectors. 1.0 = identical."""
    if a is None or b is None:
        return 0.0
    return float(np.dot(a, b))


def match_dancers(
    prev_dancers: list[dict],
    curr_dancers: list[dict],
    prev_img: np.ndarray,
    curr_img: np.ndarray,
    expected_count: int = None,
    appearance_weight: float = 0.7,
    proximity_weight: float = 0.3,
) -> list[dict]:
    """
    Match curr_dancers to prev_dancers using appearance + proximity.
    Returns curr_dancers with IDs reassigned to match prev_dancers.
    Handles offstage/manual dancers by preserving them from previous formation.

    - appearance_weight: how much outfit color similarity matters
    - proximity_weight: how much position similarity matters
    """
    if not prev_dancers or not curr_dancers:
        return curr_dancers

    # Separate detected dancers from offstage/manual dancers in previous formation
    prev_detected = [d for d in prev_dancers if not d.get("offstage", False)]
    prev_offstage = [d for d in prev_dancers if d.get("offstage", False)]
    
    # All current dancers should be detected (offstage ones are added after matching)
    curr_detected = [d for d in curr_dancers if not d.get("offstage", False)]

    # Compute appearance features only for detected dancers
    prev_feats = [
        compute_appearance(prev_img, d["bbox"]) if d.get("bbox") else None
        for d in prev_detected
    ]
    curr_feats = [
        compute_appearance(curr_img, d["bbox"]) if d.get("bbox") else None
        for d in curr_detected
    ]

    n_prev = len(prev_detected)
    n_curr = len(curr_detected)

    if n_prev == 0 or n_curr == 0:
        # If no detected dancers to match, just preserve offstage dancers
        result = curr_detected.copy()
        result.extend(prev_offstage)
        
        # Still need to ensure we have the expected count
        if expected_count and len(result) < expected_count:
            missing_count = expected_count - len(result)
            used_ids = {d["id"] for d in result} if result else set()
            next_new_id = max(used_ids, default=0) + 1
            
            # Find the next available ID that's not already used
            while next_new_id in used_ids:
                next_new_id += 1
            
            # Add missing dancers to offstage area
            for i in range(missing_count):
                # Simple vertical spacing with good padding
                offstage_x = 1.2 + (i % 2) * 0.15  # 2 columns with good spacing
                offstage_y = 0.1 + (i * 0.12)      # vertical spacing with padding
                
                result.append({
                    "id": next_new_id,
                    "label": f"Dancer {next_new_id} (offstage)",
                    "x": offstage_x,
                    "y": offstage_y,
                    "bbox": [0, 0, 0, 0],  # no actual detection
                    "keypoints": [],
                    "confidence": 0.0,
                    "manual": True,  # flag to indicate this was manually added
                    "offstage": True  # flag to indicate this is offstage
                })
                next_new_id += 1
        
        return result

    # Build cost matrix (higher = better match, we want max assignment)
    score_matrix = np.zeros((n_curr, n_prev))

    for i, (cd, cf) in enumerate(zip(curr_detected, curr_feats)):
        for j, (pd, pf) in enumerate(zip(prev_detected, prev_feats)):
            # Appearance score
            app_score = appearance_similarity(cf, pf) if cf is not None and pf is not None else 0.5

            # Proximity score — normalized by frame diagonal
            dx = cd["x"] - pd["x"]
            dy = cd["y"] - pd["y"]
            dist = np.sqrt(dx * dx + dy * dy)
            prox_score = max(0.0, 1.0 - dist * 2.0)  # dist > 0.5 = 0 score

            score_matrix[i, j] = appearance_weight * app_score + proximity_weight * prox_score

    # Greedy assignment — assign best match first
    assigned_prev = set()
    assigned_curr = {}  # curr_idx -> prev_dancer

    # Sort by best score descending
    pairs = [(score_matrix[i, j], i, j) for i in range(n_curr) for j in range(n_prev)]
    pairs.sort(reverse=True)

    for score, ci, pi in pairs:
        if ci in assigned_curr or pi in assigned_prev:
            continue
        assigned_curr[ci] = prev_detected[pi]
        assigned_prev.add(pi)

    # Reassign IDs for detected dancers
    used_ids = {prev_detected[pi]["id"] for pi in assigned_prev}
    next_new_id = max((d["id"] for d in prev_dancers), default=0) + 1

    result = []
    for i, dancer in enumerate(curr_detected):
        if i in assigned_curr:
            matched = assigned_curr[i]
            result.append({
                **dancer,
                "id": matched["id"],
                "label": f"Dancer {matched['id']} ({dancer['label'].split('(')[-1].rstrip(')')})",
            })
        else:
            # New dancer not seen before
            result.append({
                **dancer,
                "id": next_new_id,
                "label": f"Dancer {next_new_id} ({dancer['label'].split('(')[-1].rstrip(')')})",
            })
            next_new_id += 1

    # Add back all offstage dancers from previous formation
    # They maintain their positions and IDs
    result.extend(prev_offstage)

    # If expected_count is specified and we have fewer total dancers, add missing ones offstage
    if expected_count and len(result) < expected_count:
        missing_count = expected_count - len(result)
        used_ids = {d["id"] for d in result}
        next_new_id = max(used_ids, default=0) + 1
        
        # Find the next available ID that's not already used
        while next_new_id in used_ids:
            next_new_id += 1
        
        # Add missing dancers to offstage area
        for i in range(missing_count):
            # Simple vertical spacing with good padding
            offstage_x = 1.2 + (i % 2) * 0.15  # 2 columns with good spacing
            offstage_y = 0.1 + (i * 0.12)      # vertical spacing with padding
            
            result.append({
                "id": next_new_id,
                "label": f"Dancer {next_new_id} (offstage)",
                "x": offstage_x,
                "y": offstage_y,
                "bbox": [0, 0, 0, 0],  # no actual detection
                "keypoints": [],
                "confidence": 0.0,
                "manual": True,  # flag to indicate this was manually added
                "offstage": True  # flag to indicate this is offstage
            })
            next_new_id += 1

    return result
