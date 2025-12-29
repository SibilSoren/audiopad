import { useAppDispatch, useAppSelector } from '../store/store';
import { toggleMute, toggleSolo, setVolume, removeTrack } from '../store/tracksSlice';
import { FaTrash, FaMusic, FaSpinner } from 'react-icons/fa';
import { useRef, useEffect, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

interface TrackRowProps {
  id: string;
}

export const TrackRow = ({ id }: TrackRowProps) => {
  const dispatch = useAppDispatch();
  const track = useAppSelector(state => state.tracks.byId[id]);
  const isLoading = useAppSelector(state => state.tracks.loading[id]);
  const { isPlaying, duration } = useAppSelector(state => state.transport);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const waveColors = ['#a855f7', '#ef4444', '#facc15', '#4ade80'];
  const colorIndex = id.charCodeAt(0) % waveColors.length;
  const waveColor = waveColors[colorIndex];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    if (track.peaks && track.peaks.length > 0) {
      ctx.fillStyle = waveColor;
      const centerY = height / 2;
      const barWidth = Math.max(1, width / track.peaks.length);
      
      for (let i = 0; i < track.peaks.length; i++) {
        const peak = track.peaks[i];
        const barHeight = Math.max(2, peak * (height * 0.8));
        ctx.fillRect(i * barWidth, centerY - barHeight / 2, barWidth - 0.5, barHeight);
      }
    }

    // Playhead
    const engine = AudioEngine.getInstance();
    const currentTime = engine.currentTime;
    const playheadX = (currentTime / duration) * width;
    
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(playheadX - 1, 0, 2, height);
    
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    }
  }, [track, isPlaying, duration, waveColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, draw]);

  if (!track) return null;

  return (
    <div className="track-row">
      <div className="track-row__info">
        <div 
          className="track-row__art"
          style={track.albumArt ? { backgroundImage: `url(${track.albumArt})`, backgroundSize: 'cover' } : {}}
        >
          {isLoading ? (
            <FaSpinner className="spin" style={{ color: '#737373' }} />
          ) : !track.albumArt ? (
            <FaMusic style={{ color: '#737373' }} />
          ) : null}
        </div>
        <div className="track-row__meta">
          <div className="track-row__label">Audio</div>
          <div className="track-row__name">{track.name}</div>
        </div>
      </div>
      
      <div className="track-row__controls">
        <button 
          className={`track-row__mute ${track.muted ? 'active' : ''}`}
          onClick={() => dispatch(toggleMute(id))}
          title={track.muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
        <button 
          className={`track-row__solo ${track.solo ? 'active' : ''}`}
          onClick={() => dispatch(toggleSolo(id))}
          title={track.solo ? 'Unsolo' : 'Solo'}
        >
          S
        </button>
      </div>
      
      <div className="track-row__volume">
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01"
          value={track.volume}
          onChange={(e) => dispatch(setVolume({ id, volume: parseFloat(e.target.value) }))}
        />
      </div>
      
      <div className="track-row__waveform">
        <canvas 
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
      
      <div className="track-row__delete">
        <button 
          className="btn btn--icon btn--sm"
          onClick={() => dispatch(removeTrack(id))}
          title="Remove track"
        >
          <FaTrash />
        </button>
      </div>
    </div>
  );
};
