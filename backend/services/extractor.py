import cv2
import json
import logging
import numpy as np
from pathlib import Path
from typing import Literal
from config import FormationDetectionConfig

logger = logging.getLogger(__name__)

# Detection parameters (imported from config.py)
# Adjust these in config.py to tune detection behavior


def _get_video_path(session_id: str) -> Path:
    session_dir = Path(f"sessions/{session_id}")
    meta_path = session_dir / "metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)
        return Path(meta.get("video_path", str(session_dir / "video.mp4")))
    candidates = list(session_dir.glob("video.*"))
    return candidates[0] if candidates else session_dir / "video.mp4"


def _compute_expected_dancer_count(dancer_counts: list[int]) -> int:
    """
    Compute the expected number of dancers from the mode of per-frame counts.
    Ignores frames with 0 detections (empty frames, scene cuts).
    Returns 0 if no reliable count can be determined.
    """
    nonzero = [c for c in dancer_counts if c > 0]
    if not nonzero:
        return 0
    # Use mode (most common count)
    from collections import Counter
    count_freq = Counter(nonzero)
    mode_count, mode_freq = count_freq.most_common(1)[0]
    # Only trust the mode if it appears in at least 20% of non-zero frames
    if mode_freq / len(nonzero) >= 0.2:
        return mode_count
    return 0


def _save_expected_count(session_id: str, expected_count: int):
    """Save expected dancer count to session directory for use by per-frame detector."""
    session_dir = Path(f"sessions/{session_id}")
    count_path = session_dir / "expected_dancer_count.json"
    with open(count_path, "w") as f:
        json.dump({"expected_count": expected_count}, f)


def get_expected_dancer_count(session_id: str) -> int | None:
    """Read expected dancer count from session directory. Returns None if not set."""
    count_path = Path(f"sessions/{session_id}/expected_dancer_count.json")
    if count_path.exists():
        with open(count_path) as f:
            data = json.load(f)
        return data.get("expected_count")
    return None


def detect_formation_timestamps(session_id: str) -> list[dict]:
    """
    Scan the video and return stable formation timestamps.

    Uses the enhanced multi-signal detection pipeline:
    1. Audio phrase boundary detection (beat tracking + phrase segmentation)
    2. Per-dancer velocity tracking (YOLO centroid displacement)
    3. Convex hull stability analysis (geometric confirmation)
    4. Signal fusion to produce confirmed timestamps

    Falls back to the legacy motion-threshold detector if enhanced
    detection fails (e.g., missing librosa, no audio track).
    """
    video_path = _get_video_path(session_id)
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    try:
        timestamps = _detect_formations_enhanced(session_id, cap, fps, duration)
    except Exception as e:
        logger.warning(f"Enhanced detection failed, falling back to legacy: {e}")
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        timestamps = _detect_formation_timestamps_legacy(cap, fps, duration)

    cap.release()
    return timestamps


def extract_frames(
    session_id: str,
    mode: Literal["auto", "manual"] = "auto",
    timestamps: list[float] | None = None,
) -> list[dict]:
    """
    Extract JPEG frames from the downloaded video.
    """
    session_dir = Path(f"sessions/{session_id}")
    frames_dir = session_dir / "frames"
    frames_dir.mkdir(exist_ok=True)

    video_path = _get_video_path(session_id)

    if mode == "manual" and timestamps:
        selected_timestamps = timestamps
    else:
        # Use the main detection pipeline
        results = detect_formation_timestamps(session_id)
        selected_timestamps = [r["timestamp"] for r in results]

    # Extract frames at selected timestamps
    cap = cv2.VideoCapture(str(video_path))
    extracted = []

    for ts in selected_timestamps:
        frame_id = f"frame_{int(ts * 1000):08d}"  # millisecond precision
        out_path = frames_dir / f"{frame_id}.jpg"

        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(str(out_path), frame)
            extracted.append({
                "frame_id": frame_id,
                "timestamp": ts,
                "path": str(out_path.relative_to(session_dir)),
            })

    cap.release()

    # persist frame index
    index_path = session_dir / "frames_index.json"
    with open(index_path, "w") as f:
        json.dump(extracted, f, indent=2)

    return extracted


# =============================================================================
# Enhanced multi-signal detection
# =============================================================================


def _detect_formations_enhanced(
    session_id: str, cap, fps: float, duration: float
) -> list[dict]:
    """
    Enhanced detection pipeline:
    1. Analyze audio for phrase boundaries
    2. Compute per-dancer velocity curve via YOLO tracking
    3. Compute convex hull stability
    4. Fuse signals to confirm formation timestamps
    """
    from services.audio_analyzer import analyze_audio

    config = FormationDetectionConfig

    # Step 1: Audio analysis (may return None)
    audio = analyze_audio(session_id)
    phrase_boundaries = audio["phrase_boundaries"] if audio else None
    if phrase_boundaries:
        logger.info(f"Audio: {audio['tempo']:.0f} BPM, {len(phrase_boundaries)} phrase boundaries")
    else:
        logger.info("No audio signal available — using velocity + hull only")

    # Step 2: Compute velocity curve (also gives us dancer positions and counts)
    velocity_data = _compute_velocity_curve(cap, fps, duration, config)

    # Compute expected dancer count from mode of all frame counts
    expected_count = _compute_expected_dancer_count(velocity_data["dancer_counts"])
    if expected_count > 0:
        logger.info(f"Expected dancer count: {expected_count}")
        # Store in session for use by per-frame detector
        _save_expected_count(session_id, expected_count)

    # Step 3: Compute hull stability from dancer positions
    hull_stability = _compute_hull_stability(velocity_data["dancer_positions"])

    # Step 4: Fuse all signals
    results = _fuse_signals(
        phrase_boundaries=phrase_boundaries,
        timestamps=velocity_data["timestamps"],
        group_velocity=velocity_data["group_velocity"],
        dancer_counts=velocity_data["dancer_counts"],
        hull_stability=hull_stability,
        dancer_positions=velocity_data["dancer_positions"],
        config=config,
    )

    logger.info(f"Enhanced detection found {len(results)} formations")
    return results


def _compute_velocity_curve(cap, fps: float, duration: float, config) -> dict:
    """
    Sample video frames, detect dancers via YOLO, compute per-dancer velocities.

    Returns dict with:
        timestamps: list of sample times
        group_velocity: mean dancer speed at each sample
        dancer_counts: people count at each sample
        dancer_positions: list of centroid lists per frame (normalized 0-1)
    """
    from services.detector import _get_detect_model

    model = _get_detect_model()

    timestamps = []
    group_velocity = []
    dancer_counts = []
    dancer_positions = []  # list of [(x, y), ...] per frame

    prev_centroids = None
    prev_hist = None
    current_time = 0.0

    while current_time < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]

        # YOLO detection — reused for both velocity and people counting
        results = model(frame, verbose=False, conf=config.YOLO_CONFIDENCE, classes=[0])[0]
        boxes = results.boxes
        people_count = len(boxes) if boxes is not None else 0

        # Extract normalized centroids (bounding box centers)
        centroids = []
        if boxes is not None and len(boxes) > 0:
            for box in boxes.xyxy.cpu().numpy():
                cx = ((box[0] + box[2]) / 2) / w  # normalized x
                cy = ((box[1] + box[3]) / 2) / h  # normalized y
                centroids.append((cx, cy))

        # Scene cut detection via histogram comparison
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(hist, hist)

        is_scene_cut = False
        if prev_hist is not None:
            correlation = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
            is_scene_cut = correlation < config.SCENE_CUT_THRESHOLD

        # Compute velocity
        vel = 0.0
        if prev_centroids is not None and not is_scene_cut and centroids and prev_centroids:
            vel = _match_and_compute_velocity(prev_centroids, centroids, config)

        timestamps.append(current_time)
        group_velocity.append(vel)
        dancer_counts.append(people_count)
        dancer_positions.append(centroids)

        prev_centroids = centroids
        prev_hist = hist
        current_time += config.SAMPLE_INTERVAL

    return {
        "timestamps": timestamps,
        "group_velocity": group_velocity,
        "dancer_counts": dancer_counts,
        "dancer_positions": dancer_positions,
    }


def _match_and_compute_velocity(
    prev_centroids: list[tuple], curr_centroids: list[tuple], config
) -> float:
    """
    Match dancers between consecutive frames using the Hungarian algorithm,
    compute mean displacement of matched pairs.

    Applies camera motion compensation: if the median displacement is large,
    subtract it (likely camera pan, not dancer movement).
    """
    from scipy.optimize import linear_sum_assignment

    n_prev = len(prev_centroids)
    n_curr = len(curr_centroids)

    if n_prev == 0 or n_curr == 0:
        return 0.0

    # Build cost matrix (Euclidean distance between all pairs)
    cost = np.zeros((n_prev, n_curr))
    for i, (px, py) in enumerate(prev_centroids):
        for j, (cx, cy) in enumerate(curr_centroids):
            cost[i, j] = np.sqrt((px - cx) ** 2 + (py - cy) ** 2)

    # Hungarian matching
    row_idx, col_idx = linear_sum_assignment(cost)

    # Collect displacements for matched pairs (exclude very large jumps = new/lost dancers)
    max_match_dist = 0.3  # normalized — 30% of frame diagonal is too far for one sample
    displacements = []
    for r, c in zip(row_idx, col_idx):
        d = cost[r, c]
        if d < max_match_dist:
            px, py = prev_centroids[r]
            cx, cy = curr_centroids[c]
            displacements.append((cx - px, cy - py, d))

    if not displacements:
        return 0.0

    # Camera motion compensation: subtract median displacement
    dx_arr = np.array([d[0] for d in displacements])
    dy_arr = np.array([d[1] for d in displacements])
    median_dx = np.median(dx_arr)
    median_dy = np.median(dy_arr)
    camera_motion = np.sqrt(median_dx**2 + median_dy**2)

    if camera_motion > config.CAMERA_MOTION_THRESHOLD:
        # Subtract camera motion from each dancer's displacement
        compensated = []
        for dx, dy, _ in displacements:
            comp_d = np.sqrt((dx - median_dx) ** 2 + (dy - median_dy) ** 2)
            compensated.append(comp_d)
        return float(np.mean(compensated))
    else:
        return float(np.mean([d[2] for d in displacements]))


def _compute_hull_stability(
    dancer_positions: list[list[tuple]], window: int = 5
) -> list[float]:
    """
    Compute convex hull area at each frame and stability score over a sliding window.

    Returns list of stability scores (higher = more stable), aligned with timestamps.
    """
    from scipy.spatial import ConvexHull

    hull_areas = []
    for positions in dancer_positions:
        if len(positions) >= 3:
            try:
                points = np.array(positions)
                hull = ConvexHull(points)
                hull_areas.append(hull.volume)  # 2D: volume = area
            except Exception:
                hull_areas.append(0.0)
        else:
            hull_areas.append(0.0)

    # Compute stability scores over sliding window
    hull_arr = np.array(hull_areas)
    n = len(hull_arr)
    stability = []

    for i in range(n):
        lo = max(0, i - window)
        hi = min(n, i + window + 1)
        segment = hull_arr[lo:hi]
        if len(segment) > 1 and np.any(segment > 0):
            variance = np.var(segment)
            # Scale factor: hull areas are small (normalized coords), so amplify variance
            score = 1.0 / (1.0 + variance * 1000.0)
        else:
            score = 0.0  # Not enough data
        stability.append(score)

    return stability


def _fuse_signals(
    phrase_boundaries: list[float] | None,
    timestamps: list[float],
    group_velocity: list[float],
    dancer_counts: list[int],
    hull_stability: list[float],
    dancer_positions: list[list[tuple]],
    config,
) -> list[dict]:
    """
    Combine audio phrase boundaries, velocity minima, and hull stability
    to produce confirmed formation timestamps. Then run a second pass
    to detect position swaps between confirmed formations.
    """
    if not timestamps:
        return []

    ts_arr = np.array(timestamps)
    vel_arr = np.array(group_velocity)
    count_arr = np.array(dancer_counts)
    hull_arr = np.array(hull_stability)

    confirmed = []

    if phrase_boundaries and len(phrase_boundaries) > 0:
        # Audio-guided mode: search near each phrase boundary
        for pb in phrase_boundaries:
            # Find the closest sample index to this phrase boundary
            idx = int(np.argmin(np.abs(ts_arr - pb)))

            # Search window around the phrase boundary
            win = config.VELOCITY_SEARCH_WINDOW
            lo = max(0, idx - win)
            hi = min(len(ts_arr), idx + win + 1)

            window_vel = vel_arr[lo:hi]
            if len(window_vel) == 0:
                continue

            # Find local velocity minimum in the window
            min_offset = int(np.argmin(window_vel))
            best_idx = lo + min_offset

            # Check dancer count
            if count_arr[best_idx] < config.MIN_PEOPLE_COUNT:
                continue

            # Build signals list
            signals = ["audio_phrase", "velocity_minimum"]

            # Check hull stability (optional confirmation)
            if hull_arr[best_idx] >= config.HULL_STABILITY_THRESHOLD:
                signals.append("hull_stable")
            elif hull_arr[best_idx] > 0:
                # Hull exists but not stable enough — still accept if audio + velocity agree
                pass
            # If hull is 0 (< 3 dancers), skip hull check entirely

            ts = round(float(ts_arr[best_idx]), 2)

            # Enforce minimum spacing
            if confirmed and ts - confirmed[-1]["timestamp"] < config.MIN_SPACING_BETWEEN:
                continue

            confirmed.append({"timestamp": ts, "signals": signals, "_idx": best_idx})

    else:
        # No audio — fallback to velocity minima detection
        confirmed = _velocity_only_detection(
            ts_arr, vel_arr, count_arr, hull_arr, config
        )

    # Second pass: detect position swaps between confirmed formations
    confirmed = _detect_swap_formations(
        confirmed, ts_arr, vel_arr, count_arr, hull_arr, dancer_positions, config
    )

    # Clean up internal index field
    for c in confirmed:
        c.pop("_idx", None)

    return confirmed


def _detect_swap_formations(
    confirmed: list[dict],
    ts_arr: np.ndarray,
    vel_arr: np.ndarray,
    count_arr: np.ndarray,
    hull_arr: np.ndarray,
    dancer_positions: list[list[tuple]],
    config,
) -> list[dict]:
    """
    Detect position swaps between consecutive confirmed formations.

    When dancers swap places, the hull shape barely changes and group velocity
    returns to near-zero quickly — so the main detector misses it. This function
    checks whether the *assignment* of dancers to positions has changed between
    consecutive formations by comparing who ended up where.

    For each gap between confirmed formations, it:
    1. Finds the velocity minimum in the gap (the "settled" moment after the swap)
    2. Compares dancer positions at that moment to the previous formation
    3. If enough dancers have swapped positions (permutation distance > threshold),
       inserts a new formation at that timestamp
    """
    from scipy.optimize import linear_sum_assignment

    if len(confirmed) < 1 or len(dancer_positions) == 0:
        return confirmed

    swap_threshold = config.SWAP_DETECTION_THRESHOLD
    min_spacing = config.MIN_SPACING_BETWEEN

    # Build list of (start_idx, end_idx) gaps between confirmed formations
    # Also check from last confirmed formation to end of video
    result = list(confirmed)
    insertions = []

    for i in range(len(confirmed)):
        # Get the index of this confirmed formation in the sample array
        curr_idx = confirmed[i].get("_idx")
        if curr_idx is None:
            curr_idx = int(np.argmin(np.abs(ts_arr - confirmed[i]["timestamp"])))

        # Determine the search range: from this formation to the next one (or end)
        if i + 1 < len(confirmed):
            next_idx = confirmed[i + 1].get("_idx")
            if next_idx is None:
                next_idx = int(np.argmin(np.abs(ts_arr - confirmed[i + 1]["timestamp"])))
            search_end = next_idx
        else:
            search_end = len(ts_arr)

        # Need at least a few samples gap to look for swaps
        if search_end - curr_idx < 5:
            continue

        ref_positions = dancer_positions[curr_idx]
        if len(ref_positions) < 2:
            continue

        # Scan through the gap looking for velocity valleys where positions changed
        gap_start = curr_idx + 2  # skip a couple samples after the confirmed formation
        gap_end = search_end

        # Find velocity minima in this gap
        gap_vel = vel_arr[gap_start:gap_end]
        if len(gap_vel) < 3:
            continue

        # Simple approach: find the lowest velocity point in the gap
        # that also has enough dancers and sufficient spacing
        min_local_idx = int(np.argmin(gap_vel))
        candidate_idx = gap_start + min_local_idx

        # Check spacing from both neighbors
        candidate_ts = float(ts_arr[candidate_idx])
        if candidate_ts - confirmed[i]["timestamp"] < min_spacing:
            continue
        if i + 1 < len(confirmed) and confirmed[i + 1]["timestamp"] - candidate_ts < min_spacing:
            continue

        # Check dancer count
        if count_arr[candidate_idx] < config.MIN_PEOPLE_COUNT:
            continue

        # Check if velocity is actually low (dancers have settled)
        if vel_arr[candidate_idx] > 0.02:  # still moving significantly
            continue

        # Now compare positions: compute permutation distance
        candidate_positions = dancer_positions[candidate_idx]
        if len(candidate_positions) < 2:
            continue

        perm_dist = _compute_permutation_distance(ref_positions, candidate_positions)

        if perm_dist >= swap_threshold:
            signals = ["position_swap", "velocity_minimum"]
            if hull_arr[candidate_idx] >= config.HULL_STABILITY_THRESHOLD:
                signals.append("hull_stable")

            insertions.append({
                "timestamp": round(candidate_ts, 2),
                "signals": signals,
                "_idx": candidate_idx,
                "_insert_after": i,
            })
            logger.info(
                f"Swap detected at {candidate_ts:.1f}s "
                f"(permutation distance: {perm_dist:.2f})"
            )

    # Insert swap formations into the result list (in reverse order to preserve indices)
    for ins in reversed(insertions):
        insert_pos = ins.pop("_insert_after") + 1
        result.insert(insert_pos, ins)

    return result


def _compute_permutation_distance(
    ref_positions: list[tuple], candidate_positions: list[tuple]
) -> float:
    """
    Compute how much the dancer arrangement has changed between two moments.

    Uses Hungarian matching to find the optimal assignment between the two
    sets of positions, then checks how many dancers ended up at a *different*
    dancer's previous position (i.e., the assignment is a non-identity permutation).

    Returns a value between 0.0 (identical arrangement) and 1.0 (everyone swapped).
    """
    from scipy.optimize import linear_sum_assignment

    n_ref = len(ref_positions)
    n_cand = len(candidate_positions)
    n = min(n_ref, n_cand)

    if n < 2:
        return 0.0

    # Build cost matrix: distance from each ref position to each candidate position
    cost = np.zeros((n_ref, n_cand))
    for i, (rx, ry) in enumerate(ref_positions):
        for j, (cx, cy) in enumerate(candidate_positions):
            cost[i, j] = np.sqrt((rx - cx) ** 2 + (ry - cy) ** 2)

    row_idx, col_idx = linear_sum_assignment(cost)

    # For each matched pair, check if the candidate is close to the ref's
    # original position (identity) or has moved to a different position (swap)
    #
    # A dancer has "swapped" if their matched candidate position is closer to
    # a DIFFERENT ref dancer's position than to their own.
    swap_count = 0
    swap_distance_threshold = 0.05  # normalized — positions within 5% are "same spot"

    for r, c in zip(row_idx, col_idx):
        if r >= n_ref or c >= n_cand:
            continue
        # Distance from this ref to its matched candidate
        matched_dist = cost[r, c]

        # If the dancer moved more than the threshold, check if they landed
        # near another ref dancer's position (indicating a swap)
        if matched_dist > swap_distance_threshold:
            # Check if this candidate position is close to any OTHER ref position
            for other_r in range(n_ref):
                if other_r == r:
                    continue
                dist_to_other = cost[other_r, c]
                if dist_to_other < swap_distance_threshold:
                    # This candidate is at another ref dancer's old position = swap
                    swap_count += 1
                    break
            else:
                # Dancer moved but not to another dancer's position — could be
                # a general rearrangement, still counts as a position change
                if matched_dist > swap_distance_threshold * 3:
                    swap_count += 1

    return swap_count / n if n > 0 else 0.0


def _velocity_only_detection(
    ts_arr: np.ndarray,
    vel_arr: np.ndarray,
    count_arr: np.ndarray,
    hull_arr: np.ndarray,
    config,
) -> list[dict]:
    """
    Fallback detection when no audio is available.
    Finds local minima of group velocity, confirmed by hull stability.
    """
    from scipy.signal import argrelmin

    if len(vel_arr) < 3:
        return []

    # Smooth velocity to reduce noise
    kernel_size = 3
    kernel = np.ones(kernel_size) / kernel_size
    smoothed = np.convolve(vel_arr, kernel, mode="same")

    # Find local minima (order=2 means minimum in a 5-sample window)
    minima_indices = argrelmin(smoothed, order=2)[0]

    if len(minima_indices) == 0:
        # If no local minima found, find the global minimum
        min_idx = int(np.argmin(smoothed))
        if count_arr[min_idx] >= config.MIN_PEOPLE_COUNT:
            return [{"timestamp": round(float(ts_arr[min_idx]), 2), "signals": ["velocity_minimum"], "_idx": int(min_idx)}]
        return []

    confirmed = []
    for idx in minima_indices:
        # Check dancer count
        if count_arr[idx] < config.MIN_PEOPLE_COUNT:
            continue

        signals = ["velocity_minimum"]

        # Check hull stability
        if hull_arr[idx] >= config.HULL_STABILITY_THRESHOLD:
            signals.append("hull_stable")

        ts = round(float(ts_arr[idx]), 2)

        # Enforce minimum spacing
        if confirmed and ts - confirmed[-1]["timestamp"] < config.MIN_SPACING_BETWEEN:
            continue

        confirmed.append({"timestamp": ts, "signals": signals, "_idx": int(idx)})

    return confirmed


# =============================================================================
# Legacy detection (fallback)
# =============================================================================


def _detect_formation_timestamps_legacy(cap, fps: float, duration: float) -> list[dict]:
    """
    Legacy detection using frame differencing + YOLO counting + edge-based scene cuts.
    Used as fallback if enhanced detection fails entirely.
    """
    from services.detector import _get_detect_model

    config = FormationDetectionConfig

    stable_timestamps = []
    prev_gray = None
    prev_edges = None
    stable_start = None
    stable_people_count = 0
    current_time = 0.0

    model = _get_detect_model()

    while current_time < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        edges = cv2.Canny(gray, 50, 150)

        results = model(frame, verbose=False, conf=config.YOLO_CONFIDENCE, classes=[0])[0]
        people_count = len(results.boxes) if results.boxes is not None else 0

        is_stable = False

        if prev_gray is not None and prev_edges is not None:
            diff = cv2.absdiff(prev_gray, gray)
            mean_diff = np.mean(diff)

            edge_diff = cv2.absdiff(prev_edges, edges)
            edge_change_ratio = np.count_nonzero(edge_diff) / edge_diff.size
            has_scene_cut = edge_change_ratio > config.EDGE_CHANGE_THRESHOLD

            is_stable = (
                mean_diff < config.MOTION_THRESHOLD
                and people_count >= config.MIN_PEOPLE_COUNT
                and not has_scene_cut
            )

            if is_stable:
                if stable_start is None:
                    stable_start = current_time
                    stable_people_count = people_count
                elif current_time - stable_start >= config.MIN_FORMATION_DURATION:
                    midpoint = stable_start + (current_time - stable_start) / 2
                    if (
                        not stable_timestamps
                        or midpoint - stable_timestamps[-1]["timestamp"]
                        >= config.MIN_SPACING_BETWEEN
                    ):
                        stable_timestamps.append(
                            {"timestamp": round(midpoint, 2), "signals": ["legacy_motion"]}
                        )
                        stable_start = None
            else:
                stable_start = None
                stable_people_count = 0

        prev_gray = gray
        prev_edges = edges
        current_time += config.SAMPLE_INTERVAL

    return stable_timestamps
