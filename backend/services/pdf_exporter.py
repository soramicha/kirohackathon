"""
PDF exporter for FormationAI.
Generates a multi-page PDF matching the FOCUS Blocking style:
- One formation per page
- Dark grid stage canvas with dancer dots + name labels
- Dancer roster (numbered list) on the left sidebar
- BACKSTAGE / AUDIENCE labels
- Optional comments section
"""

import json
from pathlib import Path
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.colors import HexColor

# ── Color palette ──────────────────────────────────────────────────────────────
BG_PAGE       = HexColor("#0d0f14")
BG_STAGE      = HexColor("#111318")
GRID_COLOR    = HexColor("#1a1d24")
BORDER_COLOR  = HexColor("#374151")
ACCENT_COLOR  = HexColor("#818cf8")  # corner accents
TEXT_LIGHT    = HexColor("#e5e7eb")
TEXT_DIM      = HexColor("#6b7280")
TEXT_LABEL    = HexColor("#9ca3af")
TITLE_COLOR   = HexColor("#ffffff")

DANCER_COLORS = [
    "#f97316", "#ec4899", "#14b8a6", "#a855f7", "#3b82f6",
    "#eab308", "#ef4444", "#22c55e", "#06b6d4", "#f43f5e",
    "#84cc16", "#8b5cf6", "#0ea5e9", "#d946ef", "#fb923c",
    "#10b981", "#6366f1", "#e11d48", "#0891b2", "#65a30d",
]

PAGE_W, PAGE_H = landscape(letter)  # 11 x 8.5 inches


def _dancer_color(dancer_id: int) -> HexColor:
    return HexColor(DANCER_COLORS[(dancer_id - 1) % len(DANCER_COLORS)])


def _draw_page_background(c):
    c.setFillColor(BG_PAGE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def _draw_title(c, formation_number: int, title: str):
    """Formation N title at top center."""
    c.setFillColor(TITLE_COLOR)
    c.setFont("Helvetica-Bold", 22)
    label = f"Formation {formation_number}"
    c.drawCentredString(PAGE_W / 2, PAGE_H - 0.55 * inch, label)

    # subtitle (video title, truncated)
    if title:
        c.setFont("Helvetica", 8)
        c.setFillColor(TEXT_DIM)
        short = title[:80] + "…" if len(title) > 80 else title
        c.drawCentredString(PAGE_W / 2, PAGE_H - 0.78 * inch, short)


def _draw_roster(c, dancers: list[dict], x: float, y: float, h: float):
    """Numbered dancer list on the left sidebar."""
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(TEXT_DIM)
    c.drawString(x, y + h + 0.1 * inch, "DANCERS")

    line_h = min(h / max(len(dancers), 1), 13)
    for i, d in enumerate(dancers):
        dy = y + h - (i + 1) * line_h
        color = _dancer_color(d["id"])

        # colored circle
        c.setFillColor(color)
        c.circle(x + 6, dy + 4, 5, fill=1, stroke=0)

        # number
        c.setFillColor(HexColor("#ffffff"))
        c.setFont("Helvetica-Bold", 5)
        c.drawCentredString(x + 6, dy + 2.5, str(d["id"]))

        # name
        c.setFillColor(TEXT_LABEL)
        c.setFont("Helvetica", 6.5)
        name = d.get("label", f"Dancer {d['id']}")
        # strip the zone suffix for cleaner roster
        if "(" in name:
            name = name.split("(")[0].strip()
        c.drawString(x + 14, dy + 2, name)


def _draw_comments(c, comments: str, x: float, y: float, w: float, h: float):
    """Optional comments box."""
    if not comments:
        return
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(TEXT_DIM)
    c.drawString(x, y + h + 0.1 * inch, "NOTES")

    c.setFont("Helvetica", 7)
    c.setFillColor(TEXT_LABEL)
    lines = comments.split("\n")
    line_y = y + h - 2
    for line in lines:
        if line_y < y:
            break
        c.drawString(x, line_y, line[:40])
        line_y -= 10


def _draw_stage(c, dancers: list[dict],
                sx: float, sy: float, sw: float, sh: float):
    """Dark grid stage with dancer dots."""
    PAD = 20  # points padding inside stage border

    # Stage background
    c.setFillColor(BG_STAGE)
    c.roundRect(sx, sy, sw, sh, 6, fill=1, stroke=0)

    # Grid lines
    c.setStrokeColor(GRID_COLOR)
    c.setLineWidth(0.5)
    grid = 40
    for gx in range(int(sx + PAD), int(sx + sw - PAD), grid):
        c.line(gx, sy + PAD, gx, sy + sh - PAD)
    for gy in range(int(sy + PAD), int(sy + sh - PAD), grid):
        c.line(sx + PAD, gy, sx + sw - PAD, gy)

    # Stage border
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(1)
    c.rect(sx + PAD, sy + PAD, sw - PAD * 2, sh - PAD * 2, fill=0, stroke=1)

    # Corner accents
    clen = 10
    c.setStrokeColor(ACCENT_COLOR)
    c.setLineWidth(2)
    corners = [
        (sx + PAD, sy + PAD),
        (sx + sw - PAD, sy + PAD),
        (sx + PAD, sy + sh - PAD),
        (sx + sw - PAD, sy + sh - PAD),
    ]
    for i, (cx, cy) in enumerate(corners):
        dx = 1 if i % 2 == 0 else -1
        dy = 1 if i < 2 else -1
        c.line(cx, cy, cx + dx * clen, cy)
        c.line(cx, cy, cx, cy + dy * clen)

    # BACKSTAGE / AUDIENCE labels
    c.setFont("Helvetica", 7)
    c.setFillColor(TEXT_DIM)
    c.drawCentredString(sx + sw / 2, sy + sh - 12, "BACKSTAGE")
    c.drawCentredString(sx + sw / 2, sy + 6, "AUDIENCE")
    c.drawCentredString(sx + 10, sy + sh / 2, "L")
    c.drawCentredString(sx + sw - 10, sy + sh / 2, "R")

    # Center mark X
    cx_mid = sx + sw / 2
    cy_mid = sy + sh / 2
    c.setStrokeColor(HexColor("#374151"))
    c.setLineWidth(1)
    c.line(cx_mid - 6, cy_mid - 6, cx_mid + 6, cy_mid + 6)
    c.line(cx_mid + 6, cy_mid - 6, cx_mid - 6, cy_mid + 6)

    # Dancer dots
    stage_x0 = sx + PAD
    stage_y0 = sy + PAD
    stage_w = sw - PAD * 2
    stage_h = sh - PAD * 2

    for d in dancers:
        nx = d.get("x_top", d.get("x", 0.5))
        ny = d.get("y_top", d.get("y", 0.5))

        # map normalized coords to stage pixels
        # y_top: 0 = back (top of stage), 1 = front (bottom) — direct mapping, no inversion
        px = stage_x0 + nx * stage_w
        py = stage_y0 + ny * stage_h

        # clamp
        r = 8
        px = max(stage_x0 + r, min(stage_x0 + stage_w - r, px))
        py = max(stage_y0 + r, min(stage_y0 + stage_h - r, py))

        color = _dancer_color(d["id"])

        # glow
        c.setFillColor(HexColor(color.hexval() if hasattr(color, 'hexval') else str(color)))
        c.setFillAlpha(0.15)
        c.circle(px, py, r * 2, fill=1, stroke=0)
        c.setFillAlpha(1.0)

        # dot
        c.setFillColor(color)
        c.circle(px, py, r, fill=1, stroke=0)

        # border
        c.setStrokeColor(HexColor("#ffffff"))
        c.setLineWidth(0.5)
        c.setStrokeAlpha(0.3)
        c.circle(px, py, r, fill=0, stroke=1)
        c.setStrokeAlpha(1.0)

        # number
        c.setFillColor(HexColor("#ffffff"))
        c.setFont("Helvetica-Bold", 6)
        c.drawCentredString(px, py - 2.5, str(d["id"]))

        # name label below dot
        name = d.get("label", f"D{d['id']}")
        if "(" in name:
            name = name.split("(")[0].strip()
        # shorten to last name / short name
        parts = name.replace("Dancer ", "").strip()
        c.setFillColor(TEXT_LABEL)
        c.setFont("Helvetica", 5)
        c.drawCentredString(px, py - r - 5, parts)


def generate_pdf(session_id: str, formations: list[dict],
                 metadata: dict, comments_map: dict = None) -> str:
    """
    Generate a multi-page PDF for all formations.
    Returns the path to the saved PDF.

    comments_map: optional dict of { formation_index -> comment_string }
    """
    session_dir = Path(f"sessions/{session_id}")
    session_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = session_dir / "formations.pdf"

    title = metadata.get("title", "Formation Plan")
    c = pdf_canvas.Canvas(str(pdf_path), pagesize=landscape(letter))
    c.setTitle(title)

    for i, formation in enumerate(formations):
        dancers = formation.get("dancers", [])
        comment = (comments_map or {}).get(i, "")

        _draw_page_background(c)
        _draw_title(c, i + 1, title)

        # Layout zones
        margin = 0.3 * inch
        top_y = PAGE_H - 1.0 * inch
        bottom_y = margin
        content_h = top_y - bottom_y

        roster_w = 1.1 * inch
        comments_w = 1.0 * inch if comment else 0
        sidebar_w = roster_w + comments_w + (0.1 * inch if comment else 0)

        stage_x = margin + sidebar_w + 0.1 * inch
        stage_y = bottom_y
        stage_w = PAGE_W - stage_x - margin
        stage_h = content_h

        # Draw roster
        _draw_roster(c, dancers, margin, bottom_y, content_h)

        # Draw comments if any
        if comment:
            _draw_comments(c, comment,
                           margin + roster_w + 0.1 * inch,
                           bottom_y, comments_w, content_h)

        # Draw stage
        _draw_stage(c, dancers, stage_x, stage_y, stage_w, stage_h)

        # Page number
        c.setFont("Helvetica", 8)
        c.setFillColor(TEXT_DIM)
        c.drawRightString(PAGE_W - margin, margin / 2, str(i + 1))

        c.showPage()

    c.save()
    return str(pdf_path)
