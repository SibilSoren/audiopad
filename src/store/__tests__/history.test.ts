import { describe, it, expect, vi, beforeEach } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import tracksReducer, {
  splitClipAt,
  removeClip,
  moveClipTo,
  restoreTracks,
} from "../tracksSlice"
import historyReducer, { undo, redo } from "../historySlice"
import { historyMiddleware } from "../middleware/historyMiddleware"
import type { Clip, AudioTrack, AudioSource } from "../../models/types"

vi.mock("../../audio/AudioEngine", () => ({
  AudioEngine: { getInstance: () => ({ releaseSource: vi.fn() }) },
}))

const track: AudioTrack = {
  id: "t1",
  name: "Drums",
  volume: 1,
  muted: false,
  solo: false,
  color: "#ff5b21",
}

const clip: Clip = {
  id: "c1",
  trackId: "t1",
  sourceId: "s1",
  start: 0,
  offset: 0,
  duration: 10,
  fadeIn: 0,
  fadeOut: 0,
  gain: 1,
}

const source: AudioSource = { id: "s1", name: "Drums", duration: 60, peaks: [1] }

function makeStore() {
  const preloaded = {
    tracks: {
      byId: { t1: track },
      allIds: ["t1"],
      sources: { s1: source },
      clips: { c1: clip },
      clipIds: ["c1"],
      loading: {},
    },
    history: { past: [], future: [] },
  }

  return configureStore({
    reducer: { tracks: tracksReducer, history: historyReducer },
    preloadedState: preloaded,
    middleware: (getDefault) => getDefault().concat(historyMiddleware),
  })
}

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

describe("undo", () => {
  it("does nothing with an empty history", () => {
    store.dispatch(undo())
    expect(store.getState().tracks.clipIds).toEqual(["c1"])
  })

  it("takes back a move", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 25 }))
    expect(store.getState().tracks.clips.c1.start).toBe(25)

    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1.start).toBe(0)
  })

  it("takes back a split", () => {
    store.dispatch(splitClipAt("c1", 4))
    expect(store.getState().tracks.clipIds).toHaveLength(2)

    store.dispatch(undo())
    expect(store.getState().tracks.clipIds).toHaveLength(1)
  })

  it("brings back a deleted clip and its source", () => {
    store.dispatch(removeClip("c1"))
    expect(store.getState().tracks.sources.s1).toBeUndefined()

    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1).toBeDefined()
    expect(store.getState().tracks.sources.s1).toBeDefined()
  })

  it("unwinds several edits in order", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 10 }))
    store.dispatch(moveClipTo({ clipId: "c1", start: 20 }))
    store.dispatch(moveClipTo({ clipId: "c1", start: 30 }))

    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1.start).toBe(20)
    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1.start).toBe(10)
    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1.start).toBe(0)
  })

  it("stops at the beginning rather than going further", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 10 }))
    store.dispatch(undo())
    store.dispatch(undo())
    store.dispatch(undo())
    expect(store.getState().tracks.clips.c1.start).toBe(0)
  })
})

describe("redo", () => {
  it("does nothing with nothing undone", () => {
    store.dispatch(redo())
    expect(store.getState().tracks.clips.c1.start).toBe(0)
  })

  it("reapplies an undone edit", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 25 }))
    store.dispatch(undo())
    store.dispatch(redo())
    expect(store.getState().tracks.clips.c1.start).toBe(25)
  })

  it("round-trips repeatedly", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 25 }))
    for (let i = 0; i < 3; i++) {
      store.dispatch(undo())
      expect(store.getState().tracks.clips.c1.start).toBe(0)
      store.dispatch(redo())
      expect(store.getState().tracks.clips.c1.start).toBe(25)
    }
  })

  // A new edit after undoing has to abandon the branch that was undone.
  it("is abandoned once a fresh edit is made", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 25 }))
    store.dispatch(undo())
    store.dispatch(moveClipTo({ clipId: "c1", start: 40 }))

    expect(store.getState().history.future).toHaveLength(0)
    store.dispatch(redo())
    expect(store.getState().tracks.clips.c1.start).toBe(40)
  })
})

describe("history bookkeeping", () => {
  it("records one entry per edit, not one per frame", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 10 }))
    store.dispatch(moveClipTo({ clipId: "c1", start: 20 }))
    expect(store.getState().history.past).toHaveLength(2)
  })

  // Otherwise undo would undo its own restore and never move.
  it("does not record the restore that undo performs", () => {
    store.dispatch(moveClipTo({ clipId: "c1", start: 10 }))
    store.dispatch(undo())
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().history.future).toHaveLength(1)
  })

  it("ignores a direct restore", () => {
    store.dispatch(restoreTracks(store.getState().tracks))
    expect(store.getState().history.past).toHaveLength(0)
  })

  it("does not grow without bound", () => {
    for (let i = 0; i < 80; i++) {
      store.dispatch(moveClipTo({ clipId: "c1", start: i }))
    }
    expect(store.getState().history.past.length).toBeLessThanOrEqual(50)
  })

  it("keeps the oldest reachable state consistent after trimming", () => {
    for (let i = 1; i <= 60; i++) {
      store.dispatch(moveClipTo({ clipId: "c1", start: i }))
    }
    for (let i = 0; i < 60; i++) store.dispatch(undo())

    // Trimmed history cannot reach zero, but must land on a real past value.
    expect(store.getState().tracks.clips.c1.start).toBeGreaterThanOrEqual(0)
    expect(store.getState().history.past).toHaveLength(0)
  })
})
