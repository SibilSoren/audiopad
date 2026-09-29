import { FaSearchMinus, FaSearchPlus, FaExpand } from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '../store/store'
import { setView } from '../store/uiSlice'
import { selectDuration } from '../store/selectors'
import { zoomAround, fitZoom, clampViewStart, type Viewport } from '../lib/viewport'

export const ZoomControls = ({ width }: { width: number }) => {
  const dispatch = useAppDispatch()
  const duration = useAppSelector(selectDuration)
  const { pixelsPerSecond, viewStart } = useAppSelector((state) => state.ui)

  const view: Viewport = { viewStart, pixelsPerSecond, width }

  // Button zooms anchor on the middle of the view, which is the closest
  // equivalent to "where you are looking" without a pointer position.
  const zoom = (factor: number) => dispatch(setView(zoomAround(view, factor, width / 2, duration)))

  const fit = () => {
    const next = fitZoom(duration, width)
    dispatch(
      setView({
        pixelsPerSecond: next,
        viewStart: clampViewStart(0, duration, { ...view, pixelsPerSecond: next }),
      })
    )
  }

  return (
    <div className="zoom">
      <button className="btn btn--icon" onClick={() => zoom(0.5)} aria-label="Zoom out" title="Zoom out">
        <FaSearchMinus aria-hidden="true" />
      </button>
      <button className="btn btn--icon" onClick={fit} aria-label="Fit arrangement" title="Fit">
        <FaExpand aria-hidden="true" />
      </button>
      <button className="btn btn--icon" onClick={() => zoom(2)} aria-label="Zoom in" title="Zoom in">
        <FaSearchPlus aria-hidden="true" />
      </button>
    </div>
  )
}
