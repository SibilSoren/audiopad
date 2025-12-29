import { useAppDispatch, useAppSelector } from '../store/store';
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice';
import { FaTrash, FaMusic, FaSpinner } from 'react-icons/fa';

interface TrackControlsProps {
  id: string;
}

export const TrackControls = ({ id }: TrackControlsProps) => {
  const dispatch = useAppDispatch();
  const track = useAppSelector(state => state.tracks.byId[id]);
  const isLoading = useAppSelector(state => state.tracks.loading[id]);

  if (!track) return null;

  return (
    <div className="track-controls">
      <div className="track-controls__info">
        <div 
          className="track-controls__art"
          style={track.albumArt ? { backgroundImage: `url(${track.albumArt})`, backgroundSize: 'cover' } : {}}
        >
          {isLoading ? (
            <FaSpinner className="spin" style={{ color: '#737373' }} />
          ) : !track.albumArt ? (
            <FaMusic style={{ color: '#737373' }} />
          ) : null}
        </div>
        <div className="track-controls__meta">
          <div className="track-controls__label">Audio</div>
          <div className="track-controls__name">{track.name}</div>
        </div>
      </div>
      
      <div className="track-controls__buttons">
        <button 
          className={`track-controls__btn ${track.muted ? 'active' : ''}`}
          onClick={() => dispatch(toggleMute(id))}
        >
          M
        </button>
        <button 
          className={`track-controls__btn ${track.solo ? 'active' : ''}`}
          onClick={() => dispatch(toggleSolo(id))}
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
          onChange={(e) => dispatch(setVolume({ id, volume: parseFloat(e.target.value) }))}
        />
      </div>
      
      <button 
        className="track-controls__delete"
        onClick={() => dispatch(removeTrack(id))}
      >
        <FaTrash />
      </button>
    </div>
  );
};
