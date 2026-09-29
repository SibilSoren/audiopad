/**
 * A decoded audio file, held once and referenced by any number of clips.
 *
 * Splitting a clip does not copy audio: both halves keep pointing at the same
 * sourceId with different offsets, so split, trim and drag are all O(1)
 * metadata edits.
 */
export interface AudioSource {
  id: string
  name: string
  duration: number
  /** Peaks for the whole source; clips draw the slice they cover. */
  peaks?: number[]
}

/** A region of an AudioSource placed on a track's timeline. */
export interface Clip {
  id: string
  trackId: string
  sourceId: string
  /** Where the clip sits on the timeline, in seconds. */
  start: number
  /** How far into the source the clip begins, in seconds. */
  offset: number
  /** How much of the source the clip covers, in seconds. */
  duration: number
  fadeIn: number
  fadeOut: number
  /** Clip-level trim, independent of the track fader. */
  gain: number
}

export interface AudioTrack {
  id: string
  name: string
  /** 0 to 1 */
  volume: number
  muted: boolean
  solo: boolean
  color: string
  albumArt?: string
}

export interface TransportState {
  isPlaying: boolean
  currentTime: number
  /** BPM - reserved for a future metronome and grid. */
  tempo: number
}

export interface UIState {
  /** Pixels per second. */
  zoomLevel: number
  scrollOffset: number
}
