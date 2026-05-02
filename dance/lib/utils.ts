// Utility functions

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Format timestamp in seconds to MM:SS format
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compute homography matrix from 4 point correspondences
 * This is a simplified version - the actual computation should be done in the backend
 */
export function computeHomography(
  srcPoints: { x: number; y: number }[],
  dstPoints: { x: number; y: number }[]
): number[][] {
  // Placeholder - actual implementation should use OpenCV in Python backend
  // Returns identity matrix for now
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

/**
 * Map image coordinates to stage coordinates using homography
 */
export function mapToStageCoordinates(
  x: number,
  y: number,
  homography: number[][]
): { x: number; y: number } {
  // Placeholder - actual implementation should be done in backend
  // Returns normalized coordinates for now
  return { x: x / 800, y: y / 600 };
}
