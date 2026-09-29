import { describe, it, expect } from "vitest"
import {
  hitTestClip,
  hitTest,
  clipRect,
  cursorForZone,
  EDGE_GRAB_PX,
  FADE_HANDLE_PX,
} from "../clipHit"
import { LANE_HEIGHT, type Viewport } from "../viewport"
import type { Clip } from "../../models/types"

const view: Viewport = { viewStart: 0, pixelsPerSecond: 10, width: 1000 }

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  sourceId: "s1",
  start: 0,
  offset: 0,
  duration: 20, // 200px at 10 px/s
  fadeIn: 0,
  fadeOut: 0,
  gain: 1,
  ...over,
})

// Comfortably below the fade handles and away from both edges.
const MID_Y = LANE_HEIGHT / 2

describe("clipRect", () => {
  it("places the clip according to the view", () => {
    const rect = clipRect(clip({ start: 10 }), view, 0)
    expect(rect.x).toBe(100)
    expect(rect.width).toBe(200)
  })

  it("offsets by the lane", () => {
    expect(clipRect(clip(), view, 2).y).toBe(2 * LANE_HEIGHT)
  })
})

describe("hitTestClip", () => {
  it("misses to the left and right", () => {
    expect(hitTestClip(clip({ start: 10 }), view, 0, 50, MID_Y)).toBeNull()
    expect(hitTestClip(clip({ start: 10 }), view, 0, 400, MID_Y)).toBeNull()
  })

  it("misses above and below the lane", () => {
    expect(hitTestClip(clip(), view, 1, 100, 10)).toBeNull()
    expect(hitTestClip(clip(), view, 0, 100, LANE_HEIGHT + 10)).toBeNull()
  })

  it("hits the body in the middle", () => {
    expect(hitTestClip(clip(), view, 0, 100, MID_Y)).toBe("body")
  })

  it("grabs the left edge", () => {
    expect(hitTestClip(clip(), view, 0, 2, MID_Y)).toBe("trim-start")
  })

  it("grabs the right edge", () => {
    expect(hitTestClip(clip(), view, 0, 198, MID_Y)).toBe("trim-end")
  })

  it("leaves the body just inside the grab margin", () => {
    expect(hitTestClip(clip(), view, 0, EDGE_GRAB_PX + 2, MID_Y)).toBe("body")
  })

  it("finds the fade handles in the top corners", () => {
    expect(hitTestClip(clip(), view, 0, 2, 2)).toBe("fade-in")
    expect(hitTestClip(clip(), view, 0, 198, 2)).toBe("fade-out")
  })

  // The handles share the corners with the trim edges, so the order matters.
  it("prefers a fade handle over the trim edge beneath it", () => {
    expect(hitTestClip(clip(), view, 0, 2, 2)).not.toBe("trim-start")
  })

  it("falls back to the trim edge below the handle", () => {
    expect(hitTestClip(clip(), view, 0, 2, FADE_HANDLE_PX + 5)).toBe("trim-start")
  })

  // A sliver cannot host three zones without them swallowing each other.
  it("gives a very narrow clip a draggable body", () => {
    const narrow = clip({ duration: 1 }) // 10px wide
    expect(hitTestClip(narrow, view, 0, 5, MID_Y)).toBe("body")
  })

  it("keeps the handles reachable on a wide clip", () => {
    const wide = clip({ duration: 60 })
    expect(hitTestClip(wide, view, 0, 4, 4)).toBe("fade-in")
  })

  it("respects scroll", () => {
    const scrolled: Viewport = { ...view, viewStart: 10 }
    // The clip starts at 0, which is now 100px off the left edge.
    expect(hitTestClip(clip(), scrolled, 0, 50, MID_Y)).toBe("body")
    expect(hitTestClip(clip(), scrolled, 0, 150, MID_Y)).toBeNull()
  })

  it("respects zoom", () => {
    const zoomed: Viewport = { ...view, pixelsPerSecond: 40 }
    // 20s at 40px/s is 800px wide, so 700 is inside where 400 would not be.
    expect(hitTestClip(clip(), zoomed, 0, 700, MID_Y)).toBe("body")
  })
})

describe("hitTest", () => {
  const clips = [
    clip({ id: "a", start: 0, duration: 10 }),
    clip({ id: "b", start: 20, duration: 10 }),
    clip({ id: "other", trackId: "t2", start: 0, duration: 10 }),
  ]

  it("finds the clip under the point", () => {
    expect(hitTest(clips, "t1", 0, view, 50, MID_Y)?.clipId).toBe("a")
    expect(hitTest(clips, "t1", 0, view, 250, MID_Y)?.clipId).toBe("b")
  })

  it("returns nothing in a gap", () => {
    expect(hitTest(clips, "t1", 0, view, 150, MID_Y)).toBeNull()
  })

  it("does not cross tracks", () => {
    expect(hitTest(clips, "t2", 0, view, 50, MID_Y)?.clipId).toBe("other")
    expect(hitTest(clips, "t3", 0, view, 50, MID_Y)).toBeNull()
  })

  it("reports the zone along with the clip", () => {
    expect(hitTest(clips, "t1", 0, view, 2, MID_Y)?.zone).toBe("trim-start")
  })

  it("takes the later clip where two overlap", () => {
    const overlapping = [
      clip({ id: "under", start: 0, duration: 30 }),
      clip({ id: "over", start: 5, duration: 10 }),
    ]
    expect(hitTest(overlapping, "t1", 0, view, 100, MID_Y)?.clipId).toBe("over")
  })
})

describe("cursorForZone", () => {
  it("signals what each zone will do", () => {
    expect(cursorForZone("trim-start")).toBe("ew-resize")
    expect(cursorForZone("trim-end")).toBe("ew-resize")
    expect(cursorForZone("fade-in")).toBe("crosshair")
    expect(cursorForZone("body")).toBe("grab")
    expect(cursorForZone(null)).toBe("pointer")
  })
})
