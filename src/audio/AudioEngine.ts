import { loadAudioBuffer } from './AudioUtils';
import { arrangementEnd } from './scheduling';
import { computeLevel, SILENT, type Level } from './levels';
import {
  scheduleClipSources,
  configureLimiter,
  renderArrangement,
  type TrackMix,
} from './renderGraph';
import type { Clip } from '../models/types';

/**
 * Per-track nodes.
 *
 * Volume and mute are deliberately separate stages. They used to share one
 * GainNode, so unmuting restored a hardcoded 1.0 and discarded whatever the
 * fader said - and because solo muted every other track, one solo click reset
 * the whole project's levels. Two stages make that class of bug impossible:
 * neither control can overwrite the other.
 */
interface TrackNodes {
  volumeGain: GainNode;
  muteGain: GainNode;
  /** Post-fader and post-mute, so the meter shows what is actually heard. */
  analyser: AnalyserNode;
}

/** How far ahead of `currentTime` playback is scheduled, so every clip in a
 *  batch shares one start moment and stays sample-aligned. */
const SCHEDULE_LOOKAHEAD = 0.05;

/** Time constant for fader moves - long enough to avoid a click. */
const RAMP = 0.05;

/** Meter window. Small enough to stay responsive to transients. */
const ANALYSER_FFT = 1024;

export class AudioEngine {
  private static instance: AudioEngine;
  private audioContext: AudioContext;

  /** Decoded audio, held once per file and shared by every clip that cites it. */
  private buffers: Map<string, AudioBuffer> = new Map();
  private tracks: Map<string, TrackNodes> = new Map();
  private clips: Clip[] = [];

  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private masterAnalyser: AnalyserNode;
  /** Reused between frames: allocating a Float32Array per meter read at
   *  60fps is a needless pressure on the garbage collector. */
  private levelBuffer: Float32Array<ArrayBuffer>;

  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private pendingEndings = 0;
  private onEnded: (() => void) | null = null;

  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pausedAt: number = 0;

  private constructor() {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.audioContext = new AudioContextClass();

    // Every track used to connect straight to destination, so four tracks at
    // unity summed well past 0 dBFS and clipped. Everything now lands on a
    // master bus with a limiter behind it.
    this.masterGain = this.audioContext.createGain();
    this.limiter = this.audioContext.createDynamicsCompressor();
    configureLimiter(this.limiter);

    this.masterAnalyser = this.audioContext.createAnalyser();
    this.masterAnalyser.fftSize = ANALYSER_FFT;
    this.levelBuffer = new Float32Array(ANALYSER_FFT);

    // Metered after the limiter, so the master shows the true output.
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.audioContext.destination);
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /** Fired when the arrangement plays through to its end. */
  public setOnEnded(callback: (() => void) | null) {
    this.onEnded = callback;
  }

  // --- Sources (decoded files) ---

  public async loadSource(sourceId: string, url: string): Promise<AudioBuffer> {
    const existing = this.buffers.get(sourceId);
    if (existing) return existing;

    const buffer = await loadAudioBuffer(this.audioContext, url);
    this.buffers.set(sourceId, buffer);
    return buffer;
  }

  public getSourceDuration(sourceId: string): number {
    return this.buffers.get(sourceId)?.duration ?? 0;
  }

  /** Drop a decoded buffer once no clip references it. */
  public releaseSource(sourceId: string) {
    this.buffers.delete(sourceId);
  }

  // --- Tracks ---

  public ensureTrack(trackId: string): TrackNodes {
    const existing = this.tracks.get(trackId);
    if (existing) return existing;

    const volumeGain = this.audioContext.createGain();
    const muteGain = this.audioContext.createGain();
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_FFT;

    volumeGain.connect(muteGain);
    muteGain.connect(analyser);
    analyser.connect(this.masterGain);

    const nodes = { volumeGain, muteGain, analyser };
    this.tracks.set(trackId, nodes);
    return nodes;
  }

  public removeTrack(trackId: string) {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;

    this.stopSourcesForTrack(trackId);
    nodes.volumeGain.disconnect();
    nodes.muteGain.disconnect();
    nodes.analyser.disconnect();
    this.tracks.delete(trackId);
  }

  // --- Mixer ---

  /** The fader. Never touched by mute or solo. */
  public setTrackVolume(trackId: string, volume: number) {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.volumeGain.gain.setTargetAtTime(
      volume,
      this.audioContext.currentTime,
      RAMP
    );
  }

  /** Mute is a separate 0/1 multiplier, so it cannot clobber the fader. */
  public setTrackMuted(trackId: string, muted: boolean) {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return;
    nodes.muteGain.gain.setTargetAtTime(
      muted ? 0 : 1,
      this.audioContext.currentTime,
      RAMP
    );
  }

  // --- Metering ---

  public getTrackLevel(trackId: string): Level {
    const nodes = this.tracks.get(trackId);
    if (!nodes) return SILENT;
    nodes.analyser.getFloatTimeDomainData(this.levelBuffer);
    return computeLevel(this.levelBuffer);
  }

  public getMasterLevel(): Level {
    this.masterAnalyser.getFloatTimeDomainData(this.levelBuffer);
    return computeLevel(this.levelBuffer);
  }

  public setMasterVolume(volume: number) {
    this.masterGain.gain.setTargetAtTime(
      volume,
      this.audioContext.currentTime,
      RAMP
    );
  }

  // --- Arrangement ---

  /**
   * Replace the arrangement. If the transport is running the change takes
   * effect immediately, which is also what makes a track added mid-playback
   * audible without stopping first.
   */
  public setClips(clips: Clip[]) {
    this.clips = clips;

    if (this.isPlaying) {
      this.stopAllSources();
      // startTime is deliberately left alone: rebasing it here would re-apply
      // the lookahead and walk the transport backwards by 50ms on every edit.
      this.scheduleFrom(this.audioContext.currentTime + SCHEDULE_LOOKAHEAD);
    }
  }

  public get duration(): number {
    return arrangementEnd(this.clips);
  }

  // --- Transport ---

  public play() {
    if (this.isPlaying) return;

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    // Restarting from the end should replay rather than sit silent.
    if (this.pausedAt >= this.duration) {
      this.pausedAt = 0;
    }

    const origin = this.audioContext.currentTime + SCHEDULE_LOOKAHEAD;
    this.startTime = origin - this.pausedAt;
    this.scheduleFrom(origin);
    this.isPlaying = true;
  }

  public pause() {
    if (!this.isPlaying) return;

    const position = this.currentTime;
    this.stopAllSources();
    this.pausedAt = Math.min(position, this.duration);
    this.isPlaying = false;
  }

  public stop() {
    this.stopAllSources();
    this.isPlaying = false;
    this.pausedAt = 0;
  }

  public seek(time: number) {
    const target = Math.max(0, Math.min(time, this.duration));

    this.pausedAt = target;

    if (this.isPlaying) {
      this.stopAllSources();
      const origin = this.audioContext.currentTime + SCHEDULE_LOOKAHEAD;
      this.startTime = origin - target;
      this.scheduleFrom(origin);
    }
  }

  public get currentTime(): number {
    if (!this.isPlaying) return this.pausedAt;
    const elapsed = this.audioContext.currentTime - this.startTime;
    return Math.max(0, Math.min(elapsed, this.duration));
  }

  public get context(): AudioContext {
    return this.audioContext;
  }

  // --- Internals ---

  /**
   * Schedule everything still to come, taking `origin` as the moment the
   * transport's current position lands on. One shared origin for the whole
   * batch is what keeps tracks sample-aligned; the old code called
   * source.start(0) in a loop and relied on them landing in the same render
   * quantum.
   *
   * Does not touch startTime - callers own the clock.
   */
  private scheduleFrom(origin: number) {
    const position = origin - this.startTime;

    const sources = scheduleClipSources({
      context: this.audioContext,
      clips: this.clips,
      buffers: this.buffers,
      trackInput: (trackId) => this.tracks.get(trackId)?.volumeGain ?? null,
      origin,
      from: position,
      onEnded: (source) => {
        this.activeSources.delete(source);
        this.pendingEndings--;
        // Only a natural finish reaches here: stopAllSources clears the
        // handler before stopping, so pausing never looks like the end.
        if (this.pendingEndings <= 0 && this.isPlaying) {
          this.handleArrangementEnd();
        }
      },
    });

    this.pendingEndings = sources.length;
    for (const source of sources) {
      this.activeSources.add(source);
    }
  }

  /**
   * Render the arrangement offline.
   *
   * Uses the same graph builder as live playback, so the file matches what
   * was heard rather than approximating it.
   */
  public renderMix(
    tracks: readonly TrackMix[],
    masterVolume: number
  ): Promise<AudioBuffer> {
    return renderArrangement({
      clips: this.clips,
      tracks,
      buffers: this.buffers,
      masterVolume,
      duration: this.duration,
      sampleRate: this.audioContext.sampleRate,
    });
  }

  private handleArrangementEnd() {
    this.isPlaying = false;
    this.pausedAt = this.duration;
    this.onEnded?.();
  }

  private stopAllSources() {
    for (const source of this.activeSources) {
      // Detach first: a stop() we asked for must not be reported as the
      // arrangement ending.
      source.onended = null;
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped, or never started.
      }
    }
    this.activeSources.clear();
    this.pendingEndings = 0;
  }

  private stopSourcesForTrack(trackId: string) {
    const clipIds = new Set(
      this.clips.filter((c) => c.trackId === trackId).map((c) => c.id)
    );
    if (clipIds.size === 0) return;
    // Sources are not tagged by track, so drop this track's clips and
    // reschedule what remains from where the transport currently is.
    if (this.isPlaying) {
      this.stopAllSources();
      this.clips = this.clips.filter((c) => c.trackId !== trackId);
      this.scheduleFrom(this.audioContext.currentTime + SCHEDULE_LOOKAHEAD);
    } else {
      this.clips = this.clips.filter((c) => c.trackId !== trackId);
    }
  }
}
