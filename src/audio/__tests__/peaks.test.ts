import { describe, it, expect } from "vitest"
import { computePeaks } from "../peaks"

const from = (values: number[]) => Float32Array.from(values)

describe("computePeaks", () => {
  it("returns one value per requested bucket", () => {
    expect(computePeaks(from([0, 1, 0, 1, 0, 1, 0, 1]), 4)).toHaveLength(4)
  })

  it("takes the absolute peak within each bucket", () => {
    // Two buckets: [0.1, -0.9] and [0.3, 0.2]. Compared loosely because
    // Float32Array rounds 0.9 to 0.8999999761581421.
    const peaks = computePeaks(from([0.1, -0.9, 0.3, 0.2]), 2)
    expect(peaks[0]).toBeCloseTo(0.9, 5)
    expect(peaks[1]).toBeCloseTo(0.3, 5)
  })

  it("treats negative excursions as peaks", () => {
    expect(computePeaks(from([-1, -0.5]), 1)).toEqual([1])
  })

  // The old implementation used Math.floor(length / count) as a block size, so
  // any buffer shorter than the bucket count gave a block size of 0 and drew a
  // flat line.
  it("still produces a shape when there are fewer samples than buckets", () => {
    const peaks = computePeaks(from([0.5, 1]), 8)
    expect(peaks).toHaveLength(8)
    expect(peaks.some((p) => p > 0)).toBe(true)
  })

  // Flooring the block size also discarded every sample past count * blockSize.
  it("does not drop the tail of the buffer", () => {
    // 7 samples into 2 buckets: the loud sample is in the dropped remainder.
    const peaks = computePeaks(from([0, 0, 0, 0, 0, 0, 1]), 2)
    expect(Math.max(...peaks)).toBe(1)
  })

  it("handles empty input", () => {
    expect(computePeaks(from([]), 10)).toEqual([])
  })

  it("handles a zero bucket count", () => {
    expect(computePeaks(from([1, 2, 3]), 0)).toEqual([])
  })

  it("reports silence as zero rather than NaN", () => {
    expect(computePeaks(from([0, 0, 0, 0]), 2)).toEqual([0, 0])
  })
})
