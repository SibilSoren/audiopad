import { useEffect, useRef } from 'react'
import { subscribeMeter, type MeterTarget } from '../audio/meterLoop'
import { litSegments, levelToFraction } from '../audio/levels'

interface LevelMeterProps {
  target: MeterTarget
  segments?: number
  orientation?: 'horizontal' | 'vertical'
  label?: string
}

/**
 * A segmented LED meter.
 *
 * Segments are lit by mutating data attributes rather than by re-rendering:
 * this runs every frame while audio is playing.
 */
export const LevelMeter = ({
  target,
  segments = 12,
  orientation = 'horizontal',
  label,
}: LevelMeterProps) => {
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([])
  const holdRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    return subscribeMeter(target, ({ value, hold, clipping }) => {
      const lit = litSegments(value, segments)

      for (let i = 0; i < segments; i++) {
        const el = segmentRefs.current[i]
        if (!el) continue
        const on = i < lit
        // Touch the DOM only when the state actually changes.
        if (el.dataset.on !== String(on)) {
          el.dataset.on = String(on)
        }
      }

      const holdEl = holdRef.current
      if (holdEl) {
        const fraction = levelToFraction(hold)
        const offset = `${fraction * 100}%`
        if (orientation === 'horizontal') {
          holdEl.style.left = offset
        } else {
          holdEl.style.bottom = offset
        }
        holdEl.dataset.clipping = String(clipping)
        holdEl.style.opacity = hold > 0.001 ? '1' : '0'
      }
    })
  }, [target, segments, orientation])

  return (
    <div
      className={`meter meter--${orientation}`}
      role="meter"
      aria-label={label ?? `${target === 'master' ? 'Master' : 'Track'} level`}
      // The value changes 60 times a second; announcing it would be noise.
      aria-hidden="true"
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            segmentRefs.current[i] = el
          }}
          className="meter__segment"
          data-on="false"
          // The top two segments are the "hot" zone.
          data-zone={i >= segments - 2 ? 'hot' : i >= segments - 4 ? 'warm' : 'normal'}
        />
      ))}
      <span ref={holdRef} className="meter__hold" data-clipping="false" />
    </div>
  )
}
