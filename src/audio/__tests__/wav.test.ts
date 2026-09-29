import { describe, it, expect } from "vitest"
import { encodeWav, exportFilename } from "../wav"

const ascii = (view: DataView, offset: number, length: number) =>
  Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("")

const mono = (values: number[]) => [Float32Array.from(values)]

describe("encodeWav - container", () => {
  it("writes a RIFF/WAVE header", () => {
    const view = new DataView(encodeWav(mono([0, 0]), 44100))
    expect(ascii(view, 0, 4)).toBe("RIFF")
    expect(ascii(view, 8, 4)).toBe("WAVE")
    expect(ascii(view, 12, 4)).toBe("fmt ")
    expect(ascii(view, 36, 4)).toBe("data")
  })

  it("declares uncompressed PCM", () => {
    const view = new DataView(encodeWav(mono([0]), 44100))
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
  })

  it("records channel count, rate and depth", () => {
    const stereo = [Float32Array.from([0, 0]), Float32Array.from([0, 0])]
    const view = new DataView(encodeWav(stereo, 48000, 24))
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint16(34, true)).toBe(24)
  })

  it("computes block align and byte rate from them", () => {
    const stereo = [Float32Array.from([0]), Float32Array.from([0])]
    const view = new DataView(encodeWav(stereo, 44100, 16))
    expect(view.getUint16(32, true)).toBe(4) // 2ch * 2 bytes
    expect(view.getUint32(28, true)).toBe(44100 * 4)
  })

  // A wrong size here yields a file players silently refuse to open.
  it("sizes the RIFF and data chunks to the payload", () => {
    const buffer = encodeWav(mono([0, 0, 0, 0]), 44100, 16)
    const view = new DataView(buffer)
    expect(buffer.byteLength).toBe(44 + 8)
    expect(view.getUint32(4, true)).toBe(36 + 8)
    expect(view.getUint32(40, true)).toBe(8)
  })

  it("produces a header-only file for empty input", () => {
    expect(encodeWav([Float32Array.from([])], 44100).byteLength).toBe(44)
  })
})

describe("encodeWav - samples", () => {
  it("writes silence as zero", () => {
    const view = new DataView(encodeWav(mono([0]), 44100, 16))
    expect(view.getInt16(44, true)).toBe(0)
  })

  it("writes full scale at the 16-bit maximum", () => {
    const view = new DataView(encodeWav(mono([1]), 44100, 16))
    expect(view.getInt16(44, true)).toBe(32767)
  })

  // Signed 16-bit is asymmetric: -32768 exists, +32768 does not.
  it("uses the full negative range", () => {
    const view = new DataView(encodeWav(mono([-1]), 44100, 16))
    expect(view.getInt16(44, true)).toBe(-32768)
  })

  it("clamps overs instead of wrapping them", () => {
    const view = new DataView(encodeWav(mono([2, -2]), 44100, 16))
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })

  it("treats NaN as silence rather than writing rubbish", () => {
    const view = new DataView(encodeWav(mono([NaN]), 44100, 16))
    expect(view.getInt16(44, true)).toBe(0)
  })

  it("interleaves channels frame by frame", () => {
    const left = Float32Array.from([1, 0])
    const right = Float32Array.from([0, -1])
    const view = new DataView(encodeWav([left, right], 44100, 16))

    expect(view.getInt16(44, true)).toBe(32767) // L frame 0
    expect(view.getInt16(46, true)).toBe(0) // R frame 0
    expect(view.getInt16(48, true)).toBe(0) // L frame 1
    expect(view.getInt16(50, true)).toBe(-32768) // R frame 1
  })

  it("pads a short channel with silence rather than truncating the file", () => {
    const left = Float32Array.from([1, 1, 1])
    const right = Float32Array.from([1])
    const view = new DataView(encodeWav([left, right], 44100, 16))

    expect(view.getUint32(40, true)).toBe(3 * 2 * 2)
    expect(view.getInt16(50, true)).toBe(0) // R frame 1, padded
  })

  it("writes three bytes per sample at 24-bit", () => {
    const buffer = encodeWav(mono([0, 0]), 44100, 24)
    expect(buffer.byteLength).toBe(44 + 6)
  })

  it("writes 24-bit samples little-endian", () => {
    const view = new DataView(encodeWav(mono([1]), 44100, 24))
    expect(view.getUint8(44)).toBe(0xff)
    expect(view.getUint8(45)).toBe(0xff)
    expect(view.getUint8(46)).toBe(0x7f)
  })
})

describe("exportFilename", () => {
  it("ends in .wav", () => {
    expect(exportFilename()).toMatch(/\.wav$/)
  })

  it("carries a timestamp so exports do not overwrite each other", () => {
    expect(exportFilename()).toMatch(/^audiopad-mix-\d{12}\.wav$/)
  })
})
