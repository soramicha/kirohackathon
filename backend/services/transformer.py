import cv2
import numpy as np
import json
from pathlib import Path

# Top-down canvas dimensions (pixels)
CANVAS_W = 800
CANVAS_H = 600
DANCER_RADIUS = 14
FONT = cv2.FONT_HERSHEY_SIMPLEX


def generate_topdown(session_id: str, frame_id: str, dancers: list[dict]) -> str:
    """
    Generate a top-down formation diagram from detected dancer positions.

    Uses a simple perspective approximation:
    - Dancers higher in the frame (smaller y) are further away → compressed vertically
    - Applies a homography based on assumed floor plane

    Returns the relative path to the saved top-down JPEG.
    """
    session_dir = Path(f"sessions/{session_id}")
    frame_path = session_dir / "frames" / f"{frame_id}.jpg"
    out_dir = session_dir / "formations"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{frame_id}_topdown.jpg"

    img = cv2.imread(str(frame_path))
    h, w = img.shape[:2]

    # Estimate homography from assumed stage floor corners
    # These are approximate — the bottom of the frame maps to the front of the stage,
    # the top maps to the back. User can calibrate with stage dimensions later.
    src_pts = np.float32([
        [w * 0.1, h * 0.9],   # bottom-left (front-left of stage)
        [w * 0.9, h * 0.9],   # bottom-right (front-right of stage)
        [w * 0.75, h * 0.3],  # top-right (back-right of stage)
        [w * 0.25, h * 0.3],  # top-left (back-left of stage)
    ])

    dst_pts = np.float32([
        [0, CANVAS_H],           # bottom-left
        [CANVAS_W, CANVAS_H],    # bottom-right
        [CANVAS_W, 0],           # top-right
        [0, 0],                  # top-left
    ])

    H, _ = cv2.findHomography(src_pts, dst_pts)

    # Create clean canvas
    canvas = np.ones((CANVAS_H, CANVAS_W, 3), dtype=np.uint8) * 245

    # Draw stage outline
    cv2.rectangle(canvas, (20, 20), (CANVAS_W - 20, CANVAS_H - 20), (200, 200, 200), 2)
    cv2.putText(canvas, "STAGE (TOP VIEW)", (CANVAS_W // 2 - 80, 15),
                FONT, 0.4, (150, 150, 150), 1)
    cv2.putText(canvas, "FRONT", (CANVAS_W // 2 - 20, CANVAS_H - 5),
                FONT, 0.4, (150, 150, 150), 1)
    cv2.putText(canvas, "BACK", (CANVAS_W // 2 - 15, 35),
                FONT, 0.4, (150, 150, 150), 1)

    # Map each dancer's foot position through the homography
    colors = _generate_colors(len(dancers))

    for dancer in dancers:
        # Use the bottom-center of the bounding box as the foot position
        if dancer.get("bbox"):
            x1, y1, x2, y2 = dancer["bbox"]
            foot_x = (x1 + x2) / 2
            foot_y = float(y2)
        else:
            foot_x = dancer["x"] * w
            foot_y = dancer["y"] * h

        # Apply homography
        pt = np.float32([[foot_x, foot_y]])
        pt_transformed = cv2.perspectiveTransform(pt.reshape(1, 1, 2), H)
        tx, ty = int(pt_transformed[0][0][0]), int(pt_transformed[0][0][1])

        # Clamp to canvas
        tx = max(DANCER_RADIUS, min(CANVAS_W - DANCER_RADIUS, tx))
        ty = max(DANCER_RADIUS, min(CANVAS_H - DANCER_RADIUS, ty))

        color = colors[dancer["id"] - 1 % len(colors)]

        # Draw dancer dot
        cv2.circle(canvas, (tx, ty), DANCER_RADIUS, color, -1)
        cv2.circle(canvas, (tx, ty), DANCER_RADIUS, (50, 50, 50), 1)

        # Draw dancer ID
        label = str(dancer["id"])
        text_size = cv2.getTextSize(label, FONT, 0.4, 1)[0]
        cv2.putText(canvas, label,
                    (tx - text_size[0] // 2, ty + text_size[1] // 2),
                    FONT, 0.4, (255, 255, 255), 1)

        # Store transformed position back into dancer dict
        dancer["x_top"] = round(tx / CANVAS_W, 4)
        dancer["y_top"] = round(ty / CANVAS_H, 4)

    cv2.imwrite(str(out_path), canvas)

    return str(out_path.relative_to(session_dir))


def _generate_colors(n: int) -> list[tuple]:
    """Generate n visually distinct BGR colors."""
    colors = []
    for i in range(n):
        hue = int(180 * i / max(n, 1))
        hsv = np.uint8([[[hue, 220, 200]]])
        bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0][0]
        colors.append((int(bgr[0]), int(bgr[1]), int(bgr[2])))
    return colors
