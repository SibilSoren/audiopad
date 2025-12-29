import { useRef, useEffect, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../store/store';
import { AudioEngine } from '../audio/AudioEngine';
import { setCurrentTime } from '../store/transportSlice';

export const WaveformCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  
  const tracks = useAppSelector(state => state.tracks.byId);
  const trackIds = useAppSelector(state => state.tracks.allIds);
  const { isPlaying, duration } = useAppSelector(state => state.transport);
  
  const requestRef = useRef<number>(0);
  
  const waveColors = ['#a855f7', '#ef4444', '#facc15', '#4ade80', '#3b82f6', '#f97316'];

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || trackIds.length === 0 || duration <= 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = canvas.width;
    
    const clickedTime = (clickX / width) * duration;
    const seekTime = Math.max(0, Math.min(clickedTime, duration));
    
    dispatch(setCurrentTime(seekTime));
  }, [dispatch, duration, trackIds.length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (trackIds.length === 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload tracks to see waveforms', width / 2, height / 2);
      return;
    }

    // Draw timeline ruler at top
    const rulerHeight = 24;
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, width, rulerHeight);
    
    // Time markers
    ctx.fillStyle = '#737373';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const secondsPerMarker = Math.max(1, Math.ceil(duration / 20));
    for (let t = 0; t <= duration; t += secondsPerMarker) {
      const x = (t / duration) * width;
      ctx.fillRect(x, rulerHeight - 8, 1, 8);
      
      const min = Math.floor(t / 60);
      const sec = Math.floor(t % 60);
      ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, x, rulerHeight - 12);
    }

    // Draw each track's waveform
    const trackAreaHeight = height - rulerHeight;
    const trackHeight = trackAreaHeight / trackIds.length;
    
    trackIds.forEach((id, index) => {
      const track = tracks[id];
      if (!track) return;
      
      const y = rulerHeight + (index * trackHeight);
      const centerY = y + trackHeight / 2;
      const color = waveColors[index % waveColors.length];
      
      // Track separator line
      if (index > 0) {
        ctx.fillStyle = '#404040';
        ctx.fillRect(0, y, width, 1);
      }

      // Draw waveform
      if (track.peaks && track.peaks.length > 0) {
        ctx.fillStyle = color;
        const barWidth = Math.max(1, width / track.peaks.length);
        
        for (let i = 0; i < track.peaks.length; i++) {
          const peak = track.peaks[i];
          const barHeight = Math.max(2, peak * (trackHeight * 0.7));
          ctx.fillRect(i * barWidth, centerY - barHeight / 2, barWidth - 0.5, barHeight);
        }
        
        // Track label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const labelWidth = ctx.measureText(track.name).width + 16;
        ctx.fillRect(8, y + 8, labelWidth, 20);
        
        ctx.fillStyle = color;
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(track.name.toUpperCase(), 16, y + 22);
      } else {
        ctx.fillStyle = '#525252';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Loading...', 16, centerY);
      }
    });

    // Draw playhead (spans all tracks)
    const engine = AudioEngine.getInstance();
    const currentTime = engine.currentTime;
    const playheadX = (currentTime / duration) * width;
    
    // Playhead line
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(playheadX - 1, 0, 2, height);
    
    // Playhead handle at top
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
    
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    }
  }, [tracks, trackIds, isPlaying, duration, waveColors]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        draw();
      }
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, draw]);

  return (
    <div ref={containerRef} className="timeline-canvas">
      <canvas 
        ref={canvasRef}
        style={{ display: 'block', cursor: 'pointer' }}
        onClick={handleCanvasClick}
      />
    </div>
  );
};
