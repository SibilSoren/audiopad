import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/store'
import { seek } from '../store/transportSlice'
import { selectClip } from '../store/uiSlice'
import { selectClips, selectTracks, selectSources, selectDuration } from '../store/selectors'
import { AudioEngine } from '../audio/AudioEngine'
import { clipAt } from '../audio/clipOps'
import {
  LANE_HEIGHT,
  lanesHeight,
  laneTop,
  laneAtY,
  timeToX,
  xToTime,
  visibleRange,
  type Viewport,
} from '../lib/viewport'

/**
 * The track lanes.
 *
 * Lanes are a fixed height and stack downward; the canvas grows with the
 * track count and scrolls inside its container. Horizontally the canvas stays
 * viewport-sized and only the visible time window is drawn - a canvas wide
 * enough to hold a zoomed-in arrangement would run into the browser's
 * dimension limits long before it ran out of audio.
 */
export const TrackLanes = ({ width }: { width: number }) => {
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const tracks = useAppSelector(selectTracks)
  const clips = useAppSelector(selectClips)
  const sources = useAppSelector(selectSources)
  const duration = useAppSelector(selectDuration)
  const isPlaying = useAppSelector((state) => state.transport.isPlaying)
  const selectedClipId = useAppSelector((state) => state.ui.selectedClipId)
  const { pixelsPerSecond, viewStart } = useAppSelector((state) => state.ui)

  const view: Viewport = useMemo(
    () => ({ viewStart, pixelsPerSecond, width }),
    [viewStart, pixelsPerSecond, width]
  )
  const height = lanesHeight(tracks.length)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return

    ctx.fillStyle = '#0d0c0b'
    ctx.fillRect(0, 0, width, height)

    if (tracks.length === 0) {
      ctx.fillStyle = '#5f594f'
      ctx.font = "11px 'Space Mono', monospace"
      ctx.textAlign = 'center'
      ctx.fillText('DROP AUDIO FILES HERE', width / 2, LANE_HEIGHT / 2)
      return
    }

    const [from, to] = visibleRange(view)

    tracks.forEach((track, index) => {
      const y = laneTop(index)
      const centerY = y + LANE_HEIGHT / 2

      ctx.fillStyle = index % 2 === 0 ? '#111010' : '#0d0c0b'
      ctx.fillRect(0, y, width, LANE_HEIGHT)
      ctx.fillStyle = '#211e1b'
      ctx.fillRect(0, y + LANE_HEIGHT - 1, width, 1)

      for (const clip of clips) {
        if (clip.trackId !== track.id) continue
        // Skip clips entirely outside the visible window.
        if (clip.start + clip.duration < from || clip.start > to) continue

        const source = sources[clip.sourceId]
        const clipX = timeToX(clip.start, view)
        const clipW = clip.duration * pixelsPerSecond

        ctx.fillStyle = `${track.color}14`
        ctx.fillRect(clipX, y + 2, clipW, LANE_HEIGHT - 4)

        if (!source?.peaks?.length) {
          ctx.fillStyle = '#5f594f'
          ctx.font = "10px 'Space Mono', monospace"
          ctx.textAlign = 'left'
          ctx.fillText('LOADING', clipX + 8, centerY)
          continue
        }

        // Only the peaks for the visible slice of this clip are walked, so
        // cost tracks the viewport rather than the length of the audio.
        const peaks = source.peaks
        const visibleFrom = Math.max(clip.start, from)
        const visibleTo = Math.min(clip.start + clip.duration, to)
        const startPx = Math.max(0, Math.floor(timeToX(visibleFrom, view)))
        const endPx = Math.min(width, Math.ceil(timeToX(visibleTo, view)))

        ctx.fillStyle = track.color
        const half = (LANE_HEIGHT - 12) / 2

        for (let px = startPx; px < endPx; px++) {
          const time = xToTime(px, view)
          const intoClip = time - clip.start
          const intoSource = clip.offset + intoClip
          const peakIndex = Math.floor((intoSource / source.duration) * peaks.length)
          const peak = peaks[Math.max(0, Math.min(peaks.length - 1, peakIndex))] ?? 0
          const barHeight = Math.max(1, peak * half * 2)
          ctx.fillRect(px, centerY - barHeight / 2, 1, barHeight)
        }

        // Fade ramps, visible before there are handles to drag.
        if (clip.fadeIn > 0 || clip.fadeOut > 0) {
          ctx.strokeStyle = '#e8e0d0'
          ctx.lineWidth = 1
          ctx.beginPath()
          if (clip.fadeIn > 0) {
            ctx.moveTo(clipX, y + LANE_HEIGHT - 4)
            ctx.lineTo(clipX + clip.fadeIn * pixelsPerSecond, y + 4)
          }
          if (clip.fadeOut > 0) {
            ctx.moveTo(clipX + clipW - clip.fadeOut * pixelsPerSecond, y + 4)
            ctx.lineTo(clipX + clipW, y + LANE_HEIGHT - 4)
          }
          ctx.stroke()
        }

        if (clip.id === selectedClipId) {
          ctx.strokeStyle = '#ff5b21'
          ctx.lineWidth = 2
          ctx.strokeRect(clipX + 1, y + 3, Math.max(2, clipW - 2), LANE_HEIGHT - 6)
        }
      }
    })

    const playheadX = timeToX(AudioEngine.getInstance().currentTime, view)
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = '#e8e0d0'
      ctx.fillRect(playheadX - 1, 0, 2, height)
    }
  }, [tracks, clips, sources, view, width, height, pixelsPerSecond, selectedClipId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [width, height, draw])

  useEffect(() => {
    draw()
    if (!isPlaying) return

    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, draw])

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const time = xToTime(e.clientX - rect.left, view)
    dispatch(seek(Math.max(0, Math.min(time, duration))))

    const lane = laneAtY(e.clientY - rect.top, tracks.length)
    const track = lane === null ? null : tracks[lane]
    dispatch(selectClip(track ? (clipAt(clips, track.id, time)?.id ?? null) : null))
  }

  return <canvas ref={canvasRef} className="lanes" onClick={onClick} />
}
