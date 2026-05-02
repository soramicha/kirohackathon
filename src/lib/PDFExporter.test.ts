/**
 * Unit tests for PDFExporter
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5
 *
 * Tests verify:
 *   - Returned Uint8Array starts with the PDF magic bytes (%PDF)
 *   - Cover page contains video title and dancer count
 *   - A timestamp with no Formation_Image produces a page with the fallback note
 *
 * Note: pdf-lib compresses content streams with FlateDecode, so text content
 * cannot be found by searching raw bytes. Instead we:
 *   1. Check magic bytes directly on the Uint8Array.
 *   2. Re-load the PDF with pdf-lib and inspect page count / structure.
 *   3. Decompress the raw PDF bytes to find uncompressed text literals for
 *      content that appears in uncompressed object dictionaries (e.g. font
 *      names, image dimensions) — or we spy on the drawText calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PDFExporter } from './PDFExporter';
import type { SessionStore } from '../store/SessionStore';
import type { Session } from '../types/index';

// ---------------------------------------------------------------------------
// Helpers — session fixture
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    videoTitle: 'Awesome Dance Performance',
    videoDurationSeconds: 300,
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    timestamps: [
      { id: 'ts-1', valueSeconds: 10, label: '00:00:10' },
      { id: 'ts-2', valueSeconds: 60, label: '00:01:00' },
    ],
    dancerProfiles: [
      {
        id: 'dancer-1',
        numericLabel: 1,
        customName: 'Alice',
        visualDescription: 'Dancer in red',
        thumbnailDataUrl: '',
      },
      {
        id: 'dancer-2',
        numericLabel: 2,
        customName: undefined,
        visualDescription: 'Dancer in blue',
        thumbnailDataUrl: '',
      },
      {
        id: 'dancer-3',
        numericLabel: 3,
        customName: 'Charlie',
        visualDescription: 'Dancer in green',
        thumbnailDataUrl: '',
      },
    ],
    environmentType: 'stage',
    depthCalibration: {
      homographyMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      environmentType: 'stage',
      confidence: 0.9,
      frameIndex: 0,
    },
    formations: [
      {
        timestampId: 'ts-1',
        timestampSeconds: 10,
        dancerPositions: [
          { dancerId: 'dancer-1', pixelCoordinate: [100, 200], floorCoordinate: [0.3, 0.5], absent: false },
          { dancerId: 'dancer-2', pixelCoordinate: [300, 200], floorCoordinate: [0.7, 0.5], absent: false },
          { dancerId: 'dancer-3', pixelCoordinate: [0, 0], floorCoordinate: [0, 0], absent: true },
        ],
        opfsFramePath: 'sessions/session-1/frames/ts-1.jpg',
        opfsFormationImagePath: 'sessions/session-1/formations/ts-1.png',
      },
      // ts-2 intentionally has NO formation entry (tests fallback note)
    ],
    opfsVideoPath: 'sessions/session-1/video.mp4',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal JPEG bytes (valid enough for pdf-lib to accept)
// A 1×1 white JPEG in minimal form.
// ---------------------------------------------------------------------------

const MINIMAL_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd2, 0x8a, 0x28, 0x03, 0xff, 0xd9,
]).buffer;

// ---------------------------------------------------------------------------
// Store mock factory
// ---------------------------------------------------------------------------

function makeStoreMock(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    writeVideo: vi.fn().mockResolvedValue(undefined),
    readVideo: vi.fn().mockResolvedValue(null),
    writeFrame: vi.fn().mockResolvedValue(undefined),
    readFrame: vi.fn().mockResolvedValue(MINIMAL_JPEG),
    writeFormationImage: vi.fn().mockResolvedValue(undefined),
    readFormationImage: vi.fn().mockResolvedValue(MINIMAL_JPEG),
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(null),
    listSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionStore;
}

// ---------------------------------------------------------------------------
// Stub browser APIs not available in jsdom
// ---------------------------------------------------------------------------

function stubBrowserApis() {
  // URL.createObjectURL / revokeObjectURL
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn().mockReturnValue('blob:mock'),
    revokeObjectURL: vi.fn(),
  });

  // document.createElement / body.appendChild / body.removeChild
  const mockAnchor = {
    href: '',
    download: '',
    style: { display: '' },
    click: vi.fn(),
  };
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return mockAnchor as unknown as HTMLElement;
    return document.createElement(tag);
  });
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PDFExporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubBrowserApis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // PDF magic bytes
  // -------------------------------------------------------------------------

  describe('PDF magic bytes', () => {
    it('returns a Uint8Array that starts with %PDF', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession();

      const bytes = await exporter.export(session);

      expect(bytes).toBeInstanceOf(Uint8Array);
      // %PDF in ASCII: 0x25 0x50 0x44 0x46
      expect(bytes[0]).toBe(0x25); // %
      expect(bytes[1]).toBe(0x50); // P
      expect(bytes[2]).toBe(0x44); // D
      expect(bytes[3]).toBe(0x46); // F
    });

    it('returns a non-empty Uint8Array', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);

      const bytes = await exporter.export(makeSession());

      expect(bytes.byteLength).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cover page content — verified via pdf-lib re-load + drawText spy
  // -------------------------------------------------------------------------

  describe('cover page', () => {
    it('PDF has a cover page plus one page per timestamp (3 pages total)', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      // 2 timestamps → 1 cover + 2 timestamp pages = 3
      const session = makeSession();

      const bytes = await exporter.export(session);
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(3);
    });

    it('cover page is the first page', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);

      const bytes = await exporter.export(makeSession());
      const loaded = await PDFDocument.load(bytes);

      // Cover page exists (page index 0)
      expect(loaded.getPage(0)).toBeDefined();
    });

    it('drawText is called with the video title during export', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession({ videoTitle: 'My Unique Dance Show' });

      // Spy on PDFDocument.addPage to intercept pages and spy on drawText
      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis(); // re-stub after restoreAllMocks

      expect(drawnTexts).toContain('My Unique Dance Show');
    });

    it('drawText is called with the dancer count string during export', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      // 3 dancers in the fixture
      const session = makeSession();

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis();

      // Cover page renders "Total Dancers" label and the count "3"
      expect(drawnTexts).toContain('Total Dancers');
      expect(drawnTexts).toContain('3');
    });

    it('drawText is called with "Exported on" during export', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(makeSession());

      vi.restoreAllMocks();
      stubBrowserApis();

      expect(drawnTexts.some((t) => t.startsWith('Exported on'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp pages
  // -------------------------------------------------------------------------

  describe('timestamp pages', () => {
    it('PDF has one page per timestamp beyond the cover', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession(); // 2 timestamps

      const bytes = await exporter.export(session);
      const loaded = await PDFDocument.load(bytes);

      // 1 cover + 2 timestamp pages
      expect(loaded.getPageCount()).toBe(1 + session.timestamps.length);
    });

    it('reads frame from store for each timestamp', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession();

      await exporter.export(session);

      expect(store.readFrame).toHaveBeenCalledWith(session.id, 'ts-1');
      expect(store.readFrame).toHaveBeenCalledWith(session.id, 'ts-2');
    });

    it('reads formation image from store for timestamps that have a formation', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession();

      await exporter.export(session);

      // ts-1 has a formation entry
      expect(store.readFormationImage).toHaveBeenCalledWith(session.id, 'ts-1');
    });

    it('drawText is called with timestamp labels during export', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession();

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis();

      expect(drawnTexts.some((t) => t.includes('00:00:10'))).toBe(true);
      expect(drawnTexts.some((t) => t.includes('00:01:00'))).toBe(true);
    });

    it('drawText is called with dancer names during export', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession();

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis();

      // Alice has a customName
      expect(drawnTexts.some((t) => t.includes('Alice'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback note for missing Formation_Image
  // -------------------------------------------------------------------------

  describe('fallback note for missing formation', () => {
    it('drawText is called with fallback text when formation entry is absent', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      // Session with no formations at all — every timestamp page gets the fallback
      const session = makeSession({ formations: [] });

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis();

      expect(drawnTexts).toContain('could not be generated');
    });

    it('drawText is called with fallback text when formation image buffer is null', async () => {
      const store = makeStoreMock({
        readFormationImage: vi.fn().mockResolvedValue(null),
      });
      const exporter = new PDFExporter(store);
      // ts-2 has no formation entry; ts-1 has one but readFormationImage returns null
      const session = makeSession();

      const drawnTexts: string[] = [];
      const { PDFDocument: RealPDFDoc } = await import('pdf-lib');
      const origAddPage = RealPDFDoc.prototype.addPage;
      vi.spyOn(RealPDFDoc.prototype, 'addPage').mockImplementation(function (this: PDFDocument, ...args) {
        const page = origAddPage.apply(this, args as Parameters<typeof origAddPage>);
        const origDrawText = page.drawText.bind(page);
        vi.spyOn(page, 'drawText').mockImplementation((text: string, opts) => {
          drawnTexts.push(text);
          return origDrawText(text, opts);
        });
        return page;
      });

      await exporter.export(session);

      vi.restoreAllMocks();
      stubBrowserApis();

      expect(drawnTexts).toContain('could not be generated');
    });

    it('still produces a valid PDF when formation image buffer is empty', async () => {
      const store = makeStoreMock({
        readFormationImage: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      });
      const exporter = new PDFExporter(store);

      const bytes = await exporter.export(makeSession());

      // Should still be a valid PDF
      expect(bytes[0]).toBe(0x25); // %
      expect(bytes[1]).toBe(0x50); // P
    });

    it('still produces a valid PDF when frame buffer is null', async () => {
      const store = makeStoreMock({
        readFrame: vi.fn().mockResolvedValue(null),
      });
      const exporter = new PDFExporter(store);

      const bytes = await exporter.export(makeSession());

      expect(bytes[0]).toBe(0x25);
      expect(bytes[1]).toBe(0x50);
    });
  });

  // -------------------------------------------------------------------------
  // Download trigger
  // -------------------------------------------------------------------------

  describe('download trigger', () => {
    it('triggers a browser download via URL.createObjectURL', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);

      await exporter.export(makeSession());

      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('creates an anchor element for the download', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);

      await exporter.export(makeSession({ videoTitle: 'My Dance Show' }));

      expect(document.createElement).toHaveBeenCalledWith('a');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('produces a valid PDF for a session with no timestamps', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession({ timestamps: [], formations: [] });

      const bytes = await exporter.export(session);

      expect(bytes[0]).toBe(0x25); // %
      expect(bytes[1]).toBe(0x50); // P
      expect(bytes[2]).toBe(0x44); // D
      expect(bytes[3]).toBe(0x46); // F
    });

    it('PDF has only the cover page when there are no timestamps', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession({ timestamps: [], formations: [] });

      const bytes = await exporter.export(session);
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(1);
    });

    it('produces a valid PDF for a session with no dancer profiles', async () => {
      const store = makeStoreMock();
      const exporter = new PDFExporter(store);
      const session = makeSession({ dancerProfiles: [], formations: [] });

      const bytes = await exporter.export(session);

      expect(bytes[0]).toBe(0x25);
    });
  });
});
