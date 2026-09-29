/**
 * WAV encoding.
 *
 * Written against plain Float32Arrays rather than an AudioBuffer so the byte
 * layout can be tested without an audio context. A header field in the wrong
 * place produces a file that silently fails to open, which is not something
 * you want to discover by downloading one.
 */

export type BitDepth = 16 | 24

const RIFF_HEADER_BYTES = 44

/** Clamp to the representable range before quantising, so overs wrap to the
 *  loudest sample rather than round to the quietest. */
function clampSample(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(-1, Math.min(1, value))
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

/**
 * Interleaved PCM in a RIFF container.
 *
 * Channels are expected to be the same length; a short one is padded with
 * silence rather than truncating the whole file to its length.
 */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
  bitDepth: BitDepth = 16
): ArrayBuffer {
  const channelCount = Math.max(1, channels.length)
  const frameCount = channels.reduce((max, c) => Math.max(max, c.length), 0)
  const bytesPerSample = bitDepth / 8
  const blockAlign = channelCount * bytesPerSample
  const dataBytes = frameCount * blockAlign

  const buffer = new ArrayBuffer(RIFF_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  // Everything after this field, so the total size minus the first 8 bytes.
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk length
  view.setUint16(20, 1, true) // format: uncompressed PCM
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = RIFF_HEADER_BYTES

  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = clampSample(channels[channel]?.[frame] ?? 0)

      if (bitDepth === 16) {
        // Asymmetric on purpose: signed 16-bit reaches -32768 but only 32767.
        view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true)
        offset += 2
      } else {
        const value = Math.round(sample * (sample < 0 ? 0x800000 : 0x7fffff))
        view.setUint8(offset, value & 0xff)
        view.setUint8(offset + 1, (value >> 8) & 0xff)
        view.setUint8(offset + 2, (value >> 16) & 0xff)
        offset += 3
      }
    }
  }

  return buffer
}

/** Pull the channels out of a rendered AudioBuffer and encode them. */
export function encodeAudioBuffer(buffer: AudioBuffer, bitDepth: BitDepth = 16): Blob {
  const channels: Float32Array[] = []
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }
  return new Blob([encodeWav(channels, buffer.sampleRate, bitDepth)], {
    type: 'audio/wav',
  })
}

/** A filesystem-safe name for the exported mix. */
export function exportFilename(prefix = 'audiopad-mix'): string {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  return `${prefix}-${stamp}.wav`
}
