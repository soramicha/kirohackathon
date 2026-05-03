"""
Person-based matching using Hungarian algorithm + deep appearance features.

Key insight: we NEVER create new IDs after the first formation.
The user tells us how many dancers there are. That number is fixed.
Each subsequent formation matches detected dancers to the known set
using optimal assignment — no ID drift, no duplicates.
"""

import cv2
import numpy as np
from pathlib import Path
from scipy.optimize import linear_sum_assignment


def compute_appearance(img: np.ndarray, bbox: list) -> np.ndarray:
    """
    Compute a rich appearance descriptor for a dancer crop.
    Uses multiple features: color histogram (HSV), spatial color layout,
    and edge histogram for body shape.
    """
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 4 or crop.shape[1] < 4:
        return np.zeros(192)

    # Resize to fixed size for consistent features
    crop = cv2.resize(crop, (64, 128))

    # Split into 3 vertical regions (head, torso, legs)
    h = crop.shape[0]
    regions = [
        crop[:h // 3, :],       # head
        crop[h // 3:2 * h // 3, :],  # torso (most distinctive)
        crop[2 * h // 3:, :],   # legs
    ]

    features = []
    for region in regions:
        hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        # H: 16 bins, S: 16 bins per region = 32 dims per region
        h_hist = cv2.calcHist([hsv], [0], None, [16], [0, 180]).flatten()
        s_hist = cv2.calcHist([hsv], [1], None, [16], [0, 256]).flatten()
        features.extend([h_hist, s_hist])

    feat = np.concatenate(features)  # 32 * 3 = 96 dims

    # Add edge features for body shape
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    # 4x4 spatial grid of edge density
    gh, gw = edges.shape[0] // 4, edges.shape[1] // 4
    edge_feat = []
    for gy in range(4):
        for gx in range(4):
            cell = edges[gy * gh:(gy + 1) * gh, gx * gw:(gx + 1) * gw]
            edge_feat.append(np.mean(cell))
    features.append(np.array(edge_feat))  # 16 dims

    # Also add raw color means per region for quick differentiation
    for region in regions:
        features.append(np.mean(region, axis=(0, 1)))  # 3 dims per region = 9

    feat = np.concatenate(features)
    norm = np.linalg.norm(feat)
    return feat / norm if norm > 0 else feat


def match_formations(
    anchor_dancers: list[dict],
    anchor_img: np.ndarray,
    target_dancers: list[dict],
    target_img: np.ndarray,
    num_dancers: int,
) -> list[dict]:
    """
    Match target_dancers to anchor_dancers using Hungarian algorithm.
    
    - anchor_dancers: the reference formation (first one, or user-verified)
    - target_dancers: newly detected dancers to assign IDs to
    - num_dancers: fixed number of dancers (user-specified)
    
    Returns target_dancers with IDs reassigned to match anchor.
    Dancers not matched get placed offstage.
    """
    if not anchor_dancers or not target_dancers:
        return target_dancers

    # Compute appearance features for all dancers
    anchor_feats = [
        compute_appearance(anchor_img, d["bbox"]) if d.get("bbox") and any(d["bbox"]) else None
        for d in anchor_dancers
    ]
    target_feats = [
        compute_appearance(target_img, d["bbox"]) if d.get("bbox") and any(d["bbox"]) else None
        for d in target_dancers
    ]

    n_anchor = len(anchor_dancers)
    n_target = len(target_dancers)

    # Build cost matrix: appearance distance (lower = better match)
    # Rows = target dancers, Cols = anchor dancers
    cost_matrix = np.ones((n_target, n_anchor)) * 100.0  # high default cost

    for i in range(n_target):
        for j in range(n_anchor):
            if target_feats[i] is None or anchor_feats[j] is None:
                cost_matrix[i, j] = 50.0  # moderate cost for unknown
                continue

            # Cosine similarity → distance
            sim = float(np.dot(target_feats[i], anchor_feats[j]))
            appearance_cost = 1.0 - sim  # 0 = identical, 2 = opposite

            # Position cost (mild weight — dancers move, but not randomly)
            dx = target_dancers[i]["x"] - anchor_dancers[j]["x"]
            dy = target_dancers[i]["y"] - anchor_dancers[j]["y"]
            position_cost = np.sqrt(dx * dx + dy * dy)

            # Combined cost: appearance-heavy
            cost_matrix[i, j] = 0.75 * appearance_cost + 0.25 * position_cost

    # Hungarian algorithm — optimal 1-to-1 assignment
    row_indices, col_indices = linear_sum_assignment(cost_matrix)

    # Build result with reassigned IDs
    result = []
    assigned_target = set()
    assigned_anchor = set()

    for row, col in zip(row_indices, col_indices):
        if cost_matrix[row, col] > 2.0:  # too different, skip
            continue
        anchor_d = anchor_dancers[col]
        target_d = target_dancers[row]
        result.append({
            **target_d,
            "id": anchor_d["id"],
            "label": anchor_d.get("label", f"Dancer {anchor_d['id']}"),
        })
        assigned_target.add(row)
        assigned_anchor.add(col)

    # Unmatched target dancers — assign remaining anchor IDs
    unmatched_anchor_ids = [
        anchor_dancers[j]["id"] for j in range(n_anchor)
        if j not in assigned_anchor and not anchor_dancers[j].get("offstage")
    ]
    for i in range(n_target):
        if i not in assigned_target:
            if unmatched_anchor_ids:
                aid = unmatched_anchor_ids.pop(0)
                result.append({
                    **target_dancers[i],
                    "id": aid,
                    "label": f"Dancer {aid}",
                })
            # else: extra detection, ignore it

    # Sort by ID for consistency
    result.sort(key=lambda d: d["id"])
    return result
