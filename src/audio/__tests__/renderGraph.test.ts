import { describe, it, expect, vi } from "vitest"
import { renderArrangement, configureLimiter, scheduleClipSources } from "../renderGraph"
import { MockAudioContext, makeAudioBuffer } from "../../test/audioContextMock"
import type { Clip } from "../../models/types"

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  sourceId: "s1",
  start: 0,
  offset: 0,
  duration: 5,
  fadeIn: 0,
  fadeOut: 0,
  gain: 1,
  ...over,
})

describe("renderArrangement", () => {
  // OfflineAudioContext does not exist here, so only the guard is reachable -
  // but an empty export silently producing a zero-length file is the failure
  // worth catching anyway.
  it("refuses to render an empty arrangement", async () => {
    await expect(
      renderArrangement({
        clips: [],
        tracks: [],
        buffers: new Map(),
        masterVolume: 1,
        duration: 0,
      })
    ).rejects.toThrow(/empty/i)
  })
})

describe("configureLimiter", () => {
  it("sets a brickwall just below full scale", () => {
    const ctx = new MockAudioContext()
    const limiter = ctx.createDynamicsCompressor()
    configureLimiter(limiter)

    expect(limiter.threshold.value).toBe(-1)
    expect(limiter.ratio.value).toBe(20)
    expect(limiter.knee.value).toBe(0)
  })
})

describe("scheduleClipSources", () => {
  const setup = () => {
    const ctx = new MockAudioContext()
    const buffers = new Map([["s1", makeAudioBuffer(10)]])
    const input = ctx.createGain()
    return { ctx, buffers, input }
  }

  it("starts one source per scheduled clip", () => {
    const { ctx, buffers, input } = setup()
    const started = scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip({ id: "a" }), clip({ id: "b", start: 5 })],
      buffers,
      trackInput: () => input,
      origin: 0,
      from: 0,
    })
    expect(started).toHaveLength(2)
  })

  it("skips a clip whose track has no input", () => {
    const { ctx, buffers } = setup()
    const started = scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip()],
      buffers,
      trackInput: () => null,
      origin: 0,
      from: 0,
    })
    expect(started).toHaveLength(0)
  })

  it("skips a clip whose audio has not been decoded", () => {
    const { ctx, input } = setup()
    const started = scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip({ sourceId: "missing" })],
      buffers: new Map(),
      trackInput: () => input,
      origin: 0,
      from: 0,
    })
    expect(started).toHaveLength(0)
  })

  it("offsets a later clip from the shared origin", () => {
    const { ctx, buffers, input } = setup()
    scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip({ start: 3 })],
      buffers,
      trackInput: () => input,
      origin: 100,
      from: 0,
    })
    expect(ctx.sources[0].started?.when).toBeCloseTo(103, 6)
  })

  it("ramps a fade-in rather than jumping to full gain", () => {
    const { ctx, buffers, input } = setup()
    scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip({ fadeIn: 2 })],
      buffers,
      trackInput: () => input,
      origin: 0,
      from: 0,
    })
    // The clip gain is the most recently created node.
    const clipGain = ctx.gainNodes[ctx.gainNodes.length - 1]
    expect(clipGain.gain.changes[0].value).toBe(0)
    expect(clipGain.gain.changes.at(-1)?.value).toBe(1)
  })

  it("reports a natural ending", () => {
    const { ctx, buffers, input } = setup()
    const onEnded = vi.fn()
    scheduleClipSources({
      context: ctx as unknown as BaseAudioContext,
      clips: [clip()],
      buffers,
      trackInput: () => input,
      origin: 0,
      from: 0,
      onEnded,
    })
    ctx.sources[0].onended?.()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
