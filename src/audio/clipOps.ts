import type { Clip } from "../models/types"

/**
 * Clip edits, as pure transformations.
 *
 * Every operation here is arithmetic over start/offset/duration. No audio is
 * copied and nothing is re-decoded: a split produces two clips that point at
 * the same buffer with different windows into it, which is what makes editing
 * cheap enough to do on every mouse move.
 */

/** Shortest clip we will produce, so edits cannot create inaudible slivers. */
export const MIN_CLIP_DURATION = 0.01

export function clipEnd(clip: Clip): number {
  return clip.start + clip.duration
}

export function containsTime(clip: Clip, time: number): boolean {
  return time > clip.start && time < clipEnd(clip)
}

/**
 * Cut a clip in two at a point on the timeline.
 *
 * Returns null when the cut would not land strictly inside the clip, or would
 * leave either half below the minimum length - splitting exactly on an edge
 * is a no-op rather than an error.
 */
export function splitClip(
  clip: Clip,
  atTime: number,
  newId: string
): [Clip, Clip] | null {
  if (!containsTime(clip, atTime)) return null

  const consumed = atTime - clip.start
  const remaining = clip.duration - consumed

  if (consumed < MIN_CLIP_DURATION || remaining < MIN_CLIP_DURATION) {
    return null
  }

  const left: Clip = {
    ...clip,
    duration: consumed,
    // A fade-out belongs to the end of the original, which is now the right half.
    fadeOut: 0,
  }

  const right: Clip = {
    ...clip,
    id: newId,
    start: atTime,
    offset: clip.offset + consumed,
    duration: remaining,
    // Likewise the fade-in stays with the left half.
    fadeIn: 0,
  }

  return [left, right]
}

/** Slide a clip along its track, keeping its window into the source. */
export function moveClip(clip: Clip, newStart: number): Clip {
  return { ...clip, start: Math.max(0, newStart) }
}

/**
 * Drag the left edge.
 *
 * The clip's window into the source moves with the edge, so the audio stays
 * put on the timeline rather than sliding: trimming reveals or hides material,
 * it does not reposition it.
 */
export function trimStart(clip: Clip, newStart: number, sourceDuration: number): Clip {
  const end = clipEnd(clip)
  const maxStart = end - MIN_CLIP_DURATION

  // Cannot expose audio before the beginning of the source.
  const minStart = clip.start - clip.offset
  const start = Math.min(Math.max(newStart, minStart, 0), maxStart)

  const delta = start - clip.start
  const offset = Math.max(0, Math.min(clip.offset + delta, sourceDuration))

  return {
    ...clip,
    start,
    offset,
    // Guarded rather than trusted: end - start can land a hair under the
    // minimum through float error when start has just been clamped to it.
    duration: Math.max(MIN_CLIP_DURATION, end - start),
  }
}

/** Drag the right edge, bounded by what is left in the source. */
export function trimEnd(clip: Clip, newEnd: number, sourceDuration: number): Clip {
  const available = sourceDuration - clip.offset
  const maxEnd = clip.start + available
  const end = Math.min(Math.max(newEnd, clip.start + MIN_CLIP_DURATION), maxEnd)

  return { ...clip, duration: Math.max(MIN_CLIP_DURATION, end - clip.start) }
}

/** Fades are clamped so they can never overlap or exceed the clip. */
export function setFades(clip: Clip, fadeIn: number, fadeOut: number): Clip {
  const safeIn = Math.max(0, Math.min(fadeIn, clip.duration))
  const safeOut = Math.max(0, Math.min(fadeOut, clip.duration - safeIn))
  return { ...clip, fadeIn: safeIn, fadeOut: safeOut }
}

/**
 * Apply a drag gesture to a clip.
 *
 * `delta` is how far the pointer has moved, in seconds. Keeping this pure
 * means the whole interaction can be tested without synthesising pointer
 * events, and the live preview during a drag is computed the same way as the
 * value finally committed - so what you see while dragging is what you get.
 */
export function applyDrag(
  original: Clip,
  zone: "body" | "trim-start" | "trim-end" | "fade-in" | "fade-out",
  delta: number,
  sourceDuration: number
): Clip {
  switch (zone) {
    case "body":
      return moveClip(original, original.start + delta)
    case "trim-start":
      return trimStart(original, original.start + delta, sourceDuration)
    case "trim-end":
      return trimEnd(original, clipEnd(original) + delta, sourceDuration)
    case "fade-in":
      return setFades(original, original.fadeIn + delta, original.fadeOut)
    case "fade-out":
      // The handle is at the right edge, so dragging left lengthens the fade.
      return setFades(original, original.fadeIn, original.fadeOut - delta)
  }
}

/** The topmost clip at a point on a track, if any. */
export function clipAt(clips: readonly Clip[], trackId: string, time: number): Clip | null {
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i]
    if (clip.trackId !== trackId) continue
    if (time >= clip.start && time <= clipEnd(clip)) return clip
  }
  return null
}
