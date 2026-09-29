import { useAppDispatch, useAppSelector } from '../store/store'
import { setMasterVolume } from '../store/mixerSlice'
import { clampVolume } from '../audio/mixing'
import { LevelMeter } from './LevelMeter'

/**
 * The master bus: one fader and the output meter.
 *
 * Metered after the limiter, so this is the signal actually leaving the app.
 */
export const MasterControls = () => {
  const dispatch = useAppDispatch()
  const masterVolume = useAppSelector((state) => state.mixer.masterVolume)

  return (
    <div className="master">
      <div className="master__row">
        <span className="master__label">Master</span>
        <span className="master__value">{Math.round(masterVolume * 100)}</span>
      </div>

      <LevelMeter target="master" segments={16} label="Master output level" />

      <input
        className="master__fader"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={masterVolume}
        onChange={(e) =>
          dispatch(setMasterVolume(clampVolume(parseFloat(e.target.value))))
        }
        aria-label="Master volume"
        aria-valuetext={`${Math.round(masterVolume * 100)} percent`}
      />
    </div>
  )
}
