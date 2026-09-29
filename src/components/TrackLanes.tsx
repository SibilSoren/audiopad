import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store/store'
import { seek } from '../store/transportSlice'
import { selectClip } from '../store/uiSlice'
import { selectClips, selectTracks, selectSources, selectDuration } from '../store/selectors'
import { AudioEngine } from '../audio/AudioEngine'
import { hitTest, cursorForZone, EDGE_GRAB_PX, FADE_HANDLE_PX, type HitZone } from '../lib/clipHit'
import { useClipDrag } from '../hooks/useClipDrag'
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

  const drag = useClipDrag()
  const [hoverZone, setHoverZone] = useState<HitZone | null>(null)

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

      for (const stored of clips) {
        if (stored.trackId !== track.id) continue
        // While dragging, draw the preview rather than the committed clip.
        const clip =
          drag.draft && drag.draggingClipId === stored.id ? drag.draft : stored
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

        if (clip.id === selectedClipId || clip.id === drag.draggingClipId) {
          ctx.strokeStyle = '#ff5b21'
          ctx.lineWidth = 2
          ctx.strokeRect(clipX + 1, y + 3, Math.max(2, clipW - 2), LANE_HEIGHT - 6)

          // Grab affordances: bars on the edges, squares in the top corners.
          if (clipW >= EDGE_GRAB_PX * 3) {
            ctx.fillStyle = '#ff5b21'
            ctx.fillRect(clipX, y + 3, EDGE_GRAB_PX, LANE_HEIGHT - 6)
            ctx.fillRect(clipX + clipW - EDGE_GRAB_PX, y + 3, EDGE_GRAB_PX, LANE_HEIGHT - 6)
          }
          if (clipW >= FADE_HANDLE_PX * 3) {
            ctx.fillStyle = '#e8e0d0'
            ctx.fillRect(clipX + 1, y + 3, FADE_HANDLE_PX - 2, FADE_HANDLE_PX - 2)
            ctx.fillRect(
              clipX + clipW - FADE_HANDLE_PX + 1,
              y + 3,
              FADE_HANDLE_PX - 2,
              FADE_HANDLE_PX - 2
            )
          }
        }
      }
    })

    const playheadX = timeToX(AudioEngine.getInstance().currentTime, view)
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = '#e8e0d0'
      ctx.fillRect(playheadX - 1, 0, 2, height)
    }
  }, [tracks, clips, sources, view, width, height, pixelsPerSecond, selectedClipId, drag.draft, drag.draggingClipId])

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

  /** Pointer position in canvas coordinates, plus the lane it falls in. */
  const locate = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lane = laneAtY(y, tracks.length)
    return { x, y, lane, time: xToTime(x, view) }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, lane, time } = locate(e)
    const track = lane === null ? null : tracks[lane]

    if (!track) {
      dispatch(selectClip(null))
      dispatch(seek(Math.max(0, Math.min(time, duration))))
      return
    }

    const hit = hitTest(clips, track.id, lane!, view, x, y)
    if (!hit) {
      dispatch(selectClip(null))
      dispatch(seek(Math.max(0, Math.min(time, duration))))
      return
    }

    const clip = clips.find((c) => c.id === hit.clipId)
    if (!clip) return

    dispatch(selectClip(clip.id))
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.begin(clip, hit.zone, time, e.clientX, sources[clip.sourceId])
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, lane, time } = locate(e)

    if (drag.isDragging) {
      drag.move(time, e.clientX)
      return
    }

    const track = lane === null ? null : tracks[lane]
    setHoverZone(track ? (hitTest(clips, track.id, lane!, view, x, y)?.zone ?? null) : null)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDrag = drag.end()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // A press that never moved is a click, so it still seeks.
    if (!wasDrag) {
      const { time } = locate(e)
      dispatch(seek(Math.max(0, Math.min(time, duration))))
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="lanes"
      role="application"
      aria-label={
        tracks.length === 0
          ? 'Timeline, empty. Drop audio files to add tracks.'
          : `Timeline with ${tracks.length} track${tracks.length === 1 ? '' : 's'}`
      }
      style={{
        cursor: drag.isDragging
          ? drag.zone === 'body'
            ? 'grabbing'
            : cursorForZone(drag.zone)
          : cursorForZone(hoverZone),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => drag.end()}
      onPointerLeave={() => setHoverZone(null)}
    />
  )
}
