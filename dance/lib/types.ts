// Data models based on PRD

export interface Video {
  id: string;
  source_url: string;
  title: string;
  created_at: string;
}

export interface Person {
  id: number;
  formation_id?: string;
  label: string; // AI-generated
  display_name?: string; // user-defined
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  stage_x?: number;
  stage_y?: number;
}

export interface Formation {
  id: string;
  video_id: string;
  timestamp_sec: number;
  screenshot_url?: string;
  formation_image_url?: string;
  people: Person[];
  stage_corners?: { x: number; y: number }[];
}

export interface ProcessingResult {
  frame: number;
  timestamp_sec: number;
  people: Person[];
  screenshot_url?: string;
}
