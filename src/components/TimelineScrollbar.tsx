import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/store'
import { setView } from '../store/uiSlice'
import { selectDuration } from '../store/selectors'

/**
 * A real horizontal scrollbar for the timeline.
 *
 * The lane canvas stays viewport-sized and draws only the visible window, so
 * there is nothing for the browser to scroll and no scrollbar appears - which
 * left no way to tell that the arrangement continued off screen, and nothing
 * to drag. This is a proxy: an empty element as wide as the arrangement,
 * whose native scroll position is mirrored into the view.
 */
export const TimelineScrollbar = ({ width }: { width: number }) => {
  const dispatch = useAppDispatch()
  const duration = useAppSelector(selectDuration)
  const { pixelsPerSecond, viewStart } = useAppSelector((state) => state.ui)

  const ref = useRef<HTMLDivElement>(null)
  // Assigning scrollLeft fires a scroll event, which would echo back as a
  // view change and fight whatever moved the view in the first place.
  const syncing = useRef(false)

  const contentWidth = Math.max(width, duration * pixelsPerSecond)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const target = viewStart * pixelsPerSecond
    if (Math.abs(el.scrollLeft - target) < 1) return

    syncing.current = true
    el.scrollLeft = target
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [viewStart, pixelsPerSecond])

  const onScroll = () => {
    if (syncing.current) return
    const el = ref.current
    if (!el || pixelsPerSecond <= 0) return
    dispatch(setView({ viewStart: el.scrollLeft / pixelsPerSecond }))
  }

  return (
    <div className="hscroll" ref={ref} onScroll={onScroll} aria-hidden="true">
      <div className="hscroll__content" style={{ width: contentWidth }} />
    </div>
  )
}
