export interface AudioTrack {
  id: string;
  name: string;
  volume: number; // 0 to 1
  muted: boolean;
  solo: boolean;
  color: string;
  peaks?: number[]; // Waveform data for visualization
  albumArt?: string; // Data URL for album artwork
}

export interface TransportState {
  isPlaying: boolean;
  currentTime: number; // In seconds
  duration: number; // In seconds
  tempo: number; // BPM
}

export interface UIState {
  zoomLevel: number; // Pixels per second
  scrollOffset: number; // Pixels
}
