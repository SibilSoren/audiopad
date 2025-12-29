import { loadAudioBuffer } from './AudioUtils';

interface TrackNode {
  gainNode: GainNode;
  buffer: AudioBuffer;
  source?: AudioBufferSourceNode;
}

export class AudioEngine {
  private static instance: AudioEngine;
  private audioContext: AudioContext;
  
  // Track state with GainNodes
  private tracks: Map<string, TrackNode> = new Map();
  
  // Playback state
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pausedAt: number = 0;

  private constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // --- Track Management ---
  public async loadTrack(id: string, url: string): Promise<AudioBuffer> {
    const buffer = await loadAudioBuffer(this.audioContext, url);
    
    // Create a GainNode for this track
    const gainNode = this.audioContext.createGain();
    gainNode.connect(this.audioContext.destination);
    
    this.tracks.set(id, { gainNode, buffer });
    return buffer;
  }
  
  public removeTrack(id: string) {
    const track = this.tracks.get(id);
    if (track) {
      track.source?.stop();
      track.gainNode.disconnect();
      this.tracks.delete(id);
    }
  }

  // --- Transport Control ---
  public play() {
    if (this.isPlaying) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.startTime = this.audioContext.currentTime - this.pausedAt;
    
    // Create and start sources for all tracks
    this.tracks.forEach((track, id) => {
      this.createAndStartSource(id, track);
    });

    this.isPlaying = true;
  }

  public pause() {
    if (!this.isPlaying) return;
    
    this.tracks.forEach(track => {
      track.source?.stop();
      track.source = undefined;
    });
    
    this.pausedAt = this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;
  }
  
  public stop() {
    this.pause();
    this.pausedAt = 0;
  }
  
  // --- Per-Track Controls ---
  public setTrackVolume(id: string, volume: number) {
    const track = this.tracks.get(id);
    if (track) {
      // Smooth volume transition
      track.gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.05);
    }
  }
  
  public muteTrack(id: string, muted: boolean) {
    const track = this.tracks.get(id);
    if (track) {
      // 0 = muted, restore previous volume otherwise handled by setTrackVolume
      track.gainNode.gain.setTargetAtTime(muted ? 0 : 1, this.audioContext.currentTime, 0.05);
    }
  }

  public seek(time: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    
    this.pausedAt = time;
    
    if (wasPlaying) {
      this.play();
    }
  }

  // --- Internal Helpers ---
  private createAndStartSource(_id: string, track: TrackNode) {
    const source = this.audioContext.createBufferSource();
    source.buffer = track.buffer;
    source.connect(track.gainNode); // Connect to GainNode, not destination
    
    source.start(0, this.pausedAt);
    track.source = source;
    
    source.onended = () => {
      // Natural end of track
    };
  }

  public get currentTime(): number {
    if (this.isPlaying) {
      return this.audioContext.currentTime - this.startTime;
    }
    return this.pausedAt;
  }
  
  public get context(): AudioContext {
    return this.audioContext;
  }
}
