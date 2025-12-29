import { useAppDispatch, useAppSelector } from '../store/store';
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice';
import { FaVolumeUp, FaVolumeMute, FaHeadphones, FaTrash, FaMusic, FaSpinner } from 'react-icons/fa';

export const TrackList = () => {
  const dispatch = useAppDispatch();
  const tracks = useAppSelector(state => state.tracks.byId);
  const trackIds = useAppSelector(state => state.tracks.allIds);
  const loading = useAppSelector(state => state.tracks.loading);

  return (
    <div className="track-list">
      <div className="track-list__header">
        <span className="track-list__title">Tracks ({trackIds.length})</span>
      </div>
      
      {trackIds.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
          <FaMusic style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }} />
          <p>No tracks yet</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>Click "+ Add Track" to upload audio</p>
        </div>
      )}
      
      {trackIds.map((id) => {
        const track = tracks[id];
        if (!track) return null;
        const isLoading = loading[id];
        
        return (
          <div key={id} className="track-card">
            <div className="track-card__header">
              {/* Album Art or Placeholder */}
              <div 
                className="track-card__art"
                style={{ 
                  background: track.albumArt 
                    ? `url(${track.albumArt}) center/cover` 
                    : track.color || 'linear-gradient(135deg, #8b5cf6, #f472b6)',
                  overflow: 'hidden'
                }}
              >
                {isLoading ? (
                  <FaSpinner className="spin" style={{ color: '#fff' }} />
                ) : !track.albumArt ? (
                  <span style={{ fontSize: '16px' }}>🎵</span>
                ) : null}
              </div>
              <div className="track-card__info">
                <div className="track-card__name">{track.name}</div>
                <div className="track-card__duration">
                  {isLoading ? 'Loading...' : track.peaks ? `${track.peaks.length} samples` : 'Ready'}
                </div>
              </div>
              <button 
                className="btn btn--ghost btn--icon"
                onClick={() => dispatch(removeTrack(id))}
                title="Remove track"
                style={{ width: '24px', height: '24px', fontSize: '10px' }}
              >
                <FaTrash />
              </button>
            </div>
            
            <div className="track-card__controls">
              <button 
                className={`btn btn--icon ${track.muted ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => dispatch(toggleMute(id))}
                title={track.muted ? 'Unmute' : 'Mute'}
                style={{ width: '28px', height: '28px', fontSize: '12px' }}
              >
                {track.muted ? <FaVolumeMute /> : <FaVolumeUp />}
              </button>
              
              <button 
                className={`btn btn--icon ${track.solo ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => dispatch(toggleSolo(id))}
                title={track.solo ? 'Unsolo' : 'Solo'}
                style={{ width: '28px', height: '28px', fontSize: '12px' }}
              >
                <FaHeadphones />
              </button>
              
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={track.volume}
                onChange={(e) => dispatch(setVolume({ id, volume: parseFloat(e.target.value) }))}
                className="track-card__volume"
              />
              
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '30px' }}>
                {Math.round(track.volume * 100)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
