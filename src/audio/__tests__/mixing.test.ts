import { describe, it, expect } from "vitest"
import {
  hasAnySolo,
  effectiveMute,
  effectiveGain,
  clampVolume,
  type MixableTrack,
} from "../mixing"

const track = (over: Partial<MixableTrack> = {}): MixableTrack => ({
  muted: false,
  solo: false,
  volume: 1,
  ...over,
})

describe("hasAnySolo", () => {
  it("is false for an empty mixer", () => {
    expect(hasAnySolo([])).toBe(false)
  })

  it("is false when nothing is soloed", () => {
    expect(hasAnySolo([track(), track()])).toBe(false)
  })

  it("is true when any track is soloed", () => {
    expect(hasAnySolo([track(), track({ solo: true })])).toBe(true)
  })
})

describe("effectiveMute", () => {
  it("leaves a plain track audible", () => {
    expect(effectiveMute(track(), false)).toBe(false)
  })

  it("silences an explicitly muted track", () => {
    expect(effectiveMute(track({ muted: true }), false)).toBe(true)
  })

  it("silences non-soloed tracks once anything is soloed", () => {
    expect(effectiveMute(track(), true)).toBe(true)
  })

  it("keeps the soloed track audible", () => {
    expect(effectiveMute(track({ solo: true }), true)).toBe(false)
  })

  // The old solo path called muteTrack(id, !track.solo) for every track, which
  // ignored the mute flag and made a soloed-and-muted track audible.
  it("keeps an explicit mute winning over solo", () => {
    expect(effectiveMute(track({ solo: true, muted: true }), true)).toBe(true)
  })
})

describe("effectiveGain", () => {
  it("passes the track's volume through when audible", () => {
    expect(effectiveGain(track({ volume: 0.3 }), false)).toBe(0.3)
  })

  it("is zero when muted", () => {
    expect(effectiveGain(track({ volume: 0.3, muted: true }), false)).toBe(0)
  })

  // This is the regression that mattered: unmuting used to restore gain to a
  // hardcoded 1.0, so a track sitting at 0.3 jumped to full volume while its
  // slider still read 0.3.
  it("restores the track's own volume when unmuted, not full scale", () => {
    const quiet = track({ volume: 0.3, muted: false })
    expect(effectiveGain(quiet, false)).toBe(0.3)
    expect(effectiveGain(quiet, false)).not.toBe(1)
  })

  // Toggling solo used to reset every track in the project to 1.0.
  it("preserves each track's volume through a solo toggle", () => {
    const a = track({ volume: 0.2, solo: true })
    const b = track({ volume: 0.8 })

    expect(effectiveGain(a, true)).toBe(0.2)
    expect(effectiveGain(b, true)).toBe(0)
    // Solo released - b comes back at its own level, not full scale.
    expect(effectiveGain(b, false)).toBe(0.8)
  })
})

describe("clampVolume", () => {
  it("passes valid values through", () => {
    expect(clampVolume(0.5)).toBe(0.5)
  })

  it("clamps out-of-range values", () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(2)).toBe(1)
  })

  it("treats NaN as silence rather than propagating it into the gain graph", () => {
    expect(clampVolume(NaN)).toBe(0)
  })
})
