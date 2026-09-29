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
import type { Clip, AudioTrack, AudioSource } from '../models/types'

/** A clip carries its name in a bar along its top edge, like a window title. */
const CLIP_HEADER = 15
const CLIP_INSET = 3

const TONE_VOID = '#0d0c0b'
const TONE_ALT = '#111010'
const TONE_LINE = '#211e1b'
const BONE = '#e8e0d0'
const BONE_FAINT = '#5f594f'
const ACCENT = '#ff5b21'

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
  const [hoverClipId, setHoverClipId] = useState<string | null>(null)

  const view: Viewport = useMemo(
    () => ({ viewStart, pixelsPerSecond, width }),
    [viewStart, pixelsPerSecond, width]
  )
  const height = lanesHeight(tracks.length)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return

    ctx.fillStyle = TONE_VOID
    ctx.fillRect(0, 0, width, height)

    if (tracks.length === 0) {
      ctx.fillStyle = BONE_FAINT
      ctx.font = "11px 'Space Mono', monospace"
      ctx.textAlign = 'center'
      ctx.fillText('DROP AUDIO FILES HERE', width / 2, LANE_HEIGHT / 2)
      return
    }

    const [from, to] = visibleRange(view)

    /** One clip: body, header, waveform, fades, then handles on top. */
    const drawClip = (
      clip: Clip,
      track: AudioTrack,
      source: AudioSource | undefined,
      laneY: number
    ) => {
      const x = timeToX(clip.start, view)
      const w = clip.duration * pixelsPerSecond
      const top = laneY + CLIP_INSET
      const bodyHeight = LANE_HEIGHT - CLIP_INSET * 2

      const isSelected = clip.id === selectedClipId || clip.id === drag.draggingClipId
      const isHovered = clip.id === hoverClipId && !drag.isDragging

      // Body, lifted slightly when the clip is under the pointer or selected.
      ctx.fillStyle = `${track.color}${isSelected ? '2e' : isHovered ? '22' : '16'}`
      ctx.fillRect(x, top, w, bodyHeight)

      // Header bar carrying the name, so a split is legible as two clips
      // rather than one waveform with a seam in it.
      const showHeader = w >= 40
      if (showHeader) {
        ctx.fillStyle = `${track.color}${isSelected ? 'ee' : 'aa'}`
        ctx.fillRect(x, top, w, CLIP_HEADER)

        ctx.save()
        ctx.beginPath()
        ctx.rect(x + 4, top, Math.max(0, w - 8), CLIP_HEADER)
        ctx.clip()
        ctx.fillStyle = TONE_VOID
        ctx.font = "9px 'Space Mono', monospace"
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText((source?.name ?? 'CLIP').toUpperCase(), x + 5, top + CLIP_HEADER / 2 + 0.5)
        ctx.restore()
        ctx.textBaseline = 'alphabetic'
      }

      const waveTop = top + (showHeader ? CLIP_HEADER : 0)
      const waveHeight = bodyHeight - (showHeader ? CLIP_HEADER : 0)
      const centerY = waveTop + waveHeight / 2

      if (!source?.peaks?.length) {
        ctx.fillStyle = BONE_FAINT
        ctx.font = "10px 'Space Mono', monospace"
        ctx.textAlign = 'left'
        ctx.fillText('LOADING', x + 6, centerY)
        return
      }

      // Only the peaks under visible pixels are walked, so cost tracks the
      // viewport rather than the length of the audio.
      const peaks = source.peaks
      const startPx = Math.max(0, Math.floor(timeToX(Math.max(clip.start, from), view)))
      const endPx = Math.min(
        width,
        Math.ceil(timeToX(Math.min(clip.start + clip.duration, to), view))
      )

      ctx.fillStyle = track.color
      const half = (waveHeight - 6) / 2

      for (let px = startPx; px < endPx; px++) {
        const intoSource = clip.offset + (xToTime(px, view) - clip.start)
        const index = Math.floor((intoSource / source.duration) * peaks.length)
        const peak = peaks[Math.max(0, Math.min(peaks.length - 1, index))] ?? 0
        const barHeight = Math.max(1, peak * half * 2)
        ctx.fillRect(px, centerY - barHeight / 2, 1, barHeight)
      }

      // Fades are shaded wedges over the waveform, so the ramp reads as
      // attenuation rather than as a stray diagonal line.
      const shadeFade = (fade: number, atStart: boolean) => {
        if (fade <= 0) return
        const fw = Math.min(fade * pixelsPerSecond, w)
        ctx.fillStyle = 'rgba(13, 12, 11, 0.72)'
        ctx.beginPath()
        if (atStart) {
          ctx.moveTo(x, waveTop)
          ctx.lineTo(x + fw, waveTop)
          ctx.lineTo(x, waveTop + waveHeight)
        } else {
          ctx.moveTo(x + w, waveTop)
          ctx.lineTo(x + w - fw, waveTop)
          ctx.lineTo(x + w, waveTop + waveHeight)
        }
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = BONE
        ctx.lineWidth = 1
        ctx.beginPath()
        if (atStart) {
          ctx.moveTo(x, waveTop + waveHeight)
          ctx.lineTo(x + fw, waveTop)
        } else {
          ctx.moveTo(x + w - fw, waveTop)
          ctx.lineTo(x + w, waveTop + waveHeight)
        }
        ctx.stroke()
      }
      shadeFade(clip.fadeIn, true)
      shadeFade(clip.fadeOut, false)

      // Handles: dimmed on hover, solid once selected, so the clip does not
      // sprout controls the moment the pointer crosses it.
      if (!isSelected && !isHovered) return

      const alpha = isSelected ? 1 : 0.45
      ctx.globalAlpha = alpha

      if (w >= EDGE_GRAB_PX * 3) {
        ctx.fillStyle = ACCENT
        ctx.fillRect(x, top, EDGE_GRAB_PX, bodyHeight)
        ctx.fillRect(x + w - EDGE_GRAB_PX, top, EDGE_GRAB_PX, bodyHeight)

        // Grip lines, the usual signal that an edge can be pulled.
        ctx.fillStyle = TONE_VOID
        const gripY = top + bodyHeight / 2 - 5
        for (const gx of [x + 2, x + w - EDGE_GRAB_PX + 2]) {
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(gx, gripY + i * 4, 2, 2)
          }
        }
      }

      // Fade grips are triangles pointing the way the fade runs.
      if (w >= FADE_HANDLE_PX * 3) {
        ctx.fillStyle = BONE
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x + FADE_HANDLE_PX, top)
        ctx.lineTo(x, top + FADE_HANDLE_PX)
        ctx.closePath()
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(x + w, top)
        ctx.lineTo(x + w - FADE_HANDLE_PX, top)
        ctx.lineTo(x + w, top + FADE_HANDLE_PX)
        ctx.closePath()
        ctx.fill()
      }

      ctx.globalAlpha = 1

      if (isSelected) {
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 2
        ctx.strokeRect(x + 1, top + 1, Math.max(2, w - 2), bodyHeight - 2)
      }
    }

    tracks.forEach((track, index) => {
      const laneY = laneTop(index)

      ctx.fillStyle = index % 2 === 0 ? TONE_ALT : TONE_VOID
      ctx.fillRect(0, laneY, width, LANE_HEIGHT)
      ctx.fillStyle = TONE_LINE
      ctx.fillRect(0, laneY + LANE_HEIGHT - 1, width, 1)

      for (const stored of clips) {
        if (stored.trackId !== track.id) continue
        // While dragging, draw the preview rather than the committed clip.
        const clip =
          drag.draft && drag.draggingClipId === stored.id ? drag.draft : stored
        if (clip.start + clip.duration < from || clip.start > to) continue

        drawClip(clip, track, sources[clip.sourceId], laneY)
      }
    })

    const playheadX = timeToX(AudioEngine.getInstance().currentTime, view)
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = BONE
      ctx.fillRect(playheadX - 1, 0, 2, height)
    }
  }, [
    tracks,
    clips,
    sources,
    view,
    width,
    height,
    pixelsPerSecond,
    selectedClipId,
    hoverClipId,
    drag.draft,
    drag.draggingClipId,
    drag.isDragging,
  ])

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
    return { x, y, lane: laneAtY(y, tracks.length), time: xToTime(x, view) }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, lane, time } = locate(e)
    const track = lane === null ? null : tracks[lane]
    const hit = track ? hitTest(clips, track.id, lane!, view, x, y) : null

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
    const hit = track ? hitTest(clips, track.id, lane!, view, x, y) : null
    setHoverZone(hit?.zone ?? null)
    setHoverClipId(hit?.clipId ?? null)
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
      onPointerLeave={() => {
        setHoverZone(null)
        setHoverClipId(null)
      }}
    />
  )
}
