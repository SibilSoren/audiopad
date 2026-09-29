import { describe, it, expect } from "vitest"
import {
  splitClip,
  moveClip,
  trimStart,
  trimEnd,
  setFades,
  clipAt,
  containsTime,
  clipEnd,
  MIN_CLIP_DURATION,
} from "../clipOps"
import type { Clip } from "../../models/types"

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  sourceId: "s1",
  start: 0,
  offset: 0,
  duration: 10,
  fadeIn: 0,
  fadeOut: 0,
  gain: 1,
  ...over,
})

describe("containsTime", () => {
  it("is true strictly inside", () => {
    expect(containsTime(clip(), 5)).toBe(true)
  })

  it("excludes both edges, so splitting on an edge is a no-op", () => {
    expect(containsTime(clip(), 0)).toBe(false)
    expect(containsTime(clip(), 10)).toBe(false)
  })
})

describe("splitClip", () => {
  it("cuts a clip into two abutting halves", () => {
    const [left, right] = splitClip(clip(), 4, "c2")!
    expect(left.duration).toBe(4)
    expect(right.start).toBe(4)
    expect(right.duration).toBe(6)
    expect(clipEnd(left)).toBe(right.start)
  })

  // The point of the model: no audio is copied, both halves cite one buffer.
  it("leaves both halves pointing at the same source", () => {
    const [left, right] = splitClip(clip(), 4, "c2")!
    expect(left.sourceId).toBe(right.sourceId)
  })

  it("advances the right half's window into the source", () => {
    const [, right] = splitClip(clip({ offset: 2 }), 4, "c2")!
    expect(right.offset).toBe(6) // original offset 2 + 4 consumed
  })

  it("preserves total duration across the cut", () => {
    const original = clip({ duration: 10 })
    const [left, right] = splitClip(original, 3.7, "c2")!
    expect(left.duration + right.duration).toBeCloseTo(original.duration, 10)
  })

  it("gives the new half a new id and keeps the original's", () => {
    const [left, right] = splitClip(clip(), 4, "c2")!
    expect(left.id).toBe("c1")
    expect(right.id).toBe("c2")
  })

  it("refuses to split outside the clip", () => {
    expect(splitClip(clip({ start: 2, duration: 4 }), 10, "c2")).toBeNull()
    expect(splitClip(clip({ start: 2, duration: 4 }), 1, "c2")).toBeNull()
  })

  it("refuses to split exactly on an edge", () => {
    expect(splitClip(clip(), 0, "c2")).toBeNull()
    expect(splitClip(clip(), 10, "c2")).toBeNull()
  })

  it("refuses to create a sliver too short to hear", () => {
    expect(splitClip(clip(), MIN_CLIP_DURATION / 2, "c2")).toBeNull()
  })

  it("moves a fade-out onto the right half and a fade-in onto the left", () => {
    const [left, right] = splitClip(clip({ fadeIn: 1, fadeOut: 2 }), 5, "c2")!
    expect(left.fadeIn).toBe(1)
    expect(left.fadeOut).toBe(0)
    expect(right.fadeIn).toBe(0)
    expect(right.fadeOut).toBe(2)
  })

  it("splits a split, since the halves are ordinary clips", () => {
    const [, right] = splitClip(clip(), 4, "c2")!
    const [a, b] = splitClip(right, 7, "c3")!
    expect(a.duration).toBe(3)
    expect(b.duration).toBe(3)
    expect(b.offset).toBe(7)
  })
})

describe("moveClip", () => {
  it("slides the clip without changing its window", () => {
    const moved = moveClip(clip({ offset: 3 }), 20)
    expect(moved.start).toBe(20)
    expect(moved.offset).toBe(3)
    expect(moved.duration).toBe(10)
  })

  it("will not move a clip before zero", () => {
    expect(moveClip(clip(), -5).start).toBe(0)
  })
})

describe("trimStart", () => {
  it("moves the left edge and the source window together", () => {
    // Audio must stay put on the timeline, not slide.
    const trimmed = trimStart(clip({ offset: 5 }), 3, 60)
    expect(trimmed.start).toBe(3)
    expect(trimmed.offset).toBe(8)
    expect(trimmed.duration).toBe(7)
    expect(clipEnd(trimmed)).toBe(10)
  })

  it("cannot expose audio before the start of the source", () => {
    // offset 1 means only 1s of material exists to the left.
    const trimmed = trimStart(clip({ start: 5, offset: 1, duration: 4 }), 0, 60)
    expect(trimmed.offset).toBe(0)
    expect(trimmed.start).toBe(4)
  })

  it("stops short of the clip's own end", () => {
    const trimmed = trimStart(clip({ duration: 10 }), 999, 60)
    expect(trimmed.duration).toBeGreaterThanOrEqual(MIN_CLIP_DURATION)
  })

  it("never produces a negative start", () => {
    expect(trimStart(clip({ offset: 50 }), -20, 60).start).toBeGreaterThanOrEqual(0)
  })
})

describe("trimEnd", () => {
  it("shortens the clip", () => {
    expect(trimEnd(clip(), 6, 60).duration).toBe(6)
  })

  it("extends the clip while the source has material left", () => {
    expect(trimEnd(clip({ duration: 5 }), 20, 60).duration).toBe(20)
  })

  it("stops at the end of the available source", () => {
    // offset 50 of a 60s source leaves 10s.
    expect(trimEnd(clip({ offset: 50, duration: 5 }), 999, 60).duration).toBe(10)
  })

  it("will not collapse the clip to nothing", () => {
    expect(trimEnd(clip(), 0, 60).duration).toBe(MIN_CLIP_DURATION)
  })
})

describe("setFades", () => {
  it("stores fades within the clip", () => {
    const faded = setFades(clip({ duration: 10 }), 2, 3)
    expect(faded.fadeIn).toBe(2)
    expect(faded.fadeOut).toBe(3)
  })

  it("clamps a fade longer than the clip", () => {
    expect(setFades(clip({ duration: 4 }), 10, 0).fadeIn).toBe(4)
  })

  it("stops the two fades overlapping", () => {
    const faded = setFades(clip({ duration: 10 }), 8, 8)
    expect(faded.fadeIn + faded.fadeOut).toBeLessThanOrEqual(10)
  })

  it("rejects negative fades", () => {
    const faded = setFades(clip(), -1, -1)
    expect(faded.fadeIn).toBe(0)
    expect(faded.fadeOut).toBe(0)
  })
})

describe("clipAt", () => {
  const clips = [
    clip({ id: "a", start: 0, duration: 5 }),
    clip({ id: "b", start: 6, duration: 4 }),
    clip({ id: "c", trackId: "t2", start: 0, duration: 5 }),
  ]

  it("finds the clip under a point", () => {
    expect(clipAt(clips, "t1", 2)?.id).toBe("a")
    expect(clipAt(clips, "t1", 7)?.id).toBe("b")
  })

  it("returns nothing in a gap", () => {
    expect(clipAt(clips, "t1", 5.5)).toBeNull()
  })

  it("does not cross tracks", () => {
    expect(clipAt(clips, "t2", 2)?.id).toBe("c")
    expect(clipAt(clips, "t3", 2)).toBeNull()
  })

  it("takes the later clip where two overlap", () => {
    const overlapping = [
      clip({ id: "under", start: 0, duration: 10 }),
      clip({ id: "over", start: 2, duration: 4 }),
    ]
    expect(clipAt(overlapping, "t1", 3)?.id).toBe("over")
  })
})
