import type { Clip } from "../models/types"

/**
 * Turning an arrangement into a set of things to schedule.
 *
 * Pure on purpose: this is the part that decides what you hear and when, and
 * it is far easier to get right with tests than by listening.
 */

export interface ScheduledClip {
  clipId: string
  trackId: string
  sourceId: string
  /** Seconds from the transport's start moment before this clip begins. */
  delay: number
  /** Seconds into the source buffer to begin reading. */
  offset: number
  /** How long to play for. */
  duration: number
  fadeIn: number
  fadeOut: number
  gain: number
}

/** The end of a clip on the timeline. */
export function clipEnd(clip: Clip): number {
  return clip.start + clip.duration
}

/** How long the whole arrangement runs. */
export function arrangementEnd(clips: readonly Clip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}

/**
 * Work out what to schedule to resume playback from `position`.
 *
 * Clips already finished are skipped. A clip straddling the position starts
 * part-way in: its offset moves forward by however much has already elapsed,
 * and its duration shrinks to match, so resuming mid-clip does not replay
 * audio that has already been heard.
 */
export function scheduleClips(
  clips: readonly Clip[],
  position: number
): ScheduledClip[] {
  const scheduled: ScheduledClip[] = []

  for (const clip of clips) {
    const end = clipEnd(clip)

    // Already played, or a zero/negative-length clip.
    if (end <= position || clip.duration <= 0) continue

    // Where on the timeline this clip will actually begin sounding.
    const startsAt = Math.max(clip.start, position)
    const consumed = startsAt - clip.start

    scheduled.push({
      clipId: clip.id,
      trackId: clip.trackId,
      sourceId: clip.sourceId,
      delay: startsAt - position,
      offset: clip.offset + consumed,
      duration: clip.duration - consumed,
      // A fade already part-way through when we resume is dropped rather than
      // restarted, which would re-duck audio the listener has already heard.
      fadeIn: Math.max(0, clip.fadeIn - consumed),
      fadeOut: clip.fadeOut,
      gain: clip.gain,
    })
  }

  return scheduled
}
