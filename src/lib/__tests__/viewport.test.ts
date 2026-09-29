import { describe, it, expect } from "vitest"
import {
  timeToX,
  xToTime,
  visibleDuration,
  visibleRange,
  clampZoom,
  clampViewStart,
  zoomAround,
  fitZoom,
  laneAtY,
  laneTop,
  lanesHeight,
  tickInterval,
  visibleTicks,
  LANE_HEIGHT,
  MIN_PPS,
  MAX_PPS,
  type Viewport,
} from "../viewport"

const view = (over: Partial<Viewport> = {}): Viewport => ({
  viewStart: 0,
  pixelsPerSecond: 10,
  width: 1000,
  ...over,
})

describe("time and pixel conversion", () => {
  it("places the view start at x = 0", () => {
    expect(timeToX(5, view({ viewStart: 5 }))).toBe(0)
  })

  it("scales by the zoom level", () => {
    expect(timeToX(10, view({ pixelsPerSecond: 20 }))).toBe(200)
  })

  it("returns a negative x for time scrolled off the left", () => {
    expect(timeToX(0, view({ viewStart: 10 }))).toBeLessThan(0)
  })

  it("round-trips through xToTime", () => {
    const v = view({ viewStart: 12.5, pixelsPerSecond: 37 })
    expect(xToTime(timeToX(42, v), v)).toBeCloseTo(42, 9)
  })
})

describe("visibleDuration / visibleRange", () => {
  it("fits width / zoom seconds on screen", () => {
    expect(visibleDuration(view({ width: 800, pixelsPerSecond: 10 }))).toBe(80)
  })

  it("shows less as you zoom in", () => {
    const wide = visibleDuration(view({ pixelsPerSecond: 10 }))
    const close = visibleDuration(view({ pixelsPerSecond: 100 }))
    expect(close).toBeLessThan(wide)
  })

  it("reports the range from the scroll position", () => {
    expect(visibleRange(view({ viewStart: 30, width: 500, pixelsPerSecond: 10 }))).toEqual([
      30, 80,
    ])
  })

  it("survives a zero zoom rather than dividing by it", () => {
    expect(visibleDuration(view({ pixelsPerSecond: 0 }))).toBe(0)
  })
})

describe("clampZoom", () => {
  it("passes sane values through", () => {
    expect(clampZoom(50)).toBe(50)
  })

  it("bounds both ends", () => {
    expect(clampZoom(0.0001)).toBe(MIN_PPS)
    expect(clampZoom(99999)).toBe(MAX_PPS)
  })

  it("treats NaN as the minimum rather than poisoning the viewport", () => {
    expect(clampZoom(NaN)).toBe(MIN_PPS)
  })
})

describe("clampViewStart", () => {
  it("never scrolls before zero", () => {
    expect(clampViewStart(-10, 300, view())).toBe(0)
  })

  it("stops at the end of the arrangement", () => {
    // 100s visible of a 300s arrangement leaves 200s of scroll.
    expect(clampViewStart(999, 300, view({ width: 1000, pixelsPerSecond: 10 }))).toBe(200)
  })

  // Scrolling into empty space when everything already fits is disorienting.
  it("pins to zero when the whole arrangement fits", () => {
    expect(clampViewStart(50, 30, view({ width: 1000, pixelsPerSecond: 10 }))).toBe(0)
  })
})

describe("zoomAround", () => {
  it("zooms in by the factor", () => {
    expect(zoomAround(view({ pixelsPerSecond: 10 }), 2, 500, 1000).pixelsPerSecond).toBe(20)
  })

  // The whole point of an anchor: what you point at stays where it is.
  it("holds the anchored time under the same pixel", () => {
    const v = view({ viewStart: 20, pixelsPerSecond: 10, width: 1000 })
    const anchorX = 400
    const anchorTime = xToTime(anchorX, v)

    const next = zoomAround(v, 2, anchorX, 10000)
    const after = timeToX(anchorTime, { ...v, ...next })

    expect(after).toBeCloseTo(anchorX, 6)
  })

  it("holds the anchor when zooming out too", () => {
    const v = view({ viewStart: 100, pixelsPerSecond: 40, width: 1000 })
    const anchorX = 250
    const anchorTime = xToTime(anchorX, v)

    const next = zoomAround(v, 0.5, anchorX, 10000)
    const after = timeToX(anchorTime, { ...v, ...next })

    expect(after).toBeCloseTo(anchorX, 6)
  })

  it("respects the zoom bounds", () => {
    expect(zoomAround(view({ pixelsPerSecond: MAX_PPS }), 4, 0, 1000).pixelsPerSecond).toBe(
      MAX_PPS
    )
  })

  it("does not leave the view scrolled past the end", () => {
    const next = zoomAround(view({ viewStart: 90, pixelsPerSecond: 40 }), 0.25, 900, 100)
    expect(next.viewStart).toBe(0)
  })
})

describe("fitZoom", () => {
  it("fits the arrangement to the width", () => {
    expect(fitZoom(100, 1000)).toBe(10)
  })

  it("handles an empty arrangement", () => {
    expect(fitZoom(0, 1000)).toBe(MIN_PPS)
  })

  it("handles a zero-width viewport before first layout", () => {
    expect(fitZoom(100, 0)).toBe(MIN_PPS)
  })
})

describe("lane geometry", () => {
  it("gives every lane the same height regardless of track count", () => {
    expect(laneTop(0)).toBe(0)
    expect(laneTop(3)).toBe(3 * LANE_HEIGHT)
  })

  it("grows the canvas with the track count", () => {
    expect(lanesHeight(4)).toBe(4 * LANE_HEIGHT)
  })

  it("keeps one lane's worth of height when empty", () => {
    expect(lanesHeight(0)).toBe(LANE_HEIGHT)
  })

  it("finds the lane under a point", () => {
    expect(laneAtY(LANE_HEIGHT + 10, 3)).toBe(1)
  })

  it("accounts for vertical scroll", () => {
    expect(laneAtY(10, 4, LANE_HEIGHT * 2)).toBe(2)
  })

  it("returns nothing past the last lane", () => {
    expect(laneAtY(LANE_HEIGHT * 5, 2)).toBeNull()
  })

  it("returns nothing above the first lane", () => {
    expect(laneAtY(-5, 2)).toBeNull()
  })
})

describe("ruler ticks", () => {
  it("uses round intervals, not arbitrary ones", () => {
    const interval = tickInterval(view({ pixelsPerSecond: 7 }))
    expect([0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]).toContain(
      interval
    )
  })

  it("uses finer intervals as you zoom in", () => {
    const coarse = tickInterval(view({ pixelsPerSecond: 2 }))
    const fine = tickInterval(view({ pixelsPerSecond: 400 }))
    expect(fine).toBeLessThan(coarse)
  })

  it("keeps labels from colliding", () => {
    const v = view({ pixelsPerSecond: 10 })
    expect(tickInterval(v, 80) * v.pixelsPerSecond).toBeGreaterThanOrEqual(80)
  })

  it("only emits ticks inside the arrangement", () => {
    const ticks = visibleTicks(view({ pixelsPerSecond: 10, width: 1000 }), 40)
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ticks)).toBeLessThanOrEqual(40)
  })

  it("aligns ticks to the interval when scrolled", () => {
    const v = view({ viewStart: 37, pixelsPerSecond: 10, width: 500 })
    const interval = tickInterval(v)
    for (const t of visibleTicks(v, 1000)) {
      expect(Math.abs(t / interval - Math.round(t / interval))).toBeLessThan(1e-6)
    }
  })
})
