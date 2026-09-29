/**
 * Timeline geometry: mapping between seconds and pixels under zoom and scroll.
 *
 * Kept pure and separate because every interaction in the editor - seeking,
 * selecting, dragging, trimming - goes through this conversion, and an error
 * here is an error everywhere at once.
 */

/** Lane height is fixed. Dividing the viewport by track count meant one track
 *  filled the whole canvas and adding a second halved the first. */
export const LANE_HEIGHT = 96
export const RULER_HEIGHT = 28

export const MIN_PPS = 2
export const MAX_PPS = 800

export interface Viewport {
  /** Leftmost visible time, in seconds. */
  viewStart: number
  /** Horizontal scale. */
  pixelsPerSecond: number
  /** Visible width, in CSS pixels. */
  width: number
}

export function timeToX(time: number, view: Viewport): number {
  return (time - view.viewStart) * view.pixelsPerSecond
}

export function xToTime(x: number, view: Viewport): number {
  return view.viewStart + x / view.pixelsPerSecond
}

/** How many seconds fit across the viewport at the current zoom. */
export function visibleDuration(view: Viewport): number {
  if (view.pixelsPerSecond <= 0) return 0
  return view.width / view.pixelsPerSecond
}

export function visibleRange(view: Viewport): [number, number] {
  return [view.viewStart, view.viewStart + visibleDuration(view)]
}

export function clampZoom(pixelsPerSecond: number): number {
  if (!Number.isFinite(pixelsPerSecond)) return MIN_PPS
  return Math.min(MAX_PPS, Math.max(MIN_PPS, pixelsPerSecond))
}

/**
 * Keep the scroll position inside the arrangement.
 *
 * When the whole arrangement fits on screen there is nothing to scroll, so
 * the view pins to zero rather than drifting into empty space.
 */
export function clampViewStart(viewStart: number, duration: number, view: Viewport): number {
  const span = visibleDuration(view)
  const maxStart = Math.max(0, duration - span)
  return Math.min(Math.max(0, viewStart), maxStart)
}

/**
 * Zoom while holding one point on the timeline still.
 *
 * Without an anchor, zooming walks the content out from under the pointer:
 * the thing you were looking at is not the thing you end up looking at.
 */
export function zoomAround(
  view: Viewport,
  factor: number,
  anchorX: number,
  duration: number
): { pixelsPerSecond: number; viewStart: number } {
  const anchorTime = xToTime(anchorX, view)
  const pixelsPerSecond = clampZoom(view.pixelsPerSecond * factor)

  // Solve for the viewStart that leaves anchorTime at the same pixel.
  const next: Viewport = { ...view, pixelsPerSecond }
  const viewStart = clampViewStart(anchorTime - anchorX / pixelsPerSecond, duration, next)

  return { pixelsPerSecond, viewStart }
}

/** The zoom at which the whole arrangement just fits. */
export function fitZoom(duration: number, width: number): number {
  if (duration <= 0 || width <= 0) return MIN_PPS
  return clampZoom(width / duration)
}

/** Which lane a y coordinate falls in, or null above the first lane. */
export function laneAtY(y: number, laneCount: number, scrollTop = 0): number | null {
  if (y < 0 || laneCount <= 0) return null
  const index = Math.floor((y + scrollTop) / LANE_HEIGHT)
  return index >= 0 && index < laneCount ? index : null
}

export function laneTop(index: number): number {
  return index * LANE_HEIGHT
}

/** Total height of all lanes, which is what the lane canvas is sized to. */
export function lanesHeight(laneCount: number): number {
  return Math.max(LANE_HEIGHT, laneCount * LANE_HEIGHT)
}

/**
 * A tick spacing that keeps ruler labels readable at any zoom.
 *
 * Steps through a 1/2/5 sequence so the interval is always a round number of
 * seconds or minutes, rather than something like "every 3.7s".
 */
const TICK_STEPS = [
  0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
]

export function tickInterval(view: Viewport, minPixelsBetween = 80): number {
  if (view.pixelsPerSecond <= 0) return TICK_STEPS[TICK_STEPS.length - 1]
  const minSeconds = minPixelsBetween / view.pixelsPerSecond
  return TICK_STEPS.find((step) => step >= minSeconds) ?? TICK_STEPS[TICK_STEPS.length - 1]
}

/** The tick times visible in the current view, aligned to the interval. */
export function visibleTicks(view: Viewport, duration: number): number[] {
  const interval = tickInterval(view)
  const [from, to] = visibleRange(view)
  const end = Math.min(to, duration)

  const ticks: number[] = []
  const first = Math.floor(from / interval) * interval

  for (let t = first; t <= end + interval; t += interval) {
    if (t >= 0 && t <= duration) ticks.push(Number(t.toFixed(6)))
  }
  return ticks
}
