/** Format seconds as m:ss.cc for the transport clock. */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const centis = Math.floor((safe % 1) * 100)
  return `${minutes}:${secs.toString().padStart(2, "0")}.${centis
    .toString()
    .padStart(2, "0")}`
}

/**
 * The timeline length: the longest track, with a floor so an empty project
 * still has a usable ruler.
 *
 * Derived rather than stored. The previous code kept `duration` in transport
 * state, never dispatched `setDuration`, and so left it at a hardcoded 120s
 * forever - which also meant it could not self-correct when a track was removed.
 */
export const MIN_TIMELINE_SECONDS = 30

export function timelineDuration(trackDurations: readonly number[]): number {
  const longest = trackDurations.reduce(
    (max, d) => (Number.isFinite(d) && d > max ? d : max),
    0
  )
  return Math.max(MIN_TIMELINE_SECONDS, longest)
}
