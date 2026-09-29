import { vi } from "vitest"

/**
 * A minimal AudioContext good enough to drive AudioEngine in Node.
 *
 * It records every gain change so tests can assert on what the mixer actually
 * did, rather than on what the store thinks it did - the two diverging is the
 * whole class of bug this exists to catch.
 */

export interface GainChange {
  value: number
  atTime: number
}

export class MockAudioParam {
  value = 1
  readonly changes: GainChange[] = []

  setTargetAtTime(value: number, atTime: number) {
    this.value = value
    this.changes.push({ value, atTime })
    return this
  }

  linearRampToValueAtTime(value: number, atTime: number) {
    this.value = value
    this.changes.push({ value, atTime })
    return this
  }

  setValueAtTime(value: number, atTime: number) {
    this.value = value
    this.changes.push({ value, atTime })
    return this
  }

  cancelScheduledValues() {
    return this
  }
}

export class MockGainNode {
  readonly gain = new MockAudioParam()
  readonly connectedTo: unknown[] = []
  disconnected = false

  connect(target: unknown) {
    this.connectedTo.push(target)
    return target
  }

  disconnect() {
    this.disconnected = true
  }
}

export class MockBufferSource {
  buffer: unknown = null
  onended: (() => void) | null = null
  started: { when: number; offset?: number; duration?: number } | null = null
  stopped = false
  readonly connectedTo: unknown[] = []

  connect(target: unknown) {
    this.connectedTo.push(target)
    return target
  }

  disconnect() {}

  start(when = 0, offset?: number, duration?: number) {
    this.started = { when, offset, duration }
  }

  stop() {
    this.stopped = true
  }
}

export class MockCompressorNode {
  readonly threshold = new MockAudioParam()
  readonly knee = new MockAudioParam()
  readonly ratio = new MockAudioParam()
  readonly attack = new MockAudioParam()
  readonly release = new MockAudioParam()
  readonly connectedTo: unknown[] = []

  connect(target: unknown) {
    this.connectedTo.push(target)
    return target
  }

  disconnect() {}
}

export class MockAudioContext {
  currentTime = 0
  state: "running" | "suspended" = "running"
  readonly destination = { id: "destination" }
  readonly gainNodes: MockGainNode[] = []
  readonly sources: MockBufferSource[] = []
  readonly compressors: MockCompressorNode[] = []

  createGain() {
    const node = new MockGainNode()
    this.gainNodes.push(node)
    return node as unknown as GainNode
  }

  createDynamicsCompressor() {
    const node = new MockCompressorNode()
    this.compressors.push(node)
    return node as unknown as DynamicsCompressorNode
  }

  createBufferSource() {
    const source = new MockBufferSource()
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  async resume() {
    this.state = "running"
  }

  async decodeAudioData() {
    return makeAudioBuffer(2)
  }

  /** Advance the clock, the way time passing would. */
  advance(seconds: number) {
    this.currentTime += seconds
  }
}

/** A stand-in AudioBuffer - only the fields the engine and peaks code read. */
export function makeAudioBuffer(duration = 2, sampleRate = 44100): AudioBuffer {
  const length = Math.floor(duration * sampleRate)
  const data = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0.5
  }
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer
}

/**
 * Installs the mock as window.AudioContext and stubs fetch, so
 * loadAudioBuffer() resolves without network access.
 */
export function installAudioMocks() {
  const ctx = new MockAudioContext()
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return ctx
      }
    }
  )
  vi.stubGlobal("fetch", async () => ({
    arrayBuffer: async () => new ArrayBuffer(8),
  }))
  return ctx
}
