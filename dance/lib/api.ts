// API client functions for communicating with backend

import { Person, Formation } from './types';

const API_BASE = '/api';

export interface ProcessFrameRequest {
  video_id: string;
  timestamp: number;
}

export interface ProcessFrameResponse {
  frame: number;
  timestamp_sec: number;
  screenshot_url: string;
  people: Person[];
}

export interface GenerateFormationRequest {
  video_id: string;
  timestamp: number;
  people: Person[];
  stage_corners: { x: number; y: number }[];
}

export interface GenerateFormationResponse {
  formation: Formation;
}

/**
 * Process a video frame at a specific timestamp
 */
export async function processFrame(
  request: ProcessFrameRequest
): Promise<ProcessFrameResponse> {
  const response = await fetch(`${API_BASE}/process-frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to process frame: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Generate formation visualization with stage mapping
 */
export async function generateFormation(
  request: GenerateFormationRequest
): Promise<GenerateFormationResponse> {
  const response = await fetch(`${API_BASE}/generate-formation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate formation: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Export formation as PDF (future enhancement)
 */
export async function exportFormationPDF(formationId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/export-pdf/${formationId}`);

  if (!response.ok) {
    throw new Error(`Failed to export PDF: ${response.statusText}`);
  }

  return response.blob();
}
