import { useCallback, useState } from 'react'
import { toast } from 'react-toastify'
import { useAppSelector } from '../store/store'
import { selectClips, selectTracks } from '../store/selectors'
import { AudioEngine } from '../audio/AudioEngine'
import { effectiveMute, hasAnySolo } from '../audio/mixing'
import { encodeAudioBuffer, exportFilename } from '../audio/wav'

/**
 * Render the arrangement to a WAV file and hand it to the browser.
 *
 * Rendering is offline and faster than real time, but it is not instant on a
 * long arrangement, so the button reports that it is working rather than
 * appearing to have ignored the click.
 */
export function useExportMix() {
  const clips = useAppSelector(selectClips)
  const tracks = useAppSelector(selectTracks)
  const masterVolume = useAppSelector((state) => state.mixer.masterVolume)

  const [isExporting, setIsExporting] = useState(false)

  const exportMix = useCallback(async () => {
    if (clips.length === 0) {
      toast.error('Nothing to export yet', {
        position: 'bottom-right',
        autoClose: 3000,
      })
      return
    }

    setIsExporting(true)
    const started = performance.now()

    try {
      // Solo is resolved here, so the file matches what the mixer is doing
      // rather than exporting muted tracks at full level.
      const anySolo = hasAnySolo(tracks)
      const mixes = tracks.map((track) => ({
        id: track.id,
        volume: track.volume,
        muted: effectiveMute(track, anySolo),
      }))

      const rendered = await AudioEngine.getInstance().renderMix(mixes, masterVolume)
      const blob = encodeAudioBuffer(rendered, 16)

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFilename()
      link.click()
      URL.revokeObjectURL(url)

      const seconds = ((performance.now() - started) / 1000).toFixed(1)
      const megabytes = (blob.size / 1024 / 1024).toFixed(1)
      toast.success(`Exported ${megabytes} MB in ${seconds}s`, {
        position: 'bottom-right',
        autoClose: 3000,
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Export failed',
        { position: 'bottom-right', autoClose: 5000 }
      )
    } finally {
      setIsExporting(false)
    }
  }, [clips.length, tracks, masterVolume])

  return { exportMix, isExporting, canExport: clips.length > 0 }
}
