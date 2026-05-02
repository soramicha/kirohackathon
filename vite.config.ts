import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ---------------------------------------------------------------------------
// Minimal JPEG bytes (1×1 white pixel) used as stub frame/video data
// ---------------------------------------------------------------------------
const MINIMAL_JPEG = Buffer.from([
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
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xfb, 0xd2, 0x8a, 0x28, 0x03, 0xff, 0xd9,
])

// ---------------------------------------------------------------------------
// Vite plugin: stub Vercel Python API routes during local development
// ---------------------------------------------------------------------------
function apiStubPlugin(): Plugin {
  return {
    name: 'api-stub',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''

        // ------------------------------------------------------------------
        // POST /api/download — return a stub video binary with metadata headers
        // ------------------------------------------------------------------
        if (url === '/api/download' && req.method === 'POST') {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'X-Video-Title': 'Local Dev Video',
            'X-Video-Duration': '120',
            'Access-Control-Expose-Headers': 'X-Video-Title, X-Video-Duration',
          })
          res.end(MINIMAL_JPEG)
          return
        }

        // ------------------------------------------------------------------
        // POST /api/extract-frames — return a multipart response with stub frames
        // ------------------------------------------------------------------
        if (url === '/api/extract-frames' && req.method === 'POST') {
          const boundary = 'dev-stub-boundary'
          const part =
            `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n` +
            MINIMAL_JPEG.toString('binary') +
            '\r\n'
          // Return two frames (enough for any timestamp count in dev)
          const body = Buffer.from(part + part + `--${boundary}--`, 'binary')
          res.writeHead(200, {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(body.length),
          })
          res.end(body)
          return
        }

        // ------------------------------------------------------------------
        // POST /api/pose — return two stub dancer tracks
        // ------------------------------------------------------------------
        if (url === '/api/pose' && req.method === 'POST') {
          const payload = JSON.stringify({
            tracks: [
              {
                trackId: 'dancer-1',
                detections: [
                  { frameIndex: 0, bbox: [10, 10, 80, 200], keypoints: [], centroid: [45, 105] },
                  { frameIndex: 1, bbox: [10, 10, 80, 200], keypoints: [], centroid: [45, 105] },
                ],
              },
              {
                trackId: 'dancer-2',
                detections: [
                  { frameIndex: 0, bbox: [200, 10, 280, 200], keypoints: [], centroid: [240, 105] },
                  { frameIndex: 1, bbox: [200, 10, 280, 200], keypoints: [], centroid: [240, 105] },
                ],
              },
            ],
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(payload)
          return
        }

        // ------------------------------------------------------------------
        // POST /api/depth — return a stub depth map
        // ------------------------------------------------------------------
        if (url === '/api/depth' && req.method === 'POST') {
          const payload = JSON.stringify({
            depthMap: Array.from({ length: 8 }, () => Array(8).fill(0.5)),
            width: 1280,
            height: 720,
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(payload)
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiStubPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
