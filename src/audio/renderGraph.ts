import { scheduleClips } from './scheduling'
import type { Clip } from '../models/types'

/**
 * Building the playback graph.
 *
 * Live playback and offline rendering call the same function, so an exported
 * file is produced by the same code that produced what you heard. Keeping two
 * implementations in step by hand is how exports end up subtly different from
 * the monitor path - a fade that starts a frame early, an offset off by a
 * sample.
 */

export interface ScheduleOptions {
  context: BaseAudioContext
  clips: readonly Clip[]
  buffers: Map<string, AudioBuffer>
  /** Where a given track's clips should be connected, or null to skip them. */
  trackInput: (trackId: string) => AudioNode | null
  /** Context time that timeline position `from` lands on. */
  origin: number
  /** Timeline position playback begins at. */
  from: number
  onEnded?: (source: AudioBufferSourceNode) => void
}

/** Limiter settings, shared so the export is shaped like the monitor path. */
export function configureLimiter(limiter: DynamicsCompressorNode) {
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.1
}

export function scheduleClipSources({
  context,
  clips,
  buffers,
  trackInput,
  origin,
  from,
  onEnded,
}: ScheduleOptions): AudioBufferSourceNode[] {
  const started: AudioBufferSourceNode[] = []

  for (const item of scheduleClips(clips, from)) {
    const buffer = buffers.get(item.sourceId)
    const input = trackInput(item.trackId)
    if (!buffer || !input) continue

    const source = context.createBufferSource()
    source.buffer = buffer

    // Fades live on a per-clip gain, leaving the track fader free to move.
    const clipGain = context.createGain()
    const startsAt = origin + item.delay
    const endsAt = startsAt + item.duration

    if (item.fadeIn > 0) {
      clipGain.gain.setValueAtTime(0, startsAt)
      clipGain.gain.linearRampToValueAtTime(
        item.gain,
        startsAt + Math.min(item.fadeIn, item.duration)
      )
    } else {
      clipGain.gain.setValueAtTime(item.gain, startsAt)
    }

    if (item.fadeOut > 0) {
      const fadeOutStart = Math.max(startsAt, endsAt - item.fadeOut)
      clipGain.gain.setValueAtTime(item.gain, fadeOutStart)
      clipGain.gain.linearRampToValueAtTime(0, endsAt)
    }

    source.connect(clipGain)
    clipGain.connect(input)

    if (onEnded) {
      source.onended = () => {
        clipGain.disconnect()
        onEnded(source)
      }
    }

    source.start(startsAt, item.offset, item.duration)
    started.push(source)
  }

  return started
}

export interface TrackMix {
  id: string
  volume: number
  /** Already resolved against solo. */
  muted: boolean
}

export interface RenderOptions {
  clips: readonly Clip[]
  tracks: readonly TrackMix[]
  buffers: Map<string, AudioBuffer>
  masterVolume: number
  duration: number
  sampleRate?: number
  channels?: number
}

/**
 * Render the arrangement offline, faster than real time.
 *
 * The graph is the same shape as the live one - clip gain, track fader, mute,
 * master, limiter - so the file matches the monitor path rather than
 * approximating it.
 */
export async function renderArrangement({
  clips,
  tracks,
  buffers,
  masterVolume,
  duration,
  sampleRate = 44100,
  channels = 2,
}: RenderOptions): Promise<AudioBuffer> {
  if (duration <= 0) {
    throw new Error('Nothing to export: the arrangement is empty.')
  }

  const frames = Math.ceil(duration * sampleRate)
  const context = new OfflineAudioContext(channels, frames, sampleRate)

  const masterGain = context.createGain()
  masterGain.gain.value = masterVolume

  const limiter = context.createDynamicsCompressor()
  configureLimiter(limiter)

  masterGain.connect(limiter)
  limiter.connect(context.destination)

  const inputs = new Map<string, GainNode>()
  for (const track of tracks) {
    const volumeGain = context.createGain()
    volumeGain.gain.value = track.volume

    const muteGain = context.createGain()
    muteGain.gain.value = track.muted ? 0 : 1

    volumeGain.connect(muteGain)
    muteGain.connect(masterGain)
    inputs.set(track.id, volumeGain)
  }

  scheduleClipSources({
    context,
    clips,
    buffers,
    trackInput: (trackId) => inputs.get(trackId) ?? null,
    origin: 0,
    from: 0,
  })

  return context.startRendering()
}
