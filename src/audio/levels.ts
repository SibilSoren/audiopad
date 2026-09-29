/**
 * Turning raw samples into something a meter can draw.
 *
 * Pure so the maths can be tested without an AnalyserNode: getting a meter
 * subtly wrong is very hard to notice by eye.
 */

export interface Level {
  /** Average energy, 0..1 linear. What the bar shows. */
  rms: number
  /** Loudest sample in the window, 0..1 linear. What the hold marker shows. */
  peak: number
}

export const SILENT: Level = { rms: 0, peak: 0 }

/** Meters bottom out here; below this is drawn as silence. */
export const METER_FLOOR_DB = -60

export function computeLevel(samples: Float32Array): Level {
  if (samples.length === 0) return SILENT

  let sumOfSquares = 0
  let peak = 0

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    sumOfSquares += sample * sample
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
  }

  return {
    rms: Math.sqrt(sumOfSquares / samples.length),
    peak,
  }
}

/** Linear amplitude to decibels, with a floor instead of -Infinity at zero. */
export function linearToDb(linear: number): number {
  if (linear <= 0) return METER_FLOOR_DB
  return Math.max(METER_FLOOR_DB, 20 * Math.log10(linear))
}

/**
 * Where a level sits on the meter, 0..1.
 *
 * Mapped through decibels rather than linearly: a linear bar spends most of
 * its length on the top few dB and barely moves for anything quiet, which
 * makes it useless for balancing tracks.
 */
export function levelToFraction(linear: number, floorDb = METER_FLOOR_DB): number {
  const db = linearToDb(linear)
  if (db <= floorDb) return 0
  return Math.min(1, (db - floorDb) / -floorDb)
}

/** How many of `segmentCount` LEDs should be lit. */
export function litSegments(linear: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0
  return Math.round(levelToFraction(linear) * segmentCount)
}

/**
 * Meters fall gradually rather than snapping down, so a transient stays
 * readable. Rising is instantaneous; only the decay is smoothed.
 */
export function decayToward(current: number, target: number, decayPerFrame: number): number {
  if (target >= current) return target
  return Math.max(target, current - decayPerFrame)
}

/** True once the signal is at or above 0 dBFS and the limiter is working. */
export function isClipping(peak: number): boolean {
  return peak >= 1
}
