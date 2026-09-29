import { describe, it, expect } from "vitest"
import { formatTime, timelineDuration, MIN_TIMELINE_SECONDS } from "../time"

describe("formatTime", () => {
  it("formats zero", () => {
    expect(formatTime(0)).toBe("0:00.00")
  })

  it("pads seconds and centiseconds", () => {
    expect(formatTime(5.07)).toBe("0:05.07")
  })

  it("rolls over into minutes", () => {
    expect(formatTime(125.5)).toBe("2:05.50")
  })

  // engine.currentTime can read slightly negative right after a seek.
  it("clamps negative input to zero instead of printing -1:-1", () => {
    expect(formatTime(-3)).toBe("0:00.00")
  })

  it("survives NaN and Infinity", () => {
    expect(formatTime(NaN)).toBe("0:00.00")
    expect(formatTime(Infinity)).toBe("0:00.00")
  })
})

describe("timelineDuration", () => {
  it("falls back to a minimum for an empty project", () => {
    expect(timelineDuration([])).toBe(MIN_TIMELINE_SECONDS)
  })

  it("uses the longest track", () => {
    expect(timelineDuration([12, 180, 44])).toBe(180)
  })

  it("keeps the floor when every track is short", () => {
    expect(timelineDuration([2, 3])).toBe(MIN_TIMELINE_SECONDS)
  })

  // The old transport state hardcoded 120s and never updated, so a 3 minute
  // track ran off the end of the canvas and click-to-seek mapped to the wrong
  // position on anything that was not exactly two minutes long.
  it("tracks a file longer than the old hardcoded 120s", () => {
    expect(timelineDuration([200])).toBe(200)
  })

  it("ignores NaN durations from a failed decode", () => {
    expect(timelineDuration([NaN, 90])).toBe(90)
  })
})
