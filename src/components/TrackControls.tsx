import { FaTrash, FaMusic } from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '../store/store'
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice'
import { clampVolume } from '../audio/mixing'
import { LevelMeter } from './LevelMeter'

interface TrackControlsProps {
  id: string
}

/**
 * One channel strip, exactly one lane tall so it lines up with its waveform.
 */
export const TrackControls = ({ id }: TrackControlsProps) => {
  const dispatch = useAppDispatch()
  const track = useAppSelector((state) => state.tracks.byId[id])

  if (!track) return null

  const volumePercent = Math.round(track.volume * 100)

  return (
    <div className="track-controls">
      <div className="track-controls__top">
        <div
          className="track-controls__art"
          style={
            track.albumArt
              ? { backgroundImage: `url(${track.albumArt})` }
              : { background: `${track.color}33`, color: track.color }
          }
        >
          {!track.albumArt && <FaMusic aria-hidden="true" />}
        </div>

        <span className="track-controls__name" title={track.name}>
          {track.name}
        </span>

        <div className="track-controls__buttons">
          <button
            className={`track-controls__btn ${track.muted ? 'active' : ''}`}
            onClick={() => dispatch(toggleMute(id))}
            aria-pressed={track.muted}
            aria-label={`Mute ${track.name}`}
            title="Mute"
          >
            M
          </button>
          <button
            className={`track-controls__btn ${track.solo ? 'active' : ''}`}
            onClick={() => dispatch(toggleSolo(id))}
            aria-pressed={track.solo}
            aria-label={`Solo ${track.name}`}
            title="Solo"
          >
            S
          </button>
        </div>

        <button
          className="track-controls__delete"
          onClick={() => dispatch(removeTrack(id))}
          aria-label={`Remove ${track.name}`}
          title="Remove track"
        >
          <FaTrash aria-hidden="true" />
        </button>
      </div>

      <LevelMeter target={id} segments={12} label={`${track.name} level`} />

      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={track.volume}
        onChange={(e) =>
          dispatch(setVolume({ id, volume: clampVolume(parseFloat(e.target.value)) }))
        }
        aria-label={`Volume for ${track.name}`}
        aria-valuetext={`${volumePercent} percent`}
      />
    </div>
  )
}
