import { describe, it, expect, vi, beforeEach } from "vitest"
import reducer, {
  splitClipAt,
  removeClip,
  moveClipTo,
  trimClipEnd,
  setClipFades,
  toggleSolo,
  toggleMute,
  setVolume,
  removeTrack,
} from "../tracksSlice"
import type { Clip, AudioTrack, AudioSource } from "../../models/types"

// The slice releases buffers through the engine, which needs an AudioContext.
vi.mock("../../audio/AudioEngine", () => ({
  AudioEngine: {
    getInstance: () => ({ releaseSource: vi.fn() }),
  },
}))

const track = (over: Partial<AudioTrack> = {}): AudioTrack => ({
  id: "t1",
  name: "Drums",
  volume: 1,
  muted: false,
  solo: false,
  color: "#ff5b21",
  ...over,
})

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

const source = (over: Partial<AudioSource> = {}): AudioSource => ({
  id: "s1",
  name: "Drums",
  duration: 60,
  peaks: [0.5, 0.5],
  ...over,
})

function stateWith(overrides: {
  tracks?: AudioTrack[]
  clips?: Clip[]
  sources?: AudioSource[]
}) {
  const tracks = overrides.tracks ?? [track()]
  const clips = overrides.clips ?? [clip()]
  const sources = overrides.sources ?? [source()]

  return {
    byId: Object.fromEntries(tracks.map((t) => [t.id, t])),
    allIds: tracks.map((t) => t.id),
    sources: Object.fromEntries(sources.map((s) => [s.id, s])),
    clips: Object.fromEntries(clips.map((c) => [c.id, c])),
    clipIds: clips.map((c) => c.id),
    loading: {},
  }
}

let state: ReturnType<typeof stateWith>

beforeEach(() => {
  state = stateWith({})
})

describe("splitClipAt", () => {
  it("turns one clip into two and registers the new id", () => {
    const next = reducer(state, splitClipAt("c1", 4))

    expect(next.clipIds).toHaveLength(2)
    expect(Object.keys(next.clips)).toHaveLength(2)
  })

  it("leaves the halves abutting, with no gap or overlap", () => {
    const next = reducer(state, splitClipAt("c1", 4))
    const [a, b] = next.clipIds.map((id) => next.clips[id])

    expect(a.start + a.duration).toBeCloseTo(b.start, 10)
  })

  it("keeps both halves on the same source", () => {
    const next = reducer(state, splitClipAt("c1", 4))
    const sourceIds = next.clipIds.map((id) => next.clips[id].sourceId)
    expect(new Set(sourceIds).size).toBe(1)
  })

  it("ignores a cut outside the clip", () => {
    const next = reducer(state, splitClipAt("c1", 99))
    expect(next.clipIds).toHaveLength(1)
  })

  it("ignores a cut on an unknown clip", () => {
    const next = reducer(state, splitClipAt("nope", 4))
    expect(next.clipIds).toHaveLength(1)
  })

  it("can split repeatedly", () => {
    let next = reducer(state, splitClipAt("c1", 5))
    const secondId = next.clipIds[1]
    next = reducer(next, splitClipAt(secondId, 7))
    expect(next.clipIds).toHaveLength(3)
  })
})

describe("removeClip", () => {
  it("drops the clip", () => {
    const next = reducer(state, removeClip("c1"))
    expect(next.clipIds).toHaveLength(0)
    expect(next.clips.c1).toBeUndefined()
  })

  it("releases the source once nothing cites it", () => {
    const next = reducer(state, removeClip("c1"))
    expect(next.sources.s1).toBeUndefined()
  })

  // Two halves of a split share a buffer: removing one must not free it.
  it("keeps the source while another clip still uses it", () => {
    const shared = stateWith({
      clips: [clip({ id: "c1" }), clip({ id: "c2", start: 10 })],
    })
    const next = reducer(shared, removeClip("c1"))
    expect(next.sources.s1).toBeDefined()
  })

  it("ignores an unknown clip", () => {
    const next = reducer(state, removeClip("nope"))
    expect(next.clipIds).toHaveLength(1)
  })
})

describe("clip edits", () => {
  it("moves a clip along its track", () => {
    const next = reducer(state, moveClipTo({ clipId: "c1", start: 12 }))
    expect(next.clips.c1.start).toBe(12)
  })

  it("bounds a trim by the source length", () => {
    // The clip starts 55s into a 60s source, so only 5s remain.
    const short = stateWith({ clips: [clip({ offset: 55, duration: 3 })] })
    const next = reducer(short, trimClipEnd({ clipId: "c1", end: 999 }))
    expect(next.clips.c1.duration).toBe(5)
  })

  it("clamps fades to the clip", () => {
    const next = reducer(state, setClipFades({ clipId: "c1", fadeIn: 99, fadeOut: 99 }))
    const { fadeIn, fadeOut } = next.clips.c1
    expect(fadeIn + fadeOut).toBeLessThanOrEqual(next.clips.c1.duration)
  })
})

describe("mixer state", () => {
  it("keeps solo exclusive", () => {
    const two = stateWith({
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [clip()],
    })
    let next = reducer(two, toggleSolo("t1"))
    next = reducer(next, toggleSolo("t2"))

    expect(next.byId.t1.solo).toBe(false)
    expect(next.byId.t2.solo).toBe(true)
  })

  // The bug that started all this: mute must not disturb the fader.
  it("leaves volume untouched when muting", () => {
    let next = reducer(state, setVolume({ id: "t1", volume: 0.3 }))
    next = reducer(next, toggleMute("t1"))
    next = reducer(next, toggleMute("t1"))

    expect(next.byId.t1.volume).toBe(0.3)
  })
})

describe("removeTrack", () => {
  it("removes the track and its clips together", () => {
    const next = reducer(state, removeTrack("t1"))
    expect(next.allIds).toHaveLength(0)
    expect(next.clipIds).toHaveLength(0)
  })

  it("leaves another track's clips alone", () => {
    const two = stateWith({
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [clip({ id: "c1", trackId: "t1" }), clip({ id: "c2", trackId: "t2" })],
    })
    const next = reducer(two, removeTrack("t1"))

    expect(next.clipIds).toEqual(["c2"])
  })
})
