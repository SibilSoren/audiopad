/**
 * Mute/solo/volume resolution.
 *
 * Kept as pure functions deliberately: this is the logic that decides whether a
 * track is audible and at what gain, and it was previously spread across the
 * engine and the middleware, where the two disagreed. Everything here is
 * testable without an AudioContext.
 */

export interface MixableTrack {
  muted: boolean
  solo: boolean
  volume: number
}

/** True when at least one track is soloed, which puts the mixer in solo mode. */
export function hasAnySolo(tracks: readonly MixableTrack[]): boolean {
  return tracks.some((track) => track.solo)
}

/**
 * Whether a track should be silent, given the mixer's solo state.
 *
 * An explicit mute always wins: a track that is both soloed and muted stays
 * silent. Previously the solo path ignored the mute flag entirely and made such
 * a track audible at full volume.
 */
export function effectiveMute(track: MixableTrack, anySolo: boolean): boolean {
  if (track.muted) return true
  if (anySolo && !track.solo) return true
  return false
}

/**
 * The gain a track should be heard at.
 *
 * Mute is a separate multiplier from volume, never a replacement for it. The
 * old engine restored an unmuted track to a hardcoded 1.0, which discarded
 * whatever the volume slider said.
 */
export function effectiveGain(track: MixableTrack, anySolo: boolean): number {
  return effectiveMute(track, anySolo) ? 0 : track.volume
}

/** Clamp a fader value into the range the UI allows. */
export function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return 0
  return Math.min(1, Math.max(0, volume))
}
