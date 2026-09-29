import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/store'
import { seek } from '../store/transportSlice'
import { selectDuration } from '../store/selectors'
import { AudioEngine } from '../audio/AudioEngine'
import { formatTime } from '../lib/time'
import {
  RULER_HEIGHT,
  timeToX,
  xToTime,
  visibleTicks,
  type Viewport,
} from '../lib/viewport'

/**
 * The time ruler, pinned above the lanes so it stays put while they scroll.
 */
export const TimelineRuler = ({ width }: { width: number }) => {
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const duration = useAppSelector(selectDuration)
  const isPlaying = useAppSelector((state) => state.transport.isPlaying)
  const { pixelsPerSecond, viewStart } = useAppSelector((state) => state.ui)
  const rafRef = useRef(0)

  const view: Viewport = useMemo(
    () => ({ viewStart, pixelsPerSecond, width }),
    [viewStart, pixelsPerSecond, width]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0) return

    ctx.fillStyle = '#211e1b'
    ctx.fillRect(0, 0, width, RULER_HEIGHT)
    ctx.fillStyle = '#3a352f'
    ctx.fillRect(0, RULER_HEIGHT - 1, width, 1)

    ctx.fillStyle = '#9c9487'
    ctx.font = "10px 'Space Mono', monospace"
    ctx.textAlign = 'left'

    for (const t of visibleTicks(view, duration)) {
      const x = Math.round(timeToX(t, view))
      if (x < -40 || x > width + 40) continue

      ctx.fillStyle = '#3a352f'
      ctx.fillRect(x, RULER_HEIGHT - 8, 1, 8)

      ctx.fillStyle = '#9c9487'
      const minutes = Math.floor(t / 60)
      const seconds = t % 60
      const label =
        t < 60
          ? `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`
          : `${minutes}:${Math.floor(seconds).toString().padStart(2, '0')}`
      ctx.fillText(label, x + 4, 12)
    }

    // Playhead marker, drawn on the ruler as well as the lanes.
    const playheadX = timeToX(AudioEngine.getInstance().currentTime, view)
    if (playheadX >= -8 && playheadX <= width + 8) {
      ctx.fillStyle = '#e8e0d0'
      ctx.beginPath()
      ctx.moveTo(playheadX - 5, RULER_HEIGHT - 10)
      ctx.lineTo(playheadX + 5, RULER_HEIGHT - 10)
      ctx.lineTo(playheadX, RULER_HEIGHT)
      ctx.closePath()
      ctx.fill()
    }
  }, [view, duration, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.style.width = `${width}px`
    canvas.style.height = `${RULER_HEIGHT}px`
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(RULER_HEIGHT * dpr)
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [width, draw])

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
  }

  /** Arrow keys nudge, shift jumps a larger step, Home and End go to the edges. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = AudioEngine.getInstance().currentTime
    const step = e.shiftKey ? 10 : 1

    const next =
      e.key === 'ArrowLeft'
        ? current - step
        : e.key === 'ArrowRight'
          ? current + step
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? duration
              : null

    if (next === null) return
    e.preventDefault()
    dispatch(seek(Math.max(0, Math.min(next, duration))))
  }

  return (
    <canvas
      ref={canvasRef}
      className="ruler"
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Timeline position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(AudioEngine.getInstance().currentTime)}
      aria-valuetext={formatTime(AudioEngine.getInstance().currentTime)}
    />
  )
}
