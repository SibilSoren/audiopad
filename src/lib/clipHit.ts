import type { Clip } from "../models/types"
import { LANE_HEIGHT, timeToX, type Viewport } from "./viewport"

/**
 * Deciding what the pointer is over.
 *
 * Kept pure so the priority between overlapping zones is pinned by tests
 * rather than discovered by dragging: the fade handles sit in the same
 * corners as the trim edges, and getting that order wrong makes one of them
 * unreachable.
 */

export type HitZone = "body" | "trim-start" | "trim-end" | "fade-in" | "fade-out"

export interface ClipHit {
  clipId: string
  zone: HitZone
}

/** How close to an edge counts as grabbing it. */
export const EDGE_GRAB_PX = 6
/** Fade handles occupy a square in each top corner. */
export const FADE_HANDLE_PX = 12

export function clipRect(clip: Clip, view: Viewport, laneIndex: number) {
  return {
    x: timeToX(clip.start, view),
    width: clip.duration * view.pixelsPerSecond,
    y: laneIndex * LANE_HEIGHT,
    height: LANE_HEIGHT,
  }
}

/**
 * Which part of this clip a point falls on, or null if it misses.
 *
 * Fade handles win over trim edges because they share the top corners and are
 * the smaller target; a clip too narrow to hold both handles and its edges
 * falls back to dragging the body, which is always reachable.
 */
export function hitTestClip(
  clip: Clip,
  view: Viewport,
  laneIndex: number,
  x: number,
  y: number
): HitZone | null {
  const rect = clipRect(clip, view, laneIndex)

  if (x < rect.x || x > rect.x + rect.width) return null
  if (y < rect.y || y > rect.y + rect.height) return null

  const fromLeft = x - rect.x
  const fromRight = rect.x + rect.width - x
  const fromTop = y - rect.y

  // Too narrow to host separate zones without them overlapping each other.
  const roomForHandles = rect.width >= FADE_HANDLE_PX * 3

  if (roomForHandles && fromTop <= FADE_HANDLE_PX) {
    if (fromLeft <= FADE_HANDLE_PX) return "fade-in"
    if (fromRight <= FADE_HANDLE_PX) return "fade-out"
  }

  if (rect.width >= EDGE_GRAB_PX * 3) {
    if (fromLeft <= EDGE_GRAB_PX) return "trim-start"
    if (fromRight <= EDGE_GRAB_PX) return "trim-end"
  }

  return "body"
}

/** The topmost clip under a point, with the zone it was hit on. */
export function hitTest(
  clips: readonly Clip[],
  trackId: string,
  laneIndex: number,
  view: Viewport,
  x: number,
  y: number
): ClipHit | null {
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i]
    if (clip.trackId !== trackId) continue

    const zone = hitTestClip(clip, view, laneIndex, x, y)
    if (zone) return { clipId: clip.id, zone }
  }
  return null
}

export function cursorForZone(zone: HitZone | null): string {
  switch (zone) {
    case "trim-start":
    case "trim-end":
      return "ew-resize"
    case "fade-in":
    case "fade-out":
      return "crosshair"
    case "body":
      return "grab"
    default:
      return "pointer"
  }
}
