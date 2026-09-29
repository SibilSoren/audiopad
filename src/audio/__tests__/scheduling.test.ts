import { describe, it, expect } from "vitest"
import { scheduleClips, arrangementEnd, clipEnd } from "../scheduling"
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

describe("clipEnd / arrangementEnd", () => {
  it("ends a clip at start + duration", () => {
    expect(clipEnd(clip({ start: 5, duration: 3 }))).toBe(8)
  })

  it("takes the furthest clip as the arrangement end", () => {
    expect(
      arrangementEnd([
        clip({ start: 0, duration: 4 }),
        clip({ start: 30, duration: 5 }),
        clip({ start: 10, duration: 2 }),
      ])
    ).toBe(35)
  })

  it("is zero for an empty arrangement", () => {
    expect(arrangementEnd([])).toBe(0)
  })
})

describe("scheduleClips", () => {
  it("schedules a clip at the start with no delay", () => {
    const [s] = scheduleClips([clip()], 0)
    expect(s.delay).toBe(0)
    expect(s.offset).toBe(0)
    expect(s.duration).toBe(10)
  })

  it("delays a clip that begins later on the timeline", () => {
    const [s] = scheduleClips([clip({ start: 4 })], 0)
    expect(s.delay).toBe(4)
    expect(s.offset).toBe(0)
  })

  it("skips clips that have already finished", () => {
    expect(scheduleClips([clip({ start: 0, duration: 5 })], 6)).toHaveLength(0)
  })

  it("skips zero-length clips", () => {
    expect(scheduleClips([clip({ duration: 0 })], 0)).toHaveLength(0)
  })

  // Resuming in the middle of a clip must not replay what was already heard.
  it("enters a straddling clip part-way through", () => {
    const [s] = scheduleClips([clip({ start: 0, duration: 10, offset: 2 })], 3)
    expect(s.delay).toBe(0)
    expect(s.offset).toBe(5) // original offset 2 + 3 already elapsed
    expect(s.duration).toBe(7)
  })

  it("respects a clip's offset into its source", () => {
    const [s] = scheduleClips([clip({ offset: 30, duration: 5 })], 0)
    expect(s.offset).toBe(30)
    expect(s.duration).toBe(5)
  })

  it("carries clip gain and fades through", () => {
    const [s] = scheduleClips([clip({ gain: 0.5, fadeIn: 1, fadeOut: 2 })], 0)
    expect(s.gain).toBe(0.5)
    expect(s.fadeIn).toBe(1)
    expect(s.fadeOut).toBe(2)
  })

  it("shortens a fade-in already part-way through on resume", () => {
    const [s] = scheduleClips([clip({ fadeIn: 4 })], 3)
    expect(s.fadeIn).toBe(1)
  })

  it("drops a fade-in that has completed", () => {
    const [s] = scheduleClips([clip({ fadeIn: 2 })], 5)
    expect(s.fadeIn).toBe(0)
  })

  it("handles several clips on one track back to back", () => {
    const scheduled = scheduleClips(
      [
        clip({ id: "a", start: 0, duration: 5 }),
        clip({ id: "b", start: 5, duration: 5 }),
      ],
      0
    )
    expect(scheduled.map((s) => s.clipId)).toEqual(["a", "b"])
    expect(scheduled[1].delay).toBe(5)
  })

  it("keeps only the still-audible clip when resuming between two", () => {
    const scheduled = scheduleClips(
      [
        clip({ id: "a", start: 0, duration: 5 }),
        clip({ id: "b", start: 5, duration: 5 }),
      ],
      6
    )
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].clipId).toBe("b")
    expect(scheduled[0].offset).toBe(1)
  })
})
