/**
 * Waveform peak extraction.
 *
 * Split out from AudioUtils so it can be tested against a plain Float32Array
 * rather than needing a decoded AudioBuffer.
 */

/**
 * Reduce raw samples to `bucketCount` absolute peaks for drawing.
 *
 * Uses a fractional bucket width rather than `Math.floor(length / count)`,
 * which returned 0 for clips shorter than the bucket count (drawing a flat
 * line for anything under ~10ms) and silently dropped the remainder at the
 * end of every longer clip.
 */
export function computePeaks(samples: Float32Array, bucketCount: number): number[] {
  if (bucketCount <= 0 || samples.length === 0) {
    return []
  }

  const peaks: number[] = new Array(bucketCount)
  const bucketWidth = samples.length / bucketCount

  for (let i = 0; i < bucketCount; i++) {
    const start = Math.floor(i * bucketWidth)
    // Always consume at least one sample, so short buffers still produce a shape.
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketWidth))
    let max = 0

    for (let j = start; j < end && j < samples.length; j++) {
      const abs = Math.abs(samples[j])
      if (abs > max) max = abs
    }

    peaks[i] = max
  }

  return peaks
}
