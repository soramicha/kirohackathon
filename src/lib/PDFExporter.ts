/**
 * PDFExporter — assembles a PDF report from session data using pdf-lib.
 *
 * Structure:
 *   Page 1 (cover): video title, YouTube URL, total dancer count, export date
 *   One page per timestamp: extracted frame image, Formation_Image (or fallback
 *     note if unavailable), dancer identifier/name list, timestamp value
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Session, Formation, DancerProfile, Timestamp } from '../types/index';
import type { SessionStore } from '../store/SessionStore';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** US Letter in points (72 pt = 1 inch). */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Vertical spacing between elements. */
const LINE_HEIGHT = 16;
const SECTION_GAP = 24;

/** Maximum image dimensions on a timestamp page. */
const IMAGE_MAX_WIDTH = CONTENT_WIDTH / 2 - 8;
const IMAGE_MAX_HEIGHT = 220;

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const COLOR_HEADING = rgb(0.05, 0.05, 0.15);
const COLOR_BODY = rgb(0.2, 0.2, 0.2);
const COLOR_MUTED = rgb(0.5, 0.5, 0.5);
const COLOR_ACCENT = rgb(0.29, 0.56, 0.85);
const COLOR_DIVIDER = rgb(0.85, 0.85, 0.88);

// ---------------------------------------------------------------------------
// PDFExporter class
// ---------------------------------------------------------------------------

export class PDFExporter {
  private readonly store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  // -------------------------------------------------------------------------
  // export
  // -------------------------------------------------------------------------

  /**
   * Generates a PDF report for the given session.
   *
   * - Page 1: cover page with video title, URL, dancer count, export date.
   * - One page per timestamp: frame image + formation image (or fallback note),
   *   dancer list, and timestamp value.
   *
   * Triggers a browser download with filename `{videoTitle}_{exportDate}.pdf`.
   *
   * @returns The raw PDF bytes as a Uint8Array.
   */
  async export(session: Session): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await doc.embedFont(StandardFonts.Helvetica);

    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // -----------------------------------------------------------------------
    // Cover page
    // -----------------------------------------------------------------------
    await this.drawCoverPage(doc, boldFont, regularFont, session, exportDate);

    // -----------------------------------------------------------------------
    // One page per timestamp
    // -----------------------------------------------------------------------
    for (const timestamp of session.timestamps) {
      const formation = session.formations.find((f) => f.timestampId === timestamp.id) ?? null;
      await this.drawTimestampPage(
        doc,
        boldFont,
        regularFont,
        session,
        timestamp,
        formation,
      );
    }

    const pdfBytes = await doc.save();

    // Trigger browser download
    triggerDownload(
      pdfBytes,
      buildFilename(session.videoTitle, exportDate),
    );

    return pdfBytes;
  }

  // -------------------------------------------------------------------------
  // Cover page
  // -------------------------------------------------------------------------

  private async drawCoverPage(
    doc: PDFDocument,
    boldFont: PDFFont,
    regularFont: PDFFont,
    session: Session,
    exportDate: string,
  ): Promise<void> {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    // Accent bar at top
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 6,
      width: PAGE_WIDTH,
      height: 6,
      color: COLOR_ACCENT,
    });

    y -= 40;

    // App name / report label
    drawText(page, 'Dance Formation Report', {
      x: MARGIN,
      y,
      font: boldFont,
      size: 28,
      color: COLOR_HEADING,
    });

    y -= SECTION_GAP + 8;

    // Divider
    drawDivider(page, y);
    y -= SECTION_GAP;

    // Video title
    drawText(page, 'Video', {
      x: MARGIN,
      y,
      font: boldFont,
      size: 11,
      color: COLOR_MUTED,
    });
    y -= LINE_HEIGHT + 2;
    drawWrappedText(page, session.videoTitle, {
      x: MARGIN,
      y,
      font: boldFont,
      size: 18,
      color: COLOR_HEADING,
      maxWidth: CONTENT_WIDTH,
    });
    y -= LINE_HEIGHT * 2 + SECTION_GAP;

    // YouTube URL
    drawText(page, 'YouTube URL', {
      x: MARGIN,
      y,
      font: boldFont,
      size: 11,
      color: COLOR_MUTED,
    });
    y -= LINE_HEIGHT + 2;
    drawWrappedText(page, session.youtubeUrl, {
      x: MARGIN,
      y,
      font: regularFont,
      size: 11,
      color: COLOR_BODY,
      maxWidth: CONTENT_WIDTH,
    });
    y -= LINE_HEIGHT + SECTION_GAP;

    // Stats row
    const stats: Array<{ label: string; value: string }> = [
      { label: 'Total Dancers', value: String(session.dancerProfiles.length) },
      { label: 'Timestamps', value: String(session.timestamps.length) },
      { label: 'Environment', value: capitalise(session.environmentType) },
    ];

    for (const stat of stats) {
      drawText(page, stat.label, {
        x: MARGIN,
        y,
        font: boldFont,
        size: 11,
        color: COLOR_MUTED,
      });
      y -= LINE_HEIGHT + 2;
      drawText(page, stat.value, {
        x: MARGIN,
        y,
        font: boldFont,
        size: 16,
        color: COLOR_HEADING,
      });
      y -= LINE_HEIGHT + SECTION_GAP;
    }

    // Divider
    drawDivider(page, y);
    y -= SECTION_GAP;

    // Export date
    drawText(page, `Exported on ${exportDate}`, {
      x: MARGIN,
      y,
      font: regularFont,
      size: 10,
      color: COLOR_MUTED,
    });
  }

  // -------------------------------------------------------------------------
  // Timestamp page
  // -------------------------------------------------------------------------

  private async drawTimestampPage(
    doc: PDFDocument,
    boldFont: PDFFont,
    regularFont: PDFFont,
    session: Session,
    timestamp: Timestamp,
    formation: Formation | null,
  ): Promise<void> {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    // Page header — timestamp label
    drawText(page, `Formation at ${timestamp.label}`, {
      x: MARGIN,
      y,
      font: boldFont,
      size: 18,
      color: COLOR_HEADING,
    });
    y -= LINE_HEIGHT + 4;
    drawDivider(page, y);
    y -= SECTION_GAP;

    // -----------------------------------------------------------------------
    // Images row: frame (left) + formation (right)
    // -----------------------------------------------------------------------

    const imageRowY = y;
    let imageRowHeight = 0;

    // Left: extracted frame
    const frameBuffer = await this.store.readFrame(session.id, timestamp.id);
    if (frameBuffer && frameBuffer.byteLength > 0) {
      try {
        const { image, dims } = await embedImage(doc, frameBuffer);
        const scaled = scaleDimensions(dims.width, dims.height, IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT);
        page.drawImage(image, {
          x: MARGIN,
          y: imageRowY - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
        imageRowHeight = Math.max(imageRowHeight, scaled.height);

        // Caption
        drawText(page, 'Extracted Frame', {
          x: MARGIN,
          y: imageRowY - scaled.height - LINE_HEIGHT,
          font: regularFont,
          size: 9,
          color: COLOR_MUTED,
        });
      } catch {
        // Image embed failed — draw placeholder text
        drawText(page, '[Frame image unavailable]', {
          x: MARGIN,
          y: imageRowY - LINE_HEIGHT,
          font: regularFont,
          size: 10,
          color: COLOR_MUTED,
        });
        imageRowHeight = Math.max(imageRowHeight, LINE_HEIGHT);
      }
    } else {
      drawText(page, '[No frame extracted]', {
        x: MARGIN,
        y: imageRowY - LINE_HEIGHT,
        font: regularFont,
        size: 10,
        color: COLOR_MUTED,
      });
      imageRowHeight = Math.max(imageRowHeight, LINE_HEIGHT);
    }

    // Right: formation image or fallback note
    const formationImageX = MARGIN + IMAGE_MAX_WIDTH + 16;

    if (formation) {
      const formationBuffer = await this.store.readFormationImage(session.id, timestamp.id);
      if (formationBuffer && formationBuffer.byteLength > 0) {
        try {
          const { image, dims } = await embedImage(doc, formationBuffer);
          const scaled = scaleDimensions(dims.width, dims.height, IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT);
          page.drawImage(image, {
            x: formationImageX,
            y: imageRowY - scaled.height,
            width: scaled.width,
            height: scaled.height,
          });
          imageRowHeight = Math.max(imageRowHeight, scaled.height);

          drawText(page, 'Formation Diagram', {
            x: formationImageX,
            y: imageRowY - scaled.height - LINE_HEIGHT,
            font: regularFont,
            size: 9,
            color: COLOR_MUTED,
          });
        } catch {
          drawFormationFallback(page, regularFont, formationImageX, imageRowY);
          imageRowHeight = Math.max(imageRowHeight, LINE_HEIGHT * 3);
        }
      } else {
        drawFormationFallback(page, regularFont, formationImageX, imageRowY);
        imageRowHeight = Math.max(imageRowHeight, LINE_HEIGHT * 3);
      }
    } else {
      drawFormationFallback(page, regularFont, formationImageX, imageRowY);
      imageRowHeight = Math.max(imageRowHeight, LINE_HEIGHT * 3);
    }

    // Advance past images + captions
    y = imageRowY - imageRowHeight - LINE_HEIGHT * 2 - SECTION_GAP;

    // -----------------------------------------------------------------------
    // Dancer list
    // -----------------------------------------------------------------------
    drawDivider(page, y);
    y -= SECTION_GAP;

    drawText(page, 'Dancers', {
      x: MARGIN,
      y,
      font: boldFont,
      size: 12,
      color: COLOR_HEADING,
    });
    y -= LINE_HEIGHT + 4;

    const presentDancers = formation
      ? formation.dancerPositions.filter((dp) => !dp.absent)
      : [];

    if (presentDancers.length === 0 && session.dancerProfiles.length === 0) {
      drawText(page, 'No dancer data available.', {
        x: MARGIN,
        y,
        font: regularFont,
        size: 10,
        color: COLOR_MUTED,
      });
    } else {
      // Use present dancers if available, otherwise list all profiles
      const dancerIds =
        presentDancers.length > 0
          ? presentDancers.map((dp) => dp.dancerId)
          : session.dancerProfiles.map((p) => p.id);

      const columns = 3;
      const colWidth = CONTENT_WIDTH / columns;

      dancerIds.forEach((id, index) => {
        const profile = session.dancerProfiles.find((p) => p.id === id);
        const label = profile
          ? (profile.customName ?? `Dancer ${profile.numericLabel}`)
          : id;
        const numLabel = profile ? `#${profile.numericLabel}` : '';

        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = MARGIN + col * colWidth;
        const entryY = y - row * (LINE_HEIGHT + 4);

        drawText(page, `${numLabel} ${label}`.trim(), {
          x,
          y: entryY,
          font: regularFont,
          size: 10,
          color: COLOR_BODY,
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — drawing
// ---------------------------------------------------------------------------

interface TextOptions {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
}

function drawText(page: PDFPage, text: string, opts: TextOptions): void {
  page.drawText(text, {
    x: opts.x,
    y: opts.y,
    font: opts.font,
    size: opts.size,
    color: opts.color,
  });
}

/**
 * Draws text that wraps at maxWidth by splitting on spaces.
 * Returns the y position after the last line.
 */
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: TextOptions & { maxWidth: number },
): number {
  const words = text.split(' ');
  let line = '';
  let y = opts.y;

  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    const width = opts.font.widthOfTextAtSize(candidate, opts.size);
    if (width > opts.maxWidth && line.length > 0) {
      drawText(page, line, { ...opts, y });
      y -= opts.size + 4;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) {
    drawText(page, line, { ...opts, y });
    y -= opts.size + 4;
  }
  return y;
}

function drawDivider(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: COLOR_DIVIDER,
  });
}

function drawFormationFallback(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
): void {
  drawText(page, 'Formation diagram', {
    x,
    y,
    font,
    size: 10,
    color: COLOR_MUTED,
  });
  drawText(page, 'could not be generated', {
    x,
    y: y - LINE_HEIGHT,
    font,
    size: 10,
    color: COLOR_MUTED,
  });
  drawText(page, 'for this timestamp.', {
    x,
    y: y - LINE_HEIGHT * 2,
    font,
    size: 10,
    color: COLOR_MUTED,
  });
}

// ---------------------------------------------------------------------------
// Helpers — image embedding
// ---------------------------------------------------------------------------

interface EmbedResult {
  image: Awaited<ReturnType<PDFDocument['embedJpg']>>;
  dims: { width: number; height: number };
}

/**
 * Attempts to embed an image buffer as JPEG first, then PNG.
 * Throws if neither format succeeds.
 */
async function embedImage(doc: PDFDocument, buffer: ArrayBuffer): Promise<EmbedResult> {
  const bytes = new Uint8Array(buffer);

  // JPEG magic bytes: FF D8
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const image = await doc.embedJpg(bytes);
    return { image, dims: image.scale(1) };
  }

  // PNG magic bytes: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const image = await doc.embedPng(bytes);
    return { image, dims: image.scale(1) };
  }

  // Try PNG as fallback (formation images are always PNG)
  try {
    const image = await doc.embedPng(bytes);
    return { image, dims: image.scale(1) };
  } catch {
    // Try JPEG as last resort
    const image = await doc.embedJpg(bytes);
    return { image, dims: image.scale(1) };
  }
}

/**
 * Scales width × height to fit within maxWidth × maxHeight while preserving
 * the aspect ratio.
 */
function scaleDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width === 0 || height === 0) return { width: maxWidth, height: maxHeight };

  const scaleW = maxWidth / width;
  const scaleH = maxHeight / height;
  const scale = Math.min(scaleW, scaleH, 1); // never upscale

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

// ---------------------------------------------------------------------------
// Helpers — download
// ---------------------------------------------------------------------------

/**
 * Triggers a browser file download for the given bytes.
 */
function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Builds a safe filename from the video title and export date.
 * Replaces non-alphanumeric characters with underscores.
 */
function buildFilename(videoTitle: string, exportDate: string): string {
  const safeTitle = videoTitle.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const safeDate = exportDate.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safeTitle}_${safeDate}.pdf`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

import { sessionStore } from '../store/SessionStore';

export const pdfExporter = new PDFExporter(sessionStore);
