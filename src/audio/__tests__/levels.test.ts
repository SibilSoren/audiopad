import { describe, it, expect } from "vitest"
import {
  computeLevel,
  linearToDb,
  levelToFraction,
  litSegments,
  decayToward,
  isClipping,
  METER_FLOOR_DB,
} from "../levels"

const from = (v: number[]) => Float32Array.from(v)

describe("computeLevel", () => {
  it("reports silence for an empty window", () => {
    expect(computeLevel(from([]))).toEqual({ rms: 0, peak: 0 })
  })

  it("reports silence for all-zero samples", () => {
    expect(computeLevel(from([0, 0, 0, 0]))).toEqual({ rms: 0, peak: 0 })
  })

  it("takes the loudest absolute sample as the peak", () => {
    expect(computeLevel(from([0.2, -0.8, 0.5])).peak).toBeCloseTo(0.8, 5)
  })

  it("computes rms, not just the average", () => {
    // Full-scale square wave: every sample is 1, so rms is 1.
    expect(computeLevel(from([1, -1, 1, -1])).rms).toBeCloseTo(1, 5)
  })

  it("puts rms below peak for a signal with quiet passages", () => {
    const level = computeLevel(from([1, 0, 0, 0]))
    expect(level.peak).toBe(1)
    expect(level.rms).toBeLessThan(level.peak)
  })
})

describe("linearToDb", () => {
  it("maps full scale to 0 dB", () => {
    expect(linearToDb(1)).toBeCloseTo(0, 5)
  })

  it("maps half amplitude to about -6 dB", () => {
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1)
  })

  // Math.log10(0) is -Infinity, which would poison every downstream calculation.
  it("floors silence instead of returning -Infinity", () => {
    expect(linearToDb(0)).toBe(METER_FLOOR_DB)
    expect(Number.isFinite(linearToDb(0))).toBe(true)
  })

  it("floors anything below the meter range", () => {
    expect(linearToDb(0.0000001)).toBe(METER_FLOOR_DB)
  })
})

describe("levelToFraction", () => {
  it("puts full scale at the top", () => {
    expect(levelToFraction(1)).toBeCloseTo(1, 5)
  })

  it("puts silence at the bottom", () => {
    expect(levelToFraction(0)).toBe(0)
  })

  it("puts half amplitude near the top, not halfway", () => {
    // -6 dB on a 60 dB scale is 90% of the way up. A linear meter would
    // show this at 50%, which is why balancing by eye never worked.
    expect(levelToFraction(0.5)).toBeCloseTo(0.9, 1)
  })

  it("never exceeds one for an over-full-scale signal", () => {
    expect(levelToFraction(2)).toBe(1)
  })
})

describe("litSegments", () => {
  it("lights every segment at full scale", () => {
    expect(litSegments(1, 10)).toBe(10)
  })

  it("lights none in silence", () => {
    expect(litSegments(0, 10)).toBe(0)
  })

  it("handles a zero-segment meter", () => {
    expect(litSegments(1, 0)).toBe(0)
  })

  it("lights a partial bar for a mid-level signal", () => {
    const lit = litSegments(0.1, 10)
    expect(lit).toBeGreaterThan(0)
    expect(lit).toBeLessThan(10)
  })
})

describe("decayToward", () => {
  it("rises instantly so transients are not missed", () => {
    expect(decayToward(0.1, 0.9, 0.05)).toBe(0.9)
  })

  it("falls gradually", () => {
    expect(decayToward(0.9, 0.1, 0.05)).toBeCloseTo(0.85, 5)
  })

  it("does not fall past the target", () => {
    expect(decayToward(0.12, 0.1, 0.05)).toBe(0.1)
  })

  it("settles exactly on silence", () => {
    expect(decayToward(0.02, 0, 0.05)).toBe(0)
  })
})

describe("isClipping", () => {
  it("flags full scale and above", () => {
    expect(isClipping(1)).toBe(true)
    expect(isClipping(1.2)).toBe(true)
  })

  it("leaves headroom unflagged", () => {
    expect(isClipping(0.99)).toBe(false)
  })
})
