import { FaTrash, FaMusic } from 'react-icons/fa';
import { useAppDispatch, useAppSelector } from '../store/store';
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice';
import { clampVolume } from '../audio/mixing';

interface TrackControlsProps {
  id: string;
}

export const TrackControls = ({ id }: TrackControlsProps) => {
  const dispatch = useAppDispatch();
  const track = useAppSelector((state) => state.tracks.byId[id]);

  if (!track) return null;

  const volumePercent = Math.round(track.volume * 100);

  return (
    <div className="track-controls">
      <div className="track-controls__info">
        <div
          className="track-controls__art"
          style={
            track.albumArt
              ? { backgroundImage: `url(${track.albumArt})`, backgroundSize: 'cover' }
              : { background: `${track.color}33` }
          }
        >
          {!track.albumArt && <FaMusic style={{ color: track.color }} aria-hidden="true" />}
        </div>
        <div className="track-controls__meta">
          <div className="track-controls__label" style={{ color: track.color }}>
            Audio
          </div>
          <div className="track-controls__name" title={track.name}>
            {track.name}
          </div>
        </div>
      </div>

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

      <div className="track-controls__volume">
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

      <button
        className="track-controls__delete"
        onClick={() => dispatch(removeTrack(id))}
        aria-label={`Remove ${track.name}`}
        title="Remove track"
      >
        <FaTrash aria-hidden="true" />
      </button>
    </div>
  );
};
