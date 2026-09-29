import { FaTrash } from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '../store/store'
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice'
import { clampVolume } from '../audio/mixing'
import { LevelMeter } from './LevelMeter'

interface TrackControlsProps {
  id: string
}

/**
 * One channel strip, exactly one lane tall so it lines up with its waveform.
 *
 * The colour block on the left is the same colour the track's clips are drawn
 * in, which is what ties the two columns together; it carries the album art
 * when the file had any.
 */
export const TrackControls = ({ id }: TrackControlsProps) => {
  const dispatch = useAppDispatch()
  const track = useAppSelector((state) => state.tracks.byId[id])

  if (!track) return null

  const volumePercent = Math.round(track.volume * 100)

  return (
    <div className="strip">
      <div
        className="strip__tab"
        style={
          track.albumArt
            ? { backgroundImage: `url(${track.albumArt})` }
            : { background: track.color }
        }
        aria-hidden="true"
      />

      <div className="strip__body">
        <div className="strip__row">
          <span className="strip__name" title={track.name}>
            {track.name}
          </span>

          <button
            className={`strip__btn ${track.muted ? 'is-on' : ''}`}
            onClick={() => dispatch(toggleMute(id))}
            aria-pressed={track.muted}
            aria-label={`Mute ${track.name}`}
            title="Mute"
          >
            M
          </button>
          <button
            className={`strip__btn ${track.solo ? 'is-on' : ''}`}
            onClick={() => dispatch(toggleSolo(id))}
            aria-pressed={track.solo}
            aria-label={`Solo ${track.name}`}
            title="Solo"
          >
            S
          </button>
          <button
            className="strip__remove"
            onClick={() => dispatch(removeTrack(id))}
            aria-label={`Remove ${track.name}`}
            title="Remove track"
          >
            <FaTrash aria-hidden="true" />
          </button>
        </div>

        <div className="strip__row strip__row--controls">
          <LevelMeter target={id} segments={10} label={`${track.name} level`} />

          <input
            className="strip__fader"
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
      </div>
    </div>
  )
}
