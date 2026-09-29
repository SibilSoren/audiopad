import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { installAudioMocks, type MockAudioContext } from "../../test/audioContextMock"
import type { Clip } from "../../models/types"

async function freshEngine() {
  vi.resetModules()
  const { AudioEngine } = await import("../AudioEngine")
  return AudioEngine.getInstance()
}

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  sourceId: "s1",
  start: 0,
  offset: 0,
  duration: 2,
  fadeIn: 0,
  fadeOut: 0,
  gain: 1,
  ...over,
})

/** Loads one source, one track and one full-length clip. */
async function withOneTrack() {
  const engine = await freshEngine()
  await engine.loadSource("s1", "blob:s1")
  engine.ensureTrack("t1")
  engine.setClips([clip()])
  return engine
}

let ctx: MockAudioContext

beforeEach(() => {
  ctx = installAudioMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AudioEngine - signal chain", () => {
  it("routes the master bus through a limiter and out", async () => {
    await freshEngine()
    expect(ctx.compressors).toHaveLength(1)

    // masterGain -> limiter -> masterAnalyser -> destination. Metering sits
    // after the limiter so the master shows the true output.
    const masterAnalyser = ctx.compressors[0].connectedTo[0]
    expect(masterAnalyser).toBeDefined()
    expect((masterAnalyser as { connectedTo: unknown[] }).connectedTo).toContain(
      ctx.destination
    )
  })

  it("meters each track after its fader and mute", async () => {
    const engine = await freshEngine()
    const before = ctx.analysers.length
    engine.ensureTrack("t1")
    expect(ctx.analysers.length).toBe(before + 1)
  })

  it("gives each track a separate volume and mute stage", async () => {
    const engine = await freshEngine()
    const before = ctx.gainNodes.length
    engine.ensureTrack("t1")
    expect(ctx.gainNodes.length).toBe(before + 2)
  })

  it("reuses the nodes for a track it already knows", async () => {
    const engine = await freshEngine()
    engine.ensureTrack("t1")
    const after = ctx.gainNodes.length
    engine.ensureTrack("t1")
    expect(ctx.gainNodes.length).toBe(after)
  })

  it("holds one decoded buffer per source, however many times it is requested", async () => {
    const engine = await freshEngine()
    const a = await engine.loadSource("s1", "blob:s1")
    const b = await engine.loadSource("s1", "blob:s1")
    expect(a).toBe(b)
  })
})

describe("AudioEngine - mixer", () => {
  it("applies a volume change to the track's fader", async () => {
    const engine = await withOneTrack()
    engine.setTrackVolume("t1", 0.3)

    const faders = ctx.gainNodes.filter((n) => n.gain.value === 0.3)
    expect(faders.length).toBeGreaterThan(0)
  })

  it("drops to silence when muted without touching the fader", async () => {
    const engine = await withOneTrack()
    engine.setTrackVolume("t1", 0.3)
    engine.setTrackMuted("t1", true)

    // The fader still reads 0.3; a separate stage carries the mute.
    expect(ctx.gainNodes.some((n) => n.gain.value === 0.3)).toBe(true)
    expect(ctx.gainNodes.some((n) => n.gain.value === 0)).toBe(true)
  })

  /*
   * This was it.fails() in Phase 0. Unmuting restored a hardcoded 1.0 and
   * discarded the fader, and because solo muted every other track, one solo
   * click reset the whole project's levels.
   */
  it("restores the track's own volume when unmuted, not full scale", async () => {
    const engine = await withOneTrack()
    engine.setTrackVolume("t1", 0.3)
    engine.setTrackMuted("t1", true)
    engine.setTrackMuted("t1", false)

    // The fader was never written to by the mute, so it still holds 0.3.
    expect(ctx.gainNodes.some((n) => n.gain.value === 0.3)).toBe(true)
  })

  it("keeps a volume change made while muted", async () => {
    const engine = await withOneTrack()
    engine.setTrackMuted("t1", true)
    engine.setTrackVolume("t1", 0.42)
    engine.setTrackMuted("t1", false)

    expect(ctx.gainNodes.some((n) => n.gain.value === 0.42)).toBe(true)
  })

  it("exposes a master fader", async () => {
    const engine = await freshEngine()
    engine.setMasterVolume(0.6)
    expect(ctx.gainNodes.some((n) => n.gain.value === 0.6)).toBe(true)
  })
})

describe("AudioEngine - metering", () => {
  it("reports silence with no signal", async () => {
    const engine = await withOneTrack()
    const level = engine.getTrackLevel("t1")
    expect(level.rms).toBe(0)
    expect(level.peak).toBe(0)
  })

  it("reports silence for a track it does not know", async () => {
    const engine = await freshEngine()
    expect(engine.getTrackLevel("nope")).toEqual({ rms: 0, peak: 0 })
  })

  it("reads a signal from the track's analyser", async () => {
    const engine = await withOneTrack()
    // The track analyser is the most recently created one.
    const analyser = ctx.analysers[ctx.analysers.length - 1]
    analyser.samples = Float32Array.from([1, -1, 1, -1])

    const level = engine.getTrackLevel("t1")
    expect(level.peak).toBeCloseTo(1, 5)
    expect(level.rms).toBeCloseTo(1, 5)
  })

  it("reads the master output", async () => {
    const engine = await freshEngine()
    // The master analyser is created first, in the constructor.
    ctx.analysers[0].samples = Float32Array.from([0.5, -0.5])

    const level = engine.getMasterLevel()
    expect(level.peak).toBeCloseTo(0.5, 5)
  })
})

describe("AudioEngine - transport", () => {
  it("schedules a source per clip on play", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.ensureTrack("t2")
    engine.setClips([clip({ id: "a" }), clip({ id: "b", trackId: "t2" })])

    engine.play()
    expect(ctx.sources.filter((s) => s.started !== null)).toHaveLength(2)
  })

  it("starts every clip in a batch at one shared moment", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.ensureTrack("t2")
    engine.setClips([clip({ id: "a" }), clip({ id: "b", trackId: "t2" })])

    engine.play()
    const starts = ctx.sources.map((s) => s.started?.when)
    expect(new Set(starts).size).toBe(1)
  })

  it("schedules slightly ahead of now rather than in the past", async () => {
    const engine = await withOneTrack()
    engine.play()
    expect(ctx.sources[0].started!.when).toBeGreaterThan(ctx.currentTime)
  })

  it("offsets a clip that begins later on the timeline", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.setClips([clip({ start: 1, duration: 1 })])

    engine.play()
    const started = ctx.sources[0].started!
    expect(started.when).toBeCloseTo(ctx.currentTime + 0.05 + 1, 5)
  })

  it("keeps the paused position", async () => {
    const engine = await withOneTrack()
    engine.play()
    ctx.advance(1)
    engine.pause()
    // Audio starts one lookahead (50ms) after play, so one second of wall
    // clock is 0.95s of audible playback.
    expect(engine.currentTime).toBeCloseTo(0.95, 5)
  })

  it("returns to zero on stop", async () => {
    const engine = await withOneTrack()
    engine.play()
    ctx.advance(1)
    engine.stop()
    expect(engine.currentTime).toBe(0)
  })

  it("derives duration from the arrangement, not a hardcoded default", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.setClips([clip({ start: 0, duration: 5 }), clip({ id: "c2", start: 10, duration: 7 })])
    expect(engine.duration).toBe(17)
  })

  it("clamps a seek past the end of the arrangement", async () => {
    const engine = await withOneTrack()
    engine.seek(999)
    expect(engine.currentTime).toBe(engine.duration)
  })

  it("clamps a negative seek to zero", async () => {
    const engine = await withOneTrack()
    engine.seek(-5)
    expect(engine.currentTime).toBe(0)
  })

  it("replays from the start when play is pressed at the end", async () => {
    const engine = await withOneTrack()
    engine.seek(engine.duration)
    engine.play()
    expect(engine.currentTime).toBeLessThan(engine.duration)
  })
})

describe("AudioEngine - end of playback", () => {
  /* Was it.fails() in Phase 0: source.onended had an empty body, so isPlaying
   * stayed true and the play button never flipped back. */
  it("notifies when the arrangement plays through", async () => {
    const engine = await withOneTrack()
    const onEnded = vi.fn()
    engine.setOnEnded(onEnded)

    engine.play()
    ctx.sources[0].onended?.()

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it("does not report the end when the user pauses", async () => {
    const engine = await withOneTrack()
    const onEnded = vi.fn()
    engine.setOnEnded(onEnded)

    engine.play()
    engine.pause()

    expect(onEnded).not.toHaveBeenCalled()
  })

  it("waits for every clip before reporting the end", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.ensureTrack("t2")
    engine.setClips([clip({ id: "a" }), clip({ id: "b", trackId: "t2" })])

    const onEnded = vi.fn()
    engine.setOnEnded(onEnded)
    engine.play()

    ctx.sources[0].onended?.()
    expect(onEnded).not.toHaveBeenCalled()

    ctx.sources[1].onended?.()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})

describe("AudioEngine - arrangement changes", () => {
  /* Was it.fails() in Phase 0: loadTrack never created a source while playing,
   * so a track added mid-playback stayed silent until stop and start. */
  it("starts a clip added during playback", async () => {
    const engine = await freshEngine()
    await engine.loadSource("s1", "blob:s1")
    engine.ensureTrack("t1")
    engine.ensureTrack("t2")
    engine.setClips([clip({ id: "a" })])
    engine.play()

    const before = ctx.sources.filter((s) => s.started !== null).length
    engine.setClips([clip({ id: "a" }), clip({ id: "b", trackId: "t2" })])
    const after = ctx.sources.filter((s) => s.started !== null).length

    expect(after).toBeGreaterThan(before)
  })

  it("keeps its place when the arrangement changes mid-playback", async () => {
    const engine = await withOneTrack()
    engine.play()
    ctx.advance(0.5)
    const before = engine.currentTime
    engine.setClips([clip(), clip({ id: "c2", start: 1 })])

    // Editing the arrangement must not walk the transport backwards.
    expect(engine.currentTime).toBeCloseTo(before, 5)
  })

  it("disconnects a removed track's nodes", async () => {
    const engine = await withOneTrack()
    engine.removeTrack("t1")
    expect(ctx.gainNodes.filter((n) => n.disconnected).length).toBeGreaterThanOrEqual(2)
  })
})
