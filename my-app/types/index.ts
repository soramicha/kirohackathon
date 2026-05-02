export interface TimestampEntry {
  id: string;
  time: string;
  label: string;
}

export interface TimestampSession {
  id: string;
  url: string;
  timestamps: TimestampEntry[];
  createdAt: string;
}
