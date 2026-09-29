import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { installAudioMocks, type MockAudioContext } from "../../test/audioContextMock"

/**
 * AudioEngine is a singleton, so each test re-imports the module to get a fresh
 * instance rather than leaking mixer state between cases.
 */
async function freshEngine() {
  vi.resetModules()
  const { AudioEngine } = await import("../AudioEngine")
  return AudioEngine.getInstance()
}

let ctx: MockAudioContext

beforeEach(() => {
  ctx = installAudioMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AudioEngine - track loading", () => {
  it("creates a gain node per track and connects it downstream", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")

    expect(ctx.gainNodes.length).toBeGreaterThan(0)
    expect(ctx.gainNodes[0].connectedTo.length).toBeGreaterThan(0)
  })

  it("disconnects the gain node when a track is removed", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.removeTrack("a")

    expect(ctx.gainNodes.some((n) => n.disconnected)).toBe(true)
  })
})

describe("AudioEngine - transport", () => {
  it("starts a source per loaded track on play", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    await engine.loadTrack("b", "blob:b")

    engine.play()

    expect(ctx.sources.filter((s) => s.started !== null)).toHaveLength(2)
  })

  it("stops sources on pause", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.play()
    engine.pause()

    expect(ctx.sources.every((s) => s.stopped)).toBe(true)
  })

  it("returns to zero on stop", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.play()
    ctx.advance(1.5)
    engine.stop()

    expect(engine.currentTime).toBe(0)
  })

  it("keeps the paused position", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.play()
    ctx.advance(1.5)
    engine.pause()

    expect(engine.currentTime).toBeCloseTo(1.5, 5)
  })
})

describe("AudioEngine - mixer", () => {
  it("applies a volume change to the track's gain", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.setTrackVolume("a", 0.3)

    expect(ctx.gainNodes[0].gain.value).toBeCloseTo(0.3, 5)
  })

  it("drops gain to zero when muted", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.setTrackVolume("a", 0.3)
    engine.muteTrack("a", true)

    expect(ctx.gainNodes[0].gain.value).toBe(0)
  })

  /*
   * KNOWN BUG - Phase 1 fixes this.
   *
   * muteTrack(id, false) restores gain to a hardcoded 1.0 instead of the
   * track's own volume, so a track sitting at 0.3 jumps to full scale while
   * its slider still reads 0.3. The solo path calls muteTrack for every track,
   * so one solo toggle resets the whole project.
   *
   * it.fails() asserts this is *currently broken*: the suite stays green now,
   * and turns red the moment the bug is fixed - at which point this becomes a
   * normal it().
   */
  it.fails("restores the track's own volume when unmuted, not full scale", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.setTrackVolume("a", 0.3)
    engine.muteTrack("a", true)
    engine.muteTrack("a", false)

    expect(ctx.gainNodes[0].gain.value).toBeCloseTo(0.3, 5)
  })
})

describe("AudioEngine - known gaps (Phase 1)", () => {
  /* Playback end is never detected: source.onended has an empty body, so
   * isPlaying stays true and the play button never flips back. */
  it.fails("notifies when playback reaches the end", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")

    const onEnded = vi.fn()
    ;(engine as unknown as { setOnEnded?: (cb: () => void) => void }).setOnEnded?.(onEnded)

    engine.play()
    ctx.sources[0].onended?.()

    expect(onEnded).toHaveBeenCalled()
  })

  /* A track loaded while the transport is running never gets a source, so it
   * stays silent until the user stops and starts again. */
  it.fails("starts a track added during playback", async () => {
    const engine = await freshEngine()
    await engine.loadTrack("a", "blob:a")
    engine.play()

    const before = ctx.sources.filter((s) => s.started !== null).length
    await engine.loadTrack("b", "blob:b")
    const after = ctx.sources.filter((s) => s.started !== null).length

    expect(after).toBe(before + 1)
  })
})
