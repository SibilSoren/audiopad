import { AudioEngine } from './AudioEngine'
import { decayToward, type Level } from './levels'

/**
 * One animation frame drives every meter on screen.
 *
 * Deliberately outside React: meters update at 60fps and rendering that
 * through component state would re-render the whole mixer sixty times a
 * second. Subscribers write straight to their own DOM nodes.
 */

export type MeterTarget = string | 'master'

export interface MeterFrame {
  /** Smoothed bar level, 0..1 linear. */
  value: number
  /** Peak hold, 0..1 linear. */
  hold: number
  clipping: boolean
}

type Listener = (frame: MeterFrame) => void

interface Subscription {
  target: MeterTarget
  listener: Listener
  value: number
  hold: number
  holdFramesLeft: number
}

/** Roughly 20 dB per second at 60fps for the bar. */
const BAR_DECAY = 0.02
/** Peak marker sits still for ~1s, then falls slowly. */
const HOLD_FRAMES = 60
const HOLD_DECAY = 0.006

const subscriptions = new Map<number, Subscription>()
let nextId = 0
let rafId = 0

function readLevel(target: MeterTarget): Level {
  const engine = AudioEngine.getInstance()
  return target === 'master'
    ? engine.getMasterLevel()
    : engine.getTrackLevel(target)
}

function tick() {
  for (const sub of subscriptions.values()) {
    const level = readLevel(sub.target)

    sub.value = decayToward(sub.value, level.rms, BAR_DECAY)

    if (level.peak >= sub.hold) {
      sub.hold = level.peak
      sub.holdFramesLeft = HOLD_FRAMES
    } else if (sub.holdFramesLeft > 0) {
      sub.holdFramesLeft--
    } else {
      sub.hold = decayToward(sub.hold, level.peak, HOLD_DECAY)
    }

    sub.listener({
      value: sub.value,
      hold: sub.hold,
      clipping: level.peak >= 1,
    })
  }

  rafId = subscriptions.size > 0 ? requestAnimationFrame(tick) : 0
}

export function subscribeMeter(target: MeterTarget, listener: Listener): () => void {
  const id = nextId++
  subscriptions.set(id, {
    target,
    listener,
    value: 0,
    hold: 0,
    holdFramesLeft: 0,
  })

  // The loop only runs while something is listening.
  if (rafId === 0) {
    rafId = requestAnimationFrame(tick)
  }

  return () => {
    subscriptions.delete(id)
    if (subscriptions.size === 0 && rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}
