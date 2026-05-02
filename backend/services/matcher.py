import cv2
import numpy as np
from pathlib import Path


def compute_appearance(img: np.ndarray, bbox: list) -> np.ndarray:
    """
    Compute a color histogram for a dancer's bounding box crop.
    Uses HSV color space — robust to lighting changes.
    Focuses on the torso region (middle 50%) to avoid floor/background.
    """
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros(128)

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
    return feat / norm if norm > 0 else feat


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
    appearance_weight: float = 0.7,
    proximity_weight: float = 0.3,
) -> list[dict]:
    """
    Match curr_dancers to prev_dancers using appearance + proximity.
    Returns curr_dancers with IDs reassigned to match prev_dancers

    - appearance_weight: how much outfit color similarity matters
    - proximity_weight: how much position similarity matters
    """
    if not prev_dancers or not curr_dancers:
        return curr_dancers

    # Compute appearance features
    prev_feats = [
        compute_appearance(prev_img, d["bbox"]) if d.get("bbox") else None
        for d in prev_dancers
    ]
    curr_feats = [
        compute_appearance(curr_img, d["bbox"]) if d.get("bbox") else None
        for d in curr_dancers
    ]

    n_prev = len(prev_dancers)
    n_curr = len(curr_dancers)

    # Build cost matrix (higher = better match, we want max assignment)
    score_matrix = np.zeros((n_curr, n_prev))

    for i, (cd, cf) in enumerate(zip(curr_dancers, curr_feats)):
        for j, (pd, pf) in enumerate(zip(prev_dancers, prev_feats)):
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
        assigned_curr[ci] = prev_dancers[pi]
        assigned_prev.add(pi)

    # Reassign IDs
    used_ids = {prev_dancers[pi]["id"] for pi in assigned_prev}
    next_new_id = max((d["id"] for d in prev_dancers), default=0) + 1

    result = []
    for i, dancer in enumerate(curr_dancers):
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

    return result
